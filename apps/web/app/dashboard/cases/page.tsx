import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RecoveryStatus } from '@recoverflow/db';
import { getCurrentSession } from '@/lib/auth/current';
import { listCases, type CaseListItem } from '@/lib/dashboard/cases';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: { label: string; value?: RecoveryStatus }[] = [
  { label: 'All' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Recovered', value: 'RECOVERED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Closed', value: 'CLOSED' },
];

const VALID_STATUSES: RecoveryStatus[] = ['OPEN', 'RECOVERED', 'FAILED', 'CLOSED'];

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

function age(createdAt: Date): string {
  const ms = Date.now() - createdAt.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_STYLES: Record<RecoveryStatus, string> = {
  OPEN: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  RECOVERED: 'bg-green-50 text-green-700 ring-green-600/20',
  FAILED: 'bg-red-50 text-red-700 ring-red-600/20',
  CLOSED: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

function StatusBadge({ status }: { status: RecoveryStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function hrefWith(status: string | undefined, cursor?: string): string {
  const sp = new URLSearchParams();
  if (status) sp.set('status', status);
  if (cursor) sp.set('cursor', cursor);
  const qs = sp.toString();
  return qs ? `/dashboard/cases?${qs}` : '/dashboard/cases';
}

type SearchParams = Promise<{ status?: string; cursor?: string }>;

export default async function CasesPage({ searchParams }: { searchParams: SearchParams }) {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const { status: statusParam, cursor } = await searchParams;
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as RecoveryStatus)
      ? (statusParam as RecoveryStatus)
      : undefined;

  const { cases, nextCursor } = await listCases(current.user.merchant.id, { status, cursor });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="space-y-1">
        <p className="text-sm font-medium tracking-tight text-gray-500">
          {current.user.merchant.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Recovery cases</h1>
      </header>

      <nav className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = f.value === status;
          return (
            <Link
              key={f.label}
              href={hrefWith(f.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {cases.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500">
          No cases yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {cases.map((c: CaseListItem) => (
            <li key={c.token}>
              <Link
                href={`/dashboard/cases/${c.token}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    <span className="truncate text-sm font-medium text-gray-900">
                      {c.customerEmail ?? c.customerPhone ?? '—'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {c.failureCategory ?? 'Unknown'} · {age(c.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {c.status === 'RECOVERED' && c.recoveredAmount !== null
                      ? money(c.recoveredAmount, c.currency)
                      : money(c.amount, c.currency)}
                  </p>
                  {c.status === 'RECOVERED' && c.recoveredAmount !== null ? (
                    <p className="text-xs text-green-600">recovered</p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <Link
          href={hrefWith(status, nextCursor)}
          className="self-center rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Load more
        </Link>
      ) : null}
    </main>
  );
}
