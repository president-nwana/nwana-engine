// Chunked distance rebuild (Free-plan 50-subrequest cap, ADR-0041).
// Three 3K events, event_limit=1 -> three chunks. Proves:
//   1. each chunk returns ok with rebuild.remaining decreasing,
//   2. legacy scoring types survive until the FINAL chunk,
//   3. the final clean chunk deletes legacy types and marks COMPLETE,
//   4. resume works from a persisted IN_PROGRESS cursor,
//   5. a final chunk with errors fails closed and skips cleanup.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	REBUILD_DISTANCE_CONFIRMATION,
	applySeries2026Levels,
	scoringTypeName,
} from "../src/series-2026-apply";

afterEach(() => {
	vi.unstubAllGlobals();
});

type Row = Record<string, unknown>;

// In-memory D1 fake: serves the lifecycle row and emulates the
// series_rebuild_progress table (upsert + select).
function makeDb() {
	const progress = new Map<string, Row>();
	const inserts: Row[] = [];
	const lifecycleRow: Row = {
		write_access: "CONFIRMED",
		// Trigger event is NOT in "verifying": REBUILD_DISTANCE must bypass
		// the stage gate.
		events_json: JSON.stringify([{ event_id: 1177636, stage: "levels_computed" }]),
	};
	const db = {
		prepare(sql: string) {
			return {
				bind(...args: unknown[]) {
					return {
						async first() {
							if (sql.includes("series_rebuild_progress")) {
								const key = `${args[0]}:${args[1]}`;
								return progress.get(key) ?? null;
							}
							return lifecycleRow;
						},
						async run() {
							if (sql.includes("series_rebuild_progress")) {
								const key = `${args[0]}:${args[1]}`;
								progress.set(key, {
									cursor: args[2],
									errors: args[3],
									status: args[4],
								});
							}
							inserts.push({ sql, args });
							return { success: true };
						},
					};
				},
			};
		},
	};
	return { db: db as unknown as D1Database, inserts, progress };
}

interface FakeResultRow {
	result_id: number;
	first_name: string;
	last_name: string;
	gender: string;
	chip_time: string | null;
	clock_time: string;
}

const E1 = 1178567;
const E2 = 1178568;
const E3 = 1177636;

const EVENT_ROWS: Record<number, { setId: number; rows: FakeResultRow[]; registrationIds: number[] }> = {
	[E1]: {
		setId: 664100,
		rows: [
			{ result_id: 232400001, first_name: "ALBERT", last_name: "FATIKHOV", gender: "M", chip_time: null, clock_time: "19:30" },
		],
		registrationIds: [9001],
	},
	[E2]: {
		setId: 664101,
		rows: [
			{ result_id: 232400002, first_name: "ALBERT", last_name: "FATIKHOV", gender: "M", chip_time: null, clock_time: "19:10" },
		],
		registrationIds: [9001],
	},
	[E3]: {
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
	failEventSetsFor: Set<number>;
}

function makeState(): FakeState {
	const eliteMenV4 = scoringTypeName("3K", "Elite", "Men");
	return {
		types: new Map<string, number>([
			[eliteMenV4, 901],
			["Elite Men (< 20:00)", 501],
		]),
		nextTypeId: 1000,
		participants: new Map([[9001, 109001]]),
		standings: new Map([[501, new Map([[E1, [[109001, 1000, 1]]]])]]),
		fields: new Map(),
		failEventSetsFor: new Set(),
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
						{ event_id: E2, event_name: "2026-09-19" },
						{ event_id: E3, event_name: "2026-09-26" },
					],
				},
			});
		}
		if (method === "GET" && path.endsWith("/results/get-result-sets")) {
			const eventId = Number(params.get("event_id"));
			if (state.failEventSetsFor.has(eventId)) {
				throw new Error("Too many subrequests by single Worker invocation");
			}
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

function callRebuild(db: D1Database, extra: Record<string, unknown> = {}) {
	return applySeries2026Levels({
		db,
		accessToken: "token",
		distance: "3K",
		eventId: E3,
		confirmation: REBUILD_DISTANCE_CONFIRMATION,
		eventLimit: 1,
		...extra,
	});
}

describe("chunked distance rebuild", () => {
	it("processes one event per chunk, defers cleanup to the final clean chunk", async () => {
		const state = makeState();
		vi.stubGlobal("fetch", makeFakeFetch(state));
		const { db } = makeDb();
		const eliteMen = scoringTypeName("3K", "Elite", "Men");

		const c1 = await callRebuild(db);
		expect(c1.ok).toBe(true);
		expect(c1.rebuild).toMatchObject({
			chunk_events: [E1],
			cursor: 1,
			remaining: 2,
			total_events: 3,
			chunk_errors: 0,
			total_errors: 0,
			complete: false,
		});
		// Legacy type survives the non-final chunk.
		expect(state.types.has("Elite Men (< 20:00)")).toBe(true);

		const c2 = await callRebuild(db);
		expect(c2.ok).toBe(true);
		expect(c2.rebuild).toMatchObject({
			chunk_events: [E2],
			cursor: 2,
			remaining: 1,
			complete: false,
		});
		expect(state.types.has("Elite Men (< 20:00)")).toBe(true);

		const c3 = await callRebuild(db);
		expect(c3.ok).toBe(true);
		expect(c3.rebuild).toMatchObject({
			chunk_events: [E3],
			cursor: 3,
			remaining: 0,
			complete: true,
		});
		// Final clean chunk: legacy type deleted, full history rebuilt.
		expect(state.types.has("Elite Men (< 20:00)")).toBe(false);
		expect(seriesTotal(state, eliteMen, 109001)).toBe(3000);
	});

	it("resumes from a persisted IN_PROGRESS cursor", async () => {
		const state = makeState();
		vi.stubGlobal("fetch", makeFakeFetch(state));
		const { db, progress } = makeDb();
		// Simulate a crashed first chunk: E1 done, cursor at 1.
		progress.set("SERIES_2026:3K", { cursor: 1, errors: 0, status: "IN_PROGRESS" });

		const resumed = await callRebuild(db);
		expect(resumed.ok).toBe(true);
		expect(resumed.rebuild).toMatchObject({ chunk_events: [E2], cursor: 2, remaining: 1 });
	});

	it("fails closed on the final chunk when any chunk had errors; cleanup skipped", async () => {
		const state = makeState();
		state.failEventSetsFor.add(E2);
		vi.stubGlobal("fetch", makeFakeFetch(state));
		const { db } = makeDb();

		const c1 = await callRebuild(db);
		expect(c1.ok).toBe(true);
		expect(c1.rebuild).toMatchObject({ complete: false, chunk_errors: 0 });

		const c2 = await callRebuild(db);
		expect(c2.ok).toBe(true); // intermediate chunk: errors recorded, sweep continues
		expect(c2.rebuild).toMatchObject({ complete: false, chunk_errors: 1, total_errors: 1 });

		const c3 = await callRebuild(db);
		expect(c3.ok).toBe(false); // final chunk with errors -> FAILED
		expect(c3.rebuild).toMatchObject({ complete: true, total_errors: 1 });
		// Cleanup skipped: the failed event's history was not rebuilt.
		expect(state.types.has("Elite Men (< 20:00)")).toBe(true);
		expect(c3.error).toMatch(/1 event\(s\) failed/);
	});

	it("reset restarts a stale or failed rebuild from zero", async () => {
		const state = makeState();
		vi.stubGlobal("fetch", makeFakeFetch(state));
		const { db, progress } = makeDb();
		progress.set("SERIES_2026:3K", { cursor: 3, errors: 2, status: "FAILED" });

		const restarted = await callRebuild(db, { resetRebuild: true });
		expect(restarted.ok).toBe(true);
		expect(restarted.rebuild).toMatchObject({ chunk_events: [E1], cursor: 1, total_errors: 0 });
	});
});
