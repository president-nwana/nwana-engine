import { getFundView } from "./fund";
import { getSponsorshipAssetsView } from "./sponsorship-asset";

// Executive money view: a read-only, on-demand aggregation for the owner.
// Fundraising and sponsorship are separate processes, separate
// relationships, and separate lifecycles. This view only places their
// numbers side by side for visibility; it merges no tables, no stages,
// and performs no writes.

export interface ExecutiveMoneyFundSummary {
	id: string;
	name: string;
	goal_amount: number;
	raised_amount: number;
	currency: string;
	status: string;
	stage_counts: Record<string, number>;
	ask_by_stage: Record<string, number>;
	committed_ask_total: number;
	follow_ups_due_now: number;
}

export interface ExecutiveMoneySponsorshipSummary {
	assets: Array<{
		id: string;
		title: string;
		object_type: string;
		object_id: string;
		stage: string;
		next_action: string;
	}>;
	stage_counts: Record<string, number>;
	committed_count: number;
	note: string;
}

export interface ExecutiveMoneyRevenueCategory {
	event_count: number;
	transaction_count: number;
	total_gross_cents: number;
	total_refunds_cents: number;
	currency: string;
	latest_occurred_at: string | null;
}

export interface ExecutiveMoneySourceBreakdown {
	source_key: string;
	source_label: string;
	event_count: number;
	total_gross_cents: number;
	total_refunds_cents: number;
	latest_occurred_at: string | null;
	last_sync_at: string | null;
}

export interface ExecutiveMoneyMemberOrg {
	club_id: string;
	name: string;
	public_url: string;
	membership_count: number;
	paid_membership_count: number;
	free_membership_count: number;
	gross_revenue_cents: number;
	latest_membership_at: string | null;
	sync_state: string;
	last_sync_at: string | null;
}

export interface ExecutiveMoneyView {
	ok: true;
	generated_at: string;
	fundraising: {
		funds: ExecutiveMoneyFundSummary[];
		totals: {
			goal_amount: number;
			raised_amount: number;
			committed_ask_total: number;
		};
	};
	donations: {
		available: boolean;
		reason: string;
		event_count: number;
		total_gross_cents: number;
		currency: string;
		last_sync_at: string | null;
	};
	/** Total verified revenue across all canonical money categories. */
	total_verified_revenue: {
		donations: ExecutiveMoneyRevenueCategory;
		registrations: ExecutiveMoneyRevenueCategory;
		licenses: ExecutiveMoneyRevenueCategory;
		total_gross_cents: number;
		total_refunds_cents: number;
		currency: string;
	};
	/** Per-source-object breakdown (races + MemberOrgs), including $0 sources. */
	sources: ExecutiveMoneySourceBreakdown[];
	/** MemberOrg source objects with membership counts and revenue. */
	memberorgs: ExecutiveMoneyMemberOrg[];
	sponsorship: ExecutiveMoneySponsorshipSummary;
	disclaimer: string;
}

const num = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

// Phase 1 Money Ingestion: donation outcomes from canonical D1 monetary
// state (money_events), per ADR-0044. This reads Engine state only — it
// never re-reads RunSignup. Falls back to "not connected" when the money
// event store has no rows yet (or the migration has not run here).
async function getDonationOutcome(db: D1Database): Promise<ExecutiveMoneyView["donations"]> {	const unavailable = (reason: string): ExecutiveMoneyView["donations"] => ({
		available: false,
		reason,
		event_count: 0,
		total_gross_cents: 0,
		currency: "USD",
		last_sync_at: null,
	});
	try {
		const agg = await db
			.prepare(
				`SELECT COUNT(*) AS event_count,
						COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0) AS total_gross_cents
				 FROM money_events WHERE event_type = 'donation_received'`,
			)
			.first<{ event_count: number; total_gross_cents: number }>();
		const sync = await db
			.prepare(`SELECT last_sync_at FROM money_sync_state WHERE source_key = ?`)
			.bind("runsignup:donations:race:212466")
			.first<{ last_sync_at: string | null }>();
		const eventCount = num(agg?.event_count);
		if (eventCount === 0) {
			return unavailable(
				sync?.last_sync_at
					? "Donation feed synced; no donations recorded yet"
					: "Donation outcome feed is not connected yet",
			);
		}
		return {
			available: true,
			reason: "RunSignup donations ingested into canonical Engine monetary state",
			event_count: eventCount,
			total_gross_cents: num(agg?.total_gross_cents),
			currency: "USD",
			last_sync_at: sync?.last_sync_at ?? null,
		};
	} catch {
		return unavailable("Donation outcome feed is not connected yet");
	}
}


/**
 * Aggregate one revenue category from canonical money_events.
 * Reads Engine state only (ADR-0044). Gross sums VERIFIED amounts only;
 * refunds sum VERIFIED refund amounts.
 */
async function getRevenueCategory(
	db: D1Database,
	eventTypes: string[],
): Promise<ExecutiveMoneyRevenueCategory> {
	const empty: ExecutiveMoneyRevenueCategory = {
		event_count: 0, transaction_count: 0, total_gross_cents: 0,
		total_refunds_cents: 0, currency: "USD", latest_occurred_at: null,
	};
	try {
		const placeholders = eventTypes.map(() => "?").join(",");
		const row = await db
			.prepare(
				`SELECT COUNT(*) AS event_count,
						COUNT(DISTINCT transaction_key) AS transaction_count,
						COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0) AS total_gross_cents,
						COALESCE(SUM(CASE WHEN refund_status = 'VERIFIED' THEN refund_cents ELSE 0 END), 0) AS total_refunds_cents,
						MAX(occurred_at) AS latest_occurred_at
				 FROM money_events WHERE event_type IN (${placeholders})`,
			)
			.bind(...eventTypes)
			.first<{
				event_count: number; transaction_count: number;
				total_gross_cents: number; total_refunds_cents: number;
				latest_occurred_at: string | null;
			}>();
		if (!row) return empty;
		return {
			event_count: num(row.event_count),
			transaction_count: num(row.transaction_count),
			total_gross_cents: num(row.total_gross_cents),
			total_refunds_cents: num(row.total_refunds_cents),
			currency: "USD",
			latest_occurred_at: row.latest_occurred_at,
		};
	} catch {
		return empty;
	}
}

/**
 * Per-source-object breakdown from canonical money_events + money_sync_state.
 * Includes $0 sources: a source with zero events still appears when it has
 * a sync-state row (verified $0 is production truth, not absence).
 */
async function getSourceBreakdown(db: D1Database): Promise<ExecutiveMoneySourceBreakdown[]> {
	const out: ExecutiveMoneySourceBreakdown[] = [];
	try {
		const events = await db
			.prepare(
				`SELECT SUBSTR(source_ref, 1, INSTR(source_ref, '/') - 1) AS source_prefix,
						COUNT(*) AS event_count,
						COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0) AS total_gross_cents,
						COALESCE(SUM(CASE WHEN refund_status = 'VERIFIED' THEN refund_cents ELSE 0 END), 0) AS total_refunds_cents,
						MAX(occurred_at) AS latest_occurred_at
				 FROM money_events
				 WHERE source_ref LIKE '%/%'
				 GROUP BY source_prefix
				 ORDER BY source_prefix`,
			)
			.all<{
				source_prefix: string; event_count: number; total_gross_cents: number;
				total_refunds_cents: number; latest_occurred_at: string | null;
			}>();
		const syncRows = await db
			.prepare(`SELECT source_key, last_sync_at FROM money_sync_state`)
			.all<{ source_key: string; last_sync_at: string | null }>();
		const syncByPrefix = new Map<string, string | null>();
		for (const r of syncRows.results ?? []) {
			// Map runsignup:donations:race:210018 -> race:210018, etc.
			const m = /:(race:\d+|memberorg:\d+)$/.exec(r.source_key.replace(/:backfill$/, ""));
			const prefix = m ? m[1] : r.source_key;
			if (!syncByPrefix.has(prefix)) syncByPrefix.set(prefix, r.last_sync_at);
		}
		for (const e of events.results ?? []) {
			const prefix = String(e.source_prefix ?? "");
			out.push({
				source_key: prefix,
				source_label: prefix,
				event_count: num(e.event_count),
				total_gross_cents: num(e.total_gross_cents),
				total_refunds_cents: num(e.total_refunds_cents),
				latest_occurred_at: e.latest_occurred_at,
				last_sync_at: syncByPrefix.get(prefix) ?? null,
			});
		}
		// Add $0 sources that have sync state but no events yet.
		for (const [prefix, lastSync] of syncByPrefix) {
			if (!out.some((o) => o.source_key === prefix) && /^(race:|memberorg:)/.test(prefix)) {
				out.push({
					source_key: prefix, source_label: prefix, event_count: 0,
					total_gross_cents: 0, total_refunds_cents: 0,
					latest_occurred_at: null, last_sync_at: lastSync,
				});
			}
		}
		out.sort((a, b) => (a.source_key < b.source_key ? -1 : 1));
	} catch {
		// Return whatever was collected; never fail the whole view.
	}
	return out;
}

/** Known MemberOrg source objects (verified 2026-10-01). */
const MEMBERORG_CATALOG: Array<{ clubId: string; name: string; publicUrl: string }> = [
	{ clubId: "3335", name: "NWANA NW Groups", publicUrl: "https://runsignup.com/MemberOrg/NWANANWGroups" },
	{ clubId: "3338", name: "NW Group Miami", publicUrl: "https://runsignup.com/MemberOrg/NWGroupMiami" },
];

/**
 * MemberOrg status from canonical money_events + money_sync_state.
 * $0 is production truth: a MemberOrg with no paid memberships still
 * appears with its verified counts.
 */
async function getMemberOrgs(db: D1Database): Promise<ExecutiveMoneyMemberOrg[]> {
	const out: ExecutiveMoneyMemberOrg[] = [];
	for (const org of MEMBERORG_CATALOG) {
		const entry: ExecutiveMoneyMemberOrg = {
			club_id: org.clubId, name: org.name, public_url: org.publicUrl,
			membership_count: 0, paid_membership_count: 0, free_membership_count: 0,
			gross_revenue_cents: 0, latest_membership_at: null,
			sync_state: "NOT_SYNCED", last_sync_at: null,
		};
		try {
			const agg = await db
				.prepare(
					`SELECT COUNT(*) AS membership_count,
							COUNT(CASE WHEN gross_cents > 0 AND gross_status = 'VERIFIED' THEN 1 END) AS paid_count,
							COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0) AS gross_cents,
							MAX(occurred_at) AS latest_at
					 FROM money_events
					 WHERE event_type IN ('license_purchased', 'license_renewed')
					   AND source_ref LIKE ?`,
				)
				.bind(`memberorg:${org.clubId}/%`)
				.first<{
					membership_count: number; paid_count: number;
					gross_cents: number; latest_at: string | null;
				}>();
			if (agg) {
				entry.membership_count = num(agg.membership_count);
				entry.paid_membership_count = num(agg.paid_count);
				entry.free_membership_count = entry.membership_count - entry.paid_membership_count;
				entry.gross_revenue_cents = num(agg.gross_cents);
				entry.latest_membership_at = agg.latest_at;
			}
			const sync = await db
				.prepare(`SELECT last_sync_at, last_error FROM money_sync_state WHERE source_key = ?`)
				.bind(`runsignup:memberorg:members:club:${org.clubId}`)
				.first<{ last_sync_at: string | null; last_error: string | null }>();
			if (sync) {
				entry.last_sync_at = sync.last_sync_at;
				entry.sync_state = sync.last_error ? `ERROR: ${sync.last_error}` : "SYNCED";
			}
		} catch {
			// Keep defaults; never fail the whole view.
		}
		out.push(entry);
	}
	return out;
}

export async function getExecutiveMoneyView(
	db: D1Database,
): Promise<ExecutiveMoneyView> {
	const [fundView, sponsorshipView, donationOutcome, donationsCat, registrationsCat, licensesCat, sources, memberorgs] =
		await Promise.all([
			getFundView(db),
			getSponsorshipAssetsView(db),
			getDonationOutcome(db),
			getRevenueCategory(db, ["donation_received", "fundraiser_donation_received"]),
			getRevenueCategory(db, ["registration_paid"]),
			getRevenueCategory(db, ["license_purchased", "license_renewed"]),
			getSourceBreakdown(db),
			getMemberOrgs(db),
		]);

	const total_verified_revenue = {
		donations: donationsCat,
		registrations: registrationsCat,
		licenses: licensesCat,
		total_gross_cents:
			donationsCat.total_gross_cents +
			registrationsCat.total_gross_cents +
			licensesCat.total_gross_cents,
		total_refunds_cents:
			donationsCat.total_refunds_cents +
			registrationsCat.total_refunds_cents +
			licensesCat.total_refunds_cents,
		currency: "USD",
	};

	const funds: ExecutiveMoneyFundSummary[] = fundView.funds.map((entry) => {
		const ask_by_stage: Record<string, number> = {};
		for (const prospect of entry.prospects) {
			const stage = String(prospect.stage ?? "unknown");
			ask_by_stage[stage] = (ask_by_stage[stage] ?? 0) + num(prospect.ask_amount);
		}
		const committed_ask_total = entry.prospects
			.filter((prospect) => prospect.stage === "committed")
			.reduce((sum, prospect) => sum + num(prospect.ask_amount), 0);
		return {
			id: entry.fund.id,
			name: entry.fund.name,
			goal_amount: num(entry.fund.goal_amount),
			raised_amount: num(entry.fund.raised_amount),
			currency: entry.fund.currency,
			status: entry.fund.status,
			stage_counts: entry.stage_counts,
			ask_by_stage,
			committed_ask_total,
			follow_ups_due_now: entry.follow_ups_due_now,
		};
	});

	const totals = {
		goal_amount: funds.reduce((sum, f) => sum + f.goal_amount, 0),
		raised_amount: funds.reduce((sum, f) => sum + f.raised_amount, 0),
		committed_ask_total: funds.reduce((sum, f) => sum + f.committed_ask_total, 0),
	};

	const stage_counts: Record<string, number> = {};
	for (const asset of sponsorshipView.assets) {
		const stage = String(asset.stage ?? "unknown");
		stage_counts[stage] = (stage_counts[stage] ?? 0) + 1;
	}

	return {
		ok: true,
		generated_at: new Date().toISOString(),
		fundraising: { funds, totals },
		donations: donationOutcome,
		total_verified_revenue,
		sources,
		memberorgs,
		sponsorship: {
			assets: sponsorshipView.assets.map((asset) => ({
				id: asset.id,
				title: asset.title,
				object_type: asset.object_type,
				object_id: asset.object_id,
				stage: asset.stage,
				next_action: asset.next_action,
			})),
			stage_counts,
			committed_count: stage_counts["committed"] ?? 0,
			note: "Agreement values are not recorded in the machine; stages and counts only.",
		},
		disclaimer:
			"Fundraising and sponsorship are separate processes, relationships, and lifecycles. This view aggregates them for visibility only.",
	};
}
