# Canonical NWANA External Object Registry

`registry/objects.yaml` is the human-readable, machine-readable factual registry of real NWANA external platform objects.

It complements the D1 Registry. It does not replace the runtime database.

## Purpose

The file exists so that a developer, AI, or future maintainer does not have to reconstruct platform reality from:

- chat memory;
- object names;
- internal IDs;
- URLs;
- RunSignup naming conventions;
- assumptions about similar objects.

## Core Rule

If a fact is not verified, use `UNKNOWN`.

Do not guess.

## Keep These Concepts Separate

### External platform identity

What actually exists in RunSignup, TicketSignup, or another external system.

Examples:
- provider
- source_type
- source_id
- platform/container type
- public URL

### NWANA semantic meaning

What that external object means to NWANA.

This is the same architectural concept supported by `semantic_profiles`.

Conceptually:

source + source_type + source_id -> NWANA meaning

### Capabilities

What the object can actually do.

Examples:
- registration
- results
- sponsorship
- fundraising
- ticketing
- email
- public website

A capability must not be inferred merely because the platform supports that capability in general.

### Processing

How NWANA processes the object.

This belongs to processing profiles, not platform identity.

### Distribution

Who should receive information about the object and through which channel.

This belongs to Rules Engine / distribution rules.

## RunSignup/TicketSignup Rule

NWANA may use race/event/nonprofit-event website infrastructure for a business purpose that is not a race.

Therefore:

platform container != NWANA business meaning

A container may exist primarily because the platform provides useful website, sponsorship, fundraising, communication, or other operational functions.

Each actual configuration must be verified individually.

## Verification Status

Use:

- `VERIFIED` — factual configuration confirmed.
- `PARTIALLY_VERIFIED` — some fields confirmed, others remain unknown.
- `UNKNOWN` — not yet checked.
- `NEEDS_RECONCILIATION` — current Engine/runtime record may contradict or overstate verified platform reality.

## Internal IDs

Do not silently rename existing `object_id` values in this YAML file.

If an existing identifier is misleading but is already referenced by D1 relationships, profiles, migrations, or code, document the mismatch and perform an explicit migration later if needed.

## Change Rule

When a real platform fact changes:

1. update `registry/objects.yaml`;
2. update affected D1 Registry data/migration;
3. update SYSTEM_STATE.md if current development state changes;
4. add an ADR only if the change represents an architectural decision rather than ordinary data maintenance.
