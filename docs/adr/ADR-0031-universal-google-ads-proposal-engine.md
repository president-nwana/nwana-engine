# ADR-0031: Universal Google Ads Proposal Engine

Status: Accepted
Date: 2026-09-23

## Context

The machine planned Google Ads campaigns through two hardcoded, source-specific
builders in `src/google-ads-state.ts` (`series2026Campaign()`,
`foundingCircleCampaign()`), plus a hardcoded Series-vs-live conflict branch in
the Ads screen (`SERIES_PROPOSAL_NAME`). Every new campaign source (Fund,
sponsorship asset, challenge, championship) would have needed another hardcoded
builder and another screen branch. The engine also had no uniform answer for
"what does a Fund know about campaigns" (nothing: it must not invent URLs,
CTAs, keywords, or copy).

## Decision

One universal pipeline for every proposal:

```
SOURCE / OWNER TASK
  -> NORMALIZED CAMPAIGN INTENT (google-ads-intent.ts)
  -> CAMPAIGN SPEC (generic builder, google-ads-proposals.ts)
  -> POLICY VALIDATION (existing validateCampaignSpec, unchanged)
  -> LIVE DUPLICATE CHECK (generic, data-driven)
  -> MACHINE PROPOSAL (universal ProposalRecord)
  -> OWNER REVIEW
```

- `src/google-ads-intent.ts`: the `NormalizedCampaignIntent` model (stable
  `source_identity`, `source_kind`, `origin`, optional `source_object`,
  distribution provenance, `purpose`, factual campaign name, target URL, CTA,
  audience/context, source facts, daily budget, geo target, explicit ad-group /
  keyword / ad-copy / sitelink hints). Deterministic proposal identity:
  `origin:source_identity:purpose` (no timestamps, no random UUIDs). Source
  adapters (`adaptRegistryObject`, `adaptFund`, `adaptSponsorshipAsset`,
  `adaptOwnerDirective`) carry only confirmed factual data; adapters never do
  policy, eligibility, duplicate, or proposal-state logic. Fund and Sponsorship
  adapters invent nothing: missing campaign inputs are not an adapter error,
  they surface as `INSUFFICIENT_INPUT` with the exact missing fields.
- `src/google-ads-proposals.ts`: the generic core. `buildCampaignSpecFromIntent`
  assembles a CampaignSpec purely from supplied facts and hints (never invents
  copy). `findLiveConflict` uses two deterministic signals only: exact campaign
  name match against the live snapshot, and explicit verified proposal <->
  live-campaign mappings stored as data (`VERIFIED_CONFLICT_MAPPINGS`). No
  fuzzy matching, no similarity, no embeddings. State machine with generic
  precedence: missing input -> `INSUFFICIENT_INPUT`; policy violations ->
  `POLICY_REVIEW`; confirmed live conflict -> `POSSIBLE DUPLICATE / REVIEW`;
  otherwise -> `PROPOSED`. Distribution provenance never gates eligibility;
  a conflict never destroys a proposal.
- `src/google-ads-current.ts`: the migration layer. The two existing proposals
  enter the pipeline through the same adapters as any future proposal, carrying
  the existing factual campaign content as explicit hints (Series CTA taken
  from the verified distribution-action metadata in
  `migrations/0013-add-series-hub-work-items.sql`; Founding Circle
  `directive_id` is the stable `DIR-FOUNDING-CIRCLE-2026`). `buildDesiredState`
  now builds from these intents through the generic builder: the reconcile
  endpoint output is byte-identical to the former hardcoded builders.
- `src/google-ads-state.ts` keeps the low-level CampaignSpec types, the Ad
  Grants policy validator, and eligibility; the two hardcoded builders are
  deleted.
- The Ads screen and its report render the universal `ProposalRecord`
  (proposal id, origin, source id/directive id, source object, purpose, target
  URL, daily budget, eligibility, policy result, state, conflict/review
  metadata, distribution provenance, missing fields, next action). The hardcoded
  Series conflict branch is deleted; the Series verified mapping lives in
  `VERIFIED_CONFLICT_MAPPINGS` in `google-ads-proposals.ts` as data.

## Amendment 2026-09-23: factual partial intents and D1-backed production feed

- `GOOGLE_ADS_CHANNEL_INPUTS` is no longer an eligibility gate. A decided
  source without channel inputs produces a factual partial intent built only
  from confirmed facts (identity, factual name, purpose, confirmed target
  URL, source facts); missing campaign fields stay `null`/empty, nothing is
  invented. Such incomplete intents reach the ADR-0031 proposal engine as
  `INSUFFICIENT_INPUT` with the exact missing fields, and they are skipped
  in the reconcile-facing desired state (they stay visible as proposals).
- `orchestrationGoogleAdsIntents(db)` is async and uses
  `collectSources(db)` (static plus D1-backed sources), so D1-backed
  canonical sources participate in the production proposal pipeline. Feed
  entries are deduped by proposal identity; when two decisions resolve to
  one proposal, the stronger evidence wins
  (`OWNER_DIRECTIVE > DISTRIBUTION_ACTION > DISTRIBUTION_RULE >
  GENERIC_RULE`); the feed order follows the winning decision's
  `decision_id`, so adding generic-rule decisions never reorders existing
  intents. `currentProposalIntents(db)` and `buildDesiredState(db)` are
  async; all production callers were updated.
- `RULE_DERIVED_ASSET` was added to `IntentSourceKind` with the
  `adaptRuleDerivedAsset()` adapter so rule-derived assets travel the same
  factual path (partial or complete).
- `evidenceBundle()` now includes the committed generic rules; the
  `GENERIC_RULE` evidence kind is a first-class evidence reference in
  proposals.

## Non-goals

No orchestration/channel-decision layer, no external paid AI/API, no
cron/polling, no campaign copy generation, no Google Ads mutations of any
kind, no automatic merge/delete/pause/rename/consolidation. Live GAQL, date
range, OAuth, customer ID, API version, Analytics, mutation state, and the
reconcile script are untouched.

## Consequences

New source types plug in through new adapters without touching the generic
core. Incomplete sources (Fund, sponsorship asset) normalize factually and
report exact missing fields instead of failing or inventing content. The two
production proposals keep their states: Series `POSSIBLE DUPLICATE / REVIEW`
(via the verified mapping to "2026 NWANA Open Nordic Walking Series", even
when the live snapshot does not contain it), Founding Circle `PROPOSED`.
Stable proposal IDs: `OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES` and
`OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE`.
