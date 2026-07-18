# ADR 0001: Package dependency boundaries

- Status: Accepted
- Date: 2026-06-10
- Deciders: Anurag Tripathi

## Context

RecoverFlow is a modular monolith: two deployables (`apps/web` and
`apps/worker`) plus internal packages under `packages/*`. Today those are:

- `@recoverflow/shared` — cross-cutting primitives: env validation, error
  types, structured logging.
- `@recoverflow/db` — Prisma client and (later) repositories; the only place
  that talks to PostgreSQL.
- `@recoverflow/recovery-engine` — the dunning/recovery domain logic. It defines
  the persistence ports it needs but never imports a database.
- `@recoverflow/adapters` — Prisma-backed implementations of the recovery-engine
  ports (over `@recoverflow/db`), shared by both apps.
- `apps/web` — the Next.js application: HTTP routes, UI, and a composition root.
- `apps/worker` — the background worker that drains queued `EventProcessing`
  rows through the recovery engine; a second composition root.

Without an explicit rule for which package may import which, a monorepo drifts
into a tangle: import cycles appear, the domain quietly couples to the
database, build and typecheck times balloon, and extracting a package later
(for example, running the recovery engine as its own worker) becomes a
rewrite. This ADR fixes the allowed direction of dependencies before the graph
grows.

## Decision

Internal dependencies flow in one direction only — toward `shared` — and the
apps (`apps/web`, `apps/worker`) are the composition roots. No package may import
a package that (directly or transitively) imports it; the internal import graph
must remain acyclic.

| Package                        | May import (internal)                         |
| ------------------------------ | --------------------------------------------- |
| `@recoverflow/shared`          | nothing internal                              |
| `@recoverflow/db`              | `shared`                                      |
| `@recoverflow/recovery-engine` | `shared`                                      |
| `@recoverflow/adapters`        | `shared`, `db`, `recovery-engine`             |
| `apps/web`                     | `shared`, `db`, `recovery-engine`, `adapters` |
| `apps/worker`                  | `shared`, `db`, `recovery-engine`, `adapters` |

(`@recoverflow/adapters` sits above `db` and `recovery-engine`: it implements the
engine's ports using the Prisma client. Neither `db` nor `recovery-engine` imports
`adapters`, so no cycle is introduced.)

The deliberate choice is that the recovery engine does not import the
database. The domain defines the persistence interfaces it needs (ports);
`@recoverflow/adapters` provides implementations over `@recoverflow/db`; and each
app injects the adapters into the engine at its composition root. The engine
therefore depends only on `shared`, stays unit-testable without a database, and
runs unchanged in both the web app and the standalone worker.

Current code complies: `shared` imports nothing internal, `db` imports `shared`
(the Prisma client reads the validated `DATABASE_URL`), `recovery-engine`
implements the recovery domain logic yet still imports only `shared` —
persistence reaches it as injected ports, never a direct Prisma import —
`adapters` implements those ports over `db`, and the two apps (`apps/web`,
`apps/worker`) compose the rest. The worker validates this boundary in practice:
extracting a second runtime was a wiring change, not a rewrite.

## Consequences

Positive: the import graph stays acyclic by construction; the domain is
testable in isolation; the dependency on PostgreSQL is confined to one
package; and the layering makes future extraction (separate worker, separate
service) a move rather than a rewrite.

Trade-off: persistence is reached through interfaces and injected by the app
rather than imported directly, which is a little more wiring up front. The app
is the only place that knows about every package — that concentration is
intentional (it is the composition root) but means the app must stay thin.

## Enforcement

For now this ADR is the contract, reviewed by hand in pull requests. Automated
enforcement is deferred until the package graph is large enough to warrant it.
When it is, a dependency-cruiser config will encode these same rules and run as
a CI step, failing the build on any forbidden edge or cycle (for example:
forbid any import from recovery-engine into db, and forbid all cycles). That
step slots into the existing CI workflow alongside lint and typecheck.

## Alternatives considered

Letting `recovery-engine` import `@recoverflow/db` directly would remove the
ports/adapters wiring and be quicker to write, but it couples the domain to
Prisma and PostgreSQL, makes the engine impossible to test without a database,
and blocks clean extraction later. Rejected in favour of the stated
clean-architecture boundary.

Having no boundary rule at all was rejected outright: it is how cycles,
coupling, and slow builds creep in.
