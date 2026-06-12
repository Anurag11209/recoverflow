import { NextResponse } from 'next/server';
import { UnauthorizedError, ValidationError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { assertWithinRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit/guard';
import { loginSchema } from '@/lib/auth/validation';
import { authenticate } from '@/lib/auth/service';
import { createSession } from '@/lib/auth/session';
import { setSessionCookie } from '@/lib/auth/cookies';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);
  assertWithinRateLimit('login', clientIp(request), RATE_LIMITS.auth);

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const user = await authenticate(parsed.data);
  if (!user) {
    throw new UnauthorizedError('Invalid email or password', { code: 'INVALID_CREDENTIALS' });
  }

  const meta = {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  };
  const { token, session } = await createSession(user.id, meta);
  await setSessionCookie(token, session.expiresAt);

  return NextResponse.json({ ok: true });
});
