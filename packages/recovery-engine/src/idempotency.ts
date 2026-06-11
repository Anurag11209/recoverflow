import type { ProcessingStore } from './types';

/** True when an error is a Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/**
 * Write the permanent idempotency ledger entry for a completed event. Returns
 * 'recorded' on first write, 'already_recorded' if the (provider, eventId)
 * entry already exists. Any other error propagates.
 *
 * Written on SUCCESS (Phase 4 decision): this makes a completed business
 * action exactly-once while leaving FAILED events free to retry.
 */
export async function recordIdempotency(
  store: ProcessingStore,
  args: { provider: string; eventId: string; eventType: string; processingKey: string },
): Promise<'recorded' | 'already_recorded'> {
  try {
    await store.recordIdempotency(args);
    return 'recorded';
  } catch (e) {
    if (isUniqueViolation(e)) return 'already_recorded';
    throw e;
  }
}

/** Stable processing key for an event (provider scoped). */
export function processingKey(provider: string, eventId: string): string {
  return `${provider}:${eventId}`;
}
