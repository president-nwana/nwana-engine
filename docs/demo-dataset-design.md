# Demo Dataset Design — `demo-running-org` Tenant

**Status:** Design only (2026-10-02). Not implemented.
**Tenant:** `demo-running-org` (status=`demo`), 3 business units:
- `demo-running-academy` (ACADEMY)
- `demo-running-events` (EVENTS)
- `demo-running-membership` (MEMBERSHIP)

## 1. Problem Statement

The demo tenant is currently configuration-only: zero assets, zero money
linkage, `not_operating` on all units. For investor presentations this is
insufficient — the demo workspace must show a *polished, representative*
sports organization with events, memberships, academy courses,
participants, revenue, and actions.

Constraints (from owner directive):
- Every demo value visibly labeled **DEMO DATA** / **SAMPLE DATA**.
- Isolated to `tenant_id='demo-running-org'` ONLY.
- **NEVER** enters `money_events` / `money_transactions` (NWANA canonical
  money truth).
- Never affects production totals; never appears in NWANA screens.
- Read-only for `demo_user` role.

## 2. Investigation Findings

### 2.1 Tenant-scoped tables (have `tenant_id`)

Only THREE tables in the entire schema are tenant-scoped:

| Table | `tenant_id` | Notes |
|---|---|---|
| `tenants` | PK | `demo-running-org` exists, status=`demo` |
| `business_units` | FK | 3 demo units exist, all `not_operating`, no assets |
| `tenant_users` | FK | Will hold `demo_user` rows (migration 0057) |

**Critical:** `money_events`, `money_transactions`, `revenue_objects`,
`revenue_object_actions`, `memberorg_memberships`, `series_registrations`,
and ALL other operational tables have **NO `tenant_id` column**. They are
NWANA-production tables. Demo data placed in any of them would pollute
NWANA canonical truth.

### 2.2 How the portal renders business units

- `GET /portal/unit/<unit_id>` → `renderPortalUnitHtml` →
  `GET /api/portal/units/<unit_id>` → `getBusinessUnitDetail(db, tenantId, unitId)`
  (tenantId server-derived from token, never URL).
- `getBusinessUnitDetail` returns: unit fields, `assets[]` (from
  `revenue_objects` via `connected_assets`), `money` (rollup of asset
  money, or null), `audience` (via `deriveAudience`), `connected_integrations`,
  `next_actions[]`.
- Client renders via `window.__unitRender.body(unit, {links:[], backHtml:'',
  tenantLine:'', engineEmpty:false})` in `src/oc-unit-body.ts`.
- Portal API currently exposes only GET routes; ADR-0048 already enforces
  non-GET → 403 for preview identity (same pattern applies to demo_user).

### 2.3 Current demo unit configuration

All three units: `operating_status='not_operating'`,
`connected_assets='[]'`, `connected_integrations='[]'`,
`money_state=NULL`, `audience_state=NULL`, `revenue_model='unknown'`.
Next-actions contain placeholder text ("Demo tenant: connect a ... source
to activate this unit").

## 3. Design Decision: Dedicated Demo Tables

**Do NOT reuse NWANA operational tables.** Create six new tables, all
tenant-scoped with a hard `CHECK (tenant_id = 'demo-running-org')`
constraint. This makes cross-tenant leakage *structurally impossible* —
even a buggy query missing the tenant filter cannot return another
tenant's rows, because no other tenant's rows can exist.

### 3.1 Schema

```sql
-- Demo dataset for the demo-running-org tenant (investor presentations).
-- ISOLATION: every table carries tenant_id with a CHECK constraint
-- pinning it to 'demo-running-org'. These tables are NEVER read by
-- NWANA money/revenue/production code paths. They are seed-only:
-- no write API routes exist; demo_user is read-only by role.

CREATE TABLE IF NOT EXISTS demo_events (
    event_id        TEXT PRIMARY KEY,          -- e.g. 'demo-evt-spring5k-2026'
    tenant_id       TEXT NOT NULL DEFAULT 'demo-running-org'
                    CHECK (tenant_id = 'demo-running-org')
                    REFERENCES tenants(tenant_id),
    business_unit_id TEXT NOT NULL DEFAULT 'demo-running-events'
                    REFERENCES business_units(business_unit_id),
    name            TEXT NOT NULL,             -- 'Spring 5K Fun Run (SAMPLE DATA)'
    event_type      TEXT NOT NULL,             -- 'race' | 'fun_run' | 'marathon' | 'clinic'
    event_date      TEXT,                      -- ISO date
    location        TEXT,                      -- 'Sample City, ST (SAMPLE DATA)'
    distance        TEXT,                      -- '5K'
    status          TEXT NOT NULL DEFAULT 'upcoming'
                    CHECK (status IN ('upcoming','ongoing','completed','cancelled')),
    participants_count INTEGER NOT NULL DEFAULT 0,
    revenue_cents   INTEGER,                   -- sample gross, labeled DEMO
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS demo_memberships (
    membership_id   TEXT PRIMARY KEY,          -- e.g. 'demo-mem-0001'
    tenant_id       TEXT NOT NULL DEFAULT 'demo-running-org'
                    CHECK (tenant_id = 'demo-running-org')
                    REFERENCES tenants(tenant_id),
    business_unit_id TEXT NOT NULL DEFAULT 'demo-running-membership'
                    REFERENCES business_units(business_unit_id),
    member_name     TEXT NOT NULL,             -- 'Sample Member 001 (SAMPLE DATA)'
    level_name      TEXT NOT NULL,             -- 'Annual Runner (SAMPLE DATA)'
    level_type      TEXT,                      -- 'annual' | 'lifetime' | 'elite' | 'complimentary'
    amount_paid_cents INTEGER NOT NULL DEFAULT 0,
    is_paid         INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0,1)),
    start_date      TEXT,
    end_date        TEXT,
    status          TEXT NOT NULL DEFAULT 'UNKNOWN'
                    CHECK (status IN ('ACTIVE','EXPIRED','FUTURE','UNKNOWN'))
);

CREATE TABLE IF NOT EXISTS demo_academy_courses (
    course_id       TEXT PRIMARY KEY,          -- e.g. 'demo-course-beginner'
    tenant_id       TEXT NOT NULL DEFAULT 'demo-running-org'
                    CHECK (tenant_id = 'demo-running-org')
                    REFERENCES tenants(tenant_id),
    business_unit_id TEXT NOT NULL DEFAULT 'demo-running-academy'
                    REFERENCES business_units(business_unit_id),
    title           TEXT NOT NULL,             -- 'Beginner Running Foundations (SAMPLE DATA)'
    level           TEXT,                      -- 'beginner' | 'intermediate' | 'advanced'
    duration_weeks  INTEGER,
    price_cents     INTEGER NOT NULL DEFAULT 0,
    enrolled_count  INTEGER NOT NULL DEFAULT 0,
    instructor      TEXT,                      -- 'Sample Coach (SAMPLE DATA)'
    status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','in_progress','completed'))
);

CREATE TABLE IF NOT EXISTS demo_participants (
    participant_id  TEXT PRIMARY KEY,          -- e.g. 'demo-part-0001'
    tenant_id       TEXT NOT NULL DEFAULT 'demo-running-org'
                    CHECK (tenant_id = 'demo-running-org')
                    REFERENCES tenants(tenant_id),
    display_name    TEXT NOT NULL,             -- 'Sample Runner 001 (SAMPLE DATA)'
    -- Nullable FKs: a participant may join events, courses, or hold a membership.
    event_id        TEXT REFERENCES demo_events(event_id),
    course_id       TEXT REFERENCES demo_academy_courses(course_id),
    membership_id   TEXT REFERENCES demo_memberships(membership_id),
    role            TEXT,                      -- 'runner' | 'student' | 'member' | 'volunteer'
    registered_at   TEXT
);

CREATE TABLE IF NOT EXISTS demo_revenue (
    -- SAMPLE revenue for investor display. NEVER money_events.
    -- No source_system, no source_transaction_id: this is explicitly
    -- NOT canonical money. It is invisible to /api/operating-center/money/*.
    revenue_id      TEXT PRIMARY KEY,          -- e.g. 'demo-rev-0001'
    tenant_id       TEXT NOT NULL DEFAULT 'demo-running-org'
                    CHECK (tenant_id = 'demo-running-org')
                    REFERENCES tenants(tenant_id),
    business_unit_id TEXT NOT NULL
                    REFERENCES business_units(business_unit_id),
    category        TEXT NOT NULL              -- 'event_registration' | 'membership' | 'course_fee' | 'donation'
                    CHECK (category IN ('event_registration','membership','course_fee','donation')),
    label           TEXT NOT NULL,             -- 'Spring 5K registrations (SAMPLE DATA)'
    amount_cents    INTEGER NOT NULL,
    occurred_at     TEXT,
    linked_event_id TEXT REFERENCES demo_events(event_id),
    linked_membership_id TEXT REFERENCES demo_memberships(membership_id),
    linked_course_id TEXT REFERENCES demo_academy_courses(course_id)
);

CREATE TABLE IF NOT EXISTS demo_actions (
    action_id       TEXT PRIMARY KEY,          -- e.g. 'demo-act-0001'
    tenant_id       TEXT NOT NULL DEFAULT 'demo-running-org'
                    CHECK (tenant_id = 'demo-running-org')
                    REFERENCES tenants(tenant_id),
    business_unit_id TEXT NOT NULL
                    REFERENCES business_units(business_unit_id),
    title           TEXT NOT NULL,             -- 'Follow up with Spring 5K sponsors (SAMPLE DATA)'
    action_type     TEXT,                      -- 'follow_up' | 'outreach' | 'planning' | 'review'
    due_date        TEXT,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','done')),
    assignee        TEXT                       -- 'Sample Coordinator (SAMPLE DATA)'
);

CREATE INDEX IF NOT EXISTS idx_demo_events_unit ON demo_events(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_demo_memberships_unit ON demo_memberships(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_demo_courses_unit ON demo_academy_courses(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_demo_participants_unit ON demo_participants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_demo_revenue_unit ON demo_revenue(business_unit_id, category);
CREATE INDEX IF NOT EXISTS idx_demo_actions_unit ON demo_actions(business_unit_id, status);
```

### 3.2 Why NOT existing tables

| Rejected option | Reason |
|---|---|
| `money_events` / `money_transactions` | No `tenant_id`; NWANA canonical money truth. Any demo row would inflate production revenue totals. **Forbidden.** |
| `revenue_objects` | No `tenant_id`; NWANA's Executable Revenue Inventory. Demo "assets" here would appear in NWANA revenue screens. **Forbidden.** |
| `memberorg_memberships` | No `tenant_id`; NWANA MemberOrg operational truth. **Forbidden.** |
| `series_registrations` | No `tenant_id`; NWANA race series data. **Forbidden.** |
| `business_units.connected_assets` | Points to `revenue_objects` keys — same pollution problem. Leave `[]` for demo units. |
| `business_units.money_state` | Override *note* only, not structured data. Insufficient for a polished demo. |

## 4. Sample Data Inventory

All names/values carry `(SAMPLE DATA)` suffix. Amounts chosen for a clean
investor narrative. **Nothing here is real.**

### 4.1 Events (`demo_events`) — 4 records, unit `demo-running-events`

| event_id | name | type | date | location | distance | status | participants | revenue |
|---|---|---|---|---|---|---|---|---|
| `demo-evt-spring5k-2026` | Spring 5K Community Run (SAMPLE DATA) | fun_run | 2026-04-18 | Sample City, ST (SAMPLE DATA) | 5K | completed | 342 | $8,550.00 |
| `demo-evt-summer10k-2026` | Summer Sunset 10K (SAMPLE DATA) | race | 2026-07-11 | Sample City, ST (SAMPLE DATA) | 10K | completed | 518 | $15,540.00 |
| `demo-evt-fallhalf-2026` | Autumn Half Marathon (SAMPLE DATA) | race | 2026-10-24 | Sample City, ST (SAMPLE DATA) | 21.1K | upcoming | 0 (registration open) | $0.00 projected |
| `demo-evt-winterclinic-2026` | Winter Form Clinic (SAMPLE DATA) | clinic | 2026-12-05 | Sample City, ST (SAMPLE DATA) | — | upcoming | 0 | $0.00 projected |

### 4.2 Memberships (`demo_memberships`) — 6 records, unit `demo-running-membership`

Mix of paid and free (mirrors the NWANA $0-record semantics: free records
are real issuances, shown, never revenue).

| membership_id | member | level | type | paid | dates | status |
|---|---|---|---|---|---|---|
| `demo-mem-0001` | Sample Member 001 (SAMPLE DATA) | Annual Runner (SAMPLE DATA) | annual | $45.00 | 2026-01-15 → 2027-01-15 | ACTIVE |
| `demo-mem-0002` | Sample Member 002 (SAMPLE DATA) | Annual Runner (SAMPLE DATA) | annual | $45.00 | 2026-03-02 → 2027-03-02 | ACTIVE |
| `demo-mem-0003` | Sample Member 003 (SAMPLE DATA) | Family Plan (SAMPLE DATA) | annual | $80.00 | 2026-02-10 → 2027-02-10 | ACTIVE |
| `demo-mem-0004` | Sample Member 004 (SAMPLE DATA) | Elite Athlete (SAMPLE DATA) | elite | $0.00 | 2026-01-01 → 2026-12-31 | ACTIVE |
| `demo-mem-0005` | Sample Member 005 (SAMPLE DATA) | Lifetime Member (SAMPLE DATA) | lifetime | $0.00 | 2025-06-01 → NULL | ACTIVE |
| `demo-mem-0006` | Sample Member 006 (SAMPLE DATA) | Annual Runner (SAMPLE DATA) | annual | $45.00 | 2025-01-20 → 2026-01-20 | EXPIRED |

Summary line for UI: **"6 membership records · 4 paid · 2 free · $215.00 sample revenue"**

### 4.3 Academy courses (`demo_academy_courses`) — 3 records, unit `demo-running-academy`

| course_id | title | level | weeks | price | enrolled | instructor | status |
|---|---|---|---|---|---|---|---|
| `demo-course-foundations` | Running Foundations (SAMPLE DATA) | beginner | 8 | $120.00 | 48 | Sample Coach Rivera (SAMPLE DATA) | in_progress |
| `demo-course-halfprep` | Half Marathon Prep (SAMPLE DATA) | intermediate | 12 | $180.00 | 32 | Sample Coach Chen (SAMPLE DATA) | scheduled |
| `demo-course-youth` | Youth Striders (SAMPLE DATA) | beginner | 6 | $0.00 | 25 | Sample Coach Rivera (SAMPLE DATA) | scheduled |

### 4.4 Participants (`demo_participants`) — 12 records

Sample participants linked to events/courses/memberships above, e.g.:
- `demo-part-0001` … `demo-part-0006`: runners in `demo-evt-spring5k-2026`
- `demo-part-0007` … `demo-part-0009`: students in `demo-course-foundations`
- `demo-part-0010`, `demo-part-0011`: members `demo-mem-0001`, `demo-mem-0002`
- `demo-part-0012`: volunteer at `demo-evt-summer10k-2026`

Display names: `Sample Runner 001 (SAMPLE DATA)`, etc.

### 4.5 Revenue (`demo_revenue`) — 7 records (SAMPLE, never canonical)

| revenue_id | unit | category | label | amount | date |
|---|---|---|---|---|---|
| `demo-rev-0001` | events | event_registration | Spring 5K registrations (SAMPLE DATA) | $8,550.00 | 2026-04-18 |
| `demo-rev-0002` | events | event_registration | Summer 10K registrations (SAMPLE DATA) | $15,540.00 | 2026-07-11 |
| `demo-rev-0003` | membership | membership | Annual memberships Q1 (SAMPLE DATA) | $170.00 | 2026-03-31 |
| `demo-rev-0004` | membership | membership | Annual memberships Q2 (SAMPLE DATA) | $45.00 | 2026-06-30 |
| `demo-rev-0005` | academy | course_fee | Running Foundations tuition (SAMPLE DATA) | $5,760.00 | 2026-09-01 |
| `demo-rev-0006` | academy | course_fee | Half Marathon Prep early-bird (SAMPLE DATA) | $1,440.00 | 2026-09-15 |
| `demo-rev-0007` | events | donation | Summer 10K charity add-ons (SAMPLE DATA) | $1,230.00 | 2026-07-11 |

**Demo total: $32,735.00 SAMPLE revenue** — displayed ONLY in the demo
workspace, summed at read time from `demo_revenue`.

### 4.6 Actions (`demo_actions`) — 5 records

| action_id | unit | title | type | due | status | assignee |
|---|---|---|---|---|---|---|
| `demo-act-0001` | events | Confirm Autumn Half Marathon permits (SAMPLE DATA) | planning | 2026-08-15 | in_progress | Sample Coordinator (SAMPLE DATA) |
| `demo-act-0002` | events | Follow up with Summer 10K sponsors (SAMPLE DATA) | follow_up | 2026-08-01 | open | Sample Coordinator (SAMPLE DATA) |
| `demo-act-0003` | membership | Send renewal reminders — Q4 expiries (SAMPLE DATA) | outreach | 2026-10-01 | open | Sample Membership Lead (SAMPLE DATA) |
| `demo-act-0004` | academy | Publish Winter Form Clinic curriculum (SAMPLE DATA) | planning | 2026-11-01 | open | Sample Coach Rivera (SAMPLE DATA) |
| `demo-act-0005` | academy | Review Youth Striders scholarship slots (SAMPLE DATA) | review | 2026-09-20 | done | Sample Coach Chen (SAMPLE DATA) |

## 5. Demo Workspace UI

### 5.1 Data flow (read-only)

```
demo_user login → session → /portal (demo tenant)
  → GET /api/portal/session            (existing; tenant from token)
  → GET /api/portal/units/<unit_id>    (existing; extended — see 5.2)
```

No new auth mechanism. The demo user is a `tenant_users` row with
`role='demo_user'`, `tenant_id='demo-running-org'`, `unit_ids` = all three
demo units. They use the **same portal renderer** as external tenants.

### 5.2 Unit detail extension

`getBusinessUnitDetail()` gains a `demo` section **only when**
`tenantId === 'demo-running-org'`:

```ts
interface DemoUnitData {
  is_demo: true;
  banner: "SAMPLE DATA — for demonstration only. Not real revenue, members, or events.";
  events: DemoEvent[];
  memberships: DemoMembership[];
  membership_summary: { total: number; paid: number; free: number; revenue_cents: number };
  courses: DemoCourse[];
  participants: DemoParticipant[];
  revenue: DemoRevenue[];
  revenue_total_cents: number;
  actions: DemoAction[];
}
```

The shared renderer (`src/oc-unit-body.ts`) renders a **DEMO DATA panel**
at the top of the unit body when `u.demo?.is_demo`:

- Slim amber banner: "⚠ SAMPLE DATA — demonstration only. Not real."
- Per-record lists with `(SAMPLE DATA)` labels already in the values.
- Revenue shown as "Sample revenue (not verified, not canonical)" —
  deliberately DIFFERENT vocabulary from NWANA's "verified revenue".

NWANA units never receive this section (`tenantId !== 'demo-running-org'`
→ `demo: null`), so the panel cannot render there.

### 5.3 What the investor sees (per unit)

**Events unit** (`demo-running-events`):
- DEMO banner
- 4 events with dates, distances, participant counts, statuses
- Sample revenue: $24,090.00 (registrations) + $1,230.00 (donations)
- 3 next actions

**Membership unit** (`demo-running-membership`):
- DEMO banner
- "6 membership records · 4 paid · 2 free · $215.00 sample revenue"
- Per-record: level, paid/free, dates, status
- 1 next action

**Academy unit** (`demo-running-academy`):
- DEMO banner
- 3 courses with enrollment, pricing, instructors, statuses
- Sample revenue: $7,200.00 (tuition)
- 2 next actions

**Landing** (`/portal`): 3 unit cards (Academy, Events, Membership) —
visually distinct from NWANA's 6 modules, which is exactly the pitch
contrast the owner wants.

### 5.4 Status upgrades

Update the three demo `business_units` rows:
`operating_status`: `not_operating` → `pilot`,
`revenue_model`: `unknown` → `'sample / demonstration only'`,
`next_actions`: keep (replaced by `demo_actions` in UI, but harmless).

Do NOT set `connected_assets` (would link `revenue_objects`).

## 6. Isolation Guarantees

| Guarantee | Mechanism |
|---|---|
| Demo rows can't exist for another tenant | `CHECK (tenant_id = 'demo-running-org')` on every demo table — enforced by SQLite, not application code |
| Demo revenue never in NWANA money truth | `demo_revenue` is a separate table; zero code paths read it except the demo unit-detail loader. `money_events` untouched. |
| NWANA money API unaffected | `/api/operating-center/money/*` reads `money_events` only; demo tables not referenced |
| NWANA screens unaffected | Unit-detail `demo` section gated on `tenantId === 'demo-running-org'`; NWANA tenant renders `demo: null` |
| Demo user can't mutate | `demo_user` role: portal API rejects non-GET (extend ADR-0048 rule from `preview` to `demo_user`); no write routes exist for demo tables |
| Demo user can't see NWANA | Tenant derived server-side from token; `demo-running-org` token resolves only demo units (existing ADR-0047 isolation) |
| No synthetic NWANA data | Demo tables are namespaced `demo_*`; a `grep` for `demo_` finds every touchpoint |

## 7. Migration File Draft

`migrations/0058-demo-dataset.sql` (design draft — to be finalized at
implementation):

```sql
-- Demo dataset for investor presentations (2026-10-02).
--
-- DESIGN PRINCIPLES (owner directive):
--  1. Every demo table is pinned to tenant_id='demo-running-org' by CHECK.
--  2. demo_revenue is SAMPLE revenue. It is NOT money_events and is NEVER
--     read by /api/operating-center/money/* or any NWANA revenue path.
--  3. Seed-only: no API write routes. demo_user is read-only.
--  4. Every human-visible value carries a (SAMPLE DATA) suffix.

CREATE TABLE IF NOT EXISTS demo_events (...);       -- see §3.1
CREATE TABLE IF NOT EXISTS demo_memberships (...);  -- see §3.1
CREATE TABLE IF NOT EXISTS demo_academy_courses (...); -- see §3.1
CREATE TABLE IF NOT EXISTS demo_participants (...); -- see §3.1
CREATE TABLE IF NOT EXISTS demo_revenue (...);      -- see §3.1
CREATE TABLE IF NOT EXISTS demo_actions (...);     -- see §3.1

-- Indexes (see §3.1)

-- Seed: events (§4.1)
INSERT OR IGNORE INTO demo_events (...) VALUES (...), ...;

-- Seed: memberships (§4.2)
INSERT OR IGNORE INTO demo_memberships (...) VALUES (...), ...;

-- Seed: academy courses (§4.3)
INSERT OR IGNORE INTO demo_academy_courses (...) VALUES (...), ...;

-- Seed: participants (§4.4)
INSERT OR IGNORE INTO demo_participants (...) VALUES (...), ...;

-- Seed: revenue (§4.5)
INSERT OR IGNORE INTO demo_revenue (...) VALUES (...), ...;

-- Seed: actions (§4.6)
INSERT OR IGNORE INTO demo_actions (...) VALUES (...), ...;

-- Mark demo units as pilot with sample revenue model.
UPDATE business_units
SET operating_status = 'pilot',
    revenue_model = 'sample / demonstration only'
WHERE tenant_id = 'demo-running-org';
```

Full INSERT statements to be generated at implementation time from §4.

## 8. Implementation Checklist (for parent agent)

1. [ ] Write `migrations/0058-demo-dataset.sql` (schema + seeds from §3.1/§4).
2. [ ] Add `DemoUnitData` loader in `src/lib/tenants.ts`
      (`getDemoUnitData(db, unitId)`), called from `getBusinessUnitDetail`
      only when `tenantId === 'demo-running-org'`.
3. [ ] Extend `UNIT_BODY_SCRIPT` in `src/oc-unit-body.ts` with the DEMO
      DATA panel (banner + sections), rendered when `u.demo?.is_demo`.
4. [ ] Extend portal API read-only rule: `demo_user` non-GET → 403
      (same as ADR-0048 preview rule in `src/index.ts`).
5. [ ] Create `demo_user` tenant_users row (email/password per migration
      0057) for investor login; `unit_ids` = all three demo units.
6. [ ] Update the three demo `business_units` rows (status → `pilot`).
7. [ ] Tests: demo data isolation (no `demo_*` rows readable via NWANA
      paths), `CHECK` constraint enforcement, read-only enforcement,
      money API totals unchanged ($365).
8. [ ] Operating cost: VERIFIED $0 (no new services; D1 tables only).

## 9. Open Questions (deferred to implementation)

- Exact demo login email (e.g. `demo@nwaofna.org`) — owner decision.
- Whether the demo portal should hide "Powered by NWANA Engine"
  (`white_label=1` already set on the demo tenant — portal respects it).
- Whether demo revenue should show per-category breakdown or total only
  (recommend: both — total hero stat + category rows).
