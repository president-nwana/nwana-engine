# NWANA Machine Purpose

This file defines what NWANA Machine exists to accomplish. Read it before technical state, Registry data, or architecture documents.

## Mission

NWANA Machine is the growth, revenue, fundraising, sponsorship, partnership, and distribution engine for the connected NWANA ecosystem.

Its core operating loop is:

OBJECT -> MONEY OR CONVERSION -> AUDIENCE -> SPONSORSHIP -> DISTRIBUTION -> NEXT OBJECT

For every NWANA object, the machine must determine:

1. what the object is;
2. what value, revenue, participation, funding, or organizational result it can create;
3. who should buy, join, support, sponsor, fund, host, or distribute it;
4. which sponsor and partner categories fit it;
5. which channels and actions should be used;
6. what response occurred;
7. which next NWANA object or action should follow.

The machine must create actions through appropriate channels such as email, social media, press, Google Ads, sellers, sponsorship platforms, partners, fundraising, and direct outreach. It must observe results and support follow-up, renewal, and cross-sell.

## Connected NWANA ecosystem

The machine must support the relationships among:

- Competition Series and individual Competition Events;
- Challenges;
- Academy Courses;
- Certification Pathways;
- Athlete, Professional, and NW Group Licenses;
- NW Group Individual, NW Groups, and RECOGNIZED Groups;
- Funds and Donation Campaigns;
- Sponsorship Assets;
- Partner Opportunities and Partner Network;
- NWANA Events;
- Organizer, qualification, recognition, and sanctioning pathways;
- Athletes, official Results, Standings, Winners Circle, Elite Athletes, and Rankings;
- Media, Volunteers, Safe Sport, Anti-Doping, and public-trust assets.

The value of the system comes from the connections among these assets. Examples include:

- Course -> Certification -> Professional License -> Instructor -> Group;
- Group -> Participants -> Programs -> Events -> Competitions -> Fundraising and Sponsorship;
- Competition -> Registrations -> Results -> Rankings -> Next Race or Championship;
- Sponsor -> Asset -> Agreement -> Visibility -> Renewal or Cross-sell;
- Partner -> Funding, Location, Audience, Equipment, Expertise, or Distribution -> Program, Group, Event, or Competition;
- Donor -> Fund -> Academy Credit -> Instructor -> Group -> Participants.

## First operational priority

Before creating new mass programs, connect the existing NWANA revenue and distribution assets to the Rules and Distribution Engine in this order:

1. Series 2026;
2. Academy;
3. Licenses;
4. NW Groups;
5. Instructor Growth Fund;
6. Sponsorship;
7. Partner Network.

After those existing assets operate inside the connected machine, the next growth wave is:

1. Free Challenges;
2. Series 2027;
3. U.S. Championships;
4. Continental Championships.

Registry work is supporting work, not the product goal. Reconcile or add an external object when it is needed by a real rule, processing path, distribution action, or verified system relationship. Do not perform mass Registry population as a substitute for implementing the operating loop.

## Series 2026 legacy boundary

Series 2026 already has a separate working Windows/PowerShell process created before NWANA Engine. According to the project owner, the existing files receive competition results, assign speed levels, and one component publishes through Meta.

Treat this as an existing legacy production process:

- do not rewrite it merely to move it into NWANA Engine;
- do not alter its 2026 level formulas without explicit verification and approval;
- do not create duplicate Meta publication from NWANA Engine;
- preserve Series 2026 as its own versioned processing behavior;
- NWANA Engine may ingest or use its finalized outputs for relationships, standings, rankings, media, sponsorship, and later actions.

The exact filenames, invocation order, inputs, outputs, dependencies, and credential handling must be documented only after the actual files are inspected. Do not infer those details from screenshots.

## Series 2027 direction

Series 2027 will use a new, substantially expanded and changed level system implemented inside NWANA Engine.

Series 2027 must have its own processing profile. It must not inherit the Series 2026 formulas automatically. Challenges, Championships, and other competition formats may also require their own profiles.

## Decision test

Before implementing or committing work, answer in plain language:

- Which real NWANA object or relationship does this serve?
- What audience, conversion, revenue, sponsorship, funding, distribution, or next action does it enable?
- Why is this the smallest safe step toward the operating loop?
- What verified evidence supports the change?

If those answers are missing, stop and do not commit the work.
