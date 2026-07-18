import { describe, expect, it, vi } from 'vitest';
import type { EmailClient, EmailMessage } from '@recoverflow/adapters';
import { requestPasswordReset, resetPassword } from './reset-service';
import { issueResetToken, type ResetTokenRecord, type ResetTokenStore } from './reset-token';

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

const clock = { now: () => new Date('2026-07-18T00:00:00Z') };
const noopLogger = { info: () => {}, error: () => {} };

describe('requestPasswordReset (enumeration-safe)', () => {
  it('sends a reset email for a known account', async () => {
    const sent: EmailMessage[] = [];
    const emailClient: EmailClient = {
      async sendEmail(m) {
        sent.push(m);
        return { id: 'e1' };
      },
    };

    await requestPasswordReset(
      {
        findUserByEmail: async () => ({ id: 'u1', email: 'known@example.com' }),
        store: fakeStore(),
        clock,
        emailClient,
        buildResetUrl: (t) => `https://app.test/reset-password?token=${t}`,
        logger: noopLogger,
      },
      'known@example.com',
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('known@example.com');
    expect(sent[0].subject.toLowerCase()).toContain('reset');
  });

  it('does not send and does not throw for an unknown account (no oracle)', async () => {
    const sendEmail = vi.fn(async (_m: EmailMessage) => ({ id: 'e' }));

    await expect(
      requestPasswordReset(
        {
          findUserByEmail: async () => null,
          store: fakeStore(),
          clock,
          emailClient: { sendEmail },
          buildResetUrl: (t) => t,
          logger: noopLogger,
        },
        'unknown@example.com',
      ),
    ).resolves.toBeUndefined();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('returns identically (void) for known and unknown emails', async () => {
    const ok: EmailClient = {
      async sendEmail() {
        return { id: 'e' };
      },
    };
    const known = await requestPasswordReset(
      {
        findUserByEmail: async () => ({ id: 'u', email: 'k@example.com' }),
        store: fakeStore(),
        clock,
        emailClient: ok,
        buildResetUrl: (t) => t,
        logger: noopLogger,
      },
      'k@example.com',
    );
    const unknown = await requestPasswordReset(
      {
        findUserByEmail: async () => null,
        store: fakeStore(),
        clock,
        emailClient: ok,
        buildResetUrl: (t) => t,
        logger: noopLogger,
      },
      'u@example.com',
    );
    expect(known).toBe(unknown); // both undefined — indistinguishable to the caller
  });

  it('swallows a send failure for a real account (send error is not an oracle)', async () => {
    await expect(
      requestPasswordReset(
        {
          findUserByEmail: async () => ({ id: 'u1', email: 'known@example.com' }),
          store: fakeStore(),
          clock,
          emailClient: {
            async sendEmail() {
              throw new Error('resend down');
            },
          },
          buildResetUrl: (t) => t,
          logger: noopLogger,
        },
        'known@example.com',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('resetPassword', () => {
  it('resets the password (hashed) and invalidates sessions on a valid token', async () => {
    const store = fakeStore();
    const { signedToken } = await issueResetToken({ store, clock }, 'u1');

    const updates: Array<{ id: string; hash: string }> = [];
    const invalidated: string[] = [];

    const res = await resetPassword(
      {
        store,
        clock,
        updatePassword: async (id, hash) => {
          updates.push({ id, hash });
        },
        invalidateSessions: async (id) => {
          invalidated.push(id);
        },
        logger: noopLogger,
      },
      signedToken,
      'new-password-123',
    );

    expect(res).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('u1');
    expect(updates[0].hash).not.toBe('new-password-123'); // stored as an argon2 hash
    expect(updates[0].hash.startsWith('$argon2')).toBe(true);
    expect(invalidated).toEqual(['u1']);
  });

  it('rejects an invalid token without updating anything', async () => {
    const updatePassword = vi.fn(async (_id: string, _hash: string) => {});
    const invalidateSessions = vi.fn(async (_id: string) => {});

    const res = await resetPassword(
      { store: fakeStore(), clock, updatePassword, invalidateSessions, logger: noopLogger },
      'bogus-token',
      'new-password-123',
    );

    expect(res).toEqual({ ok: false });
    expect(updatePassword).not.toHaveBeenCalled();
    expect(invalidateSessions).not.toHaveBeenCalled();
  });
});
