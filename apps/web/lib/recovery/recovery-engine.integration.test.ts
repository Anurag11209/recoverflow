import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { processPaymentEvent } from '@recoverflow/recovery-engine';
import { logger } from '@recoverflow/shared';
import { createProcessingStore } from '../processing/store';
import { createRecoveryStore } from './store';
import { createMessageStore } from '../messaging/store';
import { createTokenStore } from '../payment-update/store';
import { createConsoleMessagingProvider } from '../messaging/console-provider';

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

const processingStore = createProcessingStore();
const recoveryStore = createRecoveryStore();
const messageStore = createMessageStore();
const deps = () => ({
  processingStore,
  recoveryStore,
  messageStore,
  messagingProvider: createConsoleMessagingProvider(),
  messagingProviderName: 'console',
  tokenStore: createTokenStore(),
  clock: { now: () => new Date() },
  buildPaymentUpdateUrl: (token: string) => `https://app.test/update-payment/${token}`,
  logger,
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

describe('recovery engine (integration)', () => {
  it('payment.failed creates a RecoveryCase (OPEN, classified)', async () => {
    const peId = await seedFailedPayment('evt_r1');
    const outcome = await processPaymentEvent(deps(), peId);
    expect(outcome.status).toBe('SUCCESS');

    const rc = await prisma.recoveryCase.findUniqueOrThrow({ where: { paymentEventId: peId } });
    expect(rc.status).toBe('OPEN');
    expect(rc.failureCategory).toBe('INSUFFICIENT_FUNDS');
    expect(rc.customerEmail).toBe('int@example.com');
  });

  it('payment.failed creates RecoveryAttempt #1 (PENDING)', async () => {
    const peId = await seedFailedPayment('evt_r2');
    await processPaymentEvent(deps(), peId);

    const rc = await prisma.recoveryCase.findUniqueOrThrow({ where: { paymentEventId: peId } });
    const attempts = await prisma.recoveryAttempt.findMany({ where: { recoveryCaseId: rc.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.attemptNumber).toBe(1);
    expect(attempts[0]!.status).toBe('PENDING');
  });

  it('duplicate delivery creates only one RecoveryCase', async () => {
    const peId = await seedFailedPayment('evt_r3');
    await processPaymentEvent(deps(), peId);
    await forceReprocess(peId);
    await processPaymentEvent(deps(), peId);

    expect(await prisma.recoveryCase.count()).toBe(1);
  });

  it('duplicate delivery creates only one RecoveryAttempt', async () => {
    const peId = await seedFailedPayment('evt_r4');
    await processPaymentEvent(deps(), peId);
    await forceReprocess(peId);
    await processPaymentEvent(deps(), peId);

    expect(await prisma.recoveryAttempt.count()).toBe(1);
  });

  it('processing remains idempotent: reprocess still SUCCESS, no extra rows', async () => {
    const peId = await seedFailedPayment('evt_r5');
    const first = await processPaymentEvent(deps(), peId);
    expect(first.status).toBe('SUCCESS');

    await forceReprocess(peId);
    const second = await processPaymentEvent(deps(), peId);
    expect(second.status).toBe('SUCCESS');

    expect(await prisma.recoveryCase.count()).toBe(1);
    expect(await prisma.recoveryAttempt.count()).toBe(1);
    expect(await prisma.idempotencyRecord.count()).toBe(1);
  });
});
