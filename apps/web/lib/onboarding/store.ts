import { prisma } from '@recoverflow/db';
import type { FirstWebhookEvent, OnboardingStore } from './detect';

/**
 * Prisma-backed OnboardingStore. The first PaymentEvent for a merchant is the
 * signal that a real, signature-verified webhook has arrived (processWebhook
 * only persists a PaymentEvent after verification), so its existence is what
 * "connected" means.
 */
export function createOnboardingStore(): OnboardingStore {
  return {
    async findFirstWebhookEvent(merchantId: string): Promise<FirstWebhookEvent | null> {
      const e = await prisma.paymentEvent.findFirst({
        where: { merchantId },
        orderBy: { receivedAt: 'asc' },
        select: { eventType: true, receivedAt: true },
      });
      return e ?? null;
    },
  };
}
