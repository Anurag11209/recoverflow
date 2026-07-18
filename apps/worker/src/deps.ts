import { getEnv } from '@recoverflow/shared';
import {
  createRecoveryStore,
  createMessageStore,
  createTokenStore,
  createMessagingProvider,
} from '@recoverflow/adapters';
import type {
  Clock,
  MessageStore,
  MessagingProvider,
  RecoveryStore,
  TokenStore,
} from '@recoverflow/recovery-engine';
import type { WorkerConfig } from './config';
import { createWorkerProcessingStore, type WorkerProcessingStore } from './adapters/processing-store';

/**
 * Everything the worker injects into processPaymentEvent (minus the per-event
 * logger, which the loop attaches as a child). Broken out as an object so tests
 * can swap individual pieces (e.g. a throwing recoveryStore) while keeping the
 * real Prisma-backed processing store against the test database.
 */
export interface WorkerServices {
  processingStore: WorkerProcessingStore;
  recoveryStore: RecoveryStore;
  messageStore: MessageStore;
  tokenStore: TokenStore;
  messagingProvider: MessagingProvider;
  messagingProviderName: string;
  clock: Clock;
  buildPaymentUpdateUrl: (rawToken: string) => string;
}

/** Real adapters wired to @recoverflow/db, mirroring apps/web's composition. */
export function createDefaultServices(config: WorkerConfig): WorkerServices {
  return {
    processingStore: createWorkerProcessingStore({
      maxAttempts: config.maxAttempts,
      backoffBaseMs: config.backoffBaseMs,
      backoffMaxMs: config.backoffMaxMs,
    }),
    recoveryStore: createRecoveryStore(),
    messageStore: createMessageStore(),
    tokenStore: createTokenStore(),
    messagingProvider: createMessagingProvider(),
    messagingProviderName: getEnv().MESSAGING_PROVIDER,
    clock: { now: () => new Date() },
    buildPaymentUpdateUrl: (rawToken: string) =>
      `${getEnv().APP_BASE_URL}/update-payment/${rawToken}`,
  };
}
