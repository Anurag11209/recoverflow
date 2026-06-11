import { logger } from '@recoverflow/shared';
import type { MessagingProvider, SendMessageInput } from '@recoverflow/recovery-engine';

/**
 * Development MessagingProvider (ADR 0001 adapter). No real WhatsApp call yet —
 * it logs the outbound payload and returns a fake providerMessageId so the full
 * recovery -> message flow is exercisable before the Meta integration (Phase 7).
 */
export function createConsoleMessagingProvider(): MessagingProvider {
  let seq = 0;
  return {
    async sendMessage(input: SendMessageInput): Promise<{ providerMessageId: string }> {
      const providerMessageId = `msg_${++seq}`;
      logger.info(
        {
          event: 'whatsapp_console_send',
          phone: input.phone,
          template: input.template,
          variables: input.variables,
          providerMessageId,
        },
        `[console-whatsapp] -> ${input.phone}: ${input.template}`,
      );
      return { providerMessageId };
    },
  };
}

/** Provider name persisted on the MessageLog (MessageLog.provider). */
export const CONSOLE_PROVIDER_NAME = 'console';
