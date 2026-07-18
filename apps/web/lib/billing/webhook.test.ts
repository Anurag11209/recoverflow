import { describe, expect, it } from 'vitest';
import { resolveSubscriptionTarget, isStripeEventStale } from './webhook';

describe('resolveSubscriptionTarget (bug 1: look up by subscription id, not customer)', () => {
  it('targets the row already bound to this subscription id', () => {
    expect(resolveSubscriptionTarget({ merchantId: 'm1' }, null)).toEqual({ merchantId: 'm1' });
  });

  it('prefers the subscription-id match even when a customer row exists', () => {
    expect(
      resolveSubscriptionTarget(
        { merchantId: 'm1' },
        { merchantId: 'm2', stripeSubscriptionId: 'sub_other' },
      ),
    ).toEqual({ merchantId: 'm1' });
  });

  it('associates a customer row that is not yet bound to any subscription (first event)', () => {
    expect(
      resolveSubscriptionTarget(null, { merchantId: 'm1', stripeSubscriptionId: null }),
    ).toEqual({ merchantId: 'm1' });
  });

  it('ignores a STALE event whose customer row is bound to a DIFFERENT subscription', () => {
    // e.g. a delayed subscription.deleted for an old sub arriving after a new one
    // is already active — it must NOT clobber the current subscription.
    expect(
      resolveSubscriptionTarget(null, { merchantId: 'm1', stripeSubscriptionId: 'sub_new' }),
    ).toBeNull();
  });

  it('ignores when neither lookup matched', () => {
    expect(resolveSubscriptionTarget(null, null)).toBeNull();
  });
});

describe('isStripeEventStale (bug 2: ignore out-of-order events)', () => {
  const stored = new Date('2026-07-19T12:00:00.000Z');
  const storedSeconds = Math.floor(stored.getTime() / 1000);

  it('is never stale when nothing has been applied yet', () => {
    expect(isStripeEventStale(storedSeconds, null)).toBe(false);
  });

  it('is stale when the event is older than the stored state', () => {
    expect(isStripeEventStale(storedSeconds - 3600, stored)).toBe(true);
  });

  it('is not stale when the event is newer than the stored state', () => {
    expect(isStripeEventStale(storedSeconds + 3600, stored)).toBe(false);
  });

  it('is not stale when the event has the same timestamp (not strictly older)', () => {
    expect(isStripeEventStale(storedSeconds, stored)).toBe(false);
  });
});
