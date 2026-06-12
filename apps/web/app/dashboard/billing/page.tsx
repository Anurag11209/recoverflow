import { redirect } from 'next/navigation';
import { prisma } from '@recoverflow/db';
import { getCurrentSession } from '@/lib/auth/current';
import { PLANS, PLAN_ORDER, formatPrice } from '@/lib/billing/plans';
import { SubscribeButton } from './subscribe-button';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const billing = await prisma.billingSubscription.findUnique({
    where: { merchantId: current.user.merchant.id },
    select: { plan: true, status: true },
  });
  const currentPlan = billing?.plan ?? null;
  const currentStatus = billing?.status ?? null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">Choose the plan that fits your volume.</p>
        {currentPlan && currentStatus === 'ACTIVE' ? (
          <p className="mt-2 text-sm text-gray-900">
            Current plan: <span className="font-medium">{PLANS[currentPlan].name}</span>
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          const isCurrent = currentPlan === tier && currentStatus === 'ACTIVE';
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
