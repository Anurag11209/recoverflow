/**
 * @recoverflow/recovery-engine
 *
 * Domain layer for failed-payment recovery. Phase 4 adds exactly-once event
 * processing: a state machine (processor) and event-type routing, both
 * depending only on ports defined here. apps/web injects Prisma-backed
 * adapters. Recovery orchestration arrives in Phase 5.
 */
export const RECOVERY_ENGINE_VERSION = '0.1.0';

export { processPaymentEvent } from './processor';
export { routeEvent, isHandledEventType, HANDLED_EVENT_TYPES } from './router';
export type { HandledEventType, EventHandler } from './router';
export { recordIdempotency, processingKey, isUniqueViolation } from './idempotency';
export type { Logger } from './logger';
export type {
  ProcessingStatus,
  ProcessingStore,
  LoadedEvent,
  ClaimResult,
  ProcessOutcome,
} from './types';
