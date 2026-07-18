import { describe, expect, it } from 'vitest';
import { checkoutIdempotencyKeys } from './checkout';

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
