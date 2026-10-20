// Registry summary layer (cabinet read-path fix, 2026-10-19; round 2
// the same day: single-pass rebuild + incremental loader deltas).
//
// D1 meters rows EXAMINED, not queries. The Phase 3 cabinet recomputed
// full-registry aggregates (role_instances 265,275 rows, territories
// 35,609, nw_groups 32,333) on every screen load; measured on a
// volume-realistic replica, one People load examined ~1.10M rows and
// one Budgets load ~1.33M, which (with verification passes) burned the
// free plan's 5M rows-read/day on 2026-10-19 and blocked all reads.
//
// This module is the fix: the registry aggregates the cabinet needs are
// precomputed into registry_summary (migration 0099), one JSON payload
// per (scope, metric). Screens read those few rows plus the small live
// tables (prospects, sends, replies, money).
//
// HOW THE SUMMARY STAYS CURRENT — two paths, in order of preference:
//
// 1. INCREMENTAL (the normal path). Registry data changes ONLY through
//    controlled loads: the Engine worker has no registry-mutating code
//    (verified 2026-10-19: no INSERT / UPDATE / DELETE against
//    territories, nw_groups, role_instances or role_templates anywhere
//    in src/); loads are external scripts (Phase 1B pattern:
//    research/phase1b-territory-foundation/apply/run_load.py). A loader
//    knows every row it inserts, so it maintains the summary itself via
//    applyRegistryDelta() below — or, for a wholesale load, by writing
//    payloads computed from its own manifest via
//    writeRegistrySummaryPayloads() — IN THE SAME OPERATION as its
//    inserts. See the atomicity note on applyRegistryDelta.
//
// 2. FULL REBUILD (emergency / audit only). refreshRegistrySummary()
//    recomputes all 13 payloads from the live tables at ONE pass over
//    each big table (conditional aggregation over a single GROUP BY
//    scan per table): ~339k rows examined at Phase 1B volumes, down
//    from the round-1 rebuild's 2,826,132 (measured on the volume
//    replica; REPORT-ROUND2.md). It is exposed only through the
//    owner-gated refresh endpoint, is never scheduled anywhere, and
//    its response is cost-labelled (pass counts + estimate).
//
// When a metric row is absent, consumers render that block's honest
// empty state (zeros + the registry_summary meta below) instead of
// falling back to a full-registry scan.

import { laneForEventType } from "./operating-center-money";

const num = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

const FLORIDA_TERRITORY_ID = "terr-st-12";
// The Florida subtree: the state territory itself plus every territory
// recorded under Florida's state FIPS. Phase 2 semantics — every
// Florida aggregate in the Engine uses exactly this predicate.
const FL_SUBTREE = `IN (SELECT territory_id FROM territories WHERE territory_id = 'terr-st-12' OR state_fips = '12')`;
// MATERIALIZED is load-bearing: the subtree is computed exactly once
// per statement that uses this CTE, never flattened into per-row
// probes and never re-materialized per scalar subquery.
const FL_CTE = `WITH fl AS MATERIALIZED (SELECT territory_id FROM territories WHERE territory_id = 'terr-st-12' OR state_fips = '12')`;

const RECEIVED_EVENT_TYPES = [
	"donation_received",
	"sponsorship_received",
	"contract_payment_received",
	"grant_received",
	"registration_paid",
	"license_purchased",
	"license_renewed",
	"course_purchased",
] as const;

const FLORIDA_BY_TEMPLATE_LIMIT = 15;
const HQ_BY_TEMPLATE_LIMIT = 100;

// ---------------------------------------------------------------------------
// Payload shapes (one per metric; stored as JSON in registry_summary).
// ---------------------------------------------------------------------------

export interface TerritoriesByTypePayload {
	total: number;
	by_type: Record<string, number>;
}

export interface GroupsByStatusPayload {
	total: number;
	by_status: Record<string, number>;
	defaults: number;
	forming: number;
	active: number;
}

export interface RolesNationalPayload {
	total: number;
	by_status: Record<string, number>;
	by_scope: Record<string, number>;
}

export interface RoleTemplateCount {
	template_id: string;
	title: string | null;
	n: number;
}

export interface RolesFloridaPayload {
	total: number;
	by_scope: Record<string, number>;
	by_template: RoleTemplateCount[];
}

export interface RolesHqPayload {
	by_template: Array<RoleTemplateCount & { scope_type: string | null }>;
}

export interface RolesPlannedPayload {
	roles_planned: number;
	by_scope: Record<string, number>;
}

export interface OutreachNationalPayload {
	prospects_total: number;
	prospects_by_tier: Record<string, number>;
	prospects_enrolled: number;
}

export interface OutreachFloridaPayload {
	prospects_total: number;
	prospects_by_track: Record<string, number>;
	prospects_sent: number;
	prospects_replies: number;
	prospects_qualified: number;
}

export interface ReceivedByLanePayload {
	lanes: Array<{ lane: string; events: number; cents: number }>;
}

export type SummaryScope = "national" | "florida" | "hq";
export type SummaryMetric =
	| "territories_by_type"
	| "groups_by_status"
	| "roles"
	| "roles_planned"
	| "outreach"
	| "received_by_lane";

const ALL_METRIC_KEYS: Array<readonly [SummaryScope, SummaryMetric]> = [
	["national", "territories_by_type"],
	["florida", "territories_by_type"],
	["national", "groups_by_status"],
	["florida", "groups_by_status"],
	["national", "roles"],
	["florida", "roles"],
	["hq", "roles"],
	["national", "roles_planned"],
	["florida", "roles_planned"],
	["hq", "roles_planned"],
	["national", "outreach"],
	["florida", "outreach"],
	["florida", "received_by_lane"],
];

// ---------------------------------------------------------------------------
// Read side.
// ---------------------------------------------------------------------------

export interface RegistrySummaryEntry {
	payload: unknown;
	computed_at: string;
}

export interface RegistrySummaryMeta {
	status: "ok" | "partial" | "missing";
	computed_at: string | null;
	note: string;
}

const MISSING_NOTE =
	"Registry totals come from the precomputed registry summary (migration 0099). One or more summary metrics have not been computed yet, so the affected blocks show zero instead of rescanning the registry. A controlled registry load maintains the summary incrementally; if it is missing entirely, run the one owner-gated emergency rebuild (POST /api/operating-center/registry-summary/refresh).";

/** Load every summary row (a dozen rows at most). Any failure (table not
 * migrated yet, unreadable payload) degrades to missing metrics, never
 * to a thrown view and never to a fallback scan. */
export async function readRegistrySummary(db: D1Database): Promise<Map<string, RegistrySummaryEntry>> {
	const out = new Map<string, RegistrySummaryEntry>();
	try {
		const res = await db
			.prepare(`SELECT scope, metric, payload, computed_at FROM registry_summary`)
			.all<{ scope: string; metric: string; payload: string; computed_at: string }>();
		for (const r of res.results ?? []) {
			try {
				out.set(`${String(r.scope)}:${String(r.metric)}`, {
					payload: JSON.parse(String(r.payload)),
					computed_at: String(r.computed_at),
				});
			} catch {
				// Unreadable payload: treat the metric as missing.
			}
		}
	} catch {
		// Table absent (migration 0099 not applied yet): all missing.
	}
	return out;
}

export function summaryPayload<T>(
	entries: Map<string, RegistrySummaryEntry>,
	scope: SummaryScope,
	metric: SummaryMetric,
): T | null {
	const entry = entries.get(`${scope}:${metric}`);
	return entry ? (entry.payload as T) : null;
}

/** Honest freshness state for the metrics a view depends on. */
export function summaryMeta(
	entries: Map<string, RegistrySummaryEntry>,
	required: Array<[SummaryScope, SummaryMetric]>,
): RegistrySummaryMeta {
	let present = 0;
	let oldest: string | null = null;
	for (const [scope, metric] of required) {
		const entry = entries.get(`${scope}:${metric}`);
		if (entry) {
			present += 1;
			if (!oldest || entry.computed_at < oldest) oldest = entry.computed_at;
		}
	}
	if (present === required.length) {
		return {
			status: "ok",
			computed_at: oldest,
			note: `Registry totals read from the precomputed registry summary, computed ${oldest}.`,
		};
	}
	return {
		status: present === 0 ? "missing" : "partial",
		computed_at: oldest,
		note: MISSING_NOTE,
	};
}

// ---------------------------------------------------------------------------
// Write side — shared by the rebuild, the delta path and external
// loaders, so every writer produces byte-identical upserts.
// ---------------------------------------------------------------------------

const SUMMARY_UPSERT_SQL = `INSERT INTO registry_summary (scope, metric, payload, computed_at) VALUES (?, ?, ?, ?)
	ON CONFLICT(scope, metric) DO UPDATE SET payload = excluded.payload, computed_at = excluded.computed_at`;

/**
 * Build the upsert statements for a set of "scope:metric" payloads
 * WITHOUT executing them, so a caller can place them inside its own
 * db.batch() — e.g. a registry loader batching its INSERTs and the
 * summary writes into ONE atomic D1 operation.
 */
export function buildSummaryUpsertStatements(
	db: D1Database,
	payloads: Iterable<readonly [string, unknown]>,
	computedAt: string,
): D1PreparedStatement[] {
	const statements: D1PreparedStatement[] = [];
	for (const [key, payload] of payloads) {
		const sep = key.indexOf(":");
		statements.push(
			db
				.prepare(SUMMARY_UPSERT_SQL)
				.bind(key.slice(0, sep), key.slice(sep + 1), JSON.stringify(payload), computedAt),
		);
	}
	return statements;
}

/**
 * Write summary payloads in ONE db.batch(). D1 batch() executes its
 * statements inside a single transaction: either all of them apply or
 * none do. Returns the number of metrics written.
 */
export async function writeRegistrySummaryPayloads(
	db: D1Database,
	payloads: Iterable<readonly [string, unknown]>,
	computedAt: string,
): Promise<number> {
	const statements = buildSummaryUpsertStatements(db, payloads, computedAt);
	if (statements.length === 0) return 0;
	await db.batch(statements);
	return statements.length;
}

// ---------------------------------------------------------------------------
// Full rebuild — EMERGENCY / AUDIT ONLY, one pass per big table.
//
// Each big table is scanned exactly once, with every scope's counts
// carried as conditional sums over that single scan:
// - territories: one GROUP BY type scan yields the national counts, the
//   Florida counts (SUM over the subtree predicate) and the
//   CONTINENTAL/NATIONAL root ids (GROUP_CONCAT) that the HQ role
//   aggregation needs — no separate root query, no second pass.
// - nw_groups: one GROUP BY status scan LEFT JOINed to the Florida
//   subtree materialized once in a CTE; defaults / Florida /
//   Florida-defaults are conditional sums over that scan.
// - role_instances: one GROUP BY template_id, status scan with the
//   same one-time subtree join plus a conditional sum for the root
//   (HQ) territories. All nine role payloads (national / Florida / HQ
//   x current / planned, by-scope, by-template) are derived from those
//   grouped rows in code against the small role_templates map.
// Small tables keep one grouped statement each (role_templates,
// outreach_prospects national + Florida, money_events); the Florida
// sent/replies distinct counts share one statement with one
// materialized subtree. Equivalence with the round-1 per-view queries
// is proven on the volume replica and on fixtures (REPORT-ROUND2.md);
// the old queries live only in that test harness, not in shipped code.
// ---------------------------------------------------------------------------

async function allRows<T extends Record<string, unknown>>(
	db: D1Database,
	sql: string,
	binds: unknown[] = [],
): Promise<T[]> {
	const res = await db.prepare(sql).bind(...binds).all<T>();
	return res.results ?? [];
}

function countMap(rows: Array<Record<string, unknown>>, keyField: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const r of rows) {
		const key = r[keyField] == null ? "unknown" : String(r[keyField]);
		out[key] = num(r.n);
	}
	return out;
}

function addTo(map: Map<string, number>, key: string, delta: number): void {
	if (delta !== 0) map.set(key, (map.get(key) ?? 0) + delta);
}

function mapToRecord(map: Map<string, number>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [k, v] of map) out[k] = v;
	return out;
}

function compareTemplateCounts(
	a: { template_id: string; n: number },
	b: { template_id: string; n: number },
): number {
	if (b.n !== a.n) return b.n - a.n;
	return a.template_id < b.template_id ? -1 : a.template_id > b.template_id ? 1 : 0;
}

export interface RegistrySummaryPassCounts {
	territories: number;
	nw_groups: number;
	role_instances: number;
}

export interface RegistrySummaryRefreshResult {
	ok: true;
	operation: "emergency_recount";
	computed_at: string;
	metrics_written: number;
	scopes: SummaryScope[];
	pass_counts: RegistrySummaryPassCounts;
	rows_examined_estimate: number;
}

interface SummaryComputation {
	payloads: Array<readonly [string, unknown]>;
	pass_counts: RegistrySummaryPassCounts;
	rows_examined_estimate: number;
}

async function computeRegistrySummaryPayloads(db: D1Database): Promise<SummaryComputation> {
	// Pass 1 — territories (national + Florida + root ids in one scan).
	const territoryRows = await allRows(
		db,
		`SELECT type AS k, COUNT(*) AS n,
		        COALESCE(SUM(CASE WHEN territory_id = '${FLORIDA_TERRITORY_ID}' OR state_fips = '12' THEN 1 ELSE 0 END), 0) AS fl_n,
		        GROUP_CONCAT(CASE WHEN type IN ('CONTINENTAL', 'NATIONAL') THEN territory_id END) AS root_ids
		 FROM territories GROUP BY type ORDER BY type ASC`,
	);
	const nationalTerritories: TerritoriesByTypePayload = {
		total: 0,
		by_type: countMap(territoryRows, "k"),
	};
	const floridaByType = new Map<string, number>();
	const rootIds: string[] = [];
	for (const row of territoryRows) {
		nationalTerritories.total += num(row.n);
		const fl = num(row.fl_n);
		if (fl > 0 && row.k != null) floridaByType.set(String(row.k), fl);
		if (typeof row.root_ids === "string") {
			for (const id of row.root_ids.split(",")) if (id) rootIds.push(id);
		}
	}
	const floridaTerritories: TerritoriesByTypePayload = {
		total: [...floridaByType.values()].reduce((a, b) => a + b, 0),
		by_type: mapToRecord(floridaByType),
	};

	// role_templates map (small; drives every by-scope rollup and the
	// by-template titles, with the same join semantics as round 1:
	// by_scope and the HQ list are INNER — roles whose template is
	// unknown are excluded there; the Florida by_template list is LEFT
	// — unknown templates appear with a null title).
	const templateRows = await allRows<{ template_id: string; title: string | null; scope_type: string | null }>(
		db,
		`SELECT template_id, title, scope_type FROM role_templates`,
	);
	const templates = new Map<string, { title: string | null; scope_type: string | null }>();
	for (const t of templateRows) {
		templates.set(String(t.template_id), { title: t.title ?? null, scope_type: t.scope_type ?? null });
	}

	// Pass 2 — nw_groups (one scan, subtree materialized once).
	const groupRows = await allRows(
		db,
		`${FL_CTE}
		 SELECT g.status AS k, COUNT(*) AS n,
		        COALESCE(SUM(CASE WHEN g.is_default = 1 THEN 1 ELSE 0 END), 0) AS defaults,
		        COALESCE(SUM(CASE WHEN fl.territory_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS fl_n,
		        COALESCE(SUM(CASE WHEN g.is_default = 1 AND fl.territory_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS fl_defaults
		 FROM nw_groups g
		 LEFT JOIN fl ON fl.territory_id = g.territory_id
		 GROUP BY g.status ORDER BY g.status ASC`,
	);
	const nationalByStatus = countMap(groupRows, "k");
	const floridaGroupByStatus = new Map<string, number>();
	let nationalDefaults = 0;
	let floridaDefaultsTotal = 0;
	for (const row of groupRows) {
		nationalDefaults += num(row.defaults);
		const fl = num(row.fl_n);
		if (fl > 0 && row.k != null) floridaGroupByStatus.set(String(row.k), fl);
		floridaDefaultsTotal += num(row.fl_defaults);
	}
	const nationalGroups: GroupsByStatusPayload = {
		total: Object.values(nationalByStatus).reduce((a, b) => a + b, 0),
		by_status: nationalByStatus,
		defaults: nationalDefaults,
		forming: nationalByStatus["FORMING"] ?? 0,
		active: nationalByStatus["ACTIVE"] ?? 0,
	};
	const floridaGroupsByStatus = mapToRecord(floridaGroupByStatus);
	const floridaGroups: GroupsByStatusPayload = {
		total: Object.values(floridaGroupsByStatus).reduce((a, b) => a + b, 0),
		by_status: floridaGroupsByStatus,
		defaults: floridaDefaultsTotal,
		forming: floridaGroupsByStatus["FORMING"] ?? 0,
		active: floridaGroupsByStatus["ACTIVE"] ?? 0,
	};

	// Pass 3 — role_instances (one scan; national / Florida / HQ /
	// planned all derived from the grouped rows).
	const hqSumSql = rootIds.length
		? `COALESCE(SUM(CASE WHEN r.territory_id IN (${rootIds.map(() => "?").join(", ")}) THEN 1 ELSE 0 END), 0)`
		: "0";
	const roleRows = await allRows(
		db,
		`${FL_CTE}
		 SELECT r.template_id AS template_id, r.status AS status, COUNT(*) AS n,
		        COALESCE(SUM(CASE WHEN fl.territory_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS fl_n,
		        ${hqSumSql} AS hq_n
		 FROM role_instances r
		 LEFT JOIN fl ON fl.territory_id = r.territory_id
		 GROUP BY r.template_id, r.status`,
		rootIds,
	);
	const natByStatus = new Map<string, number>();
	const natByScope = new Map<string, number>();
	const flByScope = new Map<string, number>();
	const flByTemplate = new Map<string, number>();
	const hqByTemplate = new Map<string, number>();
	const plannedNatByScope = new Map<string, number>();
	const plannedFlByScope = new Map<string, number>();
	const plannedHqByScope = new Map<string, number>();
	let rolesTotal = 0;
	let flRolesTotal = 0;
	let plannedNat = 0;
	let plannedFl = 0;
	let plannedHq = 0;
	for (const row of roleRows) {
		const n = num(row.n);
		const fl = num(row.fl_n);
		const hq = num(row.hq_n);
		const status = row.status == null ? "unknown" : String(row.status);
		const templateId = String(row.template_id ?? "");
		rolesTotal += n;
		flRolesTotal += fl;
		addTo(natByStatus, status, n);
		const tpl = templates.get(templateId);
		const scopeKey = tpl ? (tpl.scope_type == null ? "unknown" : String(tpl.scope_type)) : null;
		if (scopeKey !== null) {
			addTo(natByScope, scopeKey, n);
			addTo(hqByTemplate, templateId, hq);
		}
		if (fl > 0) {
			addTo(flByTemplate, templateId, fl);
			if (scopeKey !== null) addTo(flByScope, scopeKey, fl);
		}
		if (status === "PLANNED") {
			plannedNat += n;
			plannedFl += fl;
			plannedHq += hq;
			if (scopeKey !== null) {
				addTo(plannedNatByScope, scopeKey, n);
				addTo(plannedFlByScope, scopeKey, fl);
				addTo(plannedHqByScope, scopeKey, hq);
			}
		}
	}
	const nationalRoles: RolesNationalPayload = {
		total: rolesTotal,
		by_status: mapToRecord(natByStatus),
		by_scope: mapToRecord(natByScope),
	};
	const floridaRoles: RolesFloridaPayload = {
		total: flRolesTotal,
		by_scope: mapToRecord(flByScope),
		by_template: [...flByTemplate.entries()]
			.filter(([, n]) => n > 0)
			.map(([template_id, n]) => ({
				template_id,
				title: templates.get(template_id)?.title ?? null,
				n,
			}))
			.sort(compareTemplateCounts)
			.slice(0, FLORIDA_BY_TEMPLATE_LIMIT),
	};
	const hqRoles: RolesHqPayload = {
		by_template: [...hqByTemplate.entries()]
			.filter(([, n]) => n > 0)
			.map(([template_id, n]) => {
				const tpl = templates.get(template_id);
				return {
					template_id,
					title: tpl?.title ?? null,
					scope_type: tpl?.scope_type ?? null,
					n,
				};
			})
			.sort(compareTemplateCounts)
			.slice(0, HQ_BY_TEMPLATE_LIMIT),
	};
	const nationalPlanned: RolesPlannedPayload = {
		roles_planned: plannedNat,
		by_scope: mapToRecord(plannedNatByScope),
	};
	const floridaPlanned: RolesPlannedPayload = {
		roles_planned: plannedFl,
		by_scope: mapToRecord(plannedFlByScope),
	};
	const hqPlanned: RolesPlannedPayload = {
		roles_planned: plannedHq,
		by_scope: mapToRecord(plannedHqByScope),
	};

	// Outreach national — one GROUP BY pass over outreach_prospects
	// carries the total, the per-tier counts and the enrolled count.
	const outreachNatRows = await allRows(
		db,
		`SELECT contact_level AS k, COUNT(*) AS n,
		        COALESCE(SUM(CASE WHEN sequence_enrolled_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS enrolled
		 FROM outreach_prospects GROUP BY contact_level ORDER BY contact_level ASC`,
	);
	const outreachNational: OutreachNationalPayload = {
		prospects_total: 0,
		prospects_by_tier: countMap(outreachNatRows, "k"),
		prospects_enrolled: 0,
	};
	for (const row of outreachNatRows) {
		outreachNational.prospects_total += num(row.n);
		outreachNational.prospects_enrolled += num(row.enrolled);
	}

	// Outreach Florida — one filtered GROUP BY pass (total, per-track,
	// qualified A1/A2 as a conditional sum), plus ONE statement for the
	// sent / replies distinct counts sharing one materialized subtree.
	const outreachFlRows = await allRows(
		db,
		`SELECT track AS k, COUNT(*) AS n,
		        COALESCE(SUM(CASE WHEN contact_level IN ('A1', 'A2') THEN 1 ELSE 0 END), 0) AS qualified
		 FROM outreach_prospects
		 WHERE territory_id ${FL_SUBTREE}
		 GROUP BY track ORDER BY track ASC`,
	);
	let outreachFlTotal = 0;
	let outreachFlQualified = 0;
	for (const row of outreachFlRows) {
		outreachFlTotal += num(row.n);
		outreachFlQualified += num(row.qualified);
	}
	const sentReplies = await db
		.prepare(
			`${FL_CTE}
			 SELECT
			   (SELECT COUNT(DISTINCT s.prospect_id) FROM outreach_sends s
			      JOIN outreach_prospects p ON p.id = s.prospect_id
			      WHERE p.territory_id IN (SELECT territory_id FROM fl)) AS sent,
			   (SELECT COUNT(DISTINCT r.prospect_id) FROM outreach_replies r
			      JOIN outreach_prospects p ON p.id = r.prospect_id
			      WHERE p.territory_id IN (SELECT territory_id FROM fl)) AS replies`,
		)
		.first<{ sent: number; replies: number }>();
	const outreachFlorida: OutreachFloridaPayload = {
		prospects_total: outreachFlTotal,
		prospects_by_track: countMap(outreachFlRows, "k"),
		prospects_sent: num(sentReplies?.sent),
		prospects_replies: num(sentReplies?.replies),
		prospects_qualified: outreachFlQualified,
	};

	// Florida received money by lane (VERIFIED received types only, the
	// budget/funding convention; money_events is a small table — this is
	// the round-1 query, unchanged).
	const lanePlaceholders = RECEIVED_EVENT_TYPES.map(() => "?").join(", ");
	const laneRows = await allRows<{ event_type: string; funding_lane: string | null; events: number; cents: number }>(
		db,
		`SELECT event_type, funding_lane, COUNT(*) AS events, COALESCE(SUM(gross_cents), 0) AS cents FROM money_events WHERE gross_status = 'VERIFIED' AND event_type IN (${lanePlaceholders}) AND territory_id ${FL_SUBTREE} GROUP BY event_type, funding_lane ORDER BY event_type ASC`,
		[...RECEIVED_EVENT_TYPES],
	);
	const byLane = new Map<string, { lane: string; events: number; cents: number }>();
	for (const r of laneRows) {
		const lane = r.funding_lane ? String(r.funding_lane) : laneForEventType(String(r.event_type));
		const cur = byLane.get(lane) ?? { lane, events: 0, cents: 0 };
		cur.events += num(r.events);
		cur.cents += num(r.cents);
		byLane.set(lane, cur);
	}
	const receivedByLane: ReceivedByLanePayload = {
		lanes: [...byLane.values()].sort((a, b) => (a.lane < b.lane ? -1 : 1)),
	};

	const payloads: Array<readonly [string, unknown]> = [
		["national:territories_by_type", nationalTerritories],
		["florida:territories_by_type", floridaTerritories],
		["national:groups_by_status", nationalGroups],
		["florida:groups_by_status", floridaGroups],
		["national:roles", nationalRoles],
		["florida:roles", floridaRoles],
		["hq:roles", hqRoles],
		["national:roles_planned", nationalPlanned],
		["florida:roles_planned", floridaPlanned],
		["hq:roles_planned", hqPlanned],
		["national:outreach", outreachNational],
		["florida:outreach", outreachFlorida],
		["florida:received_by_lane", receivedByLane],
	];

	// Cost label: the three big-table passes, the five Florida-subtree
	// materializations (groups join, roles join, Florida prospects
	// filter, sent/replies CTE, received-by-lane filter), and the
	// small-table rows the grouped statements aggregate. An estimate by
	// construction; the exact replica decomposition is in
	// REPORT-ROUND2.md.
	const laneEvents = receivedByLane.lanes.reduce((a, l) => a + l.events, 0);
	const rows_examined_estimate =
		nationalTerritories.total +
		nationalGroups.total +
		rolesTotal +
		5 * floridaTerritories.total +
		templateRows.length +
		outreachNational.prospects_total +
		outreachFlorida.prospects_total +
		laneEvents;

	return {
		payloads,
		pass_counts: { territories: 1, nw_groups: 1, role_instances: 1 },
		rows_examined_estimate,
	};
}

/**
 * EMERGENCY / AUDIT ONLY: full recount of the registry into
 * registry_summary, one pass per big table. Owner-gated at the
 * endpoint, never scheduled. The normal maintenance path is
 * applyRegistryDelta() from the controlled loader that changed the
 * registry.
 */
export async function refreshRegistrySummary(db: D1Database, nowIso?: string): Promise<RegistrySummaryRefreshResult> {
	const computed = await computeRegistrySummaryPayloads(db);
	const computed_at = nowIso ?? new Date().toISOString();
	const written = await writeRegistrySummaryPayloads(db, computed.payloads, computed_at);
	return {
		ok: true,
		operation: "emergency_recount",
		computed_at,
		metrics_written: written,
		scopes: ["national", "florida", "hq"],
		pass_counts: computed.pass_counts,
		rows_examined_estimate: computed.rows_examined_estimate,
	};
}

// ---------------------------------------------------------------------------
// Incremental maintenance — the NORMAL path (controlled loaders).
// ---------------------------------------------------------------------------

/**
 * A registry delta as a controlled loader knows it: the exact counts of
 * the rows it is adding (positive) or removing (negative), classified
 * the same ways the summary payloads are. The loader derives these
 * from its own manifest — it never needs to re-read the registry.
 *
 * - territories.by_type / florida_by_type: added territories per type
 *   (florida_* = the subset inside the Florida subtree).
 * - groups: by_status / florida_by_status per group status; defaults /
 *   florida_defaults: added default-group counts.
 * - roles_by_status MUST list every added role's status (the national
 *   roles total is derived from it); the by_scope maps follow the
 *   payload semantics (template-mapped roles only).
 * - roles_florida_total: added roles on Florida-subtree territories.
 * - The by_template lists are top-N projections (Florida 15, HQ 100).
 *   Delta counts are exact for every template already in the stored
 *   list. For a template NOT in the stored list, pass its post-load
 *   ABSOLUTE Florida/HQ count via *_by_template_absolute (with title /
 *   scope_type — a loader with a manifest always knows them).
 *   Removals that could pull an untouched, unlisted template INTO the
 *   top N cannot be resolved from deltas alone; that is what the
 *   emergency rebuild is for.
 */
export interface RegistryDelta {
	territories?: {
		by_type?: Record<string, number>;
		florida_by_type?: Record<string, number>;
	};
	groups?: {
		by_status?: Record<string, number>;
		florida_by_status?: Record<string, number>;
		defaults?: number;
		florida_defaults?: number;
	};
	roles_by_status?: Record<string, number>;
	roles_by_scope?: Record<string, number>;
	roles_florida_total?: number;
	roles_florida_by_scope?: Record<string, number>;
	roles_florida_by_template?: Record<string, number>;
	roles_florida_by_template_absolute?: Record<
		string,
		{ n: number; title?: string | null; scope_type?: string | null }
	>;
	roles_hq_by_template?: Record<string, number>;
	roles_hq_by_template_absolute?: Record<
		string,
		{ n: number; title?: string | null; scope_type?: string | null }
	>;
	planned?: {
		total?: number;
		florida_total?: number;
		hq_total?: number;
		by_scope?: Record<string, number>;
		florida_by_scope?: Record<string, number>;
		hq_by_scope?: Record<string, number>;
	};
}

type PayloadObject = Record<string, unknown>;

function mergeCountRecord(
	base: Record<string, number> | undefined,
	delta: Record<string, number> | undefined,
): Record<string, number> {
	const out: Record<string, number> = { ...(base ?? {}) };
	if (delta) {
		for (const [key, d] of Object.entries(delta)) {
			const next = (out[key] ?? 0) + d;
			// Rebuild payloads only carry keys with a positive count;
			// merged payloads keep that same canonical shape.
			if (next === 0) delete out[key];
			else out[key] = next;
		}
	}
	return out;
}

function sumRecord(record: Record<string, number>): number {
	return Object.values(record).reduce((a, b) => a + b, 0);
}

interface TemplateListEntry {
	template_id: string;
	title: string | null;
	scope_type?: string | null;
	n: number;
}

function mergeTemplateList(
	current: TemplateListEntry[] | undefined,
	deltas: Record<string, number> | undefined,
	absolutes:
		| Record<string, { n: number; title?: string | null; scope_type?: string | null }>
		| undefined,
	limit: number,
	keepScopeType: boolean,
): TemplateListEntry[] {
	const byId = new Map<string, TemplateListEntry>();
	for (const entry of current ?? []) byId.set(entry.template_id, { ...entry });
	if (absolutes) {
		for (const [templateId, a] of Object.entries(absolutes)) {
			const prev = byId.get(templateId);
			const merged: TemplateListEntry = {
				template_id: templateId,
				title: a.title !== undefined ? a.title : prev?.title ?? null,
				n: a.n,
			};
			if (keepScopeType) {
				merged.scope_type =
					a.scope_type !== undefined ? a.scope_type : prev?.scope_type ?? null;
			}
			byId.set(templateId, merged);
		}
	}
	if (deltas) {
		for (const [templateId, d] of Object.entries(deltas)) {
			const prev = byId.get(templateId);
			if (prev) prev.n += d;
			else {
				const created: TemplateListEntry = { template_id: templateId, title: null, n: d };
				if (keepScopeType) created.scope_type = null;
				byId.set(templateId, created);
			}
		}
	}
	return [...byId.values()]
		.filter((e) => e.n > 0)
		.sort(compareTemplateCounts)
		.slice(0, limit);
}

/**
 * Pure merge: current payloads (keyed "scope:metric") + a loader delta
 * -> the new payload set. Exported so loaders and tests can verify a
 * merge without a database. Metrics the delta does not touch are
 * carried over unchanged; a delta never invents outreach / money
 * payloads (those change through live product writes, not registry
 * loads).
 */
export function mergeRegistryDelta(
	current: Map<string, unknown>,
	delta: RegistryDelta,
): Map<string, unknown> {
	const out = new Map<string, unknown>(current);
	const get = (key: string, zero: PayloadObject): PayloadObject => {
		const value = current.get(key);
		return value && typeof value === "object" ? { ...(value as PayloadObject) } : { ...zero };
	};

	if (delta.territories) {
		const nat = get("national:territories_by_type", { total: 0, by_type: {} });
		nat.by_type = mergeCountRecord(
			nat.by_type as Record<string, number>,
			delta.territories.by_type,
		);
		nat.total = sumRecord(nat.by_type as Record<string, number>);
		out.set("national:territories_by_type", nat);
		const fl = get("florida:territories_by_type", { total: 0, by_type: {} });
		fl.by_type = mergeCountRecord(
			fl.by_type as Record<string, number>,
			delta.territories.florida_by_type,
		);
		fl.total = sumRecord(fl.by_type as Record<string, number>);
		out.set("florida:territories_by_type", fl);
	}

	if (delta.groups) {
		const zero: PayloadObject = { total: 0, by_status: {}, defaults: 0, forming: 0, active: 0 };
		const nat = get("national:groups_by_status", zero);
		nat.by_status = mergeCountRecord(
			nat.by_status as Record<string, number>,
			delta.groups.by_status,
		);
		nat.total = sumRecord(nat.by_status as Record<string, number>);
		nat.defaults = num(nat.defaults) + (delta.groups.defaults ?? 0);
		nat.forming = (nat.by_status as Record<string, number>)["FORMING"] ?? 0;
		nat.active = (nat.by_status as Record<string, number>)["ACTIVE"] ?? 0;
		out.set("national:groups_by_status", nat);
		const fl = get("florida:groups_by_status", zero);
		fl.by_status = mergeCountRecord(
			fl.by_status as Record<string, number>,
			delta.groups.florida_by_status,
		);
		fl.total = sumRecord(fl.by_status as Record<string, number>);
		fl.defaults = num(fl.defaults) + (delta.groups.florida_defaults ?? 0);
		fl.forming = (fl.by_status as Record<string, number>)["FORMING"] ?? 0;
		fl.active = (fl.by_status as Record<string, number>)["ACTIVE"] ?? 0;
		out.set("florida:groups_by_status", fl);
	}

	const touchesRoles =
		delta.roles_by_status !== undefined ||
		delta.roles_by_scope !== undefined ||
		delta.roles_florida_total !== undefined ||
		delta.roles_florida_by_scope !== undefined ||
		delta.roles_florida_by_template !== undefined ||
		delta.roles_florida_by_template_absolute !== undefined ||
		delta.roles_hq_by_template !== undefined ||
		delta.roles_hq_by_template_absolute !== undefined;
	if (touchesRoles) {
		const nat = get("national:roles", { total: 0, by_status: {}, by_scope: {} });
		const statusBefore = sumRecord((nat.by_status ?? {}) as Record<string, number>);
		nat.by_status = mergeCountRecord(
			nat.by_status as Record<string, number>,
			delta.roles_by_status,
		);
		nat.total = num(nat.total) + (sumRecord(nat.by_status as Record<string, number>) - statusBefore);
		nat.by_scope = mergeCountRecord(
			nat.by_scope as Record<string, number>,
			delta.roles_by_scope,
		);
		out.set("national:roles", nat);

		const fl = get("florida:roles", { total: 0, by_scope: {}, by_template: [] });
		fl.total = num(fl.total) + (delta.roles_florida_total ?? 0);
		fl.by_scope = mergeCountRecord(
			fl.by_scope as Record<string, number>,
			delta.roles_florida_by_scope,
		);
		fl.by_template = mergeTemplateList(
			fl.by_template as TemplateListEntry[],
			delta.roles_florida_by_template,
			delta.roles_florida_by_template_absolute,
			FLORIDA_BY_TEMPLATE_LIMIT,
			false,
		).map(({ template_id, title, n }) => ({ template_id, title, n }));
		out.set("florida:roles", fl);

		const hq = get("hq:roles", { by_template: [] });
		hq.by_template = mergeTemplateList(
			hq.by_template as TemplateListEntry[],
			delta.roles_hq_by_template,
			delta.roles_hq_by_template_absolute,
			HQ_BY_TEMPLATE_LIMIT,
			true,
		);
		out.set("hq:roles", hq);
	}

	if (delta.planned) {
		const zero: PayloadObject = { roles_planned: 0, by_scope: {} };
		const nat = get("national:roles_planned", zero);
		nat.roles_planned = num(nat.roles_planned) + (delta.planned.total ?? 0);
		nat.by_scope = mergeCountRecord(
			nat.by_scope as Record<string, number>,
			delta.planned.by_scope,
		);
		out.set("national:roles_planned", nat);
		const fl = get("florida:roles_planned", zero);
		fl.roles_planned = num(fl.roles_planned) + (delta.planned.florida_total ?? 0);
		fl.by_scope = mergeCountRecord(
			fl.by_scope as Record<string, number>,
			delta.planned.florida_by_scope,
		);
		out.set("florida:roles_planned", fl);
		const hq = get("hq:roles_planned", zero);
		hq.roles_planned = num(hq.roles_planned) + (delta.planned.hq_total ?? 0);
		hq.by_scope = mergeCountRecord(
			hq.by_scope as Record<string, number>,
			delta.planned.hq_by_scope,
		);
		out.set("hq:roles_planned", hq);
	}

	return out;
}

export interface RegistryDeltaResult {
	ok: true;
	operation: "incremental_delta";
	computed_at: string;
	metrics_written: number;
}

/**
 * Apply a loader delta to the stored summary: read the 13 payloads
 * (small table), merge in code, write them back in ONE db.batch().
 *
 * ATOMICITY ON D1 — what "the loader updates the summary in the same
 * operation as its inserts" can and cannot mean here:
 * - db.batch([...]) is the transactional unit: D1 executes the batch's
 *   statements inside a single transaction — all apply or none do.
 *   Individual prepare().run() calls are separate implicit
 *   transactions and are NOT atomic together.
 * - This function's WRITE is one batch, so the summary itself can
 *   never end up half-updated.
 * - A loader that needs its registry INSERTs and the summary update to
 *   commit or roll back TOGETHER must put both in one batch: read the
 *   current summary first (the merge is read-modify-write — D1 has no
 *   interactive transaction spanning a read and a later write),
 *   compute the merged payloads from its manifest, then issue ONE
 *   db.batch([...insertStatements,
 *             ...buildSummaryUpsertStatements(db, merged, ts)]).
 *   The Phase 1B loader drove D1 over HTTP with multi-statement calls;
 *   there the equivalent is appending the 13 upsert statements to the
 *   load's own final call so inserts and summary land together.
 */
export async function applyRegistryDelta(
	db: D1Database,
	delta: RegistryDelta,
	nowIso?: string,
): Promise<RegistryDeltaResult> {
	const entries = await readRegistrySummary(db);
	const current = new Map<string, unknown>();
	for (const [key, entry] of entries) current.set(key, entry.payload);
	const merged = mergeRegistryDelta(current, delta);
	const computed_at = nowIso ?? new Date().toISOString();
	const present: Array<readonly [string, unknown]> = [];
	for (const [key] of ALL_METRIC_KEYS.map(([s, m]) => [`${s}:${m}`] as const)) {
		if (merged.has(key)) present.push([key, merged.get(key)] as const);
	}
	const written = await writeRegistrySummaryPayloads(db, present, computed_at);
	return { ok: true, operation: "incremental_delta", computed_at, metrics_written: written };
}

/** Status for the owner console: which metrics exist and when computed. */
export async function getRegistrySummaryStatus(db: D1Database): Promise<{
	ok: true;
	computed_at: string | null;
	metrics: Array<{ scope: string; metric: string; computed_at: string }>;
	note: string;
}> {
	const entries = await readRegistrySummary(db);
	const metrics = [...entries.entries()].map(([key, entry]) => {
		const [scope, metric] = key.split(":");
		return { scope, metric, computed_at: entry.computed_at };
	});
	metrics.sort((a, b) => (a.scope + a.metric < b.scope + b.metric ? -1 : 1));
	const computed_at = metrics.length ? metrics.map((m) => m.computed_at).sort()[0] : null;
	return {
		ok: true,
		computed_at,
		metrics,
		note:
			metrics.length === 0
				? MISSING_NOTE
				: "Registry totals are maintained incrementally by the controlled registry loader (same operation as its inserts). The owner-gated refresh endpoint is an emergency/audit full recount only (one pass per big table, ~339k rows examined at Phase 1B volumes). There is no scheduled recount.",
	};
}
