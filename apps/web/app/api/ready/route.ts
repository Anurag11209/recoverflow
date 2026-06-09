import { NextResponse } from 'next/server';
import { prisma } from '@recoverflow/db';
import { logger } from '@recoverflow/shared';

// Readiness probe: can we actually serve traffic? Verifies the database.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ready', checks: { database: 'up' } });
  } catch (err) {
    logger.error({ err }, 'Readiness check failed: database unreachable');
    return NextResponse.json({ status: 'unready', checks: { database: 'down' } }, { status: 503 });
  }
}
