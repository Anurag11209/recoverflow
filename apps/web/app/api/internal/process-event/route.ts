import { NextResponse } from 'next/server';
import { processPaymentEvent } from '@recoverflow/recovery-engine';
import { logger, env } from '@recoverflow/shared';
import { ValidationError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { createProcessingStore } from '@/lib/processing/store';
import { createRecoveryStore } from '@/lib/recovery/store';
import { createMessageStore } from '@/lib/messaging/store';
import { createConsoleMessagingProvider } from '@/lib/messaging/console-provider';

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

  const outcome = await processPaymentEvent(
    {
      processingStore: createProcessingStore(),
      recoveryStore: createRecoveryStore(),
      messageStore: createMessageStore(),
      messagingProvider: createConsoleMessagingProvider(),
      messagingProviderName: env.MESSAGING_PROVIDER,
      logger,
    },
    paymentEventId,
  );
  return NextResponse.json(outcome);
});
