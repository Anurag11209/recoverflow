import { describe, expect, it } from 'vitest';
import { scheduleFirstAttempt, ATTEMPT_SCHEDULE_HOURS } from './attempt-service';
import type { RecoveryAttemptRecord, RecoveryStore } from './types';

const nullLogger = () => ({ info() {}, error() {} });

function makeFakeStore() {
  const attempts = new Map<string, RecoveryAttemptRecord>();
  let seq = 0;
  const store: RecoveryStore = {
    async findCaseByPaymentEventId() {
      return null;
    },
    async createCase() {
      throw new Error('unused');
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
    async updateCaseStatus() {},
    async listCases() {
      return [];
    },
  };
  return { store, attempts };
}

describe('scheduleFirstAttempt', () => {
  it('creates attempt #1 scheduled immediately (offset 0)', async () => {
    const { store, attempts } = makeFakeStore();
    const now = new Date('2026-06-11T00:00:00.000Z');
    const r = await scheduleFirstAttempt(store, nullLogger(), 'case_1', now);
    expect(r.created).toBe(true);
    expect(r.attempt.attemptNumber).toBe(1);
    expect(r.attempt.scheduledAt.toISOString()).toBe('2026-06-11T00:00:00.000Z');
    expect(attempts.size).toBe(1);
  });

  it('is idempotent: a second call returns the existing attempt (created: false), no second row', async () => {
    const { store, attempts } = makeFakeStore();
    const first = await scheduleFirstAttempt(store, nullLogger(), 'case_1');
    const second = await scheduleFirstAttempt(store, nullLogger(), 'case_1');
    expect(second.created).toBe(false);
    expect(second.attempt.id).toBe(first.attempt.id);
    expect(attempts.size).toBe(1);
  });

  it('schedule table: #1 immediate, #2 +24h, #3 +72h (only #1 used in Phase 5)', () => {
    expect(ATTEMPT_SCHEDULE_HOURS[1]).toBe(0);
    expect(ATTEMPT_SCHEDULE_HOURS[2]).toBe(24);
    expect(ATTEMPT_SCHEDULE_HOURS[3]).toBe(72);
  });

  it('propagates non-unique errors', async () => {
    const { store } = makeFakeStore();
    store.createAttempt = async () => {
      throw new Error('db down');
    };
    await expect(scheduleFirstAttempt(store, nullLogger(), 'case_1')).rejects.toThrow('db down');
  });
});
