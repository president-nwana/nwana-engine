# ADR-0050 — Canonical NW Groups model: centralized NWANA-owned network

Date: 2026-10-17
Status: Accepted by the owner 2026-10-17 (unified TZ, edition 7). Phase 0 (this canonical migration) implemented the same day.

## Context

An inspection on 2026-10-17 (workspace/research/canonical-model-inspection-2026-10-17.md) proved that the old decentralized NW Groups model was not a stray phrase but a connected product model embedded in MACHINE_PURPOSE.md (entity taxonomy "NW Group Individual, NW Groups, and RECOGNIZED Groups"; the chain Course -> Certification -> Professional License -> Instructor -> Group), in seed migrations 0008/0011, in the D1 registry schema (statuses developing/recognized, payment_account_state incl. own_account, recognized_date), in the hardcoded Operating Center groups screen, and across the public NW Groups site (RECOGNIZED path, the group's own payment account as the end state, a published promise that NWANA does not control funds a group raises itself, the Individual License as the mechanic by which a first licensed participant starts a group, and a $200/year group license after RECOGNIZED that exists only in published text).

The owner replaced that model on 2026-10-17 and approved a unified technical specification (TZ edition 7) implementing the replacement. Without a canonical migration, any future developer could restore the old architecture from the surviving artifacts.

## Decision

The canonical model is the one stated in MACHINE_PURPOSE.md, section "NW Groups canonical model (owner-approved 2026-10-17)":

1. NWANA builds and owns the network. Local people are hired to operate it. No group becomes independent, graduates out of NWANA, or operates its own payment account. RECOGNIZED as a maturity endpoint and own_account as a terminal financial state are abolished as operating mechanisms.
2. Territory is a top-level entity (CONTINENTAL root, then NATIONAL, STATE, COUNTY, CITY, LOCAL_COMMUNITY) and the primary object for funding, candidates, participants, organizations, facilities, and budgets. Every money record has a territory, with no exceptions.
3. An NW Group is NWANA's operating unit inside a territory, FORMING or ACTIVE. One default FORMING group is created in advance in every city territory by the owner's standing decision; additional groups only by NWANA decision. Multiple groups per territory are normal; "one city = one group" is not an architecture.
4. A Program is funded activity inside a territory: territory link mandatory, group link optional. Territory -> Program, Territory -> NW Group -> Program, and a Group without a Program are all valid.
5. Participation is the single Individual License (one product, no categories), portable across all NWANA groups for standard training; group-initiated extra events are paid separately. The license is not membership, grants no governance rights, never creates a group, and is distinct from the Athlete License. The 14 per-category Individual levels in RunSignup club 3335 collapse into the one license; the 14 Group ($0) levels cease to be a way to register or own a group; their history is preserved.
6. The 14 group categories survive only as informational taxonomy and a request channel (people may ask NWANA for a group of a desired kind in their territory).
7. Old-model records (including the seed products of migrations 0008/0011, the legacy registry rows, and the published-text history) are preserved in a read-only superseded archive for audit. Archive records do not participate in live group-creation rules, current-status calculation, or public output.
8. The Miami and Hallandale registry rows are owner-declared trial records ("made for trial, forget them", owner, 2026-10-17): they carry no continuity obligations and may be removed or recreated under the new model without a separate procedure. Their RunSignup platform facts in SYSTEM_STATE.md remain historical facts.
9. Umbrella groups and organization-connected groups are not part of the centralized core model. They may return only as a future external-affiliate category by a separate owner decision.

## Open decisions carried by the TZ (section 16), with interim rules

- Group Director economics (employment form, load, pay range): NOT decided. Interim rule: no vacancies are published; applications are accepted into the candidate pool only.
- Group activation order in Florida: NOT decided. Interim rule: activation follows live territory signals and designated funding.
- National Headquarters budget parameters (role composition, pay ranges): NOT decided. Interim rule: the HQ budget exists as a structure and a current expense category of the Fundraising Machine, without approved amounts until the parametric budget model is built.
- Donation payment rail: pending the owner's Zeffy bank-link and organization-signature actions; the Donations module is designed rail-neutral meanwhile.

## Consequences

- MACHINE_PURPOSE.md and OPERATING_PLAN.md now state the new model as the only operative one; SYSTEM_STATE.md records the change as a dated fact.
- Later TZ phases execute the remaining fates: D1 schema and seed retirement (Phase 1B), Operating Center groups screen rebuilt on the live registry (Phase 3), public promises and license texts rewritten (Phase 4 and the RunSignup level migration), RunSignup club 3335 levels collapsed (one Individual License; Group levels closed to new registrations).
- Any artifact that still teaches the old model after its phase is a defect against TZ acceptance criterion 1 (migration completeness), verified by re-inspection.
