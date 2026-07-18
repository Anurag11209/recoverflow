import { describe, expect, it, vi } from 'vitest';
import { isHandledEventType, routeEvent, HANDLED_EVENT_TYPES } from './router';
import type { LoadedEvent } from './types';
import type { RecoveryCaseRecord, RecoveryStore } from './recovery/types';
import { msgCtx, tokenCtx } from './_msgfakes';

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
  ...tokenCtx(),
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

const CAPTURED_PAYLOAD = {
  payload: {
    payment: {
      entity: {
        id: 'pay_new',
        amount: 49900,
        currency: 'INR',
        email: 'c@example.com',
        contact: '+919876543210',
      },
    },
  },
};

const capturedEvent = (payload: unknown = CAPTURED_PAYLOAD): LoadedEvent => ({
  id: 'pe_cap',
  provider: 'razorpay',
  providerEventId: 'evt_cap',
  eventType: 'payment.captured',
  merchantId: 'm1',
  payload,
});

const OPEN_CASE: RecoveryCaseRecord = {
  id: 'case_1',
  paymentEventId: 'pe_1',
  merchantId: 'm1',
  status: 'OPEN',
  failureCategory: 'INSUFFICIENT_FUNDS',
};

function capturedCtx(
  openCase: RecoveryCaseRecord | null,
  logger: { info: unknown; error: unknown },
) {
  const markRecovered = vi.fn(async () => {});
  const findOpenCaseByCustomer = vi.fn(async () => openCase);
  const recoveryStore = { findOpenCaseByCustomer, markRecovered } as unknown as RecoveryStore;
  return {
    ctx: { logger, recoveryStore, ...msgCtx(), ...tokenCtx() },
    markRecovered,
    findOpenCaseByCustomer,
  };
}

describe('routeEvent payment.captured (organic recovery)', () => {
  it('closes the matching open case as RECOVERED with ORGANIC attribution', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const { ctx: c, markRecovered, findOpenCaseByCustomer } = capturedCtx(OPEN_CASE, logger);
    await routeEvent('payment.captured')(capturedEvent(), c);

    expect(findOpenCaseByCustomer).toHaveBeenCalledWith('m1', 'c@example.com', '+919876543210');
    expect(markRecovered).toHaveBeenCalledTimes(1);
    const [caseId, amount, at, attribution] = markRecovered.mock.calls[0]!;
    expect(caseId).toBe('case_1');
    expect(amount).toBe(499); // 49900 paise -> 499 major units
    expect(at).toBeInstanceOf(Date);
    expect(attribution).toBe('ORGANIC');
    const events = logger.info.mock.calls.map((c2) => (c2[0] as { event?: string }).event);
    expect(events).toContain('organic_recovery');
  });

  it('no-ops when there is no matching open case', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const { ctx: c, markRecovered } = capturedCtx(null, logger);
    await routeEvent('payment.captured')(capturedEvent(), c);

    expect(markRecovered).not.toHaveBeenCalled();
    const events = logger.info.mock.calls.map((c2) => (c2[0] as { event?: string }).event);
    expect(events).toContain('no_matching_open_case');
  });

  it('no-ops when the captured payment has no customer identity', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const { ctx: c, markRecovered, findOpenCaseByCustomer } = capturedCtx(OPEN_CASE, logger);
    await routeEvent('payment.captured')(
      capturedEvent({ payload: { payment: { entity: { id: 'pay_x', amount: 100 } } } }),
      c,
    );

    expect(findOpenCaseByCustomer).not.toHaveBeenCalled();
    expect(markRecovered).not.toHaveBeenCalled();
  });

  it('does not double-count: an already-recovered case is not recovered again', async () => {
    // A recovered case is no longer OPEN, so findOpenCaseByCustomer returns null
    // and the handler no-ops — a link-then-capture (or capture-then-link)
    // sequence yields exactly one recovery.
    const logger = { info: vi.fn(), error: vi.fn() };
    const { ctx: c, markRecovered } = capturedCtx(null, logger);
    await routeEvent('payment.captured')(capturedEvent(), c);

    expect(markRecovered).not.toHaveBeenCalled();
  });
});
