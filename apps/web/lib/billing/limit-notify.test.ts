import { describe, expect, it } from 'vitest';
import type { EmailClient, EmailMessage } from '@recoverflow/adapters';
import {
  notifyPlanLimitReached,
  periodKey,
  type NotifyLimitDeps,
  type PlanLimitNoticeStore,
} from './limit-notify';

function fakeStore(): PlanLimitNoticeStore {
  const claims = new Set<string>();
  return {
    async claimNotice(merchantId, period) {
      const key = `${merchantId}:${period}`;
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    },
  };
}

function recordingEmail(): { client: EmailClient; sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    client: {
      async sendEmail(m) {
        sent.push(m);
        return { id: 'e1' };
      },
    },
  };
}

const noopLogger = { info: () => {}, error: () => {} };

function deps(store: PlanLimitNoticeStore, client: EmailClient): NotifyLimitDeps {
  return {
    store,
    emailClient: client,
    findMerchantEmail: async () => 'owner@example.com',
    buildUpgradeUrl: () => 'https://app.test/dashboard/billing',
    logger: noopLogger,
  };
}

describe('periodKey', () => {
  it('is the UTC year-month of now', () => {
    expect(periodKey(new Date('2026-07-18T23:30:00Z'))).toBe('2026-07');
    expect(periodKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(periodKey(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});

describe('notifyPlanLimitReached (notification trigger)', () => {
  const now = new Date('2026-07-18T10:00:00Z');

  it('sends the limit email on the first drop of the period', async () => {
    const store = fakeStore();
    const { client, sent } = recordingEmail();
    const outcome = await notifyPlanLimitReached(deps(store, client), {
      merchantId: 'm1',
      plan: 'STARTER',
      limit: 500,
      now,
    });
    expect(outcome).toBe('notified');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('owner@example.com');
    expect(sent[0].subject.toLowerCase()).toContain('limit');
  });

  it('does NOT re-send on later drops in the same period (once per period)', async () => {
    const store = fakeStore();
    const { client, sent } = recordingEmail();
    const first = await notifyPlanLimitReached(deps(store, client), {
      merchantId: 'm1',
      plan: 'STARTER',
      limit: 500,
      now,
    });
    const second = await notifyPlanLimitReached(deps(store, client), {
      merchantId: 'm1',
      plan: 'STARTER',
      limit: 500,
      now,
    });
    expect(first).toBe('notified');
    expect(second).toBe('already_notified');
    expect(sent).toHaveLength(1);
  });

  it('emails again once a new period starts', async () => {
    const store = fakeStore();
    const { client, sent } = recordingEmail();
    await notifyPlanLimitReached(deps(store, client), {
      merchantId: 'm1',
      plan: 'STARTER',
      limit: 500,
      now: new Date('2026-07-31T23:00:00Z'),
    });
    await notifyPlanLimitReached(deps(store, client), {
      merchantId: 'm1',
      plan: 'STARTER',
      limit: 500,
      now: new Date('2026-08-01T00:30:00Z'),
    });
    expect(sent).toHaveLength(2);
  });

  it('notifies each merchant independently', async () => {
    const store = fakeStore();
    const { client, sent } = recordingEmail();
    await notifyPlanLimitReached(deps(store, client), {
      merchantId: 'm1',
      plan: 'STARTER',
      limit: 500,
      now,
    });
    await notifyPlanLimitReached(deps(store, client), {
      merchantId: 'm2',
      plan: 'GROWTH',
      limit: 2500,
      now,
    });
    expect(sent).toHaveLength(2);
  });

  it('skips sending (without throwing) when the merchant has no email', async () => {
    const store = fakeStore();
    const { client, sent } = recordingEmail();
    const outcome = await notifyPlanLimitReached(
      { ...deps(store, client), findMerchantEmail: async () => null },
      { merchantId: 'm1', plan: 'STARTER', limit: 500, now },
    );
    expect(outcome).toBe('skipped_no_email');
    expect(sent).toHaveLength(0);
  });
});
