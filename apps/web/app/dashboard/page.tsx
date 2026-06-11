import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/current';
import { getDashboardStats } from '@/lib/dashboard/stats';
import { LogoutButton } from './logout-button';

// Reads the session cookie + live stats, so it must run per-request.
export const dynamic = 'force-dynamic';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export default async function DashboardPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const { user } = current;
  const stats = await getDashboardStats(user.merchant.id);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium tracking-tight text-gray-500">{user.merchant.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <LogoutButton />
      </header>

      {/* Hero: the two numbers a merchant actually runs the business on. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Recovery rate</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
            {stats.recoveryRate}%
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {stats.recoveredCases} of {stats.totalCases} cases recovered
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Recovered revenue</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
            {inr.format(Number(stats.recoveredRevenue))}
          </p>
          <p className="mt-1 text-xs text-gray-500">across all recovered cases</p>
        </div>
      </section>

      {/* Secondary counts. */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Failed payments</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{stats.totalFailedPayments}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Recovery cases</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{stats.totalCases}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Open cases</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{stats.openCases}</p>
        </div>
      </section>

      <p className="text-sm text-gray-500">
        Case list and message history arrive in the next modules.
      </p>
    </main>
  );
}
