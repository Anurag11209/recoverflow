import { describe, expect, it } from 'vitest';
import {
  isSessionExpired,
  shouldRenewSession,
  sessionExpiryFrom,
  SESSION_DURATION_MS,
  SESSION_RENEWAL_THRESHOLD_MS,
} from './session-core';

const now = new Date('2026-06-01T00:00:00Z');

describe('session expiry', () => {
  it('is not expired strictly before expiresAt', () => {
    const expiresAt = new Date(now.getTime() + 1000);
    expect(isSessionExpired(expiresAt, now)).toBe(false);
  });
  it('is expired at and after expiresAt', () => {
    expect(isSessionExpired(now, now)).toBe(true);
    expect(isSessionExpired(new Date(now.getTime() - 1), now)).toBe(true);
  });
  it('mints a 30-day expiry from now', () => {
    expect(sessionExpiryFrom(now).getTime()).toBe(now.getTime() + SESSION_DURATION_MS);
  });
});

describe('session renewal (sliding, at half-life)', () => {
  it('does not renew a freshly minted session', () => {
    const expiresAt = sessionExpiryFrom(now); // full duration ahead
    expect(shouldRenewSession(expiresAt, now)).toBe(false);
  });
  it('renews once remaining lifetime drops below the threshold', () => {
    // remaining just under half the duration
    const expiresAt = new Date(now.getTime() + SESSION_RENEWAL_THRESHOLD_MS - 1);
    expect(shouldRenewSession(expiresAt, now)).toBe(true);
  });
  it('does not renew exactly at the threshold boundary', () => {
    const expiresAt = new Date(now.getTime() + SESSION_RENEWAL_THRESHOLD_MS);
    expect(shouldRenewSession(expiresAt, now)).toBe(false);
  });
});
