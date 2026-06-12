import { NextResponse } from 'next/server';
import { logger } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertWithinRateLimit, RATE_LIMITS } from '@/lib/rate-limit/guard';
import { constructStripeEvent } from '@/lib/billing/stripe';
import { applyStripeEvent } from '@/lib/billing/webhook';

// Webhooks must never be cached and must read the raw body (request.text());
// re-serializing via .json() changes the bytes and breaks signature verification.
export const dynamic = 'force-dynamic';

// Stripe billing webhook (RecoverFlow's own subscriptions). NO assertSameOrigin —
// webhooks are cross-origin; the Stripe signature is the auth.
export const POST = withErrorHandling(async (request: Request) => {
  // All Stripe deliveries share Stripe's IPs, so key the limiter by source name
  // rather than IP (per-IP would throttle every event together).
  assertWithinRateLimit('webhook', 'stripe', RATE_LIMITS.webhook);

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (err) {
    // Bad/expired signature → 400 so Stripe retries with a fresh timestamp.
    logger.warn(
      { event: 'stripe_webhook_invalid_signature' },
      err instanceof Error ? err.message : 'Stripe signature verification failed',
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  await applyStripeEvent(event);
  return NextResponse.json({ received: true });
});
