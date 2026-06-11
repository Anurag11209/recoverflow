'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { DashboardHeader } from './header';

export function DashboardShell({
  merchantName,
  children,
}: {
  merchantName: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 px-4 py-6 lg:block">
        <div className="px-3 pb-6">
          <span className="text-base font-semibold tracking-tight text-gray-900">RecoverFlow</span>
        </div>
        <Sidebar />
      </aside>

      {/* Mobile slide-over */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-gray-900/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white px-4 py-6 shadow-xl">
            <div className="flex items-center justify-between px-3 pb-6">
              <span className="text-base font-semibold tracking-tight text-gray-900">
                RecoverFlow
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-md p-1 text-gray-600 hover:bg-gray-100"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader merchantName={merchantName} onOpenMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
