import { redirect } from 'next/navigation';
import { getEnv } from '@recoverflow/shared';
import { getCurrentSession } from '@/lib/auth/current';
import { decryptSecret } from '@/lib/crypto/secret-cipher';
import { getConnectionStatus } from '@/lib/onboarding/detect';
import { createOnboardingStore } from '@/lib/onboarding/store';
import { OnboardingGuide } from './onboarding-guide';

// Reads the session + decrypts the webhook secret for display, and computes the
// initial connection status, so it must run per-request and never be cached.
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  const { merchant } = session.user;

  const webhookUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/api/webhooks/razorpay/${merchant.webhookToken}`;
  // Decrypt for display only; the stored value stays encrypted at rest.
  const webhookSecret = decryptSecret(merchant.razorpayWebhookSecret);
  // Seed the client with the current status so a returning, already-connected
  // merchant sees the green state immediately (and never starts polling).
  const initialStatus = await getConnectionStatus(createOnboardingStore(), merchant.id);

  return (
    <OnboardingGuide
      merchantName={merchant.name}
      webhookUrl={webhookUrl}
      webhookSecret={webhookSecret}
      initialStatus={initialStatus}
    />
  );
}
