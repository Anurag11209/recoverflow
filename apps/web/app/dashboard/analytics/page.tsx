import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/current';
import { getAnalytics } from '@/lib/dashboard/analytics';
import { AnalyticsCharts } from './charts';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const a = await getAnalytics(current.user.merchant.id);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="space-y-1">
        <p className="text-sm font-medium tracking-tight text-gray-500">
          {current.user.merchant.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-gray-500">
          Last {a.windowDays} days · recovery rate {a.recoveryRate}% all-time
        </p>
      </header>

      <AnalyticsCharts
        caseTrend={a.caseTrend}
        revenueTrend={a.revenueTrend}
        categoryBreakdown={a.categoryBreakdown}
        openCases={a.openCases}
        recoveredCases={a.recoveredCases}
      />
    </main>
  );
}
