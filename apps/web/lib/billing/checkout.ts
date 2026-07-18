import type Stripe from 'stripe';
import { prisma } from '@recoverflow/db';
import type { BillingStatus, PlanTier } from '@recoverflow/db';
import { ConflictError, getEnv, ValidationError } from '@recoverflow/shared';
import { getStripe } from './stripe';
import { planFor, stripePriceIdFor } from './plans';
import { mapStripeStatus } from './webhook';

export interface CheckoutResult {
  url: string;
}

/**
 * Statuses that mean the merchant already has a live subscription. Starting a
 * fresh Checkout while in one of these would create a SECOND Stripe subscription
 * (double billing); plan changes for these merchants go through the billing
 * portal, not checkout. INCOMPLETE (never paid) and CANCELED (ended) may re-check out.
 */
const ACTIVE_SUBSCRIPTION_STATUSES: BillingStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

/**
 * Creates a Stripe Checkout Session for a merchant subscribing to a self-serve
 * plan. Ensures a Stripe Customer + local BillingSubscription row exist (lazily,
 * on first checkout), then returns the hosted Checkout URL to redirect to.
 *
 * Throws ValidationError for a non-self-serve plan or an unconfigured price id.
 */
/** Stripe request options we set (a subset of Stripe.RequestOptions). */
export interface StripeRequestOptions {
  idempotencyKey?: string;
}

/** The slice of the Stripe SDK the checkout flow uses (injectable for tests). */
export interface StripeLike {
  customers: {
    create(
      params: {
        email: string;
        name: string;
        metadata: Record<string, string>;
      },
      options?: StripeRequestOptions,
    ): Promise<{ id: string }>;
  };
  checkout: {
    sessions: {
      create(params: unknown, options?: StripeRequestOptions): Promise<{ url: string | null }>;
    };
  };
}

/**
 * Deterministic Stripe idempotency keys for the checkout flow, so a retried
 * request (e.g. after a network blip or a double-submit) reuses the same Stripe
 * operation instead of creating a duplicate Customer or Checkout Session.
 * Distinct logical operations get distinct keys.
 */
export function checkoutIdempotencyKeys(
  merchantId: string,
  tier: PlanTier,
): { customer: string; session: string } {
  return {
    customer: `customer:create:${merchantId}`,
    session: `checkout:create:${merchantId}:${tier}`,
  };
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

  // One active subscription per merchant: refuse a new checkout if one is live.
  const existing = merchant.billingSubscription;
  if (existing && ACTIVE_SUBSCRIPTION_STATUSES.includes(existing.status)) {
    throw new ConflictError(
      'You already have an active subscription. Manage your plan from the billing portal.',
      { code: 'SUBSCRIPTION_EXISTS' },
    );
  }

  const stripe: StripeLike = stripeClient ?? getStripe();
  const idempotency = checkoutIdempotencyKeys(merchantId, tier);

  // Ensure a Stripe Customer exists; reuse the stored id if we have one.
  let stripeCustomerId = merchant.billingSubscription?.stripeCustomerId ?? null;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create(
      {
        email: merchant.email,
        name: merchant.name,
        metadata: { merchantId },
      },
      { idempotencyKey: idempotency.customer },
    );
    stripeCustomerId = customer.id;
    // Upsert the local billing row with the new customer id (status stays
    // INCOMPLETE until the webhook confirms an active subscription in M4-3).
    await prisma.billingSubscription.upsert({
      where: { merchantId },
      create: { merchantId, plan: tier, stripeCustomerId },
      update: { stripeCustomerId },
    });
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: merchantId,
      metadata: { merchantId, tier },
      // {CHECKOUT_SESSION_ID} is substituted by Stripe on redirect, so the
      // success page can reconcile directly from the session if the webhook is
      // late or lost.
      success_url: `${getEnv().NEXT_PUBLIC_APP_URL}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getEnv().NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    },
    { idempotencyKey: idempotency.session },
  );

  if (!session.url) {
    throw new ValidationError('Stripe did not return a checkout URL');
  }
  return { url: session.url };
}

/** The slice of the Stripe SDK reconciliation uses (injectable for tests). */
export interface ReconcileStripeLike {
  checkout: {
    sessions: {
      retrieve(id: string, params: { expand: string[] }): Promise<Stripe.Checkout.Session>;
    };
  };
}

/** A Checkout Session flattened to the fields reconciliation needs. */
export interface ReconcilableSession {
  clientReferenceId: string | null;
  paymentStatus: string | null;
  subscriptionId: string | null;
  subscriptionStatus: Stripe.Subscription.Status | null;
  tier: PlanTier | null;
  stripeCustomerId: string | null;
}

export type ReconcileDecision =
  | { apply: false; reason: 'foreign_session' | 'not_paid' | 'no_subscription' }
  | {
      apply: true;
      data: {
        stripeSubscriptionId: string;
        status: BillingStatus;
        stripeCustomerId: string | null;
        plan: PlanTier | null;
      };
    };

/**
 * Pure decision for reconciling a merchant's billing row from a retrieved
 * Checkout Session. Refuses a session that doesn't belong to the merchant
 * (client_reference_id mismatch), waits when payment isn't captured yet, and
 * otherwise yields the fields to write (mirroring what the webhook would set).
 */
export function reconciliationDecision(
  session: ReconcilableSession,
  merchantId: string,
): ReconcileDecision {
  if (session.clientReferenceId !== merchantId) return { apply: false, reason: 'foreign_session' };
  if (session.paymentStatus !== 'paid') return { apply: false, reason: 'not_paid' };
  if (!session.subscriptionId || !session.subscriptionStatus) {
    return { apply: false, reason: 'no_subscription' };
  }
  return {
    apply: true,
    data: {
      stripeSubscriptionId: session.subscriptionId,
      status: mapStripeStatus(session.subscriptionStatus),
      stripeCustomerId: session.stripeCustomerId,
      plan: session.tier,
    },
  };
}

/**
 * Reconciliation fallback for the success page: pull the Checkout Session from
 * Stripe and, if it belongs to this merchant and payment has completed, apply
 * the resulting subscription state directly — so a merchant isn't stuck on an
 * "activating…" screen if the webhook is late or lost. Idempotent (re-running
 * writes the same state). Returns the decision for logging/tests.
 */
export async function reconcileCheckoutSession(
  merchantId: string,
  sessionId: string,
  stripeClient?: ReconcileStripeLike,
): Promise<ReconcileDecision> {
  const stripe: ReconcileStripeLike = stripeClient ?? getStripe();
  const raw = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });

  const sub =
    typeof raw.subscription === 'object' && raw.subscription !== null ? raw.subscription : null;
  const decision = reconciliationDecision(
    {
      clientReferenceId: raw.client_reference_id,
      paymentStatus: raw.payment_status,
      subscriptionId: sub?.id ?? (typeof raw.subscription === 'string' ? raw.subscription : null),
      subscriptionStatus: sub?.status ?? null,
      tier: (raw.metadata?.tier as PlanTier | undefined) ?? null,
      stripeCustomerId:
        typeof raw.customer === 'string' ? raw.customer : (raw.customer?.id ?? null),
    },
    merchantId,
  );

  if (decision.apply) {
    await prisma.billingSubscription.update({
      where: { merchantId },
      data: {
        status: decision.data.status,
        stripeSubscriptionId: decision.data.stripeSubscriptionId,
        ...(decision.data.stripeCustomerId
          ? { stripeCustomerId: decision.data.stripeCustomerId }
          : {}),
        ...(decision.data.plan ? { plan: decision.data.plan } : {}),
      },
    });
  }
  return decision;
}
