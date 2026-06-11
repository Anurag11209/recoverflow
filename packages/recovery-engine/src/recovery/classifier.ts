/**
 * Failure classification for recovery. Pure and isolated (no DB, no handler
 * logic): given a Razorpay webhook payload, produce a stable failure category
 * plus the structured fields a RecoveryCase needs.
 *
 * Razorpay's payment.failed carries the failed payment under
 * payload.payment.entity, including error_code, error_reason,
 * error_description, error_source, error_step.
 */

export const FAILURE_CATEGORIES = [
  'EXPIRED_CARD',
  'INSUFFICIENT_FUNDS',
  'BANK_DECLINED',
  'NETWORK_ERROR',
  'UNKNOWN',
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export interface ClassifiedFailure {
  category: FailureCategory;
  providerPaymentId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  amount: number | null; // major units (Razorpay sends paise; we convert)
  currency: string | null;
  failureReason: string | null; // raw provider description, for audit
}

// Ordered rules: first match wins. Each tests the lowercased haystack built
// from the provider's error fields. Isolated here so handlers never hardcode.
const RULES: Array<{ category: FailureCategory; keywords: string[] }> = [
  { category: 'EXPIRED_CARD', keywords: ['expired', 'card_expired', 'card expired'] },
  {
    category: 'INSUFFICIENT_FUNDS',
    keywords: ['insufficient', 'insufficient_funds', 'not enough', 'low balance', 'exceeds'],
  },
  {
    category: 'NETWORK_ERROR',
    keywords: [
      'timeout',
      'timed out',
      'network',
      'gateway',
      'try again',
      'temporarily',
      'unavailable',
    ],
  },
  {
    category: 'BANK_DECLINED',
    keywords: [
      'declined',
      'do not honour',
      'do not honor',
      'issuer',
      'bank',
      'refused',
      'not permitted',
    ],
  },
];

interface PaymentEntity {
  id?: string;
  email?: string;
  contact?: string;
  amount?: number;
  currency?: string;
  error_code?: string;
  error_reason?: string;
  error_description?: string;
  error_source?: string;
  error_step?: string;
}

function extractEntity(payload: unknown): PaymentEntity {
  const p = payload as { payload?: { payment?: { entity?: PaymentEntity } } } | undefined;
  return p?.payload?.payment?.entity ?? {};
}

export function classifyFailure(payload: unknown): ClassifiedFailure {
  const e = extractEntity(payload);
  const haystack = [e.error_code, e.error_reason, e.error_description, e.error_source, e.error_step]
    .filter((s): s is string => typeof s === 'string')
    .join(' ')
    .toLowerCase();

  let category: FailureCategory = 'UNKNOWN';
  for (const rule of RULES) {
    if (rule.keywords.some((k) => haystack.includes(k))) {
      category = rule.category;
      break;
    }
  }

  // Razorpay amounts are in the smallest unit (paise for INR). Convert to major
  // units for the human-facing recovery record; null if absent.
  const amount = typeof e.amount === 'number' ? e.amount / 100 : null;

  return {
    category,
    providerPaymentId: e.id ?? null,
    customerEmail: e.email ?? null,
    customerPhone: e.contact ?? null,
    amount,
    currency: e.currency ?? null,
    failureReason: e.error_description ?? e.error_reason ?? null,
  };
}
