import { getEnv } from '@recoverflow/shared';
import { ForbiddenError } from '@recoverflow/shared';

/** True when `origin` matches the app's own origin (scheme + host + port). */
export function isTrustedOrigin(origin: string | null, allowedOrigin: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}

/**
 * CSRF guard for state-changing requests. With SameSite=Lax cookies, verifying
 * the Origin header is the standard defense: a cross-site form POST either
 * carries a foreign Origin or, for older browsers, none at all — both rejected.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!isTrustedOrigin(origin, getEnv().NEXT_PUBLIC_APP_URL)) {
    throw new ForbiddenError('Cross-origin request rejected', { code: 'CSRF_REJECTED' });
  }
}
