import { describe, expect, it } from 'vitest';
import { processPaymentEvent } from './processor';
import type { RecoveryStore } from './recovery/types';
import type { ClaimResult, LoadedEvent, ProcessingStore } from './types';
import { msgCtx, tokenCtx } from './_msgfakes';

interface Row {
  event: LoadedEvent;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  attempts: number;
  lastError?: string;
}

function makeFakeStore(seed: LoadedEvent[]) {
  const rows = new Map<string, Row>();
  for (const e of seed) rows.set(e.id, { event: e, status: 'PENDING', attempts: 0 });
  const ledger = new Set<string>();
  const store: ProcessingStore = {
    async loadEvent(id) {
      return rows.get(id)?.event ?? null;
    },
    async claimEvent(id): Promise<ClaimResult> {
      const r = rows.get(id);
      if (!r) return { claimed: false, reason: 'not_found' };
      if (r.status === 'PENDING' || r.status === 'FAILED') {
        r.status = 'PROCESSING';
        r.attempts += 1;
        return { claimed: true, attempts: r.attempts };
      }
      if (r.status === 'SUCCESS') return { claimed: false, reason: 'already_succeeded' };
      return { claimed: false, reason: 'already_processing' };
    },
    async markSuccess(id) {
      const r = rows.get(id);
      if (r) r.status = 'SUCCESS';
    },
    async markFailed(id, error) {
      const r = rows.get(id);
      if (r) {
        r.status = 'FAILED';
        r.lastError = error;
      }
    },
    async recordIdempotency({ provider, eventId }) {
      const k = `${provider}:${eventId}`;
      if (ledger.has(k)) throw { code: 'P2002' };
      ledger.add(k);
    },
  };
  return { store, rows, ledger };
}

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

const nullLogger = () => ({ info() {}, error() {} });

const deps = (store: ProcessingStore) => ({
  processingStore: store,
  recoveryStore: recoveryStoreStub,
  logger: nullLogger(),
  ...msgCtx(),
  ...tokenCtx(),
});

const EV: LoadedEvent = {
  id: 'pe_1',
  provider: 'razorpay',
  providerEventId: 'evt_1',
  eventType: 'payment.failed',
  payload: {},
};

describe('processPaymentEvent', () => {
  it('drives PENDING -> SUCCESS and writes the idempotency ledger', async () => {
    const { store, rows, ledger } = makeFakeStore([EV]);
    const r = await processPaymentEvent(deps(store), 'pe_1');
    expect(r.status).toBe('SUCCESS');
    expect(rows.get('pe_1')!.status).toBe('SUCCESS');
    expect(rows.get('pe_1')!.attempts).toBe(1);
    expect(ledger.has('razorpay:evt_1')).toBe(true);
  });

  it('returns SKIPPED not_found for an unknown event id', async () => {
    const { store } = makeFakeStore([]);
    const r = await processPaymentEvent(deps(store), 'missing');
    expect(r).toEqual({ status: 'SKIPPED', reason: 'not_found' });
  });

  it('marks FAILED (retryable) and does not throw when processing errors', async () => {
    const { store, rows } = makeFakeStore([EV]);
    store.recordIdempotency = async () => {
      throw new Error('boom');
    };
    const r = await processPaymentEvent(deps(store), 'pe_1');
    expect(r.status).toBe('FAILED');
    if (r.status === 'FAILED') expect(r.error).toBe('boom');
    expect(rows.get('pe_1')!.status).toBe('FAILED');
    expect(rows.get('pe_1')!.lastError).toBe('boom');
  });

  it('a FAILED event can be retried to SUCCESS', async () => {
    const { store, rows } = makeFakeStore([EV]);
    rows.get('pe_1')!.status = 'FAILED';
    rows.get('pe_1')!.attempts = 1;
    const r = await processPaymentEvent(deps(store), 'pe_1');
    expect(r.status).toBe('SUCCESS');
    expect(rows.get('pe_1')!.attempts).toBe(2);
  });

  it('concurrency: two simultaneous workers, only one processes', async () => {
    const { store, rows, ledger } = makeFakeStore([EV]);
    const [a, b] = await Promise.all([
      processPaymentEvent(deps(store), 'pe_1'),
      processPaymentEvent(deps(store), 'pe_1'),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['SKIPPED', 'SUCCESS']);
    expect(rows.get('pe_1')!.status).toBe('SUCCESS');
    expect(ledger.size).toBe(1);
  });

  it('an already-SUCCESS event is SKIPPED already_succeeded on reprocess', async () => {
    const { store } = makeFakeStore([EV]);
    await processPaymentEvent(deps(store), 'pe_1');
    const again = await processPaymentEvent(deps(store), 'pe_1');
    expect(again).toEqual({ status: 'SKIPPED', reason: 'already_succeeded' });
  });
});
