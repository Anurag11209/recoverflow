import { describe, expect, it, vi } from 'vitest';
import {
  consumeToken,
  createPaymentUpdateToken,
  expiresAtFrom,
  generateToken,
  hashToken,
  validateRawToken,
  type TokenDeps,
} from './token-service';
import type { Logger } from '../logger';
import type { Clock, TokenRecord, TokenStore } from './token-types';

const silentLogger: Logger = { info: () => {}, error: () => {} };

function fixedClock(at: Date): Clock {
  return { now: () => at };
}

/** In-memory TokenStore with the same semantics the Prisma adapter must honor. */
function fakeStore(): TokenStore & { rows: TokenRecord[] } {
  const rows: TokenRecord[] = [];
  let seq = 0;
  return {
    rows,
    async supersedeActiveTokens(recoveryCaseId, now) {
      for (const r of rows) {
        if (
          r.recoveryCaseId === recoveryCaseId &&
          r.usedAt === null &&
          r.supersededAt === null &&
          r.expiresAt.getTime() > now.getTime()
        ) {
          r.supersededAt = now;
        }
      }
    },
    async createToken(input) {
      const record: TokenRecord = {
        id: `tok_${++seq}`,
        recoveryCaseId: input.recoveryCaseId,
        merchantId: input.merchantId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        usedAt: null,
        supersededAt: null,
      };
      rows.push(record);
      return record;
    },
    async findByHash(tokenHash) {
      return rows.find((r) => r.tokenHash === tokenHash) ?? null;
    },
    async markUsed(id, now) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.usedAt !== null) return false; // atomic conditional claim
      r.usedAt = now;
      return true;
    },
  };
}

function deps(at: Date, store = fakeStore()): TokenDeps & { store: typeof store } {
  return { store, clock: fixedClock(at), logger: silentLogger };
}

const T0 = new Date('2026-06-11T12:00:00.000Z');

describe('generateToken / hashToken', () => {
  it('produces a 64-char hex raw token and 64-char hex hash', () => {
    const { raw, hash } = generateToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces distinct raw tokens across calls', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.raw).not.toBe(b.raw);
  });

  it('hashes deterministically (same raw -> same hash)', () => {
    const { raw, hash } = generateToken();
    expect(hashToken(raw)).toBe(hash);
  });

  it('different raw tokens hash differently', () => {
    expect(hashToken('aaaa')).not.toBe(hashToken('bbbb'));
  });

  it('matches a known sha256 vector', () => {
    // sha256("abc")
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('expiresAtFrom', () => {
  it('adds the ttl in hours', () => {
    expect(expiresAtFrom(T0, 72).toISOString()).toBe('2026-06-14T12:00:00.000Z');
  });
});

describe('createPaymentUpdateToken', () => {
  it('creates an active token with a 72h default expiry', async () => {
    const d = deps(T0);
    const { raw, record } = await createPaymentUpdateToken(d, {
      recoveryCaseId: 'rc_1',
      merchantId: 'm_1',
    });
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(record.expiresAt.toISOString()).toBe('2026-06-14T12:00:00.000Z');
    expect(record.usedAt).toBeNull();
    expect(record.supersededAt).toBeNull();
    // stored hash matches the raw we were handed
    expect(record.tokenHash).toBe(hashToken(raw));
  });

  it('honors a ttl override', async () => {
    const d = deps(T0);
    const { record } = await createPaymentUpdateToken(d, {
      recoveryCaseId: 'rc_1',
      merchantId: 'm_1',
      ttlHours: 24,
    });
    expect(record.expiresAt.toISOString()).toBe('2026-06-12T12:00:00.000Z');
  });

  it('supersedes a prior active token (D2: one active token per case)', async () => {
    const d = deps(T0);
    const first = await createPaymentUpdateToken(d, { recoveryCaseId: 'rc_1', merchantId: 'm_1' });
    const second = await createPaymentUpdateToken(d, { recoveryCaseId: 'rc_1', merchantId: 'm_1' });

    const firstRow = d.store.rows.find((r) => r.id === first.record.id)!;
    const secondRow = d.store.rows.find((r) => r.id === second.record.id)!;
    expect(firstRow.supersededAt).not.toBeNull();
    expect(secondRow.supersededAt).toBeNull();

    // The old raw token no longer validates; the new one does.
    expect((await validateRawToken(d, first.raw)).valid).toBe(false);
    expect((await validateRawToken(d, second.raw)).valid).toBe(true);
  });
});

describe('validateRawToken', () => {
  it('accepts a fresh token and returns sanitized fields only', async () => {
    const d = deps(T0);
    const { raw } = await createPaymentUpdateToken(d, {
      recoveryCaseId: 'rc_1',
      merchantId: 'm_1',
    });
    const res = await validateRawToken(d, raw);
    expect(res).toEqual({ valid: true, recoveryCaseId: 'rc_1', merchantId: 'm_1' });
  });

  it('rejects an unknown token', async () => {
    const d = deps(T0);
    expect(await validateRawToken(d, 'deadbeef')).toEqual({ valid: false });
  });

  it('rejects an expired token', async () => {
    const store = fakeStore();
    const dCreate = deps(T0, store);
    const { raw } = await createPaymentUpdateToken(dCreate, {
      recoveryCaseId: 'rc_1',
      merchantId: 'm_1',
      ttlHours: 1,
    });
    // 2 hours later -> expired
    const dLater = deps(new Date(T0.getTime() + 2 * 60 * 60 * 1000), store);
    expect(await validateRawToken(dLater, raw)).toEqual({ valid: false });
  });
});

describe('consumeToken (single-use, D5)', () => {
  it('consumes a valid token once, then refuses the second time', async () => {
    const store = fakeStore();
    const d = deps(T0, store);
    const { raw } = await createPaymentUpdateToken(d, {
      recoveryCaseId: 'rc_1',
      merchantId: 'm_1',
    });

    const first = await consumeToken(d, raw);
    expect(first).toEqual({ valid: true, recoveryCaseId: 'rc_1', merchantId: 'm_1' });

    const second = await consumeToken(d, raw);
    expect(second).toEqual({ valid: false });
  });

  it('refuses an expired token without consuming', async () => {
    const store = fakeStore();
    const { raw } = await createPaymentUpdateToken(deps(T0, store), {
      recoveryCaseId: 'rc_1',
      merchantId: 'm_1',
      ttlHours: 1,
    });
    const dLater = deps(new Date(T0.getTime() + 2 * 60 * 60 * 1000), store);
    expect(await consumeToken(dLater, raw)).toEqual({ valid: false });
  });

  it('is idempotent under a lost claim race (markUsed returns false)', async () => {
    const store = fakeStore();
    const d = deps(T0, store);
    const { raw } = await createPaymentUpdateToken(d, {
      recoveryCaseId: 'rc_1',
      merchantId: 'm_1',
    });

    // Simulate a concurrent winner: markUsed reports this call lost the claim.
    const spy = vi.spyOn(store, 'markUsed').mockResolvedValueOnce(false);
    expect(await consumeToken(d, raw)).toEqual({ valid: false });
    spy.mockRestore();
  });
});
