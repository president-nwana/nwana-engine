// Personal Best tracking + Nordic Walking Performance Levels for the
// Charity Challenge (recognition v1, 2026-10-07).
//
// SCOPE
// - Personal Best: all 19 fixed-distance ("speed") events, race 216323.
//   (rsu_user_id, event_id) -> fastest valid result ever.
// - Performance Levels: ONLY the 4 Nordic Walking charity events
//   (1K/3K/5K/10K), using the EXACT Series 2026 thresholds, read-only.
//   No levels for Race Walking / Walking / Running / Cycling (approved v1).
//
// CONSTRAINTS (do not relax without owner approval)
// - Series 2026 code is NEVER modified here: classifySeries2026Level is
//   imported read-only from ./race-lifecycle. The charity path below is a
//   separate function so Series 2026 behavior stays byte-for-byte identical.
// - No thresholds are invented: anything outside the 4 NW events returns null.
// - $0: no new services, no polling. Ingestion is explicit/on-demand only.
//
// DATA MODEL
// - Source of per-activity truth: challenge_activities (written at submit
//   time after a successful RunSignup write; hard-deleted on delete).
// - Valid result for PB = row with time_s NOT NULL and time_s > 0.
//   Deleted activities are gone from the table (excluded by construction);
//   RunSignup-rejected activities are never inserted (excluded by construction).
// - challenge_personal_bests is DERIVED: recomputePersonalBest() rebuilds it
//   from scratch on every insert/delete, so deleting the current PB
//   automatically recalculates from the remaining valid results.
//
// INGESTION GAP (documented, stub below)
// - D1 only sees activities submitted through the Engine site. Activities
//   submitted directly in the RunSignup UI are invisible until ingested.
// - Minimal ingestion (same pattern as the approved milestones CSV -> D1):
//   RunSignup vr-activities report/API -> ingestChallengeResultRows() ->
//   challenge_activities (INSERT OR IGNORE) -> recomputePersonalBest().
//   Trigger: explicit owner/Engine action only, never a cron poll.
//
// FUTURE API SHAPE (proposed, NOT exposed — no route is wired until the
// Dashboard phase; adding it needs an explicit flag/approval):
//   GET /api/challenge/v1/personal-best?rsu_user_id=<id>&event_id=<id>
//   -> { ok, rsu_user_id, event_id, best_time_s, best_time_display,
//        best_tally_split_num, best_activity_date,
//        previous_best_s, improvement_s, improvement_display,
//        performance_level (NW 1K/3K/5K/10K only, else null),
//        total_valid_results }
//   GET /api/challenge/v1/personal-best?rsu_user_id=<id>
//   -> { ok, rsu_user_id, personal_bests: [ ... per event ... ] }

import { classifySeries2026Level } from "./race-lifecycle";
import { CHALLENGE_EVENTS } from "./challenge";

/** The 19 fixed-distance ("speed") events, race 216323. */
export const SPEED_EVENT_IDS: readonly number[] = CHALLENGE_EVENTS.filter(
	(e) => e.format === "speed",
).map((e) => e.event_id);

export function isSpeedEvent(eventId: number): boolean {
	return SPEED_EVENT_IDS.includes(eventId);
}

/**
 * Nordic Walking charity events -> Series 2026 distance key.
 * ONLY these 4 events get performance levels. Everything else -> null.
 */
const CHARITY_NW_LEVEL_DISTANCE: Readonly<Record<number, "1K" | "3K" | "5K" | "10K">> = {
	1222834: "1K", // Nordic Walking — 1K
	1222835: "3K", // Nordic Walking — 3K
	1222836: "5K", // Nordic Walking — 5K
	1222837: "10K", // Nordic Walking — 10K
};

/**
 * Charity Challenge performance level for a Nordic Walking result.
 * Reuses the Series 2026 classifier READ-ONLY (imported, never copied or
 * modified): a time must be strictly below a bound to enter that level.
 * Returns null for any non-NW event or any distance outside 1K/3K/5K/10K —
 * no invented thresholds, ever.
 */
export function classifyCharityNwLevel(
	eventId: number,
	seconds: number,
): "Elite" | "High Performance" | "Performance" | "Competitive" | "Open" | null {
	const distance = CHARITY_NW_LEVEL_DISTANCE[eventId];
	if (!distance) return null;
	if (!Number.isFinite(seconds) || seconds <= 0) return null;
	return classifySeries2026Level(distance, seconds);
}

/** One valid (timed) activity for PB computation. */
export interface PbActivityInput {
	tally_split_num: number;
	time_s: number;
	activity_date: string;
}

export interface PersonalBestResult {
	best_time_s: number;
	best_tally_split_num: number;
	best_activity_date: string;
	/** Second-fastest valid time; null until 2+ valid results exist. */
	previous_best_s: number | null;
	/** previous_best_s - best_time_s; null until 2+ valid results exist. */
	improvement_s: number | null;
	/** NW 1K/3K/5K/10K only; null otherwise. */
	performance_level: string | null;
	total_valid_results: number;
}

/**
 * Pure PB computation over a set of valid activities.
 * - best = fastest valid result ever (ties: earliest activity_date, then
 *   lowest tally_split_num — deterministic).
 * - previous_best = second-fastest valid time (null until 2+ valid results).
 * - improvement = previous_best - best (null until 2+ valid results).
 * Returns null when there are no valid results (caller should delete the PB row).
 */
export function computePersonalBest(
	eventId: number,
	activities: PbActivityInput[],
): PersonalBestResult | null {
	const valid = activities.filter(
		(a) => Number.isFinite(a.time_s) && a.time_s > 0,
	);
	if (valid.length === 0) return null;
	const sorted = [...valid].sort(
		(a, b) =>
			a.time_s - b.time_s ||
			(a.activity_date < b.activity_date ? -1 : a.activity_date > b.activity_date ? 1 : 0) ||
			a.tally_split_num - b.tally_split_num,
	);
	const best = sorted[0];
	const second = sorted[1] ?? null;
	return {
		best_time_s: best.time_s,
		best_tally_split_num: best.tally_split_num,
		best_activity_date: best.activity_date,
		previous_best_s: second ? second.time_s : null,
		improvement_s: second ? second.time_s - best.time_s : null,
		performance_level: classifyCharityNwLevel(eventId, best.time_s),
		total_valid_results: sorted.length,
	};
}

/** Minimal D1 surface used by the PB functions (D1Database satisfies this). */
export interface PbDatabase {
	prepare(sql: string): {
		bind(...args: unknown[]): {
			first<T>(...args: unknown[]): Promise<T | null>;
			all<T>(): Promise<{ results: T[] }>;
			run(): Promise<unknown>;
		};
	};
}

export interface RecomputeOutcome {
	/** The PB row after recompute (null = no valid results; row deleted). */
	pb: PersonalBestResult | null;
	/** True when the recompute produced a strictly faster best than before. */
	isNewPb: boolean;
	/** Best time before this recompute (null = none). */
	previousBestBefore: number | null;
}

/**
 * Rebuild the PB row for (rsuUserId, eventId) from current valid activities.
 * Called after every activity insert and every activity delete, so the row
 * can never go stale — including the "deleted the current PB" recalc case.
 * Safe to call for non-speed events (no-op returning nulls).
 */
export async function recomputePersonalBest(
	db: PbDatabase,
	rsuUserId: number,
	eventId: number,
): Promise<RecomputeOutcome> {
	if (!Number.isInteger(rsuUserId) || rsuUserId <= 0 || !isSpeedEvent(eventId)) {
		return { pb: null, isNewPb: false, previousBestBefore: null };
	}
	const before = await db
		.prepare("SELECT best_time_s FROM challenge_personal_bests WHERE rsu_user_id = ? AND event_id = ?")
		.bind(rsuUserId, eventId)
		.first<{ best_time_s: number }>();
	const previousBestBefore = before ? before.best_time_s : null;

	const rows = await db
		.prepare(
			`SELECT tally_split_num, time_s, activity_date
			 FROM challenge_activities
			 WHERE rsu_user_id = ? AND sub_event_id = ? AND time_s IS NOT NULL AND time_s > 0`,
		)
		.bind(rsuUserId, eventId)
		.all<{ tally_split_num: number; time_s: number; activity_date: string }>();

	const pb = computePersonalBest(eventId, rows.results || []);
	if (!pb) {
		await db
			.prepare("DELETE FROM challenge_personal_bests WHERE rsu_user_id = ? AND event_id = ?")
			.bind(rsuUserId, eventId)
			.run();
		return { pb: null, isNewPb: false, previousBestBefore };
	}
	await db
		.prepare(
			`INSERT OR REPLACE INTO challenge_personal_bests
			 (rsu_user_id, event_id, best_time_s, best_tally_split_num, best_activity_date,
			  previous_best_s, improvement_s, performance_level, pb_achieved_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT pb_achieved_at FROM challenge_personal_bests WHERE rsu_user_id = ? AND event_id = ?), strftime('%Y-%m-%dT%H:%M:%fZ','now')), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
		)
		.bind(
			rsuUserId, eventId,
			pb.best_time_s, pb.best_tally_split_num, pb.best_activity_date,
			pb.previous_best_s, pb.improvement_s, pb.performance_level,
			rsuUserId, eventId,
		)
		.run();
	return {
		pb,
		isNewPb: previousBestBefore === null ? false : pb.best_time_s < previousBestBefore,
		previousBestBefore,
	};
}

/** One normalized activity row from a RunSignup report/API (ingestion stub input). */
export interface IngestActivityRow {
	tally_split_num: number;
	race_id: number;
	submit_event_id: number;
	sub_event_id: number;
	registration_id: number;
	rsu_user_id: number;
	user_name?: string | null;
	activity_date: string;
	distance_m?: number | null;
	time_s?: number | null;
	source?: string | null;
}

/**
 * Ingestion stub (NOT wired to any route): upsert normalized activity rows
 * into challenge_activities (idempotent INSERT OR IGNORE on tally_split_num),
 * then recompute PBs for every affected (rsu_user_id, sub_event_id) pair.
 *
 * Upstream step (explicit owner/Engine action, mirroring the approved
 * milestones CSV -> D1 pattern): fetch the RunSignup vr-activities
 * report/API for the fixed-distance events, normalize each row to
 * IngestActivityRow, and call this. Never a cron poll.
 */
export async function ingestChallengeResultRows(
	db: PbDatabase,
	rows: IngestActivityRow[],
): Promise<{ upserted: number; pbRecomputed: number }> {
	let upserted = 0;
	const affected = new Set<string>();
	for (const r of rows) {
		if (!Number.isInteger(r.tally_split_num) || !Number.isInteger(r.rsu_user_id)) continue;
		const res = (await db
			.prepare(
				`INSERT OR IGNORE INTO challenge_activities
				 (tally_split_num, race_id, submit_event_id, sub_event_id, registration_id,
				  rsu_user_id, user_name, activity_date, distance_m, time_s, source)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				r.tally_split_num, r.race_id, r.submit_event_id, r.sub_event_id,
				r.registration_id, r.rsu_user_id, r.user_name ?? null,
				r.activity_date, r.distance_m ?? null, r.time_s ?? null,
				r.source ?? "runsignup-ingest",
			)
			.run()) as unknown as { meta?: { changes?: number } } | undefined;
		const changes = res && typeof res === "object" && res.meta ? res.meta.changes ?? 0 : 0;
		if (changes > 0) {
			upserted++;
			affected.add(`${r.rsu_user_id}:${r.sub_event_id}`);
		}
	}
	let pbRecomputed = 0;
	for (const key of affected) {
		const [uid, eid] = key.split(":").map(Number);
		if (isSpeedEvent(eid)) {
			await recomputePersonalBest(db, uid, eid);
			pbRecomputed++;
		}
	}
	return { upserted, pbRecomputed };
}
