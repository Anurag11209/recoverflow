import { prisma } from '@recoverflow/db';
import type { ResetTokenRecord, ResetTokenStore } from './reset-token';

const SELECT = {
  id: true,
  userId: true,
  tokenHash: true,
  expiresAt: true,
  usedAt: true,
} as const;

/**
 * Prisma-backed ResetTokenStore. Single-use is enforced by an atomic conditional
 * updateMany (usedAt: null -> now): exactly one concurrent claim can flip the row,
 * so a token can never be consumed twice even under a race.
 */
export function createResetTokenStore(): ResetTokenStore {
  return {
    async createToken(input): Promise<ResetTokenRecord> {
      return prisma.passwordResetToken.create({
        data: { userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt },
        select: SELECT,
      });
    },

    async findByHash(tokenHash): Promise<ResetTokenRecord | null> {
      const r = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, select: SELECT });
      return r ?? null;
    },

    async markUsed(id, now): Promise<boolean> {
      const res = await prisma.passwordResetToken.updateMany({
        where: { id, usedAt: null },
        data: { usedAt: now },
      });
      return res.count === 1;
    },
  };
}
