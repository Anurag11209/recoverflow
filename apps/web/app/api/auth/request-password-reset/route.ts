import { NextResponse } from 'next/server';
import { prisma } from '@recoverflow/db';
import { logger, getEnv, ValidationError } from '@recoverflow/shared';
import { createEmailClient } from '@recoverflow/adapters';
import { withErrorHandling } from '@/lib/api';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { assertWithinRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit/guard';
import { requestResetSchema } from '@/lib/auth/reset-validation';
import { requestPasswordReset } from '@/lib/auth/reset-service';
import { createResetTokenStore } from '@/lib/auth/reset-token-store';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);
  // Same tight auth-endpoint bucket (10/min/IP): reset requests send email and
  // are an enumeration/abuse target, so they are rate-limited per IP.
  assertWithinRateLimit('password-reset-request', clientIp(request), RATE_LIMITS.auth);

  const parsed = requestResetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  await requestPasswordReset(
    {
      findUserByEmail: (email) =>
        prisma.user.findUnique({ where: { email }, select: { id: true, email: true } }),
      store: createResetTokenStore(),
      clock: { now: () => new Date() },
      emailClient: createEmailClient(),
      // Server-canonical origin for links in outbound email (same var used for
      // WhatsApp payment-update links).
      buildResetUrl: (token) =>
        `${getEnv().APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`,
      logger,
    },
    parsed.data.email,
  );

  // ENUMERATION-SAFE: always the same 200 response, whether or not the email is
  // registered. The client shows "if an account exists, we've sent a link".
  return NextResponse.json({ ok: true });
});
