// End-to-end regression for the Series 2026 automatic result pipeline
// (Defects 1-3, fixed 2026-10-07). One female 10K result, owner-approved,
// runs the FULL autoProcessEvent chain with mocked RunSignup + Meta APIs:
//
//   owner approve -> Performance Level assigned (Elite) ->
//   finalized D1 snapshot -> female result card (real PNG via WASM) ->
//   site winner news -> four Meta destinations (2 Facebook + 2 Instagram).
//
// Defect 1: the card preflight must NEVER self-fetch the public card URL
//   (a HEAD probe on the GET-only card route guaranteed
//   IMAGE_GENERATION_FAILED and stopped the pipeline).
// Defect 2: the trigger event's levels + level places are GUARANTEED before
//   publish, even when the chunked distance rebuild would not include the
//   trigger event in the current chunk (it used to return ok:true anyway).
// Defect 3: the canonical race_event_results snapshot is refreshed with the
//   finalized rows (levels + places) after level application; publication
//   (card, draft, winner news) reads the finalized snapshot, not the
//   pre-levels one written during the initial sync.
//
// Formulas/thresholds are NOT touched: 1:02:30 on the women's 10K must
// classify as Elite (< 1:05:00), level_place 1; 1:16:41 must classify as
// Competitive (< 1:20:00).
//
// Presence-signal approval (2026-10-07): when results_require_approval='T'
// on the race, every result returned by get-results counts as owner-approved
// with source RUNSIGNUP — no Engine D1 approval rows needed. Covered by the
// second describe block below (Susan Otto case).
import { afterEach, describe, expect, it, vi } from "vitest";
import { autoProcessEvent, evaluateEventTrigger } from "../src/series-2026-auto-process";
import {
	applySeries2026Levels,
	applyTriggerEventLevels,
	AUTO_APPROVED_CONFIRMATION,
} from "../src/series-2026-apply";

afterEach(() => {
	vi.unstubAllGlobals();
});

type Row = Record<string, unknown>;

// ---------------------------------------------------------------- fixtures
const RACE_ID = 210018; // Series 2026 10K
const TRIGGER_EVENT = 1177719; // Sunday 2026-10-04 10K (the real stuck event)
const OTHER_EVENT = 1177720; // second 10K event, only for the chunk test
const SET_ID = 777001;
const SET_ID_OTHER = 777002;
const REG_ID = 9001;
const RESULT_ID = 232600001;

const FEMALE_ROW: Row = {
	result_id: RESULT_ID,
	first_name: "Elena",
	last_name: "Testwalker",
	gender: "F",
	chip_time: null,
	clock_time: "1:02:30", // < 1:05:00 -> Elite (women's 10K)
	city: "Testville",
	state: "FL",
	country_code: "US",
	age: 34,
};

const OTHER_ROW: Row = {
	result_id: 232600002,
	first_name: "Ivan",
	last_name: "Testwalker",
	gender: "M",
	chip_time: null,
	clock_time: "1:10:00",
};

// The real stuck case: Sunday 2026-10-04 10K, Susan Otto 1:16:41,
// approved by the owner in the RunSignup dashboard (no Engine D1 rows).
const SUSAN_RESULT_ID = 233256054;
const SUSAN_ROW: Row = {
	result_id: SUSAN_RESULT_ID,
	first_name: "Susan",
	last_name: "Otto",
	gender: "F",
	chip_time: null,
	clock_time: "1:16:41", // 1:15:00 < t < 1:20:00 -> Competitive (women's 10K)
	city: "Testville",
	state: "FL",
	country_code: "US",
	age: 58,
};

const setIdFor = (eventId: number) => (eventId === TRIGGER_EVENT ? SET_ID : SET_ID_OTHER);
const rowFor = (eventId: number): Row[] => (eventId === TRIGGER_EVENT ? [FEMALE_ROW] : [OTHER_ROW]);

// ---------------------------------------------------------------- D1 fake
interface Snapshot {
	results_json: string;
	finalized: number;
	results_url: string | null;
	event_name: string | null;
	event_date: string | null;
	distance: string;
	result_count: number;
}

function makeDb(opts: {
	events?: Array<{ event_id: number; stage: string }>;
	approvals?: string[];
} = {}) {
	const state = {
		lifecycle: {
			write_access: "CONFIRMED",
			events_json: JSON.stringify(
				opts.events ?? [{ event_id: TRIGGER_EVENT, stage: "verifying" }],
			),
			active_event_id: null as number | null,
			prep_json: null as string | null,
			prep_confirmed: "false",
		},
		approvals: opts.approvals ?? [String(RESULT_ID)],
		snapshots: new Map<string, Snapshot>(),
		autoProcessLog: [] as Array<{ step: string; status: string; detail: string }>,
		publicationStatus: new Map<string, string>(),
		deliveries: [] as Array<{
			publication_key: string;
			destination: string;
			status: string;
			external_id: string;
		}>,
		siteNews: [] as Array<{ slug: string; title: string; body_html: string; kind: string }>,
		rebuildProgress: null as { cursor: number; errors: number; status: string } | null,
	};
	const snapKey = (raceId: number, eventId: number) => `${raceId}:${eventId}`;
	const snapshotByEvent = (eventId: number): Snapshot | null => {
		for (const [key, snap] of state.snapshots) {
			if (key.endsWith(`:${eventId}`)) return snap;
		}
		return null;
	};

	const db = {
		prepare(sql: string) {
			const q = sql.replace(/\s+/g, " ");
			const makeBound = (...args: unknown[]) => {
					const str = (i: number) => (args[i] == null ? null : String(args[i]));
					const num = (i: number) => (args[i] == null ? null : Number(args[i]));
					return {
						async first() {
							if (q.includes("FROM race_lifecycle")) {
								if (q.includes("write_access")) {
									return {
										write_access: state.lifecycle.write_access,
										events_json: state.lifecycle.events_json,
									};
								}
								if (q.includes("active_event_id")) {
									return {
										active_event_id: state.lifecycle.active_event_id,
										prep_json: state.lifecycle.prep_json,
										prep_confirmed: state.lifecycle.prep_confirmed,
									};
								}
								return { events_json: state.lifecycle.events_json };
							}
							if (q.includes("FROM race_event_results")) {
								// Card/draft read: WHERE race_id = ? AND event_id = ?
								if (q.includes("results_url, results_json, finalized")) {
									const snap = state.snapshots.get(snapKey(num(0)!, num(1)!));
									return snap
										? {
												event_name: snap.event_name,
												event_date: snap.event_date,
												results_url: snap.results_url,
												results_json: snap.results_json,
												finalized: snap.finalized,
											}
										: null;
								}
								// Next-race promo: SELECT distance ... WHERE series/race_id/event_id
								if (q.startsWith("SELECT distance FROM race_event_results")) {
									const snap = state.snapshots.get(snapKey(num(1)!, num(2)!));
									return snap ? { distance: snap.distance } : null;
								}
								// Winner news: WHERE series = ? AND race_id = ? AND event_id = ?
								if (q.includes("event_name, event_date, distance, results_json")) {
									const snap = state.snapshots.get(snapKey(num(1)!, num(2)!));
									return snap
										? {
												event_name: snap.event_name,
												event_date: snap.event_date,
												distance: snap.distance,
												results_json: snap.results_json,
											}
										: null;
								}
								// Step-3 verify: SELECT results_json ... WHERE series/distance/event_id
								if (q.includes("SELECT results_json FROM race_event_results")) {
									const snap = snapshotByEvent(num(2)!);
									return snap ? { results_json: snap.results_json } : null;
								}
								return null;
							}
							if (q.includes("FROM series_rebuild_progress")) {
								return state.rebuildProgress;
							}
							if (q.includes("FROM result_publication_history")) {
								// WHERE publication_key = ?  (single-row first())
								if (q.includes("WHERE publication_key = ?")) {
									const status = state.publicationStatus.get(str(0)!);
									return status ? { status } : null;
								}
								return null;
							}
							if (q.includes("FROM site_news WHERE slug = ?")) {
								return state.siteNews.find((n) => n.slug === str(0)!) ?? null;
							}
							return null;
						},
						async all() {
							if (q.includes("FROM series_result_approvals")) {
								return { results: state.approvals.map((resultId) => ({ resultId })) };
							}
							if (q.includes("FROM series_result_disqualifications")) {
								return { results: [] };
							}
							if (q.includes("FROM result_publication_history")) {
								return { results: [] };
							}
							if (q.includes("FROM result_publication_deliveries")) {
								return {
									results: state.deliveries.filter(
										(d) => d.publication_key === str(0)!,
									),
								};
							}
							if (q.includes("FROM athlete_profiles")) {
								return { results: [] };
							}
							if (q.includes("FROM race_event_first_seen")) {
								return { results: [] };
							}
							// Next-race promo candidates: SELECT ... FROM race_event_results WHERE series = ?
							if (q.includes("FROM race_event_results")) {
								return {
									results: [...state.snapshots.values()].map((snap) => ({
										event_id: 0,
										event_name: snap.event_name,
										event_date: snap.event_date,
										distance: snap.distance,
										registration_url: null,
									})),
								};
							}
							return { results: [] };
						},
						async run() {
							if (q.includes("INSERT INTO race_lifecycle")) {
								state.lifecycle.events_json = str(7)!;
								return { success: true };
							}
							if (q.includes("UPDATE race_lifecycle SET events_json")) {
								state.lifecycle.events_json = str(0)!;
								return { success: true };
							}
							if (q.includes("INSERT INTO race_event_results")) {
								// (series, distance, race_id, event_id, event_name, event_date,
								//  result_count, finalized, results_json, results_url,
								//  publication_status, registration_url, synced_at)
								state.snapshots.set(snapKey(num(2)!, num(3)!), {
									results_json: str(8)!,
									finalized: num(7) ?? 0,
									results_url: str(9),
									event_name: str(4),
									event_date: str(5),
									distance: str(1)!,
									result_count: num(6) ?? 0,
								});
								return { success: true };
							}
							if (q.includes("UPDATE race_event_results")) {
								// UPDATE race_event_results
								// SET results_json = ?, result_count = ?, finalized = 1, synced_at = ?
								// WHERE series = ? AND distance = ? AND event_id = ?
								// (finalized is a literal 1, not a placeholder)
								const snap = snapshotByEvent(num(5)!);
								if (snap) {
									snap.results_json = str(0)!;
									snap.result_count = num(1) ?? snap.result_count;
									snap.finalized = 1;
								}
								return { success: true };
							}
							if (q.includes("INSERT INTO series_auto_process_log")) {
								// (series, distance, race_id, event_id, trigger, step, status, detail)
								state.autoProcessLog.push({
									step: str(5)!,
									status: str(6)!,
									detail: str(7)!,
								});
								return { success: true };
							}
							if (q.includes("INSERT INTO series_rebuild_progress")) {
								// (series, distance, cursor, errors, status, updated_at)
								state.rebuildProgress = {
									cursor: num(2) ?? 0,
									errors: num(3) ?? 0,
									status: str(4)!,
								};
								return { success: true };
							}
							if (q.includes("INSERT INTO result_publication_history")) {
								// (publication_key, race_id, event_id, result_set_id, metadata)
								state.publicationStatus.set(str(0)!, "APPROVED");
								return { success: true };
							}
							if (q.includes("UPDATE result_publication_history")) {
								// (status, metadata, publication_key)
								state.publicationStatus.set(str(2)!, str(0)!);
								return { success: true };
							}
							if (q.includes("INSERT INTO result_publication_deliveries")) {
								// (publication_key, destination, external_id)
								state.deliveries.push({
									publication_key: str(0)!,
									destination: str(1)!,
									status: "PUBLISHED",
									external_id: str(2)!,
								});
								return { success: true };
							}
							if (q.includes("INSERT INTO site_news")) {
								// (slug, title, body_html, published_at) + kind literal in SQL
								const kind = q.includes("winner_announcement")
									? "winner_announcement"
									: "news";
								state.siteNews.push({
									slug: str(0)!,
									title: str(1)!,
									body_html: str(2)!,
									kind,
								});
								return { success: true, meta: { last_row_id: state.siteNews.length } };
							}
							// levels_apply_log, series_registration_sync_log,
							// series_registrations, race_event_first_seen, audit_events:
							// audit-only writes; no-op in the fake.
							return { success: true };
						},
					};
				};
				const unbound = makeBound();
				return {
					bind: makeBound,
					first: unbound.first,
					all: unbound.all,
					run: unbound.run,
				};
			},
		};
		return { db: db as unknown as D1Database, state };
}

// ---------------------------------------------------------------- fetch fake
interface Capture {
	fullResultsPosts: Array<{ eventId: number; rows: Row[] }>;
	selfFetches: string[];
	metaCalls: string[];
	fieldIds: { levelId: number; placeId: number } | null;
}

function makeFakeFetch(
	capture: Capture,
	events: Array<{ id: number; name: string; startTime: string }>,
	opts: {
		/** results_require_approval returned by vr-settings.json; null/undefined = field absent */
		requireApproval?: string | null;
		/** Override the get-results rows per event (default: rowFor) */
		rowsForEvent?: (eventId: number) => Row[];
	} = {},
) {
	const state = {
		types: new Map<string, number>(),
		nextTypeId: 1000,
		fields: new Map<string, { levelId: number; placeId: number }>(),
		nextFieldId: 7001,
		nextParticipantId: 109001,
	};
	const json = (data: unknown, status = 200) =>
		new Response(JSON.stringify(data), {
			status,
			headers: { "content-type": "application/json" },
		});
	const formBody = (init?: RequestInit): Record<string, unknown> => {
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
		const host = url.hostname;

		// Defect 1 probe: the pipeline must NEVER self-fetch the card URL.
		if (path.includes("/result-publications/card/")) {
			capture.selfFetches.push(`${method} ${url.href}`);
			return new Response("not found", { status: 404 });
		}

		// NWANA logo embedded into the card as a data URL. resvg sniffs the
		// image format from magic bytes, so a 1x1 PNG is fine.
		if (host === "d368g9lw5ileu7.cloudfront.net") {
			const png1x1 = Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
				"base64",
			);
			return new Response(png1x1, {
				status: 200,
				headers: { "content-type": "image/png" },
			});
		}

		if (host === "graph.facebook.com") {
			capture.metaCalls.push(`${method} ${path}`);
			if (method === "GET" && path.endsWith("/me/accounts")) {
				return json({
					data: [
						{ id: "595301193675669", name: "NWANA", access_token: "fake-page-token-1" },
						{ id: "103190499173992", name: "Nordic Walking Sport", access_token: "fake-page-token-2" },
					],
				});
			}
			if (method === "POST" && path.endsWith("/photos")) {
				return json({ id: `fb-post-${capture.metaCalls.length}` });
			}
			if (method === "POST" && path.endsWith("/media")) {
				return json({ id: `ig-container-${capture.metaCalls.length}` });
			}
			if (method === "POST" && path.endsWith("/media_publish")) {
				return json({ id: `ig-media-${capture.metaCalls.length}` });
			}
			return json({ error: { message: "unexpected meta call", code: 1 } }, 400);
		}

		if (host === "api.runsignup.com") {
			if (method === "GET" && /^\/rest\/race\/\d+$/.test(path)) {
				return json({
					race: {
						race_id: RACE_ID,
						url: "https://runsignup.com/Race/XX/Test10K",
						events: events.map((e) => ({
							event_id: e.id,
							name: e.name,
							start_time: e.startTime,
						})),
					},
				});
			}
			if (method === "GET" && path.endsWith("/results/get-result-sets")) {
				const eventId = Number(params.get("event_id"));
				return json({
					individual_results_sets: [
						{
							individual_result_set_id: setIdFor(eventId),
							individual_result_set_name: "Overall Results",
						},
					],
				});
			}
			if (method === "GET" && path.endsWith("/results/get-results")) {
				const eventId = Number(params.get("event_id"));
				return json({
					individual_results_sets: [
						{
							individual_result_set_id: setIdFor(eventId),
							individual_result_set_name: "Overall Results",
							results_source_url: `https://runsignup.com/Race/Results/${RACE_ID}/#resultSetId-${setIdFor(eventId)}`,
							results_headers: {
								result_id: "Result ID",
								first_name: "First Name",
								last_name: "Last Name",
								gender: "Gender",
								clock_time: "Clock Time",
								chip_time: "Chip Time",
							},
							results: (opts.rowsForEvent ?? rowFor)(eventId),
							registration_ids: [REG_ID],
						},
					],
				});
			}
			if (method === "GET" && path.endsWith("/vr-settings.json")) {
				const settings: Row = {};
				if (opts.requireApproval != null) {
					settings.results_require_approval = opts.requireApproval;
				}
				return json({ virtual_result_settings: settings });
			}
			if (method === "GET" && path.endsWith("/participants")) {
				return json({
					participants: [
						{
							registration_id: REG_ID,
							event_id: Number(params.get("event_id")),
							user: { user_id: 4242 },
							first_name: "Elena",
							last_name: "Testwalker",
							status: "active",
						},
					],
					race: { name: "Test 10K Race" },
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
			if (method === "POST" && path.endsWith("/race-series-participants/add/registration-id.json")) {
				const body = formBody(init);
				const parts = Array.isArray(body.participants) ? body.participants : [];
				return json({
					race_series_participants: parts.map((_, i) => ({
						row: i + 1,
						race_series_participant_id: state.nextParticipantId++,
					})),
				});
			}
			if (method === "POST" && path.endsWith("/race-series-results.json")) {
				return json({ num_scores_uploaded: 1 });
			}
			if (method === "POST" && path.endsWith("/results/custom-fields")) {
				const eventId = Number(params.get("event_id"));
				const setId = Number(params.get("individual_result_set_id"));
				const key = `${eventId}:${setId}`;
				let ids = state.fields.get(key);
				if (!ids) {
					ids = { levelId: state.nextFieldId++, placeId: state.nextFieldId++ };
					state.fields.set(key, ids);
				}
				capture.fieldIds = ids;
				return json({
					custom_fields: [{ custom_field_id: ids.levelId }, { custom_field_id: ids.placeId }],
				});
			}
			if (method === "POST" && path.endsWith("/results/full-results")) {
				const eventId = Number(params.get("event_id"));
				const body = formBody(init);
				capture.fullResultsPosts.push({
					eventId,
					rows: Array.isArray(body.results) ? (body.results as Row[]) : [],
				});
				return json({ success: true });
			}
			if (method === "POST" && path.endsWith("/results/customize-result-set-columns")) {
				return json({ success: true });
			}
		}

		throw new Error(`Unexpected fetch in test (strict allowlist): ${method} ${url.href}`);
	};
}

function newCapture(): Capture {
	return { fullResultsPosts: [], selfFetches: [], metaCalls: [], fieldIds: null };
}

const PAST = "2026-10-04T09:00:00";

// ---------------------------------------------------------------- tests
describe("Series 2026 automatic result pipeline (Defects 1-3)", () => {
	it(
		"owner-approved female 10K result: approve -> Elite level -> finalized snapshot -> female card -> winner news -> four Meta destinations",
		async () => {
			const capture = newCapture();
			const { db, state } = makeDb();
			vi.stubGlobal(
				"fetch",
				makeFakeFetch(capture, [
					{ id: TRIGGER_EVENT, name: "2026 NWANA Open 10K Nordic Walking Series - October 4, 2026", startTime: PAST },
				]),
			);

			const result = await autoProcessEvent(
				{
					db,
					accessToken: "fake-runsignup-token",
					metaToken: "fake-meta-token",
					publicBaseUrl: "https://engine.example.test",
				},
				{
					distance: "10K",
					raceId: RACE_ID,
					eventId: TRIGGER_EVENT,
					trigger: {
						fire: true,
						reason: "all_approved",
						detail: "regression fixture",
						registrations: [],
						results: [
							{
								result_id: String(RESULT_ID),
								athlete: "Elena Testwalker",
								gender: "F",
								time: "1:02:30",
							},
						],
						approvedResultIds: [String(RESULT_ID)],
						approvalSources: { [String(RESULT_ID)]: "ENGINE" },
						disqualifiedResultIds: [],
						missingSubmissions: [],
						unapprovedResults: [],
						unregisteredResults: [],
						deadline: null,
						deadlineSource: "test",
					},
				},
			);

			// The whole chain completed.
			expect(result.ok).toBe(true);

			// Defect 2: the trigger event's levels were GUARANTEED before publish.
			const applyStep = result.steps.find((s) => s.step === "apply_levels");
			expect(applyStep?.status).toBe("ok");
			expect(applyStep?.detail).toContain("guaranteed before publish");

			// Performance Level assigned and written back to RunSignup.
			const post = capture.fullResultsPosts.find((p) => p.eventId === TRIGGER_EVENT);
			expect(post).toBeDefined();
			expect(post!.rows).toHaveLength(1);
			expect(capture.fieldIds).not.toBeNull();
			expect(post!.rows[0][`custom-field-${capture.fieldIds!.levelId}`]).toBe(
				"Elite (< 1:05:00)",
			);
			expect(post!.rows[0][`custom-field-${capture.fieldIds!.placeId}`]).toBe("1");

			// Defect 1: the card preflight NEVER self-fetched the public card URL.
			expect(capture.selfFetches).toEqual([]);

			// Defect 3: canonical D1 snapshot refreshed with finalized rows.
			const snap = state.snapshots.get(`${RACE_ID}:${TRIGGER_EVENT}`);
			expect(snap).toBeDefined();
			expect(snap!.finalized).toBe(1);
			const snapRows = JSON.parse(snap!.results_json) as Array<{
				athlete: string;
				gender: string | null;
				performance_level: string | null;
				level_place: string | null;
			}>;
			expect(snapRows).toHaveLength(1);
			expect(snapRows[0].athlete).toBe("Elena Testwalker");
			expect(snapRows[0].gender).toBe("F");
			expect(snapRows[0].performance_level).toBe("Elite (< 1:05:00)");
			expect(snapRows[0].level_place).toBe("1");

			// Female result card generated (real PNG bytes, direct call).
			const cardStep = result.steps.find((s) => s.step === "card_preflight");
			expect(cardStep?.status).toBe("ok");
			expect(cardStep?.detail).toMatch(/PNG bytes/);

			// Site winner news published from the finalized snapshot.
			const news = state.siteNews.find((n) => n.kind === "winner_announcement");
			expect(news).toBeDefined();
			expect(news!.body_html).toContain("Elena Testwalker");
			expect(news!.body_html).toContain("Elite");

			// Four Meta destinations: 2 Facebook + 2 Instagram.
			expect(capture.metaCalls.filter((c) => c.endsWith("/photos")).length).toBe(2);
			expect(capture.metaCalls.filter((c) => c.endsWith("/media")).length).toBe(2);
			expect(capture.metaCalls.filter((c) => c.endsWith("/media_publish")).length).toBe(2);
			expect(state.deliveries).toHaveLength(4);
			const destinations = state.deliveries.map((d) => d.destination).sort();
			expect(destinations).toEqual([
				"FACEBOOK_NORDIC_WALKING_SPORT",
				"FACEBOOK_NWANA",
				"INSTAGRAM_NWANA_OFFICIAL",
				"INSTAGRAM_N_W_SPORT",
			]);

			// Publication ledger closed with the true outcome.
			const publishStep = result.steps.find((s) => s.step === "publish");
			expect(publishStep?.status).toBe("ok");
			expect(state.publicationStatus.get(`runsignup:series-2026:${RACE_ID}:${TRIGGER_EVENT}:${SET_ID}`)).toMatch(
				/^PUBLISHED/,
			);
		},
		120000,
	);

	it("chunked rebuild can return ok:true without the trigger event; applyTriggerEventLevels still guarantees it (Defect 2)", async () => {
		const capture = newCapture();
		// Trigger event sorts AFTER the first chunk (eventLimit=1).
		const { db } = makeDb({
			events: [
				{ event_id: OTHER_EVENT, stage: "levels_computed" },
				{ event_id: TRIGGER_EVENT, stage: "verifying" },
			],
		});
		vi.stubGlobal(
			"fetch",
			makeFakeFetch(capture, [
				{ id: OTHER_EVENT, name: "Earlier 10K", startTime: "2026-09-27T09:00:00" },
				{ id: TRIGGER_EVENT, name: "Sunday 10K", startTime: PAST },
			]),
		);

		const chunked = await applySeries2026Levels({
			db,
			accessToken: "fake-runsignup-token",
			distance: "10K",
			eventId: TRIGGER_EVENT,
			confirmation: AUTO_APPROVED_CONFIRMATION,
			eventLimit: 1,
		});

		// The old lie: ok:true, trigger event not in this chunk.
		expect(chunked.ok).toBe(true);
		expect(chunked.result_count).toBe(0);
		const chunkStep = chunked.steps.find((s) => s.step === "rebuild_chunk");
		expect(chunkStep?.detail).toContain(String(OTHER_EVENT));
		expect(chunkStep?.detail).not.toContain(String(TRIGGER_EVENT));
		expect(capture.fullResultsPosts.some((p) => p.eventId === TRIGGER_EVENT)).toBe(false);

		// The guarantee: targeted apply processes the trigger event.
		const guaranteed = await applyTriggerEventLevels({
			db,
			accessToken: "fake-runsignup-token",
			distance: "10K",
			eventId: TRIGGER_EVENT,
			confirmation: AUTO_APPROVED_CONFIRMATION,
		});
		expect(guaranteed.ok).toBe(true);
		expect(guaranteed.result_count).toBe(1);
		expect(guaranteed.finalizedRows).toHaveLength(1);
		expect(guaranteed.finalizedRows[0].performance_level).toBe("Elite (< 1:05:00)");
		expect(guaranteed.finalizedRows[0].level_place).toBe("1");
		const post = capture.fullResultsPosts.find((p) => p.eventId === TRIGGER_EVENT);
		expect(post).toBeDefined();
		expect(post!.rows[0][`custom-field-${capture.fieldIds!.levelId}`]).toBe(
			"Elite (< 1:05:00)",
		);
	});

	it("applyTriggerEventLevels refuses an event that is not in the verifying stage", async () => {
		const capture = newCapture();
		const { db } = makeDb({
			events: [{ event_id: TRIGGER_EVENT, stage: "levels_computed" }],
		});
		vi.stubGlobal(
			"fetch",
			makeFakeFetch(capture, [
				{ id: TRIGGER_EVENT, name: "Sunday 10K", startTime: PAST },
			]),
		);

		const result = await applyTriggerEventLevels({
			db,
			accessToken: "fake-runsignup-token",
			distance: "10K",
			eventId: TRIGGER_EVENT,
			confirmation: AUTO_APPROVED_CONFIRMATION,
		});
		expect(result.ok).toBe(false);
		expect(result.error).toContain('stage "levels_computed"');
		expect(capture.fullResultsPosts).toEqual([]);
	});
});

describe("Series 2026 presence-signal approval (RUNSIGNUP)", () => {
	const susanFetch = (capture: Capture, requireApproval: string | null) =>
		makeFakeFetch(
			capture,
			[
				{
					id: TRIGGER_EVENT,
					name: "2026 NWANA Open 10K Nordic Walking Series - October 4, 2026",
					startTime: PAST,
				},
			],
			{ requireApproval, rowsForEvent: () => [SUSAN_ROW] },
		);
	const susanEnv = (db: D1Database) => ({
		db,
		accessToken: "fake-runsignup-token",
		publicBaseUrl: "https://engine.example.test",
	});

	it("results_require_approval=T, no D1 approvals: presence in get-results fires the trigger with source RUNSIGNUP", async () => {
		const capture = newCapture();
		const { db, state } = makeDb({ approvals: [] });
		vi.stubGlobal("fetch", susanFetch(capture, "T"));

		const trigger = await evaluateEventTrigger(susanEnv(db), {
			distance: "10K",
			raceId: RACE_ID,
			eventId: TRIGGER_EVENT,
		});

		expect(trigger.fire).toBe(true);
		expect(trigger.reason).toBe("all_approved");
		expect(trigger.approvedResultIds).toEqual([String(SUSAN_RESULT_ID)]);
		expect(trigger.approvalSources).toEqual({
			[String(SUSAN_RESULT_ID)]: "RUNSIGNUP",
		});
		expect(trigger.unapprovedResults).toEqual([]);
		// Trigger evaluation is read-only: identical data always yields the
		// identical decision, with no audit rows or other side effects.
		const again = await evaluateEventTrigger(susanEnv(db), {
			distance: "10K",
			raceId: RACE_ID,
			eventId: TRIGGER_EVENT,
		});
		expect(again.fire).toBe(trigger.fire);
		expect(again.reason).toBe(trigger.reason);
		expect(again.detail).toBe(trigger.detail);
		expect(again.approvedResultIds).toEqual(trigger.approvedResultIds);
		expect(again.approvalSources).toEqual(trigger.approvalSources);
		expect(state.autoProcessLog).toEqual([]);
	});

	it("results_require_approval=F, no D1 approvals: trigger does NOT fire (old behavior preserved)", async () => {
		const capture = newCapture();
		const { db } = makeDb({ approvals: [] });
		vi.stubGlobal("fetch", susanFetch(capture, "F"));

		const trigger = await evaluateEventTrigger(susanEnv(db), {
			distance: "10K",
			raceId: RACE_ID,
			eventId: TRIGGER_EVENT,
		});

		expect(trigger.fire).toBe(false);
		expect(trigger.reason).toBe("waiting");
		expect(trigger.approvedResultIds).toEqual([]);
		expect(trigger.approvalSources).toEqual({});
		expect(trigger.unapprovedResults.map((r) => r.result_id)).toEqual([
			String(SUSAN_RESULT_ID),
		]);
	});

	it(
		"RUNSIGNUP-approved Susan Otto 1:16:41 runs the full pipeline: Competitive level -> finalized snapshot -> card -> news -> four Meta destinations",
		async () => {
			const capture = newCapture();
			const { db, state } = makeDb({ approvals: [] });
			vi.stubGlobal("fetch", susanFetch(capture, "T"));

			const trigger = await evaluateEventTrigger(susanEnv(db), {
				distance: "10K",
				raceId: RACE_ID,
				eventId: TRIGGER_EVENT,
			});
			expect(trigger.fire).toBe(true);

			const result = await autoProcessEvent(
				{
					db,
					accessToken: "fake-runsignup-token",
					metaToken: "fake-meta-token",
					publicBaseUrl: "https://engine.example.test",
				},
				{ distance: "10K", raceId: RACE_ID, eventId: TRIGGER_EVENT, trigger },
			);

			expect(result.ok).toBe(true);

			// Trigger authorization audit: the RUNSIGNUP source is recorded.
			const triggerStep = result.steps.find((s) => s.step === "trigger");
			expect(triggerStep?.status).toBe("ok");
			expect(triggerStep?.detail).toContain(`${SUSAN_RESULT_ID}:RUNSIGNUP`);

			// Performance Level: 1:15:00 < 1:16:41 < 1:20:00 -> Competitive.
			const post = capture.fullResultsPosts.find((p) => p.eventId === TRIGGER_EVENT);
			expect(post).toBeDefined();
			expect(post!.rows).toHaveLength(1);
			expect(capture.fieldIds).not.toBeNull();
			expect(post!.rows[0][`custom-field-${capture.fieldIds!.levelId}`]).toBe(
				"Competitive (< 1:20:00)",
			);
			expect(post!.rows[0][`custom-field-${capture.fieldIds!.placeId}`]).toBe("1");

			// Canonical D1 snapshot finalized with the level.
			const snap = state.snapshots.get(`${RACE_ID}:${TRIGGER_EVENT}`);
			expect(snap).toBeDefined();
			expect(snap!.finalized).toBe(1);
			const snapRows = JSON.parse(snap!.results_json) as Array<{
				athlete: string;
				gender: string | null;
				performance_level: string | null;
				level_place: string | null;
			}>;
			expect(snapRows).toHaveLength(1);
			expect(snapRows[0].athlete).toBe("Susan Otto");
			expect(snapRows[0].gender).toBe("F");
			expect(snapRows[0].performance_level).toBe("Competitive (< 1:20:00)");
			expect(snapRows[0].level_place).toBe("1");

			// Card generated directly (never self-fetched), winner news
			// published, four Meta destinations reached.
			expect(capture.selfFetches).toEqual([]);
			expect(result.steps.find((s) => s.step === "card_preflight")?.status).toBe("ok");
			const news = state.siteNews.find((n) => n.kind === "winner_announcement");
			expect(news).toBeDefined();
			expect(news!.body_html).toContain("Susan Otto");
			expect(news!.body_html).toContain("Competitive");
			expect(capture.metaCalls.filter((c) => c.endsWith("/photos")).length).toBe(2);
			expect(capture.metaCalls.filter((c) => c.endsWith("/media")).length).toBe(2);
			expect(capture.metaCalls.filter((c) => c.endsWith("/media_publish")).length).toBe(2);
			expect(state.deliveries).toHaveLength(4);
		},
		120000,
	);
});
