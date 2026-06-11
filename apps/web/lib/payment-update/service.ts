import { prisma } from '@recoverflow/db';
import { validateRawToken, consumeToken, completeRecovery } from '@recoverflow/recovery-engine';
import { logger } from '@recoverflow/shared';
import { createTokenStore } from './store';
import { createRecoveryStore } from '../recovery/store';
import { createMessageStore } from '../messaging/store';
import { createConsoleMessagingProvider } from '../messaging/console-provider';
import { createRazorpayPaymentUpdater } from './razorpay-updater';

const tokenDeps = () => ({
  store: createTokenStore(),
  clock: { now: () => new Date() },
  logger,
});

/** What the public update page is allowed to see (D11: display fields only). */
export type TokenMetadata =
  | { valid: true; merchantName: string | null; amount: string | null; currency: string | null }
  | { valid: false };

/**
 * Validate a raw token (no consumption) and, if valid, return ONLY display
 * fields for the page. Internal IDs are never returned to this public surface.
 * Every failure collapses to { valid: false } (D4 — no leak of why).
 */
export async function validatePaymentToken(rawToken: string): Promise<TokenMetadata> {
  const result = await validateRawToken(tokenDeps(), rawToken);
  if (!result.valid) return { valid: false };

  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: result.recoveryCaseId },
    select: {
      amount: true,
      currency: true,
      merchant: { select: { name: true } },
    },
  });
  if (!recoveryCase) return { valid: false };

  return {
    valid: true,
    merchantName: recoveryCase.merchant?.name ?? null,
    amount: recoveryCase.amount === null ? null : recoveryCase.amount.toString(),
    currency: recoveryCase.currency,
  };
}

export type SubmitResult = { recovered: true } | { recovered: false };

/**
 * Consume the token (atomic single-use claim, D5) and complete the recovery.
 * The token claim is the idempotency guard: a replayed POST loses the claim and
 * returns { recovered: false } without a second recovery. Any failure (invalid/
 * expired/used token, missing case) collapses to { recovered: false } (D4).
 */
export async function submitPaymentUpdate(rawToken: string): Promise<SubmitResult> {
  const claim = await consumeToken(tokenDeps(), rawToken);
  if (!claim.valid) return { recovered: false };

  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: claim.recoveryCaseId },
    select: { amount: true, currency: true, customerPhone: true, providerPaymentId: true },
  });
  if (!recoveryCase) return { recovered: false };

  const result = await completeRecovery(
    {
      recoveryStore: createRecoveryStore(),
      messageStore: createMessageStore(),
      messagingProvider: createConsoleMessagingProvider(),
      messagingProviderName: 'console',
      updater: createRazorpayPaymentUpdater(),
      logger,
      now: () => new Date(),
    },
    {
      recoveryCaseId: claim.recoveryCaseId,
      providerPaymentId: recoveryCase.providerPaymentId,
      recipientPhone: recoveryCase.customerPhone,
      amount: recoveryCase.amount === null ? null : Number(recoveryCase.amount),
      currency: recoveryCase.currency,
    },
  );

  return { recovered: result.status === 'recovered' };
}
