import type { EmailClient } from '@recoverflow/adapters';
import { hashPassword } from './password';
import {
  issueResetToken,
  consumeResetToken,
  type ResetTokenClock,
  type ResetTokenStore,
} from './reset-token';
import { buildResetEmail } from './reset-email';

/**
 * Password-reset orchestration, fully injectable (no prisma / env imports) so the
 * enumeration-safety and consume behavior are unit-testable with fakes. The route
 * handlers build the real deps (prisma-backed store + user lookup, the configured
 * EmailClient) and own the uniform HTTP response.
 */
interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

export interface RequestPasswordResetDeps {
  findUserByEmail(email: string): Promise<{ id: string; email: string } | null>;
  store: ResetTokenStore;
  clock: ResetTokenClock;
  emailClient: EmailClient;
  buildResetUrl(signedToken: string): string;
  ttlMinutes?: number;
  logger: Logger;
}

/**
 * Request a password reset. ENUMERATION-SAFE: it returns void identically whether
 * or not the email maps to an account, and never throws — so neither the caller
 * nor response timing/shape can reveal account existence. A token is issued and
 * an email sent ONLY for a real account; for an unknown email it is a logged
 * no-op. A failure while sending to a real account is swallowed (logged) so it
 * cannot become an oracle either.
 */
export async function requestPasswordReset(
  deps: RequestPasswordResetDeps,
  email: string,
): Promise<void> {
  const user = await deps.findUserByEmail(email);
  if (!user) {
    deps.logger.info(
      { event: 'password_reset_requested', outcome: 'no_account' },
      'password reset requested for unknown email; no email sent',
    );
    return;
  }

  try {
    const { signedToken } = await issueResetToken(
      { store: deps.store, clock: deps.clock, ttlMinutes: deps.ttlMinutes },
      user.id,
    );
    const { subject, html, text } = buildResetEmail(deps.buildResetUrl(signedToken));
    await deps.emailClient.sendEmail({ to: user.email, subject, html, text });
    deps.logger.info(
      { event: 'password_reset_requested', outcome: 'sent', userId: user.id },
      'password reset email sent',
    );
  } catch (err) {
    // Must not surface: the unknown-email path cannot fail, so this one mustn't
    // either (else a send error leaks that the account exists).
    deps.logger.error(
      { event: 'password_reset_send_failed', userId: user.id, err: String(err) },
      'password reset email failed to send',
    );
  }
}

export interface ResetPasswordDeps {
  store: ResetTokenStore;
  clock: ResetTokenClock;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  invalidateSessions(userId: string): Promise<void>;
  logger: Logger;
}

export type ResetPasswordResult = { ok: true } | { ok: false };

/**
 * Complete a password reset: consume the token (single-use, expiry, signature),
 * hash + store the new password, then invalidate all of the user's sessions so a
 * stolen session cannot outlive the reset. Returns { ok: false } for any invalid
 * token without revealing why.
 */
export async function resetPassword(
  deps: ResetPasswordDeps,
  signedToken: string,
  newPassword: string,
): Promise<ResetPasswordResult> {
  const consumed = await consumeResetToken({ store: deps.store, clock: deps.clock }, signedToken);
  if (!consumed.valid) return { ok: false };

  const passwordHash = await hashPassword(newPassword);
  await deps.updatePassword(consumed.userId, passwordHash);
  await deps.invalidateSessions(consumed.userId);

  deps.logger.info(
    { event: 'password_reset_completed', userId: consumed.userId },
    'password reset completed; sessions invalidated',
  );
  return { ok: true };
}
