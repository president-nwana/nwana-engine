\# ADR-0002: Blockchain-Agnostic Proof Provider Architecture



\- Status: Accepted

\- Date: 2026-09-10

\- Organization: Nordic Walking Association of North America (NWANA), a U.S. 501(c)(3) nonprofit organization

\- Project: NWANA Open Proof Registry

\- Founder / Initiator: Albert Fatikhov

\- Project Lead: Albert Fatikhov

\- Product Architect: Albert Fatikhov



\## Context



NWANA Open Proof Registry must remain universal and independent from any specific blockchain network.



The Registry Core must not depend on Bitcoin, Stacks, Solana, Ethereum, Filecoin, or any other blockchain.



The base Registry must function fully without blockchain infrastructure.



Core model:



object

→ version

→ actor

→ relationships

→ audit history

→ hash / proof

→ verification



Blockchain is an optional external proof and anchoring layer.



The first working implementation currently uses OpenTimestamps with Bitcoin-compatible verification because a suitable approach with $0 operating cost has been identified.



This first implementation must not define the architecture of the Registry Core.



\## Decision



Open Proof Registry will use a provider-based proof architecture.



Registry Core communicates with external proof systems through stable provider interfaces.



Conceptually:



Registry Core

→ Proof Provider Interface

→ OpenTimestamps / Bitcoin provider

→ Stacks provider

→ Solana provider

→ Ethereum provider

→ Filecoin provider

→ future providers



Adding a new provider or blockchain network must not require modification of Registry Core.



\## Core Independence



Registry Core must be able to create and manage objects even when no blockchain provider is configured or available.



An object or version may exist with:



\- no external proof;

\- one external proof;

\- multiple independent external proofs.



Blockchain proof is therefore optional metadata and verification evidence, not a prerequisite for Registry existence.



\## Proof Provider Interface



Every proof or anchoring backend must be implemented behind a common interface.



The exact TypeScript interface may evolve, but conceptually a provider must be able to support operations such as:



\- create proof or anchor request;

\- retrieve or upgrade proof state;

\- verify proof independently;

\- return normalized provider metadata;

\- report provider/network identity;

\- return external anchor identifiers when available;

\- return timestamps and verification information.



Registry Core must work with normalized proof results rather than provider-specific blockchain fields.



\## Provider-Specific Logic



Bitcoin-specific logic must not live in Registry Core.



This includes concepts such as:



\- Bitcoin block height;

\- Bitcoin block hash;

\- confirmations;

\- Bitcoin transaction identifiers;

\- Blockstream-specific API calls;

\- OpenTimestamps-specific proof format;

\- Bitcoin-specific verification methods.



Such information belongs inside the relevant provider adapter or provider-specific metadata.



The current OpenTimestamps / Bitcoin implementation becomes the first proof provider rather than part of the universal core.



\## Multiple Proofs



A single object version may receive proofs from multiple independent providers.



Example:



OBJECT VERSION

→ OpenTimestamps / Bitcoin proof

→ Stacks proof

→ Solana proof

→ another future proof system



These proofs are independent records attached to the same Registry subject/version.



Failure or removal of one provider must not invalidate the Registry object or other proofs.



\## Proof Records



Universal proof/trust records must identify at least:



\- Registry subject or version;

\- provider;

\- network where applicable;

\- proof type;

\- proof status;

\- verification status;

\- created timestamp;

\- anchored timestamp where applicable;

\- verified timestamp;

\- external anchor / transaction identifier where applicable;

\- provider-specific metadata necessary for independent verification;

\- proof payload or reference where appropriate.



Provider-specific values must not require provider-specific columns in Registry Core when they can be represented as normalized fields plus structured provider metadata.



\## Open-Source Requirement



All blockchain integrations must be open-source and separated from Registry Core.



Before implementing a provider, first determine whether a reliable open-source implementation already exists.



Decision rule:



EXISTS AND FITS

→ use as-is



EXISTS BUT NEEDS ADAPTER

→ implement a thin adapter



PARTIALLY FITS

→ reuse suitable components



DOES NOT EXIST OR DOES NOT FIT

→ only then implement custom functionality



External open-source components must remain replaceable and must not define Registry Core architecture.



\## Current Provider



The first provider is based on OpenTimestamps with Bitcoin-compatible anchoring and verification.



OpenTimestamps protocol functionality should be reused rather than reimplemented.



Bitcoin is first only because a suitable $0 operating-cost implementation is currently available.



Bitcoin is not the Registry's required blockchain and has no privileged architectural status inside Registry Core.



\## Future Providers



Future providers may include:



\- Stacks;

\- Solana;

\- Ethereum;

\- Filecoin;

\- other blockchains;

\- non-blockchain transparency or proof systems.



Each must be implemented as an independent adapter/module.



\## Transparency and Verification Components



Blockchain providers are only one category of external verification infrastructure.



Registry may also use separate transparency / verification components, for example:



Registry Core

→ Transparency / Verification Interface

→ Sigstore / Rekor

→ Veritio-derived component

→ another future open-source component



These components must also remain optional and replaceable.



\## Zero-Cost-First Requirement



The current mandatory operating path must remain compatible with NWANA's $0 operating-cost requirement.



No provider may become mandatory if it requires paid infrastructure, gas fees, paid APIs, subscriptions, or other unavoidable operating costs.



Paid providers may be considered later as optional additions only.



\## Fundraising Implications



The provider architecture also supports ecosystem-specific open-source fundraising without changing the Registry Core.



NWANA may apply for grants to develop an individual adapter/backend.



Examples:



\- Bitcoin ecosystem funding → improve Bitcoin/OpenTimestamps provider;

\- Stacks ecosystem funding → build Stacks provider;

\- Solana ecosystem funding → build Solana provider;

\- another ecosystem → build its independent provider.



Such funding must not convert Open Proof Registry into a project controlled by or dependent on one blockchain ecosystem.



Registry Core remains network-independent.



\## Open-Source Reuse



Before substantial implementation of additional proof, audit, transparency, provenance, signature, or verification functionality, compare existing mature open-source solutions.



At minimum, architecture decisions must consider:



\- OpenTimestamps;

\- Sigstore / Rekor;

\- OTRUST;

\- Veritio;

\- other mature projects discovered later.



For each component classify the decision as:



\- USE AS IS

\- ADAPT

\- REFERENCE ONLY

\- BUILD OURSELVES



The objective is to build the minimum custom code required for a universal Open Proof Registry.



\## Consequences



\### Positive



\- Registry Core remains blockchain-agnostic.

\- New networks can be added without redesigning the core.

\- Multiple proofs can coexist for one object/version.

\- Providers can be replaced independently.

\- Registry remains functional without blockchain.

\- Open-source components can be reused rather than duplicated.

\- Ecosystem-specific grants can fund adapters without changing project identity.

\- Vendor and blockchain lock-in are reduced.



\### Tradeoffs



\- Provider normalization requires a stable abstraction layer.

\- Provider-specific metadata must be handled carefully.

\- Verification orchestration becomes slightly more complex when multiple providers coexist.

\- Provider interfaces must remain generic enough for both blockchain and non-blockchain proof systems.



\## Architectural Rule



Open Proof Registry is universal independent infrastructure.



Blockchain is a replaceable, optional external proof layer.



No blockchain implementation may define or control Registry Core architecture.

