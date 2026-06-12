'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/auth-client';

type Phase = 'idle' | 'confirming' | 'pending' | 'error';

export function RegenerateSecretButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setPhase('pending');
    setError(null);
    const result = await postJson('/api/settings/webhook-secret/regenerate', {});
    if (result.ok) {
      // The page re-reads + decrypts the new secret server-side on refresh.
      router.refresh();
      setPhase('idle');
    } else {
      setError(result.error ?? 'Could not regenerate the secret. Please try again.');
      setPhase('error');
    }
  }

  if (phase === 'confirming') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-700">
          Regenerate the webhook secret? Your current secret stops working immediately, and webhook
          verification will fail until you update the new secret in Razorpay.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={regenerate}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Yes, regenerate
          </button>
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setPhase('confirming')}
        disabled={phase === 'pending'}
        className="self-start rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {phase === 'pending' ? 'Regenerating…' : 'Regenerate secret'}
      </button>
      {phase === 'error' && error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
