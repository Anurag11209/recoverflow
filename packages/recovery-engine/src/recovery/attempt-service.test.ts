import { describe, expect, it } from 'vitest';
import {
  scheduleFirstAttempt,
  ATTEMPT_SCHEDULE_HOURS,
  MAX_ATTEMPTS,
  isSubscriptionActive,
  nextAttemptSchedule,
  runDueAttempt,
  type RunDueAttemptDeps,
} from './attempt-service';
import type {
  DueAttempt,
  NewAttemptInput,
  RecoveryAttemptRecord,
  RecoveryStatus,
  RecoveryStore,
} from './types';
import { fakeMessageStore, fakeProvider, fakeTokenStore } from '../_msgfakes';

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

// ---------------------------------------------------------------------------
// Retry ladder (worker-driven)
// ---------------------------------------------------------------------------

const HOUR = 3600_000;
const T0 = new Date('2026-07-16T00:00:00.000Z');

interface LadderState {
  created: NewAttemptInput[];
  executed: { id: string; status: string; failureReason: string | null }[];
  caseStatus: Map<string, RecoveryStatus>;
}

function makeLadderStore(): { store: RecoveryStore; state: LadderState } {
  const state: LadderState = { created: [], executed: [], caseStatus: new Map() };
  const store = {
    async createAttempt(input: NewAttemptInput) {
      if (
        state.created.some(
          (a) =>
            a.recoveryCaseId === input.recoveryCaseId && a.attemptNumber === input.attemptNumber,
        )
      ) {
        throw { code: 'P2002' };
      }
      state.created.push(input);
      return {
        id: `att_${input.attemptNumber}`,
        recoveryCaseId: input.recoveryCaseId,
        attemptNumber: input.attemptNumber,
        status: 'PENDING' as const,
        scheduledAt: input.scheduledAt,
      };
    },
    async updateCaseStatus(caseId: string, status: RecoveryStatus) {
      state.caseStatus.set(caseId, status);
    },
    async markAttemptExecuted(
      id: string,
      status: string,
      _executedAt: Date,
      failureReason: string | null = null,
    ) {
      state.executed.push({ id, status, failureReason });
    },
  } as unknown as RecoveryStore;
  return { store, state };
}

function makeDeps(
  store: RecoveryStore,
  messageStore = fakeMessageStore(),
): { deps: RunDueAttemptDeps; messageStore: ReturnType<typeof fakeMessageStore> } {
  const deps: RunDueAttemptDeps = {
    recoveryStore: store,
    messageStore,
    messagingProvider: fakeProvider(),
    messagingProviderName: 'console',
    tokenStore: fakeTokenStore(),
    clock: { now: () => new Date('2026-07-20T00:00:00.000Z') },
    buildPaymentUpdateUrl: (t) => `https://app.test/update-payment/${t}`,
    logger: nullLogger(),
  };
  return { deps, messageStore };
}

function makeDue(
  o: Partial<{
    attemptNumber: number;
    attemptId: string;
    status: RecoveryStatus;
    subscriptionStatus: string | null;
    hasSubscription: boolean;
    createdAt: Date;
  }> = {},
): DueAttempt {
  const attemptNumber = o.attemptNumber ?? 2;
  return {
    attempt: {
      id: o.attemptId ?? `att_${attemptNumber}`,
      attemptNumber,
      scheduledAt: new Date(T0.getTime() + 999 * HOUR),
    },
    case: {
      id: 'case_1',
      status: o.status ?? 'OPEN',
      createdAt: o.createdAt ?? T0,
      merchantId: 'm1',
      customerPhone: '+919999999999',
      amount: 499,
      currency: 'INR',
      failureCategory: 'INSUFFICIENT_FUNDS',
    },
    subscriptionStatus: o.subscriptionStatus ?? null,
    hasSubscription: o.hasSubscription ?? false,
  };
}

describe('isSubscriptionActive', () => {
  it('treats null / unset / active / unknown as active', () => {
    for (const s of [null, '', 'active', 'ACTIVE', 'pending', 'authenticated']) {
      expect(isSubscriptionActive(s)).toBe(true);
    }
  });
  it('treats terminal statuses as inactive (case-insensitive)', () => {
    for (const s of ['cancelled', 'Canceled', 'HALTED', 'completed', 'expired']) {
      expect(isSubscriptionActive(s)).toBe(false);
    }
  });
});

describe('nextAttemptSchedule', () => {
  it('schedules #2 at +24h and #3 at +72h from case creation', () => {
    expect(nextAttemptSchedule(1, T0)).toEqual({
      attemptNumber: 2,
      scheduledAt: new Date(T0.getTime() + 24 * HOUR),
    });
    expect(nextAttemptSchedule(2, T0)).toEqual({
      attemptNumber: 3,
      scheduledAt: new Date(T0.getTime() + 72 * HOUR),
    });
  });
  it('returns null past the cap (never a #4)', () => {
    expect(nextAttemptSchedule(3, T0)).toBeNull();
    expect(nextAttemptSchedule(MAX_ATTEMPTS, T0)).toBeNull();
  });
});

describe('runDueAttempt', () => {
  it('executes attempt #2 and schedules #3 at +72h', async () => {
    const { store, state } = makeLadderStore();
    const { deps } = makeDeps(store);
    const outcome = await runDueAttempt(deps, makeDue({ attemptNumber: 2, attemptId: 'att_2' }));
    expect(outcome).toMatchObject({
      status: 'executed',
      attemptNumber: 2,
      scheduledNext: 3,
      caseFailed: false,
    });
    expect(state.executed).toContainEqual({ id: 'att_2', status: 'SUCCESS', failureReason: null });
    expect(state.created).toHaveLength(1);
    expect(state.created[0]!.attemptNumber).toBe(3);
    expect(state.created[0]!.scheduledAt).toEqual(new Date(T0.getTime() + 72 * HOUR));
  });

  it('after attempt #3 marks the case FAILED and never schedules a #4', async () => {
    const { store, state } = makeLadderStore();
    const { deps } = makeDeps(store);
    const outcome = await runDueAttempt(deps, makeDue({ attemptNumber: 3, attemptId: 'att_3' }));
    expect(outcome).toMatchObject({ status: 'executed', attemptNumber: 3, scheduledNext: null, caseFailed: true });
    expect(state.created).toHaveLength(0);
    expect(state.caseStatus.get('case_1')).toBe('FAILED');
  });

  it('halts on a RECOVERED case: no send, no next attempt', async () => {
    const { store, state } = makeLadderStore();
    const { deps, messageStore } = makeDeps(store);
    const outcome = await runDueAttempt(
      deps,
      makeDue({ attemptNumber: 2, attemptId: 'att_2', status: 'RECOVERED' }),
    );
    expect(outcome).toEqual({ status: 'halted', reason: 'case_recovered' });
    expect(state.created).toHaveLength(0);
    expect(await messageStore.listMessages()).toHaveLength(0);
    expect(state.executed).toContainEqual({
      id: 'att_2',
      status: 'FAILED',
      failureReason: 'skipped: case_recovered',
    });
  });

  it('halts on a CLOSED (canceled) case', async () => {
    const { store } = makeLadderStore();
    const { deps } = makeDeps(store);
    expect(await runDueAttempt(deps, makeDue({ status: 'CLOSED' }))).toEqual({
      status: 'halted',
      reason: 'case_closed',
    });
  });

  it('halts when the linked subscription is no longer active', async () => {
    const { store } = makeLadderStore();
    const { deps } = makeDeps(store);
    expect(
      await runDueAttempt(deps, makeDue({ hasSubscription: true, subscriptionStatus: 'cancelled' })),
    ).toEqual({ status: 'halted', reason: 'subscription_inactive' });
  });

  it('does not double-send attempt #1 (already sent inline) but still advances to #2', async () => {
    const { store, state } = makeLadderStore();
    const messageStore = fakeMessageStore();
    // Simulate the inline send at case creation: a MessageLog already exists for #1.
    await messageStore.createMessageLog({
      recoveryCaseId: 'case_1',
      merchantId: 'm1',
      recoveryAttemptId: 'att_1',
      messageType: 'PAYMENT_FAILED',
      provider: 'console',
      templateName: 'PAYMENT_FAILED',
      recipientPhone: '+919999999999',
      payload: {},
    });
    const { deps } = makeDeps(store, messageStore);
    const outcome = await runDueAttempt(deps, makeDue({ attemptNumber: 1, attemptId: 'att_1' }));
    expect(outcome).toMatchObject({ status: 'executed', attemptNumber: 1, scheduledNext: 2 });
    expect(await messageStore.listMessages()).toHaveLength(1); // no double-send
    expect(state.created[0]!.attemptNumber).toBe(2);
  });
});
