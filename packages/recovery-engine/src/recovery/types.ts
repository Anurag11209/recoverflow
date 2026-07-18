/**
 * Recovery domain ports (ADR 0001). The engine defines what persistence it
 * needs; apps/web injects a Prisma-backed adapter. No DB import here.
 */
import type { FailureCategory } from './classifier';

export type RecoveryStatus = 'OPEN' | 'RECOVERED' | 'FAILED' | 'CLOSED';
export type AttemptStatus = 'PENDING' | 'SUCCESS' | 'FAILED';
/** How a case was recovered: LINK (payment-update flow) or ORGANIC (customer paid unprompted). */
export type RecoveryAttribution = 'LINK' | 'ORGANIC';

/** Fields needed to open a recovery case for a failed payment. */
export interface NewCaseInput {
  paymentEventId: string;
  merchantId: string;
  provider: string;
  providerPaymentId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  amount: number | null;
  currency: string | null;
  failureReason: string | null;
  failureCategory: FailureCategory;
}

export interface RecoveryCaseRecord {
  id: string;
  paymentEventId: string;
  merchantId: string | null;
  status: RecoveryStatus;
  failureCategory: string | null;
}

export interface RecoveryAttemptRecord {
  id: string;
  recoveryCaseId: string;
  attemptNumber: number;
  status: AttemptStatus;
  scheduledAt: Date;
}

export interface NewAttemptInput {
  recoveryCaseId: string;
  attemptNumber: number;
  scheduledAt: Date;
}

/**
 * A due retry attempt (status PENDING, scheduledAt <= now) joined with the case
 * fields the ladder needs to execute it and decide whether to halt. Returned by
 * ProcessingStore.listDueAttempts; consumed by runDueAttempt.
 */
export interface DueAttempt {
  attempt: { id: string; attemptNumber: number; scheduledAt: Date };
  case: {
    id: string;
    status: RecoveryStatus;
    createdAt: Date;
    merchantId: string | null;
    customerPhone: string | null;
    customerEmail: string | null;
    amount: number | null;
    currency: string | null;
    failureCategory: string | null;
  };
  /** Status of the linked subscription, or null if none / unset. */
  subscriptionStatus: string | null;
  hasSubscription: boolean;
}

/**
 * Persistence port for recovery. Implementations enforce one-case-per-event
 * and unique (caseId, attemptNumber) at the DB level; the create methods
 * return the existing row on a duplicate so handlers are safely re-runnable.
 */
export interface RecoveryStore {
  findCaseByPaymentEventId(paymentEventId: string): Promise<RecoveryCaseRecord | null>;
  /**
   * Most-recent OPEN case for this merchant matching the customer by email or
   * phone. Returns null if neither identifier is provided or nothing matches.
   * Used to attribute an organic (payment.captured) recovery to its case.
   */
  findOpenCaseByCustomer(
    merchantId: string,
    customerEmail: string | null,
    customerPhone: string | null,
  ): Promise<RecoveryCaseRecord | null>;
  createCase(input: NewCaseInput): Promise<RecoveryCaseRecord>;
  createAttempt(input: NewAttemptInput): Promise<RecoveryAttemptRecord>;
  findAttempt(recoveryCaseId: string, attemptNumber: number): Promise<RecoveryAttemptRecord | null>;
  updateCaseStatus(caseId: string, status: RecoveryStatus): Promise<void>;
  /** Mark a case RECOVERED with the recovered amount, timestamp, and attribution. */
  markRecovered(
    caseId: string,
    recoveredAmount: number,
    recoveredAt: Date,
    attribution: RecoveryAttribution,
  ): Promise<void>;
  listCases(limit?: number): Promise<RecoveryCaseRecord[]>;

  /**
   * Retry ladder: PENDING attempts whose scheduledAt is due (<= now), joined with
   * the owning case (+ subscription status), oldest first. Backed by the
   * (status, scheduledAt) index.
   */
  listDueAttempts(now: Date, limit: number): Promise<DueAttempt[]>;
  /** Record the outcome of executing (or skipping) a due attempt. */
  markAttemptExecuted(
    attemptId: string,
    status: AttemptStatus,
    executedAt: Date,
    failureReason?: string | null,
  ): Promise<void>;
}
