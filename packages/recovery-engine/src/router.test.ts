import { describe, expect, it, vi } from 'vitest';
import { isHandledEventType, routeEvent, HANDLED_EVENT_TYPES } from './router';
import type { LoadedEvent } from './types';
import type { RecoveryStore } from './recovery/types';
import { msgCtx } from './_msgfakes';

const recoveryStoreStub: RecoveryStore = {
  async findCaseByPaymentEventId() {
    return null;
  },
  async createCase() {
    return { id: 'c', paymentEventId: 'pe', status: 'OPEN', failureCategory: null };
  },
  async createAttempt() {
    return {
      id: 'a',
      recoveryCaseId: 'c',
      attemptNumber: 1,
      status: 'PENDING',
      scheduledAt: new Date(),
    };
  },
  async findAttempt() {
    return null;
  },
  async updateCaseStatus() {},
  async listCases() {
    return [];
  },
};

const FAILED_PAYLOAD = {
  payload: {
    payment: {
      entity: {
        id: 'pay_x',
        amount: 49900,
        currency: 'INR',
        email: 'c@example.com',
        contact: '+919876543210',
        error_description: 'Insufficient funds',
      },
    },
  },
};

const ev = (eventType: string): LoadedEvent => ({
  id: 'pe_1',
  provider: 'razorpay',
  providerEventId: 'evt_1',
  eventType,
  payload: eventType === 'payment.failed' ? FAILED_PAYLOAD : {},
});
const nullLogger = () => ({ info() {}, error() {} });
const ctx = (logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }) => ({
  logger,
  recoveryStore: recoveryStoreStub,
  ...msgCtx(),
});

describe('isHandledEventType', () => {
  it('recognizes the four handled types', () => {
    for (const t of HANDLED_EVENT_TYPES) expect(isHandledEventType(t)).toBe(true);
  });
  it('rejects unknown types', () => {
    expect(isHandledEventType('payment.authorized')).toBe(false);
  });
});

describe('routeEvent', () => {
  it('payment.failed handler classifies, opens a case, schedules attempt #1, and sends a message', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    await routeEvent('payment.failed')(ev('payment.failed'), ctx(logger));
    const events = logger.info.mock.calls.map((c) => (c[0] as { event?: string }).event);
    // Phase 6: the handler now also drives the messaging steps.
    expect(events).toContain('failure_classified');
    expect(events).toContain('message_template_selected');
    expect(events).toContain('message_sent');
  });

  it('returns a no-op logging handler for an unknown type', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    await routeEvent('payment.authorized')(ev('payment.authorized'), ctx(logger));
    expect(logger.info).toHaveBeenCalledOnce();
  });

  it('does not throw for any handled type', async () => {
    for (const t of HANDLED_EVENT_TYPES) {
      await expect(routeEvent(t)(ev(t), ctx(nullLogger()))).resolves.toBeUndefined();
    }
  });
});
