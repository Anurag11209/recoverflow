import { isUniqueViolation } from '../idempotency';
import type { Logger } from '../logger';
import type { FailureCategory } from '../recovery/classifier';
import { selectTemplate } from './template-selector';
import type {
  MessageStore,
  MessageTemplate,
  MessageType,
  MessagingProvider,
} from './message-types';

export interface SendRecoveryMessageInput {
  recoveryCaseId: string;
  merchantId: string | null;
  recoveryAttemptId: string;
  recipientPhone: string | null;
  /** Recipient email; the send channel is chosen by the injected provider. */
  recipientEmail: string | null;
  failureCategory: FailureCategory;
  amount: number | null;
  currency: string | null;
  providerName: string;
  /** Secure payment-update link (present for attempt #1). Goes into vars + payload. */
  updateUrl?: string;
}

/** General message input: attempt-optional, template + type explicit. */
export interface SendOneMessageInput {
  recoveryCaseId: string;
  merchantId: string | null;
  recoveryAttemptId: string | null;
  messageType: MessageType;
  template: MessageTemplate;
  recipientPhone: string | null;
  recipientEmail: string | null;
  variables: Record<string, string>;
  providerName: string;
}

export type MessageOutcome =
  | { status: 'sent'; messageLogId: string; providerMessageId: string }
  | { status: 'failed'; messageLogId: string; error: string }
  | { status: 'skipped_duplicate'; messageLogId: string };

/** Build the failure-message template variables from the failed payment. */
function buildVariables(input: SendRecoveryMessageInput): Record<string, string> {
  const v: Record<string, string> = { category: input.failureCategory };
  if (input.amount !== null) v.amount = String(input.amount);
  if (input.currency !== null) v.currency = input.currency;
  if (input.updateUrl) v.updateUrl = input.updateUrl;
  return v;
}

/**
 * General send primitive: create a MessageLog, send via the provider, mark the
 * outcome. At-most-once delivery for ATTEMPT-LINKED messages comes from the
 * partial unique on recoveryAttemptId (P2002 -> skipped_duplicate). For
 * null-attempt messages (recovered/reminder) there is no such constraint; their
 * idempotency comes from the caller (e.g. the single-use token claim, D5), so
 * we do not attempt the duplicate lookup when attemptId is null.
 *
 * Error containment: provider failures are caught -> MessageLog FAILED ->
 * normal return (a message failure must never break the caller's workflow).
 * Store failures other than the P2002 duplicate propagate.
 */
export async function sendMessage(
  store: MessageStore,
  provider: MessagingProvider,
  logger: Logger,
  input: SendOneMessageInput,
): Promise<MessageOutcome> {
  let log;
  try {
    log = await store.createMessageLog({
      recoveryCaseId: input.recoveryCaseId,
      merchantId: input.merchantId,
      recoveryAttemptId: input.recoveryAttemptId,
      messageType: input.messageType,
      provider: input.providerName,
      templateName: input.template,
      recipientPhone: input.recipientPhone,
      recipientEmail: input.recipientEmail,
      payload: input.variables,
    });
  } catch (e) {
    if (input.recoveryAttemptId !== null && isUniqueViolation(e)) {
      const existing = await store.findMessageByAttemptId(input.recoveryAttemptId);
      if (existing) {
        logger.info(
          {
            event: 'message_skipped_duplicate',
            recoveryCaseId: input.recoveryCaseId,
            recoveryAttemptId: input.recoveryAttemptId,
            messageLogId: existing.id,
          },
          'message already exists for attempt; not resending',
        );
        return { status: 'skipped_duplicate', messageLogId: existing.id };
      }
    }
    throw e;
  }

  logger.info(
    {
      event: 'message_log_created',
      recoveryCaseId: input.recoveryCaseId,
      recoveryAttemptId: input.recoveryAttemptId,
      messageLogId: log.id,
      phone: input.recipientPhone,
      template: input.template,
      messageType: input.messageType,
    },
    'message log created',
  );

  // Channel-agnostic guard: with NEITHER a phone nor an email there is nobody to
  // deliver to on any channel. The concrete provider enforces the specific field
  // its channel needs (e.g. Resend requires email) and throws otherwise.
  if (!input.recipientPhone && !input.recipientEmail) {
    const error = 'missing recipient';
    await store.markFailed(log.id, error);
    logger.error(
      {
        event: 'message_failed',
        recoveryCaseId: input.recoveryCaseId,
        messageLogId: log.id,
        template: input.template,
        err: error,
      },
      'message failed: no recipient (phone or email)',
    );
    return { status: 'failed', messageLogId: log.id, error };
  }

  try {
    const { providerMessageId } = await provider.sendMessage({
      phone: input.recipientPhone,
      email: input.recipientEmail,
      template: input.template,
      variables: input.variables,
    });
    await store.markSent(log.id, providerMessageId);
    logger.info(
      {
        event: 'message_sent',
        recoveryCaseId: input.recoveryCaseId,
        recoveryAttemptId: input.recoveryAttemptId,
        messageLogId: log.id,
        phone: input.recipientPhone,
        template: input.template,
        messageType: input.messageType,
        providerMessageId,
      },
      'message sent',
    );
    return { status: 'sent', messageLogId: log.id, providerMessageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await store.markFailed(log.id, message);
    logger.error(
      {
        event: 'message_failed',
        recoveryCaseId: input.recoveryCaseId,
        messageLogId: log.id,
        template: input.template,
        err: message,
      },
      'message failed: provider error',
    );
    return { status: 'failed', messageLogId: log.id, error: message };
  }
}

/**
 * Phase-6 wrapper: send the recovery (failure) message for an attempt. Selects
 * the template from the failure category, builds the variables, and delegates
 * to the general sendMessage primitive with messageType PAYMENT_FAILED.
 */
export async function sendRecoveryMessage(
  store: MessageStore,
  provider: MessagingProvider,
  logger: Logger,
  input: SendRecoveryMessageInput,
): Promise<MessageOutcome> {
  const template = selectTemplate(input.failureCategory);
  logger.info(
    {
      event: 'message_template_selected',
      recoveryCaseId: input.recoveryCaseId,
      recoveryAttemptId: input.recoveryAttemptId,
      phone: input.recipientPhone,
      template,
    },
    'message template selected',
  );

  return sendMessage(store, provider, logger, {
    recoveryCaseId: input.recoveryCaseId,
    merchantId: input.merchantId,
    recoveryAttemptId: input.recoveryAttemptId,
    messageType: 'PAYMENT_FAILED',
    template,
    recipientPhone: input.recipientPhone,
    recipientEmail: input.recipientEmail,
    variables: buildVariables(input),
    providerName: input.providerName,
  });
}
