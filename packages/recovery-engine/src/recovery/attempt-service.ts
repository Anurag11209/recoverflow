import { isUniqueViolation } from '../idempotency';
import type { Logger } from '../logger';
import type { RecoveryAttemptRecord, RecoveryStore } from './types';

/**
 * Scheduling offsets per attempt number (hours from case creation). Only #1 is
 * acted on in Phase 5 (immediate). #2 (+24h) and #3 (+72h) are defined here for
 * Phase 6+ but are NOT scheduled or executed in this phase.
 */
export const ATTEMPT_SCHEDULE_HOURS: Record<1 | 2 | 3, number> = { 1: 0, 2: 24, 3: 72 };

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
