'use client';

import { usePathname } from 'next/navigation';
import { pageTitleFor } from './nav-items';
import { LogoutButton } from '@/app/dashboard/logout-button';

export function DashboardHeader({
  merchantName,
  onOpenMenu,
}: {
  merchantName: string;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const title = pageTitleFor(pathname);

  return (
    <header className="flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="space-y-0.5">
          <p className="text-xs font-medium tracking-tight text-gray-500">{merchantName}</p>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h1>
        </div>
      </div>
      <LogoutButton />
    </header>
  );
}
