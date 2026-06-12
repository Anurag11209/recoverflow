import { redirect } from 'next/navigation';
import { getEnv } from '@recoverflow/shared';
import { getCurrentSession } from '@/lib/auth/current';
import { decryptSecret } from '@/lib/crypto/secret-cipher';
import { recentAuditEvents } from '@/lib/settings/audit';
import { CopyField } from './copy-field';
import { RegenerateSecretButton } from './regenerate-button';
import { ProfileNameForm } from './profile-form';

// Reads the session cookie + decrypts the webhook secret for display, so it
// must run per-request and never be cached.
export const dynamic = 'force-dynamic';

const AUDIT_LABELS: Record<string, string> = {
  'profile.updated': 'Profile updated',
  'webhook_secret.regenerated': 'Webhook secret regenerated',
};

const auditTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function auditDetail(action: string, metadata: unknown): string | null {
  if (action === 'profile.updated' && metadata && typeof metadata === 'object') {
    const m = metadata as Record<string, unknown>;
    if (m.field === 'name' && typeof m.to === 'string') {
      return `Name changed to “${m.to}”`;
    }
  }
  return null;
}

export default async function SettingsPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect('/login');
  }
  const { merchant } = current.user;

  const webhookUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/api/webhooks/razorpay/${merchant.webhookToken}`;
  // Decrypt for display only; the stored value stays encrypted at rest.
  const webhookSecret = decryptSecret(merchant.razorpayWebhookSecret);
  const auditEvents = await recentAuditEvents(merchant.id, 10);

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
        <div className="mt-4 flex flex-col gap-4">
          <ProfileNameForm initialName={merchant.name} />
          <div>
            <dt className="text-sm text-gray-500">Email</dt>
            <dd className="mt-1 text-sm text-gray-900">{merchant.email}</dd>
          </div>
        </div>
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
          <div className="border-t border-gray-100 pt-4">
            <RegenerateSecretButton />
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <section className="rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900">Recent activity</h2>
        {auditEvents.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No account changes yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {auditEvents.map((e) => {
              const detail = auditDetail(e.action, e.metadata);
              return (
                <li key={e.id} className="flex flex-col gap-0.5">
                  <span className="text-sm text-gray-900">
                    {AUDIT_LABELS[e.action] ?? e.action}
                  </span>
                  {detail ? <span className="text-xs text-gray-500">{detail}</span> : null}
                  <span className="text-xs text-gray-400">{auditTime.format(e.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
