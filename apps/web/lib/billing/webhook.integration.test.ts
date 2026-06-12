import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { prisma } from '@recoverflow/db';
import { applyStripeEvent, mapStripeStatus } from './webhook';

// Resolve a known price id to GROWTH so the subscription handler can derive the
// plan, without depending on real .env values.
vi.mock('./plans', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./plans')>();
  return {
    ...actual,
    tierForStripePriceId: vi.fn((id: string) => (id === 'price_growth' ? 'GROWTH' : null)),
  };
});

async function clean() {
  await prisma.billingSubscription.deleteMany();
  await prisma.merchant.deleteMany();
}

let merchantId: string;
beforeEach(async () => {
  await clean();
  const m = await prisma.merchant.create({
    data: { name: 'Webhook Co', email: 'webhook@test.local', razorpayWebhookSecret: 'whsec_x' },
  });
  merchantId = m.id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

// Minimal fake events — only the fields the handlers read. Cast through unknown
// since we deliberately omit the rest of Stripe's large object shapes.
function checkoutCompleted(over: Record<string, unknown> = {}): Stripe.Event {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        mode: 'subscription',
        client_reference_id: merchantId,
        customer: 'cus_123',
        subscription: 'sub_123',
        metadata: { tier: 'GROWTH' },
        ...over,
      },
    },
  } as unknown as Stripe.Event;
}

function subscriptionEvent(
  type:
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted',
  over: Record<string, unknown> = {},
): Stripe.Event {
  return {
    type,
    data: {
      object: {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [{ price: { id: 'price_growth' }, current_period_end: 1893456000 }] },
        ...over,
      },
    },
  } as unknown as Stripe.Event;
}

describe('mapStripeStatus', () => {
  it('maps Stripe statuses onto BillingStatus', () => {
    expect(mapStripeStatus('active')).toBe('ACTIVE');
    expect(mapStripeStatus('trialing')).toBe('TRIALING');
    expect(mapStripeStatus('past_due')).toBe('PAST_DUE');
    expect(mapStripeStatus('incomplete')).toBe('INCOMPLETE');
    expect(mapStripeStatus('unpaid')).toBe('CANCELED');
    expect(mapStripeStatus('canceled')).toBe('CANCELED');
  });
});

describe('applyStripeEvent (integration)', () => {
  it('records subscription id + plan on checkout.session.completed', async () => {
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'STARTER', stripeCustomerId: 'cus_123' },
    });

    const res = await applyStripeEvent(checkoutCompleted());
    expect(res.handled).toBe(true);

    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.stripeSubscriptionId).toBe('sub_123');
    expect(row?.plan).toBe('GROWTH');
    // Status is not flipped here — the subscription event owns that.
    expect(row?.status).toBe('INCOMPLETE');
  });

  it('ignores non-subscription checkout sessions', async () => {
    const res = await applyStripeEvent(checkoutCompleted({ mode: 'payment' }));
    expect(res.handled).toBe(false);
  });

  it('activates the subscription on customer.subscription.created', async () => {
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'STARTER', stripeCustomerId: 'cus_123' },
    });

    const res = await applyStripeEvent(subscriptionEvent('customer.subscription.created'));
    expect(res.handled).toBe(true);

    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.status).toBe('ACTIVE');
    expect(row?.plan).toBe('GROWTH');
    expect(row?.stripeSubscriptionId).toBe('sub_123');
    expect(row?.currentPeriodEnd?.getTime()).toBe(1893456000 * 1000);
    expect(row?.cancelAtPeriodEnd).toBe(false);
  });

  it('marks the subscription CANCELED on deletion', async () => {
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'GROWTH', stripeCustomerId: 'cus_123', status: 'ACTIVE' },
    });

    await applyStripeEvent(
      subscriptionEvent('customer.subscription.deleted', { status: 'canceled' }),
    );

    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.status).toBe('CANCELED');
  });

  it('acks (does not throw) when no row matches the customer', async () => {
    const res = await applyStripeEvent(
      subscriptionEvent('customer.subscription.updated', { customer: 'cus_unknown' }),
    );
    expect(res.handled).toBe(false);
  });

  it('ignores unhandled event types', async () => {
    const res = await applyStripeEvent({
      type: 'invoice.paid',
      data: { object: {} },
    } as unknown as Stripe.Event);
    expect(res.handled).toBe(false);
  });
});
