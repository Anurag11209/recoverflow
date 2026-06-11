import { randomBytes, createHash } from 'node:crypto';
import type {
  Clock,
  ConsumeResult,
  CreateTokenInput,
  RawToken,
  TokenHash,
  TokenRecord,
  TokenStore,
  ValidateResult,
} from './token-types';
import { validateToken } from './token-validation';
import type { Logger } from '../logger';

export interface TokenDeps {
  store: TokenStore;
  clock: Clock;
  logger: Logger;
}

const DEFAULT_TTL_HOURS = 72;
const TOKEN_BYTES = 32; // 256-bit (decision D4)

/** sha256(raw) as lowercase hex. Used at creation and at lookup. */
export function hashToken(raw: RawToken): TokenHash {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate a cryptographically-random raw token and its hash. The raw value is
 * returned to the caller exactly once (to embed in the link); only the hash is
 * ever persisted.
 */
export function generateToken(): { raw: RawToken; hash: TokenHash } {
  const raw = randomBytes(TOKEN_BYTES).toString('hex');
  return { raw, hash: hashToken(raw) };
}

export function expiresAtFrom(now: Date, ttlHours: number): Date {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

/**
 * Create a payment-update token for a recovery case. Supersedes any currently
 * active token first (D2: one active token per case + history), then creates
 * the new one. Returns the RAW token (for the link) plus the persisted record.
 */
export async function createPaymentUpdateToken(
  deps: TokenDeps,
  input: CreateTokenInput,
): Promise<{ raw: RawToken; record: TokenRecord }> {
  const now = deps.clock.now();
  const ttlHours = input.ttlHours ?? DEFAULT_TTL_HOURS;

  await deps.store.supersedeActiveTokens(input.recoveryCaseId, now);

  const { raw, hash } = generateToken();
  const record = await deps.store.createToken({
    recoveryCaseId: input.recoveryCaseId,
    merchantId: input.merchantId,
    tokenHash: hash,
    expiresAt: expiresAtFrom(now, ttlHours),
  });

  deps.logger.info(
    {
      event: 'token_created',
      recoveryCaseId: input.recoveryCaseId,
      merchantId: input.merchantId,
      tokenId: record.id,
      expiresAt: record.expiresAt.toISOString(),
    },
    'payment update token created',
  );

  return { raw, record };
}

/**
 * Validate a raw token WITHOUT consuming it (the GET metadata path). Hashes,
 * looks up, validates against the clock. Emits token_validated / token_expired
 * / token_used for observability; returns only the sanitized result.
 */
export async function validateRawToken(deps: TokenDeps, raw: RawToken): Promise<ValidateResult> {
  const now = deps.clock.now();
  const record = await deps.store.findByHash(hashToken(raw));
  const result = validateToken(record, now);

  if (!result.valid) {
    logFailure(deps, result.reason, record);
    return { valid: false };
  }

  deps.logger.info(
    {
      event: 'token_validated',
      recoveryCaseId: result.record.recoveryCaseId,
      merchantId: result.record.merchantId,
      tokenId: result.record.id,
    },
    'payment update token validated',
  );
  return {
    valid: true,
    recoveryCaseId: result.record.recoveryCaseId,
    merchantId: result.record.merchantId,
  };
}

/**
 * Consume a raw token: validate, then atomically claim it (markUsed). The
 * atomic claim is the single-use guarantee (D5): if a concurrent request
 * already claimed it between findByHash and markUsed, markUsed returns false
 * and we treat it as already used — no double consumption.
 */
export async function consumeToken(deps: TokenDeps, raw: RawToken): Promise<ConsumeResult> {
  const now = deps.clock.now();
  const record = await deps.store.findByHash(hashToken(raw));
  const result = validateToken(record, now);

  if (!result.valid) {
    logFailure(deps, result.reason, record);
    return { valid: false };
  }

  const won = await deps.store.markUsed(result.record.id, now);
  if (!won) {
    // Lost the race: another request consumed it first. Idempotent: report used.
    deps.logger.info(
      {
        event: 'token_used',
        recoveryCaseId: result.record.recoveryCaseId,
        tokenId: result.record.id,
        outcome: 'already_claimed',
      },
      'payment update token claim lost (already used)',
    );
    return { valid: false };
  }

  deps.logger.info(
    {
      event: 'token_used',
      recoveryCaseId: result.record.recoveryCaseId,
      merchantId: result.record.merchantId,
      tokenId: result.record.id,
      outcome: 'claimed',
    },
    'payment update token consumed',
  );
  return {
    valid: true,
    recoveryCaseId: result.record.recoveryCaseId,
    merchantId: result.record.merchantId,
  };
}

function logFailure(
  deps: TokenDeps,
  reason: 'not_found' | 'used' | 'superseded' | 'expired',
  record: TokenRecord | null,
): void {
  const event =
    reason === 'expired' ? 'token_expired' : reason === 'used' ? 'token_used' : 'token_validated';
  deps.logger.info(
    {
      event,
      reason,
      tokenId: record?.id ?? null,
      recoveryCaseId: record?.recoveryCaseId ?? null,
    },
    `payment update token rejected: ${reason}`,
  );
}
