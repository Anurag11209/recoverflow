import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@recoverflow/shared';

/**
 * Symmetric encryption for secrets at rest (e.g. per-merchant Razorpay webhook
 * secrets). AES-256-GCM (authenticated): tampering is detected on decrypt.
 *
 * Stored format is versioned and self-describing:
 *   v1:<iv>:<authTag>:<ciphertext>      (each part base64)
 *
 * Values without the "v1:" prefix are treated as legacy plaintext and returned
 * unchanged by decryptSecret — so encryption can roll out transparently over
 * existing rows, and a migration can re-encrypt them at leisure.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, standard for GCM
const KEY_BYTES = 32; // AES-256

function key(): Buffer {
  const raw = env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('APP_ENCRYPTION_KEY is not set; cannot encrypt/decrypt secrets');
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length}); generate with: openssl rand -base64 32`,
    );
  }
  return buf;
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
 * Decrypt a stored value. If it carries the v1 prefix, authenticate + decrypt;
 * otherwise treat it as legacy plaintext and return it unchanged.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(`${VERSION}:`)) {
    return stored; // legacy plaintext
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
