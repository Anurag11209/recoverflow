/**
 * Recovery domain ports (ADR 0001). The engine defines what persistence it
 * needs; apps/web injects a Prisma-backed adapter. No DB import here.
 */
import type { FailureCategory } from './classifier';

export type RecoveryStatus = 'OPEN' | 'RECOVERED' | 'FAILED' | 'CLOSED';
export type AttemptStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

/** Fields needed to open a recovery case for a failed payment. */
export interface NewCaseInput {
  paymentEventId: string;
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
 * Persistence port for recovery. Implementations enforce one-case-per-event
 * and unique (caseId, attemptNumber) at the DB level; the create methods
 * return the existing row on a duplicate so handlers are safely re-runnable.
 */
export interface RecoveryStore {
  findCaseByPaymentEventId(paymentEventId: string): Promise<RecoveryCaseRecord | null>;
  createCase(input: NewCaseInput): Promise<RecoveryCaseRecord>;
  createAttempt(input: NewAttemptInput): Promise<RecoveryAttemptRecord>;
  findAttempt(recoveryCaseId: string, attemptNumber: number): Promise<RecoveryAttemptRecord | null>;
  updateCaseStatus(caseId: string, status: RecoveryStatus): Promise<void>;
  listCases(limit?: number): Promise<RecoveryCaseRecord[]>;
}
