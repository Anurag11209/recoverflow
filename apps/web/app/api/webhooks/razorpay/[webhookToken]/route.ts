import { NextResponse } from 'next/server';
import { prisma } from '@recoverflow/db';
import { logger } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertWithinRateLimit, RATE_LIMITS } from '@/lib/rate-limit/guard';
import { processWebhook } from '@/lib/razorpay/service';

// Webhooks must never be cached or statically optimized, and must read the raw
// body (request.text()) — re-serializing via .json() would change the bytes and
// break HMAC verification.
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ webhookToken: string }> };

// Per-merchant webhook endpoint (Phase 8). The opaque webhookToken in the URL
// selects the merchant; that merchant's secret verifies the HMAC. No global
// secret. NO assertSameOrigin — webhooks are cross-origin; the HMAC is the auth.
export const POST = withErrorHandling(async (request: Request, ctx: Ctx) => {
  const { webhookToken } = await ctx.params;
  // Keyed by token, not IP: all Razorpay deliveries share Razorpay's IPs,
  // so per-IP would throttle every merchant together.
  assertWithinRateLimit('webhook', webhookToken, RATE_LIMITS.webhook);

  // Resolve the merchant BEFORE touching the (untrusted) body.
  const merchant = await prisma.merchant.findUnique({
    where: { webhookToken },
    select: { id: true, razorpayWebhookSecret: true, razorpayAccountId: true },
  });
  // Unknown token: generic 404, no signal about which tokens exist.
  if (!merchant) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  const eventId = request.headers.get('x-razorpay-event-id');

  const result = await processWebhook(prisma, {
    merchantId: merchant.id,
    rawBody,
    signature,
    secret: merchant.razorpayWebhookSecret,
    eventId,
    expectedAccountId: merchant.razorpayAccountId,
  });

  switch (result.status) {
    case 'processed': {
      // Trust-on-first-use: capture the Razorpay account_id the first time we
      // see a verified webhook for this merchant, so later deliveries are
      // cross-checked against it.
      if (merchant.razorpayAccountId === null) {
        try {
          const env = JSON.parse(rawBody) as { account_id?: unknown };
          if (typeof env.account_id === 'string' && env.account_id.length > 0) {
            await prisma.merchant.update({
              where: { id: merchant.id },
              data: { razorpayAccountId: env.account_id },
            });
          }
        } catch {
          // Body already verified+parsed by processWebhook; a parse failure
          // here is impossible in practice and must not fail the webhook.
        }
      }
      await prisma.eventProcessing.create({
        data: { paymentEventId: result.paymentEventId, status: 'PENDING' },
      });
      return NextResponse.json({ success: true });
    }
    case 'duplicate':
      return NextResponse.json({ success: true });
    case 'account_mismatch':
      logger.error(
        { event: 'webhook_account_mismatch', merchantId: merchant.id },
        'razorpay webhook account_id mismatch',
      );
      return NextResponse.json({ error: 'Account mismatch' }, { status: 403 });
    case 'invalid_signature':
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    case 'invalid_payload':
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    case 'expired':
      return NextResponse.json({ error: 'Event expired' }, { status: 400 });
  }
});
