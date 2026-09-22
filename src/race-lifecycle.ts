// NWANA Engine — Series 2026 race lifecycle (Phase 1).
//
// Closes the competition lifecycle loop around the live Series 2026:
// registration_open -> awaiting_results -> verifying (human) ->
// levels_computed -> published -> next_race_prep.
//
// Binding rules:
// - No periodic polling or cron. Sync runs only from an explicit owner action.
// - RunSignup write access is UNKNOWN until a live write test confirms it.
//   The levels pipeline therefore always prepares data in dry_run mode and
//   never claims a write it did not perform.
// - Publication and email Send always remain human-confirmed last miles.

import {
	SERIES_2026_SOURCES,
	getSeries2026LevelDefinitions,
	previewSeries2026ResultPublications,
	type Series2026Source,
} from "./series-2026-results";

export const RACE_LIFECYCLE_SERIES = "SERIES_2026";

export const RACE_LIFECYCLE_STAGES = [
	"registration_open",
	"awaiting_results",
	"verifying",
	"levels_computed",
	"published",
	"next_race_prep",
] as const;

export type RaceLifecycleStage = (typeof RACE_LIFECYCLE_STAGES)[number];

export type RunSignupWriteAccess = "UNKNOWN" | "CONFIRMED" | "DENIED";

export type PerformanceLevelName =
	| "Elite"
	| "High Performance"
	| "Performance"
	| "Competitive"
	| "Open";

// Per-distance Elite / High Performance / Performance / Competitive upper
// bounds in seconds, ported from NWANA-FINAL.ps1. A time must be strictly
// below a bound to enter that level; anything at or above the Competitive
// bound is Open.
const SERIES_2026_LEVEL_BOUNDS_SECONDS: Readonly<Record<string, readonly [number, number, number, number]>> = {
	"1K": [360, 390, 420, 450],
	"3K": [1200, 1260, 1320, 1380],
	"5K": [1980, 2100, 2220, 2400],
	"10K": [3900, 4200, 4500, 4800],
	"15K": [6000, 6600, 7200, 7800],
	"20K": [8400, 9000, 9600, 10200],
};

export function parseNwanaTime(value: string | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parts = trimmed.split(":");
	const numbers = parts.map(Number);
	if (numbers.some((part) => !Number.isFinite(part) || part < 0)) return null;
	if (parts.length === 2) return numbers[0] * 60 + numbers[1];
	if (parts.length === 3) return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
	return null;
}

export function classifySeries2026Level(
	distance: string,
	seconds: number,
): PerformanceLevelName {
	const bounds = SERIES_2026_LEVEL_BOUNDS_SECONDS[distance];
	if (!bounds) throw new Error(`Unknown Series 2026 distance: ${distance}`);
	if (seconds < bounds[0]) return "Elite";
	if (seconds < bounds[1]) return "High Performance";
	if (seconds < bounds[2]) return "Performance";
	if (seconds < bounds[3]) return "Competitive";
	return "Open";
}

export function series2026LevelDisplayName(
	distance: string,
	level: PerformanceLevelName,
): string {
	const definition = getSeries2026LevelDefinitions(distance).find(
		(entry) => entry.name === level,
	);
	if (!definition) throw new Error(`Unknown Series 2026 level: ${level}`);
	return `${definition.name} (${definition.threshold})`;
}

export interface LifecycleResultInput {
	result_id?: string | number | null;
	first_name?: string | null;
	last_name?: string | null;
	gender?: string | null;
	chip_time?: string | null;
	clock_time?: string | null;
}

export interface ComputedLifecycleResult {
	athlete: string;
	gender: string | null;
	time: string | null;
	time_seconds: number;
	level: PerformanceLevelName;
	level_display: string;
	level_place: number;
	points: number;
}

// Ports the NWANA-FINAL.ps1 classification: level by time thresholds, then
// Level Place ranked within Level + Gender, points 1000 / 999 / 998 / ...
export function computeSeries2026Levels(
	distance: string,
	results: readonly LifecycleResultInput[],
): ComputedLifecycleResult[] {
	const computed: ComputedLifecycleResult[] = results.map((result) => {
		const athlete = [result.first_name, result.last_name]
			.filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
			.join(" ");
		const time = result.chip_time ?? result.clock_time ?? null;
		const seconds = parseNwanaTime(time);
		if (seconds === null) {
			throw new Error(`Missing or invalid time for result: ${athlete || "unknown athlete"}`);
		}
		const level = classifySeries2026Level(distance, seconds);
		return {
			athlete,
			gender: result.gender ?? null,
			time,
			time_seconds: seconds,
			level,
			level_display: series2026LevelDisplayName(distance, level),
			level_place: 0,
			points: 0,
		};
	});

	const groups = new Map<string, ComputedLifecycleResult[]>();
	for (const row of computed) {
		const key = `${row.level}|${(row.gender ?? "").toUpperCase()}`;
		const group = groups.get(key);
		if (group) group.push(row);
		else groups.set(key, [row]);
	}

	for (const group of groups.values()) {
		group.sort((left, right) => left.time_seconds - right.time_seconds);
		group.forEach((row, index) => {
			row.level_place = index + 1;
			row.points = 1000 - index;
		});
	}

	return computed;
}

export interface LevelsWritePlanInput {
	distance: string;
	raceId: number;
	raceSeriesId: number;
	raceSeriesYearId: number;
	eventId: number;
	resultSetId: number;
	computed: readonly ComputedLifecycleResult[];
	writeAccess: RunSignupWriteAccess;
}

export interface LevelsWritePlan {
	write_mode: "dry_run";
	write_access: RunSignupWriteAccess;
	executed: boolean;
	report: string;
	steps: Array<{
		step: string;
		description: string;
		payload: unknown;
	}>;
}

// Builds the exact write payloads the NWANA-FINAL.ps1 pipeline would send
// (custom fields, scoring types, standings), but never executes them.
// executed is always false: there is no apply path until write access is
// verified and the owner approves it.
export function buildSeries2026LevelsWritePlan(
	input: LevelsWritePlanInput,
): LevelsWritePlan {
	const levels: PerformanceLevelName[] = [
		"Elite",
		"High Performance",
		"Performance",
		"Competitive",
		"Open",
	];
	const scoringTypeNames: string[] = [];
	for (const level of levels) {
		const label = series2026LevelDisplayName(input.distance, level);
		scoringTypeNames.push(`${level} Men (${label}; tie: best time)`);
		scoringTypeNames.push(`${level} Women (${label}; tie: best time)`);
	}

	const resultFieldWrites = input.computed.map((row) => ({
		athlete: row.athlete,
		"Performance Level": row.level_display,
		"Level Place": String(row.level_place),
		points: row.points,
	}));

	return {
		write_mode: "dry_run",
		write_access: input.writeAccess,
		executed: false,
		report:
			`DRY RUN: ${input.computed.length} result(s) classified for ` +
			`${input.distance} event ${input.eventId} (result set ${input.resultSetId}). ` +
			`RunSignup write access is ${input.writeAccess}; nothing was written.`,
		steps: [
			{
				step: "ensure_custom_fields",
				description:
					'Ensure "Performance Level" and "Level Place" string custom fields exist on the result set (created only if missing).',
				payload: {
					endpoint: `POST /rest/race/${input.raceId}/results/custom-fields`,
					params: {
						event_id: input.eventId,
						individual_result_set_id: input.resultSetId,
					},
					fields: ["Performance Level", "Level Place"],
				},
			},
			{
				step: "ensure_scoring_types",
				description:
					"Ensure per-level, per-gender non-standard scoring types exist for the race series (created only if missing).",
				payload: {
					endpoint: "POST /rest/v2/race-series/non-standard-scoring-types.json",
					params: {
						race_series_id: input.raceSeriesId,
						race_series_year_id: input.raceSeriesYearId,
					},
					scoring_type_names: scoringTypeNames,
				},
			},
			{
				step: "upload_standings",
				description:
					"Upload series points and positions per scoring type (requires live registration-to-participant mapping).",
				payload: {
					endpoint: "POST /rest/v2/race-series/race-series-results.json",
					note: "Points and Level Place are computed; participant IDs are resolved live at apply time.",
					standings: input.computed.map((row) => ({
						athlete: row.athlete,
						level: row.level_display,
						gender: row.gender,
						series_points: row.points,
						position: row.level_place,
					})),
				},
			},
			{
				step: "write_result_fields",
				description:
					'Write "Performance Level" and "Level Place" back onto each result row.',
				payload: {
					endpoint: `POST /rest/race/${input.raceId}/results/full-results`,
					params: {
						event_id: input.eventId,
						individual_result_set_id: input.resultSetId,
					},
					rows: resultFieldWrites,
				},
			},
		],
	};
}

export type EventCoreStage =
	| "registration_open"
	| "awaiting_results"
	| "verifying"
	| "levels_computed"
	| "published";

export interface EventStageInput {
	eventDate: string | null;
	nowDate: string;
	hasResults: boolean;
	finalized: boolean;
	publication: "PUBLISHED" | "BASELINE" | "PENDING";
}

// Pure stage derivation for one event. "verifying" is the human last mile:
// results exist in RunSignup but are not finalized, so Albert Fatikhov
// reviews them manually (GPX/Strava/Garmin, poles) before levels are applied.
export function deriveEventStage(input: EventStageInput): EventCoreStage {
	if (input.publication === "PUBLISHED" || input.publication === "BASELINE") {
		return "published";
	}
	if (input.finalized) return "levels_computed";
	if (input.hasResults) return "verifying";
	if (input.eventDate !== null && input.eventDate > input.nowDate) {
		return "registration_open";
	}
	return "awaiting_results";
}

export interface NextRacePrep {
	status: "DRAFT";
	announcement: {
		status: "DRAFT";
		channels: string[];
		text: string;
		image_url: null;
		send: "manual";
	};
	email: {
		status: "DRAFT";
		platform: "RunSignup/TicketSignup Email V2";
		dashboard_id: 513494;
		classification: "MARKETING";
		audience: string;
		subject: string;
		body: string;
		send: "manual in Email Marketing Dashboard";
	};
}

// Pre-race distribution preparation: announcement assets and email drafts.
// The final Send is always manual in the Email V2 dashboard; nothing here
// sends anything.
export function buildNextRacePrep(input: {
	distance: string;
	eventName: string | null;
	eventDate: string | null;
	registrationUrl: string | null;
}): NextRacePrep {
	const eventLabel = input.eventName ?? `NWANA Open ${input.distance} Series`;
	const dateLabel = input.eventDate ?? "date TBA";
	const registrationLine = input.registrationUrl
		? `Register: ${input.registrationUrl}`
		: "Registration link: see the Series 2026 hub at https://series.nwaofna.org/";
	return {
		status: "DRAFT",
		announcement: {
			status: "DRAFT",
			channels: [
				"Facebook NWANA",
				"Instagram nwana.official",
				"Facebook Nordic Walking Sport",
				"Instagram n_w_sport",
			],
			text: [
				`Next race: ${eventLabel} — ${dateLabel}.`,
				`Nordic Walking ${input.distance}, virtual format. Poles required; results verified via GPX/Strava/Garmin.`,
				registrationLine,
			].join("\n"),
			image_url: null,
			send: "manual",
		},
		email: {
			status: "DRAFT",
			platform: "RunSignup/TicketSignup Email V2",
			dashboard_id: 513494,
			classification: "MARKETING",
			audience:
				"Series 2026 past participants and current registrants (Email V2 dynamic lists; resolved live in the dashboard)",
			subject: `Next up: ${eventLabel} (${input.distance}) — ${dateLabel}`,
			body: [
				`Hello,`,
				``,
				`The next ${eventLabel} is coming on ${dateLabel}.`,
				``,
				`Distance: ${input.distance} — virtual format. Poles are required, and results are verified via GPX/Strava/Garmin before approval.`,
				``,
				registrationLine,
				``,
				`See you at the start.`,
			].join("\n"),
			send: "manual in Email Marketing Dashboard",
		},
	};
}

export interface LifecycleResultRow {
	result_id: string | null;
	athlete: string;
	gender: string | null;
	time: string | null;
	performance_level: string | null;
	level_place: string | null;
}

export interface LifecycleEventResults {
	event_id: number;
	event_name: string | null;
	event_date: string | null;
	finalized: boolean;
	publication_status: "PUBLISHED" | "BASELINE" | "PENDING";
	results_url: string | null;
	result_count: number;
	results: LifecycleResultRow[];
}

const RESULT_LEVEL_ORDER = [
	"Elite",
	"High Performance",
	"Performance",
	"Competitive",
	"Open",
] as const;

function resultLevelOrder(value: string | null): number {
	if (!value) return RESULT_LEVEL_ORDER.length;
	const index = RESULT_LEVEL_ORDER.findIndex((level) =>
		value.startsWith(level),
	);
	return index === -1 ? RESULT_LEVEL_ORDER.length : index;
}

// Pure: merges result rows from every result set of one event, dedupes by
// result_id, and sorts by performance level then level place, so the owner
// sees each race the way NWANA ranks it: fair contest inside each level.
export function flattenEventResults(
	drafts: ReadonlyArray<{
		content: { results: ReadonlyArray<LifecycleResultRow> };
	}>,
): LifecycleResultRow[] {
	const seen = new Set<string>();
	const rows: LifecycleResultRow[] = [];
	for (const draft of drafts) {
		for (const row of draft.content.results) {
			const key = row.result_id ?? `${row.athlete}|${row.time}|${row.performance_level}`;
			if (seen.has(key)) continue;
			seen.add(key);
			rows.push(row);
		}
	}
	return rows.sort((a, b) => {
		const levelDiff =
			resultLevelOrder(a.performance_level) - resultLevelOrder(b.performance_level);
		if (levelDiff !== 0) return levelDiff;
		const placeA = Number(a.level_place);
		const placeB = Number(b.level_place);
		if (Number.isFinite(placeA) && Number.isFinite(placeB) && placeA !== placeB) {
			return placeA - placeB;
		}
		return (a.time ?? "").localeCompare(b.time ?? "");
	});
}

export interface LifecycleEventView {
	event_id: number;
	event_name: string | null;
	event_date: string | null;
	stage: EventCoreStage;
	has_results: boolean;
	finalized: boolean;
	publication: "PUBLISHED" | "BASELINE" | "PENDING";
	publication_key: string | null;
	owner_action_required: boolean;
	owner_action: string | null;
}

export interface LifecycleDistanceState {
	distance: string;
	race_id: number;
	stage: RaceLifecycleStage;
	active_event: {
		event_id: number | null;
		event_name: string | null;
		event_date: string | null;
	} | null;
	owner_action_required: boolean;
	owner_action: string | null;
	prep: NextRacePrep | null;
	prep_confirmed: boolean;
	events: LifecycleEventView[];
}

function ownerActionForStage(stage: EventCoreStage): string | null {
	switch (stage) {
		case "verifying":
			return "Verify results manually (GPX/Strava/Garmin, poles required), then compute levels.";
		case "levels_computed":
			return "Review the editorial draft and publish with explicit PUBLISH confirmation.";
		case "awaiting_results":
			return "Race is over; collect submitted results in RunSignup.";
		default:
			return null;
	}
}

export interface LifecycleEventInput {
	eventId: number;
	eventName: string | null;
	eventDate: string | null;
	registrationUrl: string | null;
	hasResults: boolean;
	finalized: boolean;
	publication: "PUBLISHED" | "BASELINE" | "PENDING";
	publicationKey: string | null;
	resultsUrl: string | null;
}

// Pure: folds per-event inputs into the distance lifecycle state, advancing
// to next_race_prep when the previous event is done and the next one needs
// distribution preparation.
export function computeLifecycleDistanceState(input: {
	source: Series2026Source;
	events: readonly LifecycleEventInput[];
	nowDate: string;
	previousActiveEventId: number | null;
	previousPrepConfirmed: boolean;
	previousPrep: NextRacePrep | null;
}): LifecycleDistanceState {
	const views: LifecycleEventView[] = input.events.map((event) => {
		const stage = deriveEventStage({
			eventDate: event.eventDate,
			nowDate: input.nowDate,
			hasResults: event.hasResults,
			finalized: event.finalized,
			publication: event.publication,
		});
		return {
			event_id: event.eventId,
			event_name: event.eventName,
			event_date: event.eventDate,
			stage,
			has_results: event.hasResults,
			finalized: event.finalized,
			publication: event.publication,
			publication_key: event.publicationKey,
			owner_action_required:
				stage === "verifying" ||
				stage === "levels_computed" ||
				stage === "awaiting_results",
			owner_action: ownerActionForStage(stage),
		};
	});

	const sorted = [...views].sort((a, b) =>
		(a.event_date ?? "9999-12-31").localeCompare(b.event_date ?? "9999-12-31"),
	);
	const active =
		sorted.find((view) => view.stage !== "published") ?? sorted[sorted.length - 1] ?? null;

	let stage: RaceLifecycleStage;
	let prep: NextRacePrep | null =
		input.previousActiveEventId !== null &&
		active !== null &&
		input.previousActiveEventId === active.event_id
			? input.previousPrep
			: null;
	let prepConfirmed =
		prep !== null && input.previousPrepConfirmed;

	if (!active) {
		stage = "registration_open";
	} else if (active.stage === "registration_open") {
		const activeIndex = sorted.indexOf(active);
		const previous = activeIndex > 0 ? sorted[activeIndex - 1] : null;
		const previousDone = previous === null || previous.stage === "published";
		if (previousDone && !prepConfirmed) {
			stage = "next_race_prep";
			if (!prep) {
				const source = input.events.find((event) => event.eventId === active.event_id);
				prep = buildNextRacePrep({
					distance: input.source.distance,
					eventName: active.event_name,
					eventDate: active.event_date,
					registrationUrl: source?.registrationUrl ?? null,
				});
			}
		} else {
			stage = "registration_open";
		}
	} else {
		stage = active.stage;
		prep = null;
		prepConfirmed = false;
	}

	const ownerAction =
		stage === "next_race_prep"
			? "Review the announcement and email drafts, then confirm prep to open the registration stage."
			: active
				? ownerActionForStage(active.stage)
				: null;

	return {
		distance: input.source.distance,
		race_id: input.source.raceId,
		stage,
		active_event: active
			? {
				event_id: active.event_id,
				event_name: active.event_name,
				event_date: active.event_date,
			}
			: null,
		owner_action_required:
			ownerAction !== null,
		owner_action: ownerAction,
		prep,
		prep_confirmed: prepConfirmed,
		events: views,
	};
}

export function todayDateString(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

// Normalizes the date formats RunSignup actually returns into YYYY-MM-DD.
// RunSignup event start times arrive as US dates ("10/10/2026"), ISO dates
// ("2026-10-10"), or ISO datetimes ("2026-10-10T09:00:00"). Anything else
// returns null so a race is never classified from a guessed date.
export function normalizeRunSignupDate(
	value: string | null | undefined,
): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?$/i.exec(
		trimmed,
	);
	if (usMatch) {
		const month = Number(usMatch[1]);
		const day = Number(usMatch[2]);
		const year = Number(usMatch[3]);
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	}

	const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
	if (isoMatch) {
		const month = Number(isoMatch[2]);
		const day = Number(isoMatch[3]);
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
	}

	return null;
}

interface RunSignupCallEnv {
	accessToken: string;
	apiCallerToken?: string;
	apiCallerSecret?: string;
}

// Single bounded retry on a transient RunSignup 522 (upstream connection
// timeout). Exactly one immediate retry, no delay, no timers, no polling:
// if the second attempt fails the error surfaces with a clear message and
// the owner sees it on the results page.
export async function runSignupGetJson(
	url: URL,
	env: RunSignupCallEnv,
): Promise<Record<string, unknown>> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${env.accessToken}`,
	};
	if (env.apiCallerToken && env.apiCallerSecret) {
		url.searchParams.set("rsu_api_reg", env.apiCallerToken);
		headers["X-RSU-API-REG-SECRET"] = env.apiCallerSecret;
	}
	let response = await fetch(url, { headers });
	if (response.status === 522) {
		response = await fetch(url, { headers });
	}
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`RunSignup request failed: ${response.status} ${response.statusText} for ${url.pathname} :: ${body.slice(0, 500)}`,
		);
	}
	return (await response.json()) as Record<string, unknown>;
}

// Shared with write-test flow below.

async function postRunSignupForm(
	url: string,
	accessToken: string,
	payload: unknown,
): Promise<Record<string, unknown>> {
	const form = new FormData();
	form.append("request", JSON.stringify(payload));
	const response = await fetch(url, {
		method: "POST",
		headers: { Authorization: `Bearer ${accessToken}` },
		body: form,
	});
	const data = (await response.json()) as Record<string, unknown>;
	if (!response.ok) {
		const error = new Error(`RunSignup write request failed: ${response.status}`);
		(error as { status?: number }).status = response.status;
		throw error;
	}
	return data;
}

export interface SyncRaceLifecycleInput {
	db: D1Database;
	accessToken: string;
	apiCallerToken?: string;
	apiCallerSecret?: string;
	distance: string;
	now?: Date;
}

// On-demand lifecycle sync for one Series 2026 distance. Reads RunSignup
// (race events, result drafts) and the local publication ledger, derives
// stages, advances the active event, and persists the row. Never runs on a
// timer; the owner triggers it explicitly.
export async function syncRaceLifecycleDistance(
	input: SyncRaceLifecycleInput,
): Promise<LifecycleDistanceState & { synced_at: string }> {
	const source = SERIES_2026_SOURCES.find(
		(entry) => entry.distance === input.distance,
	);
	if (!source) throw new Error(`Unknown Series 2026 distance: ${input.distance}`);
	// Bearer-only auth, matching the proven NWANA-FINAL.ps1. The API-caller
	// (rsu_api_reg) layer is rejected by RunSignup on some race endpoints
	// (error 17 "Invalid API caller credentials") and is not needed for reads.
	const callEnv: RunSignupCallEnv = { accessToken: input.accessToken };

	const raceUrl = new URL(`https://api.runsignup.com/rest/race/${source.raceId}`);
	raceUrl.searchParams.set("format", "json");
	raceUrl.searchParams.set("events", "T");
	const raceResponse = await runSignupGetJson(raceUrl, callEnv);
	const race = raceResponse.race as Record<string, unknown> | undefined;
	const rawEvents = Array.isArray(race?.events) ? race.events : [];
	const registrationUrl =
		typeof race?.url === "string" && race.url.length > 0 ? race.url : null;

	const preview = await previewSeries2026ResultPublications(input.accessToken, {
		distance: input.distance,
	});

	const history = await input.db
		.prepare(
			`SELECT publication_key, status FROM result_publication_history WHERE series = 'SERIES_2026'`,
		)
		.all<{ publication_key: string; status: string }>();
	const historyMap = new Map(
		history.results.map((row) => [row.publication_key, row.status]),
	);

	const draftsByEvent = new Map<number, typeof preview.drafts>();
	for (const draft of preview.drafts) {
		const list = draftsByEvent.get(draft.source.event_id) ?? [];
		list.push(draft);
		draftsByEvent.set(draft.source.event_id, list);
	}

	const nowDate = todayDateString(input.now);
	const eventInputs: LifecycleEventInput[] = rawEvents.map((raw) => {
		const event = raw as Record<string, unknown>;
		const eventId = Number(event.event_id);
		const startTime = [event.start_time, event.event_start_time].find(
			(value): value is string => typeof value === "string" && value.length >= 4,
		);
		const eventDate = normalizeRunSignupDate(startTime ?? null);
		const sets = draftsByEvent.get(eventId) ?? [];
		const setsWithResults = sets.filter((draft) => draft.content.results.length > 0);
		const hasResults = setsWithResults.length > 0;
		const finalized =
			hasResults &&
			setsWithResults.every((draft) => draft.ready_for_editorial_review);
		const statuses = sets.map(
			(draft) => historyMap.get(draft.publication_key) ?? null,
		);
		let publication: "PUBLISHED" | "BASELINE" | "PENDING" = "PENDING";
		if (sets.length > 0 && statuses.every((status) => status === "PUBLISHED")) {
			publication = "PUBLISHED";
		} else if (
			sets.length > 0 &&
			statuses.every((status) => status === "LEGACY_BASELINE")
		) {
			publication = "BASELINE";
		}
		const publicationKey =
			setsWithResults[0]?.publication_key ?? sets[0]?.publication_key ?? null;
		const resultsUrl =
			sets
				.map((draft) => draft.editorial_draft.link_url)
				.find((link): link is string => typeof link === "string" && link.length > 0) ??
			null;
		return {
			eventId,
			eventName: typeof event.name === "string" ? event.name : null,
			eventDate,
			registrationUrl,
			hasResults,
			finalized,
			publication,
			publicationKey,
			resultsUrl,
		};
	});

	const previous = await input.db
		.prepare(
			`SELECT active_event_id, prep_json, prep_confirmed FROM race_lifecycle WHERE series = ? AND distance = ?`,
		)
		.bind(RACE_LIFECYCLE_SERIES, input.distance)
		.first<{
			active_event_id: number | null;
			prep_json: string | null;
			prep_confirmed: string;
		}>();

	const state = computeLifecycleDistanceState({
		source,
		events: eventInputs,
		nowDate,
		previousActiveEventId: previous?.active_event_id ?? null,
		previousPrepConfirmed: previous?.prep_confirmed === "true",
		previousPrep: previous?.prep_json
			? (JSON.parse(previous.prep_json) as NextRacePrep)
			: null,
	});

	const syncedAt = new Date().toISOString();
	await input.db
		.prepare(
			`
			INSERT INTO race_lifecycle (
				series, distance, race_id, active_event_id, active_event_name,
				active_event_date, stage, events_json, prep_json, prep_confirmed,
				synced_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(series, distance) DO UPDATE SET
				race_id = excluded.race_id,
				active_event_id = excluded.active_event_id,
				active_event_name = excluded.active_event_name,
				active_event_date = excluded.active_event_date,
				stage = excluded.stage,
				events_json = excluded.events_json,
				prep_json = excluded.prep_json,
				prep_confirmed = excluded.prep_confirmed,
				synced_at = excluded.synced_at,
				updated_at = excluded.updated_at
			`,
		)
		.bind(
			RACE_LIFECYCLE_SERIES,
			input.distance,
			source.raceId,
			state.active_event?.event_id ?? null,
			state.active_event?.event_name ?? null,
			state.active_event?.event_date ?? null,
			state.stage,
			JSON.stringify(state.events),
			state.prep ? JSON.stringify(state.prep) : null,
			state.prep_confirmed ? "true" : "false",
			syncedAt,
			syncedAt,
		)
		.run();

	// Snapshot per-event result rows for the operating center results page.
	// Read-only: this stores what RunSignup returned during sync; it never
	// writes back to RunSignup.
	for (const eventInput of eventInputs) {
		const drafts = draftsByEvent.get(eventInput.eventId) ?? [];
		const rows = flattenEventResults(drafts);
		await input.db
			.prepare(
				`
				INSERT INTO race_event_results (
					series, distance, race_id, event_id, event_name, event_date,
					result_count, finalized, results_json, results_url,
					publication_status, synced_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(series, distance, event_id) DO UPDATE SET
					event_name = excluded.event_name,
					event_date = excluded.event_date,
					result_count = excluded.result_count,
					finalized = excluded.finalized,
					results_json = excluded.results_json,
					results_url = excluded.results_url,
					publication_status = excluded.publication_status,
					synced_at = excluded.synced_at
				`,
			)
			.bind(
				RACE_LIFECYCLE_SERIES,
				input.distance,
				source.raceId,
				eventInput.eventId,
				eventInput.eventName,
				eventInput.eventDate,
				rows.length,
				eventInput.finalized ? 1 : 0,
				JSON.stringify(rows),
				eventInput.resultsUrl,
				eventInput.publication,
				syncedAt,
			)
			.run();
	}

	return { ...state, synced_at: syncedAt };
}

export async function getRaceLifecycleView(db: D1Database): Promise<{
	ok: true;
	series: string;
	write_mode: "dry_run";
	generated_at: string;
	distances: Array<{
		distance: string;
		race_id: number;
		stage: string;
		active_event: {
			event_id: number | null;
			event_name: string | null;
			event_date: string | null;
		} | null;
		owner_action_required: boolean;
		prep: NextRacePrep | null;
		prep_confirmed: boolean;
		write_access: RunSignupWriteAccess;
		write_mode: "dry_run";
		synced_at: string | null;
		events: LifecycleEventView[];
	}>;
}> {
	const rows = await db
		.prepare(
			`
			SELECT series, distance, race_id, active_event_id, active_event_name,
				active_event_date, stage, events_json, prep_json, prep_confirmed,
				write_access, write_mode, synced_at
			FROM race_lifecycle
			WHERE series = ?
			ORDER BY distance
			`,
		)
		.bind(RACE_LIFECYCLE_SERIES)
		.all<{
			series: string;
			distance: string;
			race_id: number;
			active_event_id: number | null;
			active_event_name: string | null;
			active_event_date: string | null;
			stage: string;
			events_json: string | null;
			prep_json: string | null;
			prep_confirmed: string;
			write_access: RunSignupWriteAccess;
			write_mode: "dry_run";
			synced_at: string | null;
		}>();

	return {
		ok: true,
		series: RACE_LIFECYCLE_SERIES,
		write_mode: "dry_run",
		generated_at: new Date().toISOString(),
		distances: rows.results.map((row) => ({
			distance: row.distance,
			race_id: row.race_id,
			stage: row.stage,
			active_event:
				row.active_event_id === null
					? null
					: {
						event_id: row.active_event_id,
						event_name: row.active_event_name,
						event_date: row.active_event_date,
					},
			owner_action_required:
				row.stage === "verifying" ||
				row.stage === "levels_computed" ||
				row.stage === "awaiting_results" ||
				row.stage === "next_race_prep",
			prep: row.prep_json ? (JSON.parse(row.prep_json) as NextRacePrep) : null,
			prep_confirmed: row.prep_confirmed === "true",
			write_access: row.write_access,
			write_mode: row.write_mode,
			synced_at: row.synced_at,
			events: row.events_json
				? (JSON.parse(row.events_json) as LifecycleEventView[])
				: [],
		})),
	};
}

// Read-only view for the operating center results page: per-distance past
// events with their synced result rows, most recent event first. Only
// events on or before today are shown: future races never appear here,
// no matter what their stored date format was.
export async function getRaceResultsView(
	db: D1Database,
	now: Date = new Date(),
): Promise<{
	ok: true;
	series: string;
	generated_at: string;
	distances: Array<{
		distance: string;
		race_id: number;
		stage: string;
		synced_at: string | null;
		events: LifecycleEventResults[];
	}>;
}> {
	const today = todayDateString(now);
	const lifecycle = await db
		.prepare(
			`SELECT distance, race_id, stage, synced_at FROM race_lifecycle WHERE series = ? ORDER BY distance`,
		)
		.bind(RACE_LIFECYCLE_SERIES)
		.all<{
			distance: string;
			race_id: number;
			stage: string;
			synced_at: string | null;
		}>();

	const results = await db
		.prepare(
			`SELECT distance, event_id, event_name, event_date, result_count, finalized,
				results_json, results_url, publication_status
			 FROM race_event_results WHERE series = ? ORDER BY distance`,
		)
		.bind(RACE_LIFECYCLE_SERIES)
		.all<{
			distance: string;
			event_id: number;
			event_name: string | null;
			event_date: string | null;
			result_count: number;
			finalized: number;
			results_json: string;
			results_url: string | null;
			publication_status: string | null;
		}>();

	const validPublication = (
		value: string | null,
	): "PUBLISHED" | "BASELINE" | "PENDING" =>
		value === "PUBLISHED" || value === "BASELINE" ? value : "PENDING";

	const byDistance = new Map<string, LifecycleEventResults[]>();
	for (const row of results.results) {
		// Defensive: rows written before the date normalization fix may hold
		// a US-format date; normalize before the past/future comparison.
		const eventDate = normalizeRunSignupDate(row.event_date) ?? row.event_date;
		if (eventDate === null || eventDate > today) continue;
		const list = byDistance.get(row.distance) ?? [];
		list.push({
			event_id: row.event_id,
			event_name: row.event_name,
			event_date: eventDate,
			finalized: row.finalized === 1,
			publication_status: validPublication(row.publication_status),
			results_url: row.results_url,
			result_count: row.result_count,
			results: JSON.parse(row.results_json) as LifecycleResultRow[],
		});
		byDistance.set(row.distance, list);
	}
	for (const list of byDistance.values()) {
		list.sort((a, b) => (b.event_date ?? "").localeCompare(a.event_date ?? ""));
	}

	return {
		ok: true,
		series: RACE_LIFECYCLE_SERIES,
		generated_at: new Date().toISOString(),
		distances: lifecycle.results.map((row) => ({
			distance: row.distance,
			race_id: row.race_id,
			stage: row.stage,
			synced_at: row.synced_at,
			events: byDistance.get(row.distance) ?? [],
		})),
	};
}

export async function confirmRaceLifecyclePrep(
	db: D1Database,
	distance: string,
): Promise<{ ok: true; distance: string; stage: RaceLifecycleStage }> {
	const row = await db
		.prepare(
			`SELECT stage FROM race_lifecycle WHERE series = ? AND distance = ?`,
		)
		.bind(RACE_LIFECYCLE_SERIES, distance)
		.first<{ stage: string }>();
	if (!row) {
		throw new Error(`Run a lifecycle sync for ${distance} first.`);
	}
	if (row.stage !== "next_race_prep") {
		throw new Error(
			`Distance ${distance} is not in next_race_prep (current stage: ${row.stage}).`,
		);
	}
	await db
		.prepare(
			`UPDATE race_lifecycle
			SET stage = 'registration_open', prep_confirmed = 'true', updated_at = CURRENT_TIMESTAMP
			WHERE series = ? AND distance = ?`,
		)
		.bind(RACE_LIFECYCLE_SERIES, distance)
		.run();
	return { ok: true, distance, stage: "registration_open" };
}

export interface WriteTestResult {
	attempted: boolean;
	write_access: RunSignupWriteAccess;
	detail: string;
	field_id?: number;
}

// One-shot RunSignup write-access probe. It performs the exact first write
// the levels pipeline would make (ensure the "Performance Level" custom
// field exists on a verifying event's result set), and nothing else. The
// call is additive and idempotent: if the field already exists, no write is
// attempted and access stays UNKNOWN.
export async function testSeries2026WriteAccess(input: {
	db: D1Database;
	accessToken: string;
	distance: string;
}): Promise<WriteTestResult> {
	const source = SERIES_2026_SOURCES.find(
		(entry) => entry.distance === input.distance,
	);
	if (!source) throw new Error(`Unknown Series 2026 distance: ${input.distance}`);

	const row = await input.db
		.prepare(
			`SELECT events_json FROM race_lifecycle WHERE series = ? AND distance = ?`,
		)
		.bind(RACE_LIFECYCLE_SERIES, input.distance)
		.first<{ events_json: string | null }>();
	if (!row?.events_json) {
		throw new Error(`Run a lifecycle sync for ${input.distance} first.`);
	}
	const events = JSON.parse(row.events_json) as LifecycleEventView[];
	const candidate = events.find((event) => event.stage === "verifying");
	if (!candidate) {
		return {
			attempted: false,
			write_access: "UNKNOWN",
			detail:
				"No event is in the verifying stage; there is nothing safe to test the write against.",
		};
	}

	const callEnv: RunSignupCallEnv = { accessToken: input.accessToken };
	const setsUrl = new URL(
		`https://api.runsignup.com/rest/race/${source.raceId}/results/get-result-sets`,
	);
	setsUrl.searchParams.set("format", "json");
	setsUrl.searchParams.set("event_id", String(candidate.event_id));
	const setsData = await runSignupGetJson(setsUrl, callEnv);
	const sets = Array.isArray(setsData.individual_results_sets)
		? setsData.individual_results_sets
		: [];
	const firstSet = sets[0] as Record<string, unknown> | undefined;
	const resultSetId = Number(firstSet?.individual_result_set_id);
	if (!Number.isInteger(resultSetId)) {
		return {
			attempted: false,
			write_access: "UNKNOWN",
			detail: "No result set found for the verifying event.",
		};
	}

	const resultsUrl = new URL(
		`https://api.runsignup.com/rest/race/${source.raceId}/results/get-results`,
	);
	resultsUrl.searchParams.set("format", "json");
	resultsUrl.searchParams.set("event_id", String(candidate.event_id));
	resultsUrl.searchParams.set("individual_result_set_id", String(resultSetId));
	resultsUrl.searchParams.set("results_per_page", "1");
	const resultsData = await runSignupGetJson(resultsUrl, callEnv);
	const resultSets = Array.isArray(resultsData.individual_results_sets)
		? resultsData.individual_results_sets
		: [];
	const resultSet = resultSets[0] as Record<string, unknown> | undefined;
	const headers = (resultSet?.results_headers ?? {}) as Record<string, unknown>;
	const fieldExists = Object.values(headers).some((value) => {
		const label =
			typeof value === "string"
				? value
				: (value as Record<string, unknown> | null)?.column_text;
		return (
			typeof label === "string" && label.trim().toLowerCase() === "performance level"
		);
	});
	if (fieldExists) {
		return {
			attempted: false,
			write_access: "UNKNOWN",
			detail:
				'The "Performance Level" field already exists on the verifying event; no write was needed, so access remains untested.',
		};
	}

	const createUrl =
		`https://api.runsignup.com/rest/race/${source.raceId}/results/custom-fields` +
		`?format=json&event_id=${candidate.event_id}` +
		`&individual_result_set_id=${resultSetId}&request_format=json`;
	try {
		const answer = await postRunSignupForm(createUrl, input.accessToken, {
			custom_fields: [
				{
					custom_field_id: null,
					custom_field_name: "Performance Level",
					custom_field_short_name: "Performance Level",
					custom_field_data_type: "string",
				},
			],
		});
		const fields = (answer.custom_fields ?? []) as Array<{
			custom_field_id?: number;
		}>;
		const fieldId =
			typeof fields[0]?.custom_field_id === "number"
				? fields[0].custom_field_id
				: undefined;
		if (fieldId === undefined) {
			return {
				attempted: true,
				write_access: "UNKNOWN",
				detail:
					"The write request succeeded but returned no field id; access is inconclusive.",
			};
		}
		await input.db
			.prepare(
				`UPDATE race_lifecycle SET write_access = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE series = ? AND distance = ?`,
			)
			.bind(RACE_LIFECYCLE_SERIES, input.distance)
			.run();
		return {
			attempted: true,
			write_access: "CONFIRMED",
			detail: `Created the "Performance Level" custom field (id ${fieldId}); RunSignup write access is confirmed.`,
			field_id: fieldId,
		};
	} catch (error) {
		const status = (error as { status?: number }).status;
		if (status === 401 || status === 403) {
			await input.db
				.prepare(
					`UPDATE race_lifecycle SET write_access = 'DENIED', updated_at = CURRENT_TIMESTAMP WHERE series = ? AND distance = ?`,
				)
				.bind(RACE_LIFECYCLE_SERIES, input.distance)
				.run();
			return {
				attempted: true,
				write_access: "DENIED",
				detail: `The write was rejected with HTTP ${status}; RunSignup write access is denied for this token.`,
			};
		}
		return {
			attempted: true,
			write_access: "UNKNOWN",
			detail: `The write attempt failed: ${(error as Error).message}`,
		};
	}
}
