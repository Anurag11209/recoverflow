import type { PlanTier } from '@recoverflow/db';
import { PLANS } from './plans';
import { checkPlanLimit, startOfMonthUTC } from './plan-limits';

export interface UsageMeter {
  plan: PlanTier;
  planName: string;
  /** Failed-payment events counted this period. */
  used: number;
  /** Monthly cap, or null for unlimited (Enterprise). */
  limit: number | null;
  /** Remaining headroom, or null for unlimited. */
  remaining: number | null;
  /** Fraction of the cap used, 0..100 (0 for unlimited). */
  percent: number;
  /** True once usage is over the cap (i.e. events are being dropped). */
  exceeded: boolean;
  /** True for an unlimited (Enterprise) plan. */
  unlimited: boolean;
  /** Human label for the current period, e.g. "July 2026". */
  periodLabel: string;
}

export type UsageMeterMath = Pick<
  UsageMeter,
  'used' | 'limit' | 'remaining' | 'percent' | 'exceeded' | 'unlimited'
>;

/**
 * Pure meter math: turn a used-count and a cap into the numbers the UI renders.
 * Separated from the DB query so it is trivially unit-testable.
 *  - unlimited (limit null): percent 0, never exceeded, no remaining.
 *  - limit 0 (defensive): 100% and exceeded once used > 0.
 *  - percent is clamped to [0, 100] and rounded.
 */
export function computeUsageMeter(used: number, limit: number | null): UsageMeterMath {
  if (limit === null) {
    return { used, limit: null, remaining: null, percent: 0, exceeded: false, unlimited: true };
  }
  const remaining = Math.max(0, limit - used);
  const percent = limit <= 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return { used, limit, remaining, percent, exceeded: used > limit, unlimited: false };
}

const monthFmt = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "July 2026" for the UTC month containing `now` (matches the enforcement window). */
export function periodLabel(now: Date): string {
  return monthFmt.format(startOfMonthUTC(now));
}

/**
 * The merchant's current-period usage meter. Reuses the same count + plan
 * resolution as enforcement (checkPlanLimit) so the meter can never disagree
 * with what the ingestion path actually enforces.
 */
export async function getUsageMeter(
  merchantId: string,
  now: Date = new Date(),
): Promise<UsageMeter> {
  const r = await checkPlanLimit(merchantId, now);
  return {
    plan: r.plan,
    planName: PLANS[r.plan].name,
    periodLabel: periodLabel(now),
    ...computeUsageMeter(r.used, r.limit),
  };
}
