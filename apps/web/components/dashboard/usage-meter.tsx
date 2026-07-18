import type { UsageMeter } from '@/lib/billing/usage';

/**
 * Usage meter: failed-payment events consumed vs the plan cap for the current
 * period. Server-rendered from getUsageMeter (no client state). The bar turns
 * amber near the cap and red once over it.
 */
export function UsageMeterCard({ meter }: { meter: UsageMeter }) {
  return (
    <div className="rounded-lg border border-gray-200 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-gray-500">Usage this period</p>
        <p className="text-xs text-gray-400">
          {meter.periodLabel} · {meter.planName}
        </p>
      </div>

      {meter.limit === null ? (
        <div className="mt-2">
          <p className="text-2xl font-semibold tracking-tight text-gray-900">
            {meter.used.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            failed-payment events · unlimited on {meter.planName}
          </p>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-2xl font-semibold tracking-tight text-gray-900">
            {meter.used.toLocaleString()}{' '}
            <span className="text-base font-normal text-gray-400">
              / {meter.limit.toLocaleString()}
            </span>
          </p>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-valuenow={meter.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Plan usage"
          >
            <div
              className={`h-full rounded-full ${
                meter.exceeded ? 'bg-red-500' : meter.percent >= 80 ? 'bg-amber-500' : 'bg-gray-900'
              }`}
              style={{ width: `${meter.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {meter.exceeded
              ? `Over limit — new failed payments beyond ${meter.limit.toLocaleString()} aren’t recovered this period.`
              : `${(meter.remaining ?? 0).toLocaleString()} events remaining this period`}
          </p>
        </div>
      )}
    </div>
  );
}
