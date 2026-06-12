import { cookies } from 'next/headers';
import { getEnv } from '@recoverflow/shared';
import { SESSION_COOKIE_NAME } from './session-core';

export const BASE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
} as const;

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    ...BASE_ATTRIBUTES,
    secure: getEnv().NODE_ENV === 'production',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, '', {
    ...BASE_ATTRIBUTES,
    secure: getEnv().NODE_ENV === 'production',
    maxAge: 0,
  });
}
