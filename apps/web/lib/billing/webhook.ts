import type Stripe from 'stripe';
import { prisma } from '@recoverflow/db';
import type { BillingStatus, PlanTier } from '@recoverflow/db';
import { logger } from '@recoverflow/shared';
import { tierForStripePriceId } from './plans';

/**
 * Stripe webhook handling for RecoverFlow's own subscriptions (M4-3). The
 * checkout flow (M4-2) only creates the Checkout Session and a Stripe Customer;
 * the subscription is not real until Stripe confirms payment asynchronously.
 * These handlers are the single place a BillingSubscription becomes ACTIVE (or
 * PAST_DUE / CANCELED). Every write is an idempotent update keyed by a Stripe id,
 * so redelivered events are safe.
 */

/** Map a Stripe subscription status onto our coarser BillingStatus enum. */
export function mapStripeStatus(status: Stripe.Subscription.Status): BillingStatus {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
      return 'PAST_DUE';
    case 'incomplete':
      return 'INCOMPLETE';
    // unpaid / canceled / incomplete_expired / paused all gate access.
    default:
      return 'CANCELED';
  }
}

function customerIdOf(ref: string | { id: string } | null): string | null {
  if (ref === null) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

/**
 * Reconcile a BillingSubscription row from a Stripe Subscription object. The row
 * was created at checkout with stripeCustomerId, so we locate it by customer.
 * The price on the subscription is the source of truth for which plan is active.
 */
async function applySubscription(subscription: Stripe.Subscription): Promise<boolean> {
  const stripeCustomerId = customerIdOf(subscription.customer);
  if (!stripeCustomerId) return false;

  const existing = await prisma.billingSubscription.findUnique({
    where: { stripeCustomerId },
    select: { merchantId: true },
  });
  if (!existing) {
    // No local row for this customer — nothing we can attribute it to. Ack so
    // Stripe stops retrying; log for investigation.
    logger.warn(
      { event: 'stripe_subscription_unknown_customer', stripeCustomerId },
      'Stripe subscription event for a customer with no BillingSubscription row',
    );
    return false;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const tier: PlanTier | null = priceId ? tierForStripePriceId(priceId) : null;
  // In this API version current_period_end lives on the subscription item.
  const periodEnd = item?.current_period_end ?? null;

  await prisma.billingSubscription.update({
    where: { merchantId: existing.merchantId },
    data: {
      status: mapStripeStatus(subscription.status),
      stripeSubscriptionId: subscription.id,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      ...(tier ? { plan: tier } : {}),
    },
  });
  return true;
}

/** Record the subscription id + plan when checkout completes (status follows
 * from the customer.subscription.* events). Keyed by merchantId. */
async function applyCheckoutCompleted(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.mode !== 'subscription') return false;
  const merchantId = session.client_reference_id;
  if (!merchantId) return false;

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription?.id ?? null);
  const tier = session.metadata?.tier as PlanTier | undefined;
  const stripeCustomerId = customerIdOf(session.customer);

  await prisma.billingSubscription.update({
    where: { merchantId },
    data: {
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
      ...(tier ? { plan: tier } : {}),
    },
  });
  return true;
}

/**
 * Entry point: dispatch a verified Stripe event to the right handler. Returns
 * whether the event mutated state (false = ignored/unhandled type). Unhandled
 * types are normal — Stripe sends many — and are acked, not errored.
 */
export async function applyStripeEvent(event: Stripe.Event): Promise<{ handled: boolean }> {
  switch (event.type) {
    case 'checkout.session.completed':
      return { handled: await applyCheckoutCompleted(event.data.object) };
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return { handled: await applySubscription(event.data.object) };
    default:
      return { handled: false };
  }
}
