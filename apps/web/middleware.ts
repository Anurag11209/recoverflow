import { NextResponse, type NextRequest } from 'next/server';

// Mirrors SESSION_COOKIE_NAME in lib/auth/session-core.ts. Duplicated as a
// literal because middleware runs on the Edge runtime and cannot import that
// module (it pulls in node:crypto). Keep the two in sync.
const SESSION_COOKIE_NAME = 'rf_session';

/**
 * First-pass auth gate. The Edge runtime has no database access, so this only
 * checks whether a session cookie is present — never whether it's valid. The
 * /dashboard server component performs the authoritative DB-backed check.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/login', '/register', '/dashboard', '/dashboard/:path*'],
};
