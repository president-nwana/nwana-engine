# Media Distribution System

**Status:** data layer implemented 2026-09-27 (migrations 0034, 0035; `src/media-registry.ts`).
**Operating cost:** VERIFIED $0 — existing D1/Workers only, no new services.

## Purpose

Get NWANA news into the maximum number of relevant media outlets, systematically:

```
NWANA object
→ relevant media outlets
→ contacts
→ press release / pitch / news tip
→ appropriate send/submission path
→ status
→ reply
→ follow-up
→ coverage
→ publication link
→ analytics
```

## The four layers (architectural boundary, verified 2026-09-27)

1. **Email V2 mass layer (RunSignup/TicketSignup).** For mass distribution of
   releases to the press list. Allowed recipients: `OPTED_IN` (subscribed to
   the NWANA press list) and `RELATIONSHIP` (partners, known editors) contacts
   only. The published RunSignup API catalog exposes no Email V2, contact-list,
   or campaign-send methods, and the Email V2 UI is dashboard-driven (Send Right
   Now / Schedule). The Machine therefore prepares the audience CSV and the
   exact manual last mile; a person imports and sends in the dashboard.
   **Cold/researched contacts never enter this layer.**
2. **Individual Gmail outreach.** Personal, targeted pitches to specific
   journalists, editors, and producers from the human-operated mailboxes
   `president@nwaofna.org` / `admin@nwaofna.org`. The Machine drafts from an
   approved `media_content_variants` row; a person sends. Per the Email
   Integration Boundary (AGENTS.md): no Gmail API, no bulk through Google
   Workspace, no duplicate Google Workspace contact database. `media_contacts`
   is the press-relations registry (the "verified media registry" required by
   OPERATING_PLAN.md), not a mailbox contact duplicate.
3. **Free press-release platforms.** Verified free 2026-09-27: PRLog
   (unlimited free), PR.com (free basic), OpenPR (1 release / 30 days), PRFree,
   1888PressRelease, FreePressRelease.io; CircleActs (free for nonprofits —
   highest fit for NWANA's 501(c)(3)). Paid-only and excluded: EIN Presswire
   ($149+), 24-7 Press Release ($29+, no free tier), Newswire ($349+).
   **No free platform offers a submission API** — every submission is a manual
   web form. Accounts are created by the owner, never by the Machine.
4. **Direct media entry points.** Newsroom/tip forms, assignment desks, event
   calendars, podcast guest pitches, opinion desks. Seeded from the 2026-09-27
   research catalog (`~/workspace/media/free-pr-entry-points-catalog.md`):
   14 categories, 68 outlets, 51 endpoints, 48 contacts.

Realistic expectation (verified across 2026 comparisons): free platforms give
an SEO archive + shareable URL + small referral traffic, not journalist
engagement. Earned coverage still requires layer 2/4 pitching.

## Data model (D1)

| Table | Role |
|---|---|
| `media_outlets` | Publications, stations, platforms, calendars. `verification_level` per row. |
| `media_contacts` | Journalists / desks. `consent_class`: `OPTED_IN` / `RELATIONSHIP` / `RESEARCHED_COLD`. |
| `media_submission_endpoints` | Where/how to submit: URL, `accepts[]`, `path_type`, `manual_last_mile` steps. |
| `media_content_variants` | Per-article variants: `press_release_full`, `press_release_short`, `pitch_email`, `news_tip`, `event_listing`, `guest_pitch`, `opinion`. Status `DRAFT → READY → APPROVED`. |
| `media_distributions` | Attempts. `channel`: `email_v2` / `gmail_individual` / `platform_form` / `direct_form`. `status`: `prepared → sent/submitted → published → replied → follow_up_done → covered` (or `declined`). `external_url` holds the published link. |
| `media_followups` | Follow-up schedule per attempt (`pending/done/cancelled`). |
| `media_coverage` | Earned coverage: `publication_url`, `published_at`, notes for analytics. |

Extends the existing media pipeline (`media_plans`, `media_articles`,
migration 0029): an article must be `PUBLISHED` before external distribution.

## Matching

`findCandidateEndpoints(db, { categories, geography, accepts, verifiedOnly })`
(`src/media-registry.ts`): object categories + geography → candidate endpoints,
ordered by verification level. Example: a Florida race → categories
`["running","florida"]`, geography `"Florida"` → Florida TV/radio/newsroom
endpoints + national press platforms (no geo limit).

## Verification rule

- `verification_level = 'opened'` — page opened and read during research;
  cleared for immediate use.
- `'search_verified'` / `'third_party'` — require manual browser verification
  before first use. The registry returns them flagged; the Machine must surface
  the flag in any manual last mile it generates. The owner decides per case.

## Manual last mile protocol

For every `platform_form` / `direct_form` / `email_v2` attempt the Machine
generates an exact checklist from `media_submission_endpoints.manual_last_mile`:
the URL, required fields, account requirement (owner-created), what to paste,
and where to record the result (`media_distributions.external_url`,
`media_coverage.publication_url`). The send/submission itself is always human.

## Owner approvals required

- Publishing any variant externally (account creation, form submission, send).
- First use of any `search_verified` / `third_party` endpoint.
- Moving a `RESEARCHED_COLD` contact to `RELATIONSHIP` (after a real exchange).
- Anything that would cost ≥ $1 (none in this design).

## Open gaps (manual work, not blockers)

Miami Herald / Sun Sentinel submission routes, CNN + NPR general tip routes,
HARO signup URL, specific running/fitness podcast guest-pitch forms, Florida
sports desks, student newspapers, university partnerships (all found university
media points require affiliation). Tracked in the catalog file, not in D1.
