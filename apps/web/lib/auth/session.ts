import { prisma } from '@recoverflow/db';
import type { Merchant, Session, User } from '@recoverflow/db';
import {
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
  sessionExpiryFrom,
  shouldRenewSession,
  SESSION_ROTATION_GRACE_MS,
} from './session-core';

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export type ValidatedSession = {
  session: Session;
  user: User & { merchant: Merchant };
};

/** Creates a session row and returns the RAW token (for the cookie) plus the row. */
export async function createSession(
  userId: string,
  meta: SessionMeta = {},
): Promise<{ token: string; session: Session }> {
  const token = generateSessionToken();
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: sessionExpiryFrom(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  return { token, session };
}

/**
 * Looks up a session by raw token. Deletes it if expired (returns null);
 * extends it when inside the renewal window (sliding expiry). Returns the
 * session plus its user and merchant, or null.
 */
export async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
  const found = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { merchant: true } } },
  });
  if (!found) return null;

  const now = new Date();
  if (isSessionExpired(found.expiresAt, now)) {
    await prisma.session.delete({ where: { id: found.id } });
    return null;
  }

  if (shouldRenewSession(found.expiresAt, now)) {
    const expiresAt = sessionExpiryFrom(now);
    await prisma.session.update({ where: { id: found.id }, data: { expiresAt } });
    found.expiresAt = expiresAt;
  }

  const { user, ...session } = found;
  return { session, user };
}

/**
 * Rotates the session token when the session is within its renewal window.
 * Mints a NEW token (new row, full lifetime) and shrinks the OLD row's expiry
 * to a short grace window rather than deleting it — so the in-flight request,
 * whose render still reads the old cookie, continues to validate. The browser
 * gets the new cookie on the response and uses it next request; the old row
 * lapses (and is cleaned up by the normal expiry path) after the grace.
 *
 * Returns the new raw token + expiry when rotation happened, or null when the
 * session is absent, expired, or not yet due for renewal. Node-runtime only
 * (uses node:crypto + Prisma); intended to be called from middleware.
 */
export async function rotateSessionToken(
  token: string,
  meta: SessionMeta = {},
): Promise<{ token: string; expiresAt: Date } | null> {
  const found = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
  });
  if (!found) return null;

  const now = new Date();
  if (isSessionExpired(found.expiresAt, now)) {
    await prisma.session.delete({ where: { id: found.id } });
    return null;
  }
  if (!shouldRenewSession(found.expiresAt, now)) return null;

  const newToken = generateSessionToken();
  const newExpiresAt = sessionExpiryFrom(now);
  const graceExpiresAt = new Date(now.getTime() + SESSION_ROTATION_GRACE_MS);

  await prisma.$transaction([
    // Shrink the old row's life to the grace window (keeps the in-flight request working).
    prisma.session.update({ where: { id: found.id }, data: { expiresAt: graceExpiresAt } }),
    // Mint the replacement with a fresh token and full lifetime.
    prisma.session.create({
      data: {
        userId: found.userId,
        tokenHash: hashSessionToken(newToken),
        expiresAt: newExpiresAt,
        ip: meta.ip ?? found.ip,
        userAgent: meta.userAgent ?? found.userAgent,
      },
    }),
  ]);

  return { token: newToken, expiresAt: newExpiresAt };
}

/** Logout: removes one session. */
export async function invalidateSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Removes every session for a user (e.g. after a password change). */
export async function invalidateUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
