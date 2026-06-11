import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const VALID = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/recoverflow',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RAZORPAY_WEBHOOK_SECRET: 'whsec_test',
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

  it('bypasses validation when SKIP_ENV_VALIDATION is set', () => {
    expect(() => loadEnv({ SKIP_ENV_VALIDATION: 'true' })).not.toThrow();
  });
});
