import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { getDashboardStats } from './stats';

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

let seq = 0;

async function seedMerchant(name: string) {
  return prisma.merchant.create({
    data: { name, email: `ds-${++seq}@test.local` },
  });
}

/** One failed PaymentEvent, optionally with a RecoveryCase on top. */
async function seedFailedEvent(
  merchantId: string,
  opts: { caseStatus?: 'OPEN' | 'RECOVERED'; recoveredAmount?: number } = {},
) {
  const pe = await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId: `evt_ds_${++seq}`,
      eventType: 'payment.failed',
      merchantId,
      payload: {},
      signatureVerified: true,
    },
  });
  if (opts.caseStatus) {
    await prisma.recoveryCase.create({
      data: {
        paymentEventId: pe.id,
        merchantId,
        provider: 'razorpay',
        status: opts.caseStatus,
        amount: 499,
        currency: 'INR',
        ...(opts.recoveredAmount !== undefined
          ? { recoveredAmount: opts.recoveredAmount, recoveredAt: new Date() }
          : {}),
      },
    });
  }
  return pe.id;
}

describe('getDashboardStats (integration)', () => {
  it('returns zeros (and a 0 rate, no divide-by-zero) for a merchant with no data', async () => {
    const m = await seedMerchant('Empty Co');
    expect(await getDashboardStats(m.id)).toEqual({
      totalFailedPayments: 0,
      totalCases: 0,
      openCases: 0,
      recoveredCases: 0,
      recoveryRate: 0,
      recoveredRevenue: '0',
    });
  });

  it('aggregates counts, rate, and revenue for one merchant', async () => {
    const m = await seedMerchant('Stats Co');
    await seedFailedEvent(m.id, { caseStatus: 'OPEN' });
    await seedFailedEvent(m.id, { caseStatus: 'RECOVERED', recoveredAmount: 499 });
    await seedFailedEvent(m.id, { caseStatus: 'RECOVERED', recoveredAmount: 999 });
    // A failed payment that never became a case: counts as failed, not as a case.
    await seedFailedEvent(m.id);
    // A non-failed event: must NOT count toward totalFailedPayments.
    await prisma.paymentEvent.create({
      data: {
        provider: 'razorpay',
        providerEventId: `evt_ds_${++seq}`,
        eventType: 'payment.captured',
        merchantId: m.id,
        payload: {},
        signatureVerified: true,
      },
    });

    const stats = await getDashboardStats(m.id);
    expect(stats.totalFailedPayments).toBe(4);
    expect(stats.totalCases).toBe(3);
    expect(stats.openCases).toBe(1);
    expect(stats.recoveredCases).toBe(2);
    expect(stats.recoveryRate).toBe(66.7);
    expect(stats.recoveredRevenue).toBe('1498');
  });

  it("is strictly merchant-scoped: another merchant's data never leaks in", async () => {
    const a = await seedMerchant('Merchant A');
    const b = await seedMerchant('Merchant B');
    await seedFailedEvent(a.id, { caseStatus: 'RECOVERED', recoveredAmount: 499 });
    await seedFailedEvent(b.id, { caseStatus: 'RECOVERED', recoveredAmount: 10000 });
    await seedFailedEvent(b.id, { caseStatus: 'OPEN' });

    const statsA = await getDashboardStats(a.id);
    expect(statsA.totalFailedPayments).toBe(1);
    expect(statsA.totalCases).toBe(1);
    expect(statsA.recoveredRevenue).toBe('499');
    expect(statsA.recoveryRate).toBe(100);

    const statsB = await getDashboardStats(b.id);
    expect(statsB.totalCases).toBe(2);
    expect(statsB.recoveredRevenue).toBe('10000');
    expect(statsB.recoveryRate).toBe(50);
  });
});
