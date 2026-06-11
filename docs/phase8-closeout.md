# Phase 8 Closeout — Merchant Dashboard

**Status:** complete. Main green, 146 unit + 47 integration tests passing,
production build clean.
**Scope of Phase 8:** turn the working recovery backend (Phases 1–7) into a
usable, multi-tenant product with a merchant-facing dashboard, plus a security
audit and a performance pass.

## What was built

Phase 8 added per-merchant webhook attribution and a complete merchant dashboard
on top of the existing recovery engine, then audited and hardened the result.

### Step 0 — Per-merchant webhook attribution

Opaque per-merchant webhook tokens route deliveries to the right merchant before
body parse; each merchant has its own Razorpay webhook secret (HMAC) and account-id
cross-check. `merchantId` flows through every downstream table.

### Dashboard modules

| Module | Delivered                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| 1–2    | Dashboard overview: `getDashboardStats` (recovery rate, recovered revenue, case/failure counts) + overview page |
| 3      | Cases list: keyset (cursor) pagination, status filter, merchant-scoped                                          |
| 4      | Case detail + chronological timeline; `{merchantId, token}` as the authorization boundary                       |
| 5      | Analytics: revenue & case trends (gap-filled daily), failure-category breakdown, open-vs-recovered — Recharts   |
| 6      | Shared layout shell: sidebar, responsive mobile nav, active-route highlighting, single auth gate                |
| 7      | Authentication & security audit (`docs/auth-audit.md`)                                                          |
| 8      | Performance & scalability pass (`docs/performance-review.md`)                                                   |
| 9      | Final QA, testing review, this closeout                                                                         |

## Security review summary

Full detail in `docs/auth-audit.md`. The audit found **no vulnerabilities requiring
a code change**. Verified: 256-bit CSPRNG session tokens hashed at rest (SHA-256),
argon2id passwords (OWASP params) with email-enumeration timing defense, session
fixation prevented (fresh token post-auth), same-origin CSRF on every state-changing
authed route, correct cookie flags (HttpOnly / SameSite=lax / Secure in prod / Path),
generic-failure public endpoints, and merchant isolation across all dashboard
queries. Security invariants are pinned by tests so they cannot silently regress.

## Performance review summary

Full detail in `docs/performance-review.md`. Three composite indexes were added to
`RecoveryCase` for 100k+ scale: `(merchantId, createdAt, id)` (cases list + keyset
pagination), `(merchantId, status, createdAt)` (status-filtered list), and
`(merchantId, recoveredAt)` (analytics revenue trend). A query audit confirmed no
N+1, minimal selects, and preserved cursor pagination across all four dashboard
services. The Turbo typecheck false-green was root-caused and fixed (`cache:false`).

## End-to-end journey (verified via existing integration coverage)

The complete merchant journey is covered in aggregate by the 10 integration suites;
no browser automation is used. Each seam is proven:

1. **Register → session** — `auth/service.integration.test.ts` (merchant + owner + session created atomically).
2. **Webhook received → PaymentEvent persisted** — `razorpay/razorpay-webhook.integration.test.ts` (valid/fresh persists; bad signature writes nothing; duplicate deduped; expired rejected).
3. **PaymentEvent → RecoveryCase (OPEN) + Attempt #1** — `recovery/recovery-engine.integration.test.ts` (classified case + attempt; duplicate delivery creates only one of each; reprocessing idempotent).
4. **Recovery message sent** — `messaging/message-flow.integration.test.ts` and the payment-update suite (exactly one PAYMENT_RECOVERED SENT message on completion).
5. **Payment-update token → customer recovery → case RECOVERED** — `payment-update/payment-update.integration.test.ts` (validate returns display-only fields; submit marks RECOVERED with amount + timestamp; token single-use; expired rejected; no double-recover).
6. **Dashboard statistics updated** — `dashboard/stats.integration.test.ts` + `dashboard/analytics.integration.test.ts` (recovered cases and revenue aggregate correctly, merchant-scoped).

## Coverage statement

All 13 audited areas (authentication, onboarding, webhooks, idempotency, recovery
engine, messaging, payment-update, overview, cases list, case detail, analytics,
navigation, authorization) have integration and/or meaningful unit coverage. No
meaningful gap was found; no tests were added in Module 9 (avoiding inflation).

## Technical debt — categorized

### Must fix before production

No correctness or security **defects** block production. The items below are deploy
prerequisites, not bugs:

- Run the Module 8 indexes with `CREATE INDEX CONCURRENTLY` when applying to a
  populated production table (the dev migration uses plain `CREATE INDEX`).
- Production secrets/env management and the Phase 9 deploy pipeline (AWS) must exist
  before launch.
- Billing (Stripe) is a Phase 9 product prerequisite for go-to-market, not a defect.

### Phase 9 (hardening + launch)

- Session token rotation on renewal (audit F-1).
- Rate-limit the public payment-update endpoint (audit F-2).
- Encrypt `razorpayWebhookSecret` at rest.
- Merchant settings screen (surface webhook token/secret; currently psql-only).
- Wire any future password-change flow to `invalidateUserSessions` (audit N-1).
- Drop the now-redundant `(merchantId, status)` index (covered by the new 3-col index).

### Future scaling

- `IdempotencyRecord` uniqueness is global `(provider, eventId)`, not per-merchant;
  revisit if providers can collide event IDs across merchants.
- Cases-list "Load more" is server-rendered page-replace, not append; move to
  append/infinite-scroll if UX calls for it.
- `MessageLog` / `PaymentEvent` will need their own `(merchantId, createdAt)`-style
  indexes when message-history / event-audit views are built.
- Analytics on-the-fly `date_trunc` aggregation is fine for 30-day windows; consider
  a materialized daily rollup if windows or cardinality grow.

## Remaining risks

Low. The product is well-tested and audited. The principal residual risks are
operational (no production deploy/billing yet) rather than defects in the built
system. The biggest non-technical risk is unchanged from the project's start:
**limited merchant validation** — the product is built ahead of confirmed demand.

## Recommended next phase

**Phase 9 — billing + deploy + launch hardening:** Stripe billing, AWS deployment,
and the hardening items above (token rotation, rate-limiting, secret encryption,
merchant settings). Before or alongside Phase 9, ~20–30 merchant-validation
conversations are worth more than additional build — there is now a genuinely
demoable product to put in front of them.
