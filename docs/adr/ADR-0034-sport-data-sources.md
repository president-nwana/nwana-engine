# ADR-0034: Sport data sources — athlete activity ingestion and result verification

Date: 2026-09-27
Status: Accepted (requirement restored; implementation gated per source below)

## Context

The race lifecycle (`src/race-lifecycle.ts`, ADR-0008) references result
verification "via GPX/Strava/Garmin", but the repository contained no
specification, code, or integration for actually obtaining activity data
from sport platforms. The requirement — discussed with the owner as the
future result pipeline — was never written down and was therefore lost
from the project's technical truth. This ADR restores it.

On 2026-09-27 the owner reclassified the two integration classes the
Machine operates:

- **Distribution channels** — site, Meta, LinkedIn, Threads, YouTube,
  Eventbrite, press/media. The Machine pushes NWANA material outward.
- **Data / result sources** — Strava, Garmin, and other sport platforms.
  The Machine pulls athlete activity data inward for verification and
  submission. Strava is explicitly NOT a distribution channel: no Club
  wall posting is wanted or built.

## Decision

Build the pipeline:

```
athlete → sport platform activity → Machine → verification / submission
→ race or Challenge result
```

### What the Machine must do (per connected source)

1. **Athlete OAuth.** The athlete links their sport-platform account to
   their NWANA identity (per-athlete consent; revocable by the athlete).
2. **Activity read.** For a linked athlete the Machine reads: activity
   date, distance, elapsed time, moving time, and any other available
   sport data (GPS track, heart rate, cadence where the source provides
   it). Reads are on-demand and scoped to verification, never bulk
   harvesting.
3. **Binding.** An activity is bound to one NWANA participant and one
   Competition Event or Challenge (athlete selects the activity at
   submission time, or the Machine proposes candidates by date window).
4. **Verification.** The Machine checks: distance matches the event
   distance (within tolerance), activity date falls inside the event
   window, elapsed/moving time is plausible. Pole usage and Nordic
   Walking technique remain human-attested (ADR-0008 boundary unchanged).
5. **Submission.** A verified activity becomes (or supports) a race /
   Challenge result through the existing results flow. Unverifiable
   submissions stay in manual review — never auto-approved on weak data.

### Source access status (verified 2026-09-27)

**Strava — EXTERNAL BLOCKER, API path closed under the $0 rule.**
New Standard-tier developers must hold a Strava subscription
($11.99/month as of 2026-06-01) to access the API; this fails the
standing `Operating cost: VERIFIED $0` gate, so no Strava API
credentials are created. Extended Access tier is exempt from the
subscription but requires Strava review with no guaranteed outcome or
timeline — not a plannable $0 path. The $0 fallback is the existing
manual flow: the athlete exports GPX/TCX from Strava (free, no API) and
uploads the file; the Machine parses and verifies it. Webhook/push
ingestion stays specified but unimplemented until a $0 access path
exists. Revisit only if Strava terms change or the owner separately
approves the subscription.

**Garmin — $0-VIABLE, gated on business approval.**
Per the official Garmin Connect Developer Program FAQ (verified
2026-09-27): no licensing or maintenance fees; business use only;
application status confirmed within two business days; OAuth 2.0; the
Activity API delivers full activity data (FIT/GPX/TCX) via push
(webhooks) or pull. Next step is the owner's: submit the Garmin Connect
Developer Program application for NWANA (only the organization
representative can do this). After approval, build: OAuth app
credentials in the Secure Vault → athlete linking → activity ingestion →
verification per this ADR. Operating cost: VERIFIED $0.

### $0 fallback (both sources, available now)

Manual file upload (GPX/TCX/FIT) by the athlete, parsed and verified by
the Machine against distance/date/plausibility. No platform API needed.

## Consequences

- `src/manual-distribution-packs.ts` no longer lists Strava as a
  channel (removed 2026-09-27): Strava is a data source, not a
  distribution channel.
- Result verification copy ("via GPX/Strava/Garmin") remains accurate:
  GPX upload works now; Strava file export works now; Garmin API is
  pending the owner's program application; Strava API is blocked on cost.
- No Machine runtime, integration, or automation from this ADR may
  carry a recurring cost ≥ $1 without the owner's separate approval
  (standing rule).
- Approval rules unchanged: verification outcomes that change official
  results remain owner-visible; the Machine never fabricates activity
  data.
