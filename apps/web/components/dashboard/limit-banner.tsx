import Link from 'next/link';
import type { UsageMeter } from '@/lib/billing/usage';

/**
 * In-app banner shown when the merchant is over their plan cap for the current
 * period — i.e. new failed-payment events are being dropped. Derived live from
 * usage, so it clears automatically when the period resets or the plan upgrades.
 * Renders nothing when within the cap.
 */
export function PlanLimitBanner({ meter }: { meter: UsageMeter }) {
  if (!meter.exceeded) return null;

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4" role="alert">
      <p className="text-sm font-semibold text-red-900">
        You’ve hit your {meter.planName} plan limit for {meter.periodLabel}
      </p>
      <p className="mt-1 text-sm text-red-800">
        You’ve used {meter.used.toLocaleString()} of {(meter.limit ?? 0).toLocaleString()}{' '}
        failed-payment events. New failed payments beyond the limit are not being recovered until
        the period resets or you upgrade.
      </p>
      <Link
        href="/dashboard/billing"
        className="mt-3 inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        Upgrade plan
      </Link>
    </div>
  );
}
