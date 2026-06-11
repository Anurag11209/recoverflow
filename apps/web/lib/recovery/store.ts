import { prisma } from '@recoverflow/db';
import type {
  NewAttemptInput,
  NewCaseInput,
  RecoveryAttemptRecord,
  RecoveryCaseRecord,
  RecoveryStatus,
  RecoveryStore,
} from '@recoverflow/recovery-engine';

/**
 * Prisma-backed RecoveryStore (ADR 0001 adapter). Enforces one-case-per-event
 * (unique paymentEventId) and unique (recoveryCaseId, attemptNumber) at the DB;
 * the engine's services catch P2002 and return the existing row.
 */
export function createRecoveryStore(): RecoveryStore {
  return {
    async findCaseByPaymentEventId(paymentEventId: string): Promise<RecoveryCaseRecord | null> {
      const c = await prisma.recoveryCase.findUnique({
        where: { paymentEventId },
        select: { id: true, paymentEventId: true, status: true, failureCategory: true },
      });
      return c ?? null;
    },

    async createCase(input: NewCaseInput): Promise<RecoveryCaseRecord> {
      const c = await prisma.recoveryCase.create({
        data: {
          paymentEventId: input.paymentEventId,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          amount: input.amount,
          currency: input.currency,
          failureReason: input.failureReason,
          failureCategory: input.failureCategory,
          status: 'OPEN',
        },
        select: { id: true, paymentEventId: true, status: true, failureCategory: true },
      });
      return c;
    },

    async createAttempt(input: NewAttemptInput): Promise<RecoveryAttemptRecord> {
      const a = await prisma.recoveryAttempt.create({
        data: {
          recoveryCaseId: input.recoveryCaseId,
          attemptNumber: input.attemptNumber,
          scheduledAt: input.scheduledAt,
          status: 'PENDING',
        },
        select: {
          id: true,
          recoveryCaseId: true,
          attemptNumber: true,
          status: true,
          scheduledAt: true,
        },
      });
      return a;
    },

    async findAttempt(
      recoveryCaseId: string,
      attemptNumber: number,
    ): Promise<RecoveryAttemptRecord | null> {
      const a = await prisma.recoveryAttempt.findUnique({
        where: { recoveryCaseId_attemptNumber: { recoveryCaseId, attemptNumber } },
        select: {
          id: true,
          recoveryCaseId: true,
          attemptNumber: true,
          status: true,
          scheduledAt: true,
        },
      });
      return a ?? null;
    },

    async updateCaseStatus(caseId: string, status: RecoveryStatus): Promise<void> {
      await prisma.recoveryCase.update({ where: { id: caseId }, data: { status } });
    },
    async markRecovered(caseId: string, recoveredAmount: number, recoveredAt: Date): Promise<void> {
      await prisma.recoveryCase.update({
        where: { id: caseId },
        data: { status: 'RECOVERED', recoveredAmount, recoveredAt },
      });
    },

    async listCases(limit = 50): Promise<RecoveryCaseRecord[]> {
      return prisma.recoveryCase.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, paymentEventId: true, status: true, failureCategory: true },
      });
    },
  };
}
