import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { validatePaymentToken, submitPaymentUpdate } from '@/lib/payment-update/service';

export const dynamic = 'force-dynamic';

// PUBLIC, unauthenticated surface (the customer follows a link from WhatsApp).
// Every token failure returns 200 with a generic body — no status-code or
// message signal that could distinguish invalid / expired / used (D4). Abuse
// rate-limiting is deferred to the deploy phase (Phase 9) and tracked there.

type Ctx = { params: Promise<{ token: string }> };

export const GET = withErrorHandling(async (_request: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const meta = await validatePaymentToken(token);
  return NextResponse.json(meta);
});

export const POST = withErrorHandling(async (_request: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const result = await submitPaymentUpdate(token);
  return NextResponse.json(result);
});
