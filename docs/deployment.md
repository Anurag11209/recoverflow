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
| `MESSAGING_PROVIDER`  | `console` (logs) or `resend` (real email). See Email below.            |
| `RESEND_API_KEY`      | Resend API key (`re_...`). REQUIRED when `MESSAGING_PROVIDER=resend`.   |
| `EMAIL_FROM`          | Verified From identity, e.g. `RecoverFlow <no-reply@recoverflow.com>`.  |
| `LOG_LEVEL`           | `info`                                                                 |
| `APP_ENCRYPTION_KEY`  | a 32-byte base64 key (`openssl rand -base64 32`) — used by Milestone 2 |
| `INTERNAL_API_TOKEN`  | shared secret for `/api/internal/*` (`openssl rand -hex 32`)           |

When `MESSAGING_PROVIDER=resend`, the env schema requires `RESEND_API_KEY` and
`EMAIL_FROM` at boot (the app refuses to start otherwise), so a misconfigured
email backend fails fast rather than on the first send. Leave `MESSAGING_PROVIDER`
at `console` to log emails instead of sending them (local dev / staging).

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

## Email deliverability (Resend: SPF, DKIM, DMARC)

RecoverFlow sends transactional email (failed-payment recovery messages when
`MESSAGING_PROVIDER=resend`, and password-reset links) through
[Resend](https://resend.com). For that mail to reach inboxes rather than spam,
the sending domain (the domain in `EMAIL_FROM`, e.g. `recoverflow.com`) must
publish three DNS records that authenticate Resend as an allowed sender. These
are **DNS records you add at your DNS provider** — this repo and the app never
touch DNS, and no code change is involved. Do this once per sending domain.

1. **Add the domain in Resend** → Dashboard → Domains → Add Domain → enter your
   sending domain. Resend then shows the exact record values to publish. Always
   copy the values **from your own Resend dashboard** — the selector and keys
   below are per-account and rotate.

2. **SPF** — authorizes Resend's servers to send for your domain. Resend provides
   a TXT (and a matching MX for the bounce subdomain). Typical shape:

   | Type | Name (host)      | Value                                  |
   | ---- | ---------------- | -------------------------------------- |
   | TXT  | `send`           | `v=spf1 include:amazonses.com ~all`    |
   | MX   | `send`           | `feedback-smtp.<region>.amazonses.com` (priority 10) |

   If the root domain already has an SPF TXT record, **merge** the `include:`
   into the existing record — a domain must have exactly one SPF record.

3. **DKIM** — lets receivers verify the message was signed by your domain and not
   altered. Resend gives a CNAME (or TXT) with an account-specific selector:

   | Type  | Name (host)                 | Value                          |
   | ----- | --------------------------- | ------------------------------ |
   | CNAME | `resend._domainkey`         | `<selector>.dkim.amazonses.com` |

4. **DMARC** — tells receivers what to do with mail that fails SPF/DKIM and gives
   you reporting. Start in monitor mode, then tighten to `quarantine`/`reject`
   once SPF+DKIM are verified and aligned:

   | Type | Name (host) | Value                                             |
   | ---- | ----------- | ------------------------------------------------- |
   | TXT  | `_dmarc`    | `v=DMARC1; p=none; rua=mailto:dmarc@recoverflow.com` |

5. **Verify** — back in Resend → Domains, wait for all records to show
   **Verified** (DNS propagation is usually minutes, up to ~48h). Only then set
   `MESSAGING_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM` on the web **and**
   worker services and redeploy. Send a test (e.g. trigger a password reset) and
   confirm delivery + that the message passes SPF/DKIM/DMARC (Gmail: "Show
   original").

Until the domain is verified, keep `MESSAGING_PROVIDER=console` so no
unauthenticated mail is sent.

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

## Worker service (background processing)

The failed-payment recovery pipeline runs in a separate long-running service
(`apps/worker`) that claims `PENDING` `EventProcessing` rows and runs them through
the recovery engine (retry with exponential backoff; a dead-letter `DEAD` state
after `WORKER_MAX_ATTEMPTS`). It has no HTTP server.

1. In the same Railway project: New → GitHub Repo → select the same repo again to
   create a **second service**. Open it → Settings → set **Config File** to
   `/railway.worker.toml` (absolute path from the repo root).
2. Variables: set the same required vars as the web service —
   `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `APP_ENCRYPTION_KEY`,
   `INTERNAL_API_TOKEN`, `APP_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `MESSAGING_PROVIDER`
   (the worker calls `getEnv()` at boot, which validates all of them). When
   `MESSAGING_PROVIDER=resend`, also set `RESEND_API_KEY` and `EMAIL_FROM` — the
   worker sends recovery emails and its boot validation requires them. Optionally
   tune `WORKER_CONCURRENCY` (default 5), `WORKER_POLL_INTERVAL_MS`,
   `WORKER_MAX_ATTEMPTS`, `WORKER_BACKOFF_BASE_MS`, `WORKER_BACKOFF_MAX_MS`,
   `WORKER_SHUTDOWN_TIMEOUT_MS`.
3. **No healthcheck** (there is no HTTP port). The worker config sets an
   `ON_FAILURE` restart policy so a crash-loop surfaces.
4. **Migrations:** the worker does **not** run migrations — the web service's
   release phase owns `prisma migrate deploy`. Deploy web first (so the schema is
   current), then the worker. On redeploy the worker receives `SIGTERM`, stops
   claiming, drains in-flight events, and exits cleanly.

Verify: send a `payment.failed` webhook (Step 8), then watch the worker service's
logs — you should see structured lines carrying `paymentEventId` and `merchantId`
and the row transition to `DONE` (or `FAILED` → retried → `DEAD` on repeated
failure).

## Rollback

Railway keeps previous deployments. If a deploy is bad, open the service →
Deployments → select the last good one → Redeploy. Because migrations run in the
release phase, avoid destructive (column-dropping) migrations without a tested
backup; this product's migrations to date are additive (indexes, new columns).

## Continuous deployment

With the GitHub integration, every push to `main` that touches the watched paths
triggers a build → release (migrations) → start. Doc-only commits (`docs/**`,
`*.md`) are excluded by `watchPatterns` and won't redeploy.
