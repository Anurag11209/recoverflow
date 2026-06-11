import { prisma } from '@recoverflow/db';

export interface DailyCasePoint {
  day: string; // YYYY-MM-DD (UTC)
  count: number;
}

export interface DailyRevenuePoint {
  day: string; // YYYY-MM-DD (UTC)
  revenue: string; // decimal string (money never floats)
}

export interface CategorySlice {
  category: string;
  count: number;
}

export interface AnalyticsData {
  windowDays: number;
  /** Cases created per day over the window, gap-filled with zeros. */
  caseTrend: DailyCasePoint[];
  /** Recovered revenue per day (keyed on recoveredAt) over the window, gap-filled. */
  revenueTrend: DailyRevenuePoint[];
  totalCases: number;
  openCases: number;
  recoveredCases: number;
  recoveryRate: number;
  categoryBreakdown: CategorySlice[];
}

const DAY_MS = 86_400_000;

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Merchant-scoped analytics. Four aggregate queries in parallel, no N+1:
 * two raw GROUP BY date_trunc('day') trends (Prisma groupBy cannot bucket by
 * date), and two Prisma groupBys (status, failureCategory). Trends cover the
 * last `days` UTC days gap-filled with zeros; rate/status/categories are
 * all-time so the rate matches the dashboard overview. trim_scale keeps the
 * Decimal sum a clean string ('499', not '499.000...').
 */
export async function getAnalytics(
  merchantId: string,
  opts: { days?: number; now?: Date } = {},
): Promise<AnalyticsData> {
  const windowDays = opts.days ?? 30;
  const now = opts.now ?? new Date();
  const windowStart = new Date(utcDayStart(now).getTime() - (windowDays - 1) * DAY_MS);

  const [caseRows, revenueRows, byStatus, byCategory] = await Promise.all([
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM "RecoveryCase"
      WHERE "merchantId" = ${merchantId}
        AND "createdAt" >= ${windowStart}
      GROUP BY 1
    `,
    prisma.$queryRaw<{ day: string; revenue: string }[]>`
      SELECT to_char(date_trunc('day', "recoveredAt"), 'YYYY-MM-DD') AS day,
             trim_scale(COALESCE(SUM("recoveredAmount"), 0))::text AS revenue
      FROM "RecoveryCase"
      WHERE "merchantId" = ${merchantId}
        AND "recoveredAt" IS NOT NULL
        AND "recoveredAt" >= ${windowStart}
      GROUP BY 1
    `,
    prisma.recoveryCase.groupBy({
      by: ['status'],
      where: { merchantId },
      _count: { _all: true },
    }),
    prisma.recoveryCase.groupBy({
      by: ['failureCategory'],
      where: { merchantId },
      _count: { _all: true },
    }),
  ]);

  const caseByDay = new Map(caseRows.map((r) => [r.day, r.count]));
  const revenueByDay = new Map(revenueRows.map((r) => [r.day, r.revenue]));
  const caseTrend: DailyCasePoint[] = [];
  const revenueTrend: DailyRevenuePoint[] = [];
  for (let i = 0; i < windowDays; i++) {
    const key = dayKey(new Date(windowStart.getTime() + i * DAY_MS));
    caseTrend.push({ day: key, count: caseByDay.get(key) ?? 0 });
    revenueTrend.push({ day: key, revenue: revenueByDay.get(key) ?? '0' });
  }

  const countFor = (status: 'OPEN' | 'RECOVERED'): number =>
    byStatus.find((r) => r.status === status)?._count._all ?? 0;
  const totalCases = byStatus.reduce((acc, r) => acc + r._count._all, 0);
  const openCases = countFor('OPEN');
  const recoveredCases = countFor('RECOVERED');
  const recoveryRate = totalCases === 0 ? 0 : Math.round((recoveredCases / totalCases) * 1000) / 10;

  const categoryBreakdown: CategorySlice[] = byCategory
    .map((r) => ({ category: r.failureCategory ?? 'UNKNOWN', count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  return {
    windowDays,
    caseTrend,
    revenueTrend,
    totalCases,
    openCases,
    recoveredCases,
    recoveryRate,
    categoryBreakdown,
  };
}
