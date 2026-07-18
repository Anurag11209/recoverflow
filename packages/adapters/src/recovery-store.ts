import { prisma, type Prisma } from '@recoverflow/db';
import type {
  AttemptStatus,
  DueAttempt,
  NewAttemptInput,
  NewCaseInput,
  RecoveryAttemptRecord,
  RecoveryAttribution,
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
        select: {
          id: true,
          paymentEventId: true,
          merchantId: true,
          status: true,
          failureCategory: true,
        },
      });
      return c ?? null;
    },

    async findOpenCaseByCustomer(
      merchantId: string,
      customerEmail: string | null,
      customerPhone: string | null,
    ): Promise<RecoveryCaseRecord | null> {
      const or: Prisma.RecoveryCaseWhereInput[] = [];
      if (customerEmail) or.push({ customerEmail });
      if (customerPhone) or.push({ customerPhone });
      if (or.length === 0) return null; // nothing to match on
      const c = await prisma.recoveryCase.findFirst({
        where: { merchantId, status: 'OPEN', OR: or },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          paymentEventId: true,
          merchantId: true,
          status: true,
          failureCategory: true,
        },
      });
      return c ?? null;
    },

    async createCase(input: NewCaseInput): Promise<RecoveryCaseRecord> {
      const c = await prisma.recoveryCase.create({
        data: {
          paymentEventId: input.paymentEventId,
          merchantId: input.merchantId,
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
        select: {
          id: true,
          paymentEventId: true,
          merchantId: true,
          status: true,
          failureCategory: true,
        },
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
    async markRecovered(
      caseId: string,
      recoveredAmount: number,
      recoveredAt: Date,
      attribution: RecoveryAttribution,
    ): Promise<void> {
      await prisma.recoveryCase.update({
        where: { id: caseId },
        data: {
          status: 'RECOVERED',
          recoveredAmount,
          recoveredAt,
          recoveryAttribution: attribution,
        },
      });
    },

    async listCases(limit = 50): Promise<RecoveryCaseRecord[]> {
      return prisma.recoveryCase.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          paymentEventId: true,
          merchantId: true,
          status: true,
          failureCategory: true,
        },
      });
    },

    async listDueAttempts(now: Date, limit: number): Promise<DueAttempt[]> {
      // Backed by @@index([status, scheduledAt]) on RecoveryAttempt.
      const rows = await prisma.recoveryAttempt.findMany({
        where: { status: 'PENDING', scheduledAt: { lte: now } },
        orderBy: { scheduledAt: 'asc' },
        take: limit,
        select: {
          id: true,
          attemptNumber: true,
          scheduledAt: true,
          recoveryCase: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              merchantId: true,
              customerPhone: true,
              customerEmail: true,
              amount: true,
              currency: true,
              failureCategory: true,
              subscriptionId: true,
              subscription: { select: { status: true } },
            },
          },
        },
      });
      return rows.map((r) => ({
        attempt: { id: r.id, attemptNumber: r.attemptNumber, scheduledAt: r.scheduledAt },
        case: {
          id: r.recoveryCase.id,
          status: r.recoveryCase.status,
          createdAt: r.recoveryCase.createdAt,
          merchantId: r.recoveryCase.merchantId,
          customerPhone: r.recoveryCase.customerPhone,
          customerEmail: r.recoveryCase.customerEmail,
          amount: r.recoveryCase.amount === null ? null : r.recoveryCase.amount.toNumber(),
          currency: r.recoveryCase.currency,
          failureCategory: r.recoveryCase.failureCategory,
        },
        subscriptionStatus: r.recoveryCase.subscription?.status ?? null,
        hasSubscription: r.recoveryCase.subscriptionId !== null,
      }));
    },

    async markAttemptExecuted(
      attemptId: string,
      status: AttemptStatus,
      executedAt: Date,
      failureReason: string | null = null,
    ): Promise<void> {
      await prisma.recoveryAttempt.update({
        where: { id: attemptId },
        data: { status, executedAt, failureReason },
      });
    },
  };
}
