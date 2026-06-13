import { prisma } from '@recoverflow/db';
import type { BillingStatus, PlanTier } from '@recoverflow/db';
import { ValidationError } from '@recoverflow/shared';
import { PLANS } from './plans';

/**
 * Plan enforcement (M4 Step 7). RecoverFlow's own plans cap how many failed
 * payments a merchant may have RECOVERED per calendar month (Starter 500,
 * Growth 2500, Business 10000, Enterprise unlimited). The cap is metered on
 * `payment.failed` PaymentEvents — the unit a "failed payment" maps to — and is
 * enforced server-side at the composition root (apps/web), never in the
 * recovery engine, which stays billing-agnostic per ADR 0001.
 */

/** The Razorpay event type that represents a failed payment. */
export const FAILED_PAYMENT_EVENT_TYPE = 'payment.failed';

/** Lapsed / never-subscribed merchants fall back to the entry-level cap rather
 * than getting unlimited recovery — onboarding still works, abuse doesn't. */
const BASELINE_TIER: PlanTier = 'STARTER';

/** Subscription states under which the merchant's PURCHASED tier limit applies.
 * PAST_DUE is included: a merchant in the dunning grace window on their own
 * subscription keeps their tier until it actually cancels. */
const ACTIVE_LIMIT_STATUSES: BillingStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

export interface PlanLimitResult {
  /** Whether processing this failed payment is within the merchant's cap. */
  allowed: boolean;
  /** The tier whose limit was applied (the effective, not necessarily purchased, tier). */
  plan: PlanTier;
  /** Monthly cap, or null for unlimited (Enterprise). */
  limit: number | null;
  /** Failed payments counted for the merchant in the current calendar month. */
  used: number;
  /** Remaining headroom this month, or null for unlimited. */
  remaining: number | null;
}

/**
 * The persistence the limit check needs, declared as a port so the logic is
 * unit-testable without a database (same approach as the Razorpay webhook
 * service). createPlanLimitStore() is the Prisma-backed default.
 */
export interface PlanLimitStore {
  /** The merchant's purchased tier while their subscription is live, else null. */
  getActivePlan(merchantId: string): Promise<PlanTier | null>;
  /** Count of failed-payment events for the merchant since `since` (inclusive). */
  countFailedPaymentsSince(merchantId: string, since: Date): Promise<number>;
}

/** First instant of the current calendar month, in UTC, so the window is
 * deterministic regardless of server timezone. */
export function startOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** The tier whose cap applies to a merchant: their active tier, or the baseline. */
export function effectivePlanFor(activePlan: PlanTier | null): PlanTier {
  return activePlan ?? BASELINE_TIER;
}

export function createPlanLimitStore(): PlanLimitStore {
  return {
    async getActivePlan(merchantId) {
      const billing = await prisma.billingSubscription.findUnique({
        where: { merchantId },
        select: { plan: true, status: true },
      });
      if (!billing || !ACTIVE_LIMIT_STATUSES.includes(billing.status)) return null;
      return billing.plan;
    },
    async countFailedPaymentsSince(merchantId, since) {
      return prisma.paymentEvent.count({
        where: {
          merchantId,
          eventType: FAILED_PAYMENT_EVENT_TYPE,
          receivedAt: { gte: since },
        },
      });
    },
  };
}

/**
 * Decide whether a merchant may have another failed payment recovered this
 * month. Merchant-scoped and server-side. The current event is expected to be
 * already persisted, so `used` includes it; the merchant is therefore within
 * cap while `used <= limit` (exactly `limit` recoveries per month).
 */
export async function checkPlanLimit(
  merchantId: string,
  now: Date = new Date(),
  store: PlanLimitStore = createPlanLimitStore(),
): Promise<PlanLimitResult> {
  const plan = effectivePlanFor(await store.getActivePlan(merchantId));
  const limit = PLANS[plan].failedPaymentsPerMonth;
  const used = await store.countFailedPaymentsSince(merchantId, startOfMonthUTC(now));

  if (limit === null) {
    return { allowed: true, plan, limit: null, used, remaining: null };
  }
  return { allowed: used <= limit, plan, limit, used, remaining: Math.max(0, limit - used) };
}

/**
 * Synchronous guard for callers that should reject (rather than silently skip)
 * when the cap is exceeded — e.g. the manual process-event trigger. Throws a
 * ValidationError carrying the plan + limit so the error is graceful and
 * actionable. No-op when within cap.
 */
export async function assertWithinPlanLimit(
  merchantId: string,
  now: Date = new Date(),
  store: PlanLimitStore = createPlanLimitStore(),
): Promise<void> {
  const result = await checkPlanLimit(merchantId, now, store);
  if (!result.allowed) {
    throw new ValidationError(
      `Monthly failed-payment limit reached for the ${PLANS[result.plan].name} plan ` +
        `(${result.limit} per month). Upgrade your plan to recover more.`,
      { code: 'PLAN_LIMIT_EXCEEDED' },
    );
  }
}
