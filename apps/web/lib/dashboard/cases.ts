import { prisma } from '@recoverflow/db';
import type { RecoveryStatus } from '@recoverflow/db';

export const CASES_PAGE_SIZE = 20;

export interface CaseListItem {
  token: string;
  status: RecoveryStatus;
  customerEmail: string | null;
  customerPhone: string | null;
  amount: string | null;
  currency: string | null;
  failureCategory: string | null;
  recoveredAmount: string | null;
  createdAt: Date;
}

export interface ListCasesParams {
  status?: RecoveryStatus;
  cursor?: string;
  limit?: number;
}

export interface ListCasesResult {
  cases: CaseListItem[];
  nextCursor: string | null;
}

interface Keyset {
  createdAt: Date;
  id: string;
}

// Opaque base64url cursor over the (createdAt, id) keyset. Decoding never
// throws: a malformed or tampered cursor is treated as "no cursor" so a bad
// querystring degrades to page one rather than a 500.
function encodeCursor(k: Keyset): string {
  const raw = JSON.stringify({ t: k.createdAt.toISOString(), i: k.id });
  return Buffer.from(raw, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): Keyset | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      t?: unknown;
      i?: unknown;
    };
    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string') return null;
    const createdAt = new Date(parsed.t);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.i };
  } catch {
    return null;
  }
}

/**
 * Merchant-scoped, newest-first page of recovery cases. Keyset pagination on
 * (createdAt DESC, id DESC) — stable as new cases arrive at the top, unlike
 * offset. Fetches limit+1 to know whether a next page exists without a count.
 */
export async function listCases(
  merchantId: string,
  params: ListCasesParams = {},
): Promise<ListCasesResult> {
  const limit = params.limit ?? CASES_PAGE_SIZE;
  const after = decodeCursor(params.cursor);

  const rows = await prisma.recoveryCase.findMany({
    where: {
      merchantId,
      ...(params.status ? { status: params.status } : {}),
      ...(after
        ? {
            OR: [
              { createdAt: { lt: after.createdAt } },
              { createdAt: after.createdAt, id: { lt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      token: true,
      status: true,
      customerEmail: true,
      customerPhone: true,
      amount: true,
      currency: true,
      failureCategory: true,
      recoveredAmount: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

  return {
    cases: page.map((r) => ({
      token: r.token,
      status: r.status,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      amount: r.amount === null ? null : r.amount.toString(),
      currency: r.currency,
      failureCategory: r.failureCategory,
      recoveredAmount: r.recoveredAmount === null ? null : r.recoveredAmount.toString(),
      createdAt: r.createdAt,
    })),
    nextCursor,
  };
}
