import { NextResponse } from 'next/server';
import { prisma } from '@recoverflow/db';
import { env } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { processWebhook } from '@/lib/razorpay/service';

// Webhooks must never be cached or statically optimized, and must read the
// raw body (request.text()) — re-serializing via .json() would change the
// bytes and break HMAC verification.
export const dynamic = 'force-dynamic';

// NOTE: intentionally NO assertSameOrigin here. Webhooks are cross-origin by
// definition; the HMAC signature is the authentication.
export const POST = withErrorHandling(async (request: Request) => {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  const eventId = request.headers.get('x-razorpay-event-id');

  const result = await processWebhook(prisma, {
    rawBody,
    signature,
    secret: env.RAZORPAY_WEBHOOK_SECRET,
    eventId,
  });

  switch (result.status) {
    case 'processed':
    case 'duplicate':
      // A replay is answered 200 (idempotently, no second row) so Razorpay
      // stops retrying.
      return NextResponse.json({ success: true });
    case 'invalid_signature':
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    case 'invalid_payload':
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    case 'expired':
      return NextResponse.json({ error: 'Event expired' }, { status: 400 });
  }
});
