'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CopyField } from '@/app/dashboard/settings/copy-field';
import type { ConnectionStatus } from '@/lib/onboarding/detect';

// How often to poll for the first webhook while still pending. Fast enough to
// feel live during setup, slow enough to be cheap.
const POLL_INTERVAL_MS = 4000;

export function OnboardingGuide({
  merchantName,
  webhookUrl,
  webhookSecret,
  initialStatus,
}: {
  merchantName: string;
  webhookUrl: string;
  webhookSecret: string;
  initialStatus: ConnectionStatus;
}) {
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus);
  const connected = status.connected;
  const firstEventType = status.connected ? status.firstEvent.eventType : null;

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as ConnectionStatus;
      setStatus(data);
    } catch {
      // Transient network error — keep polling on the next tick.
    }
  }, []);

  useEffect(() => {
    if (connected) return; // stop polling once connected
    const id = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [connected, poll]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-sm font-medium tracking-tight text-gray-500">RecoverFlow</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
          Connect Razorpay
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Welcome{merchantName ? `, ${merchantName}` : ''}. Add the webhook below to your Razorpay
          dashboard so RecoverFlow can detect failed payments and start recovering them.
        </p>
      </header>

      {connected ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4" role="status">
          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-sm text-white"
              aria-hidden
            >
              ✓
            </span>
            <p className="text-sm font-semibold text-green-900">Connected</p>
          </div>
          <p className="mt-2 text-sm text-green-800">
            We received your first webhook{firstEventType ? ` (${firstEventType})` : ''}. Razorpay
            is talking to RecoverFlow — you&rsquo;re all set.
          </p>
          <Link
            href="/dashboard"
            className="mt-3 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Go to dashboard
          </Link>
        </div>
      ) : (
        <div
          className="rounded-lg border border-gray-200 bg-gray-50 p-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" aria-hidden />
            <p className="text-sm font-medium text-gray-700">Waiting for your first event…</p>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            This page updates automatically. As soon as Razorpay delivers an event to the URL below,
            it turns green — no need to refresh.
          </p>
        </div>
      )}

      <ol className="flex flex-col gap-6">
        <li className="flex flex-col gap-3">
          <StepHeading n={1} title="Copy your webhook URL" />
          <CopyField label="Webhook URL" value={webhookUrl} />
        </li>

        <li className="flex flex-col gap-3">
          <StepHeading n={2} title="Copy your webhook secret" />
          <CopyField label="Webhook secret" value={webhookSecret} secret />
        </li>

        <li className="flex flex-col gap-2">
          <StepHeading n={3} title="Add the webhook in Razorpay" />
          <div className="text-sm text-gray-600">
            <p>
              In your Razorpay Dashboard, open{' '}
              <strong>Settings → Webhooks → Add New Webhook</strong>, then:
            </p>
            <ul className="mt-2 list-disc pl-6 [&_li]:mt-1">
              <li>
                Paste the <strong>Webhook URL</strong> from step 1.
              </li>
              <li>
                Paste the <strong>Webhook secret</strong> from step 2 into the Secret field.
              </li>
              <li>
                Under <strong>Active Events</strong>, enable at least{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
                  payment.failed
                </code>{' '}
                (optionally also payment.captured, subscription.charged, subscription.cancelled).
              </li>
              <li>Save the webhook.</li>
            </ul>
          </div>
        </li>

        <li className="flex flex-col gap-2">
          <StepHeading n={4} title="Trigger a test event" />
          <p className="text-sm text-gray-600">
            Use Razorpay&rsquo;s <strong>Send test webhook</strong> option, or wait for a real
            failed payment. When the first event arrives, the banner above turns green.
          </p>
        </li>
      </ol>

      <p className="text-sm text-gray-400">
        You can find these values again anytime under{' '}
        <Link
          href="/dashboard/settings"
          className="underline underline-offset-4 hover:text-gray-600"
        >
          Settings
        </Link>
        .
      </p>
    </main>
  );
}

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
        {n}
      </span>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
    </div>
  );
}
