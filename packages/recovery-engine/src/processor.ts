import type { Logger } from './logger';
import { processingKey, recordIdempotency } from './idempotency';
import { routeEvent } from './router';
import type { ProcessOutcome, ProcessingStore } from './types';
import type { RecoveryStore } from './recovery/types';
import type { MessageStore, MessagingProvider } from './messaging/message-types';
import type { Clock, TokenStore } from './payment-update/token-types';

/**
 * Injected dependencies for processing one event (ADR 0001). Bundled into one
 * object so new capabilities (Phase 7+) extend this type rather than shifting
 * positional arguments at every call site.
 */
export interface ProcessDeps {
  processingStore: ProcessingStore;
  recoveryStore: RecoveryStore;
  messageStore: MessageStore;
  messagingProvider: MessagingProvider;
  messagingProviderName: string;
  tokenStore: TokenStore;
  clock: Clock;
  buildPaymentUpdateUrl: (rawToken: string) => string;
  logger: Logger;
}

/**
 * Process a single PaymentEvent exactly once.
 *
 * Concurrency: the claim (store.claimEvent) is an atomic conditional update
 * (PENDING|FAILED -> PROCESSING for this id). Only the worker whose update
 * changes a row proceeds; others SKIP. The handler runs inside the claim with
 * an injected context. On success the permanent idempotency ledger entry is
 * written, then status is marked SUCCESS. On handler error the status is marked
 * FAILED (retryable) and the error is captured as state rather than thrown.
 */
export async function processPaymentEvent(
  deps: ProcessDeps,
  paymentEventId: string,
): Promise<ProcessOutcome> {
  const {
    processingStore: store,
    recoveryStore,
    messageStore,
    messagingProvider,
    messagingProviderName,
    tokenStore,
    clock,
    buildPaymentUpdateUrl,
    logger,
  } = deps;
  const startedAt = Date.now();

  const event = await store.loadEvent(paymentEventId);
  if (!event) {
    logger.error({ paymentEventId, status: 'SKIPPED' }, 'event not found');
    return { status: 'SKIPPED', reason: 'not_found' };
  }

  const claim = await store.claimEvent(paymentEventId);
  if (!claim.claimed) {
    logger.info(
      { paymentEventId, eventType: event.eventType, status: 'SKIPPED', reason: claim.reason },
      'event not claimed; skipping',
    );
    return { status: 'SKIPPED', reason: claim.reason };
  }

  const handler = routeEvent(event.eventType);
  try {
    await handler(event, {
      logger,
      recoveryStore,
      messageStore,
      messagingProvider,
      messagingProviderName,
      tokenStore,
      clock,
      buildPaymentUpdateUrl,
    });
    await recordIdempotency(store, {
      provider: event.provider,
      eventId: event.providerEventId,
      eventType: event.eventType,
      processingKey: processingKey(event.provider, event.providerEventId),
    });
    await store.markSuccess(paymentEventId);
    logger.info(
      {
        paymentEventId,
        eventType: event.eventType,
        status: 'SUCCESS',
        durationMs: Date.now() - startedAt,
      },
      'event processed',
    );
    return { status: 'SUCCESS', eventType: event.eventType };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await store.markFailed(paymentEventId, message);
    logger.error(
      {
        paymentEventId,
        eventType: event.eventType,
        status: 'FAILED',
        durationMs: Date.now() - startedAt,
        err: message,
      },
      'event processing failed',
    );
    return { status: 'FAILED', eventType: event.eventType, error: message };
  }
}
