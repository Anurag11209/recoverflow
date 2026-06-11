import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { processPaymentEvent, type MessagingProvider } from '@recoverflow/recovery-engine';
import { logger } from '@recoverflow/shared';
import { createProcessingStore } from '../processing/store';
import { createRecoveryStore } from '../recovery/store';
import { createMessageStore } from './store';
import { createTokenStore } from '../payment-update/store';
import { createConsoleMessagingProvider } from './console-provider';

// FK-safe order: MessageLog -> RecoveryAttempt -> RecoveryCase (Restrict on
// paymentEventId) -> EventProcessing/Idempotency -> PaymentEvent.
async function clean() {
  await prisma.paymentUpdateToken.deleteMany();
  await prisma.messageLog.deleteMany();
  await prisma.recoveryAttempt.deleteMany();
  await prisma.recoveryCase.deleteMany();
  await prisma.eventProcessing.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.webhookReceipt.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

async function seedFailedPayment(providerEventId: string) {
  const pe = await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId,
      eventType: 'payment.failed',
      payload: {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_int',
              amount: 49900,
              currency: 'INR',
              email: 'int@example.com',
              contact: '+919999999999',
              error_description: 'Insufficient funds in account',
            },
          },
        },
      },
      signatureVerified: true,
    },
  });
  await prisma.eventProcessing.create({ data: { paymentEventId: pe.id, status: 'PENDING' } });
  return pe.id;
}

async function forceReprocess(paymentEventId: string) {
  await prisma.eventProcessing.update({
    where: { paymentEventId },
    data: { status: 'PENDING' },
  });
}

function deps(provider: MessagingProvider) {
  return {
    processingStore: createProcessingStore(),
    recoveryStore: createRecoveryStore(),
    messageStore: createMessageStore(),
    messagingProvider: provider,
    messagingProviderName: 'console',
    tokenStore: createTokenStore(),
    clock: { now: () => new Date() },
    buildPaymentUpdateUrl: (token: string) => `https://app.test/update-payment/${token}`,
    logger,
  };
}

describe('message flow (integration)', () => {
  it('payment.failed creates RecoveryCase -> RecoveryAttempt -> MessageLog (SENT)', async () => {
    const peId = await seedFailedPayment('evt_m1');
    const outcome = await processPaymentEvent(deps(createConsoleMessagingProvider()), peId);
    expect(outcome.status).toBe('SUCCESS');

    const rc = await prisma.recoveryCase.findUniqueOrThrow({ where: { paymentEventId: peId } });
    const attempt = await prisma.recoveryAttempt.findFirstOrThrow({
      where: { recoveryCaseId: rc.id },
    });
    const msg = await prisma.messageLog.findFirstOrThrow({
      where: { recoveryAttemptId: attempt.id },
    });
    expect(msg.status).toBe('SENT');
    expect(msg.templateName).toBe('PAYMENT_FAILED');
    expect(msg.recipientPhone).toBe('+919999999999');
    expect(msg.providerMessageId).toBeTruthy();
  });

  it('duplicate processing still results in exactly one MessageLog', async () => {
    const peId = await seedFailedPayment('evt_m2');
    await processPaymentEvent(deps(createConsoleMessagingProvider()), peId);
    await forceReprocess(peId);
    await processPaymentEvent(deps(createConsoleMessagingProvider()), peId);

    expect(await prisma.messageLog.count()).toBe(1);
    expect(await prisma.recoveryCase.count()).toBe(1);
    expect(await prisma.recoveryAttempt.count()).toBe(1);
  });

  it('does not re-send: providerMessageId is unchanged after reprocess', async () => {
    const peId = await seedFailedPayment('evt_m3');
    await processPaymentEvent(deps(createConsoleMessagingProvider()), peId);
    const first = await prisma.messageLog.findFirstOrThrow();
    await forceReprocess(peId);
    await processPaymentEvent(deps(createConsoleMessagingProvider()), peId);
    const after = await prisma.messageLog.findFirstOrThrow();
    expect(after.providerMessageId).toBe(first.providerMessageId);
  });

  it('provider failure marks MessageLog FAILED but processing still SUCCEEDS', async () => {
    const failing: MessagingProvider = {
      async sendMessage() {
        throw new Error('whatsapp gateway down');
      },
    };
    const peId = await seedFailedPayment('evt_m4');
    const outcome = await processPaymentEvent(deps(failing), peId);
    // Message failure must NOT break event processing.
    expect(outcome.status).toBe('SUCCESS');

    const msg = await prisma.messageLog.findFirstOrThrow();
    expect(msg.status).toBe('FAILED');
    expect(msg.errorMessage).toContain('whatsapp gateway down');
    expect(msg.providerMessageId).toBeNull();
  });
});
