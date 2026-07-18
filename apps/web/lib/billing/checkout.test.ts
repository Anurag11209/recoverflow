import { describe, expect, it } from 'vitest';
import {
  checkoutIdempotencyKeys,
  reconciliationDecision,
  type ReconcilableSession,
} from './checkout';

describe('checkoutIdempotencyKeys (bug 3: idempotent Stripe calls)', () => {
  it('is deterministic for the same merchant + tier', () => {
    expect(checkoutIdempotencyKeys('m1', 'STARTER')).toEqual(
      checkoutIdempotencyKeys('m1', 'STARTER'),
    );
  });

  it('uses distinct keys for the customer and the session', () => {
    const k = checkoutIdempotencyKeys('m1', 'STARTER');
    expect(k.customer).not.toBe(k.session);
  });

  it('differs by merchant and by tier', () => {
    expect(checkoutIdempotencyKeys('m1', 'STARTER').customer).not.toBe(
      checkoutIdempotencyKeys('m2', 'STARTER').customer,
    );
    expect(checkoutIdempotencyKeys('m1', 'STARTER').session).not.toBe(
      checkoutIdempotencyKeys('m1', 'GROWTH').session,
    );
  });
});

const paidSession = (over: Partial<ReconcilableSession> = {}): ReconcilableSession => ({
  clientReferenceId: 'm1',
  paymentStatus: 'paid',
  subscriptionId: 'sub_1',
  subscriptionStatus: 'active',
  tier: 'GROWTH',
  stripeCustomerId: 'cus_1',
  ...over,
});

describe('reconciliationDecision (bug 4: reconcile when the webhook is late/lost)', () => {
  it('refuses a session that belongs to a different merchant', () => {
    expect(reconciliationDecision(paidSession({ clientReferenceId: 'other' }), 'm1')).toEqual({
      apply: false,
      reason: 'foreign_session',
    });
  });

  it('waits when payment has not completed', () => {
    expect(reconciliationDecision(paidSession({ paymentStatus: 'unpaid' }), 'm1')).toEqual({
      apply: false,
      reason: 'not_paid',
    });
  });

  it('waits when the session has no subscription yet', () => {
    expect(
      reconciliationDecision(paidSession({ subscriptionId: null, subscriptionStatus: null }), 'm1'),
    ).toEqual({ apply: false, reason: 'no_subscription' });
  });

  it('applies the subscription state when paid and owned by the merchant', () => {
    expect(reconciliationDecision(paidSession(), 'm1')).toEqual({
      apply: true,
      data: {
        stripeSubscriptionId: 'sub_1',
        status: 'ACTIVE',
        stripeCustomerId: 'cus_1',
        plan: 'GROWTH',
      },
    });
  });
});
