import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@recoverflow/db';
import { getCurrentSession } from '@/lib/auth/current';
import { PLANS } from '@/lib/billing/plans';
import { billingView } from '@/lib/billing/summary';

export const dynamic = 'force-dynamic';

/**
 * Post-checkout confirmation (the Stripe success_url target). The subscription
 * is activated asynchronously by the webhook, so the row may still be INCOMPLETE
 * for a moment after the redirect — the copy reflects that rather than asserting
 * an active subscription that hasn't landed yet.
 */
export default async function BillingSuccessPage() {
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
  const isActive = view.state === 'active';

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          {isActive ? "You're all set" : 'Thanks — finishing up'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isActive
            ? 'Your subscription is active.'
            : 'Payment received. Your subscription is being activated — this usually takes a few seconds.'}
        </p>
      </header>

      {view.plan ? (
        <section className="rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-900">
            Plan: <span className="font-medium">{PLANS[view.plan].name}</span>
          </p>
          {view.renewalLabel ? (
            <p className="mt-1 text-xs text-gray-500">{view.renewalLabel}</p>
          ) : null}
        </section>
      ) : null}

      <div className="flex gap-3">
        <Link
          href="/dashboard/billing"
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Go to billing
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
