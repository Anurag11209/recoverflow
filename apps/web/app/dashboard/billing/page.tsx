import { redirect } from 'next/navigation';
import { prisma } from '@recoverflow/db';
import { getCurrentSession } from '@/lib/auth/current';
import { PLANS, PLAN_ORDER, formatPrice } from '@/lib/billing/plans';
import { billingView } from '@/lib/billing/summary';
import { SubscribeButton } from './subscribe-button';
import { ManageBillingButton } from './manage-billing-button';

export const dynamic = 'force-dynamic';

/** Tailwind classes for the status badge, keyed by the coarse billing state. */
const STATE_BADGE: Record<string, string> = {
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  past_due: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  canceled: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  none: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

export default async function BillingPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const billing = await prisma.billingSubscription.findUnique({
    where: { merchantId: current.user.merchant.id },
    select: {
      plan: true,
      status: true,
      stripeCustomerId: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });
  const view = billingView(billing);
  // The plan grid highlights the active plan only while the subscription is live.
  const activePlan = view.state === 'active' ? view.plan : null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">Choose the plan that fits your volume.</p>
      </header>

      {view.state === 'none' ? (
        <section className="rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-600">
            You don&apos;t have an active subscription. Choose a plan below to get started.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-lg border border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {view.plan ? PLANS[view.plan].name : 'Subscription'}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATE_BADGE[view.state]}`}
              >
                {view.statusLabel}
              </span>
            </div>
            {view.renewalLabel ? (
              <p className="text-xs text-gray-500">{view.renewalLabel}</p>
            ) : null}
            {view.state === 'past_due' ? (
              <p className="text-xs text-amber-700">
                Your last payment failed. Update your payment method to keep your subscription
                active.
              </p>
            ) : null}
            {view.state === 'canceled' ? (
              <p className="text-xs text-gray-500">
                Your subscription has been canceled. Re-subscribe below at any time.
              </p>
            ) : null}
          </div>
          {view.canManageBilling ? <ManageBillingButton /> : null}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          const isCurrent = activePlan === tier;
          return (
            <div key={tier} className="flex flex-col rounded-lg border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900">{plan.name}</h2>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
                {formatPrice(plan)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {plan.failedPaymentsPerMonth === null
                  ? 'Unlimited failed payments'
                  : `Up to ${plan.failedPaymentsPerMonth.toLocaleString()} failed payments/mo`}
              </p>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {plan.features.map((f) => (
                  <li key={f} className="text-xs text-gray-600">
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <p className="text-center text-sm font-medium text-gray-500">Current plan</p>
                ) : plan.selfServe ? (
                  <SubscribeButton tier={tier} label={`Choose ${plan.name}`} />
                ) : (
                  <a
                    href="mailto:sales@recoverflow.com?subject=Enterprise%20plan"
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Contact us
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
