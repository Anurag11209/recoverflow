import { prisma } from '@recoverflow/db';
import { logger } from '@recoverflow/shared';

/**
 * Stable action keys for the settings audit log. Keeping these as a closed set
 * makes the log queryable and prevents free-form drift.
 */
export type AuditAction = 'profile.updated' | 'webhook_secret.regenerated';

export interface AuditEntry {
  merchantId: string;
  userId?: string;
  action: AuditAction;
  /**
   * Non-sensitive change context only (e.g. which field changed, old/new name).
   * Restricted to JSON primitives so it satisfies Prisma's Json input type.
   * NEVER pass secret values here — webhook secrets, passwords, tokens.
   */
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Appends an audit entry. Best-effort: a logging failure must never break the
 * underlying action, so callers may ignore rejection (the write is awaited but
 * errors are logged, not rethrown).
 */
export async function recordAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        merchantId: entry.merchantId,
        userId: entry.userId ?? null,
        action: entry.action,
        metadata: entry.metadata ?? undefined,
      },
    });
  } catch (err) {
    logger.error(
      { event: 'audit_write_failed', action: entry.action, merchantId: entry.merchantId, err },
      'failed to write audit log entry',
    );
  }
}

/** Most-recent audit entries for a merchant, newest first. */
export async function recentAuditEvents(merchantId: string, limit = 20) {
  return prisma.auditLog.findMany({
    where: { merchantId },
    // createdAt alone is non-deterministic for entries in the same millisecond;
    // id is a stable secondary sort so ordering is well-defined.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
}
