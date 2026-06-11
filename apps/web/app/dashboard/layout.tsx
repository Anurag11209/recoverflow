import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/current';
import { DashboardShell } from '@/components/dashboard/shell';

// Auth gate for every /dashboard/* route. getCurrentSession is React.cache()'d,
// so this call and any page's call share one DB hit per request.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  return <DashboardShell merchantName={current.user.merchant.name}>{children}</DashboardShell>;
}
