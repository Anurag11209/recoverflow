/**
 * Messaging domain contracts (ADR 0001). The engine depends only on these
 * interfaces; apps/web injects a Prisma-backed MessageStore and a concrete
 * MessagingProvider (console now, Meta WhatsApp later). No provider-specific
 * code lives in this package.
 */

export const MESSAGE_TEMPLATES = ['PAYMENT_FAILED', 'CARD_EXPIRED', 'PAYMENT_RECOVERED'] as const;
export type MessageTemplate = (typeof MESSAGE_TEMPLATES)[number];

/** Mirrors the DB MessageStatus enum structurally (engine stays Prisma-free). */
export type MessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';

/** Mirrors the DB MessageType enum (engine stays Prisma-free). */
export type MessageType = 'PAYMENT_FAILED' | 'PAYMENT_REMINDER' | 'PAYMENT_RECOVERED';

export interface SendMessageInput {
  phone: string;
  template: MessageTemplate;
  variables: Record<string, string>;
}

/** The only thing the engine knows about WhatsApp (or any channel). */
export interface MessagingProvider {
  sendMessage(input: SendMessageInput): Promise<{ providerMessageId: string }>;
}

export interface NewMessageLogInput {
  recoveryCaseId: string;
  // Nullable: recovered/reminder messages are not tied to a specific attempt
  // (D6). The DB partial unique still enforces one message per attempt when set.
  recoveryAttemptId: string | null;
  messageType: MessageType;
  provider: string;
  templateName: MessageTemplate;
  recipientPhone: string | null;
  payload: Record<string, string>;
}

export interface MessageLogRecord {
  id: string;
  recoveryCaseId: string;
  recoveryAttemptId: string | null;
  templateName: string;
  status: MessageStatus;
  recipientPhone: string | null;
  providerMessageId: string | null;
}

/**
 * Persistence port for outbound messages. createMessageLog throws a
 * P2002-shaped error on a duplicate recoveryAttemptId (the DB unique), which
 * the message service catches to guarantee a reprocessed event never sends
 * twice (at-most-once delivery).
 */
export interface MessageStore {
  createMessageLog(input: NewMessageLogInput): Promise<MessageLogRecord>;
  findMessageByAttemptId(recoveryAttemptId: string): Promise<MessageLogRecord | null>;
  markSent(id: string, providerMessageId: string): Promise<void>;
  markFailed(id: string, errorMessage: string): Promise<void>;
  listMessages(limit?: number): Promise<MessageLogRecord[]>;
}
