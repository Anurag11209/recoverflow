/**
 * @recoverflow/recovery-engine
 *
 * Domain layer for failed-payment recovery. Phase 6 adds WhatsApp messaging:
 * after a RecoveryCase + first RecoveryAttempt are created, a recovery message
 * is selected, logged, and sent through an injected MessagingProvider. All
 * persistence and delivery is via ports defined here; apps/web injects
 * Prisma-backed adapters and a concrete provider (ADR 0001).
 */
export const RECOVERY_ENGINE_VERSION = '0.1.0';

export { processPaymentEvent } from './processor';
export type { ProcessDeps } from './processor';
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

// Messaging (Phase 6)
export { sendRecoveryMessage } from './messaging/message-service';
export type { SendRecoveryMessageInput, MessageOutcome } from './messaging/message-service';
export { selectTemplate } from './messaging/template-selector';
export { MESSAGE_TEMPLATES } from './messaging/message-types';
export type {
  MessageTemplate,
  MessageStatus,
  MessagingProvider,
  SendMessageInput,
  MessageStore,
  NewMessageLogInput,
  MessageLogRecord,
} from './messaging/message-types';

// Payment update tokens (Phase 7)
export {
  generateToken,
  hashToken,
  expiresAtFrom,
  createPaymentUpdateToken,
  validateRawToken,
  consumeToken,
} from './payment-update/token-service';
export type { TokenDeps } from './payment-update/token-service';
export type {
  RawToken,
  TokenHash,
  TokenRecord,
  Clock,
  CreateTokenInput,
  TokenStore,
  ConsumeResult,
  ValidateResult,
} from './payment-update/token-types';
