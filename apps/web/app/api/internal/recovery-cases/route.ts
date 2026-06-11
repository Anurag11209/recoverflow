import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { createRecoveryStore } from '@/lib/recovery/store';

export const dynamic = 'force-dynamic';

// Development-only verification endpoint. 404 in production.
export const GET = withErrorHandling(async () => {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const cases = await createRecoveryStore().listCases();
  return NextResponse.json(cases.map((c) => ({ id: c.id, status: c.status })));
});
