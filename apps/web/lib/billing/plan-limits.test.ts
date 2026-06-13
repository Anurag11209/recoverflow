import { describe, expect, it } from 'vitest';
import { ValidationError } from '@recoverflow/shared';
import type { PlanTier } from '@recoverflow/db';
import {
  assertWithinPlanLimit,
  checkPlanLimit,
  effectivePlanFor,
  startOfMonthUTC,
  type PlanLimitStore,
} from './plan-limits';

/** A fake store: a fixed active plan and a fixed failed-payment count. */
function store(activePlan: PlanTier | null, used: number): PlanLimitStore {
  return {
    getActivePlan: async () => activePlan,
    countFailedPaymentsSince: async () => used,
  };
}

const NOW = new Date('2026-06-13T12:00:00Z');

describe('startOfMonthUTC', () => {
  it('returns the first instant of the month in UTC', () => {
    expect(startOfMonthUTC(NOW).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('effectivePlanFor', () => {
  it('uses the active plan when present', () => {
    expect(effectivePlanFor('BUSINESS')).toBe('BUSINESS');
  });
  it('falls back to STARTER when there is no active plan', () => {
    expect(effectivePlanFor(null)).toBe('STARTER');
  });
});

describe('checkPlanLimit — per-plan caps', () => {
  it('Starter: allows up to 500, blocks the 501st', async () => {
    expect((await checkPlanLimit('m', NOW, store('STARTER', 500))).allowed).toBe(true);
    const over = await checkPlanLimit('m', NOW, store('STARTER', 501));
    expect(over.allowed).toBe(false);
    expect(over.limit).toBe(500);
    expect(over.remaining).toBe(0);
  });

  it('Growth: allows up to 2500, blocks beyond', async () => {
    expect((await checkPlanLimit('m', NOW, store('GROWTH', 2500))).allowed).toBe(true);
    expect((await checkPlanLimit('m', NOW, store('GROWTH', 2501))).allowed).toBe(false);
  });

  it('Business: allows up to 10000, blocks beyond', async () => {
    expect((await checkPlanLimit('m', NOW, store('BUSINESS', 10000))).allowed).toBe(true);
    expect((await checkPlanLimit('m', NOW, store('BUSINESS', 10001))).allowed).toBe(false);
  });

  it('Enterprise: unlimited (null limit always allowed)', async () => {
    const r = await checkPlanLimit('m', NOW, store('ENTERPRISE', 999999));
    expect(r.allowed).toBe(true);
    expect(r.limit).toBeNull();
    expect(r.remaining).toBeNull();
  });

  it('reports remaining headroom', async () => {
    const r = await checkPlanLimit('m', NOW, store('GROWTH', 2000));
    expect(r.remaining).toBe(500);
  });
});

describe('checkPlanLimit — plan resolution', () => {
  it('applies the Starter baseline cap when there is no active subscription', async () => {
    // No active plan -> Starter's 500 cap, not unlimited.
    const r = await checkPlanLimit('m', NOW, store(null, 501));
    expect(r.plan).toBe('STARTER');
    expect(r.allowed).toBe(false);
  });
});

describe('assertWithinPlanLimit', () => {
  it('throws a graceful ValidationError when over the cap', async () => {
    await expect(assertWithinPlanLimit('m', NOW, store('STARTER', 501))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('is a no-op when within the cap', async () => {
    await expect(assertWithinPlanLimit('m', NOW, store('STARTER', 500))).resolves.toBeUndefined();
  });
});
