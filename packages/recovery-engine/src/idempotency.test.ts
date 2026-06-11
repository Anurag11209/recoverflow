import { describe, expect, it } from 'vitest';
import { isUniqueViolation, processingKey, recordIdempotency } from './idempotency';
import type { ProcessingStore } from './types';

function fakeStore(overrides: Partial<ProcessingStore> = {}): ProcessingStore {
  return {
    loadEvent: async () => null,
    claimEvent: async () => ({ claimed: true, attempts: 1 }),
    markSuccess: async () => {},
    markFailed: async () => {},
    recordIdempotency: async () => {},
    ...overrides,
  };
}

describe('isUniqueViolation', () => {
  it('detects a P2002-shaped error', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
  });
  it('ignores other errors', () => {
    expect(isUniqueViolation(new Error('nope'))).toBe(false);
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('processingKey', () => {
  it('is provider-scoped and stable', () => {
    expect(processingKey('razorpay', 'evt_1')).toBe('razorpay:evt_1');
  });
});

describe('recordIdempotency', () => {
  const args = {
    provider: 'razorpay',
    eventId: 'evt_1',
    eventType: 'payment.failed',
    processingKey: 'razorpay:evt_1',
  };

  it('returns recorded on first write', async () => {
    let written = 0;
    const store = fakeStore({
      recordIdempotency: async () => {
        written++;
      },
    });
    expect(await recordIdempotency(store, args)).toBe('recorded');
    expect(written).toBe(1);
  });

  it('returns already_recorded on a duplicate (P2002)', async () => {
    const store = fakeStore({
      recordIdempotency: async () => {
        throw { code: 'P2002' };
      },
    });
    expect(await recordIdempotency(store, args)).toBe('already_recorded');
  });

  it('propagates non-unique errors', async () => {
    const store = fakeStore({
      recordIdempotency: async () => {
        throw new Error('db down');
      },
    });
    await expect(recordIdempotency(store, args)).rejects.toThrow('db down');
  });
});
