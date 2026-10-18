/**
 * Phase 2 — received-money recording for the sponsorship / B2B lanes
 * (TZ sections 5.2-5.4, 7.2, 8, 13 Phase 2; ADR-0045 canonical store).
 *
 * The outreach machine finds sources and runs conversations; until now it
 * had no honest way to book a real B2B receipt. This module is that path:
 * one explicit, owner-triggered write (the OPERATING_PLAN trigger rule —
 * no cron, no polling) that lands a received sponsorship or contract
 * payment in the canonical money_events / money_transactions store with
 * source, territory and restriction attribution.
 *
 * Lane gates (funding_lane_gates, migration 0098) are enforced here at
 * the exact legal seam the Phase 1A memo draws: the Florida gate blocks
 * SOLICITATION, not bookkeeping. A donation-lane receipt whose territory
 * sits in a CLOSED-gate state is therefore accepted only when the
 * operator attests it did NOT arise from a solicitation (an unsolicited
 * gift); the attestation is written into the event note. A receipt that
 * did arise from solicitation in a gated state is refused, with the gate
 * basis returned. Grant-lane receipts are refused while the owner's stop
 * order stands (TZ 5.5): under the stop there is no application that
 * could have produced one.
 *
 * Idempotency: the payment reference is the identity. Re-recording the
 * same payment_ref is a no-op that reports `recorded: false`.
 *
 * Money semantics follow ADR-0045: gross is VERIFIED (the operator
 * attests the receipt from a bank/payment record), fee is VERIFIED only
 * when supplied, and net stays NULL / UNKNOWN — settlement truth is
 * never derived.
 */
import {
	AMOUNT_UNKNOWN,
	AMOUNT_VERIFIED,
	FUNDING_LANES,
	MANUAL_B2B_SOURCE_SYSTEM,
	RESTRICTIONS,
	receiptEventKey,
	snapshotHash,
	transactionKey,
	type FundingLane,
	type MoneyEventType,
	type Restriction,
} from "./money-model";

export interface LaneGate {
	lane: string;
	scope: string;
	status: "OPEN" | "CLOSED" | "OWNER_STOP";
	basis: string;
	source: string;
	updated_at: string;
}

/** All lane gates as stored. Throws when migration 0098 has not run. */
export async function getLaneGates(db: D1Database): Promise<LaneGate[]> {
	const rows = await db
		.prepare(
			`SELECT lane, scope, status, basis, source, updated_at
			 FROM funding_lane_gates ORDER BY lane, scope`,
		)
		.all<LaneGate>();
	return rows.results ?? [];
}

/** The most specific gate for a lane in a state (state row beats ALL). */
export function pickGate(
	gates: LaneGate[],
	lane: string,
	stateUsps: string | null,
): LaneGate | null {
	const forLane = gates.filter((g) => g.lane === lane);
	return (
		forLane.find((g) => stateUsps && g.scope === stateUsps) ??
		forLane.find((g) => g.scope === "ALL") ??
		null
	);
}

export interface RecordReceiptInput {
	lane: FundingLane;
	/** External unique payment reference (ACH trace, check number, invoice payment id). */
	payment_ref: string;
	amount_cents: number;
	currency?: string;
	/** ISO timestamp of when the money was received. */
	occurred_at: string;
	/** TZ: every money record carries a territory. Required, must exist. */
	territory_id: string;
	restriction?: Restriction | null;
	/** outreach_prospects.id when the receipt comes from the outreach machine. */
	source_prospect_id?: number | null;
	fee_cents?: number | null;
	/** Business payer name, stored in the event note (no consumer PII). */
	payer_name?: string | null;
	/** Donation lane only: did this receipt arise from a solicitation? */
	solicitation?: boolean;
	note?: string | null;
}

export type RecordReceiptResult =
	| { ok: true; recorded: boolean; event_key: string; transaction_key: string }
	| { ok: false; error: string; gate_status?: string; gate_basis?: string };

const LANE_EVENT_TYPE: Partial<Record<FundingLane, MoneyEventType>> = {
	sponsorship: "sponsorship_received",
	contract: "contract_payment_received",
	grant: "grant_received",
	donation: "donation_received",
};

interface TerritoryRow {
	territory_id: string;
	type: string;
	usps: string | null;
	state_fips: string | null;
}

/** Resolve a territory to its state USPS code (null for NATIONAL/CONTINENTAL). */
async function resolveStateUsps(
	db: D1Database,
	territoryId: string,
): Promise<{ territory: TerritoryRow | null; stateUsps: string | null }> {
	const territory = await db
		.prepare(
			`SELECT territory_id, type, usps, state_fips FROM territories WHERE territory_id = ?`,
		)
		.bind(territoryId)
		.first<TerritoryRow>();
	if (!territory) return { territory: null, stateUsps: null };
	if (territory.type === "STATE") return { territory, stateUsps: territory.usps };
	if (territory.state_fips) {
		const state = await db
			.prepare(
				`SELECT usps FROM territories WHERE type = 'STATE' AND state_fips = ?`,
			)
			.bind(territory.state_fips)
			.first<{ usps: string | null }>();
		return { territory, stateUsps: state?.usps ?? null };
	}
	return { territory, stateUsps: null };
}

export async function recordReceivedPayment(
	db: D1Database,
	input: RecordReceiptInput,
): Promise<RecordReceiptResult> {
	if (!(FUNDING_LANES as readonly string[]).includes(input.lane)) {
		return { ok: false, error: `unknown funding lane: ${String(input.lane)}` };
	}
	const eventType = LANE_EVENT_TYPE[input.lane];
	if (!eventType) {
		return {
			ok: false,
			error: `lane '${input.lane}' carries no money receipt (in-kind value is tracked in commitments, not in the money store)`,
		};
	}
	if (!input.payment_ref || typeof input.payment_ref !== "string") {
		return { ok: false, error: "payment_ref is required (the external payment reference is the idempotency identity)" };
	}
	if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) {
		return { ok: false, error: "amount_cents must be a positive integer (received money only; pledges are not recorded here)" };
	}
	if (!input.occurred_at || Number.isNaN(Date.parse(input.occurred_at))) {
		return { ok: false, error: "occurred_at must be an ISO timestamp of the receipt" };
	}
	if (input.restriction != null && !(RESTRICTIONS as readonly string[]).includes(input.restriction)) {
		return { ok: false, error: `unknown restriction: ${String(input.restriction)}` };
	}
	if (input.fee_cents != null && (!Number.isInteger(input.fee_cents) || input.fee_cents < 0)) {
		return { ok: false, error: "fee_cents must be a non-negative integer when supplied" };
	}

	const { territory, stateUsps } = await resolveStateUsps(db, input.territory_id);
	if (!territory) {
		return { ok: false, error: `unknown territory_id: ${input.territory_id} (every money record must carry a real territory)` };
	}

	// Lane gate enforcement (funding_lane_gates; TZ section 8).
	let gates: LaneGate[] = [];
	try {
		gates = await getLaneGates(db);
	} catch {
		return { ok: false, error: "funding_lane_gates is not available (migration 0098 not applied); receipts cannot be recorded against unknown gates" };
	}
	const gate = pickGate(gates, input.lane, stateUsps);
	if (gate && gate.status !== "OPEN") {
		if (input.lane === "grant") {
			return {
				ok: false,
				error: `grant lane is ${gate.status}: no grant receipt can exist while the owner's stop order stands`,
				gate_status: gate.status,
				gate_basis: gate.basis,
			};
		}
		if (input.lane === "donation" && input.solicitation !== false) {
			return {
				ok: false,
				error:
					`donation lane gate is ${gate.status} for scope ${gate.scope}: a receipt arising from solicitation cannot be booked while the gate is closed. ` +
					`If this money was genuinely unsolicited, re-submit with solicitation=false; the attestation is recorded in the event note.`,
				gate_status: gate.status,
				gate_basis: gate.basis,
			};
		}
	}

	// Attribution: source first (TZ 7.2 — receipts are attributed to source,
	// territory and restriction).
	let attribution = `manual-b2b:${input.lane}`;
	if (input.source_prospect_id != null) {
		const prospect = await db
			.prepare(`SELECT id, track FROM outreach_prospects WHERE id = ?`)
			.bind(input.source_prospect_id)
			.first<{ id: number; track: string }>();
		if (!prospect) {
			return { ok: false, error: `unknown source_prospect_id: ${input.source_prospect_id}` };
		}
		attribution = `outreach:${prospect.track}:prospect:${prospect.id}`;
	}

	const sourceTransactionId = input.payment_ref;
	const txnKey = transactionKey(MANUAL_B2B_SOURCE_SYSTEM, sourceTransactionId);
	const eventKey = receiptEventKey(MANUAL_B2B_SOURCE_SYSTEM, eventType, sourceTransactionId);
	const hash = snapshotHash({
		lane: input.lane,
		payment_ref: input.payment_ref,
		amount_cents: input.amount_cents,
		occurred_at: input.occurred_at,
		territory_id: input.territory_id,
	});
	const noteParts: string[] = [];
	if (input.payer_name) noteParts.push(`payer: ${input.payer_name}`);
	if (input.lane === "donation" && gate && gate.status !== "OPEN" && input.solicitation === false) {
		noteParts.push(`operator attestation: unsolicited receipt, no solicitation (donation gate ${gate.status}, scope ${gate.scope})`);
	}
	if (input.note) noteParts.push(input.note);
	const note = noteParts.length ? noteParts.join("; ") : null;
	const currency = input.currency ?? "USD";

	const results = await db.batch([
		db
			.prepare(
				`INSERT OR IGNORE INTO money_events (
					event_key, source_system, source_transaction_id, transaction_key,
					event_type, occurred_at, currency,
					gross_cents, gross_status, fee_cents, fee_status,
					amount_paid_cents, amount_paid_status,
					net_cents, net_status, refund_cents, refund_status,
					attribution, source_ref, source_payload_hash, note,
					territory_id, funding_lane, restriction, source_prospect_id
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?, ?, NULL, 'UNKNOWN', NULL, 'UNKNOWN', NULL, 'UNKNOWN', ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				eventKey,
				MANUAL_B2B_SOURCE_SYSTEM,
				sourceTransactionId,
				txnKey,
				eventType,
				input.occurred_at,
				currency,
				input.amount_cents,
				input.fee_cents ?? null,
				input.fee_cents != null ? AMOUNT_VERIFIED : AMOUNT_UNKNOWN,
				attribution,
				`manual-b2b:${input.lane}:${input.payment_ref}`,
				hash,
				note,
				input.territory_id,
				input.lane,
				input.restriction ?? null,
				input.source_prospect_id ?? null,
			),
		db
			.prepare(
				`INSERT OR IGNORE INTO money_transactions (
					transaction_key, source_system, source_transaction_id, first_event_key,
					currency, gross_cents, gross_status, fee_cents, fee_status,
					amount_paid_cents, amount_paid_status,
					net_cents, net_status, refund_cents, refund_status,
					lifecycle_state, attribution, source_ref, source_payload_hash,
					territory_id, funding_lane, restriction, source_prospect_id
				) VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED', ?, ?, NULL, 'UNKNOWN', NULL, 'UNKNOWN', NULL, 'UNKNOWN', 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				txnKey,
				MANUAL_B2B_SOURCE_SYSTEM,
				sourceTransactionId,
				eventKey,
				currency,
				input.amount_cents,
				input.fee_cents ?? null,
				input.fee_cents != null ? AMOUNT_VERIFIED : AMOUNT_UNKNOWN,
				attribution,
				`manual-b2b:${input.lane}:${input.payment_ref}`,
				hash,
				input.territory_id,
				input.lane,
				input.restriction ?? null,
				input.source_prospect_id ?? null,
			),
	]);

	const eventChanges = Number(results[0]?.meta?.changes ?? 0);
	return { ok: true, recorded: eventChanges > 0, event_key: eventKey, transaction_key: txnKey };
}
