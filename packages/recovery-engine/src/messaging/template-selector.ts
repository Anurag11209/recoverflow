import type { FailureCategory } from '../recovery/classifier';
import type { MessageTemplate } from './message-types';

/**
 * Map a failure category to its WhatsApp template (Phase 6 rules). Exhaustive
 * switch: adding a new FailureCategory without a mapping is a compile error,
 * not a silent default. PAYMENT_RECOVERED exists as a template but is not
 * selected by any failure category — it belongs to a future
 * payment-recovered flow.
 */
export function selectTemplate(category: FailureCategory): MessageTemplate {
  switch (category) {
    case 'EXPIRED_CARD':
      return 'CARD_EXPIRED';
    case 'INSUFFICIENT_FUNDS':
    case 'BANK_DECLINED':
    case 'NETWORK_ERROR':
    case 'UNKNOWN':
      return 'PAYMENT_FAILED';
  }
}
