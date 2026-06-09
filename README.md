# RecoverFlow

WhatsApp-first failed-payment recovery for subscription businesses in emerging markets.
Monorepo: pnpm workspaces + Turborepo, Next.js 15 (App Router), Prisma + PostgreSQL 17.

## Prerequisites

- Node 22 (`corepack enable` activates pnpm)
- Docker

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate           # generates Prisma client into packages/db/src/generated
pnpm db:migrate            # prisma migrate dev — name it: init
pnpm dev                   # http://localhost:3000
```

Verify:

```bash
curl http://localhost:3000/api/health   # {"status":"ok",...}
curl http://localhost:3000/api/ready     # {"status":"ready","checks":{"database":"up"}}
pnpm test
```

## Structure

- `apps/web` — Next.js 15 app (health + readiness routes)
- `packages/shared` — Zod env validation (server-only)
- `packages/db` — Prisma schema + client singleton
- `packages/recovery-engine` — domain package boundary (logic lands in Phase 5)

## Phase status

Phase 1 (project setup) complete. Auth, Razorpay, WhatsApp, and recovery logic are later phases.

## Error handling & logging

**Errors.** Throw a typed error from `@recoverflow/shared` instead of returning ad-hoc shapes:

- `AppError(message, { code, status, isOperational })` — base class. `code` is a stable, machine-readable string; `status` is the HTTP status; `isOperational` marks expected vs. programmer errors.
- `NotFoundError` → 404 / `NOT_FOUND`
- `ValidationError` → 400 / `VALIDATION_ERROR`

Route handlers are wrapped with `withErrorHandling` (`apps/web/lib/api.ts`), which converts any thrown error into a consistent envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "Merchant not found" } }
```

Unknown (non-`AppError`) errors always return `500 INTERNAL_ERROR` with a generic message — internal details are logged, never sent to the client.

```ts
import { NextResponse } from 'next/server';
import { NotFoundError } from '@recoverflow/shared';
import { withErrorHandling } from '@/lib/api';

export const GET = withErrorHandling(async () => {
  const merchant = await findMerchant();
  if (!merchant) throw new NotFoundError('Merchant not found');
  return NextResponse.json(merchant);
});
```

**Logging.** Use the shared Pino `logger` — never `console.log`:

- Pretty, colorized output in development; structured JSON in production.
- Level via `LOG_LEVEL` (defaults: `debug` in dev, `info` in prod).
- Secrets (`authorization`, `cookie`, `password`, `token`, `DATABASE_URL`, …) are redacted automatically.

```ts
import { logger } from '@recoverflow/shared';
logger.info({ merchantId }, 'recovery case opened');
```
