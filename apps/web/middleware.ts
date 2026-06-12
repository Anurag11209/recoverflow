import { NextResponse, type NextRequest } from 'next/server';
import { getEnv } from '@recoverflow/shared';
import { SESSION_COOKIE_NAME } from './lib/auth/session-core';
import { rotateSessionToken } from './lib/auth/session';

// Node.js runtime (stable in Next 15.5): middleware needs node:crypto + Prisma
// to validate and rotate the session token. The Edge runtime cannot do either.
export const config = {
  runtime: 'nodejs',
  matcher: ['/login', '/register', '/dashboard', '/dashboard/:path*'],
};

/**
 * Auth gate + session-token rotation.
 *
 * Gate: presence-only redirects (unauthenticated away from /dashboard,
 * authenticated away from /login|/register). The authoritative DB-backed check
 * still happens in the /dashboard server components.
 *
 * Rotation (audit F-1): on a protected route, if the session is within its
 * renewal window, mint a fresh token and set it on the response. The old token
 * stays valid for a short grace window (see rotateSessionToken) so THIS
 * request's render — which still reads the old cookie — does not see a logout.
 */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasSession = Boolean(token);
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname === '/login' || pathname === '/register';
  const isProtected = pathname === '/dashboard' || pathname.startsWith('/dashboard/');

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  // Rotate on protected routes when due. Never block the request on a rotation
  // failure — auth still holds via the existing (un-rotated) token.
  if (isProtected && token) {
    try {
      const rotated = await rotateSessionToken(token, {
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });
      if (rotated) {
        response.cookies.set(SESSION_COOKIE_NAME, rotated.token, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: getEnv().NODE_ENV === 'production',
          expires: rotated.expiresAt,
        });
      }
    } catch {
      // Rotation is best-effort; a failure must not break navigation.
    }
  }

  return response;
}
