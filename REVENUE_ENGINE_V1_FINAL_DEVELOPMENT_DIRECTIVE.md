# NWANA Revenue Engine v1 — Final Development Directive

> Provenance (not part of the directive): issued by Albert on 2026-09-29 as a chat message
> ("Muse Execution Header — Revenue Engine v1") with the attached document `muse.docx`.
> Restored verbatim on 2026-09-30 from the original message and file after the text was
> lost from working context during compaction. This file is the current execution contract
> for Revenue Engine v1. Do not reinterpret; do not convert into an ADR.

---

# Muse Execution Header — Revenue Engine v1

Treat the following document as an **execution directive**, not as a design brief.

Your first objective is strictly:

**RunSignup money truth + one repeatable donation funnel end-to-end.**

Before changing anything:

- inspect the existing repository and current production state;
- identify what already exists;
- reuse existing architecture and integrations;
- identify the exact missing pieces preventing the first production revenue loop.

Do not expand scope.

Do not create:

- new dashboards;
- new architecture layers;
- new abstractions;
- new race/challenge infrastructure;
- parallel sources of truth;
- speculative integrations;
- replacement systems for capabilities already provided by RunSignup/TicketSignup.

Do not assume any capability is available.

Verify production truth first.

If an API, mutation, transaction feed, permission or integration is unavailable, record the exact blocker and required owner/external action.

Do not simulate execution.

Do not treat proposals, desired states, ADRs, test fixtures or mock transactions as completed revenue functionality.

Implement only what is necessary to achieve:

**acquisition source → real donor → real transaction → verified monetary event → Engine ingestion → attribution state → next automated revenue action**

Then prove that the same path processes subsequent real transactions without developer intervention.

Until that is true, Revenue Engine v1 is not complete.

---

**NWANA Revenue Engine v1**
**Objective**
Make revenue generation the next primary development priority of NWANA Engine.
The goal is to close the existing loop:
**TRAFFIC → CONVERSION → TRANSACTION → ATTRIBUTION → FOLLOW-UP → MORE REVENUE**
Do not build another dashboard, new architecture layer, challenge, race concept, or reporting surface unless required to close this loop.
Production truth and real transactions take priority over documentation and theoretical capability.
The first production objective is deliberately narrow:
**RunSignup money truth + one repeatable donation funnel end-to-end.**
Academy and participant revenue funnels come after this path works repeatedly in production without developer intervention.

**Phase 1 — Money Ingestion**
Connect real monetary transactions and monetary events to NWANA Engine.
Required normalized revenue events:
- donation_received
- registration_paid
- license_purchased
- license_renewed
- course_purchased
- fundraiser_created
- fundraiser_donation_received
- transaction_refunded
- transaction_partially_refunded
- transaction_reversed
- transaction_chargeback
Where a source distinguishes reversal and chargeback, preserve the source meaning rather than collapsing them into one event.
For every monetary event capture, where available:
- source system;
- source object;
- source transaction ID;
- source event ID;
- event type;
- event timestamp;
- transaction timestamp;
- customer/member/participant reference;
- revenue type;
- originating NWANA asset;
- currency;
- gross amount;
- fees;
- refund amount;
- net amount;
- GA4 attribution;
- acquisition channel;
- campaign/source/medium.
**Transaction Identity**
Canonical transaction identity:
source_system + source_transaction_id
This identifies the source transaction.
It must not be used as the sole idempotency key for all lifecycle events related to that transaction.
**Revenue Event Idempotency**
Each ingested revenue event must have its own idempotency identity.
Preferred key:
source_system + source_event_id
Where the source provides no unique event ID, use a deterministic key derived from:
source_system + source_transaction_id + event_type + source_event_reference
If source_event_reference is unavailable, derive the most stable deterministic equivalent available from the source payload.
Repeated syncs, webhook deliveries, retries and polling cycles must never duplicate the same monetary event.
A payment followed by a refund, partial refund, reversal or chargeback must be represented as separate ledger events attached to the same transaction identity.
**Monetary Truth**
Revenue aggregation must reflect the full transaction lifecycle.
Example:
registration_paid = +$100
followed by:
transaction_partially_refunded = -$40
must result in:
net recognized amount = $60
subject to the accounting fields actually available from the source.
The Engine must not continue reporting the original gross revenue as current net revenue after verified refunds, reversals or chargebacks.
**Amount Completeness**
Missing fee or net breakdown must never block ingestion of an otherwise verified monetary event.
Supported states must allow:
gross_amount = VERIFIED
fees = UNKNOWN
net_amount = UNKNOWN
When the source later provides additional financial detail, the Engine may enrich the transaction record while preserving event history.
**Attribution**
A verified monetary transaction must never be rejected because marketing attribution is unavailable.
Supported attribution states must include:
- ATTRIBUTION_KNOWN
- ATTRIBUTION_PARTIAL
- ATTRIBUTION_UNKNOWN
Example:
$95 received
source: Academy
transaction: VERIFIED
acquisition attribution: ATTRIBUTION_UNKNOWN
Revenue truth takes priority over marketing attribution completeness.
**Source Priority**
Priority source systems:
- RunSignup / TicketSignup
- Moodle / Academy payment layer
- existing NWANA payment and fundraising sources
Do not create synthetic revenue.
If a source cannot currently be read automatically, explicitly return:
AVAILABLE = FALSE
plus:
- exact blocker;
- source limitation;
- owner action if applicable;
- external dependency if applicable;
- verification condition for resolution.

**Phase 2 — Executable Revenue Inventory**
Create one canonical inventory of every NWANA revenue-producing object.
Required object types:
- DONATION
- FUNDRAISER
- RACE_REGISTRATION
- ACADEMY_COURSE
- LICENSE
- NW_GROUP
- SPONSORSHIP
- PARTNERSHIP
For every object record:
- canonical object ID;
- name;
- source platform;
- source object ID;
- purchase/donation URL;
- price or donation structure;
- active status;
- monetary capabilities;
- transaction source;
- conversion event;
- conversion tracking status;
- automation capabilities;
- acquisition eligibility;
- next revenue action;
- action status;
- transaction count;
- gross revenue;
- refunds/reversals;
- net revenue where available;
- revenue last 7 / 30 / 90 days;
- attributable acquisition source when known;
- revenue_system.
**Revenue System Separation**
Supported revenue_system values must include at minimum:
- REVENUE_ENGINE
- SPONSORSHIP_ENGINE
DONATION, FUNDRAISER, RACE_REGISTRATION, ACADEMY_COURSE, LICENSE and eligible NW_GROUP revenue objects belong to:
revenue_system = REVENUE_ENGINE
SPONSORSHIP and PARTNERSHIP objects belong to:
revenue_system = SPONSORSHIP_ENGINE
They remain in the canonical Revenue Inventory because NWANA requires one complete map of organizational revenue.
Revenue Engine automation must not automatically apply mass acquisition, mass follow-up or passive-funnel rules to objects assigned to SPONSORSHIP_ENGINE.
The Revenue Inventory must drive actions.
It must not become a passive catalog.
Every inventory object must answer:
**What is the next revenue-relevant action for this object?**

**Phase 3 — RunSignup Revenue Capability Audit**
Before sending new acquisition traffic into RunSignup, establish the production truth of every relevant RunSignup/TicketSignup object.
Inspect every live NWANA RunSignup/TicketSignup object.
Determine whether each object supports and currently uses:
- donations;
- fundraiser creation;
- participant fundraising;
- fundraising emails;
- automated registration emails;
- incomplete-registration recovery;
- donation during registration;
- membership/license renewal;
- refund/reversal visibility;
- transaction reads;
- payment status reads;
- available API control;
- available webhook/event delivery;
- other existing revenue capabilities.
For every capability classify:
- ACTIVE
- AVAILABLE_NOT_CONFIGURED
- CAN_AUTO_CONFIGURE
- OWNER_CONFIGURATION_REQUIRED
- EXTERNAL_BLOCKER
- UNAVAILABLE
For each classification record:
- production evidence;
- source object;
- API/documentation basis where relevant;
- current configuration state;
- required action;
- verification method.
**API-First Rule**
If API control exists, connect it to Engine.
If the capability can be safely auto-configured through an existing supported interface, classify:
CAN_AUTO_CONFIGURE
and execute through Engine only within the approved scope.
If RunSignup requires manual UI configuration, generate one precise owner action.
**Owner Action Rule**
Every owner action must:
- describe one finite configuration task;
- identify the exact object affected;
- include the exact destination or interface location when known;
- explain exactly what must be changed;
- define how Engine will verify completion;
- automatically transition to RESOLVED after verification;
- disappear from active owner actions after resolution.
Do not generate vague permanent actions such as:
Configure fundraising
Generate precise actions such as:
Series 2026 → RunSignup → Donations/Fundraising → enable fundraiser creation during registration
After configuration:
Engine verification → capability ACTIVE → action RESOLVED
The resolved action must not continue to appear as required work.
**Audit Completion Gate**
Phase 4 must not treat a RunSignup donation destination as revenue-ready until the Engine has established:
- the exact donation mechanism;
- the exact live object;
- the public destination;
- the transaction read path;
- the refund/reversal visibility available from the source;
- the current configuration state;
- the conversion tracking state;
- any owner or external blockers.
The purpose of this phase is to make the existing monetary infrastructure **revenue-ready before acquisition traffic is increased**.

**Phase 4 — Donation Acquisition Loop**
Implement the first complete automated revenue funnel:
**Google Ad Grant → verified NWANA fundraising destination → donation → RunSignup monetary event → GA4 attribution state → NWANA Engine → next revenue action**
Use the existing generic rule:
confirmed fundraising purpose + confirmed public donation destination → RAISE_DONATIONS → ACQUIRE_DONORS_VIA_SEARCH
The first v1 acquisition scope is deliberately narrow:
**verified fundraising object → verified donation destination → donation acquisition campaign**
Do not expand initial Google Ads mutation scope to Academy, registrations, licenses or other revenue types until the donation path works repeatedly in production.
**Google Ads Execution Guardrail**
Google Ads mutation capability must not be assumed.
The Engine must first verify the actual production execution state.
If current production state is equivalent to:
execution_allowed = false
or Google Ads remains read/proposal/explorer-only, the Engine must classify the capability honestly.
Supported states should include:
- READ_ONLY
- PROPOSAL_ONLY
- EXECUTION_BLOCKED
- EXECUTION_ALLOWED
If execution is blocked, record:
- exact blocker;
- required owner action;
- required external action;
- permission or credential requirement;
- policy or platform limitation if applicable;
- verification condition for unlocking execution.
The Engine must never simulate a successful mutation.
A proposal, desired state or generated campaign plan must remain explicitly distinct from an executed production mutation.
**Donation Loop Requirements**
Once execution is actually allowed, the Engine must:
- verify the fundraising object;
- verify the donation destination;
- verify conversion tracking;
- create or maintain eligible campaign state;
- ingest Ads performance;
- ingest actual donation monetary events;
- ingest refunds/reversals affecting those donations;
- connect acquisition data to transactions when attribution exists;
- preserve ATTRIBUTION_UNKNOWN when it does not;
- calculate conversion performance;
- calculate gross and net revenue where available;
- identify campaigns/search terms that produce verified revenue;
- identify activity producing no verified revenue;
- generate the next executable optimization action.
The primary metric is no longer clicks.
The primary outcome is:
**verified revenue generated.**
**First Production Milestone**
The first required production milestone is:
**RunSignup money truth + one donation funnel end-to-end.**
That means:
acquisition source
→ visitor
→ donation destination
→ real donation
→ verified monetary event
→ ledger ingestion
→ attribution state
→ next automated revenue action
This milestone must work repeatedly before development expands into the later revenue funnels.

**Phase 5 — Three Revenue Funnels**
Phase 5 begins only after the first RunSignup donation path has demonstrated repeatable production operation.
Do not build all funnels simultaneously.
Develop them sequentially from production evidence.
**A. Donation Funnel**
Google Ad Grant / SEO / social / direct traffic
→ donation destination
→ transaction
→ attribution state
→ automated donor follow-up
This is the first production funnel and must be proven before expansion.
**B. Academy Funnel**
After the donation path is operational:
Free Nordic Walking course
→ Beginner Instructor Certification
→ Level 1
→ Level 2
→ Level 3
→ advanced Coach / Judge / Technical Official / Race Director products
Track where technically possible:
- free-course entry;
- paid conversion;
- course progression;
- purchases;
- refunds;
- gross revenue;
- net revenue where available;
- customer lifetime value;
- attribution state.
Moodle / Academy payment integrations must be treated according to their actual technical maturity.
Do not assume transaction access or automation capability until verified.
If access is unavailable:
AVAILABLE = FALSE
with the exact blocker.
**C. Participant Funnel**
After the donation path is operational:
Competition / Challenge
→ participant
→ fundraising opportunity
→ Athlete License
→ future competition
→ renewal
→ Academy
Use existing platform automation wherever possible before building custom functionality.
Track where available:
- participant;
- registration revenue;
- fundraiser creation;
- fundraiser revenue;
- license purchase;
- license renewal;
- subsequent registrations;
- Academy conversion.
Membership and license sources must also be treated according to verified production capability rather than assumed integration maturity.

**Phase 6 — Fundraiser Activation**
Make participant fundraising a standard revenue capability around eligible Series and Challenge objects.
Target state:
participant registers
→ fundraiser opportunity
→ fundraiser created
→ participant receives fundraising communication
→ participant shares fundraising page
→ donation received
→ monetary event ingested by Engine
Measure:
- eligible participants;
- fundraiser creation rate;
- active fundraisers;
- donations per fundraiser;
- gross fundraiser revenue;
- refunds/reversals;
- net fundraiser revenue where available.
Where RunSignup supports the capability but requires one-time configuration, create a finite owner action.
Where RunSignup exposes API control, connect it to Engine within the approved scope.
The purpose is to convert existing participation into distributed fundraising without requiring NWANA to manually recruit every donor.

**Separation of Revenue Systems**
Maintain two distinct operating systems over one shared Revenue Inventory.
**Revenue Engine**
Mass, repeatable, automated or semi-automated revenue:
- donations;
- registrations;
- Academy;
- licenses;
- memberships;
- participant fundraising.
**Sponsorship Engine**
High-value human-led transactions:
- Founding Partners;
- sponsors;
- strategic partnerships;
- seller/intermediary pipeline;
- negotiation;
- contracts.
Both systems feed the common Revenue Inventory.
Revenue Engine must not automatically apply mass-funnel behavior to Sponsorship Engine objects.
Sponsorship and Partnership objects remain visible in the same overall money surface because organizational revenue truth must remain unified.

**Development Priority**
The current development sequence is:
**Revenue Engine v1**
→ **prove one repeatable production money path**
→ **optimize that path**
→ **expand to additional revenue funnels**
→ **scale Series / Challenges infrastructure**
Existing competitions continue operating because they generate:
- participants;
- traffic;
- results;
- audiences;
- fundraising opportunities;
- real production events.
Development of new 2027 Series infrastructure, new challenges and nonessential Operating Center expansion is deferred unless directly required to close the revenue loop.

**Operating Rule**
Every development item must answer:
**How does this help NWANA receive, verify, attribute, recover, repeat, protect, or increase revenue?**
If it does not materially help close the revenue loop, defer it.
Production money truth has priority over:
- dashboard expansion;
- ADR production;
- architecture for its own sake;
- new abstractions;
- new reporting surfaces;
- speculative integrations;
- theoretical capability.
Existing platform capability must be used before duplicating it with custom code.

**Definition of Done for Revenue Engine v1**
Revenue Engine v1 is complete only when production has demonstrated at least one real-money path end-to-end and the same path can process subsequent real transactions without developer intervention.
The demonstrated path must include:
**acquisition source → visitor/customer → transaction → verified monetary event → verified amount received → attribution state → next automated revenue action**
The production path must also correctly handle subsequent lifecycle events when they occur, including:
- refunds;
- partial refunds;
- reversals;
- chargebacks;
where supported by the source.
The first successful transaction alone is insufficient.
The same production path must be repeatable for later transactions without:
- code changes;
- manual database edits;
- developer-operated reconciliation;
- duplicate revenue creation;
- manual attribution repair as a prerequisite for ingestion;
- manual reconstruction of the transaction path.
A dashboard, proposal, desired state, test fixture, ADR, theoretical capability or one-off transaction trace alone does not satisfy this requirement.
**Final Acceptance Test**
**No real transaction:**
Revenue Engine is not working.
**One real transaction:**
The path is partially proven.
**Subsequent real transactions process through the same path automatically and preserve correct monetary truth:**
Revenue Engine v1 is working.

**Final Scope Guardrail**
The immediate implementation target is:
**RunSignup money truth + one repeatable donation acquisition funnel.**
Do not simultaneously build:
- full Academy automation;
- full membership automation;
- every participant funnel;
- broad Google Ads mutation architecture;
- new dashboards;
- new race infrastructure;
- new challenge infrastructure.
First close one real production revenue loop.
Then expand from proven money flow.
