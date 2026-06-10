/**
 * Minimal typings for the Razorpay webhook envelope. We intentionally model
 * only the fields RecoverFlow reads; the full body is persisted verbatim in
 * PaymentEvent.payload, so we never need exhaustive types here.
 *
 * Reference: every Razorpay webhook has a top-level `event` (e.g.
 * "payment.failed") and `created_at` (epoch SECONDS). Entity data lives under
 * `payload.<entity>.entity`.
 */

/** Event types RecoverFlow recognizes. Anything else is stored as UNKNOWN. */
export const KNOWN_EVENT_TYPES = [
  'payment.failed',
  'payment.captured',
  'subscription.charged',
  'subscription.cancelled',
] as const;

export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];
export type ClassifiedEventType = KnownEventType | 'UNKNOWN';

export function classifyEventType(event: string | undefined): ClassifiedEventType {
  return (KNOWN_EVENT_TYPES as readonly string[]).includes(event ?? '')
    ? (event as KnownEventType)
    : 'UNKNOWN';
}

/** The envelope we parse off the verified body. */
export interface RazorpayWebhookEnvelope {
  event?: string;
  created_at?: number; // epoch seconds
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}
