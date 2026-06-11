import { prisma } from '@recoverflow/db';
import type { RecoveryStatus, AttemptStatus, MessageStatus, MessageType } from '@recoverflow/db';

export interface CaseSummary {
  token: string;
  status: RecoveryStatus;
  amount: string | null;
  currency: string | null;
  failureCategory: string | null;
  failureReason: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: Date;
  recoveredAt: Date | null;
  recoveredAmount: string | null;
}

export interface AttemptItem {
  attemptNumber: number;
  status: AttemptStatus;
  scheduledAt: Date;
  executedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface MessageItem {
  messageType: MessageType;
  status: MessageStatus;
  recipientPhone: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export type TimelineEventKind =
  | 'case_created'
  | 'attempt_created'
  | 'message_sent'
  | 'payment_recovered';

export interface TimelineEvent {
  at: Date;
  kind: TimelineEventKind;
  label: string;
  detail: string | null;
}

export interface RecoveryCaseDetail {
  summary: CaseSummary;
  attempts: AttemptItem[];
  messages: MessageItem[];
  timeline: TimelineEvent[];
}

/** Merge the case, its attempts, and its messages into one chronological feed. */
function buildTimeline(
  summary: CaseSummary,
  attempts: AttemptItem[],
  messages: MessageItem[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    at: summary.createdAt,
    kind: 'case_created',
    label: 'Recovery case created',
    detail: summary.failureCategory,
  });

  for (const a of attempts) {
    events.push({
      at: a.createdAt,
      kind: 'attempt_created',
      label: `Recovery attempt #${a.attemptNumber} created`,
      detail: a.status,
    });
  }

  for (const m of messages) {
    events.push({
      at: m.createdAt,
      kind: 'message_sent',
      label: `WhatsApp message: ${m.messageType}`,
      detail: m.status === 'FAILED' ? (m.errorMessage ?? 'failed') : m.status,
    });
  }

  if (summary.recoveredAt) {
    events.push({
      at: summary.recoveredAt,
      kind: 'payment_recovered',
      label: 'Payment recovered',
      detail: summary.recoveredAmount,
    });
  }

  // Ascending by time; stable tiebreak by kind ordering for identical timestamps.
  const order: Record<TimelineEventKind, number> = {
    case_created: 0,
    attempt_created: 1,
    message_sent: 2,
    payment_recovered: 3,
  };
  return events.sort((x, y) => {
    const d = x.at.getTime() - y.at.getTime();
    return d !== 0 ? d : order[x.kind] - order[y.kind];
  });
}

/**
 * Merchant-scoped case detail. The {merchantId, token} where-clause IS the
 * authorization boundary: a token owned by another merchant simply isn't
 * found and the caller renders not-found. Returns null when no such case.
 */
export async function getRecoveryCaseDetail(
  merchantId: string,
  token: string,
): Promise<RecoveryCaseDetail | null> {
  const found = await prisma.recoveryCase.findFirst({
    where: { merchantId, token },
    select: {
      token: true,
      status: true,
      amount: true,
      currency: true,
      failureCategory: true,
      failureReason: true,
      customerEmail: true,
      customerPhone: true,
      createdAt: true,
      recoveredAt: true,
      recoveredAmount: true,
      attempts: {
        orderBy: { attemptNumber: 'asc' },
        select: {
          attemptNumber: true,
          status: true,
          scheduledAt: true,
          executedAt: true,
          failureReason: true,
          createdAt: true,
        },
      },
      messageLogs: {
        orderBy: { createdAt: 'asc' },
        select: {
          messageType: true,
          status: true,
          recipientPhone: true,
          errorMessage: true,
          createdAt: true,
        },
      },
    },
  });

  if (!found) return null;

  const summary: CaseSummary = {
    token: found.token,
    status: found.status,
    amount: found.amount === null ? null : found.amount.toString(),
    currency: found.currency,
    failureCategory: found.failureCategory,
    failureReason: found.failureReason,
    customerEmail: found.customerEmail,
    customerPhone: found.customerPhone,
    createdAt: found.createdAt,
    recoveredAt: found.recoveredAt,
    recoveredAmount: found.recoveredAmount === null ? null : found.recoveredAmount.toString(),
  };
  const attempts: AttemptItem[] = found.attempts.map((a) => ({
    attemptNumber: a.attemptNumber,
    status: a.status,
    scheduledAt: a.scheduledAt,
    executedAt: a.executedAt,
    failureReason: a.failureReason,
    createdAt: a.createdAt,
  }));
  const messages: MessageItem[] = found.messageLogs.map((m) => ({
    messageType: m.messageType,
    status: m.status,
    recipientPhone: m.recipientPhone,
    errorMessage: m.errorMessage,
    createdAt: m.createdAt,
  }));

  return { summary, attempts, messages, timeline: buildTimeline(summary, attempts, messages) };
}
