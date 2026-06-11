import { isUniqueViolation } from '../idempotency';
import type { Logger } from '../logger';
import type { NewCaseInput, RecoveryCaseRecord, RecoveryStatus, RecoveryStore } from './types';

export interface CreateCaseResult {
  case: RecoveryCaseRecord;
  created: boolean;
}

/**
 * Open a recovery case for a failed payment, idempotently.
 *
 * The DB enforces one case per paymentEventId (unique). If a duplicate event is
 * reprocessed, createCase throws P2002; we catch it and return the existing
 * case (created: false), so handlePaymentFailed is safely re-runnable and a
 * reprocessed event never opens a second case.
 */
export async function createRecoveryCase(
  store: RecoveryStore,
  logger: Logger,
  input: NewCaseInput,
): Promise<CreateCaseResult> {
  try {
    const created = await store.createCase(input);
    logger.info(
      {
        event: 'recovery_case_created',
        paymentEventId: input.paymentEventId,
        recoveryCaseId: created.id,
        failureCategory: input.failureCategory,
      },
      'recovery case created',
    );
    return { case: created, created: true };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = await store.findCaseByPaymentEventId(input.paymentEventId);
      if (existing) return { case: existing, created: false };
    }
    throw e;
  }
}

export async function updateCaseStatus(
  store: RecoveryStore,
  caseId: string,
  status: RecoveryStatus,
): Promise<void> {
  await store.updateCaseStatus(caseId, status);
}

export async function getCaseByPaymentEventId(
  store: RecoveryStore,
  paymentEventId: string,
): Promise<RecoveryCaseRecord | null> {
  return store.findCaseByPaymentEventId(paymentEventId);
}
