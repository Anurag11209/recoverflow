import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import type { PlanTier } from '@recoverflow/db';
import { checkPlanLimit, createPlanLimitStore } from './plan-limits';

const NOW = new Date('2026-06-13T12:00:00Z');

async function clean() {
  await prisma.paymentEvent.deleteMany();
  await prisma.billingSubscription.deleteMany();
  await prisma.merchant.deleteMany();
}

let merchantId: string;
beforeEach(async () => {
  await clean();
  const m = await prisma.merchant.create({
    data: { name: 'Limits Co', email: 'limits@test.local', razorpayWebhookSecret: 'whsec_x' },
  });
  merchantId = m.id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

let seq = 0;
async function failedEvent(mId: string, receivedAt: Date) {
  seq += 1;
  await prisma.paymentEvent.create({
    data: {
      provider: 'razorpay',
      providerEventId: `evt_${seq}`,
      eventType: 'payment.failed',
      merchantId: mId,
      payload: {},
      signatureVerified: true,
      receivedAt,
    },
  });
}

async function setPlan(mId: string, plan: PlanTier) {
  await prisma.billingSubscription.create({
    data: { merchantId: mId, plan, status: 'ACTIVE', stripeCustomerId: `cus_${mId}` },
  });
}

describe('plan-limits (integration, real Prisma store)', () => {
  it('counts only this-month failed payments for the merchant', async () => {
    await setPlan(merchantId, 'STARTER');
    await failedEvent(merchantId, new Date('2026-06-02T00:00:00Z')); // in window
    await failedEvent(merchantId, new Date('2026-06-10T00:00:00Z')); // in window
    await failedEvent(merchantId, new Date('2026-05-31T23:59:59Z')); // last month, excluded

    const store = createPlanLimitStore();
    const count = await store.countFailedPaymentsSince(
      merchantId,
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(count).toBe(2);
  });

  it('does not count non-failed event types', async () => {
    await prisma.paymentEvent.create({
      data: {
        provider: 'razorpay',
        providerEventId: 'evt_captured',
        eventType: 'payment.captured',
        merchantId,
        payload: {},
        signatureVerified: true,
        receivedAt: new Date('2026-06-05T00:00:00Z'),
      },
    });
    const count = await createPlanLimitStore().countFailedPaymentsSince(
      merchantId,
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(count).toBe(0);
  });

  it('blocks once the Starter cap is reached (boundary via real count)', async () => {
    await setPlan(merchantId, 'STARTER');
    // 500 within cap -> allowed; one more -> blocked. Seed 501 events.
    for (let i = 0; i < 501; i += 1) {
      await failedEvent(merchantId, new Date('2026-06-06T00:00:00Z'));
    }
    const result = await checkPlanLimit(merchantId, NOW);
    expect(result.plan).toBe('STARTER');
    expect(result.used).toBe(501);
    expect(result.allowed).toBe(false);
  });

  it('isolates merchants: one merchant usage does not affect another', async () => {
    await setPlan(merchantId, 'STARTER');
    const other = await prisma.merchant.create({
      data: { name: 'Other Co', email: 'other@test.local', razorpayWebhookSecret: 'whsec_y' },
    });
    await setPlan(other.id, 'STARTER');
    // Flood the OTHER merchant; the target merchant stays at zero usage.
    for (let i = 0; i < 600; i += 1) {
      await failedEvent(other.id, new Date('2026-06-06T00:00:00Z'));
    }
    const result = await checkPlanLimit(merchantId, NOW);
    expect(result.used).toBe(0);
    expect(result.allowed).toBe(true);
  });

  it('falls back to the Starter baseline when the merchant has no subscription', async () => {
    // No BillingSubscription row at all.
    for (let i = 0; i < 501; i += 1) {
      await failedEvent(merchantId, new Date('2026-06-06T00:00:00Z'));
    }
    const result = await checkPlanLimit(merchantId, NOW);
    expect(result.plan).toBe('STARTER');
    expect(result.allowed).toBe(false);
  });
});
