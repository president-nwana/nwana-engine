# ADR-0046: Multi-tenant layer — tenants + business units (MVP)

Date: 2026-10-01
Status: Accepted / Implemented

## Context

NWANA Engine was built as a single-organization operating system for NWANA.
The product direction is a reusable multi-tenant sports operating platform:
ENGINE → TENANT / ORGANIZATION → BUSINESS UNIT → OBJECTS → MONEY → AUDIENCE → ACTIONS.
NWANA remains the first live tenant. The MVP must prove the layering without
breaking any existing NWANA production behavior (Revenue Engine v1, money
truth, Registry, Series processing, Google Ads, Operating Center).

## Decision

Add a canonical tenant/business-unit layer as **purely additive** schema and
code:

1. **New tables only** (migration 0054): `tenants`, `business_units`.
   No ALTER of any existing table. No backfill of legacy rows. Legacy NWANA
   tables stay legacy-scoped; the architectural boundary is explicit:
   tenant-aware reads go through `src/lib/tenants.ts`, which scopes every
   query by `tenant_id`.

2. **`business_units.unit_type` is an open vocabulary** (TEXT, no CHECK
   constraint, no closed TypeScript union). Future unit types — Events,
   Media, Membership, Clubs/Groups, Sponsorship, Fundraising, Education,
   Commerce, Professional League, custom — must not require a schema or
   code change. `KNOWN_UNIT_TYPES` in code is informational only.

3. **Money is never stored per business unit.** BU money summaries are
   derived at read time from canonical `money_events` via the revenue
   objects linked in `business_units.connected_assets` (JSON array of
   `revenue_objects.object_key`). This extends ADR-0044: money tables are
   the monetary truth; nothing duplicates them. Net stays NULL/UNKNOWN
   where the source provides no settlement truth — never zero-filled.

4. **No redundant `enabled_business_units` column on tenants.** The enabled
   units of a tenant are derived at read time from `business_units`
   (one source of truth, no dual bookkeeping).

5. **Tenant isolation is enforced in the service layer, not by convention.**
   `listBusinessUnits(db, tenantId)` has a mandatory tenant filter — there
   is no unscoped list. `getBusinessUnit(db, tenantId, unitId)` returns null
   when the unit belongs to another tenant, indistinguishable from
   not-found. The API mirrors this: cross-tenant reads are 404.

6. **Honest unknown states.** Units with no linked assets, money, audience,
   or integrations render UNKNOWN / NOT CONNECTED / NOT OPERATING. No
   synthetic revenue, athletes, transactions, or customers are ever seeded.
   The demo tenant (`demo-running-org`, status `demo`) is a
   configuration/schema proof with zero data.

7. **One reusable creation path.** `createTenant` → `createBusinessUnit` →
   connect objects/integrations → Engine operates on them. Exposed as
   owner-key-gated POST routes. NWANA-specific behavior stays possible via
   configuration (connected_assets/integrations JSON) or specialized
   processors where genuinely required — not via a parallel architecture.

8. **Operating Center** gains one section, Organizations:
   `/operating-center/organizations` → tenant list,
   `/operating-center/organizations/<tenant>` → tenant + unit cards,
   `/operating-center/organizations/<tenant>/<unit>` → the unit screen
   (identity, status, assets, money, audience, integrations, next actions,
   deep links into existing Engine functions). Existing sections are
   untouched; the menu gains one additive entry.

9. **Licensing readiness is a data boundary only**: `plan_license_status`,
   `enabled_modules`, `license_start/end`, `billing_model` (placeholder),
   `white_label`. No payment processor, no billing system in this phase.

## Consequences

- NWANA production behavior is unchanged: no existing table, route, or
  flow is modified (only additive menu entry + new routes).
- The demo tenant proves a second sport organization can be onboarded
  without sport-specific architecture.
- Migration path for legacy tables (if ever needed) is explicit and
  separate: add nullable `tenant_id` columns later; not done in this MVP
  to avoid production risk.
- Operating cost: $0 — D1 tables + Worker routes only, no new services.

## Out of scope (explicit)

Full professional league, marketplace build-out, inventory/fulfillment,
new challenges/races, redesign of existing NWANA screens, fake customers,
paid infrastructure, a second source of truth, moving NWANA assets into
new legal entities, cap tables/valuation/investor functionality.
