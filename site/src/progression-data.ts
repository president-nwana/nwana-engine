// Public-site assembly for the Series 2026 progression matrix (ADR-0043).
//
// D1-only: no live RunSignup calls. Feeds the ONE shared pure progression
// model (../../src/series-2026-progression.ts) with mode "public", so the
// public matrix uses exactly the same computation as the Operating Center.
// The public never sees Submitted / Approved / Processing / Exception:
// only final results, DNS and DSQ.

import {
	buildProgressionMatrix,
	type ProgressionAthleteInput,
	type ProgressionCellInput,
	type ProgressionEvent,
	type ProgressionMatrix,
} from "../../src/series-2026-progression";

export interface PublicProgressionQuery {
	search?: string;
	page?: number;
	perPage?: number;
}

export interface PublicProgressionResult {
	distance: string;
	events: ProgressionEvent[];
	/** Page of athlete rows (search-filtered, name-sorted). */
	rows: ProgressionMatrix["rows"];
	/** Global per-bucket standings (Level + Gender), computed over ALL athletes. */
	buckets: ProgressionMatrix["buckets"];
	pagination: { page: number; per_page: number; total: number; total_pages: number };
}

function normName(value: string | null | undefined): string {
	return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function displayName(value: string | null | undefined): string {
	return (value ?? "").trim().replace(/\s+/g, " ");
}

function parseTimeToSeconds(value: string | null | undefined): number | null {
	if (!value) return null;
	const parts = value.trim().split(":").map(Number);
	if (parts.length < 2 || parts.some((p) => Number.isNaN(p) || p < 0)) return null;
	let seconds = 0;
	for (const part of parts) seconds = seconds * 60 + part;
	return seconds;
}

interface SnapshotRow {
	result_id: string | number | null;
	athlete: string | null;
	gender: string | null;
	time: string | null;
	performance_level: string | null;
	level_place: string | number | null;
}

function emptyCell(): ProgressionCellInput {
	return {
		registered: false, submitted: false, approved: false,
		disqualified: false, processed: false, time: null,
		time_seconds: null, level: null, level_place: null,
		points: null, gender: null,
	};
}

export async function getPublicProgression(
	db: D1Database,
	distance: string,
	query: PublicProgressionQuery,
): Promise<PublicProgressionResult | null> {
	const lifecycle = await db
		.prepare(`SELECT race_id AS raceId, events_json AS eventsJson FROM race_lifecycle WHERE series = 'SERIES_2026' AND distance = ?`)
		.bind(distance)
		.first<{ raceId: number; eventsJson: string | null }>();
	if (!lifecycle) return null;

	let events: ProgressionEvent[] = [];
	try {
		const raw = lifecycle.eventsJson
			? (JSON.parse(lifecycle.eventsJson) as Array<{ event_id: number; event_name: string | null; event_date: string | null }>)
			: [];
		events = raw
			.map((e) => ({ event_id: e.event_id, event_name: e.event_name, event_date: e.event_date, deadline: null as string | null }))
			.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
	} catch {
		events = [];
	}
	const eventIds = events.map((e) => e.event_id);

	if (eventIds.length > 0) {
		const placeholders = eventIds.map(() => "?").join(",");
		const deadlines = await db
			.prepare(
				`SELECT event_id AS eventId, submission_deadline AS deadline
				 FROM series_event_deadlines
				 WHERE series = 'SERIES_2026' AND distance = ? AND event_id IN (${placeholders})`,
			)
			.bind(distance, ...eventIds)
			.all<{ eventId: number; deadline: string | null }>();
		const byEvent = new Map<number, string | null>();
		for (const row of deadlines.results ?? []) byEvent.set(row.eventId, row.deadline);
		events = events.map((e) => ({ ...e, deadline: byEvent.get(e.event_id) ?? null }));
	}

	// Active registrations per event: athlete identity is the normalized name.
	const registrationsByEvent = new Map<number, Map<string, string>>();
	{
		const regs = await db
			.prepare(
				`SELECT event_id AS eventId, first_name AS firstName, last_name AS lastName
				 FROM series_registrations
				 WHERE race_id = ? AND lower(status) = 'active'`,
			)
			.bind(lifecycle.raceId)
			.all<{ eventId: number; firstName: string | null; lastName: string | null }>();
		for (const reg of regs.results ?? []) {
			const key = normName(`${reg.firstName ?? ""} ${reg.lastName ?? ""}`.trim());
			if (!key) continue;
			let byAthlete = registrationsByEvent.get(reg.eventId);
			if (!byAthlete) { byAthlete = new Map(); registrationsByEvent.set(reg.eventId, byAthlete); }
			if (!byAthlete.has(key)) byAthlete.set(key, displayName(`${reg.firstName ?? ""} ${reg.lastName ?? ""}`.trim()));
		}
	}

	// Finalized result snapshots.
	const snapshotsByEvent = new Map<number, SnapshotRow[]>();
	if (eventIds.length > 0) {
		const placeholders = eventIds.map(() => "?").join(",");
		const snaps = await db
			.prepare(
				`SELECT event_id AS eventId, results_json AS resultsJson
				 FROM race_event_results
				 WHERE series = 'SERIES_2026' AND distance = ? AND event_id IN (${placeholders})`,
			)
			.bind(distance, ...eventIds)
			.all<{ eventId: number; resultsJson: string }>();
		for (const snap of snaps.results ?? []) {
			try {
				const rows = JSON.parse(snap.resultsJson) as SnapshotRow[];
				snapshotsByEvent.set(snap.eventId, Array.isArray(rows) ? rows : []);
			} catch {
				snapshotsByEvent.set(snap.eventId, []);
			}
		}
	}

	// Owner decisions per event, keyed by result_id.
	const approvalsByEvent = new Map<number, Set<string>>();
	const dsqByEvent = new Map<number, Set<string>>();
	if (eventIds.length > 0) {
		const placeholders = eventIds.map(() => "?").join(",");
		const approvals = await db
			.prepare(
				`SELECT event_id AS eventId, result_id AS resultId
				 FROM series_result_approvals
				 WHERE series = 'SERIES_2026' AND distance = ? AND event_id IN (${placeholders})`,
			)
			.bind(distance, ...eventIds)
			.all<{ eventId: number; resultId: string }>();
		for (const row of approvals.results ?? []) {
			let set = approvalsByEvent.get(row.eventId);
			if (!set) { set = new Set(); approvalsByEvent.set(row.eventId, set); }
			set.add(String(row.resultId));
		}
		const dsqs = await db
			.prepare(
				`SELECT event_id AS eventId, result_id AS resultId
				 FROM series_result_disqualifications
				 WHERE series = 'SERIES_2026' AND distance = ? AND event_id IN (${placeholders})`,
			)
			.bind(distance, ...eventIds)
			.all<{ eventId: number; resultId: string }>();
		for (const row of dsqs.results ?? []) {
			let set = dsqByEvent.get(row.eventId);
			if (!set) { set = new Set(); dsqByEvent.set(row.eventId, set); }
			set.add(String(row.resultId));
		}
	}

	const athletes = new Map<string, { name: string; gender: string | null; cells: Record<string, ProgressionCellInput> }>();
	const ensureAthlete = (key: string, name: string) => {
		let athlete = athletes.get(key);
		if (!athlete) {
			athlete = { name, gender: null, cells: {} };
			athletes.set(key, athlete);
		}
		return athlete;
	};
	const ensureCell = (athlete: { cells: Record<string, ProgressionCellInput> }, eventId: number): ProgressionCellInput => {
		const key = String(eventId);
		let cell = athlete.cells[key];
		if (!cell) {
			cell = emptyCell();
			athlete.cells[key] = cell;
		}
		return cell;
	};

	for (const event of events) {
		const regs = registrationsByEvent.get(event.event_id);
		if (regs) {
			for (const [key, name] of regs) {
				const athlete = ensureAthlete(key, name);
				ensureCell(athlete, event.event_id).registered = true;
			}
		}
		const rows = snapshotsByEvent.get(event.event_id) ?? [];
		const seenResultIds = new Set<string>();
		for (const row of rows) {
			const resultId = String(row.result_id ?? "");
			if (resultId && seenResultIds.has(resultId)) continue;
			if (resultId) seenResultIds.add(resultId);
			const key = normName(row.athlete);
			if (!key) continue;
			const athlete = ensureAthlete(key, displayName(row.athlete));
			const cell = ensureCell(athlete, event.event_id);
			const levelPlace = row.level_place !== null && row.level_place !== undefined && row.level_place !== ""
				? Number(row.level_place)
				: null;
			const processed = !!row.performance_level && levelPlace !== null && Number.isFinite(levelPlace);
			cell.submitted = true;
			if (processed) {
				cell.processed = true;
				cell.time = row.time;
				cell.time_seconds = parseTimeToSeconds(row.time);
				cell.level = row.performance_level;
				cell.level_place = levelPlace;
				cell.points = 1001 - (levelPlace as number);
				cell.gender = row.gender;
				if (!athlete.gender && row.gender) athlete.gender = row.gender;
			}
			if (resultId) {
				if (approvalsByEvent.get(event.event_id)?.has(resultId)) cell.approved = true;
				if (dsqByEvent.get(event.event_id)?.has(resultId)) cell.disqualified = true;
			}
		}
	}

	const athleteInputs: ProgressionAthleteInput[] = [...athletes.values()].map((a) => ({
		name: a.name,
		gender: a.gender,
		cells: a.cells,
	}));

	const matrix = buildProgressionMatrix(
		{ distance, events, athletes: athleteInputs, now: Date.now() },
		"public",
	);

	// Search + pagination over rows; buckets always stay global.
	const search = (query.search ?? "").trim().toLowerCase();
	const filtered = search
		? matrix.rows.filter((r) => r.name.toLowerCase().includes(search))
		: matrix.rows;
	filtered.sort((a, b) => a.name.localeCompare(b.name));
	const perPage = Math.min(Math.max(query.perPage ?? 50, 10), 200);
	const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
	const page = Math.min(Math.max(query.page ?? 1, 1), totalPages);

	return {
		distance,
		events: matrix.events,
		rows: filtered.slice((page - 1) * perPage, page * perPage),
		buckets: matrix.buckets,
		pagination: { page, per_page: perPage, total: filtered.length, total_pages: totalPages },
	};
}
