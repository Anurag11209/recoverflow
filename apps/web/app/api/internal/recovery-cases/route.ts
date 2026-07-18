import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { assertInternalApiToken } from '@/lib/auth/internal-token';
import { createRecoveryStore } from '@recoverflow/adapters';

export const dynamic = 'force-dynamic';

// Internal verification endpoint. Protected in every environment by a
// shared-secret bearer token (Authorization: Bearer <INTERNAL_API_TOKEN>).
export const GET = withErrorHandling(async (request: Request) => {
  assertInternalApiToken(request);
  const cases = await createRecoveryStore().listCases();
  return NextResponse.json(cases.map((c) => ({ id: c.id, status: c.status })));
});
