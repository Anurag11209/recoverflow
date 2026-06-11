import type { Logger } from './logger';
import type { LoadedEvent } from './types';

export const HANDLED_EVENT_TYPES = [
  'payment.failed',
  'payment.captured',
  'subscription.charged',
  'subscription.cancelled',
] as const;

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];
export type EventHandler = (event: LoadedEvent, logger: Logger) => Promise<void>;

// Phase 4: handlers ONLY log. No RecoveryCase creation — that is Phase 5.
async function handlePaymentFailed(event: LoadedEvent, logger: Logger): Promise<void> {
  logger.info(
    { paymentEventId: event.id, eventType: event.eventType },
    'handle payment.failed (noop)',
  );
}
async function handlePaymentCaptured(event: LoadedEvent, logger: Logger): Promise<void> {
  logger.info(
    { paymentEventId: event.id, eventType: event.eventType },
    'handle payment.captured (noop)',
  );
}
async function handleSubscriptionCharged(event: LoadedEvent, logger: Logger): Promise<void> {
  logger.info(
    { paymentEventId: event.id, eventType: event.eventType },
    'handle subscription.charged (noop)',
  );
}
async function handleSubscriptionCancelled(event: LoadedEvent, logger: Logger): Promise<void> {
  logger.info(
    { paymentEventId: event.id, eventType: event.eventType },
    'handle subscription.cancelled (noop)',
  );
}

const HANDLERS: Record<HandledEventType, EventHandler> = {
  'payment.failed': handlePaymentFailed,
  'payment.captured': handlePaymentCaptured,
  'subscription.charged': handleSubscriptionCharged,
  'subscription.cancelled': handleSubscriptionCancelled,
};

export function isHandledEventType(t: string): t is HandledEventType {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(t);
}

/** Resolve a handler for an event type; unknown types get a logging no-op. */
export function routeEvent(eventType: string): EventHandler {
  if (isHandledEventType(eventType)) return HANDLERS[eventType];
  return async (event, logger) => {
    logger.info(
      { paymentEventId: event.id, eventType: event.eventType },
      'no handler for event type (noop)',
    );
  };
}
