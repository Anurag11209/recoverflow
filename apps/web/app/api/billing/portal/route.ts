import { NextResponse } from 'next/server';
import { UnauthorizedError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { assertWithinRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit/guard';
import { getCurrentSession } from '@/lib/auth/current';
import { createBillingPortalSession } from '@/lib/billing/portal';

export const dynamic = 'force-dynamic';

/**
 * Opens a Stripe Billing Portal session for the authenticated merchant so they
 * can manage their own subscription (change plan, cancel, update payment method).
 * Session-gated, CSRF-guarded, rate-limited. Returns the portal URL; the client
 * redirects the merchant to it. A merchant without a Stripe customer gets a
 * ValidationError from the service (no portal session is created).
 */
export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);
  assertWithinRateLimit('billing-portal', clientIp(request), RATE_LIMITS.auth);

  const current = await getCurrentSession();
  if (!current) {
    throw new UnauthorizedError('Authentication required');
  }

  const { url } = await createBillingPortalSession(current.user.merchant.id);
  return NextResponse.json({ url });
});
