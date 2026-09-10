\# ADR-0001: Open Proof Registry Boundary



\- Status: Accepted

\- Date: 2026-09-09

\- Organization / Grantee: Nordic Walking Association of North America (NWANA), 501(c)(3)

\- Project: NWANA Open Proof Registry

\- Founder / Initiator: Albert Fatikhov

\- Project Lead: Albert Fatikhov

\- Product Architect: Albert Fatikhov

\- Context: NWANA Engine



\## Decision



The trust/proof layer being developed inside NWANA Engine must remain modular and application-agnostic so that it can later be extracted into a separate free/open-source project, provisionally named NWANA Open Proof Registry.



NWANA Engine remains the primary sports infrastructure system. Core operational data remains in Cloudflare D1 and NWANA Engine must continue to function even if the proof/timestamp layer is disabled.



The architectural boundary is:



NWANA Engine

→ official object / result

→ cryptographic hash

→ proof / timestamp layer

→ public verification



The proof layer must not require NWANA-specific concepts such as a particular race, championship, challenge, article, or object type in order to function.



A generic proof subject should be representable through identifiers, versions, hashes, proof metadata, and verification metadata.



\## Rationale



This separation preserves the ability to:



1\. Keep NWANA operating independently of blockchain infrastructure.

2\. Maintain a $0 operating-cost architecture.

3\. Reuse the proof layer for other sports organizations, races, nonprofits, and other systems.

4\. Publish the proof layer later as free/open-source software.

5\. Use Bitcoin-compatible proof/timestamp infrastructure without requiring paid on-chain transactions.

6\. Evolve the proof layer independently from the rest of NWANA Engine.



\## Current Implementation Direction



The current system separates:



\- NWANA-specific registry and object data;

\- generic jobs and scheduling;

\- trust/proof processing;

\- OpenTimestamps and Bitcoin-compatible verification details.



The generic job dispatcher should not contain Bitcoin- or OpenTimestamps-specific logic. It should dispatch generic proof-processing jobs to the proof module.



Proof-provider implementation details remain inside the proof layer.



\## Zero-Cost Requirement



ZERO-COST FIRST is a mandatory architecture rule.



The mandatory system must not require paid infrastructure, paid APIs, paid blockchain transactions, or paid monitoring/queue services.



Paid services may later improve speed, convenience, or scale, but they must not be required for the system to function.



\## Project Origin and Leadership



Albert Fatikhov conceived and leads the development of a sports integrity and provenance infrastructure within NWANA.



His factual role in the project currently includes:



\- President, NWANA

\- Founder / Initiator of the Open Proof Registry concept

\- Project Lead

\- Product Architect



Maintainer / Project Steward may be used where it accurately reflects the role at the relevant stage.



Technical developers who later implement parts of the system should be credited as developers/contributors without erasing the origin of the project or its product and architecture leadership.



Albert Fatikhov should not be described as a blockchain developer unless that becomes factually accurate.



\## Authorship and Evidence Trail



Significant project artifacts should preserve contemporaneous, factual provenance where appropriate, including:



\- creation date;

\- author or initiator;

\- document or decision version;

\- substantial change history;

\- Git commit history;

\- issues and architecture decisions;

\- release history;

\- contributor history;

\- records of key product and architecture decisions;

\- public project descriptions;

\- grant applications and grant announcements;

\- external endorsements, references, or independent mentions;

\- evidence of adoption by other organizations, if it occurs.



Particular care should be taken not to lose evidence from the earliest stages of the project, including:



\- the original concept;

\- early architecture decisions;

\- creation of the trust/proof layer;

\- the decision to make the proof layer application-agnostic;

\- the decision to preserve the option of extracting it from NWANA Engine as an independent open-source module;

\- ongoing product and architecture leadership.



This evidence trail must reflect actual work and actual roles. It must not be manufactured, exaggerated, or created solely for immigration purposes.



The purpose is to preserve a natural, dated record of the project's real development history.



\## Consequences



Future code, schema, documentation, repository structure, and public registry work should avoid unnecessary NWANA-specific coupling inside the proof layer.



This decision does not require immediate extraction into a separate repository.



No additional paid service is introduced by this decision.



No unnecessary development work should be added solely to prepare for future grant applications or immigration evidence.



The system should continue to evolve incrementally from the existing NWANA Engine architecture.

