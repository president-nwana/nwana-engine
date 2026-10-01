# ADR-0047: Role-based tenant navigation — platform admin vs tenant user

Date: 2026-10-01
Status: Accepted / Implemented (pending deploy)

## Context

ADR-0046 added the multi-tenant layer (tenants → business units) with
cross-tenant API isolation. But it left navigation flat: anyone with the
Operating Center key sees the Organizations directory and every tenant.
The product direction is a reusable sports operating platform, so two
audiences need two different doors:

- **Platform admins** (NWANA operations): full Operating Center,
  Organizations directory, tenant switching.
- **Tenant users** (e.g. a running club's staff): land directly in their
  business unit(s), never see the Organizations directory, other tenants,
  or internal terms like tenant IDs.

## Decision

Two credential kinds, **no parallel data system**:

1. **`platform_admin`** — the existing `OPERATING_CENTER_KEY`, resolved
   in memory (timing-safe compare, no DB lookup). Keeps the entire
   Operating Center unchanged.

2. **`tenant_user`** — an opaque access token, bound to exactly one
   tenant plus an explicit allowlist of business-unit IDs:
   - Migration 0055 adds `tenant_users(user_id, tenant_id, display_name,
     role, unit_ids JSON, token_hash, status, note)`. Additive only.
   - Only the SHA-256 `token_hash` is stored. The plaintext token is
     returned once, at creation, and never logged or persisted.
   - `unit_ids` empty = no access. Every assigned unit is validated to
     belong to the token's tenant at creation.
   - Revoked or unknown tokens resolve to null.

Routing (`src/index.ts`):

- `/api/operating-center/*` requires `platform_admin` (401 otherwise).
- `/api/portal/*` requires `tenant_user` (403 otherwise — including for
  the owner key, so the two identities cannot impersonate each other).
- Identity is resolved once per request. The portal tenant always comes
  from the token, **never from the URL**.

Tenant portal (`src/oc-portal.ts`):

- `/portal` — access-key gate on a separate storage key
  (`nwana_portal_key`); 1 allowed unit → client-side redirect straight
  into it; several → picker of allowed units only; none → honest empty
  state.
- `/portal/unit/:unitId` — server checks token tenant + allowlist.
  A foreign or unassigned unit reads as **404**, indistinguishable from
  not-found.
- No Operating Center menu, no Organizations directory, no tenant IDs or
  user IDs in portal UI or portal API responses.
- Admin-only Engine deep links are excluded from the portal unit screen
  (shared renderer `src/oc-unit-body.ts` with portal options).

Platform-admin user management (existing owner key):

- `GET/POST /api/operating-center/tenants/:tenantId/users`,
  `POST .../users/:userId/revoke`. Plaintext token returned once on
  create.

## Consequences

- Tenant users cannot reach any admin surface by construction: the gate
  is on the request identity, not on hiding links.
- Cross-tenant access is impossible in the portal path: the tenant is
  server-derived from the token, so there is no tenant parameter to
  tamper with.
- Existing NWANA production behavior is unchanged: Organizations
  screens render byte-identical shells; the unit renderer was extracted
  verbatim with admin options preserving tenant IDs, back link, and
  Engine-function deep links (verified by `test/tenant-access.spec.ts`
  and the full suite: 800/800).
- No fake users/customers/money: verification users are neutral access
  records on existing configuration-only units, revoked after testing.

## Security notes

- Tokens are 256-bit, URL-safe; hashes are SHA-256 via
  `crypto.subtle.digest`.
- The owner key short-circuits before any DB access (proven by test).
- Portal responses deliberately omit `tenant_id`, `user_id`, and
  `token_hash`.
- White-label tenants can hide the "Powered by NWANA Engine" line; the
  portal carries no NWANA-organization branding otherwise.
