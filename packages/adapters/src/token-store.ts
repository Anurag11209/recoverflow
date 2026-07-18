import { prisma } from '@recoverflow/db';
import type { TokenRecord, TokenStore } from '@recoverflow/recovery-engine';

/**
 * Prisma-backed TokenStore (ADR 0001 adapter). The engine owns token logic;
 * this only persists. Security-relevant detail: markUsed is an ATOMIC
 * conditional claim (updateMany WHERE usedAt IS NULL) so a single token can be
 * consumed exactly once even under concurrent POSTs (D5, mirrors the Phase 4
 * event-claim pattern). Only the writer whose update changes a row wins.
 */
const SELECT = {
  id: true,
  recoveryCaseId: true,
  merchantId: true,
  tokenHash: true,
  expiresAt: true,
  usedAt: true,
  supersededAt: true,
} as const;

export function createTokenStore(): TokenStore {
  return {
    async supersedeActiveTokens(recoveryCaseId, now) {
      await prisma.paymentUpdateToken.updateMany({
        where: {
          recoveryCaseId,
          usedAt: null,
          supersededAt: null,
          expiresAt: { gt: now },
        },
        data: { supersededAt: now },
      });
    },

    async createToken(input): Promise<TokenRecord> {
      return prisma.paymentUpdateToken.create({
        data: {
          recoveryCaseId: input.recoveryCaseId,
          merchantId: input.merchantId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
        select: SELECT,
      });
    },

    async findByHash(tokenHash): Promise<TokenRecord | null> {
      const t = await prisma.paymentUpdateToken.findUnique({
        where: { tokenHash },
        select: SELECT,
      });
      return t ?? null;
    },

    async markUsed(id, now): Promise<boolean> {
      // Atomic single-use claim: only succeeds if the token is still unused.
      const { count } = await prisma.paymentUpdateToken.updateMany({
        where: { id, usedAt: null },
        data: { usedAt: now },
      });
      return count === 1;
    },
  };
}
