// Series 2026 registration / participant data layer.
//
// Separate from race_event_results. Definitions (never mix):
//   registration            = one RunSignup registration record (race_id + registration_id)
//   registered participant  = one distinct RunSignup user (user_id) with >= 1 active registration
//   athlete with results    = distinct athlete name in finalized race_event_results
//   verified finish         = one finalized result record in race_event_results
//
// Source: RunSignup "Get Race Participants"
//   GET https://api.runsignup.com/rest/race/:race_id/participants
// Free API (Apache free-use license). OAuth2 Bearer auth (race director grant).
// This module is read-only against RunSignup and never touches race_event_results.

import { SERIES_2026_SOURCES } from "./series-2026-results";

export interface RunSignupParticipantFetchOptions {
	accessToken: string;
	apiCallerToken?: string;
	apiCallerSecret?: string;
	perPage?: number;
	maxPages?: number;
}

export interface FetchedParticipant {
	raceId: number;
	raceName: string | null;
	eventId: number;
	eventName: string | null;
	registrationId: number;
	userId: number | null;
	firstName: string | null;
	lastName: string | null;
	status: string | null;
	registrationDate: string | null;
	lastModified: string | null;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as UnknownRecord;
	}
	return null;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function int(value: unknown): number | null {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isInteger(n) ? n : null;
}

function participantName(p: UnknownRecord): { first: string | null; last: string | null } {
	const user = asRecord(p.user);
	return {
		first: text(user?.first_name) ?? text(p.first_name),
		last: text(user?.last_name) ?? text(p.last_name),
	};
}

/** Parse one participant record from the Get Race Participants response. */
export function parseParticipant(
	raw: unknown,
	raceId: number,
	raceName: string | null,
): FetchedParticipant | null {
	const p = asRecord(raw);
	if (!p) return null;
	const registrationId = int(p.registration_id);
	const eventId = int(p.event_id);
	if (registrationId === null || eventId === null) return null;
	const user = asRecord(p.user);
	const { first, last } = participantName(p);
	return {
		raceId,
		raceName,
		eventId,
		eventName: text(p.event_name),
		registrationId,
		userId: int(user?.user_id) ?? int(p.user_id),
		firstName: first,
		lastName: last,
		status: text(p.status),
		registrationDate: text(p.registration_date),
		lastModified: text(p.last_modified),
	};
}

function prepareRequest(
	url: URL,
	options: RunSignupParticipantFetchOptions,
): HeadersInit {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${options.accessToken}`,
	};
	if (options.apiCallerToken && options.apiCallerSecret) {
		url.searchParams.set("rsu_api_reg", options.apiCallerToken);
		headers["X-RSU-API-REG-SECRET"] = options.apiCallerSecret;
	}
	return headers;
}

/**
 * Fetch all participant records for one race, following pagination.
 * Returns the raw race name seen in the response for labeling.
 */
export async function fetchRaceParticipants(
	raceId: number,
	options: RunSignupParticipantFetchOptions,
): Promise<{ raceName: string | null; participants: FetchedParticipant[] }> {
	const perPage = Math.min(Math.max(options.perPage ?? 1000, 1), 1000);
	const maxPages = Math.min(Math.max(options.maxPages ?? 50, 1), 200);
	const participants: FetchedParticipant[] = [];
	let raceName: string | null = null;

	for (let page = 1; page <= maxPages; page += 1) {
		const url = new URL(`https://api.runsignup.com/rest/race/${raceId}/participants`);
		url.searchParams.set("format", "json");
		url.searchParams.set("page", String(page));
		url.searchParams.set("results_per_page", String(perPage));
		const response = await fetch(url.toString(), {
			headers: prepareRequest(url, options),
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(
				`RunSignup participants request failed: ${response.status} ${response.statusText} for race ${raceId} :: ${body.slice(0, 500)}`,
			);
		}
		const data = (await response.json()) as UnknownRecord;
		const list = Array.isArray(data.participants) ? data.participants : [];
		if (raceName === null) {
			const race = asRecord(data.race);
			raceName = text(race?.name);
		}
		for (const raw of list) {
			const parsed = parseParticipant(raw, raceId, raceName);
			if (parsed) participants.push(parsed);
		}
		if (list.length < perPage) break;
	}
	return { raceName, participants };
}

export interface RegistrationSyncResult {
	distance: string;
	raceId: number;
	raceName: string | null;
	registrationsFetched: number;
	registrationsStored: number;
	error: string | null;
}

export interface RegistrationSyncSummary {
	ok: boolean;
	startedAt: string;
	finishedAt: string;
	races: RegistrationSyncResult[];
	totalFetched: number;
	totalStored: number;
}

/**
 * Sync registrations for every Series 2026 source race into series_registrations.
 * Upserts on (race_id, registration_id). Writes a sync log row per race.
 * Never reads or writes race_event_results.
 */
export async function syncSeries2026Registrations(
	db: D1Database,
	options: RunSignupParticipantFetchOptions,
): Promise<RegistrationSyncSummary> {
	const startedAt = new Date().toISOString();
	const races: RegistrationSyncResult[] = [];
	let totalFetched = 0;
	let totalStored = 0;

	for (const source of SERIES_2026_SOURCES) {
		const logId = await db
			.prepare(
				`INSERT INTO series_registration_sync_log (race_id, distance_label, status)
				 VALUES (?, ?, 'started')`,
			)
			.bind(source.raceId, source.distance)
			.run()
			.then((r) => Number(r.meta.last_row_id))
			.catch(() => null);

		try {
			const { raceName, participants } = await fetchRaceParticipants(source.raceId, options);
			totalFetched += participants.length;
			let stored = 0;
			for (const p of participants) {
				const result = await db
					.prepare(
						`INSERT INTO series_registrations
							(race_id, race_name, event_id, event_name, distance_label,
							 registration_id, user_id, first_name, last_name,
							 status, registration_date, last_modified, synced_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
						 ON CONFLICT (race_id, registration_id) DO UPDATE SET
							race_name = excluded.race_name,
							event_id = excluded.event_id,
							event_name = excluded.event_name,
							user_id = excluded.user_id,
							first_name = excluded.first_name,
							last_name = excluded.last_name,
							status = excluded.status,
							registration_date = excluded.registration_date,
							last_modified = excluded.last_modified,
							synced_at = excluded.synced_at`,
					)
					.bind(
						p.raceId,
						p.raceName,
						p.eventId,
						p.eventName,
						source.distance,
						p.registrationId,
						p.userId,
						p.firstName,
						p.lastName,
						p.status,
						p.registrationDate,
						p.lastModified,
						new Date().toISOString(),
					)
					.run();
				if (result.success) stored += 1;
			}
			totalStored += stored;
			if (logId !== null) {
				await db
					.prepare(
						`UPDATE series_registration_sync_log
						 SET finished_at = ?, status = 'ok', registrations_fetched = ?
						 WHERE id = ?`,
					)
					.bind(new Date().toISOString(), participants.length, logId)
					.run();
			}
			races.push({
				distance: source.distance,
				raceId: source.raceId,
				raceName,
				registrationsFetched: participants.length,
				registrationsStored: stored,
				error: null,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown sync error";
			if (logId !== null) {
				await db
					.prepare(
						`UPDATE series_registration_sync_log
						 SET finished_at = ?, status = 'error', error = ?
						 WHERE id = ?`,
					)
					.bind(new Date().toISOString(), message.slice(0, 2000), logId)
					.run()
					.catch(() => undefined);
			}
			races.push({
				distance: source.distance,
				raceId: source.raceId,
				raceName: null,
				registrationsFetched: 0,
				registrationsStored: 0,
				error: message,
			});
		}
	}

	return {
		ok: races.every((r) => r.error === null),
		startedAt,
		finishedAt: new Date().toISOString(),
		races,
		totalFetched,
		totalStored,
	};
}

export interface RegistrationBreakdownRow {
	raceId: number;
	distance: string;
	raceName: string | null;
	registrations: number;
	activeRegistrations: number;
	registeredParticipants: number;
}

export interface ParticipationOverview {
	computedAt: string;
	// --- registrations (from series_registrations; RunSignup "Get Race Participants") ---
	registrations: RegistrationTotals;
	// --- results (from race_event_results; finalized only) ---
	uniqueAthletesWithResults: number;
	verifiedFinishes: number;
	finalizedEventRows: number;
}

/**
 * Combined participation view: four metrics that must never be mixed.
 * Registrations come from series_registrations; results come from
 * race_event_results. The two tables are never joined.
 */
export async function getSeries2026ParticipationOverview(
	db: D1Database,
): Promise<ParticipationOverview> {
	const registrations = await getSeries2026RegistrationTotals(db);
	const rows = await db
		.prepare(`SELECT results_json FROM race_event_results WHERE finalized = 1`)
		.all<{ results_json: string | null }>();
	const athletes = new Set<string>();
	let finishes = 0;
	for (const row of rows.results) {
		let parsed: unknown = null;
		try {
			parsed = JSON.parse(row.results_json ?? "[]");
		} catch {
			parsed = [];
		}
		if (!Array.isArray(parsed)) continue;
		for (const r of parsed) {
			const rec = asRecord(r);
			if (!rec) continue;
			finishes += 1;
			const athlete = text(rec.athlete);
			if (athlete) athletes.add(athlete.toLowerCase());
		}
	}
	return {
		computedAt: new Date().toISOString(),
		registrations,
		uniqueAthletesWithResults: athletes.size,
		verifiedFinishes: finishes,
		finalizedEventRows: rows.results.length,
	};
}

export interface RegistrationTotals {
	computedAt: string;
	// Registrations: raw RunSignup registration records.
	totalRegistrations: number;
	activeRegistrations: number;
	// Registered participants: distinct RunSignup users with >= 1 active registration.
	uniqueRegisteredParticipants: number;
	byRace: RegistrationBreakdownRow[];
	byDistance: Array<{
		distance: string;
		registrations: number;
		activeRegistrations: number;
		registeredParticipants: number;
	}>;
	bySeries: Array<{
		series: string;
		registrations: number;
		activeRegistrations: number;
		registeredParticipants: number;
	}>;
	lastSyncAt: string | null;
}

interface CountRow {
	n: number;
}

/**
 * Compute registration / participant totals from series_registrations.
 * "Active" = status IS NULL or status not in the removed set
 * (RunSignup removed-participant reasons: cleared, removed, transferred, deferred).
 */
export async function getSeries2026RegistrationTotals(
	db: D1Database,
): Promise<RegistrationTotals> {
	const computedAt = new Date().toISOString();
	const removed = `status IN ('cleared','removed','transferred','deferred','deleted','refunded')`;

	const total = await db
		.prepare(`SELECT COUNT(*) AS n FROM series_registrations`)
		.first<CountRow>();
	const active = await db
		.prepare(`SELECT COUNT(*) AS n FROM series_registrations WHERE NOT (${removed})`)
		.first<CountRow>();
	const uniqueParticipants = await db
		.prepare(
			`SELECT COUNT(DISTINCT user_id) AS n FROM series_registrations
			 WHERE user_id IS NOT NULL AND NOT (${removed})`,
		)
		.first<CountRow>();

	const byRaceRows = await db
		.prepare(
			`SELECT race_id AS raceId, distance_label AS distance,
				MAX(race_name) AS raceName,
				COUNT(*) AS registrations,
				SUM(CASE WHEN NOT (${removed}) THEN 1 ELSE 0 END) AS activeRegistrations,
				COUNT(DISTINCT CASE WHEN NOT (${removed}) THEN user_id END) AS registeredParticipants
			 FROM series_registrations
			 GROUP BY race_id, distance_label
			 ORDER BY race_id`,
		)
		.all<{
			raceId: number;
			distance: string;
			raceName: string | null;
			registrations: number;
			activeRegistrations: number;
			registeredParticipants: number;
		}>();

	const byDistance = byRaceRows.results.map((r) => ({
		distance: r.distance,
		registrations: r.registrations,
		activeRegistrations: r.activeRegistrations,
		registeredParticipants: r.registeredParticipants,
	}));

	const lastSync = await db
		.prepare(
			`SELECT MAX(finished_at) AS lastSyncAt FROM series_registration_sync_log
			 WHERE status = 'ok'`,
		)
		.first<{ lastSyncAt: string | null }>();

	return {
		computedAt,
		totalRegistrations: total?.n ?? 0,
		activeRegistrations: active?.n ?? 0,
		uniqueRegisteredParticipants: uniqueParticipants?.n ?? 0,
		byRace: byRaceRows.results,
		byDistance,
		bySeries: [
			{
				series: "SERIES_2026",
				registrations: total?.n ?? 0,
				activeRegistrations: active?.n ?? 0,
				registeredParticipants: uniqueParticipants?.n ?? 0,
			},
		],
		lastSyncAt: lastSync?.lastSyncAt ?? null,
	};
}
