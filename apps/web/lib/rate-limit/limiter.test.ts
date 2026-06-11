import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from './limiter';

const rule = { limit: 3, windowMs: 1000 };

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit within a window, then blocks', () => {
    const now = 0;
    const rl = new FixedWindowRateLimiter(() => now);
    expect(rl.check('k', rule).allowed).toBe(true); // 1
    expect(rl.check('k', rule).allowed).toBe(true); // 2
    expect(rl.check('k', rule).allowed).toBe(true); // 3
    expect(rl.check('k', rule).allowed).toBe(false); // 4 -> blocked
  });

  it('reports remaining and resetAt', () => {
    const now = 100;
    const rl = new FixedWindowRateLimiter(() => now);
    const first = rl.check('k', rule);
    expect(first.remaining).toBe(2);
    expect(first.resetAt).toBe(1100);
    expect(rl.check('k', rule).remaining).toBe(1);
  });

  it('resets after the window elapses', () => {
    let now = 0;
    const rl = new FixedWindowRateLimiter(() => now);
    rl.check('k', rule);
    rl.check('k', rule);
    rl.check('k', rule);
    expect(rl.check('k', rule).allowed).toBe(false);
    now = 1000; // window boundary reached
    expect(rl.check('k', rule).allowed).toBe(true); // fresh window
  });

  it('isolates keys', () => {
    const now = 0;
    const rl = new FixedWindowRateLimiter(() => now);
    rl.check('a', rule);
    rl.check('a', rule);
    rl.check('a', rule);
    expect(rl.check('a', rule).allowed).toBe(false);
    expect(rl.check('b', rule).allowed).toBe(true); // separate bucket
  });

  it('sweep drops only expired buckets', () => {
    let now = 0;
    const rl = new FixedWindowRateLimiter(() => now);
    rl.check('old', rule);
    now = 500;
    rl.check('new', rule);
    now = 1000; // 'old' expired (reset 1000), 'new' not (reset 1500)
    rl.sweep();
    // 'old' swept -> fresh allowance; 'new' still counting.
    expect(rl.check('old', rule).remaining).toBe(2); // brand new bucket
    expect(rl.check('new', rule).remaining).toBe(1); // was 1 used, now 2 used of 3
  });
});
