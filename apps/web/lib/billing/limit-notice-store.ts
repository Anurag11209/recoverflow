import { prisma } from '@recoverflow/db';
import type { PlanLimitNoticeStore } from './limit-notify';

// P2002 = Prisma unique-constraint violation. Matched structurally so this stays
// decoupled from the Prisma error class.
function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/**
 * Prisma-backed PlanLimitNoticeStore. The unique (merchantId, period) turns
 * claimNotice into an atomic once-per-period claim: the first insert wins, a
 * concurrent/later insert throws P2002 and returns false — no double email.
 */
export function createPlanLimitNoticeStore(): PlanLimitNoticeStore {
  return {
    async claimNotice(merchantId, period) {
      try {
        await prisma.planLimitNotice.create({ data: { merchantId, period } });
        return true;
      } catch (e) {
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
  };
}
