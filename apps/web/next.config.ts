import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';
// Single source of truth: load the repo-root .env into process.env so the env
// validator, Prisma client, and route handlers all see the same variables.
// Next only auto-loads .env from the app directory; in a monorepo we point it
// at the root. Production-safe: if the file is absent, dotenv is a no-op and the
// real injected environment variables are used.
loadEnv({ path: resolve(process.cwd(), '../../.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@recoverflow/db', '@recoverflow/shared', '@recoverflow/recovery-engine'],
  // Keep native/worker-using packages out of the server bundle.
  serverExternalPackages: ['@prisma/client', 'pino', 'pino-pretty', '@node-rs/argon2'],
  outputFileTracingRoot: resolve(process.cwd(), '../../'),
};

export default nextConfig;
