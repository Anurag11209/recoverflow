import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getEnv } from '@recoverflow/shared';

/**
 * Symmetric encryption for secrets at rest (e.g. per-merchant Razorpay webhook
 * secrets). AES-256-GCM (authenticated): tampering is detected on decrypt.
 *
 * Stored format is versioned and self-describing:
 *   v1:<iv>:<authTag>:<ciphertext>      (each part base64)
 *
 * decryptSecret accepts ONLY this versioned v1 format; there is no plaintext
 * fallthrough. A value without the "v1:" prefix is rejected. (The one-off
 * migration in scripts/encrypt-webhook-secrets.ts has already re-encrypted any
 * legacy plaintext rows; isEncrypted() guards that script's idempotency.)
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, standard for GCM

function key(): Buffer {
  // Presence and 32-byte length are enforced at boot by the env schema
  // (APP_ENCRYPTION_KEY in @recoverflow/shared), so by the time any secret is
  // encrypted or decrypted the key is guaranteed valid — no lazy re-check here.
  return Buffer.from(getEnv().APP_ENCRYPTION_KEY, 'base64');
}

/** Encrypt plaintext into the versioned v1 format. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a stored value. Accepts only the versioned v1 format; a value without
 * the v1 prefix (e.g. legacy plaintext) is rejected rather than passed through.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(`${VERSION}:`)) {
    throw new Error(
      'Refusing to decrypt a non-v1 secret: expected versioned v1:iv:authTag:ciphertext format (plaintext fallthrough removed)',
    );
  }
  const parts = stored.split(':');
  const [, ivB64, tagB64, dataB64] = parts;
  if (parts.length !== 4 || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret: expected v1:iv:authTag:ciphertext');
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(), // throws if the auth tag doesn't verify (tampering/wrong key)
  ]);
  return plaintext.toString('utf8');
}

/** True if a stored value is in the encrypted v1 format (not legacy plaintext). */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(`${VERSION}:`);
}
