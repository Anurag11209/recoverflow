import { describe, expect, it } from 'vitest';
import { createRecoveryCase, updateCaseStatus } from './case-service';
import type {
  NewCaseInput,
  RecoveryAttemptRecord,
  RecoveryCaseRecord,
  RecoveryStatus,
  RecoveryStore,
} from './types';

const nullLogger = () => ({ info() {}, error() {} });

function makeFakeStore() {
  const cases = new Map<string, RecoveryCaseRecord>();
  const byEvent = new Map<string, string>();
  const attempts = new Map<string, RecoveryAttemptRecord>();
  let seq = 0;
  const store: RecoveryStore = {
    async findCaseByPaymentEventId(peId) {
      const id = byEvent.get(peId);
      return id ? cases.get(id)! : null;
    },
    async createCase(input: NewCaseInput) {
      if (byEvent.has(input.paymentEventId)) throw { code: 'P2002' };
      const rec: RecoveryCaseRecord = {
        id: `case_${++seq}`,
        paymentEventId: input.paymentEventId,
        status: 'OPEN',
        failureCategory: input.failureCategory,
      };
      cases.set(rec.id, rec);
      byEvent.set(input.paymentEventId, rec.id);
      return rec;
    },
    async createAttempt(input) {
      const k = `${input.recoveryCaseId}:${input.attemptNumber}`;
      if (attempts.has(k)) throw { code: 'P2002' };
      const rec: RecoveryAttemptRecord = {
        id: `att_${++seq}`,
        recoveryCaseId: input.recoveryCaseId,
        attemptNumber: input.attemptNumber,
        status: 'PENDING',
        scheduledAt: input.scheduledAt,
      };
      attempts.set(k, rec);
      return rec;
    },
    async findAttempt(caseId, n) {
      return attempts.get(`${caseId}:${n}`) ?? null;
    },
    async updateCaseStatus(caseId, status) {
      const c = cases.get(caseId);
      if (c) c.status = status;
    },
    async listCases() {
      return [...cases.values()];
    },
  };
  return { store, cases };
}

const input = (paymentEventId: string): NewCaseInput => ({
  paymentEventId,
  provider: 'razorpay',
  providerPaymentId: 'pay_1',
  customerEmail: 'a@b.com',
  customerPhone: '+91',
  amount: 499,
  currency: 'INR',
  failureReason: 'Insufficient funds',
  failureCategory: 'INSUFFICIENT_FUNDS',
});

describe('createRecoveryCase', () => {
  it('creates a new case (created: true)', async () => {
    const { store, cases } = makeFakeStore();
    const r = await createRecoveryCase(store, nullLogger(), input('pe_1'));
    expect(r.created).toBe(true);
    expect(r.case.status).toBe('OPEN');
    expect(cases.size).toBe(1);
  });

  it('is idempotent: a duplicate paymentEventId returns the existing case (created: false), no second row', async () => {
    const { store, cases } = makeFakeStore();
    const first = await createRecoveryCase(store, nullLogger(), input('pe_1'));
    const second = await createRecoveryCase(store, nullLogger(), input('pe_1'));
    expect(second.created).toBe(false);
    expect(second.case.id).toBe(first.case.id);
    expect(cases.size).toBe(1);
  });

  it('propagates non-unique errors', async () => {
    const { store } = makeFakeStore();
    store.createCase = async () => {
      throw new Error('db down');
    };
    await expect(createRecoveryCase(store, nullLogger(), input('pe_x'))).rejects.toThrow('db down');
  });

  it('updateCaseStatus delegates to the store', async () => {
    const { store, cases } = makeFakeStore();
    const r = await createRecoveryCase(store, nullLogger(), input('pe_1'));
    await updateCaseStatus(store, r.case.id, 'RECOVERED' as RecoveryStatus);
    expect(cases.get(r.case.id)!.status).toBe('RECOVERED');
  });
});
