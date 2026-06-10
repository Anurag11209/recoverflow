import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { getCurrentSession } from '@/lib/auth/current';
import { invalidateSession } from '@/lib/auth/session';
import { clearSessionCookie } from '@/lib/auth/cookies';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);

  const current = await getCurrentSession();
  if (current) {
    await invalidateSession(current.session.id);
  }
  await clearSessionCookie();

  return NextResponse.json({ ok: true });
});
