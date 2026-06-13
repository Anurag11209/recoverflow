import { afterEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';

// Stripe infrastructure unit tests (M4 Step 2): configuration validation and
// plan/price mapping. getEnv() is mocked so each case controls exactly which
// Stripe vars are present, without depending on .env. Modules are reset per
// case because getStripe() memoises its client at module scope.
const { envMock } = vi.hoisted(() => ({ envMock: vi.fn() }));
vi.mock('@recoverflow/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@recoverflow/shared')>();
  return { ...actual, getEnv: envMock };
});

type FakeEnv = Record<string, string | undefined>;

async function load(env: FakeEnv) {
  envMock.mockReturnValue(env);
  vi.resetModules();
  const stripe = await import('./stripe');
  const plans = await import('./plans');
  return { ...stripe, ...plans };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('getStripe (configuration validation)', () => {
  it('throws when STRIPE_SECRET_KEY is unset', async () => {
    const { getStripe } = await load({});
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY/);
  });

  it('returns a memoised client when the secret key is present', async () => {
    const { getStripe } = await load({ STRIPE_SECRET_KEY: 'sk_test_dummy' });
    const a = getStripe();
    const b = getStripe();
    expect(a).toBeInstanceOf(Stripe);
    expect(b).toBe(a); // cached, not rebuilt
  });
});

describe('constructStripeEvent (signature verification)', () => {
  const payload = JSON.stringify({
    id: 'evt_test_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1' } },
  });

  it('throws when STRIPE_WEBHOOK_SECRET is unset', async () => {
    const { constructStripeEvent } = await load({ STRIPE_SECRET_KEY: 'sk_test_dummy' });
    expect(() => constructStripeEvent(payload, 'sig')).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it('throws when the stripe-signature header is missing', async () => {
    const { constructStripeEvent } = await load({
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    });
    expect(() => constructStripeEvent(payload, null)).toThrow(/signature/i);
  });

  it('verifies and returns a correctly signed event', async () => {
    const secret = 'whsec_test_abc';
    const header = new Stripe('sk_test_dummy').webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    const { constructStripeEvent } = await load({
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: secret,
    });

    const event = constructStripeEvent(payload, header);
    expect(event.id).toBe('evt_test_1');
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects a tampered/invalid signature', async () => {
    const { constructStripeEvent } = await load({
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    });
    expect(() => constructStripeEvent(payload, 't=1,v1=deadbeef')).toThrow();
  });
});

describe('plan / price mapping', () => {
  const env: FakeEnv = {
    STRIPE_PRICE_STARTER: 'price_starter_1',
    STRIPE_PRICE_GROWTH: 'price_growth_1',
    STRIPE_PRICE_BUSINESS: 'price_business_1',
  };

  it('maps each self-serve tier to its configured price id', async () => {
    const { stripePriceIdFor } = await load(env);
    expect(stripePriceIdFor('STARTER')).toBe('price_starter_1');
    expect(stripePriceIdFor('GROWTH')).toBe('price_growth_1');
    expect(stripePriceIdFor('BUSINESS')).toBe('price_business_1');
  });

  it('returns null for Enterprise (no configured price)', async () => {
    const { stripePriceIdFor } = await load(env);
    expect(stripePriceIdFor('ENTERPRISE')).toBeNull();
  });

  it('reverse-maps a price id back to its tier', async () => {
    const { tierForStripePriceId } = await load(env);
    expect(tierForStripePriceId('price_starter_1')).toBe('STARTER');
    expect(tierForStripePriceId('price_growth_1')).toBe('GROWTH');
    expect(tierForStripePriceId('price_business_1')).toBe('BUSINESS');
  });

  it('reverse-maps an unknown price id to null', async () => {
    const { tierForStripePriceId } = await load(env);
    expect(tierForStripePriceId('price_unknown')).toBeNull();
  });
});
