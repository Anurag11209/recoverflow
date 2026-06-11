import { describe, expect, it, vi } from 'vitest';
import { isHandledEventType, routeEvent, HANDLED_EVENT_TYPES } from './router';
import type { LoadedEvent } from './types';

const ev = (eventType: string): LoadedEvent => ({
  id: 'pe_1',
  provider: 'razorpay',
  providerEventId: 'evt_1',
  eventType,
});
const nullLogger = () => ({ info() {}, error() {} });

describe('isHandledEventType', () => {
  it('recognizes the four handled types', () => {
    for (const t of HANDLED_EVENT_TYPES) expect(isHandledEventType(t)).toBe(true);
  });
  it('rejects unknown types', () => {
    expect(isHandledEventType('payment.authorized')).toBe(false);
  });
});

describe('routeEvent', () => {
  it('returns a handler that logs for a known type', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    await routeEvent('payment.failed')(ev('payment.failed'), logger);
    expect(logger.info).toHaveBeenCalledOnce();
  });

  it('returns a no-op logging handler for an unknown type', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    await routeEvent('payment.authorized')(ev('payment.authorized'), logger);
    expect(logger.info).toHaveBeenCalledOnce();
  });

  it('does not throw for any handled type', async () => {
    for (const t of HANDLED_EVENT_TYPES) {
      await expect(routeEvent(t)(ev(t), nullLogger())).resolves.toBeUndefined();
    }
  });
});
