# ADR-0049 — Secure first-user bootstrap + admin user management

Date: 2026-10-02
Status: Accepted, implemented, deployed.

## Context

The unified email/password login (commit cc6c2f1) left two gaps:

1. No way to create the first login user without curl + manual owner-key handling.
2. The owner key appeared in normal UX (key-entry gates, localStorage fallback),
   violating the owner boundary and the "no owner-key gate in normal UX" rule.

## Decision

### One-time bootstrap via single-use grants

- `GET /api/auth/bootstrap-status` → `{ available }`, server-side.
- `/login` shows the bootstrap section only when available.
- The owner key is NEVER typed into a browser and never appears in URLs, HTML,
  logs, browser storage, or client-side JavaScript.
- Instead, an authorized internal process mints a single-use, 30-minute grant
  via `POST /api/auth/bootstrap/begin` (owner-key gated, internal use only).
  Only the grant's SHA-256 hash is stored (`bootstrap_grants`, migration 0059);
  the plaintext token is returned once to the minter.
- The person doing setup enters email + password + display name + the setup
  code in the /login bootstrap form. `POST /api/auth/bootstrap` consumes the
  grant (single-use, expiry-checked) and creates the first `platform_admin`.
- After creation, bootstrap closes permanently: `bootstrapClosed()` is
  re-checked on every attempt, including direct endpoint calls. A second
  bootstrap is rejected even with a valid grant.
- Passwords are hashed server-side (PBKDF2-HMAC-SHA-256, 210k iterations);
  never displayed or logged.

### Admin user management UI

- `GET /admin/users` — list, create, revoke/reactivate, set-password.
  Session-only; redirects to /login without a session.
- `GET/POST /api/admin/users`, `POST /api/admin/users/:id/{revoke,reactivate,password}`,
  `GET /api/admin/tenants` — all require `platform_admin` (session or owner key).
- Revoke refuses to remove the last active platform_admin.
- No curl/API command is required for normal user administration.

### No owner-key gate in normal UX

- All `/operating-center/*`, `/admin/*` pages: session-only client auth.
  No key-entry form; missing/expired session → redirect to `/login`;
  API 401 → clear session → redirect to `/login`.
- The owner key remains valid server-side for the OC API gate (emergency
  recovery) and for minting bootstrap grants (internal). No UI prompts for it.
- The tenant portal keeps its access-key gate (legitimate tenant auth) and
  now also accepts unified-login session tokens.

### Session authorization on OC APIs

`/api/operating-center/*` accepts: owner key, `platform_admin` session, and
NWANA tenant sessions (`tenant_owner`, `tenant_admin`, `business_unit_user`).
`demo_user` sessions are read-only (403 on non-GET) and portal-routed.
Other-tenant sessions are portal-only.

## Consequences

- First admin must be created via the grant flow before any login user exists.
- Recovery (all admins locked out) uses the owner key via internal tooling,
  not a browser form.
- Deployment note (2026-10-02): the Cloudflare script-upload API requires a
  metadata part; minimal metadata (no bindings) preserved secrets but dropped
  the D1 + plain_text bindings (worker 1101). Re-upload with explicit d1 +
  plain_text bindings restored all 17 bindings; secrets untouched. Future
  deploys must include the d1 + plain_text bindings in metadata.
