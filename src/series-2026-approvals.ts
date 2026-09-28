// Series 2026 per-result owner approvals (ADR-0042).
//
// The owner's single reserved action in the results pipeline is approving
// the athlete's result (sports accuracy). Approvals are first-class records
// in series_result_approvals. The Machine never invents an approval; the
// downstream lifecycle is authorized by recorded approvals.

export const APPROVAL_SERIES = "SERIES_2026";

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
 * keeps the earliest approval timestamp.
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

/** True when every result_id in the list has a recorded owner approval. */
export async function allResultsApproved(
	db: D1Database,
	distance: string,
	eventId: number,
	resultIds: string[],
): Promise<boolean> {
	if (resultIds.length === 0) return false;
	const approvals = await getEventApprovals(db, distance, eventId);
	return resultIds.every((id) => approvals.has(id));
}
