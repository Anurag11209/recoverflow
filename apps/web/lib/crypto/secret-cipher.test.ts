import { describe, expect, it } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted } from './secret-cipher';

// vitest.config.ts provides APP_ENCRYPTION_KEY for these tests.

describe('secret-cipher', () => {
  it('round-trips a secret', () => {
    const plaintext = 'whsec_abc123def456';
    const enc = encryptSecret(plaintext);
    expect(decryptSecret(enc)).toBe(plaintext);
  });

  it('produces the versioned v1:iv:tag:ciphertext format', () => {
    const enc = encryptSecret('whsec_x');
    const parts = enc.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    expect(isEncrypted(enc)).toBe(true);
  });

  it('uses a fresh IV each call (ciphertext differs for same input)', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same');
    expect(decryptSecret(b)).toBe('same');
  });

  it('passes through legacy plaintext (no v1: prefix) unchanged', () => {
    const legacy = 'whsec_legacy_plaintext';
    expect(isEncrypted(legacy)).toBe(false);
    expect(decryptSecret(legacy)).toBe(legacy);
  });

  it('detects tampering: a flipped ciphertext byte fails authentication', () => {
    const enc = encryptSecret('whsec_tamper');
    const parts = enc.split(':');
    // Corrupt the ciphertext (last segment) by swapping a character.
    const data = parts[3];
    const flipped = (data[0] === 'A' ? 'B' : 'A') + data.slice(1);
    const tampered = [parts[0], parts[1], parts[2], flipped].join(':');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('rejects a malformed v1 value (wrong segment count)', () => {
    expect(() => decryptSecret('v1:only:three')).toThrow(/Malformed/);
  });
});
