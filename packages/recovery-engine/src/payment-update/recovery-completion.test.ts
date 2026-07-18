import { describe, expect, it, vi } from 'vitest';
import { completeRecovery, type CompleteRecoveryDeps } from './recovery-completion';
import { fakeMessageStore, fakeProvider } from '../_msgfakes';
import type { Logger } from '../logger';
import type { RecoveryStore } from '../recovery/types';
import type { PaymentMethodUpdater } from './payment-method-updater';
import type { MessagingProvider } from '../messaging/message-types';

const silentLogger: Logger = { info: () => {}, error: () => {} };
const T0 = new Date('2026-06-11T12:00:00.000Z');

/** Minimal RecoveryStore stub; only markRecovered is exercised here. */
function fakeRecoveryStore(): RecoveryStore & {
  recovered: Array<{ id: string; amount: number; at: Date }>;
} {
  const recovered: Array<{ id: string; amount: number; at: Date }> = [];
  return {
    recovered,
    async findCaseByPaymentEventId() {
      return null;
    },
    async createCase() {
      throw new Error('not used');
    },
    async createAttempt() {
      throw new Error('not used');
    },
    async findAttempt() {
      return null;
    },
    async updateCaseStatus() {},
    async markRecovered(id, amount, at) {
      recovered.push({ id, amount, at });
    },
    async listCases() {
      return [];
    },
  };
}

function succeedingUpdater(): PaymentMethodUpdater {
  return {
    async updatePaymentMethod() {
      return { success: true, simulated: true, providerReference: 'sim_abc' };
    },
  };
}
function failingUpdater(): PaymentMethodUpdater {
  return {
    async updatePaymentMethod() {
      return { success: false, simulated: true, providerReference: '' };
    },
  };
}

function deps(over: Partial<CompleteRecoveryDeps> = {}): CompleteRecoveryDeps {
  return {
    recoveryStore: fakeRecoveryStore(),
    messageStore: fakeMessageStore(),
    messagingProvider: fakeProvider(),
    messagingProviderName: 'console',
    updater: succeedingUpdater(),
    logger: silentLogger,
    now: () => T0,
    ...over,
  };
}

const input = {
  recoveryCaseId: 'rc_1',
  providerPaymentId: 'pay_1',
  recipientPhone: '+919876543210',
  recipientEmail: null,
  amount: 499,
  currency: 'INR',
};

describe('completeRecovery', () => {
  it('marks the case RECOVERED with amount + timestamp on updater success', async () => {
    const store = fakeRecoveryStore();
    const res = await completeRecovery(deps({ recoveryStore: store }), input);
    expect(res).toEqual({ status: 'recovered', recoveredAmount: 499, simulated: true });
    expect(store.recovered).toEqual([{ id: 'rc_1', amount: 499, at: T0 }]);
  });

  it('sends a PAYMENT_RECOVERED message (null attempt) on success', async () => {
    const provider = fakeProvider();
    const spy = vi.spyOn(provider, 'sendMessage');
    await completeRecovery(deps({ messagingProvider: provider }), input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0].template).toBe('PAYMENT_RECOVERED');
  });

  it('does NOT recover when the updater fails', async () => {
    const store = fakeRecoveryStore();
    const res = await completeRecovery(
      deps({ recoveryStore: store, updater: failingUpdater() }),
      input,
    );
    expect(res).toEqual({ status: 'update_failed' });
    expect(store.recovered).toHaveLength(0);
  });

  it('still completes the recovery when the success message fails to send', async () => {
    const store = fakeRecoveryStore();
    const failingProvider: MessagingProvider = {
      async sendMessage() {
        throw new Error('whatsapp down');
      },
    };
    const res = await completeRecovery(
      deps({ recoveryStore: store, messagingProvider: failingProvider }),
      input,
    );
    // Recovery is real even though the message failed (must not roll back).
    expect(res.status).toBe('recovered');
    expect(store.recovered).toEqual([{ id: 'rc_1', amount: 499, at: T0 }]);
  });

  it('recovers amount 0 when amount is null (no crash)', async () => {
    const store = fakeRecoveryStore();
    const res = await completeRecovery(deps({ recoveryStore: store }), { ...input, amount: null });
    expect(res).toEqual({ status: 'recovered', recoveredAmount: 0, simulated: true });
  });
});
