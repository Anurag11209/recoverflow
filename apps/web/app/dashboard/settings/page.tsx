import { redirect } from 'next/navigation';
import { env } from '@recoverflow/shared';
import { getCurrentSession } from '@/lib/auth/current';
import { decryptSecret } from '@/lib/crypto/secret-cipher';
import { CopyField } from './copy-field';

// Reads the session cookie + decrypts the webhook secret for display, so it
// must run per-request and never be cached.
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const { merchant } = current.user;

  const webhookUrl = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/razorpay/${merchant.webhookToken}`;
  // Decrypt for display only; the stored value stays encrypted at rest.
  const webhookSecret = decryptSecret(merchant.razorpayWebhookSecret);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your account details and the webhook configuration for Razorpay.
        </p>
      </header>

      {/* Profile */}
      <section className="rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900">Business profile</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-gray-500">Business name</dt>
            <dd className="mt-1 text-sm text-gray-900">{merchant.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Email</dt>
            <dd className="mt-1 text-sm text-gray-900">{merchant.email}</dd>
          </div>
        </dl>
      </section>

      {/* Webhook configuration */}
      <section className="rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900">Razorpay webhook</h2>
        <p className="mt-1 text-sm text-gray-500">
          In your Razorpay dashboard, add this URL as a webhook and set the secret below so
          RecoverFlow can verify deliveries.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <CopyField label="Webhook URL" value={webhookUrl} />
          <CopyField label="Webhook secret" value={webhookSecret} secret />
        </div>
      </section>
    </div>
  );
}
