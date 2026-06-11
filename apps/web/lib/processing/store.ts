import { prisma } from '@recoverflow/db';
import type { ClaimResult, LoadedEvent, ProcessingStore } from '@recoverflow/recovery-engine';

/**
 * Prisma-backed implementation of the recovery-engine ProcessingStore port
 * (ADR 0001: the app provides adapters; the engine stays DB-free).
 *
 * The concurrency guarantee lives in claimEvent: a conditional updateMany
 * transitions PENDING|FAILED -> PROCESSING for exactly one row. Postgres
 * serializes the UPDATE, so two concurrent workers cannot both see count === 1
 * — no in-memory lock, safe across processes and servers.
 */
export function createProcessingStore(): ProcessingStore {
  return {
    async loadEvent(paymentEventId: string): Promise<LoadedEvent | null> {
      const e = await prisma.paymentEvent.findUnique({
        where: { id: paymentEventId },
        select: { id: true, provider: true, providerEventId: true, eventType: true, payload: true },
      });
      return e ?? null;
    },

    async claimEvent(paymentEventId: string): Promise<ClaimResult> {
      const { count } = await prisma.eventProcessing.updateMany({
        where: { paymentEventId, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'PROCESSING', attempts: { increment: 1 }, startedAt: new Date() },
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
      if (row.status === 'SUCCESS') return { claimed: false, reason: 'already_succeeded' };
      return { claimed: false, reason: 'already_processing' };
    },

    async markSuccess(paymentEventId: string): Promise<void> {
      await prisma.eventProcessing.update({
        where: { paymentEventId },
        data: { status: 'SUCCESS', completedAt: new Date(), lastError: null },
      });
    },

    async markFailed(paymentEventId: string, error: string): Promise<void> {
      await prisma.eventProcessing.update({
        where: { paymentEventId },
        data: { status: 'FAILED', completedAt: new Date(), lastError: error.slice(0, 1000) },
      });
    },

    async recordIdempotency(args: {
      provider: string;
      eventId: string;
      eventType: string;
      processingKey: string;
    }): Promise<void> {
      await prisma.idempotencyRecord.create({ data: args });
    },
  };
}
