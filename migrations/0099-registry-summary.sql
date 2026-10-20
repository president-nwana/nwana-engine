-- 0099: Registry summary layer (cabinet read-path fix, 2026-10-19).
--
-- Why: D1 meters rows EXAMINED, not queries. The Phase 3 Operating Center
-- cabinet recomputed full-registry aggregates (role_instances 265,275
-- rows, territories 35,609, nw_groups 32,333) with repeated COUNT /
-- GROUP BY passes on every screen load; measured on a volume-realistic
-- replica, one People load examined ~1.10M rows and one Budgets load
-- ~1.33M. Together with verification passes this exhausted the free
-- plan's 5,000,000 rows-read/day and blocked ALL Engine reads
-- (error 7500) on 2026-10-19.
--
-- This table holds the precomputed registry aggregates the cabinet
-- screens need, one row per (scope, metric), payload as JSON. It is
-- written ONLY by the controlled refresh operation
-- (refreshRegistrySummary in src/registry-summary.ts, exposed as the
-- owner-gated POST /api/operating-center/registry-summary/refresh).
-- Registry totals are near-static: the refresh runs after a registry
-- mutation (a controlled load) or on owner demand. There is NO daily
-- automatic recount.
--
-- Screens read this table (a dozen rows) plus the small live tables.
-- When a metric row is absent, the affected screen block reports an
-- honest "summary not computed yet" state instead of falling back to a
-- full-registry scan.

CREATE TABLE IF NOT EXISTS registry_summary (
	scope TEXT NOT NULL,        -- 'national' | 'florida' | 'hq'
	metric TEXT NOT NULL,       -- 'territories_by_type' | 'groups_by_status'
	                            -- | 'roles' | 'roles_planned' | 'outreach'
	                            -- | 'received_by_lane'
	payload TEXT NOT NULL,      -- JSON aggregate, shape per metric (see
	                            -- src/registry-summary.ts)
	computed_at TEXT NOT NULL,  -- ISO timestamp of the refresh that wrote it
	PRIMARY KEY (scope, metric)
);
