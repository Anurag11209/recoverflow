import { randomBytes } from 'node:crypto';
import { prisma } from '@recoverflow/db';
import type { User } from '@recoverflow/db';
import { ConflictError } from '@recoverflow/shared';
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from './password';
import { createSession, type SessionMeta } from './session';
import type { LoginInput, RegisterInput } from './validation';

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/**
 * Creates a Merchant (the organization) and its OWNER user atomically, then
 * opens a session. The owner's email seeds the merchant's business-contact
 * email; both are unique, so a duplicate raises ConflictError.
 */
export async function registerMerchant(input: RegisterInput, meta: SessionMeta = {}) {
  const passwordHash = await hashPassword(input.password);

  let user: User;
  try {
    user = await prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: {
          name: input.organizationName,
          email: input.email,
          // Per-merchant Razorpay webhook secret (Phase 8). webhookToken rides its
          // schema cuid default (a routing key, not a secret).
          razorpayWebhookSecret: `whsec_${randomBytes(24).toString('hex')}`,
        },
      });
      return tx.user.create({
        data: {
          merchantId: merchant.id,
          email: input.email,
          passwordHash,
          name: input.name,
          role: 'OWNER',
        },
      });
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError('An account with this email already exists');
    }
    throw err;
  }

  const { token, session } = await createSession(user.id, meta);
  return { user, token, expiresAt: session.expiresAt };
}

/**
 * Verifies credentials. Always runs exactly one password verification (against
 * a dummy hash when the user is absent) so timing can't reveal whether an email
 * is registered. Returns the user on success, null otherwise.
 */
export async function authenticate(input: LoginInput): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, input.password);
  return user && ok ? user : null;
}
