import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@recoverflow/db';
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiryFrom,
  SESSION_DURATION_MS,
  SESSION_RENEWAL_THRESHOLD_MS,
  SESSION_ROTATION_GRACE_MS,
} from './session-core';
import { rotateSessionToken, validateSessionToken } from './session';

async function clean() {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.merchant.deleteMany();
}

let userId: string;
beforeEach(async () => {
  await clean();
  const merchant = await prisma.merchant.create({
    data: { name: 'Rot Co', email: 'rot@test.local', razorpayWebhookSecret: 'whsec_rot' },
  });
  const user = await prisma.user.create({
    data: {
      merchantId: merchant.id,
      email: 'rot@test.local',
      passwordHash: 'x',
      name: 'R',
      role: 'OWNER',
    },
  });
  userId = user.id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

// Helper: insert a session row with a chosen expiry, return its raw token.
async function seedSession(expiresAt: Date): Promise<string> {
  const token = generateSessionToken();
  await prisma.session.create({
    data: { userId, tokenHash: hashSessionToken(token), expiresAt },
  });
  return token;
}

describe('session rotation (integration)', () => {
  it('does not rotate a freshly minted session (not yet at half-life)', async () => {
    const token = await seedSession(sessionExpiryFrom()); // full 30d ahead
    const result = await rotateSessionToken(token);
    expect(result).toBeNull();
    // The single row is untouched.
    expect(await prisma.session.count()).toBe(1);
  });

  it('rotates when within the renewal window: new token differs, both rows exist', async () => {
    // Expiry just under half-life from now => due for renewal.
    const dueExpiry = new Date(Date.now() + SESSION_RENEWAL_THRESHOLD_MS - 1000);
    const oldToken = await seedSession(dueExpiry);

    const result = await rotateSessionToken(oldToken);
    expect(result).not.toBeNull();
    expect(result!.token).not.toBe(oldToken);
    // Two rows now: the shrunk old one + the fresh one.
    expect(await prisma.session.count()).toBe(2);
  });

  it('keeps the OLD token valid during the grace window (no logout flicker)', async () => {
    const dueExpiry = new Date(Date.now() + SESSION_RENEWAL_THRESHOLD_MS - 1000);
    const oldToken = await seedSession(dueExpiry);
    await rotateSessionToken(oldToken);

    // Immediately after rotation, the in-flight request's old token still validates.
    const stillValid = await validateSessionToken(oldToken);
    expect(stillValid).not.toBeNull();
    expect(stillValid!.user.id).toBe(userId);
  });

  it('the NEW token validates and carries the full lifetime', async () => {
    const dueExpiry = new Date(Date.now() + SESSION_RENEWAL_THRESHOLD_MS - 1000);
    const oldToken = await seedSession(dueExpiry);
    const result = await rotateSessionToken(oldToken);

    const validated = await validateSessionToken(result!.token);
    expect(validated).not.toBeNull();
    expect(validated!.user.id).toBe(userId);
    // Full ~30d lifetime (allow a small clock delta).
    const remaining = validated!.session.expiresAt.getTime() - Date.now();
    expect(remaining).toBeGreaterThan(SESSION_DURATION_MS - 60_000);
  });

  it('shrinks the old row to the grace window so it lapses shortly after', async () => {
    const dueExpiry = new Date(Date.now() + SESSION_RENEWAL_THRESHOLD_MS - 1000);
    const oldToken = await seedSession(dueExpiry);
    const before = Date.now();
    await rotateSessionToken(oldToken);

    const oldRow = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(oldToken) },
    });
    expect(oldRow).not.toBeNull();
    const grace = oldRow!.expiresAt.getTime() - before;
    // Old row now expires within ~the grace window, far below its original life.
    expect(grace).toBeLessThanOrEqual(SESSION_ROTATION_GRACE_MS + 1000);
    expect(grace).toBeGreaterThan(0);
  });

  it('returns null for an unknown token', async () => {
    expect(await rotateSessionToken('nonexistent-token')).toBeNull();
  });
});
