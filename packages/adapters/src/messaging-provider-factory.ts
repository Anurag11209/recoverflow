import { getEnv } from '@recoverflow/shared';
import type { MessagingProvider } from '@recoverflow/recovery-engine';
import { createConsoleMessagingProvider } from './console-provider';
import { createResendMessagingProvider } from './resend-provider';
import { createEmailClient } from './email/email-client-factory';

/**
 * Select the recovery-message channel from config (MESSAGING_PROVIDER).
 *   console -> logs (local dev / CI) — kept available and the default.
 *   resend  -> real email via Resend.
 *
 * Composition roots (apps/web routes, apps/worker) call this instead of a
 * hard-coded provider, and pass getEnv().MESSAGING_PROVIDER as the persisted
 * provider name so MessageLog.provider matches the channel actually used.
 */
export function createMessagingProvider(): MessagingProvider {
  if (getEnv().MESSAGING_PROVIDER === 'resend') {
    return createResendMessagingProvider(createEmailClient());
  }
  return createConsoleMessagingProvider();
}
