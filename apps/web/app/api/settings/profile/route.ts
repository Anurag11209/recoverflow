import { NextResponse } from 'next/server';
import { UnauthorizedError, ValidationError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { getCurrentSession } from '@/lib/auth/current';
import { updateProfileName } from '@/lib/settings/service';

export const dynamic = 'force-dynamic';

/**
 * Updates the merchant's display name. Session-gated, CSRF-guarded. The new
 * name is read from the JSON body; validation lives in the service. Returns the
 * saved name; the page refreshes to reflect it.
 */
export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);

  const current = await getCurrentSession();
  if (!current) {
    throw new UnauthorizedError('Authentication required');
  }

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (!body || typeof body.name !== 'string') {
    throw new ValidationError('A name is required');
  }

  const result = await updateProfileName(current.user.merchant.id, body.name, current.user.id);

  return NextResponse.json({ ok: true, name: result.name });
});
