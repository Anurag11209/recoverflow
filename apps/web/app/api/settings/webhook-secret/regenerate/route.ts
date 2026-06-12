import { NextResponse } from 'next/server';
import { UnauthorizedError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { getCurrentSession } from '@/lib/auth/current';
import { regenerateWebhookSecret } from '@/lib/settings/service';

export const dynamic = 'force-dynamic';

/**
 * Regenerates the merchant's Razorpay webhook secret. The OLD secret stops
 * verifying immediately — the merchant must update Razorpay with the new value
 * or incoming webhooks will fail HMAC checks until they do (surfaced as a
 * warning in the settings UI).
 *
 * Returns { ok: true }; the settings page re-reads + decrypts the new secret on
 * refresh, so the plaintext is never carried in this response.
 */
export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);

  const current = await getCurrentSession();
  if (!current) {
    throw new UnauthorizedError('Authentication required');
  }

  await regenerateWebhookSecret(current.user.merchant.id, current.user.id);

  return NextResponse.json({ ok: true });
});
