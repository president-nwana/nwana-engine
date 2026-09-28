// NWANA Engine — Series 2026 owner-approved levels apply path.
//
// The dry-run write plan (buildSeries2026LevelsWritePlan) prepares what the
// legacy NWANA-FINAL.ps1 pipeline did by hand. This module is the Machine's
// own apply path for that plan.
//
// SCOPE (ADR-0041): one owner-confirmed apply rebuilds the whole DISTANCE —
// every event of the distance's race and every result set — exactly like the
// legacy sweep. Standings replacement (clear_previous_results=T) is only ever
// executed inside such a full-scope rebuild; a single-event clear+upload
// without rebuilding the scope is forbidden, because it destroys the other
// events' series standings.
//
// Gates (all fail closed):
// - confirmation must be exactly "APPLY_LEVELS";
// - D1 race_lifecycle.write_access must be "CONFIRMED" for the distance
//   (set only by the TEST_WRITE probe the owner runs once);
// - the trigger event must be in the "verifying" stage in the last synced
//   state. The trigger event selects the distance; the rebuild covers all
//   of the distance's events.
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
// Deliberate full-distance rebuild (e.g. standings restore). Bypasses the
// per-event stage gate but keeps the owner gate, explicit confirmation,
// write-access check and audit log. ADR-0041: clear only inside full rebuild.
export const REBUILD_DISTANCE_CONFIRMATION = "REBUILD_DISTANCE";
// ADR-0042: the Machine's autonomous downstream run passes this instead of
// APPLY_LEVELS. It is accepted ONLY after the auto-processor has verified
// that every submitted result for the event carries a recorded owner
// approval (series_result_approvals). The write-access check, stage gate
// and audit log still apply unchanged. Never auto-approve: the approval
// records are the authorization, and the Machine never creates them.
export const AUTO_APPROVED_CONFIRMATION = "AUTO:OWNER_APPROVED_RESULTS";

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
	// Result ids the owner explicitly disqualified (ADR-0043): excluded
	// from standings (0 points) and written with empty Performance Level /
	// Level Place fields. Absence from this set is not a disqualification.
	disqualifiedResultIds?: string[];
	// Chunked rebuild controls (REBUILD_DISTANCE only). The Free plan caps
	// external subrequests at 50/invocation, so a full distance is rebuilt
	// in chunks; progress is tracked in series_rebuild_progress.
	eventLimit?: number;
	resetRebuild?: boolean;
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
	rebuild?: {
		chunk_events: number[];
		cursor: number;
		remaining: number;
		total_events: number;
		chunk_errors: number;
		total_errors: number;
		complete: boolean;
	};
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

// Legacy parity: the NWANA-FINAL.ps1 sweep reads the race's live event list
// (not a cached copy) and processes every event in order. Bearer-only auth,
// exactly like the legacy script.
export async function listDistanceEvents(
	source: Series2026Source,
	accessToken: string,
): Promise<Array<{ event_id: number; event_name: string | null }>> {
	const raceUrl = new URL(`https://api.runsignup.com/rest/race/${source.raceId}`);
	raceUrl.searchParams.set("format", "json");
	raceUrl.searchParams.set("events", "T");
	const raceData = await runSignupGetJson(raceUrl, { accessToken });
	const race = asRecord(raceData.race);
	const rawEvents = race && Array.isArray(race.events) ? race.events : [];
	const events: Array<{ event_id: number; event_name: string | null }> = [];
	for (const raw of rawEvents) {
		const record = asRecord(raw);
		const eventId = record ? Number(record.event_id) : NaN;
		if (Number.isInteger(eventId)) {
			events.push({ event_id: eventId, event_name: text(record?.event_name) });
		}
	}
	return events;
}

// All result sets of one event, in API order.
export async function listEventResultSets(
	source: Series2026Source,
	eventId: number,
	accessToken: string,
): Promise<Array<{ result_set_id: number; result_set_name: string | null }>> {
	const setsUrl = new URL(
		`https://api.runsignup.com/rest/race/${source.raceId}/results/get-result-sets`,
	);
	setsUrl.searchParams.set("format", "json");
	setsUrl.searchParams.set("event_id", String(eventId));
	const setsData = await runSignupGetJson(setsUrl, { accessToken });
	const sets = Array.isArray(setsData.individual_results_sets)
		? setsData.individual_results_sets
		: [];
	const out: Array<{ result_set_id: number; result_set_name: string | null }> = [];
	for (const entry of sets) {
		const record = asRecord(entry);
		const id = record ? Number(record.individual_result_set_id) : NaN;
		if (Number.isInteger(id)) {
			out.push({ result_set_id: id, result_set_name: text(record?.individual_result_set_name) });
		}
	}
	return out;
}

// Reads one event + result set and computes levels. Pure except for the
// RunSignup read. Throws when the set has no rows (the caller skips it,
// like NWANA-FINAL.ps1) or when registration_ids do not align (hard error,
// like NWANA-FINAL.ps1).
export async function readEventResultSet(
	source: Series2026Source,
	eventId: number,
	resultSetId: number,
	accessToken: string,
): Promise<{
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
	const resultsUrl = new URL(
		`https://api.runsignup.com/rest/race/${source.raceId}/results/get-results`,
	);
	resultsUrl.searchParams.set("format", "json");
	resultsUrl.searchParams.set("event_id", String(eventId));
	resultsUrl.searchParams.set("individual_result_set_id", String(resultSetId));
	resultsUrl.searchParams.set("results_per_page", "1000");
	const resultsData = await runSignupGetJson(resultsUrl, { accessToken });
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
		resultSetName: text(resultSet.individual_result_set_name),
		headers,
		rawRows,
		registrationIds,
		computed,
	};
}

// Reads the verifying event's live results and computes levels. Kept as a
// thin wrapper for the single-set case; the distance rebuild iterates all
// sets via listEventResultSets + readEventResultSet.
export async function readAndComputeLevels(
	source: Series2026Source,
	eventId: number,
	accessToken: string,
): Promise<{
	resultSetId: number;
	resultSetName: string | null;
	headers: UnknownRecord;
	rawRows: UnknownRecord[];
	registrationIds: Array<number | null>;
	computed: ComputedLifecycleResult[];
}> {
	const sets = await listEventResultSets(source, eventId, accessToken);
	const firstSet = sets[0];
	if (!firstSet) {
		throw new Error(`No result set found for event ${eventId}.`);
	}
	const read = await readEventResultSet(source, eventId, firstSet.result_set_id, accessToken);
	const { resultSetName: _ignored, ...rest } = read;
	return {
		resultSetId: firstSet.result_set_id,
		resultSetName: firstSet.result_set_name ?? read.resultSetName,
		...rest,
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
	disqualifiedResultIds?: Set<string>,
): Array<Record<string, unknown>> {
	if (registrationIds.length !== computed.length) {
		throw new Error("registration_ids count does not match results.");
	}
	const dsq = disqualifiedResultIds ?? new Set<string>();
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
		const isDsq = dsq.has(String(resultId));
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
		// Disqualified results (ADR-0043): no Performance Level / Level Place —
		// 0 points, excluded from scoring; the row keeps its time and identity.
		out[`custom-field-${levelFieldId}`] = isDsq ? "" : row.level_display;
		out[`custom-field-${placeFieldId}`] = isDsq ? "" : String(row.level_place);
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

// One (event, result set), exactly the NWANA-FINAL.ps1 inner body: compute
// levels -> resolve participants -> upload standings (all ten groups, per
// event replacement) -> ensure custom fields -> write full result rows ->
// set columns. Throws on any failure; the caller decides per-event handling.
export async function applyEventResultSet(
	source: Series2026Source,
	eventId: number,
	resultSetId: number,
	scoringIds: Map<string, number>,
	accessToken: string,
	push: (step: ApplyStepResult) => void,
	disqualifiedResultIds?: Set<string>,
): Promise<{ computed: ComputedLifecycleResult[]; resultCount: number }> {
	const live = await readEventResultSet(source, eventId, resultSetId, accessToken);
	push({
		step: "read_and_compute",
		status: "ok",
		detail: `${live.computed.length} result(s) from set ${resultSetId} (event ${eventId}); levels computed.`,
	});

	// Disqualified results (ADR-0043): excluded from scoring entirely —
	// no standings upload (0 points), no participant resolution needed.
	const dsq = disqualifiedResultIds ?? new Set<string>();
	const validIndexes = live.computed
		.map((row, index) => ({ row, index }))
		.filter(({ row }) => !dsq.has(String(row.result_id ?? "")))
		.map(({ index }) => index);
	const validComputed = validIndexes.map((i) => live.computed[i]);
	const validRegistrationIds = validIndexes.map((i) => live.registrationIds[i]);
	const dsqCount = live.computed.length - validComputed.length;

	const participantIds = await resolveSeriesParticipants(
		source, eventId, validRegistrationIds, accessToken,
	);
	push({
		step: "resolve_participants",
		status: "ok",
		detail: `${participantIds.length} result(s) mapped to series participants (event ${eventId})${dsqCount > 0 ? `; ${dsqCount} disqualified result(s) excluded from scoring` : ""}.`,
	});

	const standings = await uploadSeriesStandings(
		source, eventId, validComputed, participantIds, scoringIds, accessToken,
	);
	push({
		step: "upload_standings",
		status: "ok",
		detail: `${standings.uploaded} score(s) uploaded across ${standings.groups.length} scoring group(s) for event ${eventId} (cleared and replaced).`,
	});

	const fields = await ensureLevelCustomFields(
		source, eventId, resultSetId, live.headers, accessToken,
	);
	push({
		step: "ensure_custom_fields",
		status: fields.created.length > 0 ? "ok" : "skipped",
		detail: fields.created.length > 0
			? `Created: ${fields.created.join(", ")}.`
			: `Both fields already existed on set ${resultSetId}; nothing created.`,
	});

	// DSQ rows without a registration_id cannot be written back to RunSignup
	// (no mapping exists); they are already excluded from scoring above, so
	// there is nothing to write for them. Non-DSQ rows keep the legacy
	// strict behavior: a missing registration_id aborts the event.
	const fieldWriteIndexes = live.computed
		.map((_, i) => i)
		.filter((i) => {
			const id = String(live.computed[i].result_id ?? "");
			if (!dsq.has(id)) return true;
			return live.registrationIds[i] !== null;
		});
	const rows = buildResultFieldRows(
		fieldWriteIndexes.map((i) => live.computed[i]),
		fieldWriteIndexes.map((i) => live.rawRows[i]),
		fieldWriteIndexes.map((i) => live.registrationIds[i]),
		fields.levelFieldId, fields.placeFieldId, dsq,
	);
	await writeResultFields(source, eventId, resultSetId, rows, accessToken);
	push({
		step: "write_result_fields",
		status: "ok",
		detail: `${rows.length} result row(s) updated with Performance Level and Level Place (event ${eventId}, set ${resultSetId}).`,
	});

	await customizeResultSetColumns(
		source, eventId, resultSetId, fields.levelFieldId, fields.placeFieldId, accessToken,
	);
	push({
		step: "set_result_columns",
		status: "ok",
		detail: `Standard Place hidden; Performance Level + Level Place shown (event ${eventId}, set ${resultSetId}).`,
	});

	return { computed: live.computed, resultCount: live.computed.length };
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
	status: "COMPLETED" | "FAILED" | "REJECTED" | "CHUNK_COMPLETED",
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

	const isRebuild = input.confirmation === REBUILD_DISTANCE_CONFIRMATION;
	const isAutoApproved = input.confirmation === AUTO_APPROVED_CONFIRMATION;
	if (input.confirmation !== APPLY_LEVELS_CONFIRMATION && !isRebuild && !isAutoApproved) {
		const result = fail(base, "confirm", `Explicit confirmation "${APPLY_LEVELS_CONFIRMATION}" or "${REBUILD_DISTANCE_CONFIRMATION}" is required.`);
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
	const steps: ApplyStepResult[] = [];
	const push = (step: ApplyStepResult) => steps.push(step);
	if (!event) {
		const result = fail(base, "check_stage", `Event ${input.eventId} is not in the last synced state. Run a lifecycle sync first.`);
		await logApply(input.db, { distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: null, resultCount: 0 }, "REJECTED", result.steps, result.error);
		return result;
	}
	if (event.stage !== "verifying" && !isRebuild) {
		const result = fail(base, "check_stage", `Event ${input.eventId} is in stage "${event.stage}", not "verifying". Nothing to apply.`);
		await logApply(input.db, { distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: null, resultCount: 0 }, "REJECTED", result.steps, result.error);
		return result;
	}

	if (isRebuild) {
		push({
			step: "rebuild_mode",
			status: "ok",
			detail: `Full-distance rebuild requested by owner; stage gate bypassed (event ${input.eventId} is "${event.stage}").`,
		});
	}

	// Distance-scoped rebuild (ADR-0041): like NWANA-FINAL.ps1, one apply
	// processes EVERY event of the distance's race and every result set.
	// Standings replacement (clear_previous_results=T) is only ever executed
	// inside this full-scope rebuild, so no event's series standings can be
	// orphaned. Per-event failures are collected (legacy: $errors++ and
	// continue); legacy cleanup runs only when the whole distance is clean.
	// Disqualifications (ADR-0043) are per event; the full-distance rebuild
	// must respect every event's decisions, not just the trigger event's.
	const dsqRows = await input.db
		.prepare(
			`SELECT event_id AS eventId, result_id AS resultId
			 FROM series_result_disqualifications
			 WHERE series = 'SERIES_2026' AND distance = ?`,
		)
		.bind(input.distance)
		.all<{ eventId: number; resultId: string }>();
	const dsqByEvent = new Map<number, Set<string>>();
	for (const row of dsqRows.results ?? []) {
		let set = dsqByEvent.get(row.eventId);
		if (!set) { set = new Set<string>(); dsqByEvent.set(row.eventId, set); }
		set.add(String(row.resultId));
	}
	for (const id of input.disqualifiedResultIds ?? []) {
		let set = dsqByEvent.get(input.eventId);
		if (!set) { set = new Set<string>(); dsqByEvent.set(input.eventId, set); }
		set.add(String(id));
	}

	let eventErrors = 0;

	try {
		const scoring = await ensureScoringTypes(source, allScoringTypeNames(input.distance), input.accessToken);
		push({
			step: "ensure_scoring_types",
			status: scoring.created.length > 0 ? "ok" : "skipped",
			detail: scoring.created.length > 0
				? `Created: ${scoring.created.join("; ")}.`
				: "All ten scoring types already existed; nothing created.",
		});

		const distanceEvents = await listDistanceEvents(source, input.accessToken);
		push({
			step: "enumerate_events",
			status: "ok",
			detail: `${distanceEvents.length} event(s) in ${input.distance} race ${source.raceId}; rebuilding all.`,
		});

		// Chunked sweep: the Free plan caps external subrequests at
		// 50/invocation (measured 2026-09-27), so a distance with more than
		// ~3 events is rebuilt across several calls. Progress (cursor +
		// cumulative errors) lives in D1; the legacy cleanup runs only after
		// the final chunk of a fully clean rebuild.
		const CHUNK_LIMIT = Math.max(
			1,
			Math.min(3, Math.trunc(input.eventLimit ?? 2)),
		);
		let cursor = 0;
		let priorErrors = 0;
		if (input.resetRebuild !== true) {
			const progress = await input.db
				.prepare(
					`SELECT cursor, errors, status FROM series_rebuild_progress WHERE series = ? AND distance = ?`,
				)
				.bind(RACE_LIFECYCLE_SERIES, input.distance)
				.first<{ cursor: number; errors: number; status: string }>();
			if (progress && progress.status === "IN_PROGRESS") {
				cursor = Math.max(0, Math.trunc(progress.cursor));
				priorErrors = Math.max(0, Math.trunc(progress.errors));
			}
		}
		if (cursor >= distanceEvents.length) {
			cursor = 0;
			priorErrors = 0;
		}
		const chunk = distanceEvents.slice(cursor, cursor + CHUNK_LIMIT);
		const chunkEventIds = chunk.map((entry) => entry.event_id);
		push({
			step: "rebuild_chunk",
			status: "ok",
			detail: `Chunk: event(s) ${chunkEventIds.join(", ") || "none"} (cursor ${cursor}/${distanceEvents.length}, limit ${CHUNK_LIMIT}).`,
		});

		for (const distanceEvent of chunk) {
			const eventId = distanceEvent.event_id;
			let sets: Array<{ result_set_id: number; result_set_name: string | null }>;
			try {
				sets = await listEventResultSets(source, eventId, input.accessToken);
			} catch (error) {
				eventErrors++;
				push({
					step: "event_error",
					status: "failed",
					detail: `Event ${eventId}: cannot list result sets — ${error instanceof Error ? error.message : String(error)}. Continuing with other events.`,
				});
				continue;
			}
			for (const set of sets) {
				try {
					const applied = await applyEventResultSet(
						source, eventId, set.result_set_id, scoring.ids, input.accessToken, push,
						dsqByEvent.get(eventId),
					);
					if (eventId === input.eventId) {
						base.result_set_id = set.result_set_id;
						base.result_count = applied.resultCount;
						base.computed = applied.computed;
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					// Legacy parity: an empty result set is skipped silently;
					// anything else is a per-event error, and the sweep
					// continues with the remaining events.
					if (/has no result rows to classify/.test(message)) {
						push({
							step: "skip_empty_set",
							status: "skipped",
							detail: `Event ${eventId}, set ${set.result_set_id}: no result rows; skipped.`,
						});
						continue;
					}
					eventErrors++;
					push({
						step: "event_error",
						status: "failed",
						detail: `Event ${eventId}, set ${set.result_set_id}: ${message}. Continuing with other events.`,
					});
				}
			}
		}

		const totalErrors = priorErrors + eventErrors;
		const nextCursor = cursor + chunk.length;
		const remaining = Math.max(0, distanceEvents.length - nextCursor);
		const isFinalChunk = remaining === 0;

		// Legacy parity: NWANA-FINAL.ps1 cleans up pre-v4 scoring type names
		// only when the distance processed without errors. The cleanup is
		// safe here because the sweep rebuilt the full history into the
		// current types first. In chunked mode it runs only after the FINAL
		// chunk of a fully clean rebuild.
		let cleanupDetail = "";
		if (isFinalChunk && totalErrors === 0) {
			const cleanup = await removeLegacyScoringTypes(source, input.distance, input.accessToken);
			cleanupDetail = cleanup.deleted.length > 0
				? `Deleted legacy scoring type ids: ${cleanup.deleted.join(", ")}.`
				: "No legacy scoring types found; nothing deleted.";
			push({
				step: "cleanup_legacy_scoring_types",
				status: cleanup.deleted.length > 0 ? "ok" : "skipped",
				detail: cleanupDetail,
			});
		} else {
			push({
				step: "cleanup_legacy_scoring_types",
				status: "skipped",
				detail: isFinalChunk
					? `${totalErrors} event error(s) across all chunks; legacy cleanup skipped until the distance rebuilds clean.`
					: `Not the final chunk (${remaining} event(s) remaining); cleanup deferred.`,
			});
		}

		await input.db
			.prepare(
				`INSERT INTO series_rebuild_progress (series, distance, cursor, errors, status, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT (series, distance) DO UPDATE SET
				   cursor = excluded.cursor,
				   errors = excluded.errors,
				   status = excluded.status,
				   updated_at = excluded.updated_at`,
			)
			.bind(
				RACE_LIFECYCLE_SERIES,
				input.distance,
				nextCursor,
				totalErrors,
				isFinalChunk ? (totalErrors === 0 ? "COMPLETE" : "FAILED") : "IN_PROGRESS",
				new Date().toISOString(),
			)
			.run();
		push({
			step: "rebuild_progress",
			status: "ok",
			detail: `Progress saved: cursor ${nextCursor}/${distanceEvents.length}, ${remaining} remaining, ${totalErrors} total error(s).`,
		});

		base.rebuild = {
			chunk_events: chunkEventIds,
			cursor: nextCursor,
			remaining,
			total_events: distanceEvents.length,
			chunk_errors: eventErrors,
			total_errors: totalErrors,
			complete: isFinalChunk,
		};
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

	const rebuild = base.rebuild;
	const result: ApplyLevelsResult = { ...base, ok: true, steps };
	if (rebuild && rebuild.complete && rebuild.total_errors > 0) {
		// Fail closed: the sweep continued past per-event errors (legacy:
		// $errors++ and continue), but the apply as a whole is FAILED so the
		// owner sees exactly which events need attention. Events that
		// succeeded keep their rebuilt state; nothing is half-hidden.
		const failed = fail(
			result,
			"distance_rebuild",
			`${rebuild.total_errors} event(s) failed during the ${input.distance} rebuild; see event_error steps. Successful events were rebuilt; rerun with reset to retry the failures.`,
		);
		await logApply(
			input.db,
			{ distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: base.result_set_id, resultCount: base.result_count },
			"FAILED",
			failed.steps,
			failed.error,
		);
		return failed;
	}
	await logApply(
		input.db,
		{ distance: input.distance, raceId: source.raceId, eventId: input.eventId, resultSetId: base.result_set_id, resultCount: base.result_count },
		rebuild && !rebuild.complete ? "CHUNK_COMPLETED" : "COMPLETED",
		steps,
	);
	return result;
}
