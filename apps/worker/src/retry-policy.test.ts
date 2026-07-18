import { describe, expect, it } from 'vitest';
import { backoffMs, decideOnFailure, type RetryPolicy } from './retry-policy';

const policy: RetryPolicy = { maxAttempts: 5, backoffBaseMs: 1000, backoffMaxMs: 60_000 };

describe('backoffMs', () => {
  it('grows exponentially from the base', () => {
    expect(backoffMs(1, policy)).toBe(1000); // 1000 * 2^0
    expect(backoffMs(2, policy)).toBe(2000); // 2^1
    expect(backoffMs(3, policy)).toBe(4000); // 2^2
    expect(backoffMs(4, policy)).toBe(8000); // 2^3
  });

  it('caps at backoffMaxMs', () => {
    expect(backoffMs(100, policy)).toBe(60_000);
  });

  it('supports a zero base (immediate retry)', () => {
    expect(backoffMs(3, { ...policy, backoffBaseMs: 0 })).toBe(0);
  });
});

describe('decideOnFailure', () => {
  const now = new Date('2026-07-16T00:00:00.000Z');

  it('schedules a retry while attempts remain', () => {
    const d = decideOnFailure(1, policy, now);
    expect(d.status).toBe('FAILED');
    if (d.status === 'FAILED') {
      expect(d.nextAttemptAt.getTime()).toBe(now.getTime() + 1000);
    }
  });

  it('keeps the last attempt before the cap retryable', () => {
    expect(decideOnFailure(4, policy, now).status).toBe('FAILED');
  });

  it('dead-letters once attempts reaches maxAttempts', () => {
    expect(decideOnFailure(5, policy, now).status).toBe('DEAD');
    expect(decideOnFailure(6, policy, now).status).toBe('DEAD');
  });
});
