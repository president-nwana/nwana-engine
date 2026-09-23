# ADR-0032: NWANA Machine Orchestration Layer

Status: Accepted
Date: 2026-09-23

## Context

Every distribution decision in the machine was produced inside a
channel-specific builder: `src/google-ads-current.ts` manually assembled the
two Google Ads intents, and no channel-neutral record existed of *why* the
machine chose a source, a required result, a candidate action, and a channel.
Future channels (Meta, RunSignup email, LinkedIn, Press, Seller/Sponsorship,
Partner) each need the same decision record without duplicating the logic or
inventing marketing content from names, URLs, or IDs.

## Decision

One shared orchestration layer sits in front of every channel consumer:

```
CANONICAL SOURCES / TASKS
  -> SOURCE ADAPTERS (src/orchestration-sources.ts)
  -> NORMALIZED MACHINE SOURCES
  -> REQUIRED RESULT
  -> CANDIDATE ACTION
  -> CHANNEL DECISION (src/orchestration.ts)
  -> CHANNEL-SPECIFIC INTENT (src/orchestration-google-ads.ts)
  -> CHANNEL CONSUMER (ADR-0031 pipeline, unchanged)
```

- `src/orchestration-sources.ts`: the `NormalizedSource` descriptor
  (stable `source_identity`, `source_kind`, factual title/status/purpose,
  capabilities, relationships, public destinations, conversion capabilities,
  distribution actions, source facts, owner directive, provenance).
  Adapters: registry objects, rule-derived assets (Instructor Growth Fund),
  owner directives (DIR-FOUNDING-CIRCLE-2026), D1 funds, D1 sponsorship
  assets. Static, D1, and combined collectors with exact-identity
  deduplication. Adapters record only confirmed facts; unknown facts stay
  `UNKNOWN`; no object semantics are derived from names.
- `src/distribution-evidence.ts`: the committed distribution evidence
  (7 rules, 40 actions, 10 Series work-item metadata records) generated from
  `migrations/0006-seed-core-distribution-rules.sql` and
  `migrations/0013-add-series-hub-work-items.sql`. Production D1 has no
  seeded rules/actions, so the committed migration files are the
  authoritative evidence source. No D1 seeding was performed.
- `src/orchestration.ts`: the channel-neutral core. `OrchestrationDecision`
  (state `DECIDED | NO_DECISION | MISSING_DECISION_INPUT`, source identity,
  required result, candidate action, channel, evidence, factual reason,
  deterministic `decision_id` via stable FNV-1a hash of identity +
  required result + candidate action + channel). Every `DECIDED` decision
  carries at least one exact evidence reference (`DISTRIBUTION_ACTION:<id>`
  or `OWNER_DIRECTIVE:<id>`). `NO_DECISION` is a normal outcome when a
  source carries no evidence; `MISSING_DECISION_INPUT` is a normal outcome
  when evidence exists but purpose/deliverable are not recorded or the
  channel has no mapping. The core never reads stores and never creates
  marketing content.
- `src/orchestration-google-ads.ts`: the Google Ads consumer of the
  orchestration layer. Channel-neutral decisions with `GOOGLE_ADS` channel
  are resolved to `NormalizedCampaignIntent` through explicit
  `GOOGLE_ADS_CHANNEL_INPUTS` facts (Series and Founding Circle carry their
  existing factual campaign content; no new Google Ads builder was created).
  The existing ADR-0031 pipeline
  (INTENT -> SPEC -> POLICY -> LIVE CONFLICT CHECK -> PROPOSAL -> OWNER
  REVIEW) is untouched. `getOrchestrationDecisions()` attaches the stable
  `channel_intent_id` and downstream Google Ads proposal state to each
  Google Ads decision, so orchestration state and proposal state stay
  separate fields on the same view.
- `src/google-ads-current.ts`: reduced to a compatibility projection over
  the orchestration feed. `currentProposalIntents()` returns
  `orchestrationGoogleAdsIntents()`; `buildDesiredState()` behavior is
  unchanged (same two campaigns, same names, budgets, geo, ad groups,
  keywords, ads, sitelinks). Proposal identities are unchanged:
  `OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES` and
  `OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE`.
- Owner view: the Ads screen and downloadable Ads report gained a separate
  `ORCHESTRATION DECISIONS` block. Live account, orchestration decisions,
  and machine proposals are three separate logical layers, never merged.

## Consequences

- The generic consumer contract is the `NormalizedSource` ->
  `OrchestrationDecision` -> channel input mapping; a new channel needs only
  channel inputs and a consumer adapter, not new core logic.
- `EMPLOYER_MATCHING` has no machine channel mapping yet; fund actions on
  that channel surface as `MISSING_DECISION_INPUT`, never guessed.
- Boundaries, unchanged from ADR-0031: zero runtime cost, no mutations, no
  cron/polling, no sends, no new Google Ads builder, no fuzzy matching, no
  marketing inference from capabilities, URLs, prices, names, or generic
  relevance. Execution layers for other channels are out of scope.
