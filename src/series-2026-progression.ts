// Series 2026 athlete progression model (ADR-0043).
//
// ONE shared computation used by BOTH the Operating Center and the public
// site. Rows = athletes, columns = events of one distance left to right by
// date, then summary columns (Races, Best Time, Level/Division, Points,
// Rank). Standings stay bucketed by Performance Level + Gender: an athlete
// who scored in several levels gets one bucket entry per level, never a
// mixed fake total.
//
// This module is intentionally pure: no D1, no fetch, no imports. The engine
// and the site worker assemble the input from production data and call
// buildProgressionMatrix(). Do not fork this logic.

export interface ProgressionEvent {
	event_id: number;
	event_name: string | null;
	event_date: string | null;
	/** ISO submission deadline; null = unknown (deadline trigger cannot fire). */
	deadline: string | null;
}

export interface ProgressionCellInput {
	registered: boolean;
	/** A result exists for this athlete/event (live or finalized snapshot). */
	submitted: boolean;
	approved: boolean;
	disqualified: boolean;
	/** Level + Level Place + points are finalized (levels applied). */
	processed: boolean;
	time: string | null;
	time_seconds: number | null;
	level: string | null;
	level_place: number | null;
	points: number | null;
	gender: string | null;
}

export interface ProgressionAthleteInput {
	name: string;
	gender: string | null;
	cells: Record<string, ProgressionCellInput>;
}

export interface ProgressionInput {
	distance: string;
	events: ProgressionEvent[];
	athletes: ProgressionAthleteInput[];
	now: number;
}

export type OcCellState =
	| "empty"
	| "registered"
	| "submitted"
	| "approved"
	| "exception"
	| "dns"
	| "dsq"
	| "final";

export type PublicCellState = "empty" | "dns" | "dsq" | "final";

export interface ProgressionCellOut {
	state: OcCellState | PublicCellState;
	time: string | null;
	level: string | null;
	level_place: number | null;
	points: number | null;
}

export interface ProgressionBucket {
	level: string;
	gender: "Men" | "Women";
	points: number;
	races: number;
	rank: number;
}

export interface ProgressionRow {
	name: string;
	gender: string | null;
	cells: Record<string, ProgressionCellOut>;
	/** Approved valid finishes only. DNS, DSQ and registrations without a
	 * valid result never count. */
	races: number;
	best_time: string | null;
	best_time_seconds: number | null;
	buckets: ProgressionBucket[];
}

export interface BucketStandingEntry {
	name: string;
	points: number;
	races: number;
	best_time: string | null;
	rank: number;
}

export interface BucketStanding {
	level: string;
	gender: "Men" | "Women";
	entries: BucketStandingEntry[];
}

export interface ProgressionMatrix {
	distance: string;
	events: ProgressionEvent[];
	rows: ProgressionRow[];
	buckets: BucketStanding[];
}

function normGender(value: string | null): "Men" | "Women" | null {
	const v = (value ?? "").toUpperCase();
	if (v === "M" || v === "MEN" || v === "MALE") return "Men";
	if (v === "F" || v === "WOMEN" || v === "FEMALE") return "Women";
	return null;
}

function deadlinePassed(deadline: string | null, now: number): boolean {
	if (!deadline) return false;
	const ts = Date.parse(deadline);
	if (Number.isNaN(ts)) return false;
	return now >= ts;
}

function ocState(cell: ProgressionCellInput, deadlineIsPast: boolean): OcCellState {
	if (cell.disqualified) return "dsq";
	if (cell.processed) return "final";
	if (cell.submitted && !cell.registered) return "exception";
	if (cell.submitted && cell.approved) return "approved";
	if (cell.submitted) return "submitted";
	if (cell.registered) return deadlineIsPast ? "dns" : "registered";
	return "empty";
}

function publicState(cell: ProgressionCellInput, deadlineIsPast: boolean): PublicCellState {
	if (cell.disqualified) return "dsq";
	if (cell.processed) return "final";
	if (cell.registered && !cell.submitted && deadlineIsPast) return "dns";
	return "empty";
}

/**
 * Build the full progression matrix. `mode` only changes which cell states
 * are exposed: the OC sees the whole lifecycle, the public site sees only
 * final results, DNS and DSQ. Ranks and buckets are identical in both.
 */
export function buildProgressionMatrix(
	input: ProgressionInput,
	mode: "oc" | "public",
): ProgressionMatrix {
	const rows: ProgressionRow[] = input.athletes.map((athlete) => {
		const cells: Record<string, ProgressionCellOut> = {};
		let races = 0;
		let bestTimeSeconds: number | null = null;
		let bestTime: string | null = null;
		const bucketAcc = new Map<string, { level: string; gender: "Men" | "Women"; points: number; races: number }>();
		for (const event of input.events) {
			const cell = athlete.cells[String(event.event_id)] ?? {
				registered: false, submitted: false, approved: false,
				disqualified: false, processed: false, time: null,
				time_seconds: null, level: null, level_place: null,
				points: null, gender: null,
			};
			const past = deadlinePassed(event.deadline, input.now);
			const state = mode === "oc" ? ocState(cell, past) : publicState(cell, past);
			const isFinal = state === "final" && !cell.disqualified;
			cells[String(event.event_id)] = {
				state,
				time: isFinal ? cell.time : null,
				level: isFinal ? cell.level : null,
				level_place: isFinal ? cell.level_place : null,
				points: isFinal ? cell.points : null,
			};
			if (isFinal) {
				races += 1;
				if (cell.time_seconds !== null && (bestTimeSeconds === null || cell.time_seconds < bestTimeSeconds)) {
					bestTimeSeconds = cell.time_seconds;
					bestTime = cell.time;
				}
				const gender = normGender(cell.gender ?? athlete.gender);
				if (cell.level && gender && cell.points !== null) {
					const key = `${cell.level}|${gender}`;
					const acc = bucketAcc.get(key) ?? { level: cell.level, gender, points: 0, races: 0 };
					acc.points += cell.points;
					acc.races += 1;
					bucketAcc.set(key, acc);
				}
			}
		}
		return {
			name: athlete.name,
			gender: athlete.gender,
			cells,
			races,
			best_time: bestTime,
			best_time_seconds: bestTimeSeconds,
			buckets: [...bucketAcc.values()].map((b) => ({ ...b, rank: 0 })),
		};
	});

	// Per-bucket standings: points desc, tie-break best time asc. Levels are
	// never mixed: each (level, gender) bucket ranks on its own.
	const bucketEntries = new Map<string, { level: string; gender: "Men" | "Women"; rows: ProgressionRow[] }>();
	for (const row of rows) {
		for (const bucket of row.buckets) {
			const key = `${bucket.level}|${bucket.gender}`;
			let entry = bucketEntries.get(key);
			if (!entry) {
				entry = { level: bucket.level, gender: bucket.gender, rows: [] };
				bucketEntries.set(key, entry);
			}
			entry.rows.push(row);
		}
	}
	const levelOrder = ["Elite", "High Performance", "Performance", "Competitive", "Open"];
	const buckets: BucketStanding[] = [];
	for (const entry of bucketEntries.values()) {
		const sorted = [...entry.rows].sort((a, b) => {
			const pa = a.buckets.find((x) => x.level === entry.level && x.gender === entry.gender)!;
			const pb = b.buckets.find((x) => x.level === entry.level && x.gender === entry.gender)!;
			if (pb.points !== pa.points) return pb.points - pa.points;
			const ta = a.best_time_seconds ?? Number.MAX_SAFE_INTEGER;
			const tb = b.best_time_seconds ?? Number.MAX_SAFE_INTEGER;
			return ta - tb;
		});
		const entries: BucketStandingEntry[] = sorted.map((row, index) => {
			const bucket = row.buckets.find((x) => x.level === entry.level && x.gender === entry.gender)!;
			bucket.rank = index + 1;
			return {
				name: row.name,
				points: bucket.points,
				races: bucket.races,
				best_time: row.best_time,
				rank: index + 1,
			};
		});
		buckets.push({ level: entry.level, gender: entry.gender, entries });
	}
	buckets.sort((a, b) => {
		const la = levelOrder.indexOf(a.level);
		const lb = levelOrder.indexOf(b.level);
		if (la !== lb) return (la === -1 ? 99 : la) - (lb === -1 ? 99 : lb);
		return a.gender === b.gender ? 0 : a.gender === "Men" ? -1 : 1;
	});

	return { distance: input.distance, events: input.events, rows, buckets };
}

/** Human label for an OC cell state. */
export function ocCellLabel(state: OcCellState): string {
	switch (state) {
		case "empty": return "—";
		case "registered": return "Registered";
		case "submitted": return "Submitted";
		case "approved": return "Approved · Processing";
		case "exception": return "Exception";
		case "dns": return "DNS";
		case "dsq": return "DSQ";
		case "final": return "Final";
	}
}

/** Human label for a public cell state. */
export function publicCellLabel(state: PublicCellState): string {
	switch (state) {
		case "empty": return "—";
		case "dns": return "DNS";
		case "dsq": return "DSQ";
		case "final": return "Final";
	}
}
