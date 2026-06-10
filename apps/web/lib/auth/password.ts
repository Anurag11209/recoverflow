import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id with OWASP-recommended parameters: 19 MiB memory, 2 iterations,
 * parallelism 1. Parameters are encoded into the hash string, so they can be
 * raised later without breaking existing hashes.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Returns false for wrong passwords AND for malformed stored hashes — the
 * underlying verify() throws on garbage input, and login must fail closed,
 * never 500.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * A real argon2id hash of a random string, used to equalize timing on login
 * when the email doesn't exist — we always run one verify(), so a missing user
 * and a wrong password are indistinguishable by response time. It never matches
 * any real password.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$i5TeBBUBXey4U5erQPVUHg$j2R4IlZvHqBZx3ryQfmDJeZ7W+JVHLprdDmXdDSqCuU';
