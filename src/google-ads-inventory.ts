/**
 * Google Ads account inventory (read-only).
 *
 * The in-account Google Ads Script ("NWANA reconcile") collects a full
 * inventory snapshot of the account once an hour and POSTs it to
 * /api/operating-center/google-ads/inventory with the owner key.
 * The Engine NEVER writes to Google Ads; this module only validates and
 * stores the snapshot so cleanup decisions (KEEP/PAUSE/MERGE/REBUILD/RETIRE)
 * are made on real account data.
 */

// Hard cap on the stored payload: the script caps keywords/ads per entity,
// but a runaway account must never blow up a D1 row. 1 MB is generous for
// ~14 campaigns of structured inventory.
export const INVENTORY_MAX_PAYLOAD_BYTES = 1_000_000;

export interface InventoryAdGroup {
	name: string;
	status: string;
	cpc_bid_usd?: number;
	keywords: Array<{ text: string; match_type: string; status: string }>;
	keywords_truncated?: boolean;
	ads: Array<{ headlines: string[]; descriptions: string[]; final_url: string; status: string }>;
	ads_truncated?: boolean;
}

export interface InventoryCampaign {
	id: string;
	name: string;
	status: string;
	channel_type: string;
	daily_budget_usd: number;
	start_date: string;
	end_date: string;
	stats_30d: {
		impressions: number;
		clicks: number;
		cost_usd: number;
		conversions: number;
		ctr: number;
		conversion_rate: number;
	};
	ad_groups: InventoryAdGroup[];
	landing_pages: string[];
	sitelinks: Array<{ text: string; final_url: string }>;
}

export interface InventorySnapshotInput {
	script_version?: string;
	customer_id?: string;
	snapshot_at?: string;
	campaigns?: InventoryCampaign[];
	conversion_actions?: Array<{
		id: string;
		name: string;
		status: string;
		category: string;
		type: string;
	}>;
	stats_window?: string;
	note?: string;
}

export interface StoredInventorySnapshot {
	id: number;
	snapshot_at: string;
	script_version: string | null;
	customer_id: string | null;
	campaign_count: number;
	payload: InventorySnapshotInput;
	created_at: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate a posted snapshot. Returns the normalized payload or an error
 * string. Strict on shape, lenient on missing optional fields (the script
 * best-efforts each section and reports what it could read).
 */
export function validateInventorySnapshot(
	input: unknown,
): { ok: true; snapshot: InventorySnapshotInput } | { ok: false; error: string } {
	if (!isObject(input)) return { ok: false, error: "snapshot must be a JSON object" };
	const campaigns = (input as InventorySnapshotInput).campaigns;
	if (!Array.isArray(campaigns)) return { ok: false, error: "snapshot.campaigns must be an array" };
	if (campaigns.length > 500) return { ok: false, error: "too many campaigns (max 500)" };
	for (const c of campaigns) {
		if (!isObject(c) || typeof (c as InventoryCampaign).name !== "string") {
			return { ok: false, error: "each campaign must be an object with a string name" };
		}
	}
	const raw = JSON.stringify(input);
	if (raw.length > INVENTORY_MAX_PAYLOAD_BYTES) {
		return {
			ok: false,
			error: `snapshot payload too large (${raw.length} bytes, max ${INVENTORY_MAX_PAYLOAD_BYTES})`,
		};
	}
	const snap = input as InventorySnapshotInput;
	return {
		ok: true,
		snapshot: {
			script_version: typeof snap.script_version === "string" ? snap.script_version : undefined,
			customer_id: typeof snap.customer_id === "string" ? snap.customer_id : undefined,
			snapshot_at: typeof snap.snapshot_at === "string" ? snap.snapshot_at : undefined,
			campaigns,
			conversion_actions: Array.isArray(snap.conversion_actions) ? snap.conversion_actions : undefined,
			stats_window: typeof snap.stats_window === "string" ? snap.stats_window : undefined,
			note: typeof snap.note === "string" ? snap.note : undefined,
		},
	};
}

export async function storeInventorySnapshot(
	db: D1Database,
	input: unknown,
): Promise<{ ok: true; id: number; campaign_count: number } | { ok: false; error: string }> {
	const validated = validateInventorySnapshot(input);
	if (!validated.ok) return validated;
	const snap = validated.snapshot;
	const snapshotAt = snap.snapshot_at ?? new Date().toISOString();
	const row = await db
		.prepare(
			`INSERT INTO google_ads_account_inventory
			 (snapshot_at, script_version, customer_id, campaign_count, payload_json)
			 VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(
			snapshotAt,
			snap.script_version ?? null,
			snap.customer_id ?? null,
			snap.campaigns!.length,
			JSON.stringify(snap),
		)
		.run();
	const id = Number(row.meta.last_row_id ?? 0);
	// Keep history bounded: retain the most recent 30 snapshots.
	await db
		.prepare(
			`DELETE FROM google_ads_account_inventory
			 WHERE id NOT IN (
			   SELECT id FROM google_ads_account_inventory
			   ORDER BY snapshot_at DESC LIMIT 30
			 )`,
		)
		.run()
		.catch(() => undefined);
	return { ok: true, id, campaign_count: snap.campaigns!.length };
}

export async function getLatestInventorySnapshot(
	db: D1Database,
): Promise<StoredInventorySnapshot | null> {
	const row = await db
		.prepare(
			`SELECT id, snapshot_at, script_version, customer_id, campaign_count,
			        payload_json, created_at
			 FROM google_ads_account_inventory
			 ORDER BY snapshot_at DESC LIMIT 1`,
		)
		.first<{
			id: number;
			snapshot_at: string;
			script_version: string | null;
			customer_id: string | null;
			campaign_count: number;
			payload_json: string;
			created_at: string;
		}>();
	if (!row) return null;
	let payload: InventorySnapshotInput;
	try {
		payload = JSON.parse(row.payload_json) as InventorySnapshotInput;
	} catch {
		payload = { campaigns: [] };
	}
	return {
		id: row.id,
		snapshot_at: row.snapshot_at,
		script_version: row.script_version,
		customer_id: row.customer_id,
		campaign_count: row.campaign_count,
		payload,
		created_at: row.created_at,
	};
}
