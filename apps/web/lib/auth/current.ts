import { cache } from 'react';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from './session-core';
import { validateSessionToken, type ValidatedSession } from './session';

/**
 * Reads and validates the session cookie for the current request. Wrapped in
 * React cache() so multiple callers within one render (layout, page, actions)
 * hit the database exactly once.
 */
export const getCurrentSession = cache(async (): Promise<ValidatedSession | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});
