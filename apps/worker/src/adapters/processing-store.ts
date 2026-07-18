import { prisma, type Prisma } from '@recoverflow/db';
import { createProcessingStore } from '@recoverflow/adapters';
import type { ClaimResult, ProcessingStore } from '@recoverflow/recovery-engine';
import { decideOnFailure, type RetryPolicy } from '../retry-policy';

/** A row that is eligible to be claimed, with its owning merchant (for logging). */
export interface ClaimableRow {
  paymentEventId: string;
  merchantId: string;
}

/**
 * The worker's ProcessingStore: the recovery-engine port plus `listClaimable`.
 * It differs from the shared (web) store in three ways, all of which the engine
 * drives at the right moments:
 *   - claimEvent only claims rows that are due (PENDING, or FAILED past their
 *     backoff), so retries respect exponential backoff.
 *   - markSuccess writes the terminal DONE state.
 *   - markFailed applies the retry policy: FAILED (+ nextAttemptAt) while
 *     attempts remain, or terminal DEAD once maxAttempts is reached.
 * loadEvent and recordIdempotency are reused verbatim from the shared store.
 */
export interface WorkerProcessingStore extends ProcessingStore {
  listClaimable(limit: number): Promise<ClaimableRow[]>;
}

/** Rows eligible for a (re)attempt right now: PENDING, or FAILED past backoff. */
function claimableWhere(now: Date): Prisma.EventProcessingWhereInput {
  return {
    OR: [
      { status: 'PENDING' },
      { status: 'FAILED', nextAttemptAt: null },
      { status: 'FAILED', nextAttemptAt: { lte: now } },
    ],
  };
}

export function createWorkerProcessingStore(policy: RetryPolicy): WorkerProcessingStore {
  // Reuse loadEvent + recordIdempotency from the shared adapter; override the
  // state transitions that are worker-specific.
  const base = createProcessingStore();

  return {
    ...base,

    async listClaimable(limit: number): Promise<ClaimableRow[]> {
      const rows = await prisma.eventProcessing.findMany({
        where: claimableWhere(new Date()),
        select: { paymentEventId: true, paymentEvent: { select: { merchantId: true } } },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      return rows.map((r) => ({
        paymentEventId: r.paymentEventId,
        merchantId: r.paymentEvent.merchantId,
      }));
    },

    async claimEvent(paymentEventId: string): Promise<ClaimResult> {
      const now = new Date();
      // Atomic conditional claim: only one worker's updateMany changes the row.
      const { count } = await prisma.eventProcessing.updateMany({
        where: { paymentEventId, ...claimableWhere(now) },
        data: { status: 'PROCESSING', attempts: { increment: 1 }, startedAt: now },
      });
      if (count === 1) {
        const row = await prisma.eventProcessing.findUnique({
          where: { paymentEventId },
          select: { attempts: true },
        });
        return { claimed: true, attempts: row?.attempts ?? 0 };
      }
      const row = await prisma.eventProcessing.findUnique({
        where: { paymentEventId },
        select: { status: true },
      });
      if (!row) return { claimed: false, reason: 'not_found' };
      if (row.status === 'DONE' || row.status === 'SUCCESS' || row.status === 'DEAD') {
        return { claimed: false, reason: 'already_succeeded' };
      }
      return { claimed: false, reason: 'already_processing' };
    },

    async markSuccess(paymentEventId: string): Promise<void> {
      await prisma.eventProcessing.update({
        where: { paymentEventId },
        data: { status: 'DONE', completedAt: new Date(), lastError: null, nextAttemptAt: null },
      });
    },

    async markFailed(paymentEventId: string, error: string): Promise<void> {
      const now = new Date();
      const row = await prisma.eventProcessing.findUnique({
        where: { paymentEventId },
        select: { attempts: true },
      });
      const attempts = row?.attempts ?? 0;
      const decision = decideOnFailure(attempts, policy, now);
      if (decision.status === 'DEAD') {
        await prisma.eventProcessing.update({
          where: { paymentEventId },
          data: {
            status: 'DEAD',
            completedAt: now,
            lastError: error.slice(0, 1000),
            nextAttemptAt: null,
          },
        });
        return;
      }
      await prisma.eventProcessing.update({
        where: { paymentEventId },
        data: {
          status: 'FAILED',
          lastError: error.slice(0, 1000),
          nextAttemptAt: decision.nextAttemptAt,
        },
      });
    },
  };
}
