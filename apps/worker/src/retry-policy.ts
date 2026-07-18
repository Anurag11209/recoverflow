/**
 * Pure retry/backoff policy for the worker. No I/O — unit-testable in isolation.
 */

export interface RetryPolicy {
  /** Max processing attempts before a row is dead-lettered (terminal DEAD). */
  maxAttempts: number;
  /** Base backoff for the first retry, in ms. */
  backoffBaseMs: number;
  /** Upper bound on a single backoff interval, in ms. */
  backoffMaxMs: number;
}

export type FailureDecision = { status: 'DEAD' } | { status: 'FAILED'; nextAttemptAt: Date };

/**
 * Backoff before the next retry given how many attempts have already been made.
 * `claimEvent` increments `attempts` when it claims, so the first failure has
 * `attempts === 1`. Exponential: base * 2^(attempts-1), capped at backoffMaxMs.
 */
export function backoffMs(attempts: number, policy: RetryPolicy): number {
  const exponent = Math.max(0, attempts - 1);
  const raw = policy.backoffBaseMs * 2 ** exponent;
  return Math.min(raw, policy.backoffMaxMs);
}

/**
 * Decide a row's fate after a processing failure. Once `attempts` reaches
 * `maxAttempts` the row is DEAD (terminal, no more retries); otherwise it is
 * retryable and becomes eligible again after the backoff window.
 */
export function decideOnFailure(attempts: number, policy: RetryPolicy, now: Date): FailureDecision {
  if (attempts >= policy.maxAttempts) return { status: 'DEAD' };
  return { status: 'FAILED', nextAttemptAt: new Date(now.getTime() + backoffMs(attempts, policy)) };
}
