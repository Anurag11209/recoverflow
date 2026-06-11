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
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-500">
        Last {a.windowDays} days · recovery rate {a.recoveryRate}% all-time
      </p>

      <AnalyticsCharts
        caseTrend={a.caseTrend}
        revenueTrend={a.revenueTrend}
        categoryBreakdown={a.categoryBreakdown}
        openCases={a.openCases}
        recoveredCases={a.recoveredCases}
      />
    </div>
  );
}
