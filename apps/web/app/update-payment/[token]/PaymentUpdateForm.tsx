'use client';

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'recovered' | 'unavailable';

export function PaymentUpdateForm({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>('idle');

  async function onConfirm() {
    setStatus('submitting');
    try {
      const res = await fetch(`/api/payment-update/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const data = (await res.json().catch(() => null)) as { recovered?: boolean } | null;
      setStatus(data?.recovered ? 'recovered' : 'unavailable');
    } catch {
      setStatus('unavailable');
    }
  }

  if (status === 'recovered') {
    return (
      <div
        className="rounded-xl border border-green-200 bg-green-50 px-5 py-6 text-center"
        role="status"
      >
        <p className="text-base font-semibold tracking-tight text-green-800">Payment restored</p>
        <p className="mt-1 text-sm leading-relaxed text-green-700">
          You&apos;re all set. A confirmation is on its way to your WhatsApp.
        </p>
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div
        className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-6 text-center"
        role="status"
      >
        <p className="text-base font-semibold tracking-tight text-gray-800">
          This link is no longer available
        </p>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          Reply to the message you received and we&apos;ll send a new link.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={status === 'submitting'}
      className="w-full rounded-md bg-gray-900 px-3 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
    >
      {status === 'submitting' ? 'Restoring payment…' : 'Update payment method'}
    </button>
  );
}
