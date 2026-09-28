// Regression test for the Series 2026 distance-scoped standings rebuild
// (ADR-0041). Simulates a fake RunSignup API with two 3K events:
//   - event 1178567 (2026-09-12): Albert 19:30 (Elite, M), Jane Doe 21:30 (Performance, F)
//   - event 1177636 (2026-09-26, the trigger): Albert 18:54 with blank chip_time
//     (the real 2026-09-27 regression case)
// Legacy pre-v4 scoring types hold the old 2026-09-12 standings. The test
// proves the rebuild:
//   1. preserves the old event's standings (rebuilt into the v4 types),
//   2. adds the new event's standings,
//   3. produces cumulative series totals matching legacy math,
//   4. deletes legacy scoring types only after a clean sweep,
//   5. is idempotent: a second identical run changes nothing.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	APPLY_LEVELS_CONFIRMATION,
	applySeries2026Levels,
	scoringTypeName,
} from "../src/series-2026-apply";

afterEach(() => {
	vi.unstubAllGlobals();
});

type Row = Record<string, unknown>;

function makeDb(lifecycleRow: Row | null) {
	const inserts: Row[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...args: unknown[]) {
					return {
						async first() {
							return lifecycleRow;
						},
						async all() {
							// series_result_disqualifications: no DSQ rows in these fixtures.
							return { results: [] };
						},
						async run() {
							inserts.push({ sql, args });
							return { success: true };
						},
					};
				},
			};
		},
	};
	return { db: db as unknown as D1Database, inserts };
}

const verifyingRow: Row = {
	write_access: "CONFIRMED",
	events_json: JSON.stringify([{ event_id: 1177636, stage: "verifying" }]),
};

interface FakeResultRow {
	result_id: number;
	first_name: string;
	last_name: string;
	gender: string;
	chip_time: string | null;
	clock_time: string;
}

const E1 = 1178567;
const E2 = 1177636;

const EVENT_ROWS: Record<number, { setId: number; rows: FakeResultRow[]; registrationIds: number[] }> = {
	[E1]: {
		setId: 664100,
		rows: [
			{ result_id: 232400001, first_name: "ALBERT", last_name: "FATIKHOV", gender: "M", chip_time: null, clock_time: "19:30" },
			{ result_id: 232400002, first_name: "JANE", last_name: "DOE", gender: "F", chip_time: null, clock_time: "21:30" },
		],
		registrationIds: [9001, 9002],
	},
	[E2]: {
		setId: 664979,
		rows: [
			{ result_id: 232501676, first_name: "ALBERT", last_name: "FATIKHOV", gender: "M", chip_time: "", clock_time: "18:54" },
		],
		registrationIds: [9001],
	},
};

interface FakeState {
	types: Map<string, number>;
	nextTypeId: number;
	participants: Map<number, number>;
	standings: Map<number, Map<number, Array<[number, number, number]>>>;
	fields: Map<string, { levelId: number; placeId: number }>;
	uploads: Array<{ typeId: number; eventId: number }>;
}

function makeState(): FakeState {
	const eliteMenV4 = scoringTypeName("3K", "Elite", "Men");
	const types = new Map<string, number>([
		[eliteMenV4, 901],
		["Elite Men (< 20:00)", 501],
		["Performance Women (< 22:00)", 502],
	]);
	// Legacy pre-v4 types hold the old 2026-09-12 standings (registration
	// 9001 -> participant 109001, 9002 -> 109002 in the fake's mapping).
	const standings = new Map<number, Map<number, Array<[number, number, number]>>>([
		[501, new Map([[E1, [[109001, 1000, 1]]]])],
		[502, new Map([[E1, [[109002, 1000, 1]]]])],
	]);
	return {
		types,
		nextTypeId: 1000,
		participants: new Map([[9001, 109001], [9002, 109002]]),
		standings,
		fields: new Map(),
		uploads: [],
	};
}

function makeFakeFetch(state: FakeState) {
	const json = (data: unknown, status = 200) =>
		new Response(JSON.stringify(data), {
			status,
			headers: { "content-type": "application/json" },
		});
	const formBody = (init: RequestInit | undefined): Record<string, unknown> => {
		const form = init?.body as FormData | undefined;
		const raw = form?.get("request");
		return raw ? (JSON.parse(String(raw)) as Record<string, unknown>) : {};
	};

	return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = new URL(
			typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
		);
		const method = (init?.method ?? "GET").toUpperCase();
		const path = url.pathname;
		const params = url.searchParams;

		if (method === "GET" && /^\/rest\/race\/\d+$/.test(path)) {
			return json({
				race: {
					race_id: 210000,
					events: [
						{ event_id: E1, event_name: "2026-09-12" },
						{ event_id: E2, event_name: "2026-09-26" },
					],
				},
			});
		}
		if (method === "GET" && path.endsWith("/results/get-result-sets")) {
			const eventId = Number(params.get("event_id"));
			const payload = EVENT_ROWS[eventId];
			return json({
				individual_results_sets: payload
					? [{ individual_result_set_id: payload.setId, individual_result_set_name: "Overall Results" }]
					: [],
			});
		}
		if (method === "GET" && path.endsWith("/results/get-results")) {
			const eventId = Number(params.get("event_id"));
			const setId = Number(params.get("individual_result_set_id"));
			const payload = EVENT_ROWS[eventId];
			if (!payload || payload.setId !== setId) {
				return json({ individual_results_sets: [] });
			}
			const headers: Record<string, unknown> = { result_id: "Result ID" };
			const fieldIds = state.fields.get(`${eventId}:${setId}`);
			if (fieldIds) {
				headers[`custom-field-${fieldIds.levelId}`] = "Performance Level";
				headers[`custom-field-${fieldIds.placeId}`] = "Level Place";
			}
			return json({
				individual_results_sets: [
					{
						individual_result_set_id: setId,
						individual_result_set_name: "Overall Results",
						results_headers: headers,
						results: payload.rows,
						registration_ids: payload.registrationIds,
					},
				],
			});
		}
		if (method === "GET" && path.endsWith("/non-standard-scoring-types.json")) {
			return json({
				non_standard_scoring_types: [...state.types.entries()].map(([name, id]) => ({
					scoring_type_id: id,
					scoring_type_name: name,
				})),
			});
		}
		if (method === "POST" && path.endsWith("/non-standard-scoring-types.json")) {
			const body = formBody(init);
			const requested = Array.isArray(body.non_standard_scoring_types)
				? body.non_standard_scoring_types
				: [];
			const added: unknown[] = [];
			for (const entry of requested) {
				const name = String((entry as Row).scoring_type_name ?? "");
				if (name && !state.types.has(name)) {
					const id = state.nextTypeId++;
					state.types.set(name, id);
					added.push({ scoring_type_id: id, scoring_type_name: name });
				}
			}
			return json({ added_non_standard_scoring_types: added });
		}
		if (method === "POST" && path.endsWith("/add/registration-id.json")) {
			const body = formBody(init);
			const participants = Array.isArray(body.participants) ? body.participants : [];
			const rows = participants.map((pair, index) => {
				const registrationId = Number((pair as unknown[])[0]);
				if (!state.participants.has(registrationId)) {
					state.participants.set(registrationId, 100000 + registrationId);
				}
				return {
					row: index + 1,
					race_series_participant_id: state.participants.get(registrationId),
				};
			});
			return json({ race_series_participants: rows });
		}
		if (method === "POST" && path.endsWith("/race-series-results.json")) {
			const body = formBody(init);
			const typeId = Number(params.get("scoring_type_id"));
			const eventId = Number(params.get("event_id"));
			state.uploads.push({ typeId, eventId });
			if (!state.standings.has(typeId)) {
				state.standings.set(typeId, new Map());
			}
			const data = Array.isArray(body.scoring_data) ? body.scoring_data : [];
			state.standings
				.get(typeId)!
				.set(
					eventId,
					data.map((row) => {
						const cells = row as unknown[];
						return [Number(cells[0]), Number(cells[1]), Number(cells[2])] as [number, number, number];
					}),
				);
			return json({ num_scores_uploaded: data.length });
		}
		if (method === "POST" && path.endsWith("/results/custom-fields")) {
			const eventId = Number(params.get("event_id"));
			const setId = Number(params.get("individual_result_set_id"));
			const levelId = 654100 + setId;
			const placeId = 654200 + setId;
			state.fields.set(`${eventId}:${setId}`, { levelId, placeId });
			return json({ custom_fields: [{ custom_field_id: levelId }, { custom_field_id: placeId }] });
		}
		if (method === "POST" && path.endsWith("/results/full-results")) {
			return json({});
		}
		if (method === "POST" && path.endsWith("/results/customize-result-set-columns")) {
			return json({ success: true });
		}
		if (method === "POST" && path.endsWith("/delete-non-standard-scoring-types.json")) {
			const body = formBody(init);
			const ids = Array.isArray(body.deleted_non_standard_scoring_type_ids)
				? body.deleted_non_standard_scoring_type_ids.map(Number)
				: [];
			for (const id of ids) {
				for (const [name, typeId] of [...state.types]) {
					if (typeId === id) state.types.delete(name);
				}
				state.standings.delete(id);
			}
			return json({});
		}
		throw new Error(`unmocked RunSignup call: ${method} ${path}`);
	};
}

// Cumulative series total for one scoring type + participant, the way
// RunSignup's native series standings accumulate per-event uploads.
function seriesTotal(state: FakeState, typeName: string, participantId: number): number {
	const typeId = state.types.get(typeName);
	if (!typeId) return 0;
	let total = 0;
	for (const rows of state.standings.get(typeId)?.values() ?? []) {
		for (const [pid, points] of rows) {
			if (pid === participantId) total += points;
		}
	}
	return total;
}

function perEvent(state: FakeState, typeName: string): Map<number, Array<[number, number, number]>> {
	const typeId = state.types.get(typeName)!;
	return new Map(state.standings.get(typeId) ?? []);
}

describe("series 2026 distance-scoped standings rebuild", () => {
	it("rebuilds the whole distance: old standings preserved, new event added, totals match legacy math", async () => {
		const state = makeState();
		vi.stubGlobal("fetch", makeFakeFetch(state));
		const { db } = makeDb(verifyingRow);

		const result = await applySeries2026Levels({
			db,
			accessToken: "token",
			distance: "3K",
			eventId: E2,
			confirmation: APPLY_LEVELS_CONFIRMATION,
		});

		expect(result.ok).toBe(true);
		expect(result.computed).toHaveLength(1);
		expect(result.computed?.[0]).toMatchObject({
			athlete: "ALBERT FATIKHOV",
			level_display: "Elite (< 20:00)",
			level_place: 1,
			points: 1000,
		});

		const eliteMen = scoringTypeName("3K", "Elite", "Men");
		const perfWomen = scoringTypeName("3K", "Performance", "Women");

		// Old event's standings rebuilt into the v4 types (not orphaned).
		const elitePerEvent = perEvent(state, eliteMen);
		expect(elitePerEvent.get(E1)).toEqual([[109001, 1000, 1]]);
		expect(elitePerEvent.get(E2)).toEqual([[109001, 1000, 1]]);
		// New event added; legacy cumulative total = 1000 (old) + 1000 (new).
		expect(seriesTotal(state, eliteMen, 109001)).toBe(2000);

		const perfPerEvent = perEvent(state, perfWomen);
		expect(perfPerEvent.get(E1)).toEqual([[109002, 1000, 1]]);
		expect(perfPerEvent.get(E2)).toEqual([]);
		expect(seriesTotal(state, perfWomen, 109002)).toBe(1000);

		// Every (event, scoring group) was re-uploaded: 2 events x 10 groups.
		expect(state.uploads).toHaveLength(20);
		expect(new Set(state.uploads.map((u) => u.eventId))).toEqual(new Set([E1, E2]));

		// Legacy pre-v4 types cleaned only after the clean sweep.
		expect(state.types.has("Elite Men (< 20:00)")).toBe(false);
		expect(state.types.has("Performance Women (< 22:00)")).toBe(false);
	});

	it("is idempotent: a second identical run changes nothing", async () => {
		const state = makeState();
		vi.stubGlobal("fetch", makeFakeFetch(state));
		const { db } = makeDb(verifyingRow);

		const input = {
			db,
			accessToken: "token",
			distance: "3K",
			eventId: E2,
			confirmation: APPLY_LEVELS_CONFIRMATION,
		} as const;

		const first = await applySeries2026Levels(input);
		expect(first.ok).toBe(true);
		const afterFirst = JSON.stringify({
			types: [...state.types.entries()].sort(),
			standings: [...state.standings.entries()].map(([id, events]) => [
				id,
				[...events.entries()].sort((a, b) => a[0] - b[0]),
			]),
		});

		const second = await applySeries2026Levels(input);
		expect(second.ok).toBe(true);
		const afterSecond = JSON.stringify({
			types: [...state.types.entries()].sort(),
			standings: [...state.standings.entries()].map(([id, events]) => [
				id,
				[...events.entries()].sort((a, b) => a[0] - b[0]),
			]),
		});
		expect(afterSecond).toBe(afterFirst);
		expect(second.computed).toEqual(first.computed);
	});
});
