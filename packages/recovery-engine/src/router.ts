import type { Logger } from './logger';
import type { LoadedEvent } from './types';
import type { RecoveryStore } from './recovery/types';
import type { MessageStore, MessagingProvider } from './messaging/message-types';
import { classifyFailure } from './recovery/classifier';
import { createRecoveryCase } from './recovery/case-service';
import { scheduleFirstAttempt } from './recovery/attempt-service';
import { sendRecoveryMessage } from './messaging/message-service';

export const HANDLED_EVENT_TYPES = [
  'payment.failed',
  'payment.captured',
  'subscription.charged',
  'subscription.cancelled',
] as const;

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];

/** Capabilities injected into handlers by the processor (ADR 0001). */
export interface HandlerContext {
  logger: Logger;
  recoveryStore: RecoveryStore;
  messageStore: MessageStore;
  messagingProvider: MessagingProvider;
  messagingProviderName: string;
}

export type EventHandler = (event: LoadedEvent, ctx: HandlerContext) => Promise<void>;

/**
 * payment.failed (Phase 6): classify the failure, open a RecoveryCase, schedule
 * the first RecoveryAttempt, then send the recovery message for that attempt.
 * All steps are idempotent and run inside the processor's exactly-once claim,
 * so duplicate deliveries never double-create or double-send. A message failure
 * is contained inside sendRecoveryMessage (logged + stored FAILED) and never
 * breaks event processing.
 */
async function handlePaymentFailed(event: LoadedEvent, ctx: HandlerContext): Promise<void> {
  const { logger, recoveryStore, messageStore, messagingProvider, messagingProviderName } = ctx;
  const classified = classifyFailure(event.payload);
  logger.info(
    { event: 'failure_classified', paymentEventId: event.id, failureCategory: classified.category },
    'failure classified',
  );

  const { case: recoveryCase } = await createRecoveryCase(recoveryStore, logger, {
    paymentEventId: event.id,
    provider: event.provider,
    providerPaymentId: classified.providerPaymentId,
    customerEmail: classified.customerEmail,
    customerPhone: classified.customerPhone,
    amount: classified.amount,
    currency: classified.currency,
    failureReason: classified.failureReason,
    failureCategory: classified.category,
  });

  const { attempt } = await scheduleFirstAttempt(recoveryStore, logger, recoveryCase.id);

  await sendRecoveryMessage(messageStore, messagingProvider, logger, {
    recoveryCaseId: recoveryCase.id,
    recoveryAttemptId: attempt.id,
    recipientPhone: classified.customerPhone,
    failureCategory: classified.category,
    amount: classified.amount,
    currency: classified.currency,
    providerName: messagingProviderName,
  });
}

// Other handlers remain log-only.
async function handlePaymentCaptured(event: LoadedEvent, ctx: HandlerContext): Promise<void> {
  ctx.logger.info(
    { paymentEventId: event.id, eventType: event.eventType },
    'handle payment.captured (noop)',
  );
}
async function handleSubscriptionCharged(event: LoadedEvent, ctx: HandlerContext): Promise<void> {
  ctx.logger.info(
    { paymentEventId: event.id, eventType: event.eventType },
    'handle subscription.charged (noop)',
  );
}
async function handleSubscriptionCancelled(event: LoadedEvent, ctx: HandlerContext): Promise<void> {
  ctx.logger.info(
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
  return async (event, ctx) => {
    ctx.logger.info(
      { paymentEventId: event.id, eventType: event.eventType },
      'no handler for event type (noop)',
    );
  };
}
