// NWANA Engine — Series 2026 owner-approved levels apply path.
//
// The dry-run write plan (buildSeries2026LevelsWritePlan) prepares what the
// legacy NWANA-FINAL.ps1 pipeline did by hand. This module is the Machine's
// own apply path for that plan: it executes the four verified RunSignup
// writes for one verifying event after the owner explicitly confirms.
//
// Gates (all fail closed):
// - confirmation must be exactly "APPLY_LEVELS";
// - D1 race_lifecycle.write_access must be "CONFIRMED" for the distance
//   (set only by the TEST_WRITE probe the owner runs once);
// - the event must be in the "verifying" stage in the last synced state.
//
// Step formats are verified against the published RunSignup API catalog:
// - POST /rest/race/:race_id/results/custom-fields          (field ensure)
// - POST /rest/race/:race_id/results/full-results            (Post Event Results:
//   edit via result_id, custom values via custom-field-<id>)
// - POST /rest/v2/race-series/non-standard-scoring-types.json (BETA, add/edit)
// - POST /rest/v2/race-series/race-series-results.json        (BETA, post series
//   results; needs scoring_type_id + race_series_participant_id)
// Participant ids are resolved live via the BETA series-participant lookup.
// The lifecycle stage is NOT flipped here: the next owner-triggered sync
// derives levels_computed from the new RunSignup facts (ADR-0008).

import {
	RACE_LIFECYCLE_SERIES,
	computeSeries2026Levels,
	postRunSignupForm,
	runSignupGetJson,
	series2026LevelDisplayName,
	type ComputedLifecycleResult,
	type LifecycleEventView,
	type PerformanceLevelName,
} from "./race-lifecycle";
import { SERIES_2026_SOURCES, type Series2026Source } from "./series-2026-results";

export const APPLY_LEVELS_CONFIRMATION = "APPLY_LEVELS";

const PERFORMANCE_LEVEL_FIELD = "Performance Level";
const LEVEL_PLACE_FIELD = "Level Place";

export interface ApplyStepResult {
	step: string;
	status: "ok" | "skipped" | "failed";
	detail: string;
}

export interface ApplyLevelsInput {
	db: D1Database;
	accessToken: string;
	distance: string;
	eventId: number;
	confirmation: string;
}

export interface ApplyLevelsResult {
	ok: boolean;
	distance: string;
	event_id: number;
	result_set_id: number | null;
	result_count: number;
	computed: ComputedLifecycleResult[];
	steps: ApplyStepResult[];
	error?: string;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as UnknownRecord)
		: null;
}

function text(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const normalized = String(value).trim();
	return normalized.length > 0 ? normalized : null;
}

function headerLabel(value: unknown): string | null {
	const direct = text(value);
	if (direct && typeof value !== "object") return direct;
	const record = asRecord(value);
	if (!record) return null;
	return text(record.column_text ?? record.label ?? record.name ?? record.field_name);
}

function findCustomFieldId(headers: unknown, fieldName: string): number | null {
	const record = asRecord(headers);
	if (!record) return null;
	const wanted = fieldName.toLowerCase();
	for (const [key, value] of Object.entries(record)) {
		if (headerLabel(value)?.toLowerCase() !== wanted) continue;
		const idMatch = /^custom-field-(\d+)$/.exec(key);
		if (idMatch) return Number(idMatch[1]);
		const rec = asRecord(value);
		const id = rec ? Number(rec.custom_field_id) : NaN;
		if (Number.isInteger(id)) return id;
	}
	return null;
}

function fail(result: ApplyLevelsResult, step: string, detail: string): ApplyLevelsResult {
	return {
		...result,
		ok: false,
		error: detail,
		steps: [...result.steps, { step, status: "failed", detail }],
	};
}

export function scoringTypeName(
	distance: string,
	level: PerformanceLevelName,
	gender: "Men" | "Women",
): string {
	return `${level} ${gender} (${series2026LevelDisplayName(distance, level)}; tie: best time)`;
}

// Reads the verifying event's live results and computes levels. Pure except
// for the two RunSignup reads; shared by the endpoint and by tests via the
// exported payload builders below.
export async function readAndComputeLevels(
	source: Series2026Source,
	eventId: number,
	accessToken: string,
): Promise<{
	resultSetId: number;
	resultSetName: string | null;
	headers: UnknownRecord;
	rawRows: UnknownRecord[];
	// Parallel registration_ids array from get-results, index-aligned with
	// rawRows — the same source NWANA-FINAL.ps1 used. Rows may carry no
	// per-row registration_id/user_id (manual entries); the parallel array
	// is the canonical mapping source.
	registrationIds: Array<number | null>;
	computed: ComputedLifecycleResult[];
}> {
	const callEnv = { accessToken };
	const setsUrl = new URL(
		`https://api.runsignup.com/rest/race/${source.raceId}/results/get-result-sets`,
	);
	setsUrl.searchParams.set("format", "json");
	setsUrl.searchParams.set("event_id", String(eventId));
	const setsData = await runSignupGetJson(setsUrl, callEnv);
	const sets = Array.isArray(setsData.individual_results_sets)
		? setsData.individual_results_sets
		: [];
	const firstSet = asRecord(sets.find((entry) => {
		const record = asRecord(entry);
		return record !== null && Number.isInteger(Number(record.individual_result_set_id));
	}));
	const resultSetId = firstSet ? Number(firstSet.individual_result_set_id) : NaN;
	if (!Number.isInteger(resultSetId)) {
		throw new Error(`No result set found for event ${eventId}.`);
	}

	const resultsUrl = new URL(
		`https://api.runsignup.com/rest/race/${source.raceId}/results/get-results`,
	);
	resultsUrl.searchParams.set("format", "json");
	resultsUrl.searchParams.set("event_id", String(eventId));
	resultsUrl.searchParams.set("individual_result_set_id", String(resultSetId));
	resultsUrl.searchParams.set("results_per_page", "1000");
	const resultsData = await runSignupGetJson(resultsUrl, callEnv);
	const resultSets = Array.isArray(resultsData.individual_results_sets)
		? resultsData.individual_results_sets
		: [];
	const resultSet = asRecord(resultSets[0]);
	if (!resultSet) {
		throw new Error(`No results payload returned for event ${eventId}.`);
	}
	const headers = asRecord(resultSet.results_headers) ?? {};
	const rawRows = Array.isArray(resultSet.results)
		? resultSet.results.map(asRecord).filter((row): row is UnknownRecord => row !== null)
		: [];
	if (rawRows.length === 0) {
		throw new Error(`Result set ${resultSetId} has no result rows to classify.`);
	}

	// Legacy parity: registration ids come from the parallel registration_ids
	// array, index-aligned with results — not from per-row fields. A count
	// mismatch is a hard error, exactly like NWANA-FINAL.ps1.
	const registrationIdsRaw = Array.isArray(resultSet.registration_ids)
		? resultSet.registration_ids
		: null;
	if (!registrationIdsRaw || registrationIdsRaw.length !== rawRows.length) {
		throw new Error(
			`registration_ids count does not match results for event ${eventId}.`,
		);
	}
	const registrationIds = registrationIdsRaw.map((value) => {
		const id = Number(value);
		return Number.isInteger(id) && id > 0 ? id : null;
	});

	const computed = computeSeries2026Levels(
		source.distance,
		rawRows.map((row) => ({
			result_id:
				typeof row.result_id === "string" || typeof row.result_id === "number"
					? row.result_id
					: null,
			first_name: text(row.first_name),
			last_name: text(row.last_name),
			gender: text(row.gender),
			chip_time: text(row.chip_time),
			clock_time: text(row.clock_time),
		})),
	);

	return {
		resultSetId,
		resultSetName: text(firstSet?.individual_result_set_name),
		headers,
		rawRows,
		registrationIds,
		computed,
	};
}

// Step 1 payload: create the custom fields that are still missing. Returns
// the resolved field ids for both fields.
export async function ensureLevelCustomFields(
	source: Series2026Source,
	eventId: number,
	resultSetId: number,
	headers: UnknownRecord,
	accessToken: string,
): Promise<{ levelFieldId: number; placeFieldId: number; created: string[] }> {
	let levelFieldId = findCustomFieldId(headers, PERFORMANCE_LEVEL_FIELD);
	let placeFieldId = findCustomFieldId(headers, LEVEL_PLACE_FIELD);
	const missing: Array<{ name: string }> = [];
	if (levelFieldId === null) missing.push({ name: PERFORMANCE_LEVEL_FIELD });
	if (placeFieldId === null) missing.push({ name: LEVEL_PLACE_FIELD });

	const created: string[] = [];
	if (missing.length > 0) {
		const createUrl =
			`https://api.runsignup.com/rest/race/${source.raceId}/results/custom-fields` +
			`?format=json&event_id=${eventId}` +
			`&individual_result_set_id=${resultSetId}&request_format=json`;
		const answer = await postRunSignupForm(createUrl, accessToken, {
			custom_fields: missing.map((field) => ({
				custom_field_id: null,
				custom_field_name: field.name,
				custom_field_short_name: field.name,
				custom_field_data_type: "string",
			})),
		});
		const fields = Array.isArray(answer.custom_fields) ? answer.custom_fields : [];
		for (let index = 0; index < missing.length; index++) {
			const field = asRecord(fields[index]);
			const id = field ? Number(field.custom_field_id) : NaN;
			if (!Number.isInteger(id)) {
				throw new Error(
					`RunSignup did not return a field id for "${missing[index].name}".`,
				);
			}
			created.push(missing[index].name);
			if (missing[index].name === PERFORMANCE_LEVEL_FIELD) levelFieldId = id;
			else placeFieldId = id;
		}
	}
	if (levelFieldId === null || placeFieldId === null) {
		throw new Error("Could not resolve both custom field ids.");
	}
	return { levelFieldId, placeFieldId, created };
}

// Step payload builder (pure): full result rows keyed by result_id, exactly
// like NWANA-FINAL.ps1 — every original field plus preserved custom-field-*
// values, with the two NWANA fields set. Per the Post Event Results API
// contract, custom values travel as custom-field-<id>.
export function buildResultFieldRows(
	computed: ComputedLifecycleResult[],
	rawRows: readonly UnknownRecord[],
	registrationIds: ReadonlyArray<number | null>,
	levelFieldId: number,
	placeFieldId: number,
): Array<Record<string, unknown>> {
	if (registrationIds.length !== computed.length) {
		throw new Error("registration_ids count does not match results.");
	}
	return computed.map((row, index) => {
		const raw = rawRows[index] ?? {};
		const resultId = row.result_id ?? text(raw.result_id);
		if (!resultId) {
			throw new Error(`Result row ${index} has no result_id; cannot edit it.`);
		}
		const registrationId = registrationIds[index];
		if (registrationId === null) {
			throw new Error(
				`Result row ${index} has no registration_id; cannot map it to a series participant.`,
			);
		}
		const out: Record<string, unknown> = {
			result_id: resultId,
			registration_id: registrationId,
			place: raw.place ?? null,
			bib: raw.bib ?? null,
			first_name: text(raw.first_name),
			last_name: text(raw.last_name),
			gender: text(raw.gender),
			city: text(raw.city),
			state: text(raw.state),
			country_code: text(raw.country_code),
			clock_time: text(raw.clock_time),
			chip_time: text(raw.chip_time),
			age: raw.age ?? null,
		};
		for (const [key, value] of Object.entries(raw)) {
			if (key.startsWith("custom-field-")) out[key] = value;
		}
		out[`custom-field-${levelFieldId}`] = row.level_display;
		out[`custom-field-${placeFieldId}`] = String(row.level_place);
		return out;
	});
}

export async function writeResultFields(
	source: Series2026Source,
	eventId: number,
	resultSetId: number,
	rows: Array<Record<string, unknown>>,
	accessToken: string,
): Promise<void> {
	const url =
		`https://api.runsignup.com/rest/race/${source.raceId}/results/full-results` +
		`?format=json&event_id=${eventId}` +
		`&individual_result_set_id=${resultSetId}&request_format=json`;
	await postRunSignupForm(url, accessToken, { results: rows });
}

// All five Series 2026 levels, in legacy order.
export const SERIES_2026_LEVELS: readonly PerformanceLevelName[] = [
	"Elite",
	"High Performance",
	"Performance",
	"Competitive",
	"Open",
];

// Every scoring type name NWANA-FINAL.ps1 maintains per distance: all five
// levels x Men/Women. Ensuring all ten (not just the levels present in one
// event) matches the legacy sweep and keeps every category replaceable.
export function allScoringTypeNames(distance: string): string[] {
	const names: string[] = [];
	for (const level of SERIES_2026_LEVELS) {
		names.push(scoringTypeName(distance, level, "Men"));
		names.push(scoringTypeName(distance, level, "Women"));
	}
	return names;
}

// Legacy scoring types are the same level/gender names WITHOUT the
// "; tie: best time" suffix (pre-v4 naming). Matches NWANA-FINAL.ps1's
// Remove-LegacyScoringTypes regex exactly.
const LEGACY_SCORING_TYPE_RE = /^(Elite|High Performance|Performance|Competitive|Open) (Men|Women)/;

export async function listScoringTypes(
	source: Series2026Source,
	accessToken: string,
): Promise<Map<string, number>> {
	const listUrl = new URL(
		"https://api.runsignup.com/rest/v2/race-series/non-standard-scoring-types.json",
	);
	listUrl.searchParams.set("format", "json");
	listUrl.searchParams.set("race_series_id", String(source.raceSeriesId));
	listUrl.searchParams.set("race_series_year_id", String(source.raceSeriesYearId));
	const existing = await runSignupGetJson(listUrl, { accessToken });
	const ids = new Map<string, number>();
	for (const value of Object.values(existing)) {
		if (!Array.isArray(value)) continue;
		for (const entry of value) {
			const record = asRecord(entry);
			const id = record ? Number(record.scoring_type_id) : NaN;
			const name = record ? text(record.scoring_type_name) : null;
			if (Number.isInteger(id) && name) ids.set(name, id);
		}
	}
	return ids;
}

// Step 3: reuse existing non-standard scoring types by exact name; create
// only the missing ones. Returns the name -> id map for every needed type.
export async function ensureScoringTypes(
	source: Series2026Source,
	neededNames: readonly string[],
	accessToken: string,
): Promise<{ ids: Map<string, number>; created: string[] }> {
	const found = await listScoringTypes(source, accessToken);
	const ids = new Map<string, number>();
	const missing = neededNames.filter((name) => {
		const hit = found.get(name);
		if (hit !== undefined) ids.set(name, hit);
		return hit === undefined;
	});

	const created: string[] = [];
	if (missing.length > 0) {
		const createUrl =
			`https://api.runsignup.com/rest/v2/race-series/non-standard-scoring-types.json` +
			`?race_series_id=${source.raceSeriesId}&race_series_year_id=${source.raceSeriesYearId}`;
		const answer = await postRunSignupForm(createUrl, accessToken, {
			non_standard_scoring_types: missing.map((name) => ({
				scoring_type_id: null,
				scoring_type_name: name,
			})),
		});
		const added = Array.isArray(answer.added_non_standard_scoring_types)
			? answer.added_non_standard_scoring_types
			: [];
		for (const entry of added) {
			const record = asRecord(entry);
			const id = record ? Number(record.scoring_type_id) : NaN;
			const name = record ? text(record.scoring_type_name) : null;
			if (Number.isInteger(id) && name) {
				ids.set(name, id);
				created.push(name);
			}
		}
		const stillMissing = neededNames.filter((name) => !ids.has(name));
		if (stillMissing.length > 0) {
			throw new Error(
				`Could not resolve scoring type ids for: ${stillMissing.join("; ")}.`,
			);
		}
	}
	return { ids, created };
}

// Participant resolution via add/registration-id.json — exactly like
// NWANA-FINAL.ps1. Unlike the BETA lookup endpoint, this creates a series
// participant when the registration is not one yet and returns the existing
// id otherwise, so it never silently drops rows. Response rows carry a
// 1-based "row" index aligned with the submitted participants array.
export async function resolveSeriesParticipants(
	source: Series2026Source,
	eventId: number,
	registrationIds: ReadonlyArray<number | null>,
	accessToken: string,
): Promise<number[]> {
	for (const id of registrationIds) {
		if (id === null) {
			// Legacy parity: NWANA-FINAL.ps1 would send 0 and fail the
			// mapping below; failing here is the same outcome, explicit.
			throw new Error("Incomplete series participant mapping");
		}
	}
	const url =
		`https://api.runsignup.com/rest/v2/race-series/race-series-participants/add/registration-id.json` +
		`?race_series_id=${source.raceSeriesId}&race_series_year_id=${source.raceSeriesYearId}` +
		`&race_id=${source.raceId}&event_id=${eventId}`;
	const answer = await postRunSignupForm(url, accessToken, {
		columns: ["registration_id", "user_defined_id"],
		participants: registrationIds.map((id) => [id, null]),
	});
	const matches = Array.isArray(answer.race_series_participants)
		? answer.race_series_participants
		: [];
	if (matches.length !== registrationIds.length) {
		throw new Error("Incomplete series participant mapping");
	}
	const ids: Array<number | null> = new Array(registrationIds.length).fill(null);
	for (const entry of matches) {
		const record = asRecord(entry);
		const row = record ? Number(record.row) : NaN;
		const participantId = record ? Number(record.race_series_participant_id) : NaN;
		if (
			!Number.isInteger(row) ||
			row < 1 ||
			row > ids.length ||
			!Number.isInteger(participantId)
		) {
			throw new Error("Invalid series participant row");
		}
		ids[row - 1] = participantId;
	}
	if (ids.some((id) => id === null)) {
		throw new Error("Incomplete series participant mapping");
	}
	return ids as number[];
}

export interface StandingsGroup {
	name: string;
	rows: Array<[number, number, number]>;
}

// Pure grouping for standings upload: all ten legacy level x gender groups
// in legacy order, rows sorted by Level Place; empty groups are included so
// the upload clears stale standings (legacy replacement semantics).
export function groupStandingsByScoringType(
	computed: ComputedLifecycleResult[],
	participantIds: readonly number[],
	distance: string,
): StandingsGroup[] {
	if (participantIds.length !== computed.length) {
		throw new Error("Incomplete series participant mapping");
	}
	const groups: StandingsGroup[] = [];
	for (const level of SERIES_2026_LEVELS) {
		for (const gender of ["Men", "Women"] as const) {
			const genderCode = gender === "Men" ? "M" : "F";
			const rows = computed
				.map((row, index) => ({ row, participantId: participantIds[index] }))
				.filter(
					(entry) =>
						entry.row.level === level &&
						(entry.row.gender ?? "").toUpperCase() === genderCode,
				)
				.sort((a, b) => a.row.level_place - b.row.level_place)
				.map((entry) => [entry.participantId, entry.row.points, entry.row.level_place] as [number, number, number]);
			groups.push({ name: scoringTypeName(distance, level, gender), rows });
		}
	}
	return groups;
}

// Standings upload with legacy replacement semantics: every one of the ten
// scoring types is uploaded (empty groups send an empty scoring_data array,
// clearing stale standings), clear_previous_results=T replaces the whole
// category/event scoring — "safe to run again". Failure detection matches
// NWANA-FINAL.ps1: any failed_race_series_participant_id aborts.
export async function uploadSeriesStandings(
	source: Series2026Source,
	eventId: number,
	computed: ComputedLifecycleResult[],
	participantIds: readonly number[],
	scoringTypeIds: Map<string, number>,
	accessToken: string,
): Promise<{ uploaded: number; groups: string[] }> {
	const groups = groupStandingsByScoringType(computed, participantIds, source.distance);
	let uploaded = 0;
	const groupNames: string[] = [];
	for (const { name, rows } of groups) {
		const scoringTypeId = scoringTypeIds.get(name);
		if (!scoringTypeId) {
			throw new Error(`No scoring type id resolved for "${name}".`);
		}
		const url =
			`https://api.runsignup.com/rest/v2/race-series/race-series-results.json` +
			`?race_series_id=${source.raceSeriesId}&race_series_year_id=${source.raceSeriesYearId}` +
			`&race_id=${source.raceId}&event_id=${eventId}&scoring_type_id=${scoringTypeId}` +
			`&clear_previous_results=T`;
		const answer = await postRunSignupForm(url, accessToken, {
			columns: ["race_series_participant_id", "series_points", "position"],
			scoring_data: rows,
		});
		const failed = Array.isArray(answer.failed_race_series_participant_id)
			? answer.failed_race_series_participant_id
			: [];
		if (failed.length > 0) {
			throw new Error(`Standings upload failed for ${name}`);
		}
		uploaded += Number(answer.num_scores_uploaded ?? 0);
		groupNames.push(name);
	}
	return { uploaded, groups: groupNames };
}

// Result-set column layout, exactly like NWANA-FINAL.ps1's Set-ResultColumns:
// the standard "Place" column is hidden (public Detailed Results show
// Performance Level + Level Place instead), everything else is shown.
export async function customizeResultSetColumns(
	source: Series2026Source,
	eventId: number,
	resultSetId: number,
	levelFieldId: number,
	placeFieldId: number,
	accessToken: string,
): Promise<void> {
	const url =
		`https://api.runsignup.com/rest/race/${source.raceId}/results/customize-result-set-columns` +
		`?format=json&event_id=${eventId}&individual_result_set_id=${resultSetId}&request_format=json`;
	const answer = await postRunSignupForm(url, accessToken, {
		columns: [
			{ column_key: "race_placement", column_text: "Place", hidden: "T", hidden_in_individual_results: "T" },
			{ column_key: "bib_num", column_text: "Bib", hidden: "F" },
			{ column_key: "name", column_text: "Name", hidden: "F" },
			{ column_key: `field_${levelFieldId}`, column_text: "Performance Level", hidden: "F", hidden_in_individual_results: "F" },
			{ column_key: `field_${placeFieldId}`, column_text: "Level Place", hidden: "F", hidden_in_individual_results: "F" },
			{ column_key: "clock_time", column_text: "Clock Time", hidden: "F" },
			{ column_key: "avg_pace", column_text: "Pace", hidden: "F" },
			{ column_key: "gender", column_text: "Gender", hidden: "F" },
			{ column_key: "city", column_text: "City", hidden: "F" },
			{ column_key: "state", column_text: "State", hidden: "F" },
			{ column_key: "countrycode", column_text: "Country", hidden: "F" },
			{ column_key: "age", column_text: "Age", hidden: "F" },
		],
	});
	if (answer !== null && typeof answer === "object" && "success" in answer && !answer.success) {
		throw new Error("Column customization failed");
	}
}

// Pure: ids of pre-v4 scoring types among the existing ones — names matching
// the legacy level/gender pattern that are NOT in the wanted list. Mirrors
// NWANA-FINAL.ps1's Remove-LegacyScoringTypes.
export function legacyScoringTypeIds(
	existing: Map<string, number>,
	distance: string,
): number[] {
	const wanted = new Set(allScoringTypeNames(distance));
	return [...existing.entries()]
		.filter(([name]) => LEGACY_SCORING_TYPE_RE.test(name) && !wanted.has(name))
		.map(([, id]) => id)
		.sort((a, b) => a - b);
}

// Deletes pre-v4 scoring types (same level/gender names without the
// "; tie: best time" suffix), exactly like NWANA-FINAL.ps1's
// Remove-LegacyScoringTypes. Unrelated scoring types are never touched.
export async function removeLegacyScoringTypes(
	source: Series2026Source,
	distance: string,
	accessToken: string,
): Promise<{ deleted: number[] }> {
	const existing = await listScoringTypes(source, accessToken);
	const legacyIds = legacyScoringTypeIds(existing, distance);
	if (legacyIds.length === 0) {
		return { deleted: [] };
	}
	const url =
		`https://api.runsignup.com/rest/v2/race-series/delete-non-standard-scoring-types.json` +
		`?race_series_id=${source.raceSeriesId}&race_series_year_id=${source.raceSeriesYearId}`;
	const answer = await postRunSignupForm(url, accessToken, {
		deleted_non_standard_scoring_type_ids: legacyIds,
	});
	if (answer !== null && typeof answer === "object" && "error" in answer) {
		throw new Error("Could not delete legacy scoring types");
	}
	return { deleted: legacyIds };
}

async function logApply(
	db: D1Database,
	input: { distance: string; raceId: number; eventId: number; resultSetId: number | null; resultCount: number },
	status: "COMPLETED" | "FAILED" | "REJECTED",
	steps: ApplyStepResult[],
	error?: string,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO levels_apply_log
				(series, distance, race_id, event_id, result_set_id, result_count, steps_json, status, error)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			RACE_LIFECYCLE_SERIES,
			input.distance,
			input.raceId,
			input.eventId,
			input.resultSetId,
			input.resultCount,
			JSON.stringify(steps),
			status,
			error ?? null,
		)
		.run();
}

// Owner-approved apply. Reads live results, computes levels, executes the
// four writes in order, logs every step. Any failure aborts the remaining
// steps and is recorded; nothing is retried automatically.
export async function applySeries2026Levels(
	input: ApplyLevelsInput,
): Promise<ApplyLevelsResult> {
	const base: ApplyLevelsResult = {
		ok: false,
		distance: input.distance,
		event_id: input.eventId,
		result_set_id: null,
		result_count: 0,
		computed: [],
		steps: [],
	};

	if (input.confirmation !== APPLY_LEVELS_CONFIRMATION) {
		const result = fail(base, "confirm", `Explicit confirmation "${APPLY_LEVELS_CONFIRMATION}" is required.`);
		return result;
	}

	const source = SERIES_2026_SOURCES.find(
		(entry: Series2026Source) => entry.distance === input.distance,
	);
	if (!source) {
		return fail(base, "resolve_source", `Unknown Series 2026 distance: ${input.distance}.`);
	}

	const row = await input.db
		.prepare(
			`SELECT write_access, events_json FROM race_lifecycle WHERE series = ? AND distance = ?`,
		)
		.bind(RACE_LIFECYCLE_SERIES, input.distance)
		.first<{ write_access: string | null; events_json: string | null }>();
	if (!row) {
		const result = fail(base, "load_state", `Run a lifecycle sync for ${input.distance} first.`);
		await logApply(input.db, { distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: null, resultCount: 0 }, "REJECTED", result.steps, result.error);
		return result;
	}
	if (row.write_access !== "CONFIRMED") {
		const result = fail(
			base,
			"check_write_access",
			`RunSignup write access is ${row.write_access ?? "UNKNOWN"}. Run the owner-confirmed write test first; it flips to CONFIRMED only after a real write succeeds.`,
		);
		await logApply(input.db, { distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: null, resultCount: 0 }, "REJECTED", result.steps, result.error);
		return result;
	}
	const events = row.events_json ? (JSON.parse(row.events_json) as LifecycleEventView[]) : [];
	const event = events.find((entry) => entry.event_id === input.eventId);
	if (!event) {
		const result = fail(base, "check_stage", `Event ${input.eventId} is not in the last synced state. Run a lifecycle sync first.`);
		await logApply(input.db, { distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: null, resultCount: 0 }, "REJECTED", result.steps, result.error);
		return result;
	}
	if (event.stage !== "verifying") {
		const result = fail(base, "check_stage", `Event ${input.eventId} is in stage "${event.stage}", not "verifying". Nothing to apply.`);
		await logApply(input.db, { distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: null, resultCount: 0 }, "REJECTED", result.steps, result.error);
		return result;
	}

	const steps: ApplyStepResult[] = [];
	const push = (step: ApplyStepResult) => steps.push(step);

	try {
		const live = await readAndComputeLevels(source, input.eventId, input.accessToken);
		base.result_set_id = live.resultSetId;
		base.result_count = live.computed.length;
		base.computed = live.computed;
		push({
			step: "read_and_compute",
			status: "ok",
			detail: `${live.computed.length} result(s) from set ${live.resultSetId} (${live.resultSetName ?? "unnamed"}); levels computed.`,
		});

		const scoring = await ensureScoringTypes(source, allScoringTypeNames(input.distance), input.accessToken);
		push({
			step: "ensure_scoring_types",
			status: scoring.created.length > 0 ? "ok" : "skipped",
			detail: scoring.created.length > 0
				? `Created: ${scoring.created.join("; ")}.`
				: "All ten scoring types already existed; nothing created.",
		});

		const participantIds = await resolveSeriesParticipants(
			source, input.eventId, live.registrationIds, input.accessToken,
		);
		push({
			step: "resolve_participants",
			status: "ok",
			detail: `${participantIds.length} result(s) mapped to series participants.`,
		});

		const standings = await uploadSeriesStandings(
			source, input.eventId, live.computed, participantIds, scoring.ids, input.accessToken,
		);
		push({
			step: "upload_standings",
			status: "ok",
			detail: `${standings.uploaded} score(s) uploaded across ${standings.groups.length} scoring group(s) (cleared and replaced).`,
		});

		const fields = await ensureLevelCustomFields(
			source, input.eventId, live.resultSetId, live.headers, input.accessToken,
		);
		push({
			step: "ensure_custom_fields",
			status: fields.created.length > 0 ? "ok" : "skipped",
			detail: fields.created.length > 0
				? `Created: ${fields.created.join(", ")}.`
				: "Both fields already existed; nothing created.",
		});

		const rows = buildResultFieldRows(
			live.computed, live.rawRows, live.registrationIds, fields.levelFieldId, fields.placeFieldId,
		);
		await writeResultFields(source, input.eventId, live.resultSetId, rows, input.accessToken);
		push({
			step: "write_result_fields",
			status: "ok",
			detail: `${rows.length} result row(s) updated with Performance Level and Level Place.`,
		});

		await customizeResultSetColumns(
			source, input.eventId, live.resultSetId, fields.levelFieldId, fields.placeFieldId, input.accessToken,
		);
		push({
			step: "set_result_columns",
			status: "ok",
			detail: "Standard Place hidden; Performance Level + Level Place shown.",
		});

		// Legacy parity: NWANA-FINAL.ps1 cleans up pre-v4 scoring type names
		// only when the distance processed without errors. Inside the
		// owner-gated single-event apply, reaching this point means exactly
		// that.
		const cleanup = await removeLegacyScoringTypes(source, input.distance, input.accessToken);
		push({
			step: "cleanup_legacy_scoring_types",
			status: cleanup.deleted.length > 0 ? "ok" : "skipped",
			detail: cleanup.deleted.length > 0
				? `Deleted legacy scoring type ids: ${cleanup.deleted.join(", ")}.`
				: "No legacy scoring types found; nothing deleted.",
		});
	} catch (error) {
		const result = fail(base, "apply", error instanceof Error ? error.message : String(error));
		result.steps = steps.concat(result.steps);
		await logApply(
			input.db,
			{ distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: base.result_set_id, resultCount: base.result_count },
			"FAILED",
			result.steps,
			result.error,
		);
		return result;
	}

	const result: ApplyLevelsResult = { ...base, ok: true, steps };
	await logApply(
		input.db,
		{ distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: base.result_set_id, resultCount: base.result_count },
		"COMPLETED",
		steps,
	);
	return result;
}
