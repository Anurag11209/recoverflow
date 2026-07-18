import { getEnv } from '@recoverflow/shared';
import type { EmailClient } from './email-types';
import { createConsoleEmailClient } from './console-email-client';
import { createResendEmailClient } from './resend-client';

/**
 * Select the email backend from config (single knob: MESSAGING_PROVIDER).
 *   console -> logs (local dev / CI)
 *   resend  -> real Resend HTTP client
 *
 * Both the recovery-message email provider AND the password-reset flow build
 * their client here, so they share one configured email capability. When
 * MESSAGING_PROVIDER=resend the env schema guarantees RESEND_API_KEY + EMAIL_FROM
 * are present; we re-check and fail loudly rather than send from an empty
 * identity if that invariant is ever bypassed (e.g. SKIP_ENV_VALIDATION).
 */
export function createEmailClient(): EmailClient {
  const env = getEnv();
  if (env.MESSAGING_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      throw new Error('resend email provider selected but RESEND_API_KEY / EMAIL_FROM are not set');
    }
    return createResendEmailClient({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  return createConsoleEmailClient();
}
