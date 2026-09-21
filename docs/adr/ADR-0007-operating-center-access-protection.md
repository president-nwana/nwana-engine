# ADR-0007: Operating Center Access Protection

Date: 2026-09-21

## Context

`OPERATING_PLAN.md` step 3 and `SYSTEM_STATE.md` forbid enabling or deploying the
`/operating-center` interface until owner and Board access protection is configured.
The foundation (initiatives, Board submissions, work items, six D1 tables) was built
locally on 2026-09-19 with the routes hard-disabled behind `OPERATING_CENTER_ENABLED`.

The owner is a non-technical solo operator. Full user accounts with passwords,
OAuth, or Cloudflare Access would add moving parts and cost. The threat model is
casual public access to a private operations page, not a targeted attack.

## Decision

- All operating-center JSON API routes require a single shared owner key.
- The key is presented as an `Authorization: Bearer <key>` header or as a `?key=`
  query parameter. The query form exists so the owner can bookmark direct links.
- The key itself is a Cloudflare Worker secret (`OPERATING_CENTER_KEY`), never
  committed to the repository.
- Comparison uses a constant-time byte comparison to avoid leaking the key through
  timing differences.
- The public HTML shell at `/operating-center` is served without the key, but it
  renders only a key-entry gate. Every data call and every form submission sends
  the key from browser local storage; a 401 response returns the page to the gate.
- `OPERATING_CENTER_ENABLED=true` is now set in `wrangler.jsonc`, so the interface
  is live on every deployment. If the secret is missing, every API call returns
  401, which fails closed.

## Consequences

- The owner enters the key once per browser; no accounts, no login plumbing.
- Board members use the same key until a per-member model is justified.
- Revoking access means rotating one secret with `wrangler secret put`.
- The 401 boundary is explicit: no silent data exposure, no anonymous writes.
