import type { MessageStore, MessagingProvider, MessageLogRecord } from './messaging/message-types';
import type { TokenStore, TokenRecord } from './payment-update/token-types';

/** In-memory MessageStore for unit tests (one message per attemptId; P2002 on dup). */
export function fakeMessageStore(): MessageStore {
  const logs = new Map<string, MessageLogRecord>();
  const byAttempt = new Map<string, string>();
  let seq = 0;
  return {
    async createMessageLog(input) {
      // Partial-unique semantics: dedup only on NON-null attemptId. Null-attempt
      // messages (recovered/reminder) are unconstrained, matching the DB.
      if (input.recoveryAttemptId !== null && byAttempt.has(input.recoveryAttemptId)) {
        throw { code: 'P2002' };
      }
      const rec: MessageLogRecord = {
        id: `msg_${++seq}`,
        recoveryCaseId: input.recoveryCaseId,
        recoveryAttemptId: input.recoveryAttemptId,
        templateName: input.templateName,
        status: 'PENDING',
        recipientPhone: input.recipientPhone,
        recipientEmail: input.recipientEmail,
        providerMessageId: null,
      };
      logs.set(rec.id, rec);
      if (input.recoveryAttemptId !== null) byAttempt.set(input.recoveryAttemptId, rec.id);
      return rec;
    },
    async findMessageByAttemptId(id) {
      const k = byAttempt.get(id);
      return k ? logs.get(k)! : null;
    },
    async markSent(id, pmid) {
      const l = logs.get(id);
      if (l) {
        l.status = 'SENT';
        l.providerMessageId = pmid;
      }
    },
    async markFailed(id) {
      const l = logs.get(id);
      if (l) l.status = 'FAILED';
    },
    async listMessages() {
      return [...logs.values()];
    },
  };
}

/** Fake MessagingProvider returning a fixed id. */
export function fakeProvider(): MessagingProvider {
  return {
    async sendMessage() {
      return { providerMessageId: 'msg_test' };
    },
  };
}

/** The messaging slice of a HandlerContext / ProcessDeps for tests. */
export const msgCtx = () => ({
  messageStore: fakeMessageStore(),
  messagingProvider: fakeProvider(),
  messagingProviderName: 'console',
});

/** In-memory TokenStore for unit tests (atomic single-use claim semantics). */
export function fakeTokenStore(): TokenStore {
  const rows = new Map<string, TokenRecord>();
  let seq = 0;
  return {
    async supersedeActiveTokens(recoveryCaseId, now) {
      for (const r of rows.values()) {
        if (
          r.recoveryCaseId === recoveryCaseId &&
          r.usedAt === null &&
          r.supersededAt === null &&
          r.expiresAt.getTime() > now.getTime()
        ) {
          r.supersededAt = now;
        }
      }
    },
    async createToken(input) {
      const rec: TokenRecord = {
        id: `tok_${++seq}`,
        recoveryCaseId: input.recoveryCaseId,
        merchantId: input.merchantId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        usedAt: null,
        supersededAt: null,
      };
      rows.set(rec.id, rec);
      return rec;
    },
    async findByHash(tokenHash) {
      return [...rows.values()].find((r) => r.tokenHash === tokenHash) ?? null;
    },
    async markUsed(id, now) {
      const r = rows.get(id);
      if (!r || r.usedAt !== null) return false;
      r.usedAt = now;
      return true;
    },
  };
}

/** The token slice of a HandlerContext / ProcessDeps for tests. */
export const tokenCtx = () => ({
  tokenStore: fakeTokenStore(),
  clock: { now: () => new Date() },
  buildPaymentUpdateUrl: (token: string) => `https://app.test/update-payment/${token}`,
});
