import type { Logger } from './logger';
import type { LoadedEvent } from './types';
import type { RecoveryStore } from './recovery/types';
import type { MessageStore, MessagingProvider } from './messaging/message-types';
import { classifyFailure, extractPaymentIdentity } from './recovery/classifier';
import { createRecoveryCase } from './recovery/case-service';
import { scheduleFirstAttempt } from './recovery/attempt-service';
import { sendRecoveryMessage } from './messaging/message-service';
import { createPaymentUpdateToken } from './payment-update/token-service';
import type { Clock, TokenStore } from './payment-update/token-types';

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
  tokenStore: TokenStore;
  clock: Clock;
  /** apps/web supplies APP_BASE_URL-based builder; engine never reads env. */
  buildPaymentUpdateUrl: (rawToken: string) => string;
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
  const {
    logger,
    recoveryStore,
    messageStore,
    messagingProvider,
    messagingProviderName,
    tokenStore,
    clock,
    buildPaymentUpdateUrl,
  } = ctx;
  const classified = classifyFailure(event.payload);
  logger.info(
    { event: 'failure_classified', paymentEventId: event.id, failureCategory: classified.category },
    'failure classified',
  );

  const { case: recoveryCase } = await createRecoveryCase(recoveryStore, logger, {
    paymentEventId: event.id,
    merchantId: event.merchantId,
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

  // Generate the secure payment-update token ONLY for attempt #1 and build the
  // link. Later attempts (Phase 8 reminders) reuse the active token rather than
  // minting a new one, so a customer's first-message link never goes dead.
  let updateUrl: string | undefined;
  if (attempt.attemptNumber === 1) {
    const { raw } = await createPaymentUpdateToken(
      { store: tokenStore, clock, logger },
      // Phase 8: the case now carries merchantId, so the token is attributed too.
      { recoveryCaseId: recoveryCase.id, merchantId: recoveryCase.merchantId },
    );
    updateUrl = buildPaymentUpdateUrl(raw);
  }

  await sendRecoveryMessage(messageStore, messagingProvider, logger, {
    recoveryCaseId: recoveryCase.id,
    merchantId: event.merchantId,
    recoveryAttemptId: attempt.id,
    recipientPhone: classified.customerPhone,
    recipientEmail: classified.customerEmail,
    failureCategory: classified.category,
    amount: classified.amount,
    currency: classified.currency,
    providerName: messagingProviderName,
    updateUrl,
  });
}

/**
 * payment.captured: a successful payment. If it belongs to a customer with an
 * open recovery case (matched by merchant + email/phone), the customer paid on
 * their own — close the case RECOVERED, attributed ORGANIC. Only OPEN cases are
 * touched, so a case is recovered at most once: this never double-counts with a
 * link-based recovery (whichever path finds the case OPEN first wins; the other
 * finds no open case and no-ops).
 */
async function handlePaymentCaptured(event: LoadedEvent, ctx: HandlerContext): Promise<void> {
  const { logger, recoveryStore, clock } = ctx;
  const identity = extractPaymentIdentity(event.payload);

  if (!identity.customerEmail && !identity.customerPhone) {
    logger.info(
      {
        event: 'payment_captured_no_identity',
        paymentEventId: event.id,
        merchantId: event.merchantId,
      },
      'payment.captured: no customer identity to match; noop',
    );
    return;
  }

  const openCase = await recoveryStore.findOpenCaseByCustomer(
    event.merchantId,
    identity.customerEmail,
    identity.customerPhone,
  );
  if (!openCase) {
    logger.info(
      { event: 'no_matching_open_case', paymentEventId: event.id, merchantId: event.merchantId },
      'payment.captured: no matching open recovery case; noop',
    );
    return;
  }

  const recoveredAmount = identity.amount ?? 0;
  await recoveryStore.markRecovered(openCase.id, recoveredAmount, clock.now(), 'ORGANIC');
  logger.info(
    {
      event: 'organic_recovery',
      paymentEventId: event.id,
      recoveryCaseId: openCase.id,
      merchantId: event.merchantId,
      recoveredAmount,
    },
    'recovery case closed as RECOVERED (organic)',
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
