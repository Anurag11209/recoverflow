import type { MessageStore, MessagingProvider, MessageLogRecord } from './messaging/message-types';

/** In-memory MessageStore for unit tests (one message per attemptId; P2002 on dup). */
export function fakeMessageStore(): MessageStore {
  const logs = new Map<string, MessageLogRecord>();
  const byAttempt = new Map<string, string>();
  let seq = 0;
  return {
    async createMessageLog(input) {
      if (byAttempt.has(input.recoveryAttemptId)) throw { code: 'P2002' };
      const rec: MessageLogRecord = {
        id: `msg_${++seq}`,
        recoveryCaseId: input.recoveryCaseId,
        recoveryAttemptId: input.recoveryAttemptId,
        templateName: input.templateName,
        status: 'PENDING',
        recipientPhone: input.recipientPhone,
        providerMessageId: null,
      };
      logs.set(rec.id, rec);
      byAttempt.set(input.recoveryAttemptId, rec.id);
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
