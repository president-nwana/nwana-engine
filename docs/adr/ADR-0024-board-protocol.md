# ADR-0024: Board protocol completion, uploads, and activity feed

Date: 2026-09-22. Owner directive (three parts):
1. By every Sunday 2:00 PM New York time the machine forms the meeting
   protocol from all pending submissions.
2. After the meeting the machine processes the protocol and starts the
   work it is authorized and capable of doing.
3. Board members upload files; the machine routes each file (contacts to
   RunSignup staging, tasks to tracked work, discussion material to the
   meeting agenda, news material to media drafts).

(ADR-0022 was taken by the Funds dedicated page, built in parallel.)

## Decision

### 1. Event-driven protocol formation (no cron)

The weekly meeting pattern does NOT authorize timers, polling, cron, or
recurring background work (owner decision 2026-09-19, SYSTEM_STATE.md).
Instead:

- `reconcileProtocolIfDue` runs on owner-authorized operating-center
  activity (the overview call, i.e. every owner visit to the main screen).
  On the first owner interaction of the week it ensures the coming Sunday's
  meeting exists and forms its protocol if not already formed.
- Submissions arriving during the week auto-attach to that meeting on
  creation (ADR-0020), so by Sunday 2:00 PM the protocol is complete.
- `POST /api/board/protocol/form` lets the owner form (or re-form) the
  protocol explicitly at any time.

Honest limitation, shown in the UI: if the owner does not open the
operating center during a week and never calls the manual endpoint, no
protocol forms that week. The machine does not independently fire at
2:00 PM on its own; it acts when the owner acts.

### 2. Post-meeting processing

`processProtocol` runs on meeting close (and via
`POST /api/board/protocol/process`): every CONFIRMED decision becomes (or
keeps) a tracked work item; when the decision recorded a `machine_action`
(`PREPARE_NEWS_DRAFT`, `PREPARE_EMAIL_DRAFT`) the machine prepares the
draft and files a `decision_request` for owner review. Sends, money,
signatures, and external actions stay human-confirmed: the machine
prepares, never executes.

### 3. Uploads with machine routing

- `POST /api/operating-center/uploads` (multipart). Accepted: CSV, TXT,
  MD, TSV, JSON. Maximum 512 KB.
- Validation happens BEFORE routing: unsupported types and oversized
  files are rejected with a clear error, never silently routed.
- The complete accepted content is stored (no silent truncation).
- `classifyUpload` routes by content and filename: contact lists (emails)
  to RunSignup staging, task lists to tracked work, discussion material to
  the meeting agenda, news material to media drafts. Unclassifiable files
  go to the meeting agenda as source material flagged NEEDS_OWNER. Nothing
  uploaded is ever silently dropped.
- RunSignup contacts: the machine parses, deduplicates, and stages an
  import-ready CSV served from a dedicated download endpoint
  (`/api/operating-center/uploads/<id>/staged-contacts.csv`, RFC 4180
  escaped). The actual import happens by hand in the RunSignup Email
  Marketing dashboard (ID 513494); the machine never imports on its own.
  Contact data never appears in ordinary list views.

### 4. Activity feed: what is happening, what is new, what requires reading

- `GET /api/operating-center/activity` builds the feed from `audit_events`
  plus the queues needing owner eyes (pending decision requests,
  unrouted uploads). Newest first; `requires_reading` flags items that
  need the owner's attention.
- The main page shows "Requires reading" and "What is new" sections.
- Read acknowledgement is durable and owner-wide (D1, not browser
  storage). There is no verified per-member identity, so the feed does
  not claim per-member read state.

## Consequences

- New tables: `board_uploads` (migration 0028). `media_plans` /
  `media_articles` from ADR-0021.
- New API: protocol form/process, uploads (POST/GET/download), activity
  feed. All owner-key protected.
- The main page gains: activity panel, media summary card, uploads panel.
- Board screen shows: what is happening (activity), what is new (feed),
  what requires reading (flagged items), what each member can do (submit
  to the Board, upload files, review decisions).
