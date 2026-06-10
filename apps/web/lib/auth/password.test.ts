import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('round-trips a correct password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const h = await hashPassword('right-password');
    expect(await verifyPassword(h, 'wrong-password')).toBe(false);
  });

  it('produces unique hashes for the same password (random salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });

  it('fails closed on a malformed stored hash', async () => {
    expect(await verifyPassword('not-a-real-hash', 'anything')).toBe(false);
  });
});
