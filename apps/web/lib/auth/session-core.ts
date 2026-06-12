import { createHash, randomBytes } from 'node:crypto';

/**
 * Pure session primitives — no database, no framework. Everything here is
 * deterministic or pure-random and unit-testable in isolation.
 *
 * Security model: the browser cookie holds a raw 256-bit token; the database
 * stores only its SHA-256. A leaked DB dump therefore cannot be replayed as
 * live sessions. SHA-256 (not argon2) is correct here because the token is
 * high-entropy random — there is nothing to brute-force offline.
 */
export const SESSION_COOKIE_NAME = 'rf_session';
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const SESSION_RENEWAL_THRESHOLD_MS = SESSION_DURATION_MS / 2; // sliding renewal at half-life
// On rotation the old token stays valid for this grace window so an in-flight
// request (whose render still carries the old cookie) does not see a logout.
export const SESSION_ROTATION_GRACE_MS = 60_000; // 60s

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function shouldRenewSession(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() < SESSION_RENEWAL_THRESHOLD_MS;
}

export function sessionExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_DURATION_MS);
}
