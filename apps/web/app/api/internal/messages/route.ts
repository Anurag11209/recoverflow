import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { createMessageStore } from '@/lib/messaging/store';

export const dynamic = 'force-dynamic';

// Development-only verification endpoint. 404 in production.
export const GET = withErrorHandling(async () => {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
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
