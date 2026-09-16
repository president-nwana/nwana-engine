# ADR-0003: Canonical Repository Memory

- Status: Accepted
- Date: 2026-09-16
- Project: NWANA Engine

## Context

NWANA Engine has become sufficiently complex that chat history, individual memory, object names, and inferred platform behavior are not reliable sources of system truth.

Development sessions may occur in different chats, with different developers or AI systems.

Reconstructing project state from previous conversations creates a risk of:

- reintroducing rejected assumptions;
- misclassifying RunSignup/TicketSignup objects;
- repeating architecture decisions already made;
- modifying production infrastructure based on incomplete context;
- losing the exact current development state.

## Decision

The GitHub repository is the canonical development memory of NWANA Engine.

No developer or AI should require previous chat history in order to understand the current system state and continue development safely.

The canonical memory is divided into separate artifacts.

### SYSTEM_STATE.md

Records the current operational development state:

- current stage;
- last verified implementation state;
- current blocker;
- remote/local state where relevant;
- hard prohibitions;
- next action.

This file is expected to change frequently.

### registry/objects.yaml

Records verified factual information about real external NWANA platform objects.

It must distinguish verified facts from unknown facts.

UNKNOWN is preferable to inference.

### registry/README.md

Defines how factual Registry information must be maintained.

### docs/adr/

Records architectural decisions that should not be rediscovered or casually reversed.

ADRs describe decisions and reasoning, not frequently changing operational state.

### CHANGELOG.md

Records significant implementation and system-state milestones.

### AGENTS.md

Provides mandatory instructions for developers and AI systems entering the repository.

It must direct them to canonical project memory before making changes.

## Required Start Procedure

Before making architectural, Registry, D1, adapter, processing, or distribution changes, a developer or AI must read:

1. SYSTEM_STATE.md
2. registry/README.md
3. registry/objects.yaml
4. relevant ADRs
5. AGENTS.md

Chat memory may provide additional context but must not override the repository.

## No Reconstruction from Assumptions

If a fact about an external object is not documented and verified, it must not be reconstructed from:

- title;
- internal object_id;
- URL;
- hierarchy;
- neighboring objects;
- RunSignup/TicketSignup terminology;
- old chat memory;
- apparent similarity to another object.

The correct state is UNKNOWN until verified.

## Session Close Requirement

At the end of a meaningful development session:

- update SYSTEM_STATE.md;
- update canonical Registry facts if external reality was verified or changed;
- add/update ADRs if architecture changed;
- update CHANGELOG.md for significant milestones;
- commit the memory update with the relevant implementation work.

## Consequences

A new developer or AI can continue development from the repository without receiving a narrative reconstruction of previous chats.

The repository becomes not merely source-code storage but the authoritative development record for NWANA Engine.

This decision does not make documentation more authoritative than verified external platform reality.

If repository documentation conflicts with newly verified external reality, the repository must be corrected.
