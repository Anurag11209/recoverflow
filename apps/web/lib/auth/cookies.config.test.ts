import { describe, expect, it } from 'vitest';
import { BASE_ATTRIBUTES } from './cookies';

// Pins the session-cookie security attributes so a future refactor cannot
// silently weaken them (e.g. drop HttpOnly or loosen SameSite).
describe('session cookie attributes', () => {
  it('is HttpOnly (JS cannot read the token)', () => {
    expect(BASE_ATTRIBUTES.httpOnly).toBe(true);
  });
  it('uses SameSite=lax (CSRF mitigation at the cookie layer)', () => {
    expect(BASE_ATTRIBUTES.sameSite).toBe('lax');
  });
  it('is scoped to the whole app (Path=/)', () => {
    expect(BASE_ATTRIBUTES.path).toBe('/');
  });
});
