# NWANA — CURRENT OWNER DECISIONS AND PRODUCTION HANDOFF
**Updated:** 2026-11-01 (owner decisions and Muse reports through 2026-10-31 22:32 America/New_York)
**Status:** Current owner-approved target architecture; do not confuse decisions, reported production results, or pending implementation.

## Mandatory reading and conflict policy
Read this document before interpreting MACHINE_PURPOSE.md, OPERATING_PLAN.md, SYSTEM_STATE.md, AGENTS.md, and historical ADRs. Historical descriptions of the NW Groups D1 registry, advance FORMING groups, role instances, and D1 registration are **SUPERSEDED** by the explicit owner decision below. Do not present superseded design as the current mandate. Do not pretend that planned migration has already been deployed. Production truth requires direct live verification; Muse's operational report is attributed below.

## 1. Final NW Groups model — OWNER DECISION 2026-10-31
- **groups.nwaofna.org is a presentation-only geographic shell.** Preserve the geography (reported 35,609 territories and geographic group pages), navigation, and attractive public presentation. Reading public geography pages must use **zero D1 reads/writes**. Static reference data can render territory pages; no user database is required.
- **RunSignup/TicketSignup is the system of record for NW Groups registrations, licenses, addresses, digital cards, confirmations, receipts, payments, member communication, and mailing lists.** NWANA Membership Organization / Club **3335** is the membership destination. People select their license and enter their state, city, street/address directly in RunSignup; there is NO requirement to prefill city from an NWANA page.
- Button **Join / Register** on a geographic page goes to the verified RunSignup enrollment destination. Do not create a parallel NWANA persons/applications/group membership registry in D1.
- RunSignup administrator notification email for a new enrollment is the event trigger. Muse watches authorized email and notifies the president; if the city is not in the email, manually open the member's record in the RunSignup dashboard (no polling).
- At the first real participant from a new city, prepare a corresponding city-facing RunSignup group/club page for owner approval, using existing Miami NW Group **club 3338** as a reference. Do not pre-create tens of thousands of RunSignup groups, and do not automatically create a D1 group upon join. City group creation in RunSignup is **owner-controlled**, not a proven automation.
- Those who want to lead a group, instruct, collaborate, or propose an initiative contact NWANA by email. Do not create D1 forms/applications for this.
- **Remove ALL NW Groups background jobs, schedules, periodic polls, automatic scans, recounts, refreshes, and test runs.** No exceptions in the NW Groups subsystem. No synthetic production registrations, applications, groups, or cleanup cycles. Public counters are optional; remove them if they require a separate tallying system. Do not interfere with independent legitimate Engine functions.
- Muse has been tasked with dependency mapping and a transition proposal before changing production. **Implementation of this final model is PENDING**, not proven complete. Owner authorization needed before migration or production modification.

## 2. Reported D1 cleanup and incident — 2026-10-31, from Muse
Muse reported production cleanup completed:
- Removed 265,275 pre-created role instances; 32,333 pre-created groups; 1 test walk; 4 applications; 3 test people; 9 conversion outreach rows; 5 organization records; 6 Florida registry rows.
- Left **35,609 territories**, **25 role templates**, and **zero groups**. The temporary creation test inside the cleanup was also removed; do not repeat.
- Added three missing SQL indexes. Reported per-request rows-read changes: group query ~29,017 -> 1; county-list query ~3,266 -> 68.
- The bulk cleanup exceeded **D1 free daily write quota**; writes were reported blocked until next reset, estimated 2026-11-01 19:00 America/New_York / 2026-11-02 00:00 UTC. Never assume that quota recovery occurred without measurement. Both rows-read and rows-written limits must be budgeted before ANY mass operation; currently **no mass operations authorized**.
- Site reported HTTP 200; removed group URL 404; result PNG 200. These are Muse's reports, not independent verification by this document.
- Later zone analysis reported ~5,542 groups-site HTTP requests (20:00-21:40 local), predominantly crawlers; ~663 actual worker renders produced D1 reads. Full COUNT(*) against 35,609 territories was executed 10 times, costing ~356,090 rows read. This is the underlying architectural failure of dynamic rendering on a static geography, NOT evidence of thousands of people registering.
- Muse reported the old registry_summary full recount path (approx. 339k rows/run) had been removed in **production** October 31, even though GitHub still contained it. **GitHub main at dd41c18 was behind live production**, so do not infer deployed state from repo code alone.
- The next authorized check was read-only observation of quota/state; **no re-creation test, no test group/applications, no new artificial production records**.

## 3. Independent Engine functions that must not be destroyed
NWANA Engine has legitimate non-NW-Groups functions (Series 2026 finalized result ingestion/publication and result cards, winners, Meta distribution, revenue/accounting and other approved integrations where production-verified). Do not globally remove or rewrite them under the NW Groups simplification. The separate Operating Center platform-era cleanup is distinct and must not be conflated with the NW Groups scope.

## 4. No automatic background work
Owner decision 2026-10-29: Engine automatic cron schedules were removed in production; main wrangler.jsonc at dd41c18 has `triggers.crons=[]`. No reinstating cron without explicit owner approval. Owner insists **no event -> no processing**. For NW Groups, remove all schedules/automatic polls/recounts/scans/test runs, not merely 'unnecessary' ones.

## 5. Current working task and boundaries
Muse is to produce an exact existing dependency/change map; owner reviews before any implementation. Verify RunSignup club 3335 real settings (join destination, notifications), Miami club 3338 pattern, and only request precise necessary manual settings. Preserve existing registrations and sports production. **Do not initiate tests, writes, mass D1 mutations, deployments, or redesign while documentation is synchronized.**

## 6. Getting a new chat back into context
New chat: read THIS file first, then AGENTS.md, MACHINE_PURPOSE.md, OPERATING_PLAN.md, SYSTEM_STATE.md, and relevant ADRs, recognizing that older NW Groups sections are **historical/superseded** where incompatible. Check the live deployed state before recommendations about actual production. A new chat must never propose recreating pre-seeded groups, role instances, D1 enrollment, periodic counts or tests.

Source distinction: Owner decisions above are from the explicit conversation on 2026-10-31; exact production quantities and telemetry above are Muse-reported, pending independent live verification. This file is operational context, not a deployment confirmation.
