# NWANA ENGINE — OPERATING PLAN

This file is the current execution contract for NWANA Engine. It supersedes older chronological progress notes when they conflict with this plan.

## Owner outcome

NWANA Engine is not complete until the project owner can use a normal control page without terminal commands or a chat assistant to:

1. create a new NWANA object or connect an existing one;
2. choose the required business result;
3. approve consequential external actions;
4. see what the machine completed, what response occurred, and what requires attention.

The owner must not be required to recreate Series, Challenges, Championships, Academy campaigns, funds, sponsorship assets, or distribution packages manually across multiple platforms.

## Control page

The operator interface must provide at least:

- Create Series;
- Create Challenge;
- Create Championship;
- Connect Existing Object;
- Find Participants;
- Find Academy Students;
- Find Instructors and Group Leaders;
- Find Donors;
- Find Sponsors;
- Assign Sellers;
- Find Partners;
- Distribute to Press;
- Review Actions, Outcomes, and Errors.

Do not describe backend endpoints, Registry rows, plans, or drafts alone as a finished machine.

## Complete operating loop

OBJECT -> REQUIRED RESULT -> AUDIENCE -> OFFER -> CHANNEL -> ACTION -> RESPONSE -> FOLLOW-UP / NEXT OBJECT

For every connected object, Engine must determine and execute the appropriate work for:

- participants;
- Academy students;
- instructors and coaches;
- NW Group leaders;
- donors;
- sponsors;
- sponsorship sellers;
- partners;
- media and public visibility.

## Distribution and acquisition channels

The implementation must account for the exact applicable channels, not vague “distribution” language:

- Facebook: NWANA;
- Facebook: Nordic Walking Sport;
- Instagram: nwana.official;
- Instagram: n_w_sport;
- LinkedIn Page;
- Google Ads Grants;
- RunSignup/TicketSignup email and contact lists;
- Google Workspace email;
- verified sport, health, aging, nonprofit, business, and community media;
- verified event calendars and free listings;
- verified DAF and philanthropic directories;
- partner organizations;
- the NWANA seller network;
- Seat Theory;
- Zubie Five;
- additional channels only after their cost, access, and operating role are verified.

## Seller workflow

Engine must track:

- available sponsorship asset;
- assigned seller;
- prospective sponsor;
- source of the relationship;
- outreach and response;
- proposal and agreement;
- stage;
- amount;
- commission;
- next action.

## Press workflow

Engine must support:

- matching a real object or development to relevant media;
- preparing a factual press release or pitch;
- selecting exact verified recipients;
- sending through an approved connected channel;
- recording replies and follow-up.

## Google Ads Grants workflow

Within the verified free nonprofit grant and approved API access, Engine must support:

- object and conversion goal;
- audience and search intent;
- keywords;
- ads;
- landing page;
- conversion observation;
- campaign outcome and next action.

Do not add paid advertising, paid AI, paid infrastructure, or any feature capable of exceeding the project's $0 operating-cost rule without explicit owner approval.

## Trigger rule

Do not poll external platforms on a recurring schedule merely to discover whether something changed.

Allowed starts are:

- the owner creates, connects, approves, or launches an object/action in Engine;
- Engine itself completes a prior step and emits the next explicit internal action;
- a verified external platform sends a real event at $0;
- an existing NWANA component explicitly signals completion, such as the Series 2026 result processor after it finishes.

If a platform supplies no event, the owner action inside Engine is the signal. Do not require the owner to duplicate the underlying business object manually across systems.

## Existing and future objects

Existing objects, including Academy, Licenses, NW Groups, Instructor Growth Fund, Sponsorship, Partner Network, and Series 2026, must be connected once and then operated through Engine.

Future Series 2027, Challenges, U.S. Championships, and Continental Championships are to be created through Engine. Their creation request is the signal that starts Registry, platform creation, offers, audiences, distribution, sponsorship, and follow-up.

Physical creation inside RunSignup/TicketSignup depends on verified write API access. Do not claim it works before that permission is confirmed. If access is unavailable, record the blocker and pursue the provider; do not silently redefine “create through Engine” as manual recreation by the owner.

## Access status — verify before integration work

| Integration | Known state | Required next verification |
|---|---|---|
| Meta | Connected; one live Series 2026 result delivered successfully to four accounts | Confirm durable credential lifecycle and retain per-destination duplicate protection |
| RunSignup/TicketSignup read | Working for verified Series 2026 sources | Preserve bounded requests under free Worker limits |
| RunSignup/TicketSignup write / expanded API | Requested; current grant status unknown | Check account/developer portal and correspondence; follow up firmly if absent |
| Google Ads Grants | NWANA nonprofit grant exists; developer/API access not confirmed complete | Check Ads account, manager account, developer token, and API access status |
| LinkedIn | App created and Page verified; Community Management API was requested | Check developer portal for approval and available scopes |
| Google Workspace | Google Workspace for Nonprofits exists | Verify a $0 organization-email sending path and required admin/API permissions |
| RunSignup/TicketSignup email/contact access | Unknown | Verify exact API capabilities and permissions |
| Moodle Academy | Existing production asset; API/control access not verified for Engine | Verify web services/API and exact objects to connect |
| Seat Theory / Zubie Five | Business channels identified; automation/API status unknown | Verify access, cost, and supported handoff |
| Press/media | No platform signal required | Build verified media registry plus Google Workspace outreach and response tracking |
| NWANA sellers | No external API required | Build internal asset assignment, outreach, deal, commission, and follow-up workflow |

Unknown means unknown. Do not infer approval from an application submission or from absence of an email.

## Immediate execution order

1. Access audit: check every requested API/portal above and record evidence, scopes, cost, and blockers.
2. Follow-up: pursue missing approvals, especially RunSignup/TicketSignup write, Google Ads, and LinkedIn.
3. Operator control page: build the owner-facing create/connect/goal/review/error interface.
4. Existing-object connection: connect Academy, Licenses, NW Groups, Instructor Growth Fund, Sponsorship, Partner Network, and the completed Series 2026 publication path.
5. Real execution: connect Meta, Google Ads Grants, email, press, sellers, partners, listings, and verified sponsorship channels one by one with outcome tracking.
6. Future-object creation: create Series 2027, Challenges, and Championships through Engine using verified platform write capabilities.
7. Independence test: the owner completes a real create/connect/distribute cycle without terminal commands or chat assistance.

Do not drift into mass Registry cataloguing, generic architecture, speculative adapters, or cosmetic backend work that does not advance one of these seven steps.

## Definition of done

The machine is operationally useful only when the owner can create or connect an object, request a business result, approve consequential actions, and observe outcomes from the control page without terminal commands and without depending on a particular chat session.
