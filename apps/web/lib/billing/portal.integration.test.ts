import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@recoverflow/db';
import { createBillingPortalSession, type StripePortalLike } from './portal';

// A fake Stripe that records calls and returns a canned portal session — no
// network. Mirrors the checkout integration test's fakeStripe.
function fakeStripe(
  url: string | null = 'https://billing.stripe.test/portal/abc',
): StripePortalLike {
  return {
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url })),
      },
    },
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
    data: { name: 'Portal Co', email: 'portal@test.local', razorpayWebhookSecret: 'whsec_x' },
  });
  merchantId = m.id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('createBillingPortalSession (integration, Stripe mocked)', () => {
  it('creates a portal session for a merchant with a Stripe customer', async () => {
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'STARTER', stripeCustomerId: 'cus_portal_1', status: 'ACTIVE' },
    });
    const stripe = fakeStripe();

    const result = await createBillingPortalSession(merchantId, stripe);

    expect(result.url).toBe('https://billing.stripe.test/portal/abc');
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledOnce();
  });

  it('opens the portal against the merchant existing customer and returns to billing', async () => {
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'GROWTH', stripeCustomerId: 'cus_reuse_me', status: 'ACTIVE' },
    });
    let captured: { customer?: string; return_url?: string } | undefined;
    const stripe: StripePortalLike = {
      billingPortal: {
        sessions: {
          create: vi.fn(async (params) => {
            captured = params;
            return { url: 'https://billing.stripe.test/portal/abc' };
          }),
        },
      },
    };

    await createBillingPortalSession(merchantId, stripe);

    // Reuses the stored customer id; never creates a new one.
    expect(captured?.customer).toBe('cus_reuse_me');
    expect(captured?.return_url).toMatch(/\/dashboard\/billing$/);
  });

  it('rejects when the merchant has no BillingSubscription row', async () => {
    const stripe = fakeStripe();

    await expect(createBillingPortalSession(merchantId, stripe)).rejects.toThrow();
    // No portal session is created for a merchant with no billing account.
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects when the BillingSubscription has no stripeCustomerId', async () => {
    // Row exists (e.g. seeded) but no Stripe customer has been provisioned yet.
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'STARTER', status: 'INCOMPLETE' },
    });
    const stripe = fakeStripe();

    await expect(createBillingPortalSession(merchantId, stripe)).rejects.toThrow();
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('isolates merchants: a merchant only ever opens their own customer portal', async () => {
    // Two merchants, each with their own Stripe customer.
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'STARTER', stripeCustomerId: 'cus_merchant_A', status: 'ACTIVE' },
    });
    const other = await prisma.merchant.create({
      data: { name: 'Other Co', email: 'other@test.local', razorpayWebhookSecret: 'whsec_y' },
    });
    await prisma.billingSubscription.create({
      data: {
        merchantId: other.id,
        plan: 'GROWTH',
        stripeCustomerId: 'cus_merchant_B',
        status: 'ACTIVE',
      },
    });

    let captured: { customer?: string } | undefined;
    const stripe: StripePortalLike = {
      billingPortal: {
        sessions: {
          create: vi.fn(async (params) => {
            captured = params;
            return { url: 'https://billing.stripe.test/portal/abc' };
          }),
        },
      },
    };

    await createBillingPortalSession(merchantId, stripe);

    // Merchant A's portal is scoped to A's customer — never B's.
    expect(captured?.customer).toBe('cus_merchant_A');
  });

  it('rejects when Stripe returns no portal URL', async () => {
    await prisma.billingSubscription.create({
      data: { merchantId, plan: 'STARTER', stripeCustomerId: 'cus_no_url', status: 'ACTIVE' },
    });

    await expect(createBillingPortalSession(merchantId, fakeStripe(null))).rejects.toThrow();
  });
});
