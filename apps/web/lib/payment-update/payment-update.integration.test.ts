import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { createPaymentUpdateToken } from '@recoverflow/recovery-engine';
import { logger } from '@recoverflow/shared';
import { createTokenStore } from '@recoverflow/adapters';
import { validatePaymentToken, submitPaymentUpdate } from './service';

async function clean() {
  await prisma.paymentUpdateToken.deleteMany();
  await prisma.messageLog.deleteMany();
  await prisma.recoveryAttempt.deleteMany();
  await prisma.recoveryCase.deleteMany();
  await prisma.eventProcessing.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.webhookReceipt.deleteMany();
  await prisma.merchant.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

const tokenDeps = () => ({
  store: createTokenStore(),
  clock: { now: () => new Date() },
  logger,
});

/** Seed a PaymentEvent + RecoveryCase directly; returns the case id. */
async function seedCase(providerEventId: string): Promise<string> {
  const merchant = await prisma.merchant.create({
    data: { name: 'PU Test Co', email: `pu-${providerEventId}@test.local` },
  });
  const pe = await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId,
      eventType: 'payment.failed',
      merchantId: merchant.id,
      payload: {},
      signatureVerified: true,
    },
  });
  const rc = await prisma.recoveryCase.create({
    data: {
      paymentEventId: pe.id,
      merchantId: merchant.id,
      provider: 'razorpay',
      providerPaymentId: 'pay_pu_int',
      customerEmail: 'pu@example.com',
      customerPhone: '+919876543210',
      amount: 499,
      currency: 'INR',
      failureReason: 'Insufficient funds',
      failureCategory: 'INSUFFICIENT_FUNDS',
      status: 'OPEN',
    },
  });
  return rc.id;
}

/** Mint a token for a case and return the RAW token (only the hash is stored). */
async function mintToken(recoveryCaseId: string, ttlHours?: number): Promise<string> {
  const { raw } = await createPaymentUpdateToken(tokenDeps(), {
    recoveryCaseId,
    merchantId: null,
    ...(ttlHours === undefined ? {} : { ttlHours }),
  });
  return raw;
}

describe('payment update flow (integration)', () => {
  it('validates a fresh token and returns display fields only', async () => {
    const caseId = await seedCase('evt_pu_1');
    const raw = await mintToken(caseId);
    const meta = await validatePaymentToken(raw);
    expect(meta).toEqual({
      valid: true,
      merchantName: 'PU Test Co',
      amount: '499',
      currency: 'INR',
    });
  });

  it('rejects an unknown token with the generic response', async () => {
    const meta = await validatePaymentToken('deadbeef'.repeat(8));
    expect(meta).toEqual({ valid: false });
    const submit = await submitPaymentUpdate('deadbeef'.repeat(8));
    expect(submit).toEqual({ recovered: false });
  });

  it('completes recovery: marks the case RECOVERED with amount + timestamp', async () => {
    const caseId = await seedCase('evt_pu_2');
    const raw = await mintToken(caseId);
    const res = await submitPaymentUpdate(raw);
    expect(res).toEqual({ recovered: true });

    const rc = await prisma.recoveryCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(rc.status).toBe('RECOVERED');
    expect(Number(rc.recoveredAmount)).toBe(499);
    expect(rc.recoveredAt).not.toBeNull();
  });

  it('consumes the token (usedAt set) on a successful submit', async () => {
    const caseId = await seedCase('evt_pu_3');
    const raw = await mintToken(caseId);
    await submitPaymentUpdate(raw);
    const tok = await prisma.paymentUpdateToken.findFirstOrThrow({
      where: { recoveryCaseId: caseId },
    });
    expect(tok.usedAt).not.toBeNull();
  });

  it('creates exactly one PAYMENT_RECOVERED message (SENT)', async () => {
    const caseId = await seedCase('evt_pu_4');
    const raw = await mintToken(caseId);
    await submitPaymentUpdate(raw);
    const msgs = await prisma.messageLog.findMany({
      where: { recoveryCaseId: caseId, messageType: 'PAYMENT_RECOVERED' },
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.status).toBe('SENT');
  });

  it('is single-use: a second submit is rejected and does not double-recover', async () => {
    const caseId = await seedCase('evt_pu_5');
    const raw = await mintToken(caseId);

    const first = await submitPaymentUpdate(raw);
    expect(first).toEqual({ recovered: true });
    const rc1 = await prisma.recoveryCase.findUniqueOrThrow({ where: { id: caseId } });

    const second = await submitPaymentUpdate(raw);
    expect(second).toEqual({ recovered: false });

    const rc2 = await prisma.recoveryCase.findUniqueOrThrow({ where: { id: caseId } });
    // recoveredAt unchanged -> no second recovery.
    expect(rc2.recoveredAt?.getTime()).toBe(rc1.recoveredAt?.getTime());
    // Still exactly one recovered message.
    const msgs = await prisma.messageLog.findMany({
      where: { recoveryCaseId: caseId, messageType: 'PAYMENT_RECOVERED' },
    });
    expect(msgs).toHaveLength(1);
  });

  it('rejects an expired token for both validate and submit', async () => {
    const caseId = await seedCase('evt_pu_6');
    const raw = await mintToken(caseId, -1); // expiresAt = now - 1h

    const meta = await validatePaymentToken(raw);
    expect(meta).toEqual({ valid: false });

    const submit = await submitPaymentUpdate(raw);
    expect(submit).toEqual({ recovered: false });

    const rc = await prisma.recoveryCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(rc.status).toBe('OPEN'); // expired submit must not recover
  });
});
