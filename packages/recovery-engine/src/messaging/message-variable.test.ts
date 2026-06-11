import { describe, expect, it } from 'vitest';
import { sendRecoveryMessage } from './message-service';
import { fakeMessageStore } from '../_msgfakes';
import type { MessagingProvider, SendMessageInput } from './message-types';
import type { Logger } from '../logger';

const silentLogger: Logger = { info: () => {}, error: () => {} };

/** Provider that records the variables it was asked to send. */
function capturingProvider(): MessagingProvider & { last: SendMessageInput | null } {
  const self = {
    last: null as SendMessageInput | null,
    async sendMessage(input: SendMessageInput) {
      self.last = input;
      return { providerMessageId: 'msg_cap' };
    },
  };
  return self;
}

const base = {
  recoveryCaseId: 'rc_1',
  recoveryAttemptId: 'ra_1',
  recipientPhone: '+919876543210',
  failureCategory: 'INSUFFICIENT_FUNDS' as const,
  amount: 499,
  currency: 'INR',
  providerName: 'console',
};

describe('message variables (updateUrl)', () => {
  it('includes updateUrl in the variables sent to the provider', async () => {
    const provider = capturingProvider();
    const url = 'https://app.recoverflow.com/update-payment/abc123';
    await sendRecoveryMessage(fakeMessageStore(), provider, silentLogger, {
      ...base,
      updateUrl: url,
    });
    expect(provider.last?.variables.updateUrl).toBe(url);
  });

  it('omits updateUrl when none is provided', async () => {
    const provider = capturingProvider();
    await sendRecoveryMessage(fakeMessageStore(), provider, silentLogger, { ...base });
    expect(provider.last?.variables.updateUrl).toBeUndefined();
  });

  it('still carries category/amount/currency alongside updateUrl', async () => {
    const provider = capturingProvider();
    await sendRecoveryMessage(fakeMessageStore(), provider, silentLogger, {
      ...base,
      updateUrl: 'https://app.recoverflow.com/update-payment/xyz',
    });
    expect(provider.last?.variables).toMatchObject({
      category: 'INSUFFICIENT_FUNDS',
      amount: '499',
      currency: 'INR',
      updateUrl: 'https://app.recoverflow.com/update-payment/xyz',
    });
  });
});
