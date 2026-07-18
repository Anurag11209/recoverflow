import { z } from 'zod';

/**
 * Worker runtime configuration. These are worker-only knobs (not part of the
 * shared env schema), read from the environment with sensible defaults so the
 * worker runs out of the box. The shared vars it also needs (DATABASE_URL,
 * APP_BASE_URL, MESSAGING_PROVIDER, ...) are validated separately by getEnv().
 */
const schema = z.object({
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  WORKER_BACKOFF_BASE_MS: z.coerce.number().int().nonnegative().default(1000),
  WORKER_BACKOFF_MAX_MS: z.coerce.number().int().nonnegative().default(300_000),
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
});

export interface WorkerConfig {
  concurrency: number;
  pollIntervalMs: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  shutdownTimeoutMs: number;
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const p = schema.parse(env);
  return {
    concurrency: p.WORKER_CONCURRENCY,
    pollIntervalMs: p.WORKER_POLL_INTERVAL_MS,
    maxAttempts: p.WORKER_MAX_ATTEMPTS,
    backoffBaseMs: p.WORKER_BACKOFF_BASE_MS,
    backoffMaxMs: p.WORKER_BACKOFF_MAX_MS,
    shutdownTimeoutMs: p.WORKER_SHUTDOWN_TIMEOUT_MS,
  };
}
