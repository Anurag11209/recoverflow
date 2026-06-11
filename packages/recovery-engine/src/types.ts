/**
 * Recovery-engine domain ports (ADR 0001).
 *
 * The engine depends only on @recoverflow/shared. It does NOT import Prisma or
 * @recoverflow/db; instead it declares the persistence interfaces it needs
 * here, and apps/web injects a real (Prisma-backed) implementation. The engine
 * therefore stays unit-testable with an in-memory fake and could be extracted
 * into a standalone worker without changing its imports.
 */

// Mirrors the DB's ProcessingStatus enum structurally. Declared locally so the
// engine is not coupled to the generated Prisma enum; apps/web maps between the
// two (they share identical members).
export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export const RAZORPAY_PROVIDER = 'razorpay';

/** A PaymentEvent as the engine needs to see it (provider-agnostic slice). */
export interface LoadedEvent {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: unknown;
}

/** Outcome of attempting to claim an event for processing. */
export type ClaimResult =
  | { claimed: true; attempts: number }
  | { claimed: false; reason: 'already_processing' | 'already_succeeded' | 'not_found' };

/** Final outcome of processPaymentEvent. */
export type ProcessOutcome =
  | { status: 'SUCCESS'; eventType: string }
  | { status: 'FAILED'; eventType: string; error: string }
  | { status: 'SKIPPED'; reason: string };

/**
 * Persistence port. apps/web implements this with Prisma; tests implement it
 * in memory. All methods are concurrency-safe by virtue of the DB semantics
 * the real adapter uses (conditional updateMany, unique constraints).
 */
export interface ProcessingStore {
  /** Load the event + its current processing status, or null if absent. */
  loadEvent(paymentEventId: string): Promise<LoadedEvent | null>;

  /**
   * Atomically claim the event for processing. Implementation transitions
   * status PENDING|FAILED -> PROCESSING for exactly this paymentEventId,
   * incrementing attempts, and reports how many rows changed (1 = claimed,
   * 0 = someone else holds it or it already succeeded). Returns the post-claim
   * attempts count when claimed.
   */
  claimEvent(paymentEventId: string): Promise<ClaimResult>;

  /** Mark the event's processing SUCCESS (terminal). */
  markSuccess(paymentEventId: string): Promise<void>;

  /** Mark the event's processing FAILED, storing the error (retryable). */
  markFailed(paymentEventId: string, error: string): Promise<void>;

  /**
   * Write the permanent exactly-once ledger entry. Throws a P2002-shaped error
   * if one already exists for (provider, eventId).
   */
  recordIdempotency(args: {
    provider: string;
    eventId: string;
    eventType: string;
    processingKey: string;
  }): Promise<void>;
}
