/**
 * @recoverflow/recovery-engine
 *
 * Domain layer for failed-payment recovery. Phase 5 adds recovery-case and
 * attempt creation: payment.failed is classified and turned into a tracked
 * RecoveryCase + first RecoveryAttempt. All persistence is via ports defined
 * here; apps/web injects Prisma-backed adapters (ADR 0001).
 */
export const RECOVERY_ENGINE_VERSION = '0.1.0';

export { processPaymentEvent } from './processor';
export { routeEvent, isHandledEventType, HANDLED_EVENT_TYPES } from './router';
export type { HandledEventType, EventHandler, HandlerContext } from './router';
export { recordIdempotency, processingKey, isUniqueViolation } from './idempotency';
export type { Logger } from './logger';
export type {
  ProcessingStatus,
  ProcessingStore,
  LoadedEvent,
  ClaimResult,
  ProcessOutcome,
} from './types';

// Recovery (Phase 5)
export { classifyFailure, FAILURE_CATEGORIES } from './recovery/classifier';
export type { FailureCategory, ClassifiedFailure } from './recovery/classifier';
export {
  createRecoveryCase,
  updateCaseStatus,
  getCaseByPaymentEventId,
} from './recovery/case-service';
export { scheduleFirstAttempt, ATTEMPT_SCHEDULE_HOURS } from './recovery/attempt-service';
export type {
  RecoveryStore,
  RecoveryStatus,
  AttemptStatus,
  NewCaseInput,
  NewAttemptInput,
  RecoveryCaseRecord,
  RecoveryAttemptRecord,
} from './recovery/types';
