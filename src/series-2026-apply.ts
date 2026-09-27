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

function scoringGender(gender: string | null): "Men" | "Women" | null {
	switch (gender?.toUpperCase()) {
		case "M": return "Men";
		case "F": return "Women";
		default: return null;
	}
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

// Step 2 payload builder (pure): full-results edit rows keyed by result_id
// with custom-field-<id> values, per the Post Event Results API contract.
export function buildResultFieldRows(
	computed: ComputedLifecycleResult[],
	rawRows: readonly UnknownRecord[],
	levelFieldId: number,
	placeFieldId: number,
): Array<Record<string, unknown>> {
	return computed.map((row, index) => {
		const resultId = row.result_id ?? text(rawRows[index]?.result_id);
		if (!resultId) {
			throw new Error(`Result row ${index} has no result_id; cannot edit it.`);
		}
		return {
			result_id: resultId,
			[`custom-field-${levelFieldId}`]: row.level_display,
			[`custom-field-${placeFieldId}`]: String(row.level_place),
		};
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

interface ScoringType {
	scoring_type_id: number;
	scoring_type_name: string;
}

// Step 3: reuse existing non-standard scoring types by exact name; create
// only the missing ones. Returns the name -> id map for every needed type.
export async function ensureScoringTypes(
	source: Series2026Source,
	neededNames: readonly string[],
	accessToken: string,
): Promise<{ ids: Map<string, number>; created: string[] }> {
	const listUrl = new URL(
		"https://api.runsignup.com/rest/v2/race-series/non-standard-scoring-types.json",
	);
	listUrl.searchParams.set("format", "json");
	listUrl.searchParams.set("race_series_id", String(source.raceSeriesId));
	listUrl.searchParams.set("race_series_year_id", String(source.raceSeriesYearId));
	const existing = await runSignupGetJson(listUrl, { accessToken });
	const found: ScoringType[] = [];
	for (const value of Object.values(existing)) {
		if (!Array.isArray(value)) continue;
		for (const entry of value) {
			const record = asRecord(entry);
			const id = record ? Number(record.scoring_type_id) : NaN;
			const name = record ? text(record.scoring_type_name) : null;
			if (Number.isInteger(id) && name) found.push({ scoring_type_id: id, scoring_type_name: name });
		}
	}
	const ids = new Map<string, number>();
	const missing = neededNames.filter((name) => {
		const hit = found.find((entry) => entry.scoring_type_name === name);
		if (hit) ids.set(name, hit.scoring_type_id);
		return !hit;
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

// Step 4: resolve race_series_participant_id per result row via the BETA
// lookup, then upload points per scoring type.
export async function uploadSeriesStandings(
	source: Series2026Source,
	eventId: number,
	computed: ComputedLifecycleResult[],
	rawRows: readonly UnknownRecord[],
	scoringTypeIds: Map<string, number>,
	accessToken: string,
): Promise<{ uploaded: number; groups: string[] }> {
	const idColumn = rawRows.every((row) => text(row.registration_id) !== null)
		? "registration_id"
		: rawRows.every((row) => text(row.user_id) !== null)
			? "user_id"
			: null;
	if (!idColumn) {
		throw new Error(
			"Result rows carry neither registration_id nor user_id; cannot map to series participants.",
		);
	}
	const lookupUrl =
		`https://api.runsignup.com/rest/v2/race-series/race-series-participants/lookup.json` +
		`?race_series_id=${source.raceSeriesId}&race_series_year_id=${source.raceSeriesYearId}` +
		`&race_id=${source.raceId}&event_id=${eventId}&matching_type=${idColumn}`;
	const lookup = await postRunSignupForm(lookupUrl, accessToken, {
		columns: [idColumn],
		participants: rawRows.map((row) => [text(row[idColumn])]),
	});
	const matches = Array.isArray(lookup.race_series_participants)
		? lookup.race_series_participants
		: [];
	const participantIds = matches.map((entry) => {
		const record = asRecord(entry);
		const id = record ? Number(record.race_series_participant_id) : NaN;
		return Number.isInteger(id) ? id : null;
	});
	const unmapped = participantIds.filter((id) => id === null).length;
	if (unmapped > 0 || participantIds.length !== computed.length) {
		throw new Error(
			`${unmapped} of ${computed.length} result(s) could not be mapped to a series participant; standings upload aborted.`,
		);
	}

	const groups = new Map<string, Array<{ participantId: number; points: number; position: number }>>();
	computed.forEach((row, index) => {
		const gender = scoringGender(row.gender);
		if (!gender) {
			throw new Error(
				`No scoring type defined for gender "${row.gender ?? "?"}"; standings upload aborted.`,
			);
		}
		const name = scoringTypeName(source.distance, row.level, gender);
		const list = groups.get(name) ?? [];
		list.push({
			participantId: participantIds[index] as number,
			points: row.points,
			position: row.level_place,
		});
		groups.set(name, list);
	});

	let uploaded = 0;
	const groupNames: string[] = [];
	for (const [name, rows] of groups) {
		const scoringTypeId = scoringTypeIds.get(name);
		if (!scoringTypeId) {
			throw new Error(`No scoring type id resolved for "${name}".`);
		}
		const url =
			`https://api.runsignup.com/rest/v2/race-series/race-series-results.json` +
			`?race_series_id=${source.raceSeriesId}&race_series_year_id=${source.raceSeriesYearId}` +
			`&race_id=${source.raceId}&event_id=${eventId}&scoring_type_id=${scoringTypeId}`;
		const answer = await postRunSignupForm(url, accessToken, {
			columns: ["race_series_participant_id", "series_points", "position"],
			scoring_data: rows.map((row) => [row.participantId, row.points, row.position]),
		});
		uploaded += Number(answer.num_scores_uploaded ?? 0);
		groupNames.push(name);
	}
	return { uploaded, groups: groupNames };
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

		const rows = buildResultFieldRows(live.computed, live.rawRows, fields.levelFieldId, fields.placeFieldId);
		await writeResultFields(source, input.eventId, live.resultSetId, rows, input.accessToken);
		push({
			step: "write_result_fields",
			status: "ok",
			detail: `${rows.length} result row(s) updated with Performance Level and Level Place.`,
		});

		const neededNames = [...new Set(live.computed.map((entry) => {
			const gender = scoringGender(entry.gender);
			if (!gender) throw new Error(`No scoring type defined for gender "${entry.gender ?? "?"}".`);
			return scoringTypeName(source.distance, entry.level, gender);
		}))];
		const scoring = await ensureScoringTypes(source, neededNames, input.accessToken);
		push({
			step: "ensure_scoring_types",
			status: scoring.created.length > 0 ? "ok" : "skipped",
			detail: scoring.created.length > 0
				? `Created: ${scoring.created.join("; ")}.`
				: "All needed scoring types already existed; nothing created.",
		});

		const standings = await uploadSeriesStandings(
			source, input.eventId, live.computed, live.rawRows, scoring.ids, input.accessToken,
		);
		push({
			step: "upload_standings",
			status: "ok",
			detail: `${standings.uploaded} score(s) uploaded across ${standings.groups.length} scoring group(s): ${standings.groups.join("; ")}.`,
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
