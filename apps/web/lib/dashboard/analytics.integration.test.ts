import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { getAnalytics } from './analytics';

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
  return prisma.merchant.create({ data: { name, email: `an-${++seq}@test.local` } });
}

// Fixed "now" so the 30-day window is deterministic: 2026-06-10T12:00Z.
const NOW = new Date('2026-06-10T12:00:00Z');
const day = (iso: string) => new Date(`${iso}T10:00:00Z`); // mid-day, comfortably inside the UTC bucket

async function seedCase(
  merchantId: string,
  opts: {
    createdAt: Date;
    status?: 'OPEN' | 'RECOVERED';
    category?: string;
    recoveredAt?: Date;
    recoveredAmount?: number;
  },
) {
  const pe = await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId: `evt_an_${++seq}`,
      eventType: 'payment.failed',
      merchantId,
      payload: {},
      signatureVerified: true,
    },
  });
  return prisma.recoveryCase.create({
    data: {
      paymentEventId: pe.id,
      merchantId,
      provider: 'razorpay',
      status: opts.status ?? 'OPEN',
      amount: 499,
      currency: 'INR',
      failureCategory: opts.category ?? 'INSUFFICIENT_FUNDS',
      createdAt: opts.createdAt,
      ...(opts.recoveredAt
        ? { recoveredAt: opts.recoveredAt, recoveredAmount: opts.recoveredAmount ?? 499 }
        : {}),
    },
  });
}

describe('getAnalytics (integration)', () => {
  it('returns a fully gap-filled zero window for a merchant with no data', async () => {
    const m = await seedMerchant('Empty');
    const a = await getAnalytics(m.id, { days: 7, now: NOW });

    expect(a.caseTrend).toHaveLength(7);
    expect(a.revenueTrend).toHaveLength(7);
    expect(a.caseTrend.every((p) => p.count === 0)).toBe(true);
    expect(a.revenueTrend.every((p) => p.revenue === '0')).toBe(true);
    expect(a.caseTrend[0]!.day).toBe('2026-06-04');
    expect(a.caseTrend[6]!.day).toBe('2026-06-10');
    expect(a.recoveryRate).toBe(0);
    expect(a.categoryBreakdown).toEqual([]);
  });

  it('buckets cases and revenue into the correct UTC days, gap-filled, window-bounded', async () => {
    const m = await seedMerchant('Days');
    // Two cases on Jun 8, one on Jun 10; one OUTSIDE the 7-day window (May 30).
    await seedCase(m.id, { createdAt: day('2026-06-08') });
    await seedCase(m.id, {
      createdAt: day('2026-06-08'),
      status: 'RECOVERED',
      recoveredAt: day('2026-06-09'),
      recoveredAmount: 499,
    });
    await seedCase(m.id, {
      createdAt: day('2026-06-10'),
      status: 'RECOVERED',
      recoveredAt: day('2026-06-10'),
      recoveredAmount: 999,
    });
    await seedCase(m.id, { createdAt: day('2026-05-30') }); // outside window

    const a = await getAnalytics(m.id, { days: 7, now: NOW });

    const counts = Object.fromEntries(a.caseTrend.map((p) => [p.day, p.count]));
    expect(counts['2026-06-08']).toBe(2);
    expect(counts['2026-06-10']).toBe(1);
    expect(counts['2026-06-07']).toBe(0); // gap-filled
    expect(a.caseTrend.reduce((s, p) => s + p.count, 0)).toBe(3); // May 30 excluded

    const revenue = Object.fromEntries(a.revenueTrend.map((p) => [p.day, p.revenue]));
    expect(revenue['2026-06-09']).toBe('499'); // keyed on recoveredAt, not createdAt
    expect(revenue['2026-06-10']).toBe('999');
    expect(revenue['2026-06-08']).toBe('0');

    // All-time stats still see all 4 cases.
    expect(a.totalCases).toBe(4);
    expect(a.recoveredCases).toBe(2);
    expect(a.openCases).toBe(2);
    expect(a.recoveryRate).toBe(50);
  });

  it('aggregates failure categories correctly, sorted by count', async () => {
    const m = await seedMerchant('Cats');
    await seedCase(m.id, { createdAt: day('2026-06-09'), category: 'EXPIRED_CARD' });
    await seedCase(m.id, { createdAt: day('2026-06-09'), category: 'INSUFFICIENT_FUNDS' });
    await seedCase(m.id, { createdAt: day('2026-06-10'), category: 'INSUFFICIENT_FUNDS' });

    const a = await getAnalytics(m.id, { days: 7, now: NOW });
    expect(a.categoryBreakdown).toEqual([
      { category: 'INSUFFICIENT_FUNDS', count: 2 },
      { category: 'EXPIRED_CARD', count: 1 },
    ]);
  });

  it("is merchant-scoped: another merchant's cases never leak into trends or totals", async () => {
    const a = await seedMerchant('A');
    const b = await seedMerchant('B');
    await seedCase(a.id, { createdAt: day('2026-06-09') });
    await seedCase(b.id, {
      createdAt: day('2026-06-09'),
      status: 'RECOVERED',
      recoveredAt: day('2026-06-09'),
      recoveredAmount: 10000,
    });

    const resA = await getAnalytics(a.id, { days: 7, now: NOW });
    expect(resA.totalCases).toBe(1);
    expect(resA.revenueTrend.every((p) => p.revenue === '0')).toBe(true);

    const resB = await getAnalytics(b.id, { days: 7, now: NOW });
    expect(resB.totalCases).toBe(1);
    const revB = Object.fromEntries(resB.revenueTrend.map((p) => [p.day, p.revenue]));
    expect(revB['2026-06-09']).toBe('10000');
  });
});
