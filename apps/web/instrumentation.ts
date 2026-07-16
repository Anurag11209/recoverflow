/**
 * Next.js runs register() once when a server instance boots, before it serves
 * any request. Calling getEnv() here validates the whole environment at boot, so
 * a missing or malformed required variable (e.g. APP_ENCRYPTION_KEY) crashes the
 * server on start with a clear error — rather than surfacing lazily on the first
 * request (e.g. a webhook) that happens to need it.
 */
export async function register() {
  // Only in the Node.js server runtime, and never during `next build`
  // (build-time env is absent on Railway — see the rationale in
  // packages/shared/src/env.ts for why validation must not run at build). The
  // dynamic import keeps the env module off the build-time import graph here.
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { getEnv } = await import('@recoverflow/shared');
    getEnv();
  }
}
