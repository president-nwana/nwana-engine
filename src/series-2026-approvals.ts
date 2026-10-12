// Series 2026 per-result approvals (ADR-0042).
//
// The owner's single reserved action in the results pipeline is approving
// the athlete's result (sports accuracy). Approvals are first-class records
// in series_result_approvals. The Machine never invents an approval.
//
// Two durable approval sources exist:
//   ENGINE — explicit owner action: OC button ('oc'), owner statement in
//            chat recorded by the agent ('chat'), or bulk import ('import').
//            This is the stronger display label.
//   RUNSIGNUP — the owner's approval inside the RunSignup dashboard,
//            observed once via the presence signal (public get-results with
//            results_require_approval=T) and persisted to D1 immediately.
//            A later RunSignup 5xx/522 never revokes this durable fact.
// Either source authorizes downstream processing; a RUNSIGNUP row is never
// downgraded or deleted, but an explicit later owner approval upgrades it.

export const APPROVAL_SERIES = "SERIES_2026";

/** D1 source values for series_result_approvals. */
export type ApprovalSourceName = "oc" | "chat" | "import" | "runsignup";

export interface ResultApprovalInput {
	distance: string;
	raceId: number;
	eventId: number;
	resultId: string;
	athlete?: string | null;
	time?: string | null;
	source: "oc" | "chat" | "import";
}

export interface ResultApproval extends ResultApprovalInput {
	series: string;
	approvedAt: string;
	approvedBy: string;
}

/**
 * Record one owner approval. Idempotent: re-approving the same result
 * keeps the earliest owner approval timestamp. If the existing row is a
 * RUNSIGNUP-observed approval, the explicit owner approval upgrades it
 * (owner is the stronger display label); an existing owner approval is
 * never downgraded or replaced.
 */
export async function recordResultApproval(
	db: D1Database,
	input: ResultApprovalInput,
): Promise<ResultApproval> {
	const approvedAt = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO series_result_approvals
				(series, distance, race_id, event_id, result_id, athlete, time,
				 approved_at, approved_by, source)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'owner', ?)
			 ON CONFLICT (series, distance, event_id, result_id) DO UPDATE SET
				athlete = excluded.athlete,
				time = excluded.time,
				approved_at = excluded.approved_at,
				approved_by = 'owner',
				source = excluded.source
			 WHERE series_result_approvals.source = 'runsignup'`,
		)
		.bind(
			APPROVAL_SERIES,
			input.distance,
			input.raceId,
			input.eventId,
			input.resultId,
			input.athlete ?? null,
			input.time ?? null,
			approvedAt,
			input.source,
		)
		.run();
	const row = await db
		.prepare(
			`SELECT series, distance, race_id AS raceId, event_id AS eventId,
				result_id AS resultId, athlete, time, approved_at AS approvedAt,
				approved_by AS approvedBy, source
			 FROM series_result_approvals
			 WHERE series = ? AND distance = ? AND event_id = ? AND result_id = ?`,
		)
		.bind(APPROVAL_SERIES, input.distance, input.eventId, input.resultId)
		.first<ResultApproval>();
	if (!row) throw new Error("Approval was not recorded");
	return row;
}

/**
 * Persist a RUNSIGNUP presence-signal approval as a durable D1 fact.
 *
 * Called the moment a result is observed in RunSignup public get-results
 * while results_require_approval=T: presence IS the owner's approval, and
 * from this point the Machine works from D1 only. A later RunSignup
 * 5xx/522 must never revoke or block this fact.
 *
 * Idempotent and non-downgrading: ON CONFLICT DO NOTHING — an existing
 * row (owner approval or an earlier RUNSIGNUP observation) is never
 * touched, so the earliest observation timestamp is kept.
 */
export async function recordRunsignupApproval(
	db: D1Database,
	input: {
		distance: string;
		raceId: number;
		eventId: number;
		resultId: string;
		athlete?: string | null;
		time?: string | null;
	},
): Promise<ResultApproval> {
	const approvedAt = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO series_result_approvals
				(series, distance, race_id, event_id, result_id, athlete, time,
				 approved_at, approved_by, source)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'runsignup', 'runsignup')
			 ON CONFLICT (series, distance, event_id, result_id) DO NOTHING`,
		)
		.bind(
			APPROVAL_SERIES,
			input.distance,
			input.raceId,
			input.eventId,
			input.resultId,
			input.athlete ?? null,
			input.time ?? null,
			approvedAt,
		)
		.run();
	const row = await db
		.prepare(
			`SELECT series, distance, race_id AS raceId, event_id AS eventId,
				result_id AS resultId, athlete, time, approved_at AS approvedAt,
				approved_by AS approvedBy, source
			 FROM series_result_approvals
			 WHERE series = ? AND distance = ? AND event_id = ? AND result_id = ?`,
		)
		.bind(APPROVAL_SERIES, input.distance, input.eventId, input.resultId)
		.first<ResultApproval>();
	if (!row) throw new Error("RUNSIGNUP approval was not recorded");
	return row;
}

/** All approvals for one event, keyed by result_id. */
export async function getEventApprovals(
	db: D1Database,
	distance: string,
	eventId: number,
): Promise<Map<string, ResultApproval>> {
	const rows = await db
		.prepare(
			`SELECT series, distance, race_id AS raceId, event_id AS eventId,
				result_id AS resultId, athlete, time, approved_at AS approvedAt,
				approved_by AS approvedBy, source
			 FROM series_result_approvals
			 WHERE series = ? AND distance = ? AND event_id = ?`,
		)
		.bind(APPROVAL_SERIES, distance, eventId)
		.all<ResultApproval>();
	const map = new Map<string, ResultApproval>();
	for (const row of rows.results) map.set(row.resultId, row);
	return map;
}

/** True when every result_id in the list has a recorded owner approval.
 * ENGINE approvals are re-read from D1; extraApprovedIds carries approvals
 * from other owner-controlled sources (e.g. the RUNSIGNUP presence-signal
 * ids carried by the trigger evaluation) — they are accepted without
 * inventing D1 rows. */
export async function allResultsApproved(
	db: D1Database,
	distance: string,
	eventId: number,
	resultIds: string[],
	extraApprovedIds?: Set<string>,
): Promise<boolean> {
	if (resultIds.length === 0) return false;
	const approvals = await getEventApprovals(db, distance, eventId);
	return resultIds.every(
		(id) => approvals.has(id) || extraApprovedIds?.has(id) === true,
	);
}
