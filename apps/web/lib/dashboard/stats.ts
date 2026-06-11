import { prisma } from '@recoverflow/db';

/** Merchant-scoped dashboard overview metrics (Phase 8 Module 1). */
export interface DashboardStats {
  /** PaymentEvents with eventType payment.failed (received, whether or not a case opened). */
  totalFailedPayments: number;
  totalCases: number;
  openCases: number;
  recoveredCases: number;
  /** RECOVERED / total cases, as a percent rounded to one decimal. 0 when no cases. */
  recoveryRate: number;
  /** Sum of recoveredAmount over RECOVERED cases, as a decimal string (money never floats). */
  recoveredRevenue: string;
}

/**
 * Aggregate the overview metrics for one merchant. Three parallel queries:
 * a status groupBy (total/open/recovered in one pass), a Decimal sum for
 * revenue (computed in Postgres, no JS float drift), and a failed-payment
 * count off PaymentEvent. Everything is merchant-scoped; the RecoveryCase
 * queries ride the [merchantId, status] composite index.
 */
export async function getDashboardStats(merchantId: string): Promise<DashboardStats> {
  const [byStatus, revenue, totalFailedPayments] = await Promise.all([
    prisma.recoveryCase.groupBy({
      by: ['status'],
      where: { merchantId },
      _count: { _all: true },
    }),
    prisma.recoveryCase.aggregate({
      where: { merchantId, status: 'RECOVERED' },
      _sum: { recoveredAmount: true },
    }),
    prisma.paymentEvent.count({
      where: { merchantId, eventType: 'payment.failed' },
    }),
  ]);

  const countFor = (status: 'OPEN' | 'RECOVERED'): number =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  const totalCases = byStatus.reduce((acc, row) => acc + row._count._all, 0);
  const openCases = countFor('OPEN');
  const recoveredCases = countFor('RECOVERED');
  const recoveryRate = totalCases === 0 ? 0 : Math.round((recoveredCases / totalCases) * 1000) / 10;
  const recoveredRevenue = (revenue._sum.recoveredAmount ?? 0).toString();

  return {
    totalFailedPayments,
    totalCases,
    openCases,
    recoveredCases,
    recoveryRate,
    recoveredRevenue,
  };
}
