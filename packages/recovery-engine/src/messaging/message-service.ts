import { isUniqueViolation } from '../idempotency';
import type { Logger } from '../logger';
import type { FailureCategory } from '../recovery/classifier';
import { selectTemplate } from './template-selector';
import type { MessageStore, MessagingProvider } from './message-types';

export interface SendRecoveryMessageInput {
  recoveryCaseId: string;
  recoveryAttemptId: string;
  recipientPhone: string | null;
  failureCategory: FailureCategory;
  amount: number | null;
  currency: string | null;
  providerName: string;
  /** Secure payment-update link (present for attempt #1). Goes into vars + payload. */
  updateUrl?: string;
}

export type MessageOutcome =
  | { status: 'sent'; messageLogId: string; providerMessageId: string }
  | { status: 'failed'; messageLogId: string; error: string }
  | { status: 'skipped_duplicate'; messageLogId: string };

/** Build the template variables from what the failed payment gave us. */
function buildVariables(input: SendRecoveryMessageInput): Record<string, string> {
  const v: Record<string, string> = { category: input.failureCategory };
  if (input.amount !== null) v.amount = String(input.amount);
  if (input.currency !== null) v.currency = input.currency;
  if (input.updateUrl) v.updateUrl = input.updateUrl;
  return v;
}

/**
 * Send the recovery message for an attempt, at most once.
 *
 * Error containment: PROVIDER failures are caught -> MessageLog FAILED ->
 * normal return (message failures must never break event processing). STORE
 * failures (other than the P2002 duplicate) propagate, so a broken DB marks
 * the event FAILED-retryable, which is the correct unit-of-work behavior.
 *
 * Idempotency: the unique recoveryAttemptId means a reprocessed event's
 * createMessageLog throws P2002; we return the existing log WITHOUT calling
 * the provider (at-most-once delivery, never a duplicate send).
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

  const variables = buildVariables(input);

  let log;
  try {
    log = await store.createMessageLog({
      recoveryCaseId: input.recoveryCaseId,
      recoveryAttemptId: input.recoveryAttemptId,
      provider: input.providerName,
      templateName: template,
      recipientPhone: input.recipientPhone,
      payload: variables,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
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
      template,
    },
    'message log created',
  );

  if (!input.recipientPhone) {
    const error = 'missing recipient phone';
    await store.markFailed(log.id, error);
    logger.error(
      {
        event: 'message_failed',
        recoveryCaseId: input.recoveryCaseId,
        recoveryAttemptId: input.recoveryAttemptId,
        messageLogId: log.id,
        phone: null,
        template,
        err: error,
      },
      'message failed: no recipient phone',
    );
    return { status: 'failed', messageLogId: log.id, error };
  }

  try {
    const { providerMessageId } = await provider.sendMessage({
      phone: input.recipientPhone,
      template,
      variables,
    });
    await store.markSent(log.id, providerMessageId);
    logger.info(
      {
        event: 'message_sent',
        recoveryCaseId: input.recoveryCaseId,
        recoveryAttemptId: input.recoveryAttemptId,
        messageLogId: log.id,
        phone: input.recipientPhone,
        template,
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
        recoveryAttemptId: input.recoveryAttemptId,
        messageLogId: log.id,
        phone: input.recipientPhone,
        template,
        err: message,
      },
      'message failed: provider error',
    );
    return { status: 'failed', messageLogId: log.id, error: message };
  }
}
