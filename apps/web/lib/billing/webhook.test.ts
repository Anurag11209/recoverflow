import { describe, expect, it } from 'vitest';
import { resolveSubscriptionTarget } from './webhook';

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
