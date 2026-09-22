# ADR-0017: Sponsorship Asset as a first-class machine object

Date: 2026-09-22
Status: Implemented and deployed

## Context

The NWANA machine's operating loop is OBJECT -> MONEY OR CONVERSION ->
AUDIENCE -> SPONSORSHIP -> DISTRIBUTION -> NEXT OBJECT. The master map
lists Sponsorship Assets (object 11) as spanning almost the whole system:
organization-wide, Academy, licenses, NW Groups, Challenges, Series,
Events, results and rankings, media, future championships. Until now the
engine had no such object: the operating center reported "Sponsor
pipeline is not connected yet", and the only sponsor-facing content was
a hand-written 11-asset inventory document prepared for a Sea Theory
portal submission.

The machine's purpose: at the moment an object is created, its life and
distribution start. When a Series or a Fund exists, the machine should
produce the seller package for it on its own, so the sales stream works
from generated material instead of hand-built documents.

## Decision

1. New object type `SponsorshipAsset` in D1: `sponsorship_assets`
   (object_type, object_id, title, description, audience, delivers,
   reference_pricing, stage, stage timestamps). Migration 0026. One
   asset per (object_type, object_id) via a UNIQUE constraint, so
   generation is idempotent and can never duplicate.

2. Asset lifecycle, enforced in code, not in anyone's head:
   draft -> packaged -> offered -> negotiating -> committed
   -> fulfilled -> renewal.
   Forward flow plus one-step corrections backward; `renewal` is
   terminal (a renewed relationship routes to the next object, it does
   not loop). Skipping stages is rejected with the exact allowed moves.

3. Pure builder `buildSponsorshipAssetPackage`: parent object facts in,
   seller package out. Content source is the verified 11-asset
   inventory (seatheory-inventory-submission.md). Pricing uses ONLY the
   verified 2026 reference grid, always labeled "Reference" with its
   2026-12-31 term limit. Anything else is "TBD": donor tiers are
   charitable gifts, not sponsorship, and 2027 inventory/pricing is
   finalized with the sales partner. No numbers are invented.

4. Supported parent objects in this step: `series` (SERIES_2026 only;
   any other series id is rejected rather than guessed) and `fund`
   (resolved from the `funds` table; unknown fund ids are rejected).
   Unknown object types are rejected, not guessed.

5. The machine NEVER contacts sellers or sponsors. No outreach, no
   emails, no portal submissions. Seller conversations (Integrity 9,
   Zubie Five, Sea Theory, direct outreach) stay human; the sales
   stream picks packages up from the operating center. This object is
   generation and tracking only.

6. Generation is explicit (operating-center button / API), not
   retroactive: no backfill was run for existing objects, and the 53
   past race events were not turned into assets (assets are per Series
   / per Fund, not per race event). When a user-facing object-creation
   API is built later, it should call `generateSponsorshipAsset`.

7. Operating center shows each asset with its package (audience,
   delivers, reference pricing), its stage, its next action, and a
   one-click stage advance (owner key required, like every other
   operating-center action).

## Consequences

- The machine now produces sponsor-facing material itself instead of
  relying on hand-written documents. The next objects (Partner
  Opportunity, Challenge) follow the same pattern: table + lifecycle
  + API + panel.
- The sales stream gets generated packages from the operating center;
  nothing is sent anywhere by the machine.
- Package content stays truthful by construction: verified inventory
  facts in, labeled reference pricing out, TBD where nothing is
  verified.
