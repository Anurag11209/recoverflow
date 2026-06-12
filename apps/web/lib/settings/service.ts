import { randomBytes } from 'node:crypto';
import { prisma } from '@recoverflow/db';
import { logger } from '@recoverflow/shared';
import { encryptSecret } from '../crypto/secret-cipher';

/** A fresh Razorpay-style webhook secret, same shape as registration mints. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

/**
 * Mints a new webhook secret, encrypts it at rest, and replaces the merchant's
 * stored value. Returns the PLAINTEXT new secret (callers that need to display
 * it can; the route does not, relying on decrypt-on-read after a refresh).
 *
 * Side effect: the previous secret stops verifying immediately.
 */
export async function regenerateWebhookSecret(merchantId: string): Promise<string> {
  const secret = generateWebhookSecret();
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { razorpayWebhookSecret: encryptSecret(secret) },
  });
  logger.info({ event: 'webhook_secret_regenerated', merchantId }, 'webhook secret regenerated');
  return secret;
}
