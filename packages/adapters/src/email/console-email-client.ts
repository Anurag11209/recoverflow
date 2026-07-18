import { logger } from '@recoverflow/shared';
import type { EmailClient, EmailMessage } from './email-types';

/**
 * Development EmailClient: logs the outbound email and returns a fake id so the
 * full email-dependent flows (recovery emails, password reset) are exercisable
 * locally without a Resend account. Kept available via config (MESSAGING_PROVIDER
 * = console) so local dev never sends real mail.
 */
export function createConsoleEmailClient(): EmailClient {
  let seq = 0;
  return {
    async sendEmail(message: EmailMessage): Promise<{ id: string }> {
      const id = `email_console_${++seq}`;
      logger.info(
        { event: 'email_console_send', to: message.to, subject: message.subject, id },
        `[console-email] -> ${message.to}: ${message.subject}`,
      );
      return { id };
    },
  };
}
