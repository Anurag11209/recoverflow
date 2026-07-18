import { prisma } from '@recoverflow/db';
import type { PlanTier } from '@recoverflow/db';
import { getEnv, logger } from '@recoverflow/shared';
import { createEmailClient } from '@recoverflow/adapters';
import { notifyPlanLimitReached, type NotifyLimitOutcome } from './limit-notify';
import { createPlanLimitNoticeStore } from './limit-notice-store';

/**
 * Composition root for the plan-limit notification: wires the Prisma notice
 * store, the configured email client (Resend in prod, console in dev), and the
 * merchant email lookup, then delegates to the pure trigger. Called best-effort
 * from the webhook route at the drop point.
 */
export async function notifyMerchantLimitReached(input: {
  merchantId: string;
  plan: PlanTier;
  limit: number;
  now?: Date;
}): Promise<NotifyLimitOutcome> {
  return notifyPlanLimitReached(
    {
      store: createPlanLimitNoticeStore(),
      emailClient: createEmailClient(),
      findMerchantEmail: async (merchantId) => {
        const m = await prisma.merchant.findUnique({
          where: { id: merchantId },
          select: { email: true },
        });
        return m?.email ?? null;
      },
      buildUpgradeUrl: () => `${getEnv().NEXT_PUBLIC_APP_URL}/dashboard/billing`,
      logger,
    },
    {
      merchantId: input.merchantId,
      plan: input.plan,
      limit: input.limit,
      now: input.now ?? new Date(),
    },
  );
}
