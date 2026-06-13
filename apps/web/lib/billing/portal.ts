import { prisma } from '@recoverflow/db';
import { getEnv, ValidationError } from '@recoverflow/shared';
import { getStripe } from './stripe';

export interface PortalResult {
  url: string;
}

/**
 * The slice of the Stripe SDK the portal flow uses (injectable for tests). The
 * real Stripe client satisfies this structurally — same approach as checkout.
 */
export interface StripePortalLike {
  billingPortal: {
    sessions: {
      create(params: { customer: string; return_url: string }): Promise<{ url: string | null }>;
    };
  };
}

/**
 * Creates a Stripe Billing Portal session so a merchant can self-serve manage
 * their subscription — change plan, cancel, or update the payment method. The
 * portal is opened against the merchant's EXISTING Stripe customer; this flow
 * never creates a customer (that only happens at checkout). Reuses the stored
 * stripeCustomerId, keeping the merchant strictly scoped to their own billing.
 *
 * Throws ValidationError if the merchant has no BillingSubscription row or no
 * stripeCustomerId — in that case no portal session is created.
 */
export async function createBillingPortalSession(
  merchantId: string,
  stripeClient?: StripePortalLike,
): Promise<PortalResult> {
  const subscription = await prisma.billingSubscription.findUnique({
    where: { merchantId },
    select: { stripeCustomerId: true },
  });
  if (!subscription?.stripeCustomerId) {
    throw new ValidationError('No billing account found. Start a subscription before managing it.');
  }

  const stripe: StripePortalLike = stripeClient ?? getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${getEnv().NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  });

  if (!session.url) {
    throw new ValidationError('Stripe did not return a portal URL');
  }
  return { url: session.url };
}
