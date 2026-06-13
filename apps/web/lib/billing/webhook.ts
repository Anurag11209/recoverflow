import type Stripe from 'stripe';
import { Prisma, prisma } from '@recoverflow/db';
import type { BillingStatus, PlanTier } from '@recoverflow/db';
import { logger } from '@recoverflow/shared';
import { tierForStripePriceId } from './plans';

/**
 * Stripe webhook handling for RecoverFlow's own subscriptions (M4). The checkout
 * flow only creates the Checkout Session and a Stripe Customer; the subscription
 * is not real until Stripe confirms payment asynchronously. These handlers are
 * the single place a BillingSubscription becomes ACTIVE / PAST_DUE / CANCELED.
 *
 * Idempotency + persistence + duplicate protection reuse the existing
 * WebhookReceipt model (unique [provider, eventId]) — the same mechanism the
 * Razorpay path uses. Stripe billing events are deliberately NOT written to
 * PaymentEvent: that table feeds the recovery engine, which stays billing-agnostic.
 */

const STRIPE_PROVIDER = 'stripe';

type Tx = Prisma.TransactionClient;

/** P2002 = Prisma unique-constraint violation, matched structurally so the
 * module stays decoupled from the Prisma error class (and easy to fake). */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

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

function customerIdOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

function secondsToDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

/** Locate the BillingSubscription owning a Stripe customer, or null + warn. */
async function merchantForCustomer(tx: Tx, stripeCustomerId: string): Promise<string | null> {
  const existing = await tx.billingSubscription.findUnique({
    where: { stripeCustomerId },
    select: { merchantId: true },
  });
  if (!existing) {
    // No local row for this customer — nothing we can attribute it to. Ack so
    // Stripe stops retrying; log for investigation.
    logger.warn(
      { event: 'stripe_webhook_unknown_customer', stripeCustomerId },
      'Stripe event for a customer with no BillingSubscription row',
    );
    return null;
  }
  return existing.merchantId;
}

/**
 * Reconcile a BillingSubscription row from a Stripe Subscription object. The row
 * was created at checkout with stripeCustomerId, so we locate it by customer.
 * The price on the subscription is the source of truth for which plan is active.
 */
async function applySubscription(tx: Tx, subscription: Stripe.Subscription): Promise<boolean> {
  const stripeCustomerId = customerIdOf(subscription.customer);
  if (!stripeCustomerId) return false;
  const merchantId = await merchantForCustomer(tx, stripeCustomerId);
  if (!merchantId) return false;

  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const tier: PlanTier | null = priceId ? tierForStripePriceId(priceId) : null;
  // In this API version the period window lives on the subscription item.
  await tx.billingSubscription.update({
    where: { merchantId },
    data: {
      status: mapStripeStatus(subscription.status),
      stripeSubscriptionId: subscription.id,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: secondsToDate(item?.current_period_start),
      currentPeriodEnd: secondsToDate(item?.current_period_end),
      ...(tier ? { plan: tier } : {}),
    },
  });
  return true;
}

/** Record the subscription id + plan when checkout completes (status follows
 * from the customer.subscription.* events). Keyed by merchantId. */
async function applyCheckoutCompleted(tx: Tx, session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.mode !== 'subscription') return false;
  const merchantId = session.client_reference_id;
  if (!merchantId) return false;

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription?.id ?? null);
  const tier = session.metadata?.tier as PlanTier | undefined;
  const stripeCustomerId = customerIdOf(session.customer);

  await tx.billingSubscription.update({
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
 * invoice.paid / invoice.payment_failed carry the renewal outcome. We only move
 * the status (ACTIVE on payment, PAST_DUE on failure); the period window is owned
 * by the customer.subscription.* events, which fire alongside. Scoped by customer,
 * so non-subscription invoices for an unknown customer are ignored.
 */
async function applyInvoiceStatus(
  tx: Tx,
  invoice: Stripe.Invoice,
  status: BillingStatus,
): Promise<boolean> {
  const stripeCustomerId = customerIdOf(invoice.customer);
  if (!stripeCustomerId) return false;
  const merchantId = await merchantForCustomer(tx, stripeCustomerId);
  if (!merchantId) return false;

  await tx.billingSubscription.update({ where: { merchantId }, data: { status } });
  return true;
}

/** Route a verified event to its handler. Returns whether it mutated state. */
async function dispatch(tx: Tx, event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case 'checkout.session.completed':
      return applyCheckoutCompleted(tx, event.data.object);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return applySubscription(tx, event.data.object);
    case 'invoice.paid':
      return applyInvoiceStatus(tx, event.data.object, 'ACTIVE');
    case 'invoice.payment_failed':
      return applyInvoiceStatus(tx, event.data.object, 'PAST_DUE');
    default:
      return false;
  }
}

export interface StripeEventResult {
  /** True if the event mutated a BillingSubscription. */
  handled: boolean;
  /** True if this event id was already processed (redelivery), so it was skipped. */
  duplicate: boolean;
}

/**
 * Entry point: dispatch a verified Stripe event idempotently.
 *
 * The handler mutation and the WebhookReceipt insert run in ONE transaction,
 * with the receipt written LAST. On a redelivery the unique [provider, eventId]
 * insert raises P2002, which rolls back the mutation too — so duplicates are a
 * true no-op (no "mark-processed-before-work" gap). Unhandled event types are
 * still receipted (audit) and acked.
 */
export async function applyStripeEvent(event: Stripe.Event): Promise<StripeEventResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const handled = await dispatch(tx, event);
      await tx.webhookReceipt.create({
        data: {
          provider: STRIPE_PROVIDER,
          eventId: event.id,
          eventType: event.type,
          eventTime: new Date(event.created * 1000),
        },
      });
      return { handled, duplicate: false };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      logger.info(
        { event: 'stripe_webhook_duplicate', stripeEventId: event.id, type: event.type },
        'duplicate Stripe event ignored',
      );
      return { handled: false, duplicate: true };
    }
    throw e;
  }
}
