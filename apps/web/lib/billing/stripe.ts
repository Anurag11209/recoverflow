import Stripe from 'stripe';
import { env } from '@recoverflow/shared';

let client: Stripe | null = null;

/**
 * Lazily-constructed Stripe client. The secret key is optional in the env schema
 * (so non-billing environments load), so presence is enforced HERE — the one
 * place an actual Stripe call is made. Pinned API version for reproducibility.
 */
export function getStripe(): Stripe {
  if (client) return client;
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set; billing is unavailable in this environment.');
  }
  client = new Stripe(key, { apiVersion: '2026-05-27.dahlia' });
  return client;
}
