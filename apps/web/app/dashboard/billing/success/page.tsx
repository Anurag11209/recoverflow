import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@recoverflow/db';
import { logger } from '@recoverflow/shared';
import { getCurrentSession } from '@/lib/auth/current';
import { PLANS } from '@/lib/billing/plans';
import { billingView } from '@/lib/billing/summary';
import { reconcileCheckoutSession } from '@/lib/billing/checkout';

export const dynamic = 'force-dynamic';

const BILLING_SELECT = {
  plan: true,
  status: true,
  stripeCustomerId: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
} as const;

/**
 * Post-checkout confirmation (the Stripe success_url target). The subscription
 * is normally activated by the webhook, but if that is late or lost the row may
 * still be INCOMPLETE — so when Stripe hands us the {CHECKOUT_SESSION_ID} we
 * reconcile directly from the session as a fallback before rendering.
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const merchantId = current.user.merchant.id;
  const { session_id: sessionId } = await searchParams;

  let billing = await prisma.billingSubscription.findUnique({
    where: { merchantId },
    select: BILLING_SELECT,
  });

  // Fallback: not active yet but we have the Checkout Session id -> the webhook
  // may be late/lost, so reconcile directly from Stripe. Best-effort; a failure
  // just leaves the "activating…" copy and the webhook catches up.
  if (sessionId && billingView(billing).state !== 'active') {
    try {
      await reconcileCheckoutSession(merchantId, sessionId);
      billing = await prisma.billingSubscription.findUnique({
        where: { merchantId },
        select: BILLING_SELECT,
      });
    } catch (err) {
      logger.error(
        {
          event: 'billing_success_reconcile_failed',
          merchantId,
          err: err instanceof Error ? err.message : String(err),
        },
        'checkout success reconciliation failed; webhook will catch up',
      );
    }
  }

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
