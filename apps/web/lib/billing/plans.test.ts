import { describe, expect, it } from 'vitest';
import { PLANS, PLAN_ORDER, planFor, selfServePlans, stripePriceIdFor, formatPrice } from './plans';

describe('plan definitions', () => {
  it('defines all four tiers with the agreed pricing', () => {
    expect(PLANS.STARTER.priceCents).toBe(2900);
    expect(PLANS.GROWTH.priceCents).toBe(7900);
    expect(PLANS.BUSINESS.priceCents).toBe(19900);
    expect(PLANS.ENTERPRISE.priceCents).toBeNull();
  });

  it('sets the failed-payment caps, with Enterprise unlimited', () => {
    expect(PLANS.STARTER.failedPaymentsPerMonth).toBe(500);
    expect(PLANS.GROWTH.failedPaymentsPerMonth).toBe(2500);
    expect(PLANS.BUSINESS.failedPaymentsPerMonth).toBe(10000);
    expect(PLANS.ENTERPRISE.failedPaymentsPerMonth).toBeNull();
  });

  it('marks only the first three tiers self-serve', () => {
    expect(PLANS.STARTER.selfServe).toBe(true);
    expect(PLANS.GROWTH.selfServe).toBe(true);
    expect(PLANS.BUSINESS.selfServe).toBe(true);
    expect(PLANS.ENTERPRISE.selfServe).toBe(false);
  });

  it('every key matches its tier (no copy/paste drift)', () => {
    for (const tier of PLAN_ORDER) {
      expect(PLANS[tier].tier).toBe(tier);
    }
  });
});

describe('planFor', () => {
  it('returns the definition for a tier', () => {
    expect(planFor('GROWTH').name).toBe('Growth');
  });
});

describe('selfServePlans', () => {
  it('returns exactly the three checkout-able plans, in order', () => {
    expect(selfServePlans().map((p) => p.tier)).toEqual(['STARTER', 'GROWTH', 'BUSINESS']);
  });
});

describe('stripePriceIdFor', () => {
  it('returns null for Enterprise (no price id)', () => {
    expect(stripePriceIdFor('ENTERPRISE')).toBeNull();
  });

  it('returns null when the env var is unset (pre-M4-2 wiring)', () => {
    // STRIPE_PRICE_* are unset in the unit env, so this is null until M4-2.
    expect(stripePriceIdFor('STARTER')).toBeNull();
  });
});

describe('formatPrice', () => {
  it('formats a cents price as dollars per month', () => {
    expect(formatPrice(PLANS.STARTER)).toBe('$29/mo');
    expect(formatPrice(PLANS.BUSINESS)).toBe('$199/mo');
  });

  it('shows Custom for a null price', () => {
    expect(formatPrice(PLANS.ENTERPRISE)).toBe('Custom');
  });
});
