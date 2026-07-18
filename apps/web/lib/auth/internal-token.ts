import { timingSafeEqual } from 'node:crypto';
import { getEnv, UnauthorizedError } from '@recoverflow/shared';

/**
 * Auth guard for the internal-only API routes (/api/internal/*).
 *
 * These endpoints are for trusted operators/automation, not merchants, so they
 * are gated by a single shared secret rather than a user session. This replaces
 * the old NODE_ENV-only guard ("404 in production"): the token is now REQUIRED in
 * every environment (the env schema makes INTERNAL_API_TOKEN mandatory), so there
 * is no environment where these routes are unauthenticated.
 *
 * The caller must send:  Authorization: Bearer <INTERNAL_API_TOKEN>
 *
 * The presented token is compared to the configured secret in constant time
 * (timingSafeEqual) so a wrong token cannot be recovered from response timing.
 * On any failure it throws UnauthorizedError (401), which withErrorHandling
 * renders as the standard JSON error envelope.
 */
export function assertInternalApiToken(request: Request): void {
  const provided = bearerToken(request.headers.get('authorization'));
  const expected = getEnv().INTERNAL_API_TOKEN;
  if (provided === null || !constantTimeEqual(provided, expected)) {
    throw new UnauthorizedError('Invalid or missing internal API token');
  }
}

/** Extract the token from an `Authorization: Bearer <token>` header, or null. */
function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Constant-time string equality. timingSafeEqual throws on a length mismatch, so
 * we guard first (the length difference is not itself the secret); equal-length
 * inputs are then compared with no early exit. Mirrors lib/razorpay/signature.ts.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
