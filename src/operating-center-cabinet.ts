// Phase 3 Operating Center cabinet backend (TZ edition 7, Phase 3).
//
// Read-only aggregation module behind the cabinet screens: the Florida
// cabinet, the today queue, the CRM prospect list and card, the funding
// pipeline, grants, territory budgets, people, the groups registry, the
// territory drilldown and the education view.
//
// Rules held throughout:
// - Money-cycle facts (lane gates, receipts registry, received totals,
//   the Florida cycle) come from getMoneyCycle in
//   operating-center-money.ts. This module does not re-derive them where
//   the money cycle already provides them.
// - Every number comes from SQL against Engine state. Nothing is
//   invented, estimated or carried over from a plan document.
// - Each section degrades independently: a missing table or a failed
//   query yields that section's empty shape (with a *_note where the
//   spec provides one), never a failed whole view.
// - Academy data is aggregates only. No user-level snapshot rows, no
//   names, no form payloads are ever selected for display.

import {
	getMoneyCycle,
	laneForEventType,
	type MoneyCycleFlorida,
	type MoneyCycleSection,
} from "./operating-center-money";
import type { LaneGate } from "./lib/money-receipts";

const num = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

const FLORIDA_TERRITORY_ID = "terr-st-12";
/** SQL predicate fragment: the row's territory is in the Florida subtree.
 * Identical to operating-center-money.ts: a row belongs to Florida when
 * its territory_id is the Florida state territory or carries state FIPS
 * 12. Use as `territory_id ${FL_SUBTREE}` (alias the column as needed). */
const FL_SUBTREE = `IN (SELECT territory_id FROM territories WHERE territory_id = 'terr-st-12' OR state_fips = '12')`;
/** Direct predicate for rows OF the territories table itself. */
const FL_TERRITORY_WHERE = `territory_id = 'terr-st-12' OR state_fips = '12'`;

/** Received-money event types (migration 0098 vocabulary). The
 * fundraiser mirror type fundraiser_donation_received is deliberately
 * absent: it mirrors a donation_received row for the same money. */
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

const ACADEMY_NOTE = "Aggregates only. Individual Academy names are never displayed anywhere.";
const PIPELINE_ORDER = [
	"Submitted",
	"Screening",
	"Candidate Pool",
	"Funding Available",
	"Offer & Agreement",
	"Appointed",
];

// ---------------------------------------------------------------------------
// Small defensive query helpers (the getMoneyCycle pattern: a failed query
// yields the empty value for its section, never a thrown view).
// ---------------------------------------------------------------------------

async function firstRow<T extends Record<string, unknown>>(
	db: D1Database,
	sql: string,
	binds: unknown[] = [],
): Promise<T | null> {
	try {
		return await db.prepare(sql).bind(...binds).first<T>();
	} catch {
		return null;
	}
}

async function allRows<T extends Record<string, unknown>>(
	db: D1Database,
	sql: string,
	binds: unknown[] = [],
): Promise<T[]> {
	try {
		const res = await db.prepare(sql).bind(...binds).all<T>();
		return res.results ?? [];
	} catch {
		return [];
	}
}

/** COUNT(*) style query whose single value column is aliased `n`. */
async function countOne(db: D1Database, sql: string, binds: unknown[] = []): Promise<number> {
	const row = await firstRow<{ n: number }>(db, sql, binds);
	return row ? num(row.n) : 0;
}

function countMap(rows: Array<Record<string, unknown>>, keyField: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const r of rows) {
		const key = r[keyField] == null ? "unknown" : String(r[keyField]);
		out[key] = num(r.n);
	}
	return out;
}

async function getMoneyCycleSafe(db: D1Database): Promise<MoneyCycleSection> {
	try {
		return await getMoneyCycle(db);
	} catch {
		return {
			lane_gates: null,
			lane_gates_note: "money cycle unavailable",
			receipts_registry: [],
			received_totals_by_lane: {},
			received_totals_note: "money cycle unavailable",
			expected_not_received: {
				sponsor_commitments_count: 0,
				sponsor_commitments_cents: 0,
				note: "Commitments are expectations, never received money.",
			},
			florida_cycle: null,
			basis: "money cycle unavailable",
		};
	}
}

// ---------------------------------------------------------------------------
// Shared section helpers
// ---------------------------------------------------------------------------

interface TerritoryTypeCounts {
	total: number;
	by_type: Record<string, number>;
}

async function territoriesByType(db: D1Database, florida: boolean): Promise<TerritoryTypeCounts> {
	const rows = florida
		? await allRows(
				db,
				`SELECT type, COUNT(*) AS n FROM territories WHERE ${FL_TERRITORY_WHERE} GROUP BY type ORDER BY type ASC`,
			)
		: await allRows(
				db,
				`SELECT type, COUNT(*) AS n FROM territories GROUP BY type ORDER BY type ASC`,
			);
	const by_type = countMap(rows, "type");
	return { total: Object.values(by_type).reduce((a, b) => a + b, 0), by_type };
}

interface GroupsSummary {
	total: number;
	by_status: Record<string, number>;
	defaults: number;
	forming: number;
	active: number;
}

async function groupsSummary(db: D1Database, florida: boolean): Promise<GroupsSummary> {
	const rows = florida
		? await allRows(
				db,
				`SELECT status, COUNT(*) AS n, COALESCE(SUM(CASE WHEN is_default = 1 THEN 1 ELSE 0 END), 0) AS defaults FROM nw_groups WHERE territory_id ${FL_SUBTREE} GROUP BY status ORDER BY status ASC`,
			)
		: await allRows(
				db,
				`SELECT status, COUNT(*) AS n, COALESCE(SUM(CASE WHEN is_default = 1 THEN 1 ELSE 0 END), 0) AS defaults FROM nw_groups GROUP BY status ORDER BY status ASC`,
			);
	const by_status = countMap(rows, "status");
	return {
		total: Object.values(by_status).reduce((a, b) => a + b, 0),
		by_status,
		defaults: rows.reduce((sum, r) => sum + num(r.defaults), 0),
		forming: by_status["FORMING"] ?? 0,
		active: by_status["ACTIVE"] ?? 0,
	};
}

interface AcademyAggregates {
	students: number;
	certified: number;
	by_course: Array<{ course_id: number; enrolled: number; certified: number }>;
	last_sync: string | null;
}

/** Aggregates only: COUNT / SUM / MAX over the snapshot, never user rows. */
async function academyAggregates(db: D1Database): Promise<AcademyAggregates> {
	const rows = await allRows<{
		course_id: number;
		enrolled: number;
		certified: number;
		last_sync: string | null;
	}>(
		db,
		`SELECT course_id, COUNT(*) AS enrolled, COALESCE(SUM(CASE WHEN certified = 1 THEN 1 ELSE 0 END), 0) AS certified, MAX(synced_at) AS last_sync FROM academy_instructor_snapshot GROUP BY course_id ORDER BY course_id ASC LIMIT 100`,
	);
	const by_course = rows.map((r) => ({
		course_id: num(r.course_id),
		enrolled: num(r.enrolled),
		certified: num(r.certified),
	}));
	let last_sync: string | null = null;
	for (const r of rows) {
		if (r.last_sync && (!last_sync || r.last_sync > last_sync)) last_sync = r.last_sync;
	}
	return {
		students: by_course.reduce((s, c) => s + c.enrolled, 0),
		certified: by_course.reduce((s, c) => s + c.certified, 0),
		by_course,
		last_sync,
	};
}

interface TerritoryChainRow {
	territory_id: string;
	type: string;
	name: string;
}

/** Walk from a territory up to the root, at most maxSteps entries,
 * starting territory first. */
async function walkTerritoryChain(
	db: D1Database,
	startId: string | null,
	maxSteps = 6,
): Promise<TerritoryChainRow[]> {
	const chain: TerritoryChainRow[] = [];
	const seen = new Set<string>();
	let current: string | null = startId;
	while (current && chain.length < maxSteps && !seen.has(current)) {
		seen.add(current);
		const row = await firstRow<{
			territory_id: string;
			type: string;
			name: string;
			parent_territory_id: string | null;
		}>(
			db,
			`SELECT territory_id, type, name, parent_territory_id FROM territories WHERE territory_id = ?`,
			[current],
		);
		if (!row) break;
		chain.push({ territory_id: String(row.territory_id), type: String(row.type), name: String(row.name) });
		current = row.parent_territory_id ? String(row.parent_territory_id) : null;
	}
	return chain;
}

/** CONTINENTAL and NATIONAL root territory ids, looked up by type. */
async function rootTerritoryIds(db: D1Database): Promise<{ continental: string | null; national: string | null; ids: string[] }> {
	const rows = await allRows<{ territory_id: string; type: string }>(
		db,
		`SELECT territory_id, type FROM territories WHERE type IN ('CONTINENTAL', 'NATIONAL') ORDER BY type ASC LIMIT 10`,
	);
	const continental = rows.find((r) => r.type === "CONTINENTAL")?.territory_id ?? null;
	const national = rows.find((r) => r.type === "NATIONAL")?.territory_id ?? null;
	return {
		continental: continental ? String(continental) : null,
		national: national ? String(national) : null,
		ids: rows.map((r) => String(r.territory_id)),
	};
}

/**
 * Received coverage by lane for one scope: VERIFIED rows of received
 * event types only (the fundraiser mirror is not a received type here).
 * Returns the budget register shape [{ lane, events, cents }].
 */
async function receivedByLane(
	db: D1Database,
	scopePredicate: string,
	scopeBinds: unknown[],
): Promise<Array<{ lane: string; events: number; cents: number }>> {
	const placeholders = RECEIVED_EVENT_TYPES.map(() => "?").join(", ");
	const rows = await allRows<{ event_type: string; funding_lane: string | null; events: number; cents: number }>(
		db,
		`SELECT event_type, funding_lane, COUNT(*) AS events, COALESCE(SUM(gross_cents), 0) AS cents FROM money_events WHERE gross_status = 'VERIFIED' AND event_type IN (${placeholders}) ${scopePredicate} GROUP BY event_type, funding_lane ORDER BY event_type ASC`,
		[...RECEIVED_EVENT_TYPES, ...scopeBinds],
	);
	const byLane = new Map<string, { lane: string; events: number; cents: number }>();
	for (const r of rows) {
		const lane = r.funding_lane ? String(r.funding_lane) : laneForEventType(String(r.event_type));
		const cur = byLane.get(lane) ?? { lane, events: 0, cents: 0 };
		cur.events += num(r.events);
		cur.cents += num(r.cents);
		byLane.set(lane, cur);
	}
	return [...byLane.values()].sort((a, b) => (a.lane < b.lane ? -1 : 1));
}

// ---------------------------------------------------------------------------
// 2 (computed first): the today queue. getCabinetView reuses its counts.
// ---------------------------------------------------------------------------

export interface TodayQueueItem {
	kind: "reply_decision" | "reply_substantive" | "followup_due" | "application_new" | "step1_queued" | "receipt_unattributed";
	title: string;
	detail: string;
	prospect_id?: number;
	org_name?: string;
	due_at?: string;
}

export interface TodayCounts {
	reply_decision: number;
	reply_substantive: number;
	followups_due: number;
	replies_waiting: number;
	applications_new: number;
	unsent_step1: number;
	unattributed_receipts: number;
}

export interface NextFollowup {
	step: number;
	due_at: string;
	cohort_sent_at: string;
	count: number;
}

interface TodayQueueData {
	items: TodayQueueItem[];
	counts: TodayCounts;
	note: string;
	next_followup: NextFollowup | null;
}

async function computeTodayQueue(db: D1Database, nowIso?: string): Promise<TodayQueueData> {
	const parsed = nowIso ? Date.parse(nowIso) : NaN;
	const nowMs = Number.isFinite(parsed) ? parsed : Date.now();
	const items: TodayQueueItem[] = [];

	// a. Replies whose engine action says a draft response waits on Albert.
	let replyDecision = 0;
	try {
		const rows = await allRows<{
			prospect_id: number | null;
			org_name: string | null;
			classification: string | null;
			received_at: string | null;
			engine_action: string | null;
		}>(
			db,
			`SELECT r.prospect_id AS prospect_id, p.org_name AS org_name, r.classification AS classification, r.received_at AS received_at, r.engine_action AS engine_action FROM outreach_replies r LEFT JOIN outreach_prospects p ON p.id = r.prospect_id WHERE r.engine_action LIKE '%draft response for Albert%' ORDER BY r.received_at ASC LIMIT 100`,
		);
		for (const r of rows) {
			const org = r.org_name ? String(r.org_name) : "Unknown organization";
			items.push({
				kind: "reply_decision",
				title: `${org} reply is waiting for a draft decision`,
				detail: `Classification: ${r.classification ? String(r.classification) : "other"}. Received: ${r.received_at ? String(r.received_at) : "unknown"}. Engine action: ${r.engine_action ? String(r.engine_action) : ""}`,
				prospect_id: r.prospect_id == null ? undefined : num(r.prospect_id),
				org_name: org,
			});
			replyDecision += 1;
		}
	} catch {
		// Section degrades to no items; counts below stay honest zeros.
	}

	// b. Substantive replies (interested / question) not already in (a).
	let replySubstantive = 0;
	try {
		const rows = await allRows<{
			prospect_id: number | null;
			org_name: string | null;
			classification: string | null;
			received_at: string | null;
		}>(
			db,
			`SELECT r.prospect_id AS prospect_id, p.org_name AS org_name, r.classification AS classification, r.received_at AS received_at FROM outreach_replies r LEFT JOIN outreach_prospects p ON p.id = r.prospect_id WHERE r.classification IN ('interested', 'question') AND COALESCE(r.engine_action, '') NOT LIKE '%draft response for Albert%' ORDER BY r.received_at ASC LIMIT 100`,
		);
		for (const r of rows) {
			const org = r.org_name ? String(r.org_name) : "Unknown organization";
			const classification = r.classification ? String(r.classification) : "other";
			items.push({
				kind: "reply_substantive",
				title: `${org} replied (${classification})`,
				detail: `Substantive reply received ${r.received_at ? String(r.received_at) : "unknown"}; classification ${classification}.`,
				prospect_id: r.prospect_id == null ? undefined : num(r.prospect_id),
				org_name: org,
			});
			replySubstantive += 1;
		}
	} catch {
		// Degrades as above.
	}

	// c. Follow-ups due: last sent step s, next step s+1 configured for the
	// track, due_at = last sent_at + delay_days(next step) <= now.
	// Replied / bounced prospects and suppressed emails never appear.
	// The same in-memory pass also finds the next future follow-up (the
	// next automatic machine step) for the plain-language summary.
	let followupsDue = 0;
	let nextFollowup: NextFollowup | null = null;
	try {
		const sendRows = await allRows<{ prospect_id: number; sequence_step: number; sent_at: string | null }>(
			db,
			`SELECT prospect_id, sequence_step, sent_at FROM outreach_sends ORDER BY prospect_id ASC, sequence_step ASC, sent_at ASC LIMIT 1000`,
		);
		const prospectRows = await allRows<{
			id: number;
			org_name: string | null;
			track: string;
			stage: string;
			contact_email: string | null;
		}>(
			db,
			`SELECT id, org_name, track, stage, contact_email FROM outreach_prospects WHERE stage NOT IN ('replied', 'bounced') ORDER BY id ASC LIMIT 1000`,
		);
		const configRows = await allRows<{ track: string; step: number; delay_days: number }>(
			db,
			`SELECT track, step, delay_days FROM outreach_sequence_config ORDER BY track ASC, step ASC LIMIT 100`,
		);
		const suppressionRows = await allRows<{ email: string }>(
			db,
			`SELECT email FROM outreach_suppressions ORDER BY email ASC LIMIT 1000`,
		);
		const suppressed = new Set(suppressionRows.map((r) => String(r.email).toLowerCase()));
		const delayByTrackStep = new Map<string, number>();
		for (const c of configRows) delayByTrackStep.set(`${String(c.track)}:${num(c.step)}`, num(c.delay_days));
		const lastSendByProspect = new Map<number, { step: number; sent_at: string }>();
		for (const s of sendRows) {
			if (!s.sent_at) continue;
			const pid = num(s.prospect_id);
			const step = num(s.sequence_step);
			const cur = lastSendByProspect.get(pid);
			if (!cur || step > cur.step || (step === cur.step && String(s.sent_at) > cur.sent_at)) {
				lastSendByProspect.set(pid, { step, sent_at: String(s.sent_at) });
			}
		}
		const due: Array<{ item: TodayQueueItem; dueMs: number }> = [];
		const future: Array<{ dueMs: number; step: number; sent_at: string }> = [];
		for (const p of prospectRows) {
			const pid = num(p.id);
			const last = lastSendByProspect.get(pid);
			if (!last) continue;
			if (p.contact_email && suppressed.has(String(p.contact_email).toLowerCase())) continue;
			const nextStep = last.step + 1;
			const delay = delayByTrackStep.get(`${String(p.track)}:${nextStep}`);
			if (delay == null) continue;
			const sentMs = Date.parse(last.sent_at);
			if (!Number.isFinite(sentMs)) continue;
			const dueMs = sentMs + delay * 24 * 60 * 60 * 1000;
			if (dueMs > nowMs) {
				future.push({ dueMs, step: nextStep, sent_at: last.sent_at });
				continue;
			}
			const org = p.org_name ? String(p.org_name) : "Unknown organization";
			due.push({
				dueMs,
				item: {
					kind: "followup_due",
					title: `Follow-up due for ${org}`,
					detail: `Step ${nextStep} of the ${String(p.track)} sequence is due. Last step ${last.step} was sent ${last.sent_at}; the configured delay for step ${nextStep} is ${delay} days.`,
					prospect_id: pid,
					org_name: org,
					due_at: new Date(dueMs).toISOString(),
				},
			});
		}
		due.sort((a, b) => a.dueMs - b.dueMs || (a.item.prospect_id ?? 0) - (b.item.prospect_id ?? 0));
		for (const d of due) {
			items.push(d.item);
			followupsDue += 1;
		}
		if (future.length) {
			future.sort((a, b) => a.dueMs - b.dueMs || a.step - b.step);
			const first = future[0];
			const sameDay = future.filter((f) => f.dueMs === first.dueMs);
			nextFollowup = {
				step: first.step,
				due_at: new Date(first.dueMs).toISOString(),
				cohort_sent_at: first.sent_at,
				count: sameDay.length,
			};
		}
	} catch {
		// Degrades as above.
	}

	// d. New form submissions, aggregated into one item (no payload, no names).
	let applicationsNew = 0;
	try {
		const rows = await allRows<{ form_type: string; n: number }>(
			db,
			`SELECT form_type, COUNT(*) AS n FROM challenge_form_submissions WHERE status = 'NEW' GROUP BY form_type ORDER BY form_type ASC LIMIT 100`,
		);
		applicationsNew = rows.reduce((sum, r) => sum + num(r.n), 0);
		if (applicationsNew > 0) {
			const types = rows.map((r) => `${String(r.form_type)} (${num(r.n)})`).join(", ");
			items.push({
				kind: "application_new",
				title: `${applicationsNew} new form submission${applicationsNew === 1 ? "" : "s"} waiting for review`,
				detail: `Form types: ${types}. Submission contents are not shown in this queue.`,
			});
		}
	} catch {
		// Degrades as above.
	}

	// e. Enrolled prospects with no sends at all: the sender machine's
	// queue for today, already scheduled, not a manual task.
	let unsentStep1 = 0;
	try {
		unsentStep1 = await countOne(
			db,
			`SELECT COUNT(*) AS n FROM outreach_prospects p WHERE p.sequence_enrolled_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM outreach_sends s WHERE s.prospect_id = p.id)`,
		);
		if (unsentStep1 > 0) {
			items.push({
				kind: "step1_queued",
				title: `${unsentStep1} enrolled prospect${unsentStep1 === 1 ? "" : "s"} queued for sequence step 1`,
				detail: "Machine work already scheduled for the sender; this is not a manual task.",
			});
		}
	} catch {
		// Degrades as above.
	}

	// f. Received money with no territory attribution.
	let unattributedReceipts = 0;
	try {
		unattributedReceipts = await countOne(
			db,
			`SELECT COUNT(*) AS n FROM money_events WHERE territory_id IS NULL`,
		);
		if (unattributedReceipts > 0) {
			items.push({
				kind: "receipt_unattributed",
				title: `${unattributedReceipts} money receipt${unattributedReceipts === 1 ? "" : "s"} without a territory`,
				detail: "Received money records with no territory attribution need an attribution decision before territory totals can include them.",
			});
		}
	} catch {
		// Degrades as above.
	}

	const counts: TodayCounts = {
		reply_decision: replyDecision,
		reply_substantive: replySubstantive,
		followups_due: followupsDue,
		replies_waiting: replyDecision + replySubstantive,
		applications_new: applicationsNew,
		unsent_step1: unsentStep1,
		unattributed_receipts: unattributedReceipts,
	};
	const note =
		items.length === 0
			? "No queue items: no reply decisions, substantive replies, due follow-ups, new applications, queued step 1 sends or unattributed receipts were found."
			: "Ordered by closeness to real money: reply decisions first, then substantive replies, due follow-ups, new applications, queued step 1 sends and unattributed receipts. Empty categories produce no items.";
	return { items, counts, note, next_followup: nextFollowup };
}

export interface TodayQueue {
	ok: true;
	generated_at: string;
	items: TodayQueueItem[];
	counts: TodayCounts;
	note: string;
	next_followup: NextFollowup | null;
}

export async function getTodayQueue(db: D1Database, nowIso?: string): Promise<TodayQueue> {
	const data = await computeTodayQueue(db, nowIso);
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		items: data.items,
		counts: data.counts,
		note: data.note,
		next_followup: data.next_followup,
	};
}

// ---------------------------------------------------------------------------
// 1b. Plain-language summary: the cabinet explains itself in short plain
// sentences. Built ONLY from values the cabinet and today computations
// already produced above (no new queries, no new numbers). Owner items
// are the queue kinds that genuinely wait on the president; follow-ups
// and queued first letters are machine work and are phrased that way.
// ---------------------------------------------------------------------------

export interface CabinetSummary {
	sentences: string[];
	owner_count: number;
	owner_top: string | null;
	next_automatic: string | null;
}

const OWNER_QUEUE_KINDS: ReadonlySet<TodayQueueItem["kind"]> = new Set([
	"reply_decision",
	"reply_substantive",
	"application_new",
	"receipt_unattributed",
]);

function summaryUsd(cents: number): string {
	return "$" + (Number(cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function summaryDate(iso: string): string {
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
	return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(d);
}

function withPeriod(s: string): string {
	return /[.!?]$/.test(s) ? s : s + ".";
}

export function buildCabinetSummary(input: {
	florida_prospects: { total: number; sent: number; replies: number };
	florida_money: { donation_cents: number; sponsorship_contract_cents: number };
	today_items: TodayQueueItem[];
	followups_due: number;
	unsent_step1: number;
	next_followup: NextFollowup | null;
}): CabinetSummary {
	const sentences: string[] = [];
	const fp = input.florida_prospects;
	sentences.push(
		`Florida: ${fp.total} organization${fp.total === 1 ? "" : "s"} in the pipeline. ` +
			`${fp.sent} first letter${fp.sent === 1 ? "" : "s"} sent, ${fp.replies} ${fp.replies === 1 ? "reply" : "replies"} received.`,
	);
	sentences.push(
		`Money received so far: ${summaryUsd(input.florida_money.donation_cents)} in donations, ` +
			`${summaryUsd(input.florida_money.sponsorship_contract_cents)} in sponsorship.`,
	);
	const ownerItems = input.today_items.filter((it) => OWNER_QUEUE_KINDS.has(it.kind));
	const ownerTop = ownerItems.length ? ownerItems[0].title : null;
	if (ownerItems.length === 0) {
		sentences.push("Today the system needs nothing from you. No decision is waiting.");
	} else {
		sentences.push(
			`Today the system needs from you: ${ownerItems.length} ${ownerItems.length === 1 ? "item" : "items"}. ` +
				`First on the list: ${withPeriod(ownerTop as string)}`,
		);
	}
	const machineParts: string[] = [];
	if (input.followups_due > 0) machineParts.push(`${input.followups_due} follow-up letter${input.followups_due === 1 ? "" : "s"} due`);
	if (input.unsent_step1 > 0) machineParts.push(`${input.unsent_step1} first letter${input.unsent_step1 === 1 ? "" : "s"} queued`);
	if (machineParts.length) {
		sentences.push(`The machine sends letters on its own, so these are not tasks for you: ${machineParts.join(" and ")}.`);
	}
	let nextAutomatic: string | null = null;
	if (input.next_followup) {
		const nf = input.next_followup;
		nextAutomatic =
			`Next automatic step: step ${nf.step} follow-up letters for the group first written on ` +
			`${summaryDate(nf.cohort_sent_at)} go out on ${summaryDate(nf.due_at)} (${nf.count} letter${nf.count === 1 ? "" : "s"}).`;
		sentences.push(nextAutomatic);
	}
	return { sentences, owner_count: ownerItems.length, owner_top: ownerTop, next_automatic: nextAutomatic };
}

// ---------------------------------------------------------------------------
// 1. Cabinet view: Florida first, then national, academy, today counts.
// ---------------------------------------------------------------------------

export interface CabinetView {
	ok: true;
	generated_at: string;
	florida: {
		territory_id: string;
		name: string;
		territories_total: number;
		territories_by_type: Record<string, number>;
		groups: { total: number; forming: number; active: number };
		roles_planned: number;
		prospects: { total: number; by_track: Record<string, number>; sent: number; replies: number };
		money: {
			receipts_count: number;
			receipts_cents: number;
			donation_cents: number;
			sponsorship_contract_cents: number;
			sponsorship_contract_receipts: number;
			first_case: MoneyCycleFlorida["first_case"];
		};
		lane_gates: LaneGate[] | null;
		lane_gates_note: string | null;
	};
	national: {
		territories_total: number;
		groups_total: number;
		groups_active: number;
		prospects_total: number;
		tiers: { A1: number; A2: number; B: number; C: number };
		enrolled: number;
		received_by_lane: MoneyCycleSection["received_totals_by_lane"];
		received_total_cents: number;
	};
	academy: { students: number; certified: number; last_sync: string | null };
	today_counts: {
		followups_due: number;
		replies_waiting: number;
		applications_new: number;
		unsent_step1: number;
		unattributed_receipts: number;
	};
	summary: CabinetSummary;
}

export async function getCabinetView(db: D1Database): Promise<CabinetView> {
	const generated_at = new Date().toISOString();
	const moneyCycle = await getMoneyCycleSafe(db);
	const flCycle = moneyCycle.florida_cycle;

	const [flTerritories, natTerritories, flGroups, natGroups, academy, today] = await Promise.all([
		territoriesByType(db, true),
		territoriesByType(db, false),
		groupsSummary(db, true),
		groupsSummary(db, false),
		academyAggregates(db),
		computeTodayQueue(db),
	]);

	const flRolesPlanned = await countOne(
		db,
		`SELECT COUNT(*) AS n FROM role_instances WHERE status = 'PLANNED' AND territory_id ${FL_SUBTREE}`,
	);

	const flProspectsTotal = await countOne(
		db,
		`SELECT COUNT(*) AS n FROM outreach_prospects WHERE territory_id ${FL_SUBTREE}`,
	);
	const flByTrack = countMap(
		await allRows(
			db,
			`SELECT track, COUNT(*) AS n FROM outreach_prospects WHERE territory_id ${FL_SUBTREE} GROUP BY track ORDER BY track ASC`,
		),
		"track",
	);
	const flSent = await countOne(
		db,
		`SELECT COUNT(DISTINCT s.prospect_id) AS n FROM outreach_sends s JOIN outreach_prospects p ON p.id = s.prospect_id WHERE p.territory_id ${FL_SUBTREE}`,
	);
	const flReplies = await countOne(
		db,
		`SELECT COUNT(DISTINCT r.prospect_id) AS n FROM outreach_replies r JOIN outreach_prospects p ON p.id = r.prospect_id WHERE p.territory_id ${FL_SUBTREE}`,
	);

	const natProspectsTotal = await countOne(db, `SELECT COUNT(*) AS n FROM outreach_prospects`);
	const tierMap = countMap(
		await allRows(
			db,
			`SELECT contact_level, COUNT(*) AS n FROM outreach_prospects GROUP BY contact_level ORDER BY contact_level ASC`,
		),
		"contact_level",
	);
	const enrolled = await countOne(
		db,
		`SELECT COUNT(*) AS n FROM outreach_prospects WHERE sequence_enrolled_at IS NOT NULL`,
	);
	const receivedByLane = moneyCycle.received_totals_by_lane;
	const receivedTotalCents = Object.values(receivedByLane).reduce((sum, l) => sum + num(l.gross_cents), 0);

	return {
		ok: true,
		generated_at,
		florida: {
			territory_id: FLORIDA_TERRITORY_ID,
			name: "Florida",
			territories_total: flTerritories.total,
			territories_by_type: flTerritories.by_type,
			groups: { total: flGroups.total, forming: flGroups.forming, active: flGroups.active },
			roles_planned: flRolesPlanned,
			prospects: { total: flProspectsTotal, by_track: flByTrack, sent: flSent, replies: flReplies },
			money: {
				receipts_count: flCycle ? num(flCycle.receipts_count) : 0,
				receipts_cents: flCycle ? num(flCycle.receipts_gross_cents) : 0,
				donation_cents: flCycle ? num(flCycle.donation_cents) : 0,
				sponsorship_contract_cents: flCycle ? num(flCycle.sponsorship_contract_cents) : 0,
				sponsorship_contract_receipts: flCycle ? num(flCycle.sponsorship_contract_receipts) : 0,
				first_case: flCycle ? flCycle.first_case : null,
			},
			lane_gates: moneyCycle.lane_gates,
			lane_gates_note: moneyCycle.lane_gates_note,
		},
		national: {
			territories_total: natTerritories.total,
			groups_total: natGroups.total,
			groups_active: natGroups.active,
			prospects_total: natProspectsTotal,
			tiers: {
				A1: tierMap["A1"] ?? 0,
				A2: tierMap["A2"] ?? 0,
				B: tierMap["B"] ?? 0,
				C: tierMap["C"] ?? 0,
			},
			enrolled,
			received_by_lane: receivedByLane,
			received_total_cents: receivedTotalCents,
		},
		academy: { students: academy.students, certified: academy.certified, last_sync: academy.last_sync },
		today_counts: {
			followups_due: today.counts.followups_due,
			replies_waiting: today.counts.replies_waiting,
			applications_new: today.counts.applications_new,
			unsent_step1: today.counts.unsent_step1,
			unattributed_receipts: today.counts.unattributed_receipts,
		},
		summary: buildCabinetSummary({
			florida_prospects: { total: flProspectsTotal, sent: flSent, replies: flReplies },
			florida_money: {
				donation_cents: flCycle ? num(flCycle.donation_cents) : 0,
				sponsorship_contract_cents: flCycle ? num(flCycle.sponsorship_contract_cents) : 0,
			},
			today_items: today.items,
			followups_due: today.counts.followups_due,
			unsent_step1: today.counts.unsent_step1,
			next_followup: today.next_followup,
		}),
	};
}

// ---------------------------------------------------------------------------
// 3. CRM prospect list.
// ---------------------------------------------------------------------------

export interface CrmProspectRow {
	id: number;
	org_name: string | null;
	contact_name: string | null;
	contact_title: string | null;
	contact_level: string | null;
	track: string;
	stage: string;
	city_state: string | null;
	territory_id: string | null;
	territory_name: string | null;
	enrolled: boolean;
	sends: number;
	last_sent_at: string | null;
	replies: number;
	last_reply_classification: string | null;
}

export interface CrmProspectsOpts {
	scope?: "all" | "fl";
	track?: string;
	tier?: string;
	limit?: number;
}

export async function getCrmProspects(
	db: D1Database,
	opts: CrmProspectsOpts = {},
): Promise<{ ok: true; generated_at: string; total: number; rows: CrmProspectRow[] }> {
	const generated_at = new Date().toISOString();
	const rawLimit = Number(opts.limit);
	const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 100;

	const filters: string[] = [];
	const binds: unknown[] = [];
	if (opts.scope === "fl") filters.push(`AND p.territory_id ${FL_SUBTREE}`);
	if (opts.track) {
		filters.push(`AND p.track = ?`);
		binds.push(opts.track);
	}
	if (opts.tier) {
		filters.push(`AND p.contact_level = ?`);
		binds.push(opts.tier);
	}
	const where = filters.join(" ");

	const total = await countOne(
		db,
		`SELECT COUNT(*) AS n FROM outreach_prospects p WHERE 1 = 1 ${where}`,
		binds,
	);
	const rows = await allRows<Record<string, unknown>>(
		db,
		`SELECT p.id, p.org_name, p.contact_name, p.contact_title, p.contact_level, p.track, p.stage, p.city_state, p.territory_id, t.name AS territory_name, CASE WHEN p.sequence_enrolled_at IS NOT NULL THEN 1 ELSE 0 END AS enrolled, COALESCE(snd.sends, 0) AS sends, snd.last_sent_at AS last_sent_at, COALESCE(rep.replies, 0) AS replies, (SELECT r2.classification FROM outreach_replies r2 WHERE r2.prospect_id = p.id ORDER BY r2.received_at DESC, r2.id DESC LIMIT 1) AS last_reply_classification FROM outreach_prospects p LEFT JOIN territories t ON t.territory_id = p.territory_id LEFT JOIN (SELECT prospect_id, COUNT(*) AS sends, MAX(sent_at) AS last_sent_at FROM outreach_sends GROUP BY prospect_id) snd ON snd.prospect_id = p.id LEFT JOIN (SELECT prospect_id, COUNT(*) AS replies FROM outreach_replies GROUP BY prospect_id) rep ON rep.prospect_id = p.id WHERE 1 = 1 ${where} ORDER BY (CASE WHEN COALESCE(rep.replies, 0) > 0 THEN 0 ELSE 1 END) ASC, (CASE WHEN p.sequence_enrolled_at IS NOT NULL THEN 0 ELSE 1 END) ASC, p.id ASC LIMIT ?`,
		[...binds, limit],
	);
	return {
		ok: true,
		generated_at,
		total,
		rows: rows.map((r) => ({
			id: num(r.id),
			org_name: (r.org_name as string) ?? null,
			contact_name: (r.contact_name as string) ?? null,
			contact_title: (r.contact_title as string) ?? null,
			contact_level: (r.contact_level as string) ?? null,
			track: String(r.track ?? ""),
			stage: String(r.stage ?? ""),
			city_state: (r.city_state as string) ?? null,
			territory_id: (r.territory_id as string) ?? null,
			territory_name: (r.territory_name as string) ?? null,
			enrolled: num(r.enrolled) === 1,
			sends: num(r.sends),
			last_sent_at: (r.last_sent_at as string) ?? null,
			replies: num(r.replies),
			last_reply_classification: (r.last_reply_classification as string) ?? null,
		})),
	};
}

// ---------------------------------------------------------------------------
// 4. CRM prospect card: one contact, every role it plays, on one card.
// ---------------------------------------------------------------------------

export interface CrmProspectCard {
	ok: true;
	generated_at: string;
	prospect: Record<string, unknown>;
	territory_chain: TerritoryChainRow[];
	sends: Array<{ sequence_step: number; sent_at: string | null }>;
	replies: Array<{ classification: string | null; received_at: string | null; engine_action: string | null }>;
	money: Array<{ event_type: string; funding_lane: string | null; gross_cents: number | null; occurred_at: string | null; territory_id: string | null }>;
	roles_note: string;
}

export async function getCrmProspect(
	db: D1Database,
	id: number,
): Promise<CrmProspectCard | { ok: false; error: "not_found" }> {
	// Every outreach_prospects column except unsubscribe_token, listed
	// explicitly so the token can never leak through a SELECT *.
	const row = await firstRow<Record<string, unknown>>(
		db,
		`SELECT id, track, org_name, contact_name, contact_email, contact_title, contact_level, city_state, source, stage, sequence_enrolled_at, enrolled_by, territory_id, created_at, updated_at FROM outreach_prospects WHERE id = ?`,
		[id],
	);
	if (!row) return { ok: false, error: "not_found" };

	const prospect: Record<string, unknown> = {
		id: num(row.id),
		track: (row.track as string) ?? null,
		org_name: (row.org_name as string) ?? null,
		contact_name: (row.contact_name as string) ?? null,
		contact_email: (row.contact_email as string) ?? null,
		contact_title: (row.contact_title as string) ?? null,
		contact_level: (row.contact_level as string) ?? null,
		city_state: (row.city_state as string) ?? null,
		source: (row.source as string) ?? null,
		stage: (row.stage as string) ?? null,
		sequence_enrolled_at: (row.sequence_enrolled_at as string) ?? null,
		enrolled_by: (row.enrolled_by as string) ?? null,
		territory_id: (row.territory_id as string) ?? null,
		created_at: (row.created_at as string) ?? null,
		updated_at: (row.updated_at as string) ?? null,
	};

	const territoryChain = await walkTerritoryChain(db, (row.territory_id as string) ?? null, 6);

	const sendRows = await allRows<{ sequence_step: number; sent_at: string | null }>(
		db,
		`SELECT sequence_step, sent_at FROM outreach_sends WHERE prospect_id = ? ORDER BY sequence_step ASC, sent_at ASC LIMIT 100`,
		[id],
	);
	const sends = sendRows.map((s) => ({ sequence_step: num(s.sequence_step), sent_at: s.sent_at ?? null }));

	const replyRows = await allRows<{ classification: string | null; received_at: string | null; engine_action: string | null }>(
		db,
		`SELECT classification, received_at, engine_action FROM outreach_replies WHERE prospect_id = ? ORDER BY received_at DESC, id DESC LIMIT 100`,
		[id],
	);
	const replies = replyRows.map((r) => ({
		classification: r.classification ?? null,
		received_at: r.received_at ?? null,
		engine_action: r.engine_action ?? null,
	}));

	const moneyRows = await allRows<{
		event_type: string;
		funding_lane: string | null;
		gross_cents: number | null;
		occurred_at: string | null;
		territory_id: string | null;
	}>(
		db,
		`SELECT event_type, funding_lane, gross_cents, occurred_at, territory_id FROM money_events WHERE source_prospect_id = ? ORDER BY occurred_at DESC LIMIT 100`,
		[id],
	);
	const money = moneyRows.map((m) => ({
		event_type: String(m.event_type),
		funding_lane: m.funding_lane ?? null,
		gross_cents: m.gross_cents == null ? null : num(m.gross_cents),
		occurred_at: m.occurred_at ?? null,
		territory_id: m.territory_id ?? null,
	}));

	const roles_note =
		"This one card shows every role of the contact: funding source, candidate and partner. " +
		`Funding source: this contact is an outreach prospect on the ${String(row.track ?? "")} track` +
		(money.length > 0
			? `, with ${money.length} received money event${money.length === 1 ? "" : "s"} attributed to it. `
			: ", with no received money attributed to it yet. ") +
		`Partner: ${sends.length} outreach send${sends.length === 1 ? "" : "s"} and ${replies.length} repl${replies.length === 1 ? "y" : "ies"} are recorded on this card. ` +
		"Candidate: applications and persons carry no link to an outreach prospect, so no candidate role can be shown for this contact from Engine records today.";

	return {
		ok: true,
		generated_at: new Date().toISOString(),
		prospect,
		territory_chain: territoryChain,
		sends,
		replies,
		money,
		roles_note,
	};
}

// ---------------------------------------------------------------------------
// 5. Funding pipeline: organization counts per stage, money only at the
// received stage, and never merged into it before it arrives.
// ---------------------------------------------------------------------------

export type FundingStage =
	| { key: "found" | "qualified" | "sent" | "dialogue"; label: string; n: number }
	| { key: "commitment"; label: string; n: number; cents: number }
	| { key: "received"; label: string; cents: number; by_lane: MoneyCycleSection["received_totals_by_lane"] };

async function fundingStages(db: D1Database, florida: boolean, moneyCycle: MoneyCycleSection): Promise<FundingStage[]> {
	let found: number;
	let qualified: number;
	let sent: number;
	let dialogue: number;
	if (florida) {
		found = await countOne(db, `SELECT COUNT(*) AS n FROM outreach_prospects WHERE territory_id ${FL_SUBTREE}`);
		qualified = await countOne(
			db,
			`SELECT COUNT(*) AS n FROM outreach_prospects WHERE contact_level IN ('A1', 'A2') AND territory_id ${FL_SUBTREE}`,
		);
		sent = await countOne(
			db,
			`SELECT COUNT(DISTINCT s.prospect_id) AS n FROM outreach_sends s JOIN outreach_prospects p ON p.id = s.prospect_id WHERE p.territory_id ${FL_SUBTREE}`,
		);
		dialogue = await countOne(
			db,
			`SELECT COUNT(DISTINCT r.prospect_id) AS n FROM outreach_replies r JOIN outreach_prospects p ON p.id = r.prospect_id WHERE p.territory_id ${FL_SUBTREE}`,
		);
	} else {
		found = await countOne(db, `SELECT COUNT(*) AS n FROM outreach_prospects`);
		qualified = await countOne(
			db,
			`SELECT COUNT(*) AS n FROM outreach_prospects WHERE contact_level IN ('A1', 'A2')`,
		);
		sent = await countOne(db, `SELECT COUNT(DISTINCT prospect_id) AS n FROM outreach_sends`);
		dialogue = await countOne(db, `SELECT COUNT(DISTINCT prospect_id) AS n FROM outreach_replies`);
	}

	let commitmentN = 0;
	let commitmentCents = 0;
	if (!florida) {
		const row = await firstRow<{ n: number; cents: number }>(
			db,
			`SELECT COUNT(*) AS n, COALESCE(SUM(committed_amount_cents), 0) AS cents FROM sponsor_commitments WHERE status = 'confirmed'`,
		);
		if (row) {
			commitmentN = num(row.n);
			commitmentCents = num(row.cents);
		}
	}
	// Florida commitments: sponsor_commitments carries no territory column,
	// so no commitment can be attributed to the Florida subtree today; the
	// Florida commitment stage therefore reports zero attributed (a schema
	// fact, verified in migration 0090), not the national figure.

	let receivedCents: number;
	let byLane: MoneyCycleSection["received_totals_by_lane"];
	if (florida) {
		const flCycle = moneyCycle.florida_cycle;
		receivedCents = flCycle ? num(flCycle.receipts_gross_cents) : 0;
		// The money cycle provides no per-lane Florida breakdown, so the
		// Florida by-lane split is read with the same received convention
		// (VERIFIED, fundraiser mirror excluded) inside the subtree.
		const lanes = await receivedByLane(db, `AND territory_id ${FL_SUBTREE}`, []);
		byLane = {};
		for (const l of lanes) byLane[l.lane] = { events: l.events, gross_cents: l.cents };
	} else {
		byLane = moneyCycle.received_totals_by_lane;
		receivedCents = Object.values(byLane).reduce((sum, l) => sum + num(l.gross_cents), 0);
	}

	return [
		{ key: "found", label: "Found", n: found },
		{ key: "qualified", label: "Qualified (A1/A2)", n: qualified },
		{ key: "sent", label: "Outreach sent", n: sent },
		{ key: "dialogue", label: "In dialogue (replied)", n: dialogue },
		{ key: "commitment", label: "Commitment received", n: commitmentN, cents: commitmentCents },
		{ key: "received", label: "Money received", cents: receivedCents, by_lane: byLane },
	];
}

export async function getFundingPipeline(db: D1Database): Promise<{
	ok: true;
	generated_at: string;
	stages: FundingStage[];
	florida_stages: FundingStage[];
	legacy_fund: { funds: Array<{ id: string; name: string }>; prospects_by_stage: Record<string, number> };
	note: string;
}> {
	const generated_at = new Date().toISOString();
	const moneyCycle = await getMoneyCycleSafe(db);
	const [stages, floridaStages] = await Promise.all([
		fundingStages(db, false, moneyCycle),
		fundingStages(db, true, moneyCycle),
	]);
	const fundRows = await allRows<{ id: string; name: string }>(
		db,
		`SELECT id, name FROM funds ORDER BY created_at ASC LIMIT 100`,
	);
	const prospectsByStage = countMap(
		await allRows(db, `SELECT stage, COUNT(*) AS n FROM fund_prospects GROUP BY stage ORDER BY stage ASC`),
		"stage",
	);
	return {
		ok: true,
		generated_at,
		stages,
		florida_stages: floridaStages,
		legacy_fund: {
			funds: fundRows.map((f) => ({ id: String(f.id), name: String(f.name) })),
			prospects_by_stage: prospectsByStage,
		},
		note: "Stages are counts of organizations, not money; expected money is never added to received totals.",
	};
}

// ---------------------------------------------------------------------------
// 6. Grants view: tracking and calendar only, under the owner stop order.
// There is no grants table in D1, so the registry and calendar are honest
// empty lists; the gate is read from funding_lane_gates.
// ---------------------------------------------------------------------------

export async function getGrantsView(db: D1Database): Promise<{
	ok: true;
	generated_at: string;
	gate: { lane: string; scope: string; status: string; basis: string } | null;
	registry: never[];
	registry_note: string;
	calendar: never[];
	calendar_note: string;
}> {
	const gateRow = await firstRow<{ lane: string; scope: string; status: string; basis: string }>(
		db,
		`SELECT lane, scope, status, basis FROM funding_lane_gates WHERE lane = ? AND scope = ? LIMIT 1`,
		["grant", "ALL"],
	);
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		gate: gateRow
			? { lane: String(gateRow.lane), scope: String(gateRow.scope), status: String(gateRow.status), basis: String(gateRow.basis) }
			: null,
		registry: [],
		registry_note:
			"No grant records exist in the Engine yet. This module tracks and calendars only; the owner stop order of 2026-10-15 stands: no applications and no letters.",
		calendar: [],
		calendar_note: "No grant deadlines are recorded in the Engine yet.",
	};
}

// ---------------------------------------------------------------------------
// 7. Territory budgets: three registers, never mixed. Need is structure
// only (no invented amounts), coverage is received money, actual spend
// does not exist in the Engine yet.
// ---------------------------------------------------------------------------

interface BudgetScope {
	key: string;
	label: string;
	territory_root: string | null;
	need: {
		roles_planned: number;
		by_scope: Record<string, number>;
		amounts_note: string;
	};
	coverage: {
		received_by_lane: Array<{ lane: string; events: number; cents: number }>;
		total_cents: number;
	};
	actual: { expenses_cents: null; note: string };
}

const NEED_AMOUNTS_NOTE =
	"Money amounts for need are not set yet: they come from the parametric budget model (TZ 9.1) and the open HQ parameter decision (TZ 16.4). Structure only, no invented sums.";
const ACTUAL_SPEND_NOTE =
	"No expense or payout records exist in the Engine yet; spend appears here when the Deployment Engine records it.";

async function budgetScope(
	db: D1Database,
	key: string,
	label: string,
	territoryRoot: string | null,
	plainPredicate: string,
	aliasedPredicate: string,
	binds: unknown[],
): Promise<BudgetScope> {
	const rolesPlanned = await countOne(
		db,
		`SELECT COUNT(*) AS n FROM role_instances WHERE status = 'PLANNED' ${plainPredicate}`,
		binds,
	);
	const byScope = countMap(
		await allRows(
			db,
			`SELECT t.scope_type AS scope_type, COUNT(*) AS n FROM role_instances r JOIN role_templates t ON t.template_id = r.template_id WHERE r.status = 'PLANNED' ${aliasedPredicate} GROUP BY t.scope_type ORDER BY t.scope_type ASC LIMIT 50`,
			binds,
		),
		"scope_type",
	);
	const coverageLanes = await receivedByLane(db, plainPredicate, binds);
	return {
		key,
		label,
		territory_root: territoryRoot,
		need: { roles_planned: rolesPlanned, by_scope: byScope, amounts_note: NEED_AMOUNTS_NOTE },
		coverage: {
			received_by_lane: coverageLanes,
			total_cents: coverageLanes.reduce((sum, l) => sum + l.cents, 0),
		},
		actual: { expenses_cents: null, note: ACTUAL_SPEND_NOTE },
	};
}

export async function getTerritoryBudgets(db: D1Database): Promise<{
	ok: true;
	generated_at: string;
	registers_note: string;
	scopes: BudgetScope[];
}> {
	const roots = await rootTerritoryIds(db);
	const hqPlaceholders = roots.ids.map(() => "?").join(", ");
	const hqPlain = roots.ids.length ? `AND territory_id IN (${hqPlaceholders})` : `AND 1 = 0`;
	const hqAliased = roots.ids.length ? `AND r.territory_id IN (${hqPlaceholders})` : `AND 1 = 0`;

	const scopes: BudgetScope[] = [];
	scopes.push(
		await budgetScope(db, "florida", "Florida", FLORIDA_TERRITORY_ID, `AND territory_id ${FL_SUBTREE}`, `AND r.territory_id ${FL_SUBTREE}`, []),
	);
	scopes.push(
		await budgetScope(db, "headquarters", "Headquarters (NWANA Center and NWANA USA)", roots.continental ?? roots.national, hqPlain, hqAliased, roots.ids),
	);
	scopes.push(await budgetScope(db, "national", "National (all territories)", roots.continental ?? roots.national, "", "", []));
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		registers_note:
			"Three registers are never mixed: approved need, received coverage, actual spend. Public and management figures always name their register.",
		scopes,
	};
}

// ---------------------------------------------------------------------------
// 8. People view: role instances, the template catalog, the candidate
// pipeline and academy aggregates. No person names are returned (the
// persons table holds none in production, and academy rows are never
// selected at user level).
// ---------------------------------------------------------------------------

export async function getPeopleView(db: D1Database): Promise<{
	ok: true;
	generated_at: string;
	roles: { total: number; by_status: Record<string, number>; by_scope: Record<string, number> };
	florida_roles: {
		total: number;
		by_scope: Record<string, number>;
		by_template: Array<{ template_id: string; title: string | null; n: number }>;
	};
	hq_roles: Array<{ template_id: string; title: string | null; scope_type: string | null; n: number }>;
	catalog: Array<{ template_id: string; title: string; scope_type: string; employment_type: string; is_paid: boolean }>;
	applications: {
		total: number;
		by_pipeline_status: Record<string, number>;
		pipeline_order: string[];
		note: string | null;
	};
	candidate_inflow: { rows: Array<{ form_type: string; status: string; n: number }>; new_total: number };
	academy: {
		students: number;
		certified: number;
		by_course: Array<{ course_id: number; enrolled: number; certified: number }>;
		last_sync: string | null;
		note: string;
	};
}> {
	const generated_at = new Date().toISOString();
	const roots = await rootTerritoryIds(db);

	const rolesTotal = await countOne(db, `SELECT COUNT(*) AS n FROM role_instances`);
	const rolesByStatus = countMap(
		await allRows(db, `SELECT status, COUNT(*) AS n FROM role_instances GROUP BY status ORDER BY status ASC LIMIT 50`),
		"status",
	);
	const rolesByScope = countMap(
		await allRows(
			db,
			`SELECT t.scope_type AS scope_type, COUNT(*) AS n FROM role_instances r JOIN role_templates t ON t.template_id = r.template_id GROUP BY t.scope_type ORDER BY t.scope_type ASC LIMIT 50`,
		),
		"scope_type",
	);

	const flRolesTotal = await countOne(db, `SELECT COUNT(*) AS n FROM role_instances WHERE territory_id ${FL_SUBTREE}`);
	const flByScope = countMap(
		await allRows(
			db,
			`SELECT t.scope_type AS scope_type, COUNT(*) AS n FROM role_instances r JOIN role_templates t ON t.template_id = r.template_id WHERE r.territory_id ${FL_SUBTREE} GROUP BY t.scope_type ORDER BY t.scope_type ASC LIMIT 50`,
		),
		"scope_type",
	);
	const flByTemplateRows = await allRows<{ template_id: string; title: string | null; n: number }>(
		db,
		`SELECT r.template_id AS template_id, t.title AS title, COUNT(*) AS n FROM role_instances r LEFT JOIN role_templates t ON t.template_id = r.template_id WHERE r.territory_id ${FL_SUBTREE} GROUP BY r.template_id, t.title ORDER BY n DESC, r.template_id ASC LIMIT 15`,
	);

	let hqRoles: Array<{ template_id: string; title: string | null; scope_type: string | null; n: number }> = [];
	if (roots.ids.length) {
		const placeholders = roots.ids.map(() => "?").join(", ");
		const rows = await allRows<{ template_id: string; title: string | null; scope_type: string | null; n: number }>(
			db,
			`SELECT r.template_id AS template_id, t.title AS title, t.scope_type AS scope_type, COUNT(*) AS n FROM role_instances r JOIN role_templates t ON t.template_id = r.template_id WHERE r.territory_id IN (${placeholders}) GROUP BY r.template_id, t.title, t.scope_type ORDER BY n DESC, r.template_id ASC LIMIT 100`,
			roots.ids,
		);
		hqRoles = rows.map((r) => ({ template_id: String(r.template_id), title: r.title ?? null, scope_type: r.scope_type ?? null, n: num(r.n) }));
	}

	const catalogRows = await allRows<{
		template_id: string;
		title: string;
		scope_type: string;
		employment_type: string;
		is_paid: number;
	}>(
		db,
		`SELECT template_id, title, scope_type, employment_type, is_paid FROM role_templates ORDER BY scope_type ASC, sort_order ASC, template_id ASC LIMIT 200`,
	);

	const applicationsTotal = await countOne(db, `SELECT COUNT(*) AS n FROM applications`);
	const applicationsByStatus = countMap(
		await allRows(
			db,
			`SELECT pipeline_status, COUNT(*) AS n FROM applications GROUP BY pipeline_status ORDER BY pipeline_status ASC LIMIT 50`,
		),
		"pipeline_status",
	);

	const inflowRows = await allRows<{ form_type: string; status: string; n: number }>(
		db,
		`SELECT form_type, status, COUNT(*) AS n FROM challenge_form_submissions GROUP BY form_type, status ORDER BY form_type ASC, status ASC LIMIT 100`,
	);
	const candidateInflow = inflowRows.map((r) => ({ form_type: String(r.form_type), status: String(r.status), n: num(r.n) }));

	const academy = await academyAggregates(db);

	return {
		ok: true,
		generated_at,
		roles: { total: rolesTotal, by_status: rolesByStatus, by_scope: rolesByScope },
		florida_roles: {
			total: flRolesTotal,
			by_scope: flByScope,
			by_template: flByTemplateRows.map((r) => ({ template_id: String(r.template_id), title: r.title ?? null, n: num(r.n) })),
		},
		hq_roles: hqRoles,
		catalog: catalogRows.map((r) => ({
			template_id: String(r.template_id),
			title: String(r.title),
			scope_type: String(r.scope_type),
			employment_type: String(r.employment_type),
			is_paid: num(r.is_paid) === 1,
		})),
		applications: {
			total: applicationsTotal,
			by_pipeline_status: applicationsByStatus,
			pipeline_order: [...PIPELINE_ORDER],
			note:
				applicationsTotal === 0
					? "The candidate pipeline exists in the schema; no applications have been recorded yet."
					: "Applications are recorded in the Engine; the counts above are live.",
		},
		candidate_inflow: {
			rows: candidateInflow,
			new_total: candidateInflow.filter((r) => r.status === "NEW").reduce((sum, r) => sum + r.n, 0),
		},
		academy: {
			students: academy.students,
			certified: academy.certified,
			by_course: academy.by_course,
			last_sync: academy.last_sync,
			note: ACADEMY_NOTE,
		},
	};
}

// ---------------------------------------------------------------------------
// 9. Groups registry view: territory first, groups as NWANA units.
// ---------------------------------------------------------------------------

export async function getGroupsRegistryView(db: D1Database): Promise<{
	ok: true;
	generated_at: string;
	model_note: string;
	territories_by_type: Record<string, number>;
	territories_total: number;
	groups: { total: number; by_status: Record<string, number>; defaults: number };
	florida: {
		territories_total: number;
		territories_by_type: Record<string, number>;
		groups_total: number;
		groups_by_status: Record<string, number>;
	};
	categories: { count: number; note: string };
}> {
	const [natTerritories, flTerritories, natGroups, flGroups] = await Promise.all([
		territoriesByType(db, false),
		territoriesByType(db, true),
		groupsSummary(db, false),
		groupsSummary(db, true),
	]);
	const categoriesCount = await countOne(db, `SELECT COUNT(*) AS n FROM nw_group_categories`);
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		model_note:
			"Territory first: a person enters through a territory. NW Groups are NWANA units created only by NWANA decision; a group is FORMING until the real launch conditions of TZ 2.4 are met, then ACTIVE. The Individual License is participation, not membership, and never creates a group.",
		territories_by_type: natTerritories.by_type,
		territories_total: natTerritories.total,
		groups: { total: natGroups.total, by_status: natGroups.by_status, defaults: natGroups.defaults },
		florida: {
			territories_total: flTerritories.total,
			territories_by_type: flTerritories.by_type,
			groups_total: flGroups.total,
			groups_by_status: flGroups.by_status,
		},
		categories: {
			count: categoriesCount,
			note: "The 14 categories are an informational taxonomy and a request channel only. They are not license products and create no rights to a group.",
		},
	};
}

// ---------------------------------------------------------------------------
// 10. Territory drilldown.
// ---------------------------------------------------------------------------

export async function getTerritoryDrilldown(
	db: D1Database,
	territoryId: string,
): Promise<
	| {
			ok: true;
			generated_at: string;
			territory: { territory_id: string; type: string; name: string; parent_territory_id: string | null };
			chain: TerritoryChainRow[];
			children: {
				by_type: Record<string, number>;
				list: Array<{ territory_id: string; type: string; name: string }>;
			};
			groups: Array<{
				group_id: string;
				name: string;
				group_number: number;
				status: string;
				is_default: number;
				category_key: string | null;
				leader_name: string | null;
				leader_role: string | null;
			}>;
			programs: Array<Record<string, unknown>>;
			programs_note: string | null;
			prospects_count: number;
			roles_count: number;
	  }
	| { ok: false; error: "not_found" }
> {
	const territory = await firstRow<{
		territory_id: string;
		type: string;
		name: string;
		parent_territory_id: string | null;
	}>(
		db,
		`SELECT territory_id, type, name, parent_territory_id FROM territories WHERE territory_id = ?`,
		[territoryId],
	);
	if (!territory) return { ok: false, error: "not_found" };

	const upChain = await walkTerritoryChain(db, territoryId, 10);
	const chain = [...upChain].reverse();

	const childrenByType = countMap(
		await allRows(
			db,
			`SELECT type, COUNT(*) AS n FROM territories WHERE parent_territory_id = ? GROUP BY type ORDER BY type ASC LIMIT 50`,
			[territoryId],
		),
		"type",
	);
	const childrenList = await allRows<{ territory_id: string; type: string; name: string }>(
		db,
		`SELECT territory_id, type, name FROM territories WHERE parent_territory_id = ? ORDER BY type ASC, name ASC LIMIT 200`,
		[territoryId],
	);

	const groupRows = await allRows<{
		group_id: string;
		name: string;
		group_number: number;
		status: string;
		is_default: number;
		category_key: string | null;
		leader_name: string | null;
		leader_role: string | null;
	}>(
		db,
		`SELECT group_id, name, group_number, status, is_default, category_key, leader_name, leader_role FROM nw_groups WHERE territory_id = ? ORDER BY group_number ASC, name ASC LIMIT 200`,
		[territoryId],
	);

	// Programs (migration 0097): program_id, name, activity_type, status,
	// group_id. Selected defensively: a staged environment without the
	// table returns an empty list with a note, never a failed drilldown.
	let programs: Array<Record<string, unknown>> = [];
	let programs_note: string | null = null;
	try {
		const rows = await db
			.prepare(
				`SELECT program_id, name, activity_type, status, group_id FROM programs WHERE territory_id = ? ORDER BY name ASC LIMIT 200`,
			)
			.bind(territoryId)
			.all<Record<string, unknown>>();
		programs = (rows.results ?? []).map((r) => ({
			program_id: String(r.program_id),
			name: (r.name as string) ?? null,
			activity_type: (r.activity_type as string) ?? null,
			status: (r.status as string) ?? null,
			group_id: (r.group_id as string) ?? null,
		}));
	} catch {
		programs = [];
		programs_note = "Programs table is not available in this environment yet (migration 0097 pending).";
	}

	const prospectsCount = await countOne(
		db,
		`SELECT COUNT(*) AS n FROM outreach_prospects WHERE territory_id = ?`,
		[territoryId],
	);
	const rolesCount = await countOne(
		db,
		`SELECT COUNT(*) AS n FROM role_instances WHERE territory_id = ?`,
		[territoryId],
	);

	return {
		ok: true,
		generated_at: new Date().toISOString(),
		territory: {
			territory_id: String(territory.territory_id),
			type: String(territory.type),
			name: String(territory.name),
			parent_territory_id: territory.parent_territory_id ? String(territory.parent_territory_id) : null,
		},
		chain,
		children: {
			by_type: childrenByType,
			list: childrenList.map((c) => ({ territory_id: String(c.territory_id), type: String(c.type), name: String(c.name) })),
		},
		groups: groupRows.map((g) => ({
			group_id: String(g.group_id),
			name: String(g.name),
			group_number: num(g.group_number),
			status: String(g.status),
			is_default: num(g.is_default),
			category_key: g.category_key ?? null,
			leader_name: g.leader_name ?? null,
			leader_role: g.leader_role ?? null,
		})),
		programs,
		programs_note,
		prospects_count: prospectsCount,
		roles_count: rolesCount,
	};
}

// ---------------------------------------------------------------------------
// 11. Education view: academy aggregates from the Engine sync snapshot.
// ---------------------------------------------------------------------------

export async function getEducationView(db: D1Database): Promise<{
	ok: true;
	generated_at: string;
	connected: true;
	source: string;
	by_course: Array<{ course_id: number; enrolled: number; certified: number }>;
	students: number;
	certified: number;
	last_sync: string | null;
	note: string;
}> {
	const academy = await academyAggregates(db);
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		connected: true,
		source: "Academy sync snapshot in the Engine (Moodle read-only sync)",
		by_course: academy.by_course,
		students: academy.students,
		certified: academy.certified,
		last_sync: academy.last_sync,
		note: ACADEMY_NOTE,
	};
}
