import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '@recoverflow/shared';
import { assertInternalApiToken } from './internal-token';

// vitest.config.ts sets INTERNAL_API_TOKEN to this value for the test env.
const TOKEN = 'test-internal-api-token-please-change';

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/internal/process-event', { method: 'POST', headers });
}

describe('assertInternalApiToken', () => {
  it('throws UnauthorizedError (401) when the Authorization header is missing', () => {
    expect(() => assertInternalApiToken(req())).toThrow(UnauthorizedError);
    try {
      assertInternalApiToken(req());
    } catch (e) {
      expect((e as UnauthorizedError).status).toBe(401);
    }
  });

  it('throws when the scheme is not Bearer', () => {
    expect(() => assertInternalApiToken(req({ authorization: `Basic ${TOKEN}` }))).toThrow(
      /internal API token/i,
    );
  });

  it('throws when Bearer has no token', () => {
    expect(() => assertInternalApiToken(req({ authorization: 'Bearer   ' }))).toThrow(
      /internal API token/i,
    );
  });

  it('throws on a wrong token', () => {
    expect(() =>
      assertInternalApiToken(req({ authorization: 'Bearer definitely-not-the-token' })),
    ).toThrow(/internal API token/i);
  });

  it('throws on a same-length wrong token (exercises the constant-time path)', () => {
    const wrong = 'x'.repeat(TOKEN.length);
    expect(wrong.length).toBe(TOKEN.length);
    expect(() => assertInternalApiToken(req({ authorization: `Bearer ${wrong}` }))).toThrow(
      UnauthorizedError,
    );
  });

  it('does not throw on the correct token', () => {
    expect(() => assertInternalApiToken(req({ authorization: `Bearer ${TOKEN}` }))).not.toThrow();
  });

  it('accepts the correct token with a case-insensitive scheme', () => {
    expect(() => assertInternalApiToken(req({ authorization: `bearer ${TOKEN}` }))).not.toThrow();
  });
});
