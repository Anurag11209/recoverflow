/**
 * Payment-update token domain types and ports (ADR 0001: pure, no Prisma).
 *
 * Security model (Phase 7):
 *  - The RAW token is 32 random bytes (256-bit), shown to the customer exactly
 *    once inside the WhatsApp link. It is NEVER persisted.
 *  - Only sha256(raw) is stored (TokenHash). Lookup hashes the incoming raw
 *    token and finds by hash.
 *  - A token is "active" iff usedAt IS NULL AND supersededAt IS NULL AND
 *    expiresAt > now (decision D2).
 *  - Single-use is enforced by an atomic claim in the store (decision D5),
 *    mirroring the Phase 4 idempotency pattern.
 */

/** 64-char hex (32 bytes) shown to the customer once; never stored. */
export type RawToken = string;
/** 64-char hex sha256(raw); the only token form persisted. */
export type TokenHash = string;

/** The engine's view of a persisted token. No Prisma types leak in here. */
export interface TokenRecord {
  id: string;
  recoveryCaseId: string;
  merchantId: string | null;
  tokenHash: TokenHash;
  expiresAt: Date;
  usedAt: Date | null;
  supersededAt: Date | null;
}

/** Injected clock so expiry logic is deterministic in tests. */
export interface Clock {
  now(): Date;
}

export interface CreateTokenInput {
  recoveryCaseId: string;
  merchantId: string | null;
  /** Defaults to 72 (decision: 72h default, override allowed). */
  ttlHours?: number;
}

/**
 * Persistence port (implemented by apps/web with Prisma in Step 6).
 *  - supersedeActiveTokens: set supersededAt=now on all currently-active tokens
 *    for the case, so only the newest token is active (D2).
 *  - createToken: insert a new token row.
 *  - findByHash: look up by tokenHash (the unique column).
 *  - markUsed: ATOMIC conditional claim — set usedAt=now only if still null.
 *    Returns true iff THIS call won the claim (D5 idempotency / TOCTOU guard).
 */
export interface TokenStore {
  supersedeActiveTokens(recoveryCaseId: string, now: Date): Promise<void>;
  createToken(record: {
    recoveryCaseId: string;
    merchantId: string | null;
    tokenHash: TokenHash;
    expiresAt: Date;
  }): Promise<TokenRecord>;
  findByHash(tokenHash: TokenHash): Promise<TokenRecord | null>;
  markUsed(id: string, now: Date): Promise<boolean>;
}

/** Internal validation result — carries the reason for structured logging. */
export type TokenValidation =
  | { valid: true; record: TokenRecord }
  | { valid: false; reason: 'not_found' | 'used' | 'superseded' | 'expired' };

/**
 * Sanitized result that crosses the domain boundary to the API layer.
 * Deliberately does NOT expose TokenRecord, so endpoint code cannot couple to
 * token-table internals (and per D4 the public surface never reveals WHY a
 * token failed).
 */
export type ConsumeResult =
  | { valid: true; recoveryCaseId: string; merchantId: string | null }
  | { valid: false };

export type ValidateResult =
  | { valid: true; recoveryCaseId: string; merchantId: string | null }
  | { valid: false };
