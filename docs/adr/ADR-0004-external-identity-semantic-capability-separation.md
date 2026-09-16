# ADR-0004: External Identity, NWANA Meaning, Capability, Processing and Distribution Are Separate Layers

- Status: Accepted
- Date: 2026-09-16
- Project: NWANA Engine

## Context

External platforms such as RunSignup/TicketSignup expose technical objects and containers.

NWANA may use those containers for purposes that differ from the platform's naming conventions.

For example, infrastructure commonly associated with a race/event website may be used by NWANA for:

- a public Series hub;
- an athlete sponsorship asset;
- a sport sponsorship asset;
- a Partner Network asset;
- another future business or program purpose.

Therefore the technical platform object must not define NWANA business meaning.

Stage 7 already introduced explicit semantic profiles so NWANA meaning can be resolved from:

source + source_type + source_id -> NWANA meaning

rather than relying only on titles or discovery heuristics.

Stage 8 introduced processing profiles separately from semantic profiles and object capabilities.

## Decision

The following concepts are independent architectural layers.

## 1. External Source Identity

Describes what exists on the external platform.

Examples:

- source/provider;
- source_type;
- source_id;
- platform container type;
- external URL;
- external parent/child identity.

This layer describes external reality only.

## 2. NWANA Semantic Meaning

Describes what that external object means to NWANA.

Examples:

- OPEN_SERIES;
- US_CHAMPIONSHIP;
- PARTNER_NETWORK;
- ATHLETE_PROPERTY;
- NWANA_SPORT;
- future program families.

Explicit semantic profiles override title-based fallback inference.

## 3. Object Capabilities

Describe what an object can actually do.

Examples:

- REGISTRATION;
- RESULTS;
- SPONSORSHIP;
- FUNDRAISING;
- PARTICIPATION;
- EMAIL;
- TICKETING;
- future capability types.

Capabilities must be verified individually.

A platform may support a feature in general without that feature being enabled or applicable to a specific NWANA object.

## 4. Processing Profiles

Describe how NWANA processes an object.

Examples:

- 2026 Series result-level thresholds;
- future 2027 scoring;
- challenge progress logic;
- future competition-specific processing.

Processing logic must not be embedded into generic source identity or generic capability definitions.

## 5. Distribution Rules

Describe:

- which audiences are relevant;
- which action should happen;
- through which channel;
- under what execution mode.

Distribution rules must not redefine external identity, semantic meaning, capabilities, or processing logic.

## RunSignup/TicketSignup Rule

A RunSignup/TicketSignup race/event/nonprofit-event/container must not automatically be classified as a real competition for NWANA.

Platform container type and NWANA business purpose are separate.

An internal object_id containing the word RACE is not proof that the real external object is a race.

## Verified Example

RunSignup/TicketSignup source_id 209464:

https://series.nwaofna.org/

is used as the public website/hub for the 2026 NWANA Open Nordic Walking Series.

It is not itself:

- a participant-registration object;
- a competition race;
- a results container.

This example demonstrates why platform identity, semantic meaning, and capabilities must remain separate.

## Future Extensibility

The Registry schema uses extensible string values rather than a closed enumeration for concepts such as:

- object_type;
- source_type;
- program_family;
- commercial_role;
- relationship_type;
- capability_type.

Future Store, Membership, Volunteer, TicketSignup, Email, Loyalty, Championship, Challenge, or other functions should normally be represented through new objects, relationships, capabilities, semantic profiles, processing profiles, rules, or adapters.

They should not require redesigning Registry Core merely because they are new business functions.

## Adapter Rule

Do not build every possible future external adapter in advance.

An adapter should be created when NWANA actually connects the relevant external source or function.

## Consequences

The Engine can grow without conflating:

external platform reality
with
NWANA business meaning
with
technical capability
with
business processing
with
distribution behavior.

This separation is a permanent architectural invariant unless explicitly replaced by a future ADR.
