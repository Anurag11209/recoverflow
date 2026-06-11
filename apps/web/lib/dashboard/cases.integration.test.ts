import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import { listCases } from './cases';

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
  return prisma.merchant.create({ data: { name, email: `cases-${++seq}@test.local` } });
}

/**
 * Seed one case for a merchant with an explicit createdAt so ordering is
 * deterministic. Each needs its own PaymentEvent (RecoveryCase.paymentEventId
 * is unique).
 */
async function seedCase(
  merchantId: string,
  opts: { status?: 'OPEN' | 'RECOVERED' | 'FAILED'; createdAt: Date; amount?: number },
) {
  const pe = await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId: `evt_cases_${++seq}`,
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
      amount: opts.amount ?? 499,
      currency: 'INR',
      customerEmail: `c${seq}@example.com`,
      createdAt: opts.createdAt,
    },
  });
}

const at = (min: number) => new Date(`2026-06-01T00:${String(min).padStart(2, '0')}:00Z`);

describe('listCases (integration)', () => {
  it('returns an empty page (null cursor) for a merchant with no cases', async () => {
    const m = await seedMerchant('Empty');
    const res = await listCases(m.id);
    expect(res.cases).toEqual([]);
    expect(res.nextCursor).toBeNull();
  });

  it('orders newest-first and decimals come back as strings', async () => {
    const m = await seedMerchant('Order');
    await seedCase(m.id, { createdAt: at(1), amount: 100 });
    await seedCase(m.id, { createdAt: at(3), amount: 300 });
    await seedCase(m.id, { createdAt: at(2), amount: 200 });

    const res = await listCases(m.id);
    expect(res.cases.map((c) => c.amount)).toEqual(['300', '200', '100']);
    expect(res.nextCursor).toBeNull();
  });

  it('paginates by cursor with no skipped or duplicated rows', async () => {
    const m = await seedMerchant('Paginate');
    // 5 cases, limit 2 -> pages of 2, 2, 1.
    for (let i = 0; i < 5; i++) await seedCase(m.id, { createdAt: at(i) });

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const res = await listCases(m.id, { cursor, limit: 2 });
      seen.push(...res.cases.map((c) => c.token));
      pages++;
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
      if (pages > 10) throw new Error('cursor did not terminate');
    }
    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5); // no duplicates
  });

  it('filters by status', async () => {
    const m = await seedMerchant('Filter');
    await seedCase(m.id, { status: 'OPEN', createdAt: at(1) });
    await seedCase(m.id, { status: 'RECOVERED', createdAt: at(2) });
    await seedCase(m.id, { status: 'OPEN', createdAt: at(3) });

    const open = await listCases(m.id, { status: 'OPEN' });
    expect(open.cases).toHaveLength(2);
    expect(open.cases.every((c) => c.status === 'OPEN')).toBe(true);

    const recovered = await listCases(m.id, { status: 'RECOVERED' });
    expect(recovered.cases).toHaveLength(1);
  });

  it("is merchant-scoped: never returns another merchant's cases", async () => {
    const a = await seedMerchant('A');
    const b = await seedMerchant('B');
    await seedCase(a.id, { createdAt: at(1) });
    await seedCase(b.id, { createdAt: at(2) });
    await seedCase(b.id, { createdAt: at(3) });

    const resA = await listCases(a.id);
    expect(resA.cases).toHaveLength(1);
    const resB = await listCases(b.id);
    expect(resB.cases).toHaveLength(2);
  });

  it('treats a malformed cursor as page one rather than throwing', async () => {
    const m = await seedMerchant('BadCursor');
    await seedCase(m.id, { createdAt: at(1) });
    const res = await listCases(m.id, { cursor: 'not-a-valid-cursor!!!' });
    expect(res.cases).toHaveLength(1);
  });
});
