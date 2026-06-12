import { getEnv, type Env } from '@recoverflow/shared';
import type { PlanTier } from '@recoverflow/db';

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  /** Monthly price in the smallest currency unit (USD cents). null = custom (Enterprise). */
  priceCents: number | null;
  currency: 'usd';
  /** Monthly failed-payment cap. null = unlimited (Enterprise). Enforced in M4-4. */
  failedPaymentsPerMonth: number | null;
  /** Whether the plan can be self-served via Stripe checkout. Enterprise is sales-led. */
  selfServe: boolean;
  features: string[];
  /** Env var holding this plan's Stripe price id (populated in M4-2). null for Enterprise. */
  stripePriceIdEnvKey: keyof Env | null;
}

/**
 * The source of truth for RecoverFlow's own pricing (the merchant's subscription
 * to us — distinct from the dunning domain). Amounts in USD cents. Stripe price
 * ids come from env so the same code runs against test/live Stripe without edits.
 */
export const PLANS: Record<PlanTier, PlanDefinition> = {
  STARTER: {
    tier: 'STARTER',
    name: 'Starter',
    priceCents: 2900,
    currency: 'usd',
    failedPaymentsPerMonth: 500,
    selfServe: true,
    features: [
      'Razorpay integration',
      'WhatsApp recovery',
      'Recovery dashboard',
      'Payment update links',
      'Basic analytics',
    ],
    stripePriceIdEnvKey: 'STRIPE_PRICE_STARTER',
  },
  GROWTH: {
    tier: 'GROWTH',
    name: 'Growth',
    priceCents: 7900,
    currency: 'usd',
    failedPaymentsPerMonth: 2500,
    selfServe: true,
    features: [
      'Everything in Starter',
      'Smart retry engine',
      'Advanced analytics',
      'Priority support',
      'Team members',
    ],
    stripePriceIdEnvKey: 'STRIPE_PRICE_GROWTH',
  },
  BUSINESS: {
    tier: 'BUSINESS',
    name: 'Business',
    priceCents: 19900,
    currency: 'usd',
    failedPaymentsPerMonth: 10000,
    selfServe: true,
    features: [
      'Everything in Growth',
      'API access',
      'Multi-user roles',
      'Custom branding',
      'Dedicated support',
    ],
    stripePriceIdEnvKey: 'STRIPE_PRICE_BUSINESS',
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    name: 'Enterprise',
    priceCents: null,
    currency: 'usd',
    failedPaymentsPerMonth: null,
    selfServe: false,
    features: ['Everything in Business', 'Unlimited volume', 'SLA', 'Custom integrations'],
    stripePriceIdEnvKey: null,
  },
};

/** Display order for pricing UIs. */
export const PLAN_ORDER: PlanTier[] = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'];

export function planFor(tier: PlanTier): PlanDefinition {
  return PLANS[tier];
}

/** The plans a merchant can check out themselves, in display order. */
export function selfServePlans(): PlanDefinition[] {
  return PLAN_ORDER.map((t) => PLANS[t]).filter((p) => p.selfServe);
}

/**
 * The configured Stripe price id for a self-serve plan, or null if the plan is
 * not self-serve or its env var is unset (e.g. before M4-2 wiring).
 */
export function stripePriceIdFor(tier: PlanTier): string | null {
  const key = PLANS[tier].stripePriceIdEnvKey;
  if (!key) return null;
  const value = getEnv()[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Human-readable monthly price, e.g. "$29/mo" or "Custom". */
export function formatPrice(plan: PlanDefinition): string {
  if (plan.priceCents === null) return 'Custom';
  return `$${plan.priceCents / 100}/mo`;
}
