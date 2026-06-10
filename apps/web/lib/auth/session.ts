import { prisma } from '@recoverflow/db';
import type { Merchant, Session, User } from '@recoverflow/db';
import {
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
  sessionExpiryFrom,
  shouldRenewSession,
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

/** Logout: removes one session. */
export async function invalidateSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Removes every session for a user (e.g. after a password change). */
export async function invalidateUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
