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
// - PB history is a story over time: computePersonalBest() replays the valid
//   activities in chronological order (activity_date, then tally_split_num).
//   The first valid result is the baseline; every STRICTLY faster result
//   becomes the new PB and remembers the record it beat as previous_best_s
//   (so previous_best is the true previous personal record, NOT the
//   second-fastest time — a later slower result never rewrites it).
// - pb_achieved_at is derived too: it is always the activity_date of the
//   activity that set the current best (best_activity_date), so baseline,
//   new PB, slower-result, and delete-recalc cases are all correct by
//   construction.
//
// INGESTION GAP (documented; reconcileChallengeActivities() below)
// - D1 only sees activities submitted through the Engine site. Activities
//   submitted directly in the RunSignup UI are invisible until ingested.
// - Sync is RECONCILIATION, not append-only: a full per-event RunSignup
//   activity set is diffed against D1 — missing D1 rows are inserted,
//   changed rows are updated, D1 rows absent from RunSignup are deleted
//   (direct RunSignup deletions must not leave stale D1 rows, otherwise
//   a deleted-PB would survive and stay false). After the diff, affected
//   PBs are recomputed via recomputePersonalBest().
// - Upstream step (explicit owner/Engine action, mirroring the approved
//   milestones CSV -> D1 pattern): fetch the RunSignup vr-activities
//   report/API for the fixed-distance events, normalize each row to
//   IngestActivityRow, and call reconcileChallengeActivities(). Never a
//   cron poll.
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
import { CHALLENGE_EVENTS } from "./challenge-events";

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
	/**
	 * The personal record beaten by the current best — i.e. the PB that was
	 * standing at the moment the current best was achieved. This is NOT the
	 * second-fastest time: a slower result logged after the PB never
	 * rewrites it. Null until a strictly faster result beats the baseline.
	 */
	previous_best_s: number | null;
	/** previous_best_s - best_time_s; null until a PB is beaten. */
	improvement_s: number | null;
	/** NW 1K/3K/5K/10K only; null otherwise. */
	performance_level: string | null;
	total_valid_results: number;
}

/**
 * Pure PB computation over a set of valid activities.
 *
 * Replays history chronologically (activity_date asc, then tally_split_num
 * asc for same-day determinism):
 * - the first valid result is the baseline (previous_best/improvement null);
 * - every STRICTLY faster result becomes the new PB, remembering the beaten
 *   record as previous_best_s;
 * - slower (or tied) later results change nothing.
 * Ties for the best keep the earliest achiever (strictly-faster rule), so
 * best_activity_date is always when the current PB was first achieved.
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
	const chrono = [...valid].sort(
		(a, b) =>
			(a.activity_date < b.activity_date ? -1 : a.activity_date > b.activity_date ? 1 : 0) ||
			a.tally_split_num - b.tally_split_num,
	);
	let best = chrono[0];
	let previous: PbActivityInput | null = null;
	for (const a of chrono.slice(1)) {
		if (a.time_s < best.time_s) {
			previous = best;
			best = a;
		}
	}
	return {
		best_time_s: best.time_s,
		best_tally_split_num: best.tally_split_num,
		best_activity_date: best.activity_date,
		previous_best_s: previous ? previous.time_s : null,
		improvement_s: previous ? previous.time_s - best.time_s : null,
		performance_level: classifyCharityNwLevel(eventId, best.time_s),
		total_valid_results: valid.length,
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
			// pb_achieved_at is DERIVED: it is always the activity_date of the
			// activity that set the current best (best_activity_date). Baseline
			// -> baseline date; new PB -> new PB date; slower result -> best
			// unchanged so the date is unchanged; delete-recalc -> the
			// surviving PB's date. Never a stale "first ever" timestamp.
			`INSERT OR REPLACE INTO challenge_personal_bests
			 (rsu_user_id, event_id, best_time_s, best_tally_split_num, best_activity_date,
			  previous_best_s, improvement_s, performance_level, pb_achieved_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
		)
		.bind(
			rsuUserId, eventId,
			pb.best_time_s, pb.best_tally_split_num, pb.best_activity_date,
			pb.previous_best_s, pb.improvement_s, pb.performance_level,
			pb.best_activity_date,
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

/** Outcome of a reconciliation sync for one or more events. */
export interface ReconcileOutcome {
	/** Rows inserted (present in RunSignup, absent in D1). */
	inserted: number;
	/** Rows updated (present in both, field values differ). */
	updated: number;
	/** Rows deleted (present in D1, absent from RunSignup). */
	deleted: number;
	/** PB recomputes performed over affected (user, event) pairs. */
	pbRecomputed: number;
}

/** Minimal D1 row shape needed for the diff. */
interface D1ActivityRow {
	tally_split_num: number;
	rsu_user_id: number;
	registration_id: number | null;
	activity_date: string | null;
	distance_m: number | null;
	time_s: number | null;
}

function rowsEqual(a: D1ActivityRow, b: IngestActivityRow): boolean {
	const norm = (v: number | null | undefined) => (v ?? null);
	return (
		a.rsu_user_id === b.rsu_user_id &&
		norm(a.registration_id) === norm(b.registration_id) &&
		(a.activity_date ?? null) === (b.activity_date ?? null) &&
		norm(a.distance_m) === norm(b.distance_m) &&
		norm(a.time_s) === norm(b.time_s)
	);
}

/**
 * Reconciliation sync: RunSignup -> D1 (NOT append-only).
 *
 * Takes the FULL normalized activity set for the given event(s) as currently
 * reported by RunSignup and diffs it against D1 `challenge_activities`:
 * - RunSignup rows missing in D1 -> INSERT.
 * - Rows present in both but with differing fields -> UPDATE.
 * - D1 rows absent from the RunSignup set -> DELETE (covers activities
 *   deleted directly in the RunSignup UI, so a deleted PB cannot survive
 *   as a false record).
 * Then recomputes PBs for every affected (rsu_user_id, sub_event_id) pair
 * via recomputePersonalBest() (which rebuilds from the remaining valid
 * rows, so PB deletion recalc is automatic).
 *
 * Idempotent: running twice with the same input performs zero changes on
 * the second run. Not wired to any route/cron — explicit owner/Engine
 * action only.
 *
 * Scope: reconciliation runs per event. The scope is the union of the
 * events present in `rows` and the optional `opts.eventIds` — the latter
 * exists so an event can be reconciled down to zero activities (an empty
 * `rows` array alone means "nothing in scope", never "delete everything").
 */
export async function reconcileChallengeActivities(
	db: PbDatabase,
	rows: IngestActivityRow[],
	opts?: { eventIds?: number[] },
): Promise<ReconcileOutcome> {
	const outcome: ReconcileOutcome = { inserted: 0, updated: 0, deleted: 0, pbRecomputed: 0 };
	const affected = new Set<string>();
	const markAffected = (uid: number, eid: number) => {
		affected.add(`${uid}:${eid}`);
	};

	// Group incoming rows by event; dedupe by tally_split_num within event.
	const byEvent = new Map<number, Map<number, IngestActivityRow>>();
	for (const r of rows) {
		if (!Number.isInteger(r.tally_split_num) || !Number.isInteger(r.rsu_user_id)) continue;
		if (!Number.isInteger(r.sub_event_id)) continue;
		let m = byEvent.get(r.sub_event_id);
		if (!m) {
			m = new Map();
			byEvent.set(r.sub_event_id, m);
		}
		if (!m.has(r.tally_split_num)) m.set(r.tally_split_num, r);
	}

	const scope = new Set<number>(byEvent.keys());
	for (const eid of opts?.eventIds ?? []) if (Number.isInteger(eid)) scope.add(eid);

	for (const eventId of scope) {
		const incoming = byEvent.get(eventId) ?? new Map<number, IngestActivityRow>();
		const current = await db
			.prepare(
				`SELECT tally_split_num, rsu_user_id, registration_id, activity_date, distance_m, time_s
				 FROM challenge_activities WHERE sub_event_id = ?`,
			)
			.bind(eventId)
			.all<D1ActivityRow>();
		const currentById = new Map<number, D1ActivityRow>();
		for (const row of current.results || []) currentById.set(row.tally_split_num, row);

		// Deletes: in D1 but absent from the RunSignup set.
		for (const [tallyId, d1row] of currentById) {
			if (!incoming.has(tallyId)) {
				await db
					.prepare("DELETE FROM challenge_activities WHERE tally_split_num = ?")
					.bind(tallyId)
					.run();
				outcome.deleted++;
				markAffected(d1row.rsu_user_id, eventId);
			}
		}

		// Inserts + updates.
		for (const [tallyId, r] of incoming) {
			const d1row = currentById.get(tallyId);
			if (!d1row) {
				await db
					.prepare(
						`INSERT INTO challenge_activities
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
					.run();
				outcome.inserted++;
				markAffected(r.rsu_user_id, eventId);
			} else if (!rowsEqual(d1row, r)) {
				await db
					.prepare(
						`UPDATE challenge_activities
						 SET rsu_user_id = ?, registration_id = ?, user_name = ?, activity_date = ?,
						     distance_m = ?, time_s = ?, source = ?
						 WHERE tally_split_num = ?`,
					)
					.bind(
						r.rsu_user_id, r.registration_id, r.user_name ?? null,
						r.activity_date, r.distance_m ?? null, r.time_s ?? null,
						r.source ?? "runsignup-ingest", tallyId,
					)
					.run();
				outcome.updated++;
				markAffected(r.rsu_user_id, eventId);
				if (d1row.rsu_user_id !== r.rsu_user_id) markAffected(d1row.rsu_user_id, eventId);
			}
		}
	}

	for (const key of affected) {
		const [uid, eid] = key.split(":").map(Number);
		if (isSpeedEvent(eid)) {
			await recomputePersonalBest(db, uid, eid);
			outcome.pbRecomputed++;
		}
	}
	return outcome;
}
