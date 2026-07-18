/**
 * @recoverflow/adapters
 *
 * Prisma-backed implementations of the recovery-engine ports (ADR 0001). The
 * engine defines the ports (ProcessingStore, RecoveryStore, MessageStore,
 * TokenStore, MessagingProvider); this package provides the concrete adapters
 * over @recoverflow/db. Composition roots (apps/web, apps/worker) inject them.
 *
 * These adapters are shared verbatim by both apps. The worker additionally
 * defines its own retry/backoff-aware ProcessingStore (DONE/DEAD/nextAttemptAt);
 * everything else it needs lives here.
 */
export { createProcessingStore } from './processing-store';
export { createRecoveryStore } from './recovery-store';
export { createMessageStore } from './message-store';
export { createTokenStore } from './token-store';
export { createConsoleMessagingProvider, CONSOLE_PROVIDER_NAME } from './console-provider';
export { createResendMessagingProvider, RESEND_PROVIDER_NAME } from './resend-provider';
export { createMessagingProvider } from './messaging-provider-factory';

// Email capability (recovery emails + password reset).
export type { EmailClient, EmailMessage } from './email/email-types';
export { createResendEmailClient, type ResendClientConfig } from './email/resend-client';
export { createConsoleEmailClient } from './email/console-email-client';
export { createEmailClient } from './email/email-client-factory';
export { renderRecoveryEmail, type RenderedEmail } from './email/recovery-email-template';
