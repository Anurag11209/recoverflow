import { NextResponse } from 'next/server';
import { UnauthorizedError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { getCurrentSession } from '@/lib/auth/current';
import { getConnectionStatus } from '@/lib/onboarding/detect';
import { createOnboardingStore } from '@/lib/onboarding/store';

export const dynamic = 'force-dynamic';

// Polled by the onboarding page until the merchant's first webhook lands.
// Session-scoped: a merchant can only ever see its own connection status.
export const GET = withErrorHandling(async () => {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();

  const status = await getConnectionStatus(createOnboardingStore(), session.user.merchantId);
  return NextResponse.json(status);
});
