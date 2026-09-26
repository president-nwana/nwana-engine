// Object creation workflow: the honest API boundary as executable tests.
//
// The machine must never claim the API can create objects, must never
// write without an explicit confirmation, and must surface the dangerous
// replace semantics (periods, pricing, questions) in the dry-run plan.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	APPLY_STEP_CONFIRM,
	OBJECT_FIELD_CAPABILITIES,
	applyCreationStep,
	buildApiCall,
	buildCreationSteps,
	buildWritePlan,
	completeManualStep,
	createCreationPacket,
	derivePacketStatus,
	getCreationPacket,
	linkRunSignupRace,
	listCreationPackets,
	probeRunSignupCredentials,
	saveProbeResult,
	setPacketApiFields,
	type CreationPacket,
	type CreationPacketMeta,
	type CredentialProbeResult,
} from "../src/object-creation";
import { renderCreationHtml, renderCreationPacketHtml } from "../src/operating-center-creation";

// ---------------------------------------------------------------------------
// Minimal stateful D1 stub: objects + relationships, keyed on the exact
// statements issued by src/object-creation.ts.
// ---------------------------------------------------------------------------

interface ObjectRow {
	object_id: string;
	object_type: string;
	title: string;
	source: string;
	source_type: string;
	source_id: string | null;
	status: string;
	metadata: string;
	created_at: string;
	updated_at: string;
}

function makeCreationDb() {
	const objects: ObjectRow[] = [];
	const relationships: Array<Record<string, string>> = [];
	const now = () => new Date().toISOString();
	const db = {
		prepare(rawSql: string) {
			const sql = rawSql.replace(/\s+/g, " ").trim();
			let args: unknown[] = [];
			const stmt = {
				bind(...params: unknown[]) {
					args = params;
					return stmt;
				},
				async first() {
					if (sql.startsWith("SELECT object_id, title, metadata, created_at, updated_at FROM objects WHERE object_id = ?")) {
						const row = objects.find((o) => o.object_id === args[0]);
						if (!row) return null;
						if (sql.includes("AND object_type = ?") && row.object_type !== args[1]) return null;
						return {
							object_id: row.object_id,
							title: row.title,
							metadata: row.metadata,
							created_at: row.created_at,
							updated_at: row.updated_at,
						};
					}
					// Object fan-out lookups: no parent object, no existing
					// news slug, no existing sponsorship asset in these tests.
					if (sql.startsWith("SELECT object_type FROM objects WHERE object_id = ? LIMIT 1")) {
						return null;
					}
					if (sql.startsWith("SELECT object_id, title, metadata FROM objects WHERE object_id = ? LIMIT 1")) {
						return null;
					}
					if (sql.startsWith("SELECT id FROM site_news WHERE slug = ? LIMIT 1")) {
						return null;
					}
					if (sql.startsWith("SELECT * FROM sponsorship_assets WHERE id = ?")) {
						return null;
					}
					throw new Error(`unexpected first(): ${sql}`);
				},
				async all() {
					if (sql.startsWith("SELECT object_id, title, metadata, created_at, updated_at FROM objects")) {
						const rows = objects
							.filter((o) => o.object_type === args[0])
							.map((o) => ({
								object_id: o.object_id,
								title: o.title,
								metadata: o.metadata,
								created_at: o.created_at,
								updated_at: o.updated_at,
							}));
						return { results: rows };
					}
					throw new Error(`unexpected all(): ${sql}`);
				},
				async run() {
					if (sql.startsWith("INSERT INTO objects")) {
						const isRunsignup = sql.includes("'runsignup'");
						const [object_id, object_type, title, p4, p5] = args as [string, string, string, string, string?];
						const source_id = isRunsignup ? p4 : null;
						const metadata = isRunsignup ? (p5 as string) : p4;
						const existing = objects.find((o) => o.object_id === object_id);
						const row: ObjectRow = {
							object_id,
							object_type,
							title,
							source: isRunsignup ? "runsignup" : "machine",
							source_type: isRunsignup ? "race" : "creation_packet",
							source_id: source_id ?? null,
							status: "active",
							metadata,
							created_at: existing?.created_at ?? now(),
							updated_at: now(),
						};
						if (existing) Object.assign(existing, row);
						else objects.push(row);
						return { success: true };
					}
					if (sql.startsWith("UPDATE objects SET metadata = ?")) {
						const row = objects.find((o) => o.object_id === args[1]);
						if (row) {
							row.metadata = args[0] as string;
							row.updated_at = now();
						}
						return { success: true };
					}
					if (sql.startsWith("INSERT INTO relationships")) {
						const [relationship_id, subject_object_id, target_object_id, metadata] = args as [string, string, string, string];
						if (!relationships.some((r) => r.relationship_id === relationship_id)) {
							relationships.push({ relationship_id, subject_object_id, relationship_type: sql.includes("'linked_to'") ? "linked_to" : "part_of", target_object_id, metadata });
						}
						return { success: true };
					}
					// Object fan-out (runs inside linkRunSignupRace): the legacy
					// stub records nothing, it only needs to accept the writes.
					if (sql.startsWith("INSERT INTO public_calendar")) {
						return { success: true };
					}
					if (sql.startsWith("INSERT INTO audit_events")) {
						return { success: true };
					}
					if (sql.startsWith("INSERT INTO site_news")) {
						return { success: true };
					}
					if (sql.startsWith("INSERT INTO sponsorship_assets")) {
						return { success: true };
					}
					throw new Error(`unexpected run(): ${sql}`);
				},
			};
			return stmt;
		},
	};
	return { db: db as unknown as D1Database, objects, relationships };
}

function okProbe(): CredentialProbeResult {
	return {
		ran_at: new Date().toISOString(),
		ok: true,
		method: "races-list",
		entity_type: null,
		entity_specific_id: null,
		note: "test probe",
	};
}

function jsonResponse(body: unknown, status = 200) {
	return { ok: status >= 200 && status < 300, status, json: async () => body };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// The honest boundary: creation is never an API step.
// ---------------------------------------------------------------------------

describe("creation step builder", () => {
	it("never turns object creation into an API step", () => {
		const steps = buildCreationSteps({ kind: "race", title: "Test 5K" });
		expect(steps.length).toBeGreaterThan(0);
		expect(steps.every((s) => s.kind === "manual")).toBe(true);
		expect(steps[0].step_id).toBe("dashboard_create_object");
		expect(steps[0].dashboard_steps?.length).toBeGreaterThan(0);
	});

	it("builds API steps only for supplied fields, with replace warnings", () => {
		const steps = buildCreationSteps({
			kind: "series",
			title: "Test Series",
			description: "A series",
			external_race_url: "https://example.com",
			registration_periods: [
				{ registration_opens: "2026-01-01", registration_closes: "2026-02-01", race_fee_in_cents: 5000 },
			],
			age_based_pricing: [
				{ start_time: "2026-01-01", end_time: "2026-02-01", race_fee_in_cents: 4000 },
			],
			questions: [{ question: "T-shirt size" }],
			coupons: [{ coupon_name: "EARLY" }],
			runsignup_event_id: 42,
		});
		const api = steps.filter((s) => s.kind === "api");
		const ids = api.map((s) => s.step_id);
		expect(ids).toEqual([
			"set_race_description",
			"set_race_urls",
			"setup_registration_periods",
			"setup_age_based_pricing",
			"setup_race_questions",
			"add_coupons",
		]);

		const periods = api.find((s) => s.step_id === "setup_registration_periods")!;
		expect(periods.replace_semantics).toBe("full_replace");
		expect(periods.warnings?.some((w) => w.includes("removed and replaced"))).toBe(true);
		expect(periods.requires).toContain("runsignup_event_id");

		const pricing = api.find((s) => s.step_id === "setup_age_based_pricing")!;
		expect(pricing.replace_semantics).toBe("full_replace");
		expect(pricing.warnings?.some((w) => w.includes("removed and replaced"))).toBe(true);

		const questions = api.find((s) => s.step_id === "setup_race_questions")!;
		expect(questions.replace_semantics).toBe("delete_omitted");
		// Safe default: append_questions=T preserves existing questions.
		expect((questions.payload_preview as { append_questions: string }).append_questions).toBe("T");
		expect(questions.warnings?.some((w) => w.includes("preserved"))).toBe(true);
	});

	it("flags replace mode for questions when the owner turns append off", () => {
		const steps = buildCreationSteps({
			kind: "race",
			title: "Test 5K",
			questions: [{ question: "X" }],
			append_questions: false,
		});
		const q = steps.find((s) => s.step_id === "setup_race_questions")!;
		expect((q.payload_preview as { append_questions: string }).append_questions).toBe("F");
		expect(q.warnings?.some((w) => w.includes("DELETED"))).toBe(true);
	});

	it("varies manual steps by kind without inventing API steps", () => {
		const fundraising = buildCreationSteps({ kind: "fundraising", title: "Fund" });
		expect(fundraising.some((s) => s.step_id === "dashboard_fundraising")).toBe(true);
		expect(fundraising.some((s) => s.kind === "api")).toBe(false);

		const store = buildCreationSteps({ kind: "store", title: "Store" });
		expect(store.some((s) => s.step_id === "dashboard_store")).toBe(true);
		expect(store.some((s) => s.kind === "api")).toBe(false);

		const website = buildCreationSteps({ kind: "website", title: "Site" });
		expect(website.some((s) => s.step_id === "dashboard_website")).toBe(true);

		const challenge = buildCreationSteps({ kind: "challenge", title: "Challenge" });
		expect(challenge.some((s) => s.step_id === "dashboard_create_event")).toBe(true);
		expect(challenge.some((s) => s.step_id === "dashboard_sponsors")).toBe(true);
	});
});

describe("field capability map", () => {
	it("marks object creation itself as dashboard-only", () => {
		const entry = OBJECT_FIELD_CAPABILITIES.find((c) => c.field.startsWith("Create the race"));
		expect(entry?.capability).toBe("dashboard_only");
		expect(entry?.endpoint).toBeNull();
	});

	it("never wires an unverified endpoint: entries without a URL carry the honest note", () => {
		for (const c of OBJECT_FIELD_CAPABILITIES) {
			if (c.capability !== "dashboard_only" && c.endpoint === null) {
				expect(c.note).toContain("not yet verified");
			}
		}
	});

	it("flags replace semantics on periods and pricing", () => {
		const periods = OBJECT_FIELD_CAPABILITIES.find((c) => c.field === "Registration periods");
		expect(periods?.capability).toBe("api_replace");
		expect(periods?.endpoint).toBe("POST /rest/race/:race_id/registration-periods");
		const pricing = OBJECT_FIELD_CAPABILITIES.find((c) => c.field === "Age-based pricing");
		expect(pricing?.capability).toBe("api_replace");
	});
});

// ---------------------------------------------------------------------------
// Dry-run plan: always read-only.
// ---------------------------------------------------------------------------

describe("write plan", () => {
	it("is always a dry run and never executes anything", async () => {
		const { db } = makeCreationDb();
		const packet = await createCreationPacket(db, {
			kind: "race",
			title: "Dry Run 5K",
			description: "Desc",
			registration_periods: [
				{ registration_opens: "2026-01-01", registration_closes: "2026-02-01", race_fee_in_cents: 5000 },
			],
			runsignup_event_id: 7,
		});
		const plan = buildWritePlan(packet);
		expect(plan.write_mode).toBe("dry_run");
		expect(plan.executed).toBe(false);
		expect(plan.steps.length).toBe(2);
		expect(plan.steps.every((s) => s.kind === "api")).toBe(true);
		expect(plan.manual_last_mile.length).toBeGreaterThan(0);
		expect(plan.report).toContain("DRY RUN");
		expect(plan.report).toContain("nothing was written");
	});

	it("flags steps waiting for the event ID", async () => {
		const { db } = makeCreationDb();
		const packet = await createCreationPacket(db, {
			kind: "race",
			title: "No Event 5K",
			registration_periods: [
				{ registration_opens: "2026-01-01", registration_closes: "2026-02-01", race_fee_in_cents: 5000 },
			],
		});
		const plan = buildWritePlan(packet);
		const periods = plan.steps.find((s) => s.step_id === "setup_registration_periods")!;
		expect(periods.needs_event_id).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Packet status derivation.
// ---------------------------------------------------------------------------

function metaWith(over: Partial<CreationPacketMeta>): CreationPacketMeta {
	return {
		kind: "race",
		description: null,
		event_date: null,
		distance: null,
		format: null,
		external_race_url: null,
		external_results_url: null,
		facebook_page_id: null,
		runsignup_event_id: null,
		registration_periods: [],
		age_based_pricing: [],
		questions: [],
		append_questions: true,
		coupons: [],
		notes: null,
		runsignup_race_id: null,
		runsignup_race_name: null,
		write_access: "UNKNOWN",
		probe: null,
		steps: [],
		created_by: "engine:object-creation",
		...over,
	};
}

describe("packet status", () => {
	it("walks dashboard_pending -> linked -> api_in_progress -> manual_pending -> complete", () => {
		const draft = derivePacketStatus(metaWith({}));
		expect(draft).toBe("dashboard_pending");

		const linked = derivePacketStatus(
			metaWith({
				runsignup_race_id: 1,
				steps: [
					{ step_id: "m1", kind: "manual", title: "M", description: "", status: "done" },
					{ step_id: "a1", kind: "api", title: "A", description: "", status: "pending" },
				],
			}),
		);
		expect(linked).toBe("linked");

		const inProgress = derivePacketStatus(
			metaWith({
				runsignup_race_id: 1,
				steps: [
					{ step_id: "a1", kind: "api", title: "A", description: "", status: "done" },
					{ step_id: "a2", kind: "api", title: "B", description: "", status: "pending" },
					{ step_id: "m1", kind: "manual", title: "M", description: "", status: "pending" },
				],
			}),
		);
		expect(inProgress).toBe("api_in_progress");

		const manualPending = derivePacketStatus(
			metaWith({
				runsignup_race_id: 1,
				steps: [
					{ step_id: "a1", kind: "api", title: "A", description: "", status: "done" },
					{ step_id: "m1", kind: "manual", title: "M", description: "", status: "pending" },
				],
			}),
		);
		expect(manualPending).toBe("manual_pending");

		const complete = derivePacketStatus(
			metaWith({
				runsignup_race_id: 1,
				steps: [
					{ step_id: "a1", kind: "api", title: "A", description: "", status: "done" },
					{ step_id: "m1", kind: "manual", title: "M", description: "", status: "skipped" },
				],
			}),
		);
		expect(complete).toBe("complete");
	});
});

// ---------------------------------------------------------------------------
// API call builder: exact calls, null for anything not executable.
// ---------------------------------------------------------------------------

describe("api call builder", () => {
	it("returns null without a linked race or for unknown steps", async () => {
		const { db } = makeCreationDb();
		const packet = await createCreationPacket(db, { kind: "race", title: "X", description: "D" });
		expect(buildApiCall(packet, "set_race_description")).toBeNull();
		expect(buildApiCall(packet, "nope")).toBeNull();
	});

	it("builds the exact description call", async () => {
		const { db } = makeCreationDb();
		const created = await createCreationPacket(db, { kind: "race", title: "X", description: "Hello" });
		const packet: CreationPacket = {
			...created,
			meta: { ...created.meta, runsignup_race_id: 123 },
		};
		const call = buildApiCall(packet, "set_race_description")!;
		expect(call.url).toBe("https://api.runsignup.com/rest/race/123/race-description?format=json&request_format=json");
		expect(call.formFields).toEqual({ description: "Hello" });
	});

	it("builds the questions call with append=T by default", async () => {
		const { db } = makeCreationDb();
		const created = await createCreationPacket(db, {
			kind: "race",
			title: "X",
			questions: [{ question: "Size" }],
		});
		const packet: CreationPacket = {
			...created,
			meta: { ...created.meta, runsignup_race_id: 9 },
		};
		const call = buildApiCall(packet, "setup_race_questions")!;
		expect(call.url).toContain("append_questions=T");
		expect(call.requestJson).toEqual({ questions: [{ question: "Size" }] });
	});

	it("refuses period/pricing calls without an event ID", async () => {
		const { db } = makeCreationDb();
		const created = await createCreationPacket(db, {
			kind: "race",
			title: "X",
			registration_periods: [
				{ registration_opens: "2026-01-01", registration_closes: "2026-02-01", race_fee_in_cents: 1 },
			],
		});
		const packet: CreationPacket = {
			...created,
			meta: { ...created.meta, runsignup_race_id: 9 },
		};
		expect(buildApiCall(packet, "setup_registration_periods")).toBeNull();
		const withEvent: CreationPacket = {
			...created,
			meta: { ...created.meta, runsignup_race_id: 9, runsignup_event_id: 3 },
		};
		const call = buildApiCall(withEvent, "setup_registration_periods")!;
		expect(call.url).toContain("/registration-periods");
		expect(call.url).toContain("event_id=3");
	});
});

// ---------------------------------------------------------------------------
// D1 flow: create -> link -> probe -> apply, with mocked HTTP.
// ---------------------------------------------------------------------------

describe("packet persistence and linking", () => {
	it("creates packets in the existing objects table and lists them", async () => {
		const { db, objects } = makeCreationDb();
		const packet = await createCreationPacket(db, { kind: "challenge", title: "C1" });
		expect(packet.packet_id.startsWith("PACKET-")).toBe(true);
		expect(packet.status).toBe("dashboard_pending");
		expect(objects).toHaveLength(1);
		expect(objects[0].object_type).toBe("creation_packet");

		const list = await listCreationPackets(db);
		expect(list).toHaveLength(1);
		expect(list[0].packet_id).toBe(packet.packet_id);

		const fetched = await getCreationPacket(db, packet.packet_id);
		expect(fetched?.title).toBe("C1");
		expect(await getCreationPacket(db, "PACKET-NOPE")).toBeNull();
	});

	it("rejects empty titles and unknown kinds", async () => {
		const { db } = makeCreationDb();
		await expect(createCreationPacket(db, { kind: "race", title: "  " })).rejects.toThrow();
		await expect(
			createCreationPacket(db, { kind: "nope" as "race", title: "X" }),
		).rejects.toThrow();
	});

	it("links a race after read-only verification and stores the relationship", async () => {
		const { db, objects, relationships } = makeCreationDb();
		const packet = await createCreationPacket(db, { kind: "race", title: "R1", description: "D" });
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				expect(String(url)).toContain("/rest/race/123");
				return jsonResponse({ race: { race_id: 123, name: "Verified Race" } });
			}),
		);
		const result = await linkRunSignupRace({
			db,
			accessToken: "tok",
			packetId: packet.packet_id,
			raceId: 123,
			eventId: 5,
		});
		expect(result.ok).toBe(true);
		expect(result.race_name).toBe("Verified Race");

		const raceRow = objects.find((o) => o.object_id === "RUNSIGNUP-RACE-123");
		expect(raceRow?.source).toBe("runsignup");
		expect(raceRow?.source_type).toBe("race");
		expect(relationships).toHaveLength(1);
		expect(relationships[0].relationship_type).toBe("linked_to");
		expect(relationships[0].subject_object_id).toBe(packet.packet_id);

		const updated = await getCreationPacket(db, packet.packet_id);
		expect(updated?.meta.runsignup_race_id).toBe(123);
		expect(updated?.meta.runsignup_event_id).toBe(5);
		expect(updated?.status).toBe("linked");
		// The dashboard-creation step is marked done: the owner proved it exists.
		expect(
			updated?.meta.steps.find((s) => s.step_id === "dashboard_create_object")?.status,
		).toBe("done");
	});

	it("refuses to link an unverifiable race", async () => {
		const { db } = makeCreationDb();
		const packet = await createCreationPacket(db, { kind: "race", title: "R1" });
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "nope" }, 404)));
		await expect(
			linkRunSignupRace({ db, accessToken: "tok", packetId: packet.packet_id, raceId: 999 }),
		).rejects.toThrow();
	});
});

describe("credential probe", () => {
	it("prefers the entity-info endpoint", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				String(url).includes("entity-info")
					? jsonResponse({ entity_info: { entity_type: "race", entity_specific_id: 1 } })
					: jsonResponse({}, 404),
			),
		);
		const probe = await probeRunSignupCredentials({ accessToken: "tok" });
		expect(probe.ok).toBe(true);
		expect(probe.method).toBe("entity-info");
		expect(probe.entity_type).toBe("race");
	});

	it("falls back to the races list, then reports failure honestly", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				String(url).includes("entity-info") ? jsonResponse({}, 401) : jsonResponse({ races: [] }),
			),
		);
		const probe = await probeRunSignupCredentials({ accessToken: "tok" });
		expect(probe.ok).toBe(true);
		expect(probe.method).toBe("races-list");

		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
		const failed = await probeRunSignupCredentials({ accessToken: "tok" });
		expect(failed.ok).toBe(false);
		expect(failed.method).toBe("none");
	});

	it("stores the probe result on the packet", async () => {
		const { db } = makeCreationDb();
		const packet = await createCreationPacket(db, { kind: "race", title: "R1" });
		const updated = await saveProbeResult(db, packet.packet_id, okProbe());
		expect(updated.meta.probe?.ok).toBe(true);
	});
});

describe("apply flow", () => {
	async function readyPacket() {
		const { db, objects } = makeCreationDb();
		const created = await createCreationPacket(db, {
			kind: "race",
			title: "Apply 5K",
			description: "Apply me",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => jsonResponse({ race: { race_id: 55, name: "Apply Race" } })),
		);
		await linkRunSignupRace({ db, accessToken: "tok", packetId: created.packet_id, raceId: 55 });
		await saveProbeResult(db, created.packet_id, okProbe());
		return { db, objects, packetId: created.packet_id };
	}

	it("refuses to apply without the explicit confirmation", async () => {
		const { db, packetId } = await readyPacket();
		await expect(
			applyCreationStep({ db, accessToken: "tok", packetId, stepId: "set_race_description", confirm: "" }),
		).rejects.toThrow(APPLY_STEP_CONFIRM);
		await expect(
			applyCreationStep({ db, accessToken: "tok", packetId, stepId: "set_race_description", confirm: "yes" }),
		).rejects.toThrow(APPLY_STEP_CONFIRM);
	});

	it("refuses manual steps, unknown steps, and already-done steps", async () => {
		const { db, packetId } = await readyPacket();
		await expect(
			applyCreationStep({ db, accessToken: "tok", packetId, stepId: "dashboard_create_object", confirm: APPLY_STEP_CONFIRM }),
		).rejects.toThrow("manual");
		await expect(
			applyCreationStep({ db, accessToken: "tok", packetId, stepId: "nope", confirm: APPLY_STEP_CONFIRM }),
		).rejects.toThrow("Unknown step");
	});

	it("refuses when write access is DENIED or the probe never ran", async () => {
		const { db, objects, packetId } = await readyPacket();
		// Simulate a previously denied credential set by editing stored meta.
		const row = objects.find((o) => o.object_id === packetId)!;
		const meta = JSON.parse(row.metadata) as CreationPacketMeta;
		meta.write_access = "DENIED";
		row.metadata = JSON.stringify(meta);
		await expect(
			applyCreationStep({ db, accessToken: "tok", packetId, stepId: "set_race_description", confirm: APPLY_STEP_CONFIRM }),
		).rejects.toThrow("DENIED");

		const second = makeCreationDb();
		const created = await createCreationPacket(second.db, { kind: "race", title: "NoProbe", description: "D" });
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ race: { race_id: 1 } })));
		await linkRunSignupRace({ db: second.db, accessToken: "tok", packetId: created.packet_id, raceId: 1 });
		await expect(
			applyCreationStep({ db: second.db, accessToken: "tok", packetId: created.packet_id, stepId: "set_race_description", confirm: APPLY_STEP_CONFIRM }),
		).rejects.toThrow("probe");
	});

	it("applies a confirmed step and marks write access CONFIRMED", async () => {
		const { db, packetId } = await readyPacket();
		const fetchMock = vi.fn(async () => jsonResponse({}));
		vi.stubGlobal("fetch", fetchMock);
		const result = await applyCreationStep({
			db,
			accessToken: "tok",
			packetId,
			stepId: "set_race_description",
			confirm: APPLY_STEP_CONFIRM,
		});
		expect(result.ok).toBe(true);
		expect(result.write_access).toBe("CONFIRMED");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const calledUrl = String(fetchMock.mock.calls[0][0]);
		expect(calledUrl).toBe("https://api.runsignup.com/rest/race/55/race-description?format=json&request_format=json");

		const updated = await getCreationPacket(db, packetId);
		expect(updated?.meta.steps.find((s) => s.step_id === "set_race_description")?.status).toBe("done");
		expect(updated?.meta.write_access).toBe("CONFIRMED");

		await expect(
			applyCreationStep({ db, accessToken: "tok", packetId, stepId: "set_race_description", confirm: APPLY_STEP_CONFIRM }),
		).rejects.toThrow("already done");
	});

	it("marks write access DENIED on 401/403 without retrying", async () => {
		const { db, packetId } = await readyPacket();
		const fetchMock = vi.fn(async () => jsonResponse({ error: "denied" }, 403));
		vi.stubGlobal("fetch", fetchMock);
		const result = await applyCreationStep({
			db,
			accessToken: "tok",
			packetId,
			stepId: "set_race_description",
			confirm: APPLY_STEP_CONFIRM,
		});
		expect(result.ok).toBe(false);
		expect(result.write_access).toBe("DENIED");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const updated = await getCreationPacket(db, packetId);
		expect(updated?.meta.steps.find((s) => s.step_id === "set_race_description")?.status).toBe("error");
	});
});

describe("manual steps and field edits", () => {
	it("completes manual steps via owner attestation only", async () => {
		const { db } = makeCreationDb();
		const packet = await createCreationPacket(db, { kind: "race", title: "M1" });
		const result = await completeManualStep(db, packet.packet_id, "dashboard_email");
		expect(result.ok).toBe(true);
		const updated = await getCreationPacket(db, packet.packet_id);
		expect(updated?.meta.steps.find((s) => s.step_id === "dashboard_email")?.status).toBe("done");
		await expect(completeManualStep(db, packet.packet_id, "set_race_description")).rejects.toThrow();
	});

	it("edits fields and rebuilds steps while keeping completed statuses", async () => {
		const { db } = makeCreationDb();
		const packet = await createCreationPacket(db, { kind: "race", title: "E1" });
		await completeManualStep(db, packet.packet_id, "dashboard_email");
		const updated = await setPacketApiFields(db, packet.packet_id, {
			description: "New desc",
			registration_periods: [
				{ registration_opens: "2026-01-01", registration_closes: "2026-02-01", race_fee_in_cents: 100 },
			],
		});
		expect(updated.meta.description).toBe("New desc");
		expect(updated.meta.steps.find((s) => s.step_id === "dashboard_email")?.status).toBe("done");
		expect(updated.meta.steps.some((s) => s.step_id === "set_race_description")).toBe(true);
		expect(updated.meta.steps.some((s) => s.step_id === "setup_registration_periods")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// UI: owner gate, creation workflow, no distribution.
// ---------------------------------------------------------------------------

describe("creation page UI", () => {
	it("renders the owner-key gate and the creation workflow endpoints", () => {
		const html = renderCreationHtml();
		expect(html).toContain("nwana_operating_center_key");
		expect(html).toContain("/api/operating-center/object-creation/packets");
		expect(html).toContain("New object packet");
		expect(html).toContain("Create objects");
	});

	it("renders the packet page with the explicit confirmation flow", () => {
		const html = renderCreationPacketHtml();
		expect(html).toContain("nwana_operating_center_key");
		expect(html).toContain("APPLY_STEP");
		expect(html).toContain("/api/operating-center/object-creation/apply");
		expect(html).toContain("/api/operating-center/object-creation/link");
		expect(html).toContain("Manual last mile");
	});

	it("mentions no distribution: this stage does not publish anything", () => {
		const list = renderCreationHtml();
		const detail = renderCreationPacketHtml();
		expect(list.toLowerCase()).not.toContain("distribut");
		expect(detail.toLowerCase()).not.toContain("distribut");
	});
});
