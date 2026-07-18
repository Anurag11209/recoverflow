import { describe, expect, it } from 'vitest';
import {
  issueResetToken,
  consumeResetToken,
  parseSignedResetToken,
  signResetToken,
  type ResetTokenRecord,
  type ResetTokenStore,
} from './reset-token';

/** In-memory ResetTokenStore with the atomic single-use claim semantics. */
function fakeStore(): ResetTokenStore {
  const rows = new Map<string, ResetTokenRecord>();
  let seq = 0;
  return {
    async createToken(input) {
      const rec: ResetTokenRecord = {
        id: `rt_${++seq}`,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        usedAt: null,
      };
      rows.set(rec.id, rec);
      return rec;
    },
    async findByHash(hash) {
      return [...rows.values()].find((r) => r.tokenHash === hash) ?? null;
    },
    async markUsed(id, now) {
      const r = rows.get(id);
      if (!r || r.usedAt !== null) return false;
      r.usedAt = now;
      return true;
    },
  };
}

const clockAt = (d: Date) => ({ now: () => d });
const T0 = new Date('2026-07-18T00:00:00Z');

describe('reset-token', () => {
  it('issues a signed token and consumes it once, returning the user id', async () => {
    const deps = { store: fakeStore(), clock: clockAt(T0) };
    const { signedToken } = await issueResetToken(deps, 'user_1');
    expect(signedToken).toContain('.'); // "<raw>.<hmac>"

    const consumed = await consumeResetToken(deps, signedToken);
    expect(consumed).toEqual({ valid: true, userId: 'user_1' });
  });

  it('rejects a second consume of the same token (single-use)', async () => {
    const deps = { store: fakeStore(), clock: clockAt(T0) };
    const { signedToken } = await issueResetToken(deps, 'user_1');

    expect((await consumeResetToken(deps, signedToken)).valid).toBe(true);
    expect((await consumeResetToken(deps, signedToken)).valid).toBe(false);
  });

  it('rejects an expired token', async () => {
    const store = fakeStore();
    const { signedToken } = await issueResetToken({ store, clock: clockAt(T0), ttlMinutes: 30 }, 'user_1');
    const later = new Date(T0.getTime() + 31 * 60_000);

    const consumed = await consumeResetToken({ store, clock: clockAt(later) }, signedToken);
    expect(consumed.valid).toBe(false);
  });

  it('rejects a token with a tampered signature', async () => {
    const deps = { store: fakeStore(), clock: clockAt(T0) };
    const { signedToken } = await issueResetToken(deps, 'user_1');
    const tampered = signedToken.slice(0, -1) + (signedToken.endsWith('a') ? 'b' : 'a');

    expect((await consumeResetToken(deps, tampered)).valid).toBe(false);
  });

  it('parseSignedResetToken rejects a raw/signature mismatch and garbage', () => {
    const signed = signResetToken('a'.repeat(64));
    // Correct signature but swapped raw payload.
    const forged = 'b'.repeat(64) + signed.slice(signed.lastIndexOf('.'));
    expect(parseSignedResetToken(forged)).toBeNull();
    expect(parseSignedResetToken('no-dot-token')).toBeNull();
    expect(parseSignedResetToken('trailing.')).toBeNull();
  });

  it('rejects a well-signed token that was never issued (not found)', async () => {
    const deps = { store: fakeStore(), clock: clockAt(T0) };
    const orphan = signResetToken('f'.repeat(64));
    expect((await consumeResetToken(deps, orphan)).valid).toBe(false);
  });
});
