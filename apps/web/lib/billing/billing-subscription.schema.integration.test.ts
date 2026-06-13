import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, prisma } from '@recoverflow/db';

// Schema-level guarantees for BillingSubscription (M4 Step 1). These assert the
// shape the billing flows depend on: the period window columns, the per-merchant
// uniqueness, and the unique Stripe ids. They are deliberately thin — behaviour
// lives in checkout/webhook tests; this protects the data model itself.

async function clean() {
  await prisma.billingSubscription.deleteMany();
  await prisma.merchant.deleteMany();
}

let merchantId: string;
beforeEach(async () => {
  await clean();
  const m = await prisma.merchant.create({
    data: { name: 'Schema Co', email: 'schema@test.local', razorpayWebhookSecret: 'whsec_x' },
  });
  merchantId = m.id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('BillingSubscription schema', () => {
  it('round-trips the current period window (start + end)', async () => {
    const start = new Date('2026-06-01T00:00:00.000Z');
    const end = new Date('2026-07-01T00:00:00.000Z');
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'GROWTH', currentPeriodStart: start, currentPeriodEnd: end },
    });

    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.currentPeriodStart?.toISOString()).toBe(start.toISOString());
    expect(row?.currentPeriodEnd?.toISOString()).toBe(end.toISOString());
  });

  it('leaves the period window null until a subscription is active', async () => {
    await prisma.billingSubscription.create({ data: { merchantId, plan: 'STARTER' } });
    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.currentPeriodStart).toBeNull();
    expect(row?.currentPeriodEnd).toBeNull();
    // Defaults from the schema.
    expect(row?.status).toBe('INCOMPLETE');
    expect(row?.cancelAtPeriodEnd).toBe(false);
  });

  it('enforces one subscription per merchant (merchantId unique)', async () => {
    await prisma.billingSubscription.create({ data: { merchantId, plan: 'STARTER' } });
    await expect(
      prisma.billingSubscription.create({ data: { merchantId, plan: 'BUSINESS' } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('enforces unique stripeSubscriptionId across merchants', async () => {
    const other = await prisma.merchant.create({
      data: { name: 'Other Co', email: 'other@test.local', razorpayWebhookSecret: 'whsec_y' },
    });
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'STARTER', stripeSubscriptionId: 'sub_dup' },
    });
    await expect(
      prisma.billingSubscription.create({
        data: { merchantId: other.id, plan: 'STARTER', stripeSubscriptionId: 'sub_dup' },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
