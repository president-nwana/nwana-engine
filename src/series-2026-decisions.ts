// Series 2026 per-result owner disqualifications (ADR-0043).
//
// The owner's sports decisions on a submitted result are exactly two:
// Approve (series_result_approvals) or Disqualify (series_result_disqualifications).
// Absence of a decision is NOT a disqualification: the result stays Submitted.
//
// A disqualified result: 0 points, excluded from valid finishes and from
// scoring (standings upload), displayed as DSQ. DNS is never a decision:
// a registered athlete with no submitted result after the deadline is a
// derived DNS, not stored.

import { APPROVAL_SERIES } from "./series-2026-approvals";

export interface ResultDisqualificationInput {
	distance: string;
	raceId: number;
	eventId: number;
	resultId: string;
	athlete?: string | null;
	time?: string | null;
	reason?: string | null;
	source: "oc" | "chat" | "import";
}

export interface ResultDisqualification extends ResultDisqualificationInput {
	series: string;
	decidedAt: string;
	decidedBy: string;
}

/**
 * Record one owner disqualification. Idempotent per result: a second
 * decision on the same result keeps the earliest timestamp but updates
 * the reason. Any existing approval for the same result is removed first —
 * a result cannot be both approved and disqualified.
 */
export async function recordResultDisqualification(
	db: D1Database,
	input: ResultDisqualificationInput,
): Promise<ResultDisqualification> {
	const decidedAt = new Date().toISOString();
	await db
		.prepare(
			`DELETE FROM series_result_approvals
			 WHERE series = ? AND distance = ? AND event_id = ? AND result_id = ?`,
		)
		.bind(APPROVAL_SERIES, input.distance, input.eventId, input.resultId)
		.run();
	await db
		.prepare(
			`INSERT INTO series_result_disqualifications
				(series, distance, race_id, event_id, result_id, athlete, time,
				 reason, decided_at, decided_by, source)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'owner', ?)
			 ON CONFLICT (series, distance, event_id, result_id) DO UPDATE SET
				reason = excluded.reason,
				athlete = excluded.athlete,
				time = excluded.time`,
		)
		.bind(
			APPROVAL_SERIES,
			input.distance,
			input.raceId,
			input.eventId,
			input.resultId,
			input.athlete ?? null,
			input.time ?? null,
			input.reason ?? null,
			decidedAt,
			input.source,
		)
		.run();
	const row = await db
		.prepare(
			`SELECT series, distance, race_id AS raceId, event_id AS eventId,
				result_id AS resultId, athlete, time, reason,
				decided_at AS decidedAt, decided_by AS decidedBy, source
			 FROM series_result_disqualifications
			 WHERE series = ? AND distance = ? AND event_id = ? AND result_id = ?`,
		)
		.bind(APPROVAL_SERIES, input.distance, input.eventId, input.resultId)
		.first<ResultDisqualification>();
	if (!row) throw new Error("Disqualification was not recorded");
	return row;
}

/**
 * Clear the owner's decision on a result (approval or disqualification).
 * The result returns to Submitted. Used to correct a mistaken decision;
 * the audit trail keeps the auto-process log, not the cleared decision.
 */
export async function clearResultDecision(
	db: D1Database,
	input: { distance: string; eventId: number; resultId: string },
): Promise<{ clearedApproval: boolean; clearedDisqualification: boolean }> {
	const approval = await db
		.prepare(
			`DELETE FROM series_result_approvals
			 WHERE series = ? AND distance = ? AND event_id = ? AND result_id = ?
			 RETURNING result_id`,
		)
		.bind(APPROVAL_SERIES, input.distance, input.eventId, input.resultId)
		.all();
	const dsq = await db
		.prepare(
			`DELETE FROM series_result_disqualifications
			 WHERE series = ? AND distance = ? AND event_id = ? AND result_id = ?
			 RETURNING result_id`,
		)
		.bind(APPROVAL_SERIES, input.distance, input.eventId, input.resultId)
		.all();
	return {
		clearedApproval: (approval.results?.length ?? 0) > 0,
		clearedDisqualification: (dsq.results?.length ?? 0) > 0,
	};
}

/** All disqualifications for one event, keyed by result_id. */
export async function getEventDisqualifications(
	db: D1Database,
	distance: string,
	eventId: number,
): Promise<Map<string, ResultDisqualification>> {
	const rows = await db
		.prepare(
			`SELECT series, distance, race_id AS raceId, event_id AS eventId,
				result_id AS resultId, athlete, time, reason,
				decided_at AS decidedAt, decided_by AS decidedBy, source
			 FROM series_result_disqualifications
			 WHERE series = ? AND distance = ? AND event_id = ?`,
		)
		.bind(APPROVAL_SERIES, distance, eventId)
		.all<ResultDisqualification>();
	const map = new Map<string, ResultDisqualification>();
	for (const row of rows.results) map.set(row.resultId, row);
	return map;
}
