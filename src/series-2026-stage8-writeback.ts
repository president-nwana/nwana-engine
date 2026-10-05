// Stage 8 1K RunSignup write-back (2026-10-05).
// Owner-authorized: writes Performance Level and Level Place to RunSignup
// result rows for Stage 8 (event 1177450). Write access already CONFIRMED.

import { resolveRunSignupAccessToken } from "./runsignup-oauth";

export interface Stage8WritebackResult {
	ok: boolean;
	distance: string;
	event_id: number;
	result_set_id: number;
	written: number;
	lifecycle_stage: string;
	error?: string;
}

export async function writebackStage8ToRunSignup(input: {
	db: D1Database;
	env: unknown;
	distance: string;
	eventId: number;
	resultSetId: number;
}): Promise<Stage8WritebackResult> {
	const { db, env, distance, eventId, resultSetId } = input;
	const base = {
		ok: false,
		distance,
		event_id: eventId,
		result_set_id: resultSetId,
		written: 0,
		lifecycle_stage: "levels_computed",
	};

	// 1. Read computed results from D1.
	const row = await db
		.prepare(
			`SELECT results_json, race_id FROM race_event_results
			 WHERE series = 'SERIES_2026' AND distance = ? AND event_id = ?`,
		)
		.bind(distance, eventId)
		.first<{ results_json: string; race_id: number }>();

	if (!row?.results_json) {
		return { ...base, error: `No D1 results for ${distance} event ${eventId}. Run D1 processing first.` };
	}

	let computed: Array<{
		result_id: string;
		athlete: string;
		performance_level: string;
		level_place: number;
	}>;
	try {
		computed = JSON.parse(row.results_json);
	} catch {
		return { ...base, error: "Malformed results_json in D1." };
	}

	if (computed.length === 0) {
		return { ...base, error: "No results to write back." };
	}

	const raceId = row.race_id;
	const accessToken = await resolveRunSignupAccessToken(
		env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0],
	);

	// 2. Ensure custom fields exist (Performance Level, Level Place).
	// The TEST_WRITE already created "Performance Level". We need "Level Place" too.
	const { postRunSignupForm, runSignupGetJson } = await import("./race-lifecycle");

	// Get existing fields.
	const fieldsUrl = new URL(
		`https://api.runsignup.com/rest/race/${raceId}/results/get-results`,
	);
	fieldsUrl.searchParams.set("format", "json");
	fieldsUrl.searchParams.set("event_id", String(eventId));
	fieldsUrl.searchParams.set("individual_result_set_id", String(resultSetId));
	fieldsUrl.searchParams.set("results_per_page", "1");
	const fieldsData = await runSignupGetJson(fieldsUrl, { accessToken });
	const resultSets = Array.isArray((fieldsData as Record<string, unknown>).individual_results_sets)
		? (fieldsData as Record<string, unknown>).individual_results_sets as Array<Record<string, unknown>>
		: [];
	const headers = (resultSets[0]?.results_headers ?? {}) as Record<string, unknown>;

	let levelFieldId: number | undefined;
	let placeFieldId: number | undefined;
	for (const [key, value] of Object.entries(headers)) {
		const label = typeof value === "string" ? value : (value as Record<string, unknown>)?.column_text;
		if (typeof label === "string") {
			const lower = label.trim().toLowerCase();
			if (lower === "performance level") {
				const match = key.match(/custom_field_(\d+)/);
				if (match) levelFieldId = parseInt(match[1], 10);
			}
			if (lower === "level place") {
				const match = key.match(/custom_field_(\d+)/);
				if (match) placeFieldId = parseInt(match[1], 10);
			}
		}
	}

	// Create missing fields.
	const createUrl =
		`https://api.runsignup.com/rest/race/${raceId}/results/custom-fields` +
		`?format=json&event_id=${eventId}` +
		`&individual_result_set_id=${resultSetId}&request_format=json`;

	if (levelFieldId === undefined) {
		const answer = await postRunSignupForm(createUrl, accessToken, {
			custom_fields: [
				{
					custom_field_id: null,
					custom_field_name: "Performance Level",
					custom_field_short_name: "Performance Level",
					custom_field_data_type: "string",
				},
			],
		});
		const fields = ((answer as Record<string, unknown>).custom_fields ?? []) as Array<{ custom_field_id?: number }>;
		if (typeof fields[0]?.custom_field_id === "number") {
			levelFieldId = fields[0].custom_field_id;
		}
	}

	if (placeFieldId === undefined) {
		const answer = await postRunSignupForm(createUrl, accessToken, {
			custom_fields: [
				{
					custom_field_id: null,
					custom_field_name: "Level Place",
					custom_field_short_name: "Level Place",
					custom_field_data_type: "string",
				},
			],
		});
		const fields = ((answer as Record<string, unknown>).custom_fields ?? []) as Array<{ custom_field_id?: number }>;
		if (typeof fields[0]?.custom_field_id === "number") {
			placeFieldId = fields[0].custom_field_id;
		}
	}

	if (levelFieldId === undefined || placeFieldId === undefined) {
		return { ...base, error: "Failed to ensure custom fields exist." };
	}

	// 3. Write Performance Level and Level Place to each result row.
	const rows = computed.map((c) => ({
		individual_result_id: c.result_id,
		[`custom_field_${levelFieldId}`]: c.performance_level,
		[`custom_field_${placeFieldId}`]: String(c.level_place),
	}));

	const writeUrl =
		`https://api.runsignup.com/rest/race/${raceId}/results/full-results` +
		`?format=json&event_id=${eventId}` +
		`&individual_result_set_id=${resultSetId}&request_format=json`;
	await postRunSignupForm(writeUrl, accessToken, { results: rows });

	// 4. Update lifecycle stage to "published".
	const lifecycleRow = await db
		.prepare(`SELECT events_json FROM race_lifecycle WHERE series = 'SERIES_2026' AND distance = ?`)
		.bind(distance)
		.first<{ events_json: string | null }>();

	let lifecycleStage = "levels_computed";
	if (lifecycleRow?.events_json) {
		try {
			const events = JSON.parse(lifecycleRow.events_json) as Array<{ event_id: number; stage: string }>;
			const ev = events.find((e) => e.event_id === eventId);
			if (ev) {
				ev.stage = "published";
				await db
					.prepare(`UPDATE race_lifecycle SET events_json = ? WHERE series = 'SERIES_2026' AND distance = ?`)
					.bind(JSON.stringify(events), distance)
					.run();
				lifecycleStage = "published";
			}
		} catch {
			// stage update failed, but write-back succeeded
		}
	}

	return {
		ok: true,
		distance,
		event_id: eventId,
		result_set_id: resultSetId,
		written: rows.length,
		lifecycle_stage: lifecycleStage,
	};
}
