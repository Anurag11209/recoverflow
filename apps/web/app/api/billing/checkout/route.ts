import { NextResponse } from 'next/server';
import { UnauthorizedError, ValidationError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { assertWithinRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit/guard';
import { getCurrentSession } from '@/lib/auth/current';
import { createCheckoutSession } from '@/lib/billing/checkout';
import type { PlanTier } from '@recoverflow/db';

export const dynamic = 'force-dynamic';

const SELF_SERVE_TIERS: PlanTier[] = ['STARTER', 'GROWTH', 'BUSINESS'];

export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);
  assertWithinRateLimit('billing-checkout', clientIp(request), RATE_LIMITS.auth);

  const current = await getCurrentSession();
  if (!current) {
    throw new UnauthorizedError('Authentication required');
  }

  const body = (await request.json().catch(() => null)) as { tier?: unknown } | null;
  const tier = body?.tier;
  if (typeof tier !== 'string' || !SELF_SERVE_TIERS.includes(tier as PlanTier)) {
    throw new ValidationError('A valid plan is required');
  }

  const { url } = await createCheckoutSession(current.user.merchant.id, tier as PlanTier);
  return NextResponse.json({ url });
});
