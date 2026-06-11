import { describe, expect, it, vi } from 'vitest';
import { isHandledEventType, routeEvent, HANDLED_EVENT_TYPES } from './router';
import type { LoadedEvent } from './types';
import type { RecoveryStore } from './recovery/types';

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
  it('payment.failed handler classifies, opens a case and schedules attempt #1 (logs each step)', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    await routeEvent('payment.failed')(ev('payment.failed'), {
      logger,
      recoveryStore: recoveryStoreStub,
    });
    // Phase 5: the real handler logs failure_classified + recovery_case_created
    // + recovery_attempt_created (3), not the single Phase-4 noop line.
    const events = logger.info.mock.calls.map((c) => (c[0] as { event?: string }).event);
    expect(events).toContain('failure_classified');
    expect(logger.info).toHaveBeenCalledTimes(3);
  });

  it('returns a no-op logging handler for an unknown type', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    await routeEvent('payment.authorized')(ev('payment.authorized'), {
      logger,
      recoveryStore: recoveryStoreStub,
    });
    expect(logger.info).toHaveBeenCalledOnce();
  });

  it('does not throw for any handled type', async () => {
    for (const t of HANDLED_EVENT_TYPES) {
      await expect(
        routeEvent(t)(ev(t), { logger: nullLogger(), recoveryStore: recoveryStoreStub }),
      ).resolves.toBeUndefined();
    }
  });
});
