# RecoverFlow — Deployment Guide (Railway)

This guide deploys RecoverFlow to Railway with a managed PostgreSQL database, a
custom domain, and automatic SSL. The repository ships a `railway.toml` that
encodes the build, migration (release), and start steps, so most of the build
config is already done — your job is the Railway/DNS click-ops and setting
production environment variables.

**Cost note:** Railway has no free tier. The Pro plan is ~$20/month (includes
$20 of usage credit); a small Next.js app + Postgres typically runs $8–15/month.
Confirm current pricing at railway.com before you start.

## What the repo already provides

- `railway.toml` (repo root) — build: `db:generate` + filtered Turbo build of the
  web app; release (`preDeployCommand`): `prisma migrate deploy`; start: the
  production Next.js server; watch patterns so doc-only commits don't redeploy.
- `/api/health` — liveness (process up).
- `/api/ready` — readiness (runs `SELECT 1`; returns 503 if the DB is down).
  Use this as the Railway healthcheck path.

## Prerequisites

- A Railway account (https://railway.com) with billing enabled.
- The GitHub repo connected to Railway.
- Your custom domain's DNS managed somewhere you can add a CNAME.

## Step 1 — Create the project and database

1. Railway dashboard → New Project → Deploy from GitHub repo → select
   `Anurag11209/recoverflow`.
2. Railway detects the monorepo. When it stages the web service, open the
   service → Settings → set the **Config File** path to `/railway.toml` (absolute
   path; Railway reads config from the repo root, not the service root).
3. In the same project: New → Database → Add PostgreSQL. This provisions a
   managed Postgres instance and exposes `DATABASE_URL` as a reference variable.

## Step 2 — Environment variables

On the web service → Variables, set:

| Variable              | Value                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`            | `production`                                                           |
| `DATABASE_URL`        | `${{Postgres.DATABASE_URL}}` (reference the Postgres plugin)           |
| `NEXT_PUBLIC_APP_URL` | your public origin, e.g. `https://app.recoverflow.com`                 |
| `APP_BASE_URL`        | same public origin (outbound WhatsApp links)                           |
| `MESSAGING_PROVIDER`  | `console` for now (swap to the WhatsApp provider when live)            |
| `LOG_LEVEL`           | `info`                                                                 |
| `APP_ENCRYPTION_KEY`  | a 32-byte base64 key (`openssl rand -base64 32`) — used by Milestone 2 |

`DATABASE_URL` as a reference (`${{Postgres.DATABASE_URL}}`) means Railway keeps it
in sync if the database moves; never paste the raw connection string.

## Step 3 — First deploy

1. Trigger a deploy (push to `main`, or Deploy in the dashboard).
2. Watch the build logs. Expected order:
   - install (Railpack: corepack + `pnpm --frozen-lockfile`)
   - build (`pnpm db:generate && pnpm turbo run build --filter=@recoverflow/web...`)
   - release/pre-deploy (`pnpm db:deploy` — applies migrations to the managed DB)
   - start (`pnpm --filter @recoverflow/web start`)
3. The first release runs all committed migrations against the fresh database.

**Large-table note:** the Module 8 indexes use plain `CREATE INDEX`. On a fresh
production database the table is empty, so this is instant. If you ever apply
index migrations to an already-populated production table, run them as
`CREATE INDEX CONCURRENTLY` out of band instead.

## Step 4 — Health check

Service → Settings → Healthcheck Path: `/api/ready`. Railway will hold traffic
from a new deployment until that path returns 200. Verify after deploy:

```bash
curl https://<your-domain>/api/health   # {"status":"ok",...}
curl https://<your-domain>/api/ready    # {"status":"ready","checks":{"database":"up"}}
```

If `/api/ready` returns 503, the app can't reach Postgres — check `DATABASE_URL`.
If the service never becomes healthy, confirm the server bound `0.0.0.0:$PORT`
(Next.js does this by default; Railway injects `$PORT`).

## Step 5 — Custom domain + SSL

1. Service → Settings → Networking → Custom Domain → enter `app.recoverflow.com`.
2. Railway shows a CNAME target. Add that CNAME at your DNS provider.
3. Wait for DNS propagation; Railway provisions a TLS certificate automatically
   (Let's Encrypt). SSL is then live with no further action.
4. Update `NEXT_PUBLIC_APP_URL` and `APP_BASE_URL` to the custom domain if you
   set them to the temporary `*.up.railway.app` URL earlier, then redeploy.

## Step 6 — Database backups

1. Postgres service → Settings → Backups → enable scheduled backups (daily).
2. Note the retention window. Take one manual backup now as a baseline.
3. Restore drill (do this once before launch): provision a throwaway Postgres,
   restore the latest backup into it, and confirm row counts/tables. A backup you
   have never restored is not a backup. (Full restore verification is part of
   Milestone 5's launch checklist.)

## Step 7 — Error monitoring & logging

- **Logging:** the app uses Pino (`@recoverflow/shared`) — structured JSON in
  production, with secrets (`authorization`, `cookie`, `password`, `token`,
  `DATABASE_URL`, …) redacted automatically. Railway captures stdout/stderr; logs
  are searchable in the service's Observability tab. Confirm JSON logs appear and
  that no secret values are visible.
- **Error monitoring:** add an error tracker (e.g. Sentry) before taking real
  merchant traffic. This is a recommended pre-launch step; if not done now, it is
  tracked in the Milestone 5 launch checklist as a launch-blocker for real users.

## Step 8 — Verify the deployment (success criteria)

- [ ] Public URL is live over HTTPS.
- [ ] A merchant can register and log in.
- [ ] The dashboard loads (overview, cases, analytics).
- [ ] The recovery flow works end to end: point a Razorpay webhook at
      `https://<domain>/api/webhooks/razorpay/<webhookToken>` (the token from the
      merchant's registration), send a `payment.failed`, and confirm a recovery
      case appears on the dashboard.

## Rollback

Railway keeps previous deployments. If a deploy is bad, open the service →
Deployments → select the last good one → Redeploy. Because migrations run in the
release phase, avoid destructive (column-dropping) migrations without a tested
backup; this product's migrations to date are additive (indexes, new columns).

## Continuous deployment

With the GitHub integration, every push to `main` that touches the watched paths
triggers a build → release (migrations) → start. Doc-only commits (`docs/**`,
`*.md`) are excluded by `watchPatterns` and won't redeploy.
