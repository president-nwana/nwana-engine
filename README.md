# NWANA Engine

NWANA Engine is the growth, revenue, fundraising, sponsorship, partnership, and distribution engine for the connected NWANA ecosystem.

Its core operating loop is:

`OBJECT -> MONEY OR CONVERSION -> AUDIENCE -> SPONSORSHIP -> DISTRIBUTION -> NEXT OBJECT`

Read `MACHINE_PURPOSE.md` for the canonical product purpose, operating model, current priority, and the boundary between the separate Series 2026 legacy process and the future Series 2027 processing inside NWANA Engine.




## START HERE — Canonical Project Memory

For current development work, do not reconstruct the project from chat history.

Read these files first:

- `MACHINE_PURPOSE.md` — why the machine exists, what it must do, and the required implementation order.
- `SYSTEM_STATE.md` — current stage, verified state, blocker, next action, and remote/local status.
- `registry/README.md` — rules for verified external object facts.
- `registry/objects.yaml` — canonical factual Registry of real NWANA external platform objects.
- `docs/adr/` — accepted architecture decisions.
- `CHANGELOG.md` — significant implementation and system-state milestones.
- `AGENTS.md` — mandatory instructions for developers and AI systems.

The repository is the canonical development memory of NWANA Engine.

If an external platform fact is not verified in the canonical Registry, it must be treated as `UNKNOWN` rather than inferred from a title, URL, internal ID, hierarchy, or similar object.
NWANA Engine is a zero-cost-first sports infrastructure, integrity, provenance, automation, and proof-processing system developed by the Nordic Walking Association of North America.



## Organization



**Organization / Grantee:** Nordic Walking Association of North America (NWANA), a U.S. 501(c)(3) nonprofit organization.



## Project



**Project:** NWANA Engine



NWANA Engine is being developed as an operating infrastructure for sports programs, competitions, challenges, results, object registry, integrity verification, automation, and distribution.



The system is designed under a mandatory **ZERO-COST FIRST** principle: its required operating path must remain functional without mandatory paid APIs, paid infrastructure services, or paid blockchain transactions.



## Open Proof Registry



A modular trust and proof layer is being developed within NWANA Engine with the architectural option of later being separated into an independent free/open-source project:



**NWANA Open Proof Registry**



The intended proof architecture is:



NWANA Engine

→ official object or competition result

→ cryptographic hash

→ proof / timestamp layer

→ public verification



The proof layer is being designed to remain application-agnostic and potentially reusable by other sports organizations, races, nonprofits, and other systems.



NWANA Engine itself must remain fully operational without blockchain infrastructure. The proof layer is an optional, pluggable integrity and provenance component.



## Project Origin and Leadership



**Founder / Initiator of the Open Proof Registry concept:** Albert Fatikhov

**Project Lead:** Albert Fatikhov

**Product Architect:** Albert Fatikhov

**President, NWANA:** Albert Fatikhov



Albert Fatikhov conceived and leads the development of a sports integrity and provenance infrastructure within NWANA.



Technical developers and contributors who implement parts of the system are credited for their work while preserving the factual origin, product direction, and architecture leadership of the project.



Official profile:



https://albertfatikhov.nwaofna.org/



## Current Architecture



The current system includes:



- object registry;

- object version history;

- cryptographic SHA-256 hashing;

- trust records;

- OpenTimestamps proof generation;

- Bitcoin-compatible proof verification;

- audit events;

- blockchain anchor metadata;

- specialized proof-processing jobs;

- a generic due-job scheduler and dispatcher;

- Cloudflare Workers and D1-based infrastructure.



The architecture is being developed so that application-specific sports data remains separate from generic proof and verification logic.



## Architectural Principles



### Zero-Cost First



The mandatory operating system must not depend on paid services.



Paid services may later improve speed, convenience, or scale, but they must not be required for the system to function.



### Event-Driven Where Possible



External and internal events should create specific jobs or trigger specific processing.



Scheduled processing should operate only on due jobs rather than repeatedly scanning the complete database.



### Application-Agnostic Proof Layer



Proof and verification infrastructure should not require NWANA-specific object types or competition concepts.



### Verifiable History



Significant architectural and product decisions are preserved through Git history, Architecture Decision Records, version history, audit records, releases, and contributor history.



## Architecture Decision Records



Architecture decisions are documented in:



`docs/adr/`



The first recorded decision is:



`ADR-0001: Open Proof Registry Boundary`



It establishes the modular boundary between NWANA Engine and the future application-agnostic proof layer and records the factual project origin and leadership.



## Status



The project is currently under active development.



Current functionality has been tested locally. Production deployment, public registry interfaces, security hardening, authentication, and additional integrations remain future development work.



## License



A final open-source license has not yet been selected.



Until a license is explicitly added, publication of this repository should not be interpreted as granting an open-source software license.
