import { NextResponse } from 'next/server';
import { prisma } from '@recoverflow/db';
import { logger, ValidationError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';
import { assertSameOrigin } from '@/lib/auth/csrf';
import { assertWithinRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit/guard';
import { resetPasswordSchema } from '@/lib/auth/reset-validation';
import { resetPassword } from '@/lib/auth/reset-service';
import { createResetTokenStore } from '@/lib/auth/reset-token-store';
import { invalidateUserSessions } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);
  assertWithinRateLimit('password-reset', clientIp(request), RATE_LIMITS.auth);

  const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const result = await resetPassword(
    {
      store: createResetTokenStore(),
      clock: { now: () => new Date() },
      updatePassword: async (userId, passwordHash) => {
        await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
      },
      invalidateSessions: invalidateUserSessions,
      logger,
    },
    parsed.data.token,
    parsed.data.password,
  );

  if (!result.ok) {
    // Generic message: never reveal whether the token was unknown, expired, or
    // already used.
    throw new ValidationError('This reset link is invalid or has expired. Request a new one.', {
      code: 'INVALID_RESET_TOKEN',
    });
  }

  return NextResponse.json({ ok: true });
});
