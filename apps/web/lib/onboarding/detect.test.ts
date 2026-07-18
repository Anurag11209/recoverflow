import { describe, expect, it } from 'vitest';
import {
  resolveConnectionStatus,
  getConnectionStatus,
  type FirstWebhookEvent,
  type OnboardingStore,
} from './detect';

function storeWith(event: FirstWebhookEvent | null): OnboardingStore {
  return {
    async findFirstWebhookEvent() {
      return event;
    },
  };
}

describe('resolveConnectionStatus', () => {
  it('is pending (not connected) when no webhook event has arrived', () => {
    expect(resolveConnectionStatus(null)).toEqual({ connected: false });
  });

  it('is connected with the first event details once an event exists', () => {
    const receivedAt = new Date('2026-07-18T10:00:00.000Z');
    expect(resolveConnectionStatus({ eventType: 'payment.failed', receivedAt })).toEqual({
      connected: true,
      firstEvent: { eventType: 'payment.failed', receivedAt: '2026-07-18T10:00:00.000Z' },
    });
  });
});

describe('getConnectionStatus', () => {
  it('returns pending when the store finds no event', async () => {
    expect(await getConnectionStatus(storeWith(null), 'm1')).toEqual({ connected: false });
  });

  it('returns connected with details when the store finds the first event', async () => {
    const receivedAt = new Date('2026-07-18T10:00:00.000Z');
    const status = await getConnectionStatus(
      storeWith({ eventType: 'subscription.charged', receivedAt }),
      'm1',
    );
    expect(status.connected).toBe(true);
    if (status.connected) {
      expect(status.firstEvent.eventType).toBe('subscription.charged');
      expect(status.firstEvent.receivedAt).toBe('2026-07-18T10:00:00.000Z');
    }
  });

  it('queries the store with the given merchantId', async () => {
    let seen: string | null = null;
    const store: OnboardingStore = {
      async findFirstWebhookEvent(merchantId) {
        seen = merchantId;
        return null;
      },
    };
    await getConnectionStatus(store, 'merchant_42');
    expect(seen).toBe('merchant_42');
  });
});
