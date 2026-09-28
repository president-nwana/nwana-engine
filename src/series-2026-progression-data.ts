// Series 2026 progression data assembly (engine side, ADR-0043).
//
// Reads production data (D1 + live RunSignup results) and feeds the ONE
// shared pure progression model (series-2026-progression.ts). The public
// site assembles its own D1-only input and calls the same pure builder.

import {
	ProgressionAthleteInput,
	ProgressionCellInput,
	ProgressionEvent,
	ProgressionInput,
	ProgressionMatrix,
	buildProgressionMatrix,
} from "./series-2026-progression";
import { fetchLiveEventResults } from "./series-2026-auto-process";
import { SERIES_2026_SOURCES } from "./series-2026-results";

export interface ProgressionQuery {
	distance: string;
	search?: string;
	page?: number;
	perPage?: number;
	from?: string;
	to?: string;
}

export interface ProgressionResponse {
	ok: boolean;
	distance: string;
	events: ProgressionEvent[];
	rows: ProgressionMatrix["rows"];
	buckets: ProgressionMatrix["buckets"];
	pagination: { page: number; per_page: number; total: number; total_pages: number };
	generated_at: string;
}

function normName(value: string | null | undefined): string {
	return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function displayName(value: string | null | undefined): string {
	return (value ?? "").trim().replace(/\s+/g, " ");
}

export function parseTimeToSeconds(value: string | null | undefined): number | null {
	if (!value) return null;
	const parts = value.trim().split(":").map((p) => Number(p));
	if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
	let seconds = 0;
	for (const part of parts) seconds = seconds * 60 + part;
	return parts.length >= 2 ? seconds : null;
}

interface SnapshotRow {
	result_id: string | null;
	athlete: string | null;
	gender: string | null;
	time: string | null;
	performance_level: string | null;
	level_place: string | number | null;
}

export async function getDistanceProgression(
	db: D1Database,
	accessToken: string,
	query: ProgressionQuery,
): Promise<ProgressionResponse> {
	const source = SERIES_2026_SOURCES.find((s) => s.distance === query.distance);
	if (!source) throw new Error(`Unknown Series 2026 distance: ${query.distance}`);

	const lifecycle = await db
		.prepare(`SELECT events_json FROM race_lifecycle WHERE series = 'SERIES_2026' AND distance = ?`)
		.bind(query.distance)
		.first<{ events_json: string | null }>();
	const rawEvents = lifecycle?.events_json ? JSON.parse(lifecycle.events_json) as Array<{ event_id: number; event_name: string | null; event_date: string | null }> : [];
	let events: ProgressionEvent[] = rawEvents
		.map((e) => ({ event_id: e.event_id, event_name: e.event_name, event_date: e.event_date, deadline: null as string | null }))
		.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
	if (query.from) events = events.filter((e) => (e.event_date ?? "") >= query.from!);
	if (query.to) events = events.filter((e) => (e.event_date ?? "") <= query.to!);
	const eventIds = events.map((e) => e.event_id);

	if (eventIds.length > 0) {
		const placeholders = eventIds.map(() => "?").join(",");
		const deadlines = await db
			.prepare(
				`SELECT event_id AS eventId, submission_deadline AS deadline
				 FROM series_event_deadlines
				 WHERE series = 'SERIES_2026' AND distance = ? AND event_id IN (${placeholders})`,
			)
			.bind(query.distance, ...eventIds)
			.all<{ eventId: number; deadline: string | null }>();
		const deadlineByEvent = new Map<number, string | null>();
		for (const row of deadlines.results ?? []) deadlineByEvent.set(row.eventId, row.deadline);
		events = events.map((e) => ({ ...e, deadline: deadlineByEvent.get(e.event_id) ?? null }));
	}

	// Active registrations per event.
	const registrationsByEvent = new Map<number, Map<string, string>>();
	if (eventIds.length > 0) {
		const placeholders = eventIds.map(() => "?").join(",");
		const regs = await db
			.prepare(
				`SELECT event_id AS eventId, first_name AS firstName, last_name AS lastName
				 FROM series_registrations
				 WHERE race_id = ? AND event_id IN (${placeholders})
				   AND lower(status) = 'active'`,
			)
			.bind(source.raceId, ...eventIds)
			.all<{ eventId: number; firstName: string | null; lastName: string | null }>();
		for (const reg of regs.results ?? []) {
			const key = normName(`${reg.firstName ?? ""} ${reg.lastName ?? ""}`.trim());
			if (!key) continue;
			let byAthlete = registrationsByEvent.get(reg.eventId);
			if (!byAthlete) { byAthlete = new Map(); registrationsByEvent.set(reg.eventId, byAthlete); }
			if (!byAthlete.has(key)) byAthlete.set(key, displayName(`${reg.firstName ?? ""} ${reg.lastName ?? ""}`.trim()));
		}
	}

	// Finalized snapshots (processed results).
	const snapshotsByEvent = new Map<number, SnapshotRow[]>();
	if (eventIds.length > 0) {
		const placeholders = eventIds.map(() => "?").join(",");
		const snaps = await db
			.prepare(
				`SELECT event_id AS eventId, results_json AS resultsJson
				 FROM race_event_results
				 WHERE series = 'SERIES_2026' AND distance = ? AND event_id IN (${placeholders})`,
			)
			.bind(query.distance, ...eventIds)
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

	// Owner decisions per event.
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
			.bind(query.distance, ...eventIds)
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
			.bind(query.distance, ...eventIds)
			.all<{ eventId: number; resultId: string }>();
		for (const row of dsqs.results ?? []) {
			let set = dsqByEvent.get(row.eventId);
			if (!set) { set = new Set(); dsqByEvent.set(row.eventId, set); }
			set.add(String(row.resultId));
		}
	}

	// Live results per event (submitted / approved states for the OC).
	const liveByEvent = new Map<number, Array<{ result_id: string; athlete: string; time: string | null; gender: string | null }>>();
	for (const event of events) {
		try {
			const live = await fetchLiveEventResults(accessToken, source.raceId, event.event_id);
			liveByEvent.set(event.event_id, live.map((r) => ({
				result_id: r.result_id,
				athlete: r.athlete,
				time: r.time,
				gender: r.gender,
			})));
		} catch {
			liveByEvent.set(event.event_id, []);
		}
	}

	// Assemble athletes: union of registered names and result athletes.
	interface AssemblyCell extends ProgressionCellInput { resultId?: string | null }
	const athletes = new Map<string, { name: string; gender: string | null; cells: Record<string, AssemblyCell> }>();
	const ensureAthlete = (key: string, name: string): { name: string; gender: string | null; cells: Record<string, AssemblyCell> } => {
		let athlete = athletes.get(key);
		if (!athlete) {
			athlete = { name, gender: null, cells: {} };
			athletes.set(key, athlete);
		}
		return athlete;
	};
	const ensureCell = (athlete: { cells: Record<string, AssemblyCell> }, eventId: number): AssemblyCell => {
		const key = String(eventId);
		let cell = athlete.cells[key];
		if (!cell) {
			cell = {
				registered: false, submitted: false, approved: false,
				disqualified: false, processed: false, time: null,
				time_seconds: null, level: null, level_place: null,
				points: null, gender: null,
			};
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
		const snapshots = snapshotsByEvent.get(event.event_id) ?? [];
		for (const row of snapshots) {
			const key = normName(row.athlete);
			if (!key) continue;
			const athlete = ensureAthlete(key, displayName(row.athlete));
			const cell = ensureCell(athlete, event.event_id);
			const levelPlace = row.level_place !== null && row.level_place !== undefined ? Number(row.level_place) : null;
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
			cell.resultId = row.result_id;
		}
		const live = liveByEvent.get(event.event_id) ?? [];
		for (const row of live) {
			const key = normName(row.athlete);
			if (!key) continue;
			const athlete = ensureAthlete(key, displayName(row.athlete));
			const cell = ensureCell(athlete, event.event_id);
			cell.submitted = true;
			if (!cell.processed) {
				cell.time = row.time;
				cell.time_seconds = parseTimeToSeconds(row.time);
				cell.gender = row.gender;
			}
			if (!athlete.gender && row.gender) athlete.gender = row.gender;
			cell.resultId = row.result_id;
			if ((approvalsByEvent.get(event.event_id)?.has(row.result_id)) ?? false) cell.approved = true;
			if ((dsqByEvent.get(event.event_id)?.has(row.result_id)) ?? false) cell.disqualified = true;
		}
		// Approvals / disqualifications keyed by snapshot result ids (for
		// processed events the live fetch may lag the snapshot).
		for (const row of snapshots) {
			if (!row.result_id) continue;
			const key = normName(row.athlete);
			const athlete = athletes.get(key);
			if (!athlete) continue;
			const cell = ensureCell(athlete, event.event_id);
			if ((approvalsByEvent.get(event.event_id)?.has(String(row.result_id))) ?? false) cell.approved = true;
			if ((dsqByEvent.get(event.event_id)?.has(String(row.result_id))) ?? false) cell.disqualified = true;
		}
	}

	const athleteInputs: ProgressionAthleteInput[] = [...athletes.values()].map((a) => {
		const cells: Record<string, ProgressionCellInput> = {};
		for (const [key, cell] of Object.entries(a.cells)) {
			const { resultId: _rid, ...rest } = cell;
			cells[key] = rest;
		}
		return { name: a.name, gender: a.gender, cells };
	});

	const input: ProgressionInput = {
		distance: query.distance,
		events,
		athletes: athleteInputs,
		now: Date.now(),
	};
	const matrix = buildProgressionMatrix(input, "oc");

	// Search + pagination over rows; buckets stay global.
	const search = (query.search ?? "").trim().toLowerCase();
	const filtered = search
		? matrix.rows.filter((r) => r.name.toLowerCase().includes(search))
		: matrix.rows;
	filtered.sort((a, b) => a.name.localeCompare(b.name));
	const perPage = Math.min(Math.max(query.perPage ?? 50, 10), 200);
	const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
	const page = Math.min(Math.max(query.page ?? 1, 1), totalPages);
	const rows = filtered.slice((page - 1) * perPage, page * perPage);

	return {
		ok: true,
		distance: query.distance,
		events: matrix.events,
		rows,
		buckets: matrix.buckets,
		pagination: { page, per_page: perPage, total: filtered.length, total_pages: totalPages },
		generated_at: new Date().toISOString(),
	};
}
