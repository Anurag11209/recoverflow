import { describe, expect, it } from 'vitest';
import {
  SESSION_DURATION_MS,
  SESSION_RENEWAL_THRESHOLD_MS,
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
  sessionExpiryFrom,
  shouldRenewSession,
} from './session-core';

describe('generateSessionToken', () => {
  it('produces 32 bytes of entropy as base64url', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateSessionToken));
    expect(tokens.size).toBe(1000);
  });
});

describe('hashSessionToken', () => {
  it('is deterministic and produces sha256 hex', () => {
    const token = generateSessionToken();
    const a = hashSessionToken(token);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).toBe(a);
  });

  it('differs for different tokens', () => {
    expect(hashSessionToken('a')).not.toBe(hashSessionToken('b'));
  });
});

describe('expiry math', () => {
  const now = new Date('2026-06-10T00:00:00Z');

  it('expires exactly at the boundary', () => {
    expect(isSessionExpired(new Date(now.getTime() + 1), now)).toBe(false);
    expect(isSessionExpired(now, now)).toBe(true);
    expect(isSessionExpired(new Date(now.getTime() - 1), now)).toBe(true);
  });

  it('renews only inside the half-life window', () => {
    const fresh = sessionExpiryFrom(now);
    expect(shouldRenewSession(fresh, now)).toBe(false);
    const justOutside = new Date(now.getTime() + SESSION_RENEWAL_THRESHOLD_MS + 1);
    expect(shouldRenewSession(justOutside, now)).toBe(false);
    const inside = new Date(now.getTime() + SESSION_RENEWAL_THRESHOLD_MS - 1);
    expect(shouldRenewSession(inside, now)).toBe(true);
  });

  it('full duration is 30 days and threshold is half', () => {
    expect(SESSION_DURATION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(SESSION_RENEWAL_THRESHOLD_MS).toBe(SESSION_DURATION_MS / 2);
  });
});
