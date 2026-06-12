import { randomBytes } from 'node:crypto';
import { prisma } from '@recoverflow/db';
import { logger, ValidationError } from '@recoverflow/shared';
import { encryptSecret } from '../crypto/secret-cipher';
import { recordAuditEvent } from './audit';

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
export async function regenerateWebhookSecret(
  merchantId: string,
  userId?: string,
): Promise<string> {
  const secret = generateWebhookSecret();
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { razorpayWebhookSecret: encryptSecret(secret) },
  });
  logger.info({ event: 'webhook_secret_regenerated', merchantId }, 'webhook secret regenerated');
  // Audit the action only — the secret value is never recorded.
  await recordAuditEvent({ merchantId, userId, action: 'webhook_secret.regenerated' });
  return secret;
}

/** Result of a profile update attempt. */
export interface ProfileUpdateResult {
  name: string;
}

/**
 * Updates the merchant's display name. Trims and validates (non-empty, max
 * length), records an audit entry with the old/new name (non-sensitive), and
 * returns the saved value. Throws ValidationError on bad input.
 */
export async function updateProfileName(
  merchantId: string,
  rawName: string,
  userId?: string,
): Promise<ProfileUpdateResult> {
  const name = rawName.trim();
  if (name.length === 0) {
    throw new ValidationError('Business name cannot be empty');
  }
  if (name.length > 120) {
    throw new ValidationError('Business name must be 120 characters or fewer');
  }

  const before = await prisma.merchant.findUniqueOrThrow({
    where: { id: merchantId },
    select: { name: true },
  });

  if (before.name !== name) {
    await prisma.merchant.update({ where: { id: merchantId }, data: { name } });
    await recordAuditEvent({
      merchantId,
      userId,
      action: 'profile.updated',
      metadata: { field: 'name', from: before.name, to: name },
    });
  }

  return { name };
}
