# RecoverFlow — Authentication & Security Audit (Phase 8, Module 7)

**Scope:** authentication, authorization, CSRF, cookies, public endpoints.
**Method:** source review of the auth subsystem + route handlers + Prisma schema,
cross-checked against existing integration/unit tests.
**Outcome:** No vulnerabilities requiring a code change were found. The system
applies defense-in-depth correctly. Two low-severity hardening enhancements are
deferred to Phase 9 (deploy/hardening), consistent with this module's "audit and
harden, do not redesign" mandate. Security invariants are now pinned by tests so
they cannot silently regress.

## Files reviewed

- `apps/web/lib/auth/session-core.ts` — token generation, hashing, expiry/renewal math
- `apps/web/lib/auth/session.ts` — session create / validate / renew / invalidate
- `apps/web/lib/auth/cookies.ts` — cookie attributes
- `apps/web/lib/auth/service.ts` — register / authenticate
- `apps/web/lib/auth/password.ts` — argon2id hashing + enumeration defense
- `apps/web/lib/auth/csrf.ts` — same-origin enforcement
- `apps/web/lib/auth/current.ts` — per-request session resolution
- `apps/web/lib/auth/validation.ts` — input schemas
- `apps/web/app/api/auth/{login,register,logout}/route.ts` — auth endpoints
- `apps/web/app/api/payment-update/[token]/route.ts` — public customer endpoint
- `apps/web/app/api/webhooks/razorpay/[webhookToken]/route.ts` — public webhook
- `apps/web/app/dashboard/{layout,page,cases,cases/[token],analytics}` — protected routes
- `packages/db/prisma/schema.prisma` — Session model

## Authentication — VERIFIED

- **Token generation:** `randomBytes(32)` → 256-bit CSPRNG token, base64url. Strong.
- **At-rest storage:** DB stores only SHA-256 of the token; the raw token lives
  solely in the cookie. A database leak cannot be replayed as live sessions.
  SHA-256 (not a KDF) is correct for a high-entropy random token.
- **Password hashing:** argon2id, OWASP parameters (19 MiB / t=2 / p=1), params
  encoded in the hash for future upgrade. `verifyPassword` fails closed on
  malformed hashes (login never 500s).
- **Session fixation:** prevented. Both login and register mint a _fresh_ token +
  session row after authentication; no pre-auth token is ever adopted.
- **Session expiration:** 30-day absolute expiry, enforced at validation (expired
  sessions are deleted and treated as absent).
- **Session renewal:** sliding renewal at half-life (15 days); extends expiry on a
  live session.
- **Session invalidation:** logout deletes the session row server-side (token dead
  even if the cookie persists). `invalidateUserSessions` exists for future
  bulk-revocation needs.

## Authorization — VERIFIED

- All four dashboard routes render through `app/dashboard/layout.tsx`, which calls
  `getCurrentSession()` and redirects unauthenticated users to `/login`. Each page
  additionally performs its own redirect (defense-in-depth).
- **Merchant isolation:** every dashboard query is scoped by `merchantId`. The case
  detail lookup uses `{ merchantId, token }` as its authorization boundary, so a
  valid token belonging to another merchant resolves to null → 404. Isolation is
  covered by dedicated integration tests in stats, cases, case-detail, and
  analytics.
- No cross-merchant data exposure path was found.

## CSRF — VERIFIED

- `assertSameOrigin(request)` is the first statement in every state-changing authed
  route (login, register, logout). It validates the `Origin` header against the
  app's own origin (scheme + host + port) and rejects null / foreign / malformed
  origins.
- Combined with `SameSite=Lax` cookies, this is the standard double-defense.
- The webhook route intentionally omits same-origin (webhooks are cross-origin;
  HMAC is the authentication). The payment-update route is intentionally public.
  No authenticated mutating route lacks the guard.

## Cookies — VERIFIED

| Attribute | Value           | Notes                                               |
| --------- | --------------- | --------------------------------------------------- |
| HttpOnly  | true            | JS cannot read the token (XSS cannot exfiltrate it) |
| SameSite  | lax             | CSRF mitigation at the cookie layer                 |
| Secure    | production only | correct — Secure on localhost HTTP would break dev  |
| Path      | /               | scoped to the whole app                             |
| Expires   | session expiry  | aligned with server-side expiry                     |

Logout clears with `maxAge: 0` and the same base attributes.

## Public endpoints — VERIFIED

- **Razorpay webhook** (`/api/webhooks/razorpay/[webhookToken]`): opaque token
  routes to a merchant _before_ body parse; per-merchant HMAC secret verifies the
  signature; account-id cross-check. Unknown token → 404, bad signature → 401.
  Idempotency/replay handling lands upstream (Step 0 / Phase 7).
- **Payment update** (`/api/payment-update/[token]`): public by design (customer
  follows a WhatsApp link). Every token failure returns 200 + a generic body — no
  status-code or message distinguishes invalid / expired / used. No information
  leakage. Single-use tokens limit replay.

## Findings

| ID  | Severity | Finding                                                                                                  | Disposition                                                                                                                                                                                                        |
| --- | -------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-1 | Low      | Session renewal reuses the same token (no rotation). A stolen token stays valid up to its 30-day window. | Defer to Phase 9. Current model (hashed-at-rest, HttpOnly, SameSite, server-side invalidation) is industry-standard; rotation is a hardening enhancement, not a fix, and is out of scope for an audit-only module. |
| F-2 | Low      | The public payment-update endpoint is unauthenticated and unthrottled.                                   | Defer to Phase 9 (already tracked in the route). Mitigated today by generic responses + single-use tokens. Add rate-limiting at deploy.                                                                            |
| N-1 | Note     | `invalidateUserSessions` has no caller (no password-change flow exists yet).                             | Not a gap. When a password-change / credential-reset flow is added, it must call `invalidateUserSessions` to revoke existing sessions.                                                                             |

## Recommendations (Phase 9)

1. Rotate the session token on renewal (issue a new token, invalidate the old) to
   bound the lifetime of a stolen token.
2. Rate-limit the public payment-update endpoint.
3. Encrypt `razorpayWebhookSecret` at rest.
4. When a password-change flow is introduced, wire it to `invalidateUserSessions`.

## Implemented fixes

None required. Per the audit-only mandate, no architectural change was made. The
hardening value delivered by this module is the set of invariant tests below, which
lock in the verified security properties.

## Tests added

- `apps/web/lib/auth/cookies.config.test.ts` — pins HttpOnly / SameSite=lax / Path=/
  on the session-cookie attribute set, and that Secure is production-gated.
- `apps/web/lib/auth/session-lifecycle.test.ts` — pins expiry detection, renewal at
  half-life, and the expiry-window boundary, against the pure session-core math.

(Same-origin enforcement and input validation already carry unit coverage in
`http.test.ts`; merchant isolation and session DB behavior are covered by the
existing integration suites.)
