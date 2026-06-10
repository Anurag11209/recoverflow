# ADR 0001: Package dependency boundaries

- Status: Accepted
- Date: 2026-06-10
- Deciders: Anurag Tripathi

## Context

RecoverFlow is a modular monolith: one deployable (`apps/web`) plus internal
packages under `packages/*`. Today those are:

- `@recoverflow/shared` — cross-cutting primitives: env validation, error
  types, structured logging.
- `@recoverflow/db` — Prisma client and (later) repositories; the only place
  that talks to PostgreSQL.
- `@recoverflow/recovery-engine` — the dunning/recovery domain logic
  (currently a stub).
- `apps/web` — the Next.js application: HTTP routes, UI, and the composition
  root that wires everything together.

Without an explicit rule for which package may import which, a monorepo drifts
into a tangle: import cycles appear, the domain quietly couples to the
database, build and typecheck times balloon, and extracting a package later
(for example, running the recovery engine as its own worker) becomes a
rewrite. This ADR fixes the allowed direction of dependencies before the graph
grows.

## Decision

Internal dependencies flow in one direction only — toward `shared` — and
`apps/web` is the sole composition root. No package may import a package that
(directly or transitively) imports it; the internal import graph must remain
acyclic.

| Package                        | May import (internal)                                                    |
| ------------------------------ | ------------------------------------------------------------------------ |
| `@recoverflow/shared`          | nothing internal                                                         |
| `@recoverflow/db`              | `@recoverflow/shared`                                                    |
| `@recoverflow/recovery-engine` | `@recoverflow/shared`                                                    |
| `apps/web`                     | `@recoverflow/shared`, `@recoverflow/db`, `@recoverflow/recovery-engine` |

The deliberate choice is that the recovery engine does not import the
database. The domain defines the persistence interfaces it needs (ports);
`@recoverflow/db` provides implementations (adapters); and `apps/web` injects
the adapters into the engine at startup. The engine therefore depends only on
`shared`, stays unit-testable without a database, and could be extracted into
a standalone process without touching its imports.

Current code already complies: `shared` imports nothing internal, `db` imports
`shared` (the Prisma client reads the validated `DATABASE_URL`),
`recovery-engine` is a dependency-free stub, and `apps/web` composes the rest.

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
