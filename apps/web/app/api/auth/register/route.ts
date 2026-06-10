import { NextResponse } from 'next/server';
import { ValidationError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { registerSchema } from '@/lib/auth/validation';
import { registerMerchant } from '@/lib/auth/service';
import { setSessionCookie } from '@/lib/auth/cookies';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const meta = {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  };
  const { token, expiresAt } = await registerMerchant(parsed.data, meta);
  await setSessionCookie(token, expiresAt);

  return NextResponse.json({ ok: true }, { status: 201 });
});
