import type { Logger } from '../logger';
import type { RecoveryStore } from '../recovery/types';
import type { MessageStore, MessagingProvider } from '../messaging/message-types';
import { sendMessage } from '../messaging/message-service';
import type { PaymentMethodUpdater } from './payment-method-updater';

export interface CompleteRecoveryDeps {
  recoveryStore: RecoveryStore;
  messageStore: MessageStore;
  messagingProvider: MessagingProvider;
  messagingProviderName: string;
  updater: PaymentMethodUpdater;
  logger: Logger;
  now: () => Date;
}

export interface CompleteRecoveryInput {
  recoveryCaseId: string;
  providerPaymentId: string | null;
  recipientPhone: string | null;
  amount: number | null;
  currency: string | null;
}

export type CompleteRecoveryResult =
  | { status: 'recovered'; recoveredAmount: number; simulated: boolean }
  | { status: 'update_failed' };

/**
 * Complete a recovery after a customer submits the payment update.
 *
 * Order (deliberate): (1) call the PaymentMethodUpdater, (2) on success mark the
 * case RECOVERED with amount + timestamp, (3) log payment_recovered, (4)
 * best-effort send the PAYMENT_RECOVERED message. The recovery is REAL after
 * step 2; the message (step 4) is non-critical and its failure is contained —
 * it must never undo a completed recovery (a WhatsApp outage cannot lose money
 * we have already recovered).
 *
 * Idempotency: the caller (the POST endpoint) gates this behind the single-use
 * token claim (D5), so completeRecovery runs at most once per recovery.
 */
export async function completeRecovery(
  deps: CompleteRecoveryDeps,
  input: CompleteRecoveryInput,
): Promise<CompleteRecoveryResult> {
  deps.logger.info(
    {
      event: 'payment_update_started',
      recoveryCaseId: input.recoveryCaseId,
      amount: input.amount,
    },
    'payment update started',
  );

  const result = await deps.updater.updatePaymentMethod({
    recoveryCaseId: input.recoveryCaseId,
    providerPaymentId: input.providerPaymentId,
    amount: input.amount,
    currency: input.currency,
  });

  if (!result.success) {
    deps.logger.error(
      { event: 'payment_update_failed', recoveryCaseId: input.recoveryCaseId },
      'payment method update failed',
    );
    return { status: 'update_failed' };
  }

  const recoveredAmount = input.amount ?? 0;
  const recoveredAt = deps.now();
  await deps.recoveryStore.markRecovered(input.recoveryCaseId, recoveredAmount, recoveredAt);

  deps.logger.info(
    {
      event: 'payment_recovered',
      recoveryCaseId: input.recoveryCaseId,
      recoveredAmount,
      recoveredAt: recoveredAt.toISOString(),
      simulated: result.simulated,
      providerReference: result.providerReference,
    },
    'payment recovered',
  );

  // Best-effort success message. A failure here is logged inside sendMessage and
  // must NOT undo the recovery above.
  const variables: Record<string, string> = {};
  if (input.amount !== null) variables.amount = String(input.amount);
  if (input.currency !== null) variables.currency = input.currency;
  await sendMessage(deps.messageStore, deps.messagingProvider, deps.logger, {
    recoveryCaseId: input.recoveryCaseId,
    recoveryAttemptId: null,
    messageType: 'PAYMENT_RECOVERED',
    template: 'PAYMENT_RECOVERED',
    recipientPhone: input.recipientPhone,
    variables,
    providerName: deps.messagingProviderName,
  });

  return { status: 'recovered', recoveredAmount, simulated: result.simulated };
}
