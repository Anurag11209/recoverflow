import { NextResponse } from 'next/server';
import { buildHealth } from '@/lib/health';
import { withErrorHandling } from '@/lib/api';

// Liveness probe: is the process up and serving? No external dependencies.
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(() => {
  return NextResponse.json(buildHealth());
});
