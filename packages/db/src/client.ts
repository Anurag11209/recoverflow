import { PrismaClient } from './generated/client';

// This module is imported by every route, so it must not read the validated env
// at module scope (that would run during `next build` page-data collection, where
// build-time env is absent). Prisma reads DATABASE_URL from process.env via the
// schema's datasource (url = env("DATABASE_URL")), so no explicit override is
// needed. NODE_ENV is low-stakes and read directly from process.env.
const isDevelopment = (process.env.NODE_ENV ?? 'development') === 'development';

// Reuse one PrismaClient across hot reloads in development so we don't exhaust
// database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
