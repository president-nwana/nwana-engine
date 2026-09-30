/**
 * Executable Revenue Inventory — Revenue Engine v1, Phase 2.
 *
 * One canonical inventory of every NWANA revenue-producing object.
 * The inventory must drive actions, not become a passive catalog:
 * every object answers "What is the next revenue-relevant action for
 * this object?" via next_revenue_action + action_status, and every
 * transition is logged append-only in revenue_object_actions.
 *
 * Money truth is NEVER duplicated here. Transaction counts, gross,
 * refunds, net and 7/30/90d revenue are derived at read time from the
 * canonical Phase-1 money_events / money_transactions tables
 * (ADR-0044). Where the source provides no settlement truth, net is
 * NULL / UNKNOWN — never derived, never zero-filled.
 *
 * revenue_system separates REVENUE_ENGINE from SPONSORSHIP_ENGINE.
 * Revenue Engine automation must not apply mass acquisition, mass
 * follow-up or passive-funnel rules to SPONSORSHIP_ENGINE objects.
 */

export const REVENUE_OBJECT_TYPES = [
	"DONATION",
	"FUNDRAISER",
	"RACE_REGISTRATION",
	"ACADEMY_COURSE",
	"LICENSE",
	"NW_GROUP",
	"SPONSORSHIP",
	"PARTNERSHIP",
] as const;
export type RevenueObjectType = (typeof REVENUE_OBJECT_TYPES)[number];

export const ACTIVE_STATUSES = ["active", "inactive", "hidden", "unknown"] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export const CONVERSION_TRACKING = ["tracked", "untracked", "unavailable", "unknown"] as const;
export type ConversionTracking = (typeof CONVERSION_TRACKING)[number];

export const ACQUISITION_ELIGIBILITY = ["eligible", "ineligible", "blocked", "unknown"] as const;
export type AcquisitionEligibility = (typeof ACQUISITION_ELIGIBILITY)[number];

export const ACTION_STATUSES = ["pending", "in_progress", "done", "blocked", "none"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const REVENUE_SYSTEMS = ["REVENUE_ENGINE", "SPONSORSHIP_ENGINE"] as const;
export type RevenueSystem = (typeof REVENUE_SYSTEMS)[number];

export interface MoneyLink {
	event_types?: string[];
}

export interface RevenueObject {
	object_key: string;
	object_type: RevenueObjectType;
	name: string;
	source_platform: string | null;
	source_object_id: string | null;
	purchase_url: string | null;
	price_structure: string | null;
	active_status: ActiveStatus;
	monetary_capabilities: string | null;
	transaction_source: string | null;
	conversion_event: string | null;
	conversion_tracking: ConversionTracking;
	automation_capabilities: string | null;
	acquisition_eligibility: AcquisitionEligibility;
	acquisition_eligibility_reason: string | null;
	next_revenue_action: string | null;
	action_status: ActionStatus;
	attributable_acquisition_source: string | null;
	revenue_system: RevenueSystem;
	money_link: MoneyLink | null;
	evidence: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * Money rollup derived from canonical money_events. All sums count only
 * VERIFIED amounts; unverified amounts contribute 0 to sums but never
 * block the read. net_cents is NULL when no VERIFIED net exists.
 */
export interface RevenueMoneyRollup {
	transaction_count: number;
	gross_cents: number;
	refund_cents: number;
	net_cents: number | null;
	revenue_7d_cents: number;
	revenue_30d_cents: number;
	revenue_90d_cents: number;
}

export interface RevenueObjectWithMoney extends RevenueObject {
	money: RevenueMoneyRollup | null;
}

export interface RevenueActionRecord {
	id: number;
	object_key: string;
	action: string;
	status: ActionStatus;
	note: string | null;
	created_at: string;
}

function parseMoneyLink(raw: string | null): MoneyLink | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as MoneyLink;
		if (parsed && Array.isArray(parsed.event_types) && parsed.event_types.length > 0) {
			return { event_types: parsed.event_types.filter((t) => typeof t === "string") };
		}
		return null;
	} catch {
		return null;
	}
}

function rowToRevenueObject(row: Record<string, unknown>): RevenueObject {
	return {
		object_key: String(row.object_key),
		object_type: row.object_type as RevenueObjectType,
		name: String(row.name),
		source_platform: (row.source_platform as string | null) ?? null,
		source_object_id: (row.source_object_id as string | null) ?? null,
		purchase_url: (row.purchase_url as string | null) ?? null,
		price_structure: (row.price_structure as string | null) ?? null,
		active_status: row.active_status as ActiveStatus,
		monetary_capabilities: (row.monetary_capabilities as string | null) ?? null,
		transaction_source: (row.transaction_source as string | null) ?? null,
		conversion_event: (row.conversion_event as string | null) ?? null,
		conversion_tracking: row.conversion_tracking as ConversionTracking,
		automation_capabilities: (row.automation_capabilities as string | null) ?? null,
		acquisition_eligibility: row.acquisition_eligibility as AcquisitionEligibility,
		acquisition_eligibility_reason: (row.acquisition_eligibility_reason as string | null) ?? null,
		next_revenue_action: (row.next_revenue_action as string | null) ?? null,
		action_status: row.action_status as ActionStatus,
		attributable_acquisition_source:
			(row.attributable_acquisition_source as string | null) ?? null,
		revenue_system: row.revenue_system as RevenueSystem,
		money_link: parseMoneyLink(row.money_link as string | null),
		evidence: (row.evidence as string | null) ?? null,
		created_at: String(row.created_at),
		updated_at: String(row.updated_at),
	};
}

const EMPTY_ROLLUP: RevenueMoneyRollup = {
	transaction_count: 0,
	gross_cents: 0,
	refund_cents: 0,
	net_cents: null,
	revenue_7d_cents: 0,
	revenue_30d_cents: 0,
	revenue_90d_cents: 0,
};

async function computeMoneyRollup(
	db: D1Database,
	link: MoneyLink | null,
): Promise<RevenueMoneyRollup | null> {
	if (!link || !link.event_types || link.event_types.length === 0) return null;
	const placeholders = link.event_types.map(() => "?").join(",");
	const sql = `
		SELECT
			COUNT(DISTINCT transaction_key) AS transaction_count,
			COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0) AS gross_cents,
			COALESCE(SUM(CASE WHEN refund_status = 'VERIFIED' THEN refund_cents ELSE 0 END), 0) AS refund_cents,
			SUM(CASE WHEN net_status = 'VERIFIED' THEN net_cents ELSE NULL END) AS net_cents,
			COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' AND occurred_at >= datetime('now', '-7 days') THEN gross_cents ELSE 0 END), 0) AS revenue_7d_cents,
			COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' AND occurred_at >= datetime('now', '-30 days') THEN gross_cents ELSE 0 END), 0) AS revenue_30d_cents,
			COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' AND occurred_at >= datetime('now', '-90 days') THEN gross_cents ELSE 0 END), 0) AS revenue_90d_cents
		FROM money_events
		WHERE event_type IN (${placeholders})
	`;
	const row = await db
		.prepare(sql)
		.bind(...link.event_types)
		.first<Record<string, unknown>>();
	if (!row) return { ...EMPTY_ROLLUP };
	return {
		transaction_count: Number(row.transaction_count ?? 0),
		gross_cents: Number(row.gross_cents ?? 0),
		refund_cents: Number(row.refund_cents ?? 0),
		// SUM over all-NULL yields NULL: honest "no settlement truth".
		net_cents: row.net_cents === null || row.net_cents === undefined ? null : Number(row.net_cents),
		revenue_7d_cents: Number(row.revenue_7d_cents ?? 0),
		revenue_30d_cents: Number(row.revenue_30d_cents ?? 0),
		revenue_90d_cents: Number(row.revenue_90d_cents ?? 0),
	};
}

export async function listRevenueObjects(
	db: D1Database,
	opts?: { object_type?: RevenueObjectType; revenue_system?: RevenueSystem },
): Promise<RevenueObjectWithMoney[]> {
	const where: string[] = [];
	const binds: unknown[] = [];
	if (opts?.object_type) {
		where.push("object_type = ?");
		binds.push(opts.object_type);
	}
	if (opts?.revenue_system) {
		where.push("revenue_system = ?");
		binds.push(opts.revenue_system);
	}
	const sql = `SELECT * FROM revenue_objects${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY object_type, object_key`;
	const rows = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
	const out: RevenueObjectWithMoney[] = [];
	for (const row of rows.results ?? []) {
		const obj = rowToRevenueObject(row);
		out.push({ ...obj, money: await computeMoneyRollup(db, obj.money_link) });
	}
	return out;
}

export async function getRevenueObject(
	db: D1Database,
	objectKey: string,
): Promise<(RevenueObjectWithMoney & { actions: RevenueActionRecord[] }) | null> {
	const row = await db
		.prepare("SELECT * FROM revenue_objects WHERE object_key = ?")
		.bind(objectKey)
		.first<Record<string, unknown>>();
	if (!row) return null;
	const obj = rowToRevenueObject(row);
	const money = await computeMoneyRollup(db, obj.money_link);
	const actions = await db
		.prepare("SELECT * FROM revenue_object_actions WHERE object_key = ? ORDER BY created_at DESC, id DESC LIMIT 50")
		.bind(objectKey)
		.all<Record<string, unknown>>();
	return {
		...obj,
		money,
		actions: (actions.results ?? []).map((a) => ({
			id: Number(a.id),
			object_key: String(a.object_key),
			action: String(a.action),
			status: a.status as ActionStatus,
			note: (a.note as string | null) ?? null,
			created_at: String(a.created_at),
		})),
	};
}

/**
 * Record a next-action transition for an inventory object. Updates the
 * object's next_revenue_action / action_status and appends to the
 * append-only action history. Returns the updated object, or null when
 * the object_key does not exist.
 */
export async function recordRevenueAction(
	db: D1Database,
	objectKey: string,
	input: { action: string; status: ActionStatus; note?: string },
): Promise<RevenueObjectWithMoney | null> {
	const existing = await db
		.prepare("SELECT object_key FROM revenue_objects WHERE object_key = ?")
		.bind(objectKey)
		.first<Record<string, unknown>>();
	if (!existing) return null;
	if (!ACTION_STATUSES.includes(input.status)) {
		throw new Error(`invalid action status: ${input.status}`);
	}
	await db.batch([
		db
			.prepare(
				"UPDATE revenue_objects SET next_revenue_action = ?, action_status = ?, updated_at = datetime('now') WHERE object_key = ?",
			)
			.bind(input.action, input.status, objectKey),
		db
			.prepare(
				"INSERT INTO revenue_object_actions (object_key, action, status, note) VALUES (?, ?, ?, ?)",
			)
			.bind(objectKey, input.action, input.status, input.note ?? null),
	]);
	const updated = await getRevenueObject(db, objectKey);
	if (!updated) return null;
	const { actions: _actions, ...rest } = updated;
	return rest;
}
