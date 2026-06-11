# RecoverFlow — Performance & Scalability Review (Phase 8, Module 8)

**Goal:** prepare dashboard queries and infrastructure for growth (100k+ each of
RecoveryCase / MessageLog / PaymentEvent) without changing user-visible behavior.
**Scope:** index review, query audit, turbo typecheck investigation, integration
verification. No features, no UI changes, no architectural redesign.

## Part 1 — Indexes added

Three composite indexes added to `RecoveryCase` (migration
`20260611220940_add_recoverycase_dashboard_indexes`):

| Index                             | Serves                     | Why                                                                                                                                                                 |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(merchantId, createdAt, id)`     | Cases list default view    | Matches `WHERE merchantId=? ORDER BY createdAt DESC, id DESC` (keyset pagination). Without it, each page scans + sorts the whole merchant partition.                |
| `(merchantId, status, createdAt)` | Status-filtered cases list | Matches `WHERE merchantId=? AND status=? ORDER BY createdAt DESC`. The leading `(merchantId, status)` columns also serve the pre-existing 2-column index's lookups. |
| `(merchantId, recoveredAt)`       | Analytics revenue trend    | Matches `WHERE merchantId=? AND recoveredAt >= ?` for the daily revenue `GROUP BY`. Turns a partition filter into a range scan.                                     |

### Case detail — no index added (intentional)

The timeline query loads a case by `token` (already `@unique`, hence indexed) and
includes `attempts` (FK index via `@@unique([recoveryCaseId, attemptNumber])`) and
`messageLogs` (FK index `@@index([recoveryCaseId])`). All access paths are already
covered; per the brief, no speculative index was added.

### Index redundancy note

The new `(merchantId, status, createdAt)` index makes the pre-existing
`(merchantId, status)` index a redundant prefix — Postgres can satisfy
`(merchantId, status)` lookups from the first two columns of the 3-column index.
The 2-column index is **retained** here (this module adds indexes; it does not
remove them, to avoid behavior changes in a perf pass). Dropping it is safe future
cleanup and is recorded under Remaining Debt.

## Part 2 — Query audit

All four dashboard query services were reviewed. None exhibit N+1; all use
aggregates or single queries with minimal selects; cursor pagination is preserved.

| Service                        | Shape                                                                                                  | N+1? | Notes                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------ |
| `lib/dashboard/stats.ts`       | 3 aggregates in `Promise.all` (count, groupBy status, sum)                                             | No   | Pure aggregates, no row fetch.                   |
| `lib/dashboard/cases.ts`       | one `findMany`, keyset (`limit+1`), `where {merchantId, status?}`, `orderBy [createdAt desc, id desc]` | No   | Cursor pagination intact; now index-backed.      |
| `lib/dashboard/case-detail.ts` | one query with nested `include` (attempts + messageLogs)                                               | No   | Single round trip; relations FK-indexed.         |
| `lib/dashboard/analytics.ts`   | 4 aggregates in `Promise.all` (2 raw `GROUP BY date_trunc`, 2 Prisma `groupBy`)                        | No   | No per-row work; revenue trend now index-backed. |

No unnecessary joins were found; the case-detail `include` is the only multi-table
read and it is a deliberate single-query join.

## Part 3 — Turbo typecheck false-green

**Root cause:** the `typecheck` task in `turbo.json` had no configuration, so it
defaulted to `cache: true` with no declared `inputs`/`outputs`/`dependsOn`. A
typecheck produces no output artifact, so Turbo cached only its exit status and
replayed a stale "pass" when it believed inputs were unchanged — including when an
**upstream** package's types changed (no `dependsOn: ["^build"]` to invalidate on
cross-package type changes). That is the occasional false-green.

**Fix (implemented):** set `"typecheck": { "cache": false }`. A typecheck is fast
and has nothing cacheable; disabling its cache makes it always run, which removes
the false-green entirely. Verified: `pnpm turbo run typecheck` now reports
`0 cached, 4 total`. The raw `pnpm exec tsc --noEmit` workaround is no longer
required, though it remains valid.

## Part 4 — Integration verification

- Migration applies cleanly (`prisma migrate dev`, applied to the dev database).
- `prisma generate` succeeds (client v6.19.3 regenerated).
- Production build succeeds.
- Unit + integration suites pass.

(Verification output captured at module close.)

## Remaining performance debt / future scaling notes

1. **Drop the redundant `(merchantId, status)` index** once confidence is high;
   it is fully covered by `(merchantId, status, createdAt)`.
2. **`CREATE INDEX CONCURRENTLY` at production deploy.** The generated migration
   uses plain `CREATE INDEX`, which takes a brief write lock. On a large live
   table, run the index creation concurrently (out of band) to avoid blocking
   writes; the dev migration is fine as-is.
3. **MessageLog / PaymentEvent at 100k+.** These are not yet read by dashboard
   queries at scale, but when message-history or event-audit views are built,
   they will need their own `(merchantId, createdAt)`-style indexes. Tracked for
   the phase that introduces those views.
4. **`IdempotencyRecord` uniqueness is global, not per-merchant** (pre-existing,
   unrelated to this module) — noted in the project ledger.
5. **Analytics raw SQL windows** (`date_trunc('day')`) are sound for 30-day
   windows; if longer ranges or higher cardinality are added later, consider a
   materialized daily-rollup table rather than on-the-fly aggregation.
