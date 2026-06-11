import type { TokenRecord, TokenValidation } from './token-types';

/**
 * Pure token validation (no I/O). A token is valid iff it exists, is unused,
 * not superseded, and not expired (decision D2). Reason order is intentional:
 * used/superseded are reported before expired, so a token that is both used
 * and expired is reported as 'used' (the security-relevant fact).
 *
 * The reason is for internal structured logging only; per D4 the public
 * surface collapses every failure to one generic message.
 */
export function validateToken(record: TokenRecord | null, now: Date): TokenValidation {
  if (!record) {
    return { valid: false, reason: 'not_found' };
  }
  if (record.usedAt !== null) {
    return { valid: false, reason: 'used' };
  }
  if (record.supersededAt !== null) {
    return { valid: false, reason: 'superseded' };
  }
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, record };
}
