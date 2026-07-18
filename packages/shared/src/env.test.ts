import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const VALID = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/recoverflow',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  // Valid 32-byte (AES-256) base64 key; required at boot.
  APP_ENCRYPTION_KEY: 'cU//QyWYuIT10dLCh3Hvi0mFqf6i08jd+WQ3jx2BDWc=',
  // Shared secret for internal API routes; required in every environment.
  INTERNAL_API_TOKEN: 'test-internal-api-token-please-change',
} satisfies NodeJS.ProcessEnv;

describe('loadEnv', () => {
  it('parses a valid environment', () => {
    const env = loadEnv(VALID);
    expect(env.DATABASE_URL).toContain('postgresql://');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
    expect(env.NODE_ENV).toBe('test');
  });

  it('defaults NODE_ENV to development', () => {
    const rest = Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== 'NODE_ENV'));
    expect(loadEnv(rest).NODE_ENV).toBe('development');
  });

  it('defaults MESSAGING_PROVIDER to console', () => {
    expect(loadEnv(VALID).MESSAGING_PROVIDER).toBe('console');
  });

  it('defaults APP_BASE_URL to localhost', () => {
    expect(loadEnv(VALID).APP_BASE_URL).toBe('http://localhost:3000');
  });

  it('accepts an explicit APP_BASE_URL', () => {
    expect(loadEnv({ ...VALID, APP_BASE_URL: 'https://app.recoverflow.com' }).APP_BASE_URL).toBe(
      'https://app.recoverflow.com',
    );
  });

  it('rejects a malformed APP_BASE_URL', () => {
    expect(() => loadEnv({ ...VALID, APP_BASE_URL: 'not-a-url' })).toThrow(/APP_BASE_URL/i);
  });

  it('rejects an unsupported MESSAGING_PROVIDER', () => {
    expect(() => loadEnv({ ...VALID, MESSAGING_PROVIDER: 'carrier-pigeon' })).toThrow(
      /MESSAGING_PROVIDER/i,
    );
  });

  it('throws when DATABASE_URL is missing', () => {
    const rest = Object.fromEntries(
      Object.entries(VALID).filter(([key]) => key !== 'DATABASE_URL'),
    );
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('throws when a URL is malformed', () => {
    expect(() => loadEnv({ ...VALID, NEXT_PUBLIC_APP_URL: 'not-a-url' })).toThrow();
  });

  it('throws when APP_ENCRYPTION_KEY is missing (boot fails fast without the key)', () => {
    const rest = Object.fromEntries(
      Object.entries(VALID).filter(([key]) => key !== 'APP_ENCRYPTION_KEY'),
    );
    expect(() => loadEnv(rest)).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it('throws when APP_ENCRYPTION_KEY does not decode to 32 bytes', () => {
    // 'dG9vLXNob3J0' is base64 for 'too-short' (9 bytes), not 32.
    expect(() => loadEnv({ ...VALID, APP_ENCRYPTION_KEY: 'dG9vLXNob3J0' })).toThrow(
      /APP_ENCRYPTION_KEY/,
    );
  });

  it('throws when INTERNAL_API_TOKEN is missing', () => {
    const rest = Object.fromEntries(
      Object.entries(VALID).filter(([key]) => key !== 'INTERNAL_API_TOKEN'),
    );
    expect(() => loadEnv(rest)).toThrow(/INTERNAL_API_TOKEN/);
  });

  it('throws when INTERNAL_API_TOKEN is too short', () => {
    expect(() => loadEnv({ ...VALID, INTERNAL_API_TOKEN: 'short' })).toThrow(/INTERNAL_API_TOKEN/);
  });

  it('bypasses validation when SKIP_ENV_VALIDATION is set', () => {
    expect(() => loadEnv({ SKIP_ENV_VALIDATION: 'true' })).not.toThrow();
  });
});
