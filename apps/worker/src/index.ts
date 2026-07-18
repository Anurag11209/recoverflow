import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

// Load the repo-root .env for local runs (mirrors apps/web's next.config). No-op
// in production, where Railway injects the environment directly. Resolved from
// this file's location so it works regardless of the process cwd.
const here = dirname(fileURLToPath(import.meta.url)); // apps/worker/src
loadDotenv({ path: resolve(here, '../../../.env') });

const { getEnv, logger } = await import('@recoverflow/shared');
const { loadWorkerConfig } = await import('./config');
const { createDefaultServices } = await import('./deps');
const { createWorker } = await import('./worker');

async function main(): Promise<void> {
  // Fail-fast on the shared required env (DATABASE_URL, APP_ENCRYPTION_KEY,
  // INTERNAL_API_TOKEN, ...) before doing any work.
  getEnv();

  const config = loadWorkerConfig();
  const services = createDefaultServices(config);
  const worker = createWorker({ services, config });

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info({ event: 'signal_received', signal }, 'shutdown signal received');
    worker
      .stop()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error(
          { event: 'shutdown_error', err: err instanceof Error ? err.message : String(err) },
          'error during shutdown',
        );
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  worker.start();
}

await main().catch((err: unknown) => {
  logger.error(
    { event: 'fatal', err: err instanceof Error ? err.message : String(err) },
    'worker failed to start',
  );
  process.exit(1);
});
