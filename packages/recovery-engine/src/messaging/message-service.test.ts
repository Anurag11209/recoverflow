import { describe, expect, it, vi } from 'vitest';
import { sendRecoveryMessage, type SendRecoveryMessageInput } from './message-service';
import type { MessageLogRecord, MessageStore, MessagingProvider } from './message-types';

const nullLogger = () => ({ info() {}, error() {} });

function makeFakeStore() {
  const logs = new Map<string, MessageLogRecord>();
  const byAttempt = new Map<string, string>();
  let seq = 0;
  const store: MessageStore = {
    async createMessageLog(input) {
      if (byAttempt.has(input.recoveryAttemptId)) throw { code: 'P2002' };
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
      byAttempt.set(input.recoveryAttemptId, rec.id);
      return rec;
    },
    async findMessageByAttemptId(attemptId) {
      const id = byAttempt.get(attemptId);
      return id ? logs.get(id)! : null;
    },
    async markSent(id, pmid) {
      const l = logs.get(id);
      if (l) {
        l.status = 'SENT';
        l.providerMessageId = pmid;
      }
    },
    async markFailed(id, err) {
      const l = logs.get(id);
      if (l) {
        l.status = 'FAILED';
        (l as MessageLogRecord & { errorMessage?: string }).errorMessage = err;
      }
    },
    async listMessages() {
      return [...logs.values()];
    },
  };
  return { store, logs };
}

function okProvider() {
  const sendMessage = vi.fn(async () => ({ providerMessageId: 'msg_12345' }));
  return { provider: { sendMessage } as MessagingProvider, sendMessage };
}

const input = (over: Partial<SendRecoveryMessageInput> = {}): SendRecoveryMessageInput => ({
  recoveryCaseId: 'case_1',
  recoveryAttemptId: 'att_1',
  recipientPhone: '+919876543210',
  recipientEmail: null,
  failureCategory: 'INSUFFICIENT_FUNDS',
  amount: 499,
  currency: 'INR',
  providerName: 'console',
  ...over,
});

describe('sendRecoveryMessage', () => {
  it('happy path: creates log, sends once, marks SENT with providerMessageId', async () => {
    const { store, logs } = makeFakeStore();
    const { provider, sendMessage } = okProvider();
    const r = await sendRecoveryMessage(store, provider, nullLogger(), input());
    expect(r.status).toBe('sent');
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      phone: '+919876543210',
      email: null,
      template: 'PAYMENT_FAILED',
      variables: { category: 'INSUFFICIENT_FUNDS', amount: '499', currency: 'INR' },
    });
    const log = [...logs.values()][0]!;
    expect(log.status).toBe('SENT');
    expect(log.providerMessageId).toBe('msg_12345');
  });

  it('provider failure: log marked FAILED, returns failed, does NOT throw', async () => {
    const { store, logs } = makeFakeStore();
    const provider: MessagingProvider = {
      sendMessage: async () => {
        throw new Error('whatsapp down');
      },
    };
    const r = await sendRecoveryMessage(store, provider, nullLogger(), input());
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.error).toBe('whatsapp down');
    expect([...logs.values()][0]!.status).toBe('FAILED');
  });

  it('duplicate: second call skips, provider called exactly once total, one log', async () => {
    const { store, logs } = makeFakeStore();
    const { provider, sendMessage } = okProvider();
    const first = await sendRecoveryMessage(store, provider, nullLogger(), input());
    const second = await sendRecoveryMessage(store, provider, nullLogger(), input());
    expect(first.status).toBe('sent');
    expect(second.status).toBe('skipped_duplicate');
    if (second.status === 'skipped_duplicate' && first.status === 'sent') {
      expect(second.messageLogId).toBe(first.messageLogId);
    }
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(logs.size).toBe(1);
  });

  it('no recipient (neither phone nor email): log created then FAILED, provider never called', async () => {
    const { store, logs } = makeFakeStore();
    const { provider, sendMessage } = okProvider();
    const r = await sendRecoveryMessage(
      store,
      provider,
      nullLogger(),
      input({ recipientPhone: null, recipientEmail: null }),
    );
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.error).toBe('missing recipient');
    expect(sendMessage).not.toHaveBeenCalled();
    expect([...logs.values()][0]!.status).toBe('FAILED');
  });

  it('selects CARD_EXPIRED for EXPIRED_CARD', async () => {
    const { store } = makeFakeStore();
    const { provider, sendMessage } = okProvider();
    await sendRecoveryMessage(
      store,
      provider,
      nullLogger(),
      input({ failureCategory: 'EXPIRED_CARD' }),
    );
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ template: 'CARD_EXPIRED' }));
  });

  it('emits the structured log events in order', async () => {
    const { store } = makeFakeStore();
    const { provider } = okProvider();
    const logger = { info: vi.fn(), error: vi.fn() };
    await sendRecoveryMessage(store, provider, logger, input());
    const events = logger.info.mock.calls.map((c) => (c[0] as { event?: string }).event);
    expect(events).toEqual(['message_template_selected', 'message_log_created', 'message_sent']);
  });

  it('non-duplicate store errors propagate (event stays retryable)', async () => {
    const { store } = makeFakeStore();
    store.createMessageLog = async () => {
      throw new Error('db down');
    };
    const { provider } = okProvider();
    await expect(sendRecoveryMessage(store, provider, nullLogger(), input())).rejects.toThrow(
      'db down',
    );
  });
});
