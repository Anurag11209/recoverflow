import Stripe from 'stripe';
import { getEnv } from '@recoverflow/shared';

let client: Stripe | null = null;

/**
 * Lazily-constructed Stripe client. The secret key is optional in the env schema
 * (so non-billing environments load), so presence is enforced HERE — the one
 * place an actual Stripe call is made. Pinned API version for reproducibility.
 */
export function getStripe(): Stripe {
  if (client) return client;
  const key = getEnv().STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set; billing is unavailable in this environment.');
  }
  client = new Stripe(key, { apiVersion: '2026-05-27.dahlia' });
  return client;
}

/**
 * Verifies a Stripe webhook delivery and returns the typed event. Uses the raw
 * request body (never re-serialized) and the `stripe-signature` header against
 * STRIPE_WEBHOOK_SECRET. Throws if the secret is unset or the signature is
 * invalid/expired — the route turns that into a 400 so Stripe retries.
 */
export function constructStripeEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set; cannot verify Stripe webhooks.');
  }
  if (!signature) {
    throw new Error('Missing stripe-signature header');
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
