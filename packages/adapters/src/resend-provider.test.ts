import { describe, expect, it } from 'vitest';
import { createResendMessagingProvider } from './resend-provider';
import type { EmailClient, EmailMessage } from './email/email-types';

function recordingEmailClient(): { client: EmailClient; sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  const client: EmailClient = {
    async sendEmail(message) {
      sent.push(message);
      return { id: 'email_1' };
    },
  };
  return { client, sent };
}

describe('createResendMessagingProvider', () => {
  it('renders the recovery template to an email and returns the email id (success)', async () => {
    const { client, sent } = recordingEmailClient();
    const provider = createResendMessagingProvider(client);

    const res = await provider.sendMessage({
      phone: null,
      email: 'customer@example.com',
      template: 'PAYMENT_FAILED',
      variables: { amount: '499', currency: 'INR', updateUrl: 'https://app.test/u/abc' },
    });

    expect(res.providerMessageId).toBe('email_1');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('customer@example.com');
    expect(sent[0].subject.toLowerCase()).toContain('payment');
    // The CTA link is embedded in the HTML body.
    expect(sent[0].html).toContain('https://app.test/u/abc');
  });

  it('throws (fails loudly) when the message has no recipient email', async () => {
    const { client } = recordingEmailClient();
    const provider = createResendMessagingProvider(client);

    await expect(
      provider.sendMessage({
        phone: '+919999999999',
        email: null,
        template: 'PAYMENT_FAILED',
        variables: {},
      }),
    ).rejects.toThrow(/recipient email/);
  });

  it('propagates an EmailClient failure (never fakes success)', async () => {
    const client: EmailClient = {
      async sendEmail() {
        throw new Error('resend down');
      },
    };
    const provider = createResendMessagingProvider(client);

    await expect(
      provider.sendMessage({
        phone: null,
        email: 'customer@example.com',
        template: 'CARD_EXPIRED',
        variables: {},
      }),
    ).rejects.toThrow(/resend down/);
  });
});
