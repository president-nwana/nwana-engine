# ADR-0048 — Platform Admin “Preview as Tenant”

Date: 2026-10-01
Status: accepted
Supersedes: nothing. Extends ADR-0047 (role-based tenant navigation).

## Context

For investor/demo use, the platform admin must open any tenant (or one of
its business units) in exactly the tenant-facing portal UI — from Operating
Center → Organizations, with one click, no manual token handling. The
acceptance pitch: NWANA → Preview Portal shows its six modules; Demo
Running Org → Preview Portal shows only its three modules; the difference
is visually obvious in under 30 seconds.

Constraints from the owner:

- Preview renders exactly the same UI a licensed tenant user sees.
- Preview is read-only unless explicitly switched to admin mode.
- No tenant access token is manually created or copied.
- No other tenants, Organizations menu, owner controls, IDs, or NWANA
  admin navigation inside preview.
- One clear Exit Preview action back to the Operating Center.
- Existing tenant isolation unchanged.
- No synthetic revenue, users, or data.

## Decision

Stateless, HMAC-signed, short-lived preview tokens — a third credential
type beside `platform_admin` and `tenant_user`, with no database writes.

### Token

`base64url(payload).base64url(signature)`

- payload: `{ v: 1, tid: <tenant_id>, units: [<business_unit_id>…],
  exp: <unix seconds>, n: <random nonce> }`
- signature: HMAC-SHA-256 with the server-side `OPERATING_CENTER_KEY`.
- TTL: 15 minutes. Multi-use within TTL (the portal makes several API
  calls with it).

No `tenant_users` row is created: preview mints no users, no synthetic
data, nothing to revoke or clean up. Expiry is enforced on every request.

### Identity

`Identity` gains `{ kind: "preview", tenant_id, unit_ids, expires_at }`.

Resolution order in `resolveIdentity`: owner key (timing-safe, no DB) →
preview token (HMAC verify + tenant/unit re-validation against live D1) →
`tenant_users` hash lookup. A preview token never resolves to
`platform_admin` and is rejected on every `/api/operating-center/*` route
by the existing kind check.

### Portal API

`/api/portal/*` accepts `preview` exactly like `tenant_user`: same
`getPortalSession` / `getPortalUnit` code paths, tenant derived
server-side from the token, foreign/unassigned units read as 404. Two
hardening rules:

- Non-GET requests with a preview identity are rejected (403,
  “Preview sessions are read-only”). Today all portal routes are GET;
  the rule is structural.
- The owner key still cannot be used as a portal identity (403,
  unchanged).

“Admin mode” is the Operating Center itself: preview has no in-preview
privilege switch; the only mode change is Exit Preview → Organizations.

### Issuance (platform admin only)

- `POST /api/operating-center/tenants/:tenantId/preview` — all of the
  tenant’s business units (what a fully-licensed tenant user sees).
- `POST /api/operating-center/tenants/:tenantId/units/:unitId/preview` —
  exactly one unit (“Preview as client”).

Both require `platform_admin` (existing route gate). Responses carry the
token; the OC client opens `/portal#preview=<token>` (or
`/portal/unit/<id>#preview=<token>`) in a new tab. The token travels in
the URL fragment — never in query strings, never in server logs — and is
stripped from the address bar on load.

### Portal client

The portal page is unchanged for tenant users. In preview mode
(`#preview=` captured into `sessionStorage`, never `localStorage`):

- the access-key gate is skipped — no manual sign-in step;
- the header, unit picker, and unit screens render identically to the
  licensed-tenant view (same shell, same scripts, same API);
- exactly one addition: a slim preview banner —
  “Previewing {tenant_name} as a tenant user · read-only · [Exit preview]”;
- “Sign out” is replaced by “Exit preview” (one click → token cleared →
  back to Organizations);
- an expired/invalid preview token shows “Preview expired — open a new
  preview from the Operating Center” instead of the tenant key gate.

No Organizations menu, no other tenants, no IDs, no owner controls appear
inside preview. Closing the tab ends the preview (sessionStorage).

### OC entry points

- Tenant page (Organizations → tenant): “Preview Portal” button.
- Business-unit cards and the unit screen: “Preview as client” button.

### Alternatives considered

- **Ephemeral `tenant_users` rows**: would create synthetic user records
  and need revocation/cleanup; rejected per the no-synthetic-data rule.
- **Server-rendered proxy of the portal**: would duplicate the portal
  client and risk UI drift; rejected — the requirement is the *exact*
  tenant UI.
- **Long-lived preview tokens**: larger blast radius if leaked; rejected
  — 15 minutes covers a demo, and a new preview is one click.

## Consequences

- Investor demo: two clicks show two tenants’ licensed module sets with
  no architecture explanation needed.
- Tenant isolation unchanged: preview is tenant-scoped, server-derived,
  read-only, and time-boxed.
- Operating cost: $0 — no new services, no new tables, no new cron;
  HMAC verification is local CPU.

## Verification

- Unit/integration tests: token round-trip, tamper rejection, expiry,
  unit-subset validation, unknown-tenant rejection, issuance scoping,
  preview session scoping, cross-tenant 404s, non-GET rejection,
  owner-key-still-403, preview-never-platform_admin, OC buttons present,
  preview banner/exit markup present, tenant UI byte-identical otherwise.
- Live: NWANA preview shows six modules; Demo preview shows three;
  browser walk-through of gate skip, picker, unit screen, Exit Preview.
