import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { assertInternalApiToken } from '@/lib/auth/internal-token';
import { createMessageStore } from '@recoverflow/adapters';

export const dynamic = 'force-dynamic';

// Internal verification endpoint. Protected in every environment by a
// shared-secret bearer token (Authorization: Bearer <INTERNAL_API_TOKEN>).
export const GET = withErrorHandling(async (request: Request) => {
  assertInternalApiToken(request);
  const messages = await createMessageStore().listMessages();
  return NextResponse.json(
    messages.map((m) => ({
      id: m.id,
      recoveryAttemptId: m.recoveryAttemptId,
      template: m.templateName,
      status: m.status,
      providerMessageId: m.providerMessageId,
    })),
  );
});
