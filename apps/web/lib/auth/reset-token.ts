import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@recoverflow/shared';

/**
 * Password-reset token: signed, time-limited, single-use.
 *
 * Security model (mirrors PaymentUpdateToken):
 *  - The RAW token is 32 random bytes (256-bit), embedded in the emailed link
 *    exactly once and NEVER stored.
 *  - Only sha256(raw) is persisted (tokenHash); lookup hashes the incoming raw.
 *  - The emailed value is SIGNED: "<raw>.<hmac>" where the HMAC key is derived
 *    from APP_ENCRYPTION_KEY. A tampered token fails signature verification in
 *    constant time BEFORE any DB lookup — no new env secret required.
 *  - A token is usable iff usedAt IS NULL AND expiresAt > now. Single use is an
 *    atomic conditional claim in the store (set usedAt only if still null).
 */

const TOKEN_BYTES = 32; // 256-bit
const DEFAULT_TTL_MINUTES = 30; // short-lived by design

export interface ResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface ResetTokenStore {
  createToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<ResetTokenRecord>;
  findByHash(tokenHash: string): Promise<ResetTokenRecord | null>;
  /** Atomic single-use claim: set usedAt=now only if still null; true iff won. */
  markUsed(id: string, now: Date): Promise<boolean>;
}

/** Injected clock so expiry logic is deterministic in tests. */
export interface ResetTokenClock {
  now(): Date;
}

/** Derive a dedicated signing subkey from APP_ENCRYPTION_KEY (kept distinct from
 *  the AES key by domain-separating the HMAC label). No extra env var. */
function signingKey(): Buffer {
  const appKey = Buffer.from(getEnv().APP_ENCRYPTION_KEY, 'base64');
  return createHmac('sha256', appKey).update('password-reset-token-signing-v1').digest();
}

export function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Sign a raw token as "<raw>.<hmacHex>" — tamper-evident before any DB hit. */
export function signResetToken(raw: string): string {
  const sig = createHmac('sha256', signingKey()).update(raw).digest('hex');
  return `${raw}.${sig}`;
}

/** Verify the signature (constant-time) and return the raw token, or null. */
export function parseSignedResetToken(signed: string): string | null {
  const dot = signed.lastIndexOf('.');
  if (dot <= 0 || dot === signed.length - 1) return null;
  const raw = signed.slice(0, dot);
  const provided = signed.slice(dot + 1);
  const expected = createHmac('sha256', signingKey()).update(raw).digest('hex');
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch; the length difference is not
  // itself secret, so guard first, then compare equal-length inputs.
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? raw : null;
}

export interface ResetTokenDeps {
  store: ResetTokenStore;
  clock: ResetTokenClock;
  ttlMinutes?: number;
}

/**
 * Issue a signed, single-use reset token for a user. Returns the SIGNED token to
 * embed in the emailed link (never stored) plus the persisted record.
 */
export async function issueResetToken(
  deps: ResetTokenDeps,
  userId: string,
): Promise<{ signedToken: string; record: ResetTokenRecord }> {
  const now = deps.clock.now();
  const ttl = deps.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  const raw = randomBytes(TOKEN_BYTES).toString('hex');
  const record = await deps.store.createToken({
    userId,
    tokenHash: hashResetToken(raw),
    expiresAt: new Date(now.getTime() + ttl * 60_000),
  });
  return { signedToken: signResetToken(raw), record };
}

export type ConsumeResetResult = { valid: true; userId: string } | { valid: false };

/**
 * Consume a signed reset token: verify signature -> look up by hash -> check not
 * used / not expired -> atomically claim (single-use). Any failure collapses to
 * { valid: false } so callers cannot distinguish why (no unknown/expired/used
 * oracle).
 */
export async function consumeResetToken(
  deps: ResetTokenDeps,
  signedToken: string,
): Promise<ConsumeResetResult> {
  const raw = parseSignedResetToken(signedToken);
  if (!raw) return { valid: false };

  const record = await deps.store.findByHash(hashResetToken(raw));
  if (!record) return { valid: false };

  const now = deps.clock.now();
  if (record.usedAt !== null) return { valid: false };
  if (record.expiresAt.getTime() <= now.getTime()) return { valid: false };

  const won = await deps.store.markUsed(record.id, now);
  if (!won) return { valid: false }; // lost the race -> already used

  return { valid: true, userId: record.userId };
}
