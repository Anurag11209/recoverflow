import { createHash } from 'node:crypto';
import { verifySignature } from './signature';
import { classifyEventType, type ClassifiedEventType } from './types';

export const RAZORPAY_PROVIDER = 'razorpay';
export const DEFAULT_MAX_AGE_SECONDS = 300;

// P2002 = Prisma unique-constraint violation. Matched structurally so the
// service stays decoupled from the Prisma error class (and easy to fake in
// unit tests).
function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

export type ProcessResult =
  | { status: 'invalid_signature' }
  | { status: 'invalid_payload' }
  | { status: 'expired' }
  | { status: 'duplicate'; eventType: ClassifiedEventType }
  | { status: 'processed'; eventType: ClassifiedEventType; paymentEventId: string };

export interface ProcessWebhookArgs {
  rawBody: string;
  signature: string | null | undefined;
  secret: string;
  eventId?: string | null; // x-razorpay-event-id; falls back to sha256(rawBody)
  now?: Date; // injectable clock for tests
  maxAgeSeconds?: number;
}

// The slice of PrismaClient the service needs. Declaring it as an interface
// (rather than importing PrismaClient) lets unit tests inject an in-memory fake
// and keeps this module free of a hard DB dependency.
export interface WebhookStore {
  $transaction<T>(fn: (tx: WebhookTx) => Promise<T>): Promise<T>;
}
export interface WebhookTx {
  webhookReceipt: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  paymentEvent: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
}

/**
 * Process one Razorpay webhook delivery end to end:
 *   verify signature -> parse -> freshness -> persist + dedup.
 * Returns a tagged result the route maps to an HTTP status. Never throws for
 * the expected rejection paths; only a genuine DB fault propagates.
 */
export async function processWebhook(
  store: WebhookStore,
  args: ProcessWebhookArgs,
): Promise<ProcessResult> {
  const { rawBody, signature, secret } = args;
  const now = args.now ?? new Date();
  const maxAgeSeconds = args.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;

  // 1. Signature first — untrusted bytes are never parsed or stored.
  if (!verifySignature(rawBody, signature, secret)) {
    return { status: 'invalid_signature' };
  }

  // 2. Parse the (now trusted) envelope.
  let envelope: { event?: string; created_at?: number };
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return { status: 'invalid_payload' };
  }

  // 3. Freshness. created_at is epoch SECONDS and HMAC-protected once the
  //    signature passes. Missing/non-numeric => treat as expired (fail safe).
  const createdAt = envelope.created_at;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) {
    return { status: 'expired' };
  }
  const ageSeconds = Math.floor(now.getTime() / 1000) - createdAt;
  if (ageSeconds > maxAgeSeconds) {
    return { status: 'expired' };
  }
  const eventTime = new Date(createdAt * 1000);

  const eventType = classifyEventType(envelope.event);
  const eventId =
    args.eventId && args.eventId.length > 0
      ? args.eventId
      : createHash('sha256').update(rawBody, 'utf8').digest('hex');

  // 4. Persist + dedup in one transaction. The receipt's unique
  //    (provider, eventId) is the replay guard: a redelivery throws P2002,
  //    the transaction rolls back, and no duplicate PaymentEvent is written.
  try {
    const paymentEventId = await store.$transaction(async (tx) => {
      await tx.webhookReceipt.create({
        data: { provider: RAZORPAY_PROVIDER, eventId, eventType, eventTime },
      });
      const pe = await tx.paymentEvent.create({
        data: {
          provider: RAZORPAY_PROVIDER,
          providerEventId: eventId,
          eventType,
          payload: JSON.parse(rawBody),
          signatureVerified: true,
          eventTime,
        },
      });
      return pe.id;
    });
    return { status: 'processed', eventType, paymentEventId };
  } catch (e) {
    if (isUniqueViolation(e)) return { status: 'duplicate', eventType };
    throw e;
  }
}
