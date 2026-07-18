import type { MessagingProvider, SendMessageInput } from '@recoverflow/recovery-engine';
import type { EmailClient } from './email/email-types';
import { renderRecoveryEmail } from './email/recovery-email-template';

/** Provider name persisted on MessageLog.provider (mirrors CONSOLE_PROVIDER_NAME). */
export const RESEND_PROVIDER_NAME = 'resend';

/**
 * Real email MessagingProvider (ADR 0001 adapter) backed by Resend. Implements
 * the engine's MessagingProvider port by rendering the recovery template +
 * variables into an email and sending it through the injected EmailClient.
 *
 * The email channel REQUIRES a recipient email: if none is present the provider
 * throws, which the message service catches and records as a FAILED message —
 * it never reports a phantom send. Any EmailClient failure propagates the same
 * way (fail loudly, never fake success).
 */
export function createResendMessagingProvider(emailClient: EmailClient): MessagingProvider {
  return {
    async sendMessage(input: SendMessageInput): Promise<{ providerMessageId: string }> {
      if (!input.email) {
        throw new Error('resend provider: message has no recipient email');
      }
      const { subject, html, text } = renderRecoveryEmail(input.template, input.variables);
      const { id } = await emailClient.sendEmail({ to: input.email, subject, html, text });
      return { providerMessageId: id };
    },
  };
}
