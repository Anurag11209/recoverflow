import { NextResponse } from 'next/server';
import { prisma } from '@recoverflow/db';
import { processPaymentEvent } from '@recoverflow/recovery-engine';
import { logger, getEnv } from '@recoverflow/shared';
import { ValidationError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertWithinPlanLimit, FAILED_PAYMENT_EVENT_TYPE } from '@/lib/billing/plan-limits';
import { createProcessingStore } from '@/lib/processing/store';
import { createRecoveryStore } from '@/lib/recovery/store';
import { createMessageStore } from '@/lib/messaging/store';
import { createConsoleMessagingProvider } from '@/lib/messaging/console-provider';
import { createTokenStore } from '@/lib/payment-update/store';

export const dynamic = 'force-dynamic';

// Development-only manual trigger. Returns 404 in production so it cannot be
// reached in a real deployment.
export const POST = withErrorHandling(async (request: Request) => {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { paymentEventId?: unknown } | null;
  const paymentEventId = body?.paymentEventId;
  if (typeof paymentEventId !== 'string' || paymentEventId.length === 0) {
    throw new ValidationError('paymentEventId is required');
  }

  // Plan enforcement (M4 Step 7): the manual trigger bypasses the webhook's
  // limit gate, so enforce the same cap here. Only failed-payment events are
  // metered; over-limit raises a graceful ValidationError (400).
  const event = await prisma.paymentEvent.findUnique({
    where: { id: paymentEventId },
    select: { merchantId: true, eventType: true },
  });
  if (event?.eventType === FAILED_PAYMENT_EVENT_TYPE) {
    await assertWithinPlanLimit(event.merchantId);
  }

  const outcome = await processPaymentEvent(
    {
      processingStore: createProcessingStore(),
      recoveryStore: createRecoveryStore(),
      messageStore: createMessageStore(),
      messagingProvider: createConsoleMessagingProvider(),
      messagingProviderName: getEnv().MESSAGING_PROVIDER,
      tokenStore: createTokenStore(),
      clock: { now: () => new Date() },
      buildPaymentUpdateUrl: (token: string) => `${getEnv().APP_BASE_URL}/update-payment/${token}`,
      logger,
    },
    paymentEventId,
  );
  return NextResponse.json(outcome);
});
