import { describe, expect, it } from 'vitest';
import { registerSchema, loginSchema } from './validation';
import { isTrustedOrigin } from './csrf';

describe('registerSchema', () => {
  it('accepts valid input and normalizes email', () => {
    const r = registerSchema.parse({
      organizationName: '  Acme Inc ',
      name: ' Anurag ',
      email: '  Owner@Acme.COM ',
      password: 'supersecret',
    });
    expect(r.email).toBe('owner@acme.com');
    expect(r.organizationName).toBe('Acme Inc');
    expect(r.name).toBe('Anurag');
  });
  it('rejects short passwords', () => {
    expect(
      registerSchema.safeParse({
        organizationName: 'A',
        name: 'B',
        email: 'a@b.com',
        password: 'short',
      }).success,
    ).toBe(false);
  });
  it('rejects a bad email', () => {
    expect(
      registerSchema.safeParse({
        organizationName: 'A',
        name: 'B',
        email: 'nope',
        password: 'longenough',
      }).success,
    ).toBe(false);
  });
  it('rejects an empty organization name', () => {
    expect(
      registerSchema.safeParse({
        organizationName: '   ',
        name: 'B',
        email: 'a@b.com',
        password: 'longenough',
      }).success,
    ).toBe(false);
  });
});

describe('loginSchema', () => {
  it('imposes no min length on the password (no policy leak)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
});

describe('isTrustedOrigin', () => {
  const app = 'http://localhost:3000';
  it('accepts the same origin', () =>
    expect(isTrustedOrigin('http://localhost:3000', app)).toBe(true));
  it('rejects a null origin', () => expect(isTrustedOrigin(null, app)).toBe(false));
  it('rejects a different host', () => expect(isTrustedOrigin('http://evil.com', app)).toBe(false));
  it('rejects a different port', () =>
    expect(isTrustedOrigin('http://localhost:3001', app)).toBe(false));
  it('rejects a different scheme', () =>
    expect(isTrustedOrigin('https://localhost:3000', app)).toBe(false));
  it('rejects garbage', () => expect(isTrustedOrigin('not a url', app)).toBe(false));
});
