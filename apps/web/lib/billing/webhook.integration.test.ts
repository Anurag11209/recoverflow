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
  await prisma.webhookReceipt.deleteMany();
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

const PERIOD_START = 1890000000;
const PERIOD_END = 1893456000;

// Minimal fake events — only the fields the handlers read. Cast through unknown
// since we deliberately omit the rest of Stripe's large object shapes.
function checkoutCompleted(over: Record<string, unknown> = {}, id = 'evt_cs_1'): Stripe.Event {
  return {
    id,
    created: PERIOD_START,
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
  id = 'evt_sub_1',
): Stripe.Event {
  return {
    id,
    created: PERIOD_END,
    type,
    data: {
      object: {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: 'price_growth' },
              current_period_start: PERIOD_START,
              current_period_end: PERIOD_END,
            },
          ],
        },
        ...over,
      },
    },
  } as unknown as Stripe.Event;
}

function invoiceEvent(
  type: 'invoice.paid' | 'invoice.payment_failed',
  over: Record<string, unknown> = {},
  id = 'evt_inv_1',
): Stripe.Event {
  return {
    id,
    created: PERIOD_END,
    type,
    data: { object: { id: 'in_123', customer: 'cus_123', ...over } },
  } as unknown as Stripe.Event;
}

async function seedSubscription(data: Record<string, unknown> = {}) {
  await prisma.billingSubscription.create({
    data: { merchantId, plan: 'STARTER', stripeCustomerId: 'cus_123', ...data },
  });
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
    await seedSubscription();

    const res = await applyStripeEvent(checkoutCompleted());
    expect(res).toEqual({ handled: true, duplicate: false });

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

  it('activates the subscription and syncs the period window on subscription.created', async () => {
    await seedSubscription();

    const res = await applyStripeEvent(subscriptionEvent('customer.subscription.created'));
    expect(res).toEqual({ handled: true, duplicate: false });

    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.status).toBe('ACTIVE');
    expect(row?.plan).toBe('GROWTH');
    expect(row?.stripeSubscriptionId).toBe('sub_123');
    expect(row?.currentPeriodStart?.getTime()).toBe(PERIOD_START * 1000);
    expect(row?.currentPeriodEnd?.getTime()).toBe(PERIOD_END * 1000);
    expect(row?.cancelAtPeriodEnd).toBe(false);
  });

  it('marks the subscription CANCELED on deletion', async () => {
    await seedSubscription({ plan: 'GROWTH', status: 'ACTIVE' });

    await applyStripeEvent(
      subscriptionEvent('customer.subscription.deleted', { status: 'canceled' }),
    );

    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.status).toBe('CANCELED');
  });

  it('marks ACTIVE on invoice.paid (recovers from past_due)', async () => {
    await seedSubscription({ plan: 'GROWTH', status: 'PAST_DUE' });

    const res = await applyStripeEvent(invoiceEvent('invoice.paid'));
    expect(res.handled).toBe(true);

    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.status).toBe('ACTIVE');
  });

  it('marks PAST_DUE on invoice.payment_failed', async () => {
    await seedSubscription({ plan: 'GROWTH', status: 'ACTIVE' });

    const res = await applyStripeEvent(invoiceEvent('invoice.payment_failed'));
    expect(res.handled).toBe(true);

    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.status).toBe('PAST_DUE');
  });

  it('persists a WebhookReceipt for an event', async () => {
    await seedSubscription();
    await applyStripeEvent(subscriptionEvent('customer.subscription.created', {}, 'evt_persist'));

    const receipt = await prisma.webhookReceipt.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: 'evt_persist' } },
    });
    expect(receipt?.eventType).toBe('customer.subscription.created');
  });

  it('ignores a duplicate delivery (same event id) without re-processing', async () => {
    await seedSubscription();
    const event = subscriptionEvent('customer.subscription.updated', {}, 'evt_dup');

    const first = await applyStripeEvent(event);
    expect(first).toEqual({ handled: true, duplicate: false });

    // Redelivery: the row is mutated to CANCELED first to prove the second call
    // does NOT re-apply the (ACTIVE) event over our change.
    await prisma.billingSubscription.update({
      where: { merchantId },
      data: { status: 'CANCELED' },
    });

    const second = await applyStripeEvent(event);
    expect(second).toEqual({ handled: false, duplicate: true });

    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.status).toBe('CANCELED'); // unchanged by the duplicate
    const count = await prisma.webhookReceipt.count({ where: { eventId: 'evt_dup' } });
    expect(count).toBe(1);
  });

  it('acks (does not throw) when no row matches the customer', async () => {
    const res = await applyStripeEvent(
      subscriptionEvent('customer.subscription.updated', { customer: 'cus_unknown' }),
    );
    expect(res.handled).toBe(false);
  });

  it('ignores unhandled event types', async () => {
    const res = await applyStripeEvent({
      id: 'evt_unhandled',
      created: PERIOD_END,
      type: 'customer.created',
      data: { object: {} },
    } as unknown as Stripe.Event);
    expect(res).toEqual({ handled: false, duplicate: false });
  });
});
