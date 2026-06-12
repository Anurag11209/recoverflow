import { TooManyRequestsError, logger } from '@recoverflow/shared';
import { FixedWindowRateLimiter, type RateLimitRule } from './limiter';

// One process-wide limiter shared by all routes.
const limiter = new FixedWindowRateLimiter();

// Named rules. Auth endpoints are tight (credential stuffing / abuse); the
// public payment-update endpoint is moderate; webhooks are generous because a
// single busy merchant can legitimately burst, and are keyed per-merchant
// (not per-IP — all Razorpay deliveries share Razorpay's IPs).
export const RATE_LIMITS = {
  auth: { limit: 10, windowMs: 60_000 }, // 10/min per IP (login, register)
  paymentUpdate: { limit: 20, windowMs: 60_000 }, // 20/min per IP
  webhook: { limit: 120, windowMs: 60_000 }, // 120/min per merchant token
} as const satisfies Record<string, RateLimitRule>;

/**
 * Client IP from proxy headers. Railway/most proxies set x-forwarded-for; take
 * the first hop. Falls back to a constant so a missing header degrades to a
 * shared bucket rather than throwing.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Throws TooManyRequestsError when `key` exceeds `rule`. Logs the event
 * (structured, no PII beyond the key) so abuse is observable. The client sees
 * only a generic 429 — no limit/quota detail leaks.
 */
export function assertWithinRateLimit(scope: string, key: string, rule: RateLimitRule): void {
  const result = limiter.check(`${scope}:${key}`, rule);
  if (!result.allowed) {
    logger.warn(
      { event: 'rate_limit_exceeded', scope, key, resetAt: result.resetAt },
      'rate limit exceeded',
    );
    throw new TooManyRequestsError('Too many requests');
  }
}

export { limiter as _limiterForTests };
