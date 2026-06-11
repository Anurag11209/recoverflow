import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { assertWithinRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit/guard';
import { validatePaymentToken, submitPaymentUpdate } from '@/lib/payment-update/service';

export const dynamic = 'force-dynamic';

// PUBLIC, unauthenticated surface (the customer follows a link from WhatsApp).
// Every token failure returns 200 with a generic body — no status-code or
// message signal that could distinguish invalid / expired / used (D4). Abuse
// rate-limiting is deferred to the deploy phase (Phase 9) and tracked there.

type Ctx = { params: Promise<{ token: string }> };

export const GET = withErrorHandling(async (request: Request, ctx: Ctx) => {
  assertWithinRateLimit('payment-update', clientIp(request), RATE_LIMITS.paymentUpdate);
  const { token } = await ctx.params;
  const meta = await validatePaymentToken(token);
  return NextResponse.json(meta);
});

export const POST = withErrorHandling(async (request: Request, ctx: Ctx) => {
  assertWithinRateLimit('payment-update', clientIp(request), RATE_LIMITS.paymentUpdate);
  const { token } = await ctx.params;
  const result = await submitPaymentUpdate(token);
  return NextResponse.json(result);
});
