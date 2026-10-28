// End-to-end regression for the Series 2026 automatic result pipeline.
// TEMPORARY — Series 2026 completion only (legacy completion mode,
// 2026-10-09): the NWANA-FINAL.ps1 laptop script is the scoring/writeback
// engine. autoProcessEvent detects already-scored events (Performance Level
// + Level Place present in RunSignup, two-part verification) and runs
// downstream-only: canonical D1 snapshot -> result card (real PNG via WASM)
// -> site winner news -> four Meta destinations (2 Facebook + 2 Instagram).
// Zero RunSignup writes. If the event is not yet scored, the run stops with
// WAITING_FOR_LEGACY_SCORING — there is no heavy Worker fallback.
//
// Defect 1: the card preflight must NEVER self-fetch the public card URL
//   (a HEAD probe on the GET-only card route guaranteed
//   IMAGE_GENERATION_FAILED and stopped the pipeline).
// Defect 3: the canonical race_event_results snapshot is upserted with the
//   finalized rows (levels + places) before publication; publication
//   (card, draft, winner news) reads the finalized snapshot.
//
// The heavy scoring functions (applySeries2026Levels,
// applyTriggerEventLevels) stay in the codebase, tested directly below
// (Defect 2), but are no longer invoked by autoProcessEvent.
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

// Mock the WASM rasterizer: tests run in workerd (via @cloudflare/vitest-plugin),
// which — like production — forbids runtime WASM compilation. In production the
// pre-compiled module arrives via the `wasm_module` binding (env.RESVG_WASM);
// here we return minimal valid PNG bytes so the pipeline logic is tested.
// Real PNG rendering is verified live via /api/operating-center/diag/wasm-raster.
vi.mock("../src/svg-raster", () => ({
	setWasmModule: vi.fn(),
	rasterizeSvgToPng: vi.fn(async () =>
		// Minimal valid PNG: 8-byte signature + IHDR chunk header.
		new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
			0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR length + type
			0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64, // 100x100
			0x08, 0x02, 0x00, 0x00, 0x00,
		]),
	),
}));

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

// Rows as written back by the NWANA-FINAL.ps1 laptop script (legacy
// completion mode): Performance Level + Level Place already present.
const FEMALE_ROW_SCORED: Row = {
	...FEMALE_ROW,
	"custom-field-10": "Elite (< 1:05:00)",
	"custom-field-11": "1",
};
const SUSAN_ROW_SCORED: Row = {
	...SUSAN_ROW,
	"custom-field-10": "Competitive (< 1:20:00)",
	"custom-field-11": "1",
};

// ---------------------------------------------------------------- D1 fake
interface Snapshot {
	results_json: string;
	finalized: number;
	results_url: string | null;
	event_name: string | null;
	event_date: string | null;
	distance: string;
	result_count: number;
	publication_key: string | null;
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
		approvals: (opts.approvals ?? [String(RESULT_ID)]).map((resultId) => ({
			resultId,
			source: "oc",
		})),
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
								// ADR-0051 durable snapshot read (autoProcessEvent):
								// SELECT results_json, publication_key ... WHERE series/distance/event_id AND finalized = 1
								if (q.includes("results_json, publication_key")) {
									const snap = snapshotByEvent(num(2)!);
									return snap && snap.finalized === 1
										? {
												results_json: snap.results_json,
												publication_key: snap.publication_key,
											}
										: null;
								}
								// Snapshot upsert fallback read (event name/date/url):
								// SELECT results_url, event_name, event_date ... WHERE series/distance/event_id
								if (q.includes("SELECT results_url, event_name, event_date")) {
									const snap = snapshotByEvent(num(2)!);
									return snap
										? {
												results_url: snap.results_url,
												event_name: snap.event_name,
												event_date: snap.event_date,
											}
										: null;
								}
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
							if (q.includes("FROM series_result_approvals")) {
								// Single-row lookup after INSERT:
								// WHERE series = ? AND distance = ? AND event_id = ? AND result_id = ?
								const found = state.approvals.find((a) => a.resultId === str(3)!);
								return found
									? {
											series: str(0),
											distance: str(1),
											raceId: null,
											eventId: null,
											resultId: found.resultId,
											athlete: null,
											time: null,
											approvedAt: null,
											approvedBy: null,
											source: found.source,
										}
									: null;
							}
							return null;
						},
						async all() {
							if (q.includes("FROM series_result_approvals")) {
								return {
									results: state.approvals.map((a) => ({
										resultId: a.resultId,
										source: a.source,
									})),
								};
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
								//  publication_status, registration_url, synced_at[, publication_key])
								// publication_key (ADR-0051) is bound only by the
								// auto-process upsert; other writers omit it.
								state.snapshots.set(snapKey(num(2)!, num(3)!), {
									results_json: str(8)!,
									finalized: num(7) ?? 0,
									results_url: str(9),
									event_name: str(4),
									event_date: str(5),
									distance: str(1)!,
									result_count: num(6) ?? 0,
									publication_key: args.length > 13 ? str(13) : null,
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
							if (q.includes("INSERT INTO series_rebuild_progress")) {								// (series, distance, cursor, errors, status, updated_at)
								state.rebuildProgress = {
									cursor: num(2) ?? 0,
									errors: num(3) ?? 0,
									status: str(4)!,
								};
								return { success: true };
							}
							if (q.includes("INSERT INTO series_result_approvals")) {
								// (series, distance, race_id, event_id, result_id, athlete,
								//  time, approved_at, approved_by, source). The runsignup path
								//  binds 8 params with literal 'runsignup','runsignup'; the
								//  owner path binds 9 (source as 9th).
								// Semantics: runsignup insert = ON CONFLICT DO NOTHING
								// (never downgrade); owner insert upgrades a runsignup row,
								// keeps an existing owner row as-is.
								const resultId = str(4)!;
								const isRunsignup = q.includes("'runsignup', 'runsignup'");
								const existing = state.approvals.find((a) => a.resultId === resultId);
								if (!existing) {
									state.approvals.push({
										resultId,
										source: isRunsignup ? "runsignup" : str(8)!,
									});
								} else if (!isRunsignup && existing.source === "runsignup") {
									existing.source = str(8)!;
								}
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
		/** When true, get-results exposes Performance Level + Level Place
		 * headers (as written by the NWANA-FINAL.ps1 laptop script). */
		legacyScored?: boolean;
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
								...(opts.legacyScored
									? {
											"custom-field-10": "Performance Level",
											"custom-field-11": "Level Place",
										}
									: {}),
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
		"legacy mode: laptop-scored female 10K result -> detect -> snapshot -> female card -> winner news -> four Meta destinations, zero RunSignup writes",
		async () => {
			const capture = newCapture();
			const { db, state } = makeDb();
			vi.stubGlobal(
				"fetch",
				makeFakeFetch(
					capture,
					[
						{ id: TRIGGER_EVENT, name: "2026 NWANA Open 10K Nordic Walking Series - October 4, 2026", startTime: PAST },
					],
					{ legacyScored: true, rowsForEvent: () => [FEMALE_ROW_SCORED] },
				),
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

			// The downstream chain completed.
			expect(result.ok).toBe(true);

			// Legacy detection passed with the explicit two-part verification.
			const detectStep = result.steps.find((s) => s.step === "detect_scoring");
			expect(detectStep?.status).toBe("ok");
			expect(detectStep?.detail).toContain("Legacy completion mode");
			expect(detectStep?.detail).toContain("Part A (fields)");
			expect(detectStep?.detail).toContain("Part B (standings)");

			// Zero RunSignup writes: probe skipped, no heavy scoring step at all.
			expect(result.steps.find((s) => s.step === "write_access_probe")?.status).toBe("skipped");
			expect(result.steps.find((s) => s.step === "apply_levels")).toBeUndefined();
			expect(capture.fullResultsPosts).toEqual([]);
			expect(capture.fieldIds).toBeNull();

			// Defect 1: the card preflight NEVER self-fetched the public card URL.
			expect(capture.selfFetches).toEqual([]);

			// Canonical D1 snapshot upserted with the already-scored rows.
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
		// Durable-fact architecture: the observed RUNSIGNUP approval is
		// persisted to D1 during evaluation (idempotent). A second
		// evaluation with the same live data yields the identical decision;
		// the persisted row is reused, never duplicated.
		const again = await evaluateEventTrigger(susanEnv(db), {
			distance: "10K",
			raceId: RACE_ID,
			eventId: TRIGGER_EVENT,
		});
		expect(again.fire).toBe(trigger.fire);
		expect(again.reason).toBe(trigger.reason);
		expect(again.detail).toBe(trigger.detail);
		expect(again.approvedResultIds).toEqual(trigger.approvedResultIds);
		// Second run reads the persisted D1 approval: source label becomes
		// ENGINE (the stronger display label for stored rows).
		expect(again.approvalSources).toEqual({
			[String(SUSAN_RESULT_ID)]: "ENGINE",
		});
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
		"legacy mode: unscored Susan Otto 1:16:41 -> WAITING_FOR_LEGACY_SCORING, no heavy fallback, no publication",
		async () => {			const capture = newCapture();
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

			// The laptop script has not scored this event yet: no levels in
			// RunSignup, so the run stops and waits (no heavy fallback).
			expect(result.ok).toBe(false);
			expect(result.error).toContain("WAITING_FOR_LEGACY_SCORING");
			const legacyStep = result.steps.find((s) => s.step === "legacy_scoring");
			expect(legacyStep?.status).toBe("skipped");
			expect(legacyStep?.detail).toContain("WAITING_FOR_LEGACY_SCORING");
			expect(legacyStep?.detail).toContain("Part A (fields): FAILED");

			// Trigger authorization audit still recorded the RUNSIGNUP source.
			const triggerStep = result.steps.find((s) => s.step === "trigger");
			expect(triggerStep?.status).toBe("ok");
			expect(triggerStep?.detail).toContain(`${SUSAN_RESULT_ID}:RUNSIGNUP`);

			// Nothing downstream happened: no snapshot, no card, no news,
			// no Meta deliveries, no RunSignup writes.
			expect(state.snapshots.get(`${RACE_ID}:${TRIGGER_EVENT}`)).toBeUndefined();
			expect(state.siteNews).toHaveLength(0);
			expect(state.deliveries).toHaveLength(0);
			expect(capture.metaCalls).toEqual([]);
			expect(capture.fullResultsPosts).toEqual([]);
			expect(capture.fieldIds).toBeNull();
		},
		120000,
	);

	it(
		"legacy mode: laptop-scored Susan Otto 1:16:41 -> Competitive snapshot -> card -> news -> four Meta destinations",
		async () => {
			const capture = newCapture();
			const { db, state } = makeDb({ approvals: [] });
			vi.stubGlobal(
				"fetch",
				makeFakeFetch(
					capture,
					[
						{ id: TRIGGER_EVENT, name: "2026 NWANA Open 10K Nordic Walking Series - October 4, 2026", startTime: PAST },
					],
					{ requireApproval: "T", legacyScored: true, rowsForEvent: () => [SUSAN_ROW_SCORED] },
				),
			);

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

			// Detection passed; zero RunSignup writes.
			expect(result.steps.find((s) => s.step === "detect_scoring")?.status).toBe("ok");
			expect(capture.fullResultsPosts).toEqual([]);
			expect(capture.fieldIds).toBeNull();

			// Canonical D1 snapshot finalized with the laptop-scored level.
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

	it("durable RUNSIGNUP approval: persisted once, then trigger fires from D1 even when RunSignup returns 522", async () => {
		const capture = newCapture();
		const { db, state } = makeDb({ approvals: [] });

		// Step 1: first fetch returns the approved public result
		// (results_require_approval=T, Susan Otto present in get-results).
		vi.stubGlobal("fetch", susanFetch(capture, "T"));
		const first = await evaluateEventTrigger(susanEnv(db), {
			distance: "10K",
			raceId: RACE_ID,
			eventId: TRIGGER_EVENT,
		});
		expect(first.fire).toBe(true);
		expect(first.approvalSources).toEqual({
			[String(SUSAN_RESULT_ID)]: "RUNSIGNUP",
		});

		// Step 2: the approval fact is persisted to D1 as RUNSIGNUP.
		const persisted = state.approvals.find(
			(a) => a.resultId === String(SUSAN_RESULT_ID),
		);
		expect(persisted).toBeDefined();
		expect(persisted!.source).toBe("runsignup");

		// Step 3: the next night RunSignup is down — get-results and
		// vr-settings.json both 522. Registrations/participants still work.
		const healthyFetch = susanFetch(capture, "T");
		vi.stubGlobal(
			"fetch",
			async (input: string | URL | Request, init?: RequestInit) => {
				const url = new URL(
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url,
				);
				if (
					url.pathname.endsWith("/results/get-results") ||
					url.pathname.endsWith("/results/get-result-sets") ||
					url.pathname.endsWith("/vr-settings.json")
				) {
					throw new Error("RunSignup API 522: connection timed out");
				}
				return healthyFetch(input, init);
			},
		);

		// Step 4: trigger still fires — from the stored D1 approval, without
		// re-querying RunSignup for reconfirmation.
		const second = await evaluateEventTrigger(susanEnv(db), {
			distance: "10K",
			raceId: RACE_ID,
			eventId: TRIGGER_EVENT,
		});
		expect(second.fire).toBe(true);
		expect(second.reason).toBe("all_approved");
		expect(second.approvedResultIds).toEqual([String(SUSAN_RESULT_ID)]);
		// Stored rows carry the stronger ENGINE display label.
		expect(second.approvalSources).toEqual({
			[String(SUSAN_RESULT_ID)]: "ENGINE",
		});

		// Step 5: downstream authorization works from D1 alone — a 522
		// never revokes the already-approved result.
		const { allResultsApproved } = await import("../src/series-2026-approvals");
		expect(
			await allResultsApproved(db, "10K", TRIGGER_EVENT, [
				String(SUSAN_RESULT_ID),
			]),
		).toBe(true);
	});
});

// ---------------------------------------------------------------------
// ADR-0051: durable scored snapshot. The complete scored dataset is
// captured into D1 once (rows + results URL + publication key); every
// later run detects, finalizes, and publishes from D1 with zero RunSignup
// reads. A RunSignup 522 after acquisition is irrelevant; a 522 before
// any acquisition still fails closed (refusing to guess).
// ---------------------------------------------------------------------
describe("Durable scored snapshot (ADR-0051)", () => {
	const EVENTS = [
		{ id: TRIGGER_EVENT, name: "2026 NWANA Open 10K Nordic Walking Series - October 4, 2026", startTime: PAST },
	];
	const TRIGGER = {
		fire: true,
		reason: "all_approved" as const,
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
		approvalSources: { [String(RESULT_ID)]: "ENGINE" as const },
		disqualifiedResultIds: [] as string[],
		missingSubmissions: [] as string[],
		unapprovedResults: [],
		unregisteredResults: [],
		deadline: null,
		deadlineSource: "test",
	};
	const ENV = (db: D1Database) => ({
		db,
		accessToken: "fake-runsignup-token",
		metaToken: "fake-meta-token",
		publicBaseUrl: "https://engine.example.test",
	});
	const INPUT = {
		distance: "10K",
		raceId: RACE_ID,
		eventId: TRIGGER_EVENT,
		trigger: TRIGGER,
	};

	it(
		"acquisition persists rows + publication key; a later run with RunSignup at 522 completes from D1 with zero RunSignup calls and no duplicate publication",
		async () => {
			const capture = newCapture();
			const { db, state } = makeDb();
			const healthy = makeFakeFetch(capture, EVENTS, {
				legacyScored: true,
				rowsForEvent: () => [FEMALE_ROW_SCORED],
			});
			vi.stubGlobal("fetch", healthy);

			// Run 1: no snapshot yet — the one live acquisition happens and
			// the full chain completes.
			const first = await autoProcessEvent(ENV(db), INPUT);
			expect(first.ok).toBe(true);
			const snap = state.snapshots.get(`${RACE_ID}:${TRIGGER_EVENT}`);
			expect(snap).toBeDefined();
			expect(snap!.finalized).toBe(1);
			expect(snap!.publication_key).toBe(
				`runsignup:series-2026:${RACE_ID}:${TRIGGER_EVENT}:${SET_ID}`,
			);
			expect(state.deliveries).toHaveLength(4);
			expect(
				state.siteNews.filter((n) => n.kind === "winner_announcement"),
			).toHaveLength(1);

			// Run 2: RunSignup answers 522 to everything and counts calls.
			let runsignupCalls = 0;
			vi.stubGlobal(
				"fetch",
				async (input: string | URL | Request, init?: RequestInit) => {
					const url = new URL(
						typeof input === "string"
							? input
							: input instanceof URL
								? input.href
								: input.url,
					);
					if (url.hostname === "api.runsignup.com") {
						runsignupCalls++;
						return new Response("error code: 522", { status: 522 });
					}
					return healthy(input, init);
				},
			);
			const second = await autoProcessEvent(ENV(db), INPUT);
			expect(second.ok).toBe(true);
			expect(runsignupCalls).toBe(0);
			const detect2 = second.steps.find((s) => s.step === "detect_scoring");
			expect(detect2?.status).toBe("ok");
			expect(detect2?.detail).toContain("D1 canonical snapshot");
			const publish2 = second.steps.find((s) => s.step === "publish");
			expect(publish2?.status).toBe("ok");
			expect(publish2?.detail).toContain("Already published");
			// Idempotent: no duplicate deliveries, no duplicate news.
			expect(state.deliveries).toHaveLength(4);
			expect(
				state.siteNews.filter((n) => n.kind === "winner_announcement"),
			).toHaveLength(1);
		},
		120000,
	);

	it(
		"no snapshot and RunSignup at 522: detect_scoring fails closed (refusing to guess), nothing is persisted or published",
		async () => {
			const capture = newCapture();
			const { db, state } = makeDb();
			const healthy = makeFakeFetch(capture, EVENTS, {
				legacyScored: true,
				rowsForEvent: () => [FEMALE_ROW_SCORED],
			});
			vi.stubGlobal(
				"fetch",
				async (input: string | URL | Request, init?: RequestInit) => {
					const url = new URL(
						typeof input === "string"
							? input
							: input instanceof URL
								? input.href
								: input.url,
					);
					if (url.hostname === "api.runsignup.com") {
						return new Response("error code: 522", { status: 522 });
					}
					return healthy(input, init);
				},
			);
			const result = await autoProcessEvent(ENV(db), INPUT);
			expect(result.ok).toBe(false);
			const detect = result.steps.find((s) => s.step === "detect_scoring");
			expect(detect?.status).toBe("failed");
			expect(detect?.detail).toContain("refusing to guess");
			expect(state.snapshots.size).toBe(0);
			expect(state.deliveries).toHaveLength(0);
			expect(state.siteNews).toHaveLength(0);
		},
		120000,
	);
});
