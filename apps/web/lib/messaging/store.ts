import { prisma } from '@recoverflow/db';
import type {
  MessageLogRecord,
  MessageStore,
  NewMessageLogInput,
} from '@recoverflow/recovery-engine';

const SELECT = {
  id: true,
  recoveryCaseId: true,
  recoveryAttemptId: true,
  templateName: true,
  status: true,
  recipientPhone: true,
  providerMessageId: true,
} as const;

/**
 * Prisma-backed MessageStore (ADR 0001 adapter). The unique recoveryAttemptId
 * enforces one message per attempt at the DB; createMessageLog lets that P2002
 * surface so the engine's message service can catch it and skip the resend
 * (at-most-once delivery).
 */
export function createMessageStore(): MessageStore {
  return {
    async createMessageLog(input: NewMessageLogInput): Promise<MessageLogRecord> {
      return prisma.messageLog.create({
        data: {
          recoveryCaseId: input.recoveryCaseId,
          merchantId: input.merchantId,
          recoveryAttemptId: input.recoveryAttemptId,
          messageType: input.messageType,
          provider: input.provider,
          templateName: input.templateName,
          recipientPhone: input.recipientPhone,
          payload: input.payload,
          status: 'PENDING',
        },
        select: SELECT,
      });
    },

    async findMessageByAttemptId(recoveryAttemptId: string): Promise<MessageLogRecord | null> {
      // recoveryAttemptId is unique only via a PARTIAL index (where not null),
      // which Prisma's client does not expose as a findUnique key. findFirst is
      // equivalent here: the partial unique guarantees at most one match.
      const m = await prisma.messageLog.findFirst({
        where: { recoveryAttemptId },
        select: SELECT,
      });
      return m ?? null;
    },

    async markSent(id: string, providerMessageId: string): Promise<void> {
      await prisma.messageLog.update({
        where: { id },
        data: { status: 'SENT', providerMessageId },
      });
    },

    async markFailed(id: string, errorMessage: string): Promise<void> {
      await prisma.messageLog.update({
        where: { id },
        data: { status: 'FAILED', errorMessage },
      });
    },

    async listMessages(limit = 50): Promise<MessageLogRecord[]> {
      return prisma.messageLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: SELECT,
      });
    },
  };
}
