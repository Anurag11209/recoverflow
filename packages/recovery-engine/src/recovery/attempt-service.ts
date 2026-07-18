import { isUniqueViolation } from '../idempotency';
import type { Logger } from '../logger';
import { FAILURE_CATEGORIES, type FailureCategory } from './classifier';
import type { DueAttempt, RecoveryAttemptRecord, RecoveryStore } from './types';
import type { MessageStore, MessagingProvider } from '../messaging/message-types';
import { sendRecoveryMessage } from '../messaging/message-service';
import type { Clock, TokenStore } from '../payment-update/token-types';
import { createPaymentUpdateToken } from '../payment-update/token-service';

/**
 * Scheduling offsets per attempt number (hours from case creation): the retry
 * ladder. #1 is created + messaged immediately by the payment.failed handler;
 * the worker drives #2 (+24h) and #3 (+72h) via runDueAttempt.
 */
export const ATTEMPT_SCHEDULE_HOURS: Record<1 | 2 | 3, number> = { 1: 0, 2: 24, 3: 72 };

/** Hard cap on ladder attempts. Never schedule a #4. */
export const MAX_ATTEMPTS = 3;

const HOUR_MS = 3600_000;

/** Subscription statuses that mean the sub is gone — halt the ladder on these. */
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'cancelled',
  'canceled',
  'halted',
  'completed',
  'expired',
]);

/**
 * A linked subscription is "still active" unless its status is a known terminal
 * value. null / unset / 'active' / anything unrecognized counts as active, so a
 * case with no meaningful subscription status is not halted.
 */
export function isSubscriptionActive(status: string | null): boolean {
  if (!status) return true;
  return !INACTIVE_SUBSCRIPTION_STATUSES.has(status.trim().toLowerCase());
}

/**
 * The next rung after `attemptNumber`, scheduled at the ladder offset measured
 * from case creation (matching scheduleFirstAttempt). Returns null once the cap
 * is reached (no #4).
 */
export function nextAttemptSchedule(
  attemptNumber: number,
  caseCreatedAt: Date,
): { attemptNumber: number; scheduledAt: Date } | null {
  const next = attemptNumber + 1;
  if (next > MAX_ATTEMPTS) return null;
  const hours = ATTEMPT_SCHEDULE_HOURS[next as 1 | 2 | 3];
  return { attemptNumber: next, scheduledAt: new Date(caseCreatedAt.getTime() + hours * HOUR_MS) };
}

export interface CreateAttemptResult {
  attempt: RecoveryAttemptRecord;
  created: boolean;
}

/**
 * Create the first recovery attempt (attemptNumber 1, scheduledAt = now).
 * Idempotent on the unique (recoveryCaseId, attemptNumber): a duplicate returns
 * the existing attempt (created: false). Persists schedule metadata only — no
 * retry execution, no WhatsApp.
 */
export async function scheduleFirstAttempt(
  store: RecoveryStore,
  logger: Logger,
  recoveryCaseId: string,
  now: Date = new Date(),
): Promise<CreateAttemptResult> {
  const attemptNumber = 1 as const;
  const scheduledAt = new Date(now.getTime() + ATTEMPT_SCHEDULE_HOURS[attemptNumber] * 3600_000);
  try {
    const attempt = await store.createAttempt({ recoveryCaseId, attemptNumber, scheduledAt });
    logger.info(
      {
        event: 'recovery_attempt_created',
        recoveryCaseId,
        attemptNumber,
        scheduledAt: scheduledAt.toISOString(),
      },
      'recovery attempt created',
    );
    return { attempt, created: true };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = await store.findAttempt(recoveryCaseId, attemptNumber);
      if (existing) return { attempt: existing, created: false };
    }
    throw e;
  }
}

/** Injected capabilities for executing a due attempt (a slice of HandlerContext). */
export interface RunDueAttemptDeps {
  recoveryStore: RecoveryStore;
  messageStore: MessageStore;
  messagingProvider: MessagingProvider;
  messagingProviderName: string;
  tokenStore: TokenStore;
  clock: Clock;
  buildPaymentUpdateUrl: (rawToken: string) => string;
  logger: Logger;
}

export type HaltReason = 'case_recovered' | 'case_closed' | 'subscription_inactive';

export type LadderOutcome =
  | { status: 'executed'; attemptNumber: number; scheduledNext: number | null; caseFailed: boolean }
  | { status: 'halted'; reason: HaltReason }
  | { status: 'skipped'; reason: string };

function coerceCategory(raw: string | null): FailureCategory {
  return raw !== null && (FAILURE_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as FailureCategory)
    : 'UNKNOWN';
}

/**
 * Execute one due retry attempt (the ladder step). Idempotent and safe to call
 * from concurrent workers: the message is at-most-once per attempt (the
 * MessageLog partial-unique on recoveryAttemptId), and the next rung is created
 * under the unique (caseId, attemptNumber).
 *
 *  - Halt (no send, no next rung) if the case is already RECOVERED or CLOSED
 *    ("canceled"), or a linked subscription is no longer active.
 *  - Otherwise send the recovery reminder for this attempt (attempt #1's message
 *    was already sent inline at case creation, so its send returns
 *    skipped_duplicate — no double-send; #2/#3 mint a fresh payment-update token
 *    and actually send), mark the attempt SUCCESS, then schedule the next rung.
 *  - After the final attempt (#{MAX_ATTEMPTS}) the case is marked FAILED.
 */
export async function runDueAttempt(
  deps: RunDueAttemptDeps,
  due: DueAttempt,
): Promise<LadderOutcome> {
  const {
    recoveryStore,
    messageStore,
    messagingProvider,
    messagingProviderName,
    tokenStore,
    clock,
    buildPaymentUpdateUrl,
    logger,
  } = deps;
  const now = clock.now();
  const { attempt, case: rc } = due;

  // Defensive cap: the scheduler never creates a #4, but never execute past it.
  if (attempt.attemptNumber > MAX_ATTEMPTS) {
    await recoveryStore.markAttemptExecuted(attempt.id, 'FAILED', now, 'exceeds max attempts');
    return { status: 'skipped', reason: 'exceeds_max_attempts' };
  }

  const haltReason: HaltReason | null =
    rc.status === 'RECOVERED'
      ? 'case_recovered'
      : rc.status === 'CLOSED'
        ? 'case_closed'
        : due.hasSubscription && !isSubscriptionActive(due.subscriptionStatus)
          ? 'subscription_inactive'
          : null;
  if (haltReason) {
    await recoveryStore.markAttemptExecuted(attempt.id, 'FAILED', now, `skipped: ${haltReason}`);
    logger.info(
      {
        event: 'ladder_halted',
        recoveryCaseId: rc.id,
        merchantId: rc.merchantId,
        attemptNumber: attempt.attemptNumber,
        reason: haltReason,
      },
      'retry ladder halted',
    );
    return { status: 'halted', reason: haltReason };
  }

  // Follow-up attempts mint a fresh payment-update link (the stored token is
  // hashed, so the original raw link can't be reused; supersede + mint).
  let updateUrl: string | undefined;
  if (attempt.attemptNumber > 1) {
    const { raw } = await createPaymentUpdateToken(
      { store: tokenStore, clock, logger },
      { recoveryCaseId: rc.id, merchantId: rc.merchantId },
    );
    updateUrl = buildPaymentUpdateUrl(raw);
  }

  const messageOutcome = await sendRecoveryMessage(messageStore, messagingProvider, logger, {
    recoveryCaseId: rc.id,
    merchantId: rc.merchantId,
    recoveryAttemptId: attempt.id,
    recipientPhone: rc.customerPhone,
    recipientEmail: rc.customerEmail,
    failureCategory: coerceCategory(rc.failureCategory),
    amount: rc.amount,
    currency: rc.currency,
    providerName: messagingProviderName,
    updateUrl,
  });

  await recoveryStore.markAttemptExecuted(attempt.id, 'SUCCESS', now);

  const next = nextAttemptSchedule(attempt.attemptNumber, rc.createdAt);
  let caseFailed = false;
  if (next) {
    try {
      await recoveryStore.createAttempt({
        recoveryCaseId: rc.id,
        attemptNumber: next.attemptNumber,
        scheduledAt: next.scheduledAt,
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // next rung already scheduled — idempotent
    }
  } else {
    await recoveryStore.updateCaseStatus(rc.id, 'FAILED'); // ladder exhausted
    caseFailed = true;
  }

  logger.info(
    {
      event: 'ladder_attempt_executed',
      recoveryCaseId: rc.id,
      merchantId: rc.merchantId,
      attemptNumber: attempt.attemptNumber,
      message: messageOutcome.status,
      scheduledNext: next?.attemptNumber ?? null,
      caseFailed,
    },
    'retry ladder attempt executed',
  );
  return {
    status: 'executed',
    attemptNumber: attempt.attemptNumber,
    scheduledNext: next?.attemptNumber ?? null,
    caseFailed,
  };
}
