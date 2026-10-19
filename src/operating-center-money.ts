import { getFundView } from "./fund";
import { getSponsorshipAssetsView } from "./sponsorship-asset";
import { getLaneGates, type LaneGate } from "./lib/money-receipts";

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
	/** For licenses: paid vs free record counts. */
	paid_count?: number;
	free_count?: number;
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

export interface ExecutiveMoneyMembershipRecord {
	membership_id: string;
	level_name: string | null;
	amount_paid_cents: number | null;
	is_paid: boolean;
	start_date: string | null;
	end_date: string | null;
	status: string;
	source_ref: string;
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
	memberships: ExecutiveMoneyMembershipRecord[];
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
	/** Phase 2 (TZ 13): the money cycle itself — lane gates, the receipts
	 * registry with territory attribution, received-vs-expected separation,
	 * and the Florida pilot cycle from source to real receipt. */
	money_cycle: MoneyCycleSection;
	disclaimer: string;
}

export interface MoneyCycleReceipt {
	event_key: string;
	event_type: string;
	lane: string;
	occurred_at: string | null;
	gross_cents: number | null;
	territory_id: string | null;
	territory_name: string | null;
	restriction: string | null;
	source_prospect_id: number | null;
	source_org: string | null;
	attribution: string;
}

export interface MoneyCycleFlorida {
	state_territory_id: string;
	sources: number;
	outreach_sent: number;
	replies: number;
	interested_replies: number;
	receipts_count: number;
	receipts_gross_cents: number;
	donation_cents: number;
	sponsorship_contract_cents: number;
	sponsorship_contract_receipts: number;
	first_case: {
		prospect_id: number;
		org_name: string;
		track: string;
		city_state: string | null;
		first_sent_at: string | null;
		reply_classification: string | null;
		reply_received_at: string | null;
		money_received_cents: number;
		stage: string;
	} | null;
}

export interface MoneyCycleSection {
	lane_gates: LaneGate[] | null;
	lane_gates_note: string | null;
	receipts_registry: MoneyCycleReceipt[];
	received_totals_by_lane: Record<string, { events: number; gross_cents: number }>;
	received_totals_note: string;
	expected_not_received: {
		sponsor_commitments_count: number;
		sponsor_commitments_cents: number;
		note: string;
	};
	florida_cycle: MoneyCycleFlorida | null;
	basis: string;
}

const num = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

// Phase 1 Money Ingestion: donation outcomes from canonical D1 monetary
// state (money_events), per ADR-0044. This reads Engine state only — it
// never re-reads RunSignup. Falls back to "not connected" when the money
// event store has no rows yet (or the migration has not run here).
async function getDonationOutcome(db: D1Database, tenantId: string = "nwana"): Promise<ExecutiveMoneyView["donations"]> {	const unavailable = (reason: string): ExecutiveMoneyView["donations"] => ({
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
				 FROM money_events WHERE event_type = 'donation_received' AND tenant_id = ?`,
			)
			.bind(tenantId)
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
	tenantId: string = "nwana",
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
				 FROM money_events WHERE event_type IN (${placeholders}) AND tenant_id = ?`,
			)
			.bind(...eventTypes, tenantId)
			.first<{
				event_count: number; transaction_count: number;
				total_gross_cents: number; total_refunds_cents: number;
				latest_occurred_at: string | null;
			}>();
		if (!row) return empty;
		const out: ExecutiveMoneyRevenueCategory = {
			event_count: num(row.event_count),
			transaction_count: num(row.transaction_count),
			total_gross_cents: num(row.total_gross_cents),
			total_refunds_cents: num(row.total_refunds_cents),
			currency: "USD",
			latest_occurred_at: row.latest_occurred_at,
		};
		// For licenses: paid vs free record counts (from operational truth).
		if (eventTypes.some((t) => t.startsWith("license_"))) {
			try {
				const pc = await db
					.prepare(
						`SELECT COUNT(CASE WHEN is_paid = 1 THEN 1 END) AS paid_count,
								COUNT(CASE WHEN is_paid = 0 THEN 1 END) AS free_count
						 FROM memberorg_memberships`,
					)
					.first<{ paid_count: number; free_count: number }>();
				if (pc) {
					out.paid_count = num(pc.paid_count);
					out.free_count = num(pc.free_count);
				}
			} catch {
				// Table may not exist yet.
			}
		}
		return out;
	} catch {
		return empty;
	}
}

/**
 * Per-source-object breakdown from canonical money_events + money_sync_state.
 * Includes $0 sources: a source with zero events still appears when it has
 * a sync-state row (verified $0 is production truth, not absence).
 */
async function getSourceBreakdown(db: D1Database, tenantId: string = "nwana"): Promise<ExecutiveMoneySourceBreakdown[]> {
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
				 WHERE source_ref LIKE '%/%' AND tenant_id = ?
				 GROUP BY source_prefix
				 ORDER BY source_prefix`,
			)
			.bind(tenantId)
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
async function getMemberOrgs(db: D1Database, tenantId: string = "nwana"): Promise<ExecutiveMoneyMemberOrg[]> {
	const out: ExecutiveMoneyMemberOrg[] = [];
	for (const org of MEMBERORG_CATALOG) {
		const entry: ExecutiveMoneyMemberOrg = {
			club_id: org.clubId, name: org.name, public_url: org.publicUrl,
			membership_count: 0, paid_membership_count: 0, free_membership_count: 0,
			gross_revenue_cents: 0, latest_membership_at: null,
			sync_state: "NOT_SYNCED", last_sync_at: null, memberships: [],
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
					   AND source_ref LIKE ? AND tenant_id = ?`,
				)
				.bind(`memberorg:${org.clubId}/%`, tenantId)
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
			try {
				const recs = await db
					.prepare(
						`SELECT membership_id, level_name, amount_paid_cents, is_paid,
								start_date, end_date, status, source_ref
						 FROM memberorg_memberships WHERE club_id = ?
						 ORDER BY membership_id`,
					)
					.bind(org.clubId)
					.all<{
						membership_id: string; level_name: string | null;
						amount_paid_cents: number | null; is_paid: number;
						start_date: string | null; end_date: string | null;
						status: string; source_ref: string;
					}>();
				for (const r of recs.results ?? []) {
					entry.memberships.push({
						membership_id: String(r.membership_id),
						level_name: r.level_name,
						amount_paid_cents: r.amount_paid_cents,
						is_paid: Number(r.is_paid) === 1,
						start_date: r.start_date,
						end_date: r.end_date,
						status: String(r.status ?? "UNKNOWN"),
						source_ref: String(r.source_ref ?? ""),
					});
				}
				// Prefer operational counts (includes $0 records as real issuances).
				if (entry.memberships.length > 0) {
					entry.membership_count = entry.memberships.length;
					entry.paid_membership_count = entry.memberships.filter((m) => m.is_paid).length;
					entry.free_membership_count = entry.membership_count - entry.paid_membership_count;
				}
			} catch {
				// Table may not exist yet; keep money_events-derived counts.
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

/** Lane of a stored event when funding_lane was never backfilled (pre-0098 rows). */
export function laneForEventType(eventType: string): string {
	switch (eventType) {
		case "donation_received":
		case "fundraiser_donation_received":
			return "donation";
		case "registration_paid":
			return "registration";
		case "license_purchased":
		case "license_renewed":
			return "license";
		case "sponsorship_received":
			return "sponsorship";
		case "contract_payment_received":
			return "contract";
		case "grant_received":
			return "grant";
		default:
			return "other";
	}
}

const FLORIDA_STATE_TERRITORY_ID = "terr-st-12";
const FLORIDA_STATE_FIPS = "12";
/** SQL predicate: the row's territory belongs to the Florida subtree. */
const FL_SUBTREE = `IN (SELECT territory_id FROM territories WHERE territory_id = '${FLORIDA_STATE_TERRITORY_ID}' OR state_fips = '${FLORIDA_STATE_FIPS}')`;

/**
 * Phase 2 money cycle (TZ 13 Phase 2, criteria 3/7/8): gates, receipts
 * registry, received-vs-expected, and the Florida cycle. Reads Engine
 * state only (ADR-0044). Every part degrades independently: before
 * migration 0098 / the territory backfill are applied, the affected part
 * reports its pending state instead of failing the whole money view.
 */
export async function getMoneyCycle(db: D1Database): Promise<MoneyCycleSection> {
	const section: MoneyCycleSection = {
		lane_gates: null,
		lane_gates_note: null,
		receipts_registry: [],
		received_totals_by_lane: {},
		received_totals_note:
			"Totals sum VERIFIED gross only. fundraiser_donation_received rows mirror a donation_received row for the same money and are excluded from cycle totals to avoid double counting.",
		expected_not_received: {
			sponsor_commitments_count: 0,
			sponsor_commitments_cents: 0,
			note: "Commitments and asks are expectations, never received money (TZ criterion 7); they are shown separately and never enter received totals.",
		},
		florida_cycle: null,
		basis:
			"Attribution reads money_events.territory_id / funding_lane (migration 0098 + Phase 2 backfill). Before the backfill is applied, territory and Florida-cycle counts read zero — that is the staged state, not missing money.",
	};

	try {
		section.lane_gates = await getLaneGates(db);
	} catch {
		section.lane_gates_note = "funding_lane_gates not applied yet (migration 0098 pending)";
	}

	// Receipts registry + received totals.
	try {
		const rows = await db
			.prepare(
				`SELECT e.event_key, e.event_type, e.funding_lane, e.occurred_at,
						CASE WHEN e.gross_status = 'VERIFIED' THEN e.gross_cents ELSE NULL END AS gross_cents,
						e.territory_id, t.name AS territory_name, e.restriction,
						e.source_prospect_id, p.org_name AS source_org, e.attribution
				 FROM money_events e
				 LEFT JOIN territories t ON t.territory_id = e.territory_id
				 LEFT JOIN outreach_prospects p ON p.id = e.source_prospect_id
				 ORDER BY e.occurred_at DESC, e.ingested_at DESC LIMIT 50`,
			)
			.all<Record<string, unknown>>();
		for (const r of rows.results ?? []) {
			section.receipts_registry.push({
				event_key: String(r.event_key),
				event_type: String(r.event_type),
				lane: r.funding_lane ? String(r.funding_lane) : laneForEventType(String(r.event_type)),
				occurred_at: (r.occurred_at as string) ?? null,
				gross_cents: r.gross_cents == null ? null : num(r.gross_cents),
				territory_id: (r.territory_id as string) ?? null,
				territory_name: (r.territory_name as string) ?? null,
				restriction: (r.restriction as string) ?? null,
				source_prospect_id: r.source_prospect_id == null ? null : num(r.source_prospect_id),
				source_org: (r.source_org as string) ?? null,
				attribution: String(r.attribution ?? ""),
			});
		}
	} catch {
		try {
			const rows = await db
				.prepare(
					`SELECT e.event_key, e.event_type, e.occurred_at,
							CASE WHEN e.gross_status = 'VERIFIED' THEN e.gross_cents ELSE NULL END AS gross_cents,
							e.territory_id, t.name AS territory_name, e.attribution
					 FROM money_events e
					 LEFT JOIN territories t ON t.territory_id = e.territory_id
					 ORDER BY e.occurred_at DESC, e.ingested_at DESC LIMIT 50`,
				)
				.all<Record<string, unknown>>();
			for (const r of rows.results ?? []) {
				section.receipts_registry.push({
					event_key: String(r.event_key),
					event_type: String(r.event_type),
					lane: laneForEventType(String(r.event_type)),
					occurred_at: (r.occurred_at as string) ?? null,
					gross_cents: r.gross_cents == null ? null : num(r.gross_cents),
					territory_id: (r.territory_id as string) ?? null,
					territory_name: (r.territory_name as string) ?? null,
					restriction: null,
					source_prospect_id: null,
					source_org: null,
					attribution: String(r.attribution ?? ""),
				});
			}
		} catch {
			// Registry unavailable; totals below still stand on their own query.
		}
	}
	try {
		const totals = await db
			.prepare(
				`SELECT event_type, funding_lane, COUNT(*) AS events,
						COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0) AS gross_cents
				 FROM money_events
				 WHERE event_type NOT IN ('fundraiser_donation_received', 'fundraiser_created')
				 GROUP BY event_type, funding_lane`,
			)
			.all<{ event_type: string; funding_lane: string | null; events: number; gross_cents: number }>();
		for (const r of totals.results ?? []) {
			const lane = r.funding_lane ?? laneForEventType(r.event_type);
			const cur = section.received_totals_by_lane[lane] ?? { events: 0, gross_cents: 0 };
			cur.events += num(r.events);
			cur.gross_cents += num(r.gross_cents);
			section.received_totals_by_lane[lane] = cur;
		}
	} catch {
		try {
			const totals = await db
				.prepare(
					`SELECT event_type, COUNT(*) AS events,
							COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0) AS gross_cents
					 FROM money_events
					 WHERE event_type NOT IN ('fundraiser_donation_received', 'fundraiser_created')
					 GROUP BY event_type`,
				)
				.all<{ event_type: string; events: number; gross_cents: number }>();
			for (const r of totals.results ?? []) {
				const lane = laneForEventType(r.event_type);
				const cur = section.received_totals_by_lane[lane] ?? { events: 0, gross_cents: 0 };
				cur.events += num(r.events);
				cur.gross_cents += num(r.gross_cents);
				section.received_totals_by_lane[lane] = cur;
			}
		} catch {
			// Leave empty totals rather than failing the view.
		}
	}

	// Expected, not received: confirmed sponsor commitments.
	try {
		const c = await db
			.prepare(
				`SELECT COUNT(*) AS n, COALESCE(SUM(committed_amount_cents), 0) AS cents
				 FROM sponsor_commitments WHERE status = 'confirmed'`,
			)
			.first<{ n: number; cents: number }>();
		if (c) {
			section.expected_not_received.sponsor_commitments_count = num(c.n);
			section.expected_not_received.sponsor_commitments_cents = num(c.cents);
		}
	} catch {
		// Commitments table may not exist in a staged environment.
	}

	// Florida pilot cycle (TZ 4.2): source -> outreach -> reply -> receipt.
	try {
		const counts = await db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM outreach_prospects WHERE territory_id ${FL_SUBTREE}) AS sources,
					(SELECT COUNT(DISTINCT s.prospect_id) FROM outreach_sends s
					   JOIN outreach_prospects p ON p.id = s.prospect_id
					  WHERE p.territory_id ${FL_SUBTREE}) AS sent,
					(SELECT COUNT(DISTINCT r.prospect_id) FROM outreach_replies r
					   JOIN outreach_prospects p ON p.id = r.prospect_id
					  WHERE p.territory_id ${FL_SUBTREE}) AS replies,
					(SELECT COUNT(DISTINCT r.prospect_id) FROM outreach_replies r
					   JOIN outreach_prospects p ON p.id = r.prospect_id
					  WHERE p.territory_id ${FL_SUBTREE} AND r.classification = 'interested') AS interested,
					(SELECT COUNT(*) FROM money_events WHERE territory_id ${FL_SUBTREE}
					   AND event_type NOT IN ('fundraiser_donation_received', 'fundraiser_created')) AS receipts,
					(SELECT COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0)
					   FROM money_events WHERE territory_id ${FL_SUBTREE}
					   AND event_type NOT IN ('fundraiser_donation_received', 'fundraiser_created')) AS receipts_gross,
					(SELECT COUNT(*) FROM money_events WHERE territory_id ${FL_SUBTREE}
					   AND event_type IN ('sponsorship_received', 'contract_payment_received')) AS b2b_receipts,
					(SELECT COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0)
					   FROM money_events WHERE territory_id ${FL_SUBTREE}
					   AND event_type = 'donation_received') AS donation_gross,
					(SELECT COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0)
					   FROM money_events WHERE territory_id ${FL_SUBTREE}
					   AND event_type IN ('sponsorship_received', 'contract_payment_received')) AS b2b_gross`,
			)
			.first<Record<string, number>>();
		const fl: MoneyCycleFlorida = {
			state_territory_id: FLORIDA_STATE_TERRITORY_ID,
			sources: num(counts?.sources),
			outreach_sent: num(counts?.sent),
			replies: num(counts?.replies),
			interested_replies: num(counts?.interested),
			receipts_count: num(counts?.receipts),
			receipts_gross_cents: num(counts?.receipts_gross),
			donation_cents: num(counts?.donation_gross),
			sponsorship_contract_cents: num(counts?.b2b_gross),
			sponsorship_contract_receipts: num(counts?.b2b_receipts),
			first_case: null,
		};
		try {
			const fc = await db
				.prepare(
					`SELECT p.id AS prospect_id, p.org_name, p.track, p.city_state,
							(SELECT MIN(s.sent_at) FROM outreach_sends s WHERE s.prospect_id = p.id) AS first_sent_at,
							r.classification AS reply_classification, r.received_at AS reply_received_at,
							COALESCE((SELECT SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END)
								FROM money_events WHERE source_prospect_id = p.id), 0) AS money_received_cents
					 FROM outreach_prospects p
					 JOIN outreach_replies r ON r.prospect_id = p.id
					 WHERE p.territory_id ${FL_SUBTREE}
					 ORDER BY r.received_at ASC LIMIT 1`,
				)
				.first<Record<string, unknown>>();
			if (fc) {
				const money = num(fc.money_received_cents);
				fl.first_case = {
					prospect_id: num(fc.prospect_id),
					org_name: String(fc.org_name ?? ""),
					track: String(fc.track ?? ""),
					city_state: (fc.city_state as string) ?? null,
					first_sent_at: (fc.first_sent_at as string) ?? null,
					reply_classification: (fc.reply_classification as string) ?? null,
					reply_received_at: (fc.reply_received_at as string) ?? null,
					money_received_cents: money,
					stage: money > 0
						? "full cycle: source, outreach, reply, money received and attributed"
						: "cycle open at the reply stage: no money received from this source yet",
				};
			}
		} catch {
			// First-case detail is additive; counts above already carry the cycle.
		}
		section.florida_cycle = fl;
	} catch {
		section.florida_cycle = null;
	}

	return section;
}

export async function getExecutiveMoneyView(
	db: D1Database,
	tenantId: string = "nwana",
): Promise<ExecutiveMoneyView> {
	const [fundView, sponsorshipView, donationOutcome, donationsCat, registrationsCat, licensesCat, sources, memberorgs, moneyCycle] =
		await Promise.all([
			getFundView(db),
			getSponsorshipAssetsView(db),
			getDonationOutcome(db, tenantId),
			getRevenueCategory(db, ["donation_received", "fundraiser_donation_received"], tenantId),
			getRevenueCategory(db, ["registration_paid"], tenantId),
			getRevenueCategory(db, ["license_purchased", "license_renewed"], tenantId),
			getSourceBreakdown(db, tenantId),
			getMemberOrgs(db, tenantId),
			getMoneyCycle(db),
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
		money_cycle: moneyCycle,
		disclaimer:
			"Fundraising and sponsorship are separate processes, relationships, and lifecycles. This view aggregates them for visibility only.",
	};
}
