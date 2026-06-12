import { describe, expect, it, beforeEach } from 'vitest';
import { TooManyRequestsError } from '@recoverflow/shared';
import { assertWithinRateLimit, clientIp, RATE_LIMITS, _limiterForTests } from './guard';

beforeEach(() => _limiterForTests.reset());

describe('clientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    const req = new Request('https://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(clientIp(req)).toBe('1.2.3.4');
  });
  it('falls back to x-real-ip', () => {
    const req = new Request('https://x', { headers: { 'x-real-ip': '9.9.9.9' } });
    expect(clientIp(req)).toBe('9.9.9.9');
  });
  it('falls back to "unknown" when no IP header is present', () => {
    expect(clientIp(new Request('https://x'))).toBe('unknown');
  });
});

describe('assertWithinRateLimit', () => {
  it('does not throw under the limit', () => {
    for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
      expect(() => assertWithinRateLimit('login', '1.1.1.1', RATE_LIMITS.auth)).not.toThrow();
    }
  });
  it('throws TooManyRequestsError once the limit is exceeded', () => {
    for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
      assertWithinRateLimit('login', '1.1.1.1', RATE_LIMITS.auth);
    }
    expect(() => assertWithinRateLimit('login', '1.1.1.1', RATE_LIMITS.auth)).toThrow(
      TooManyRequestsError,
    );
  });
  it('scopes separately: different scope or key is independent', () => {
    for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
      assertWithinRateLimit('login', '1.1.1.1', RATE_LIMITS.auth);
    }
    // same key, different scope -> fresh bucket
    expect(() => assertWithinRateLimit('register', '1.1.1.1', RATE_LIMITS.auth)).not.toThrow();
    // same scope, different key -> fresh bucket
    expect(() => assertWithinRateLimit('login', '2.2.2.2', RATE_LIMITS.auth)).not.toThrow();
  });
});
