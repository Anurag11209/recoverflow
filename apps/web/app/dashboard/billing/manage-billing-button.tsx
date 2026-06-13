'use client';

import { useState } from 'react';

/**
 * Opens the Stripe Billing Portal for the current merchant. Posts to
 * /api/billing/portal (the Step 5 endpoint), then redirects to the returned
 * portal URL. Mirrors SubscribeButton's request/redirect/error handling.
 */
export function ManageBillingButton({ label = 'Manage billing' }: { label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: { message?: string };
      } | null;
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      setError(data?.error?.message ?? 'Could not open billing portal. Please try again.');
      setPending(false);
    } catch {
      setError('Network error. Please try again.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={openPortal}
        disabled={pending}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? 'Opening…' : label}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
