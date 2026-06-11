/**
 * In-memory fixed-window rate limiter. Pure and deterministic: the clock is
 * injectable, so the window logic is unit-testable without timers.
 *
 * Scope note: state is per-process. On Railway's single long-lived container
 * this is correct for pilot scale; it resets on deploy and is NOT shared across
 * replicas. A distributed store (Redis) is a future item if we scale out.
 */
export interface RateLimitRule {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** When the current window resets (epoch ms). */
  resetAt: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Counter>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(key: string, rule: RateLimitRule): RateLimitResult {
    const t = this.now();
    const existing = this.buckets.get(key);

    if (!existing || t >= existing.resetAt) {
      const resetAt = t + rule.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: rule.limit - 1, resetAt };
    }

    if (existing.count >= rule.limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: rule.limit - existing.count,
      resetAt: existing.resetAt,
    };
  }

  /** Drop expired buckets; call periodically if the keyspace is large. */
  sweep(): void {
    const t = this.now();
    for (const [key, c] of this.buckets) {
      if (t >= c.resetAt) this.buckets.delete(key);
    }
  }

  /** Test/maintenance aid. */
  reset(): void {
    this.buckets.clear();
  }
}
