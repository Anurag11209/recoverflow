import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { RecoveryStatus } from '@recoverflow/db';
import { getCurrentSession } from '@/lib/auth/current';
import { getRecoveryCaseDetail, type TimelineEvent } from '@/lib/dashboard/case-detail';

export const dynamic = 'force-dynamic';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function money(amount: string | null, currency: string | null): string {
  if (amount === null) return '—';
  if (currency === 'INR') return inr.format(Number(amount));
  return `${currency ?? ''} ${amount}`.trim();
}

function dateTime(d: Date | null): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

const STATUS_STYLES: Record<RecoveryStatus, string> = {
  OPEN: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  RECOVERED: 'bg-green-50 text-green-700 ring-green-600/20',
  FAILED: 'bg-red-50 text-red-700 ring-red-600/20',
  CLOSED: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

const DOT_STYLES: Record<TimelineEvent['kind'], string> = {
  case_created: 'bg-gray-400',
  attempt_created: 'bg-blue-500',
  message_sent: 'bg-indigo-500',
  payment_recovered: 'bg-green-500',
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

type Params = Promise<{ token: string }>;

export default async function CaseDetailPage({ params }: { params: Params }) {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const { token } = await params;
  const detail = await getRecoveryCaseDetail(current.user.merchant.id, token);
  if (!detail) {
    notFound();
  }
  const { summary, timeline } = detail;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <Link href="/dashboard/cases" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to cases
        </Link>
        <div className="flex items-center gap-3 pt-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recovery case</h1>
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[summary.status]}`}
          >
            {summary.status.charAt(0) + summary.status.slice(1).toLowerCase()}
          </span>
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-medium text-gray-700">Summary</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="Amount" value={money(summary.amount, summary.currency)} />
          <Field label="Currency" value={summary.currency ?? '—'} />
          <Field label="Failure category" value={summary.failureCategory ?? '—'} />
          <Field label="Failure reason" value={summary.failureReason ?? '—'} />
          <Field label="Customer" value={summary.customerEmail ?? summary.customerPhone ?? '—'} />
          <Field label="Created" value={dateTime(summary.createdAt)} />
          <Field label="Recovered at" value={dateTime(summary.recoveredAt)} />
          <Field
            label="Recovered amount"
            value={money(summary.recoveredAmount, summary.currency)}
          />
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-medium text-gray-700">Timeline</h2>
        <ol className="mt-4 space-y-4">
          {timeline.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1.5 flex flex-col items-center">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT_STYLES[e.kind]}`} />
                {i < timeline.length - 1 ? <span className="mt-1 w-px flex-1 bg-gray-200" /> : null}
              </span>
              <div className="pb-1">
                <p className="text-sm font-medium text-gray-900">{e.label}</p>
                {e.detail ? <p className="text-xs text-gray-500">{e.detail}</p> : null}
                <p className="text-xs text-gray-400">{dateTime(e.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
