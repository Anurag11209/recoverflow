import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/current';
import { LogoutButton } from './logout-button';

// Reads the session cookie, so it must run per-request.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const { user } = current;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium tracking-tight text-gray-500">{user.merchant.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <LogoutButton />
      </header>

      <section className="rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-medium text-gray-700">Signed in as</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between sm:block">
            <dt className="text-gray-500">Name</dt>
            <dd className="font-medium text-gray-900">{user.name}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-gray-500">Email</dt>
            <dd className="font-medium text-gray-900">{user.email}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-gray-500">Role</dt>
            <dd className="font-medium text-gray-900">{user.role}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-gray-500">Organization</dt>
            <dd className="font-medium text-gray-900">{user.merchant.name}</dd>
          </div>
        </dl>
      </section>

      <p className="text-sm text-gray-500">
        Recovery cases and payment connectors arrive in the next phases.
      </p>
    </main>
  );
}
