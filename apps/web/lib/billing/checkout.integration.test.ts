import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@recoverflow/db';
import { createCheckoutSession, type StripeLike } from './checkout';

// Mock the plan helpers so price-id resolution is controlled by the test, not
// by whatever is (or isn't) in .env. We keep the real PLANS/selfServe data and
// only override stripePriceIdFor.
vi.mock('./plans', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./plans')>();
  return {
    ...actual,
    stripePriceIdFor: vi.fn((tier: string) =>
      priceConfigured ? `price_test_${tier.toLowerCase()}` : null,
    ),
  };
});

// Toggled per-test to simulate configured / unconfigured price ids.
let priceConfigured = true;

// A fake Stripe that records calls and returns canned objects — no network.
function fakeStripe(overrides?: Partial<StripeLike>): StripeLike {
  return {
    customers: {
      create: vi.fn(async () => ({ id: 'cus_test_123' })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ url: 'https://checkout.stripe.test/session/abc' })),
      },
    },
    ...overrides,
  };
}

async function clean() {
  await prisma.billingSubscription.deleteMany();
  await prisma.merchant.deleteMany();
}

let merchantId: string;
beforeEach(async () => {
  await clean();
  const m = await prisma.merchant.create({
    data: { name: 'Checkout Co', email: 'checkout@test.local', razorpayWebhookSecret: 'whsec_x' },
  });
  merchantId = m.id;
  priceConfigured = true;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('createCheckoutSession (integration, Stripe mocked)', () => {
  it('rejects a non-self-serve plan (Enterprise)', async () => {
    await expect(createCheckoutSession(merchantId, 'ENTERPRISE', fakeStripe())).rejects.toThrow();
  });

  it('rejects when the price id is not configured', async () => {
    priceConfigured = false;
    await expect(createCheckoutSession(merchantId, 'STARTER', fakeStripe())).rejects.toThrow();
  });

  it('creates a Stripe customer on first checkout and persists the id', async () => {
    const stripe = fakeStripe();
    await createCheckoutSession(merchantId, 'STARTER', stripe);

    expect(stripe.customers.create).toHaveBeenCalledOnce();
    const row = await prisma.billingSubscription.findUnique({ where: { merchantId } });
    expect(row?.stripeCustomerId).toBe('cus_test_123');
    expect(row?.plan).toBe('STARTER');
    // Status stays INCOMPLETE until the webhook confirms (M4-3).
    expect(row?.status).toBe('INCOMPLETE');
  });

  it('reuses an existing Stripe customer on a later checkout', async () => {
    // Seed a billing row that already has a customer id.
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'STARTER', stripeCustomerId: 'cus_existing' },
    });
    const stripe = fakeStripe();
    await createCheckoutSession(merchantId, 'GROWTH', stripe);

    // No new customer created; the existing id is reused.
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it('returns the Stripe checkout URL', async () => {
    const result = await createCheckoutSession(merchantId, 'STARTER', fakeStripe());
    expect(result.url).toBe('https://checkout.stripe.test/session/abc');
  });

  it('uses the spec success/cancel URLs', async () => {
    let captured: { success_url?: string; cancel_url?: string } | undefined;
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          create: vi.fn(async (params) => {
            captured = params as { success_url: string; cancel_url: string };
            return { url: 'https://checkout.stripe.test/session/abc' };
          }),
        },
      },
    });
    await createCheckoutSession(merchantId, 'STARTER', stripe);

    expect(captured?.success_url).toMatch(/\/dashboard\/billing\/success$/);
    expect(captured?.cancel_url).toMatch(/\/dashboard\/billing$/);
  });

  it('refuses a new checkout when a live subscription already exists', async () => {
    for (const status of ['ACTIVE', 'TRIALING', 'PAST_DUE'] as const) {
      await prisma.billingSubscription.deleteMany();
      await prisma.billingSubscription.create({
        data: {
          merchantId,
          plan: 'STARTER',
          stripeCustomerId: 'cus_live',
          stripeSubscriptionId: `sub_${status}`,
          status,
        },
      });
      const stripe = fakeStripe();
      await expect(createCheckoutSession(merchantId, 'GROWTH', stripe)).rejects.toThrow(
        /active subscription/i,
      );
      // Guarded before any Stripe call — no second subscription is created.
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(stripe.customers.create).not.toHaveBeenCalled();
    }
  });

  it('allows re-subscribing after cancellation (reusing the customer)', async () => {
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'STARTER', stripeCustomerId: 'cus_existing', status: 'CANCELED' },
    });
    const stripe = fakeStripe();
    const result = await createCheckoutSession(merchantId, 'GROWTH', stripe);

    expect(result.url).toBe('https://checkout.stripe.test/session/abc');
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });
});
