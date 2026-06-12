import { prisma } from '@recoverflow/db';
import type { PlanTier } from '@recoverflow/db';
import { getEnv, ValidationError } from '@recoverflow/shared';
import { getStripe } from './stripe';
import { planFor, stripePriceIdFor } from './plans';

export interface CheckoutResult {
  url: string;
}

/**
 * Creates a Stripe Checkout Session for a merchant subscribing to a self-serve
 * plan. Ensures a Stripe Customer + local BillingSubscription row exist (lazily,
 * on first checkout), then returns the hosted Checkout URL to redirect to.
 *
 * Throws ValidationError for a non-self-serve plan or an unconfigured price id.
 */
/** The slice of the Stripe SDK the checkout flow uses (injectable for tests). */
export interface StripeLike {
  customers: {
    create(params: {
      email: string;
      name: string;
      metadata: Record<string, string>;
    }): Promise<{ id: string }>;
  };
  checkout: { sessions: { create(params: unknown): Promise<{ url: string | null }> } };
}

export async function createCheckoutSession(
  merchantId: string,
  tier: PlanTier,
  stripeClient?: StripeLike,
): Promise<CheckoutResult> {
  const plan = planFor(tier);
  if (!plan.selfServe) {
    throw new ValidationError('This plan is not available for self-service checkout');
  }
  const priceId = stripePriceIdFor(tier);
  if (!priceId) {
    throw new ValidationError('This plan is not configured for checkout');
  }

  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: merchantId },
    include: { billingSubscription: true },
  });

  const stripe: StripeLike = stripeClient ?? getStripe();

  // Ensure a Stripe Customer exists; reuse the stored id if we have one.
  let stripeCustomerId = merchant.billingSubscription?.stripeCustomerId ?? null;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: merchant.email,
      name: merchant.name,
      metadata: { merchantId },
    });
    stripeCustomerId = customer.id;
    // Upsert the local billing row with the new customer id (status stays
    // INCOMPLETE until the webhook confirms an active subscription in M4-3).
    await prisma.billingSubscription.upsert({
      where: { merchantId },
      create: { merchantId, plan: tier, stripeCustomerId },
      update: { stripeCustomerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: merchantId,
    metadata: { merchantId, tier },
    success_url: `${getEnv().NEXT_PUBLIC_APP_URL}/dashboard/billing?status=success`,
    cancel_url: `${getEnv().NEXT_PUBLIC_APP_URL}/dashboard/billing?status=cancelled`,
  });

  if (!session.url) {
    throw new ValidationError('Stripe did not return a checkout URL');
  }
  return { url: session.url };
}
