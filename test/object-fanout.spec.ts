// Object fan-out: create once in the Machine, appear everywhere.
// Executable tests for src/object-fanout.ts wired through linkRunSignupRace.
//
// - Challenges land in kind='challenge' only; competitions in
//   kind='competition' only. The two public calendars never mix.
// - Linking a packet materializes the object across calendar, parent
//   relationship, activity log, optional news, optional sponsorship draft
//   with no second manual input.
// - Fan-out is idempotent.
// - News is created only with an explicit announce_news flag.
// - Sponsorship drafts are created only for sellable kinds when relevant.
// - The dry-run / write-access safety of the creation workflow is unchanged.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	APPLY_STEP_CONFIRM,
	applyCreationStep,
	buildWritePlan,
	createCreationPacket,
	getCreationPacket,
	linkRunSignupRace,
} from "../src/object-creation";
import { KIND_TO_CALENDAR } from "../src/object-fanout";

// ---------------------------------------------------------------------------
// Minimal stateful D1 stub, keyed on the exact statements issued by
// src/object-creation.ts, src/object-fanout.ts, and src/sponsorship-asset.ts.
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

interface CalendarRow {
	object_id: string;
	kind: string;
	title: string;
	event_date: string | null;
	url: string | null;
	series_ref: string | null;
	championship_ref: string | null;
	status: string;
}

function makeFanoutDb() {
	const objects: ObjectRow[] = [];
	const relationships: Array<Record<string, unknown>> = [];
	const calendar: CalendarRow[] = [];
	const audit: Array<Record<string, unknown>> = [];
	const news: Array<Record<string, unknown>> = [];
	const assets: Array<Record<string, unknown>> = [];
	const ahotuQueue: Array<Record<string, unknown>> = [];
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
					if (
						sql.startsWith("SELECT object_id, title, metadata, created_at, updated_at FROM objects WHERE object_id = ?")
					) {
						const row = objects.find((o) => o.object_id === args[0]);
						return row
							? {
									object_id: row.object_id,
									title: row.title,
									metadata: row.metadata,
									created_at: row.created_at,
									updated_at: row.updated_at,
								}
							: null;
					}
					if (sql.startsWith("SELECT object_type FROM objects WHERE object_id = ? LIMIT 1")) {
						const row = objects.find((o) => o.object_id === args[0]);
						return row ? { object_type: row.object_type } : null;
					}
					if (sql.startsWith("SELECT object_id, title, metadata FROM objects WHERE object_id = ? LIMIT 1")) {
						const row = objects.find((o) => o.object_id === args[0]);
						return row
							? { object_id: row.object_id, title: row.title, metadata: row.metadata }
							: null;
					}
					if (sql.startsWith("SELECT id FROM site_news WHERE slug = ? LIMIT 1")) {
						const row = news.find((n) => n.slug === args[0]);
						return row ? { id: row.id } : null;
					}
					if (sql.startsWith("SELECT * FROM sponsorship_assets WHERE id = ?")) {
						const row = assets.find((a) => a.id === args[0]);
						return row ?? null;
					}
					throw new Error(`unexpected first(): ${sql}`);
				},
				async run() {
					if (sql.startsWith("INSERT INTO objects (object_id, object_type, title, source, source_type, source_id, status, metadata)")) {
						// metadata is always the last bind arg (4 args for packets, 5 for race links).
						const object_id = args[0] as string;
						const object_type = args[1] as string;
						const title = args[2] as string;
						const metadata = args[args.length - 1] as string;
						const source = sql.includes("'machine'") ? "machine" : "runsignup";
						const source_type = sql.includes("'creation_packet'") ? "creation_packet" : "race";
						const existing = objects.find((o) => o.object_id === object_id);
						if (existing) {
							existing.title = title;
							existing.metadata = metadata;
							existing.updated_at = now();
						} else {
							objects.push({
								object_id,
								object_type,
								title,
								source,
								source_type,
								source_id: args.length === 5 ? (args[3] as string | null) : null,
								status: "active",
								metadata,
								created_at: now(),
								updated_at: now(),
							});
						}
						return {};
					}
					if (sql.startsWith("UPDATE objects SET metadata = ?")) {
						const row = objects.find((o) => o.object_id === args[1]);
						if (row) {
							row.metadata = args[0] as string;
							row.updated_at = now();
						}
						return {};
					}
					if (sql.startsWith("INSERT INTO relationships")) {
						const [relationship_id, subject_object_id, target_object_id, extra] = args as [
							string,
							string,
							string,
							unknown,
						];
						const relationship_type = sql.includes("'linked_to'") ? "linked_to" : "part_of";
						const existing = relationships.find((r) => r.relationship_id === relationship_id);
						if (!existing) {
							relationships.push({ relationship_id, subject_object_id, relationship_type, target_object_id, metadata: extra });
						}
						return {};
					}
					if (sql.startsWith("INSERT INTO public_calendar")) {
						const [object_id, kind, title, event_date, url, series_ref, championship_ref] = args as Array<string | null>;
						const existing = calendar.find((c) => c.object_id === object_id && c.kind === kind);
						if (existing) {
							existing.title = title as string;
							existing.event_date = event_date;
							existing.url = url;
							existing.series_ref = series_ref;
							existing.championship_ref = championship_ref;
						} else {
							calendar.push({
								object_id: object_id as string,
								kind: kind as string,
								title: title as string,
								event_date,
								url,
								series_ref,
								championship_ref,
								status: "scheduled",
							});
						}
						return {};
					}
					if (sql.startsWith("INSERT INTO audit_events")) {
						audit.push({ audit_id: args[0], object_id: args[1], details: args[3] });
						return {};
					}
					if (sql.startsWith("INSERT INTO site_news")) {
						news.push({ id: news.length + 1, slug: args[0], title: args[1] });
						return {};
					}
					if (sql.startsWith("INSERT INTO sponsorship_assets")) {
						assets.push({
							id: args[0],
							object_type: args[1],
							object_id: args[2],
							title: args[3],
							stage: "draft",
						});
						return {};
					}
					if (sql.startsWith("INSERT INTO ahotu_queue")) {
						// Ahotu lane (src/ahotu.ts): ON CONFLICT(object_id) DO NOTHING.
						if (!ahotuQueue.some((q) => q.object_id === args[0])) {
							ahotuQueue.push({
								id: ahotuQueue.length + 1,
								object_id: args[0] as string,
								kind: args[1] as string,
								status: "queued",
								package_json: args[2] as string,
								notes: args[3] as string,
							});
						}
						return {};
					}
					throw new Error(`unexpected run(): ${sql}`);
				},
			};
			return stmt;
		},
	};
	return { db: db as unknown as D1Database, objects, relationships, calendar, audit, news, assets, ahotuQueue };
}

const jsonResponse = (payload: unknown, status = 200) =>
	({ ok: status < 300, status, json: async () => payload }) as unknown as Response;

const raceFetch = (raceId: number, name: string) =>
	vi.fn(async (url: string) => {
		if (!String(url).includes(`/rest/race/${raceId}`)) throw new Error(`unexpected url ${url}`);
		return jsonResponse({ race: { race_id: raceId, name } });
	});

afterEach(() => {
	vi.unstubAllGlobals();
});

async function linkPacket(
	db: D1Database,
	input: Parameters<typeof createCreationPacket>[1],
	raceId: number,
	raceName: string,
) {
	const packet = await createCreationPacket(db, input);
	vi.stubGlobal("fetch", raceFetch(raceId, raceName));
	return linkRunSignupRace({ db, accessToken: "tok", packetId: packet.packet_id, raceId });
}

describe("kind separation", () => {
	it("maps every creation kind to exactly one public calendar", () => {
		expect(KIND_TO_CALENDAR.challenge).toBe("challenge");
		expect(KIND_TO_CALENDAR.series).toBe("competition");
		expect(KIND_TO_CALENDAR.championship).toBe("competition");
		expect(KIND_TO_CALENDAR.race).toBe("competition");
		expect(KIND_TO_CALENDAR.fundraising).toBeNull();
		expect(KIND_TO_CALENDAR.membership).toBeNull();
		expect(KIND_TO_CALENDAR.website).toBeNull();
	});

	it("a challenge never lands in the competition calendar", async () => {
		const { db, calendar } = makeFanoutDb();
		const result = await linkPacket(db, { kind: "challenge", title: "30K Challenge", event_date: "2026-11-01" }, 901, "Challenge Race");
		expect(result.ok).toBe(true);
		expect(result.fanout.calendar).toEqual({ kind: "challenge", object_id: "RUNSIGNUP-RACE-901" });
		expect(calendar.filter((c) => c.kind === "competition")).toHaveLength(0);
		expect(calendar.filter((c) => c.kind === "challenge")).toHaveLength(1);
	});

	it("a competition never lands in the challenges calendar", async () => {
		const { db, calendar } = makeFanoutDb();
		const result = await linkPacket(db, { kind: "race", title: "5K Race", event_date: "2026-11-08" }, 902, "Race 902");
		expect(result.ok).toBe(true);
		expect(result.fanout.calendar).toEqual({ kind: "competition", object_id: "RUNSIGNUP-RACE-902" });
		expect(calendar.filter((c) => c.kind === "challenge")).toHaveLength(0);
	});

	it("internal-only kinds get no calendar row", async () => {
		const { db, calendar } = makeFanoutDb();
		const result = await linkPacket(db, { kind: "fundraising", title: "Fund Drive" }, 903, "Fund Race");
		expect(result.ok).toBe(true);
		expect(result.fanout.calendar).toBeNull();
		expect(calendar).toHaveLength(0);
	});
});

describe("linked packet materializes with no second manual input", () => {
	it("calendar row, parent link, activity, sponsorship draft, persisted summary", async () => {
		const { db, objects, relationships, calendar, audit, assets } = makeFanoutDb();
		// Parent series created first (canonical object row, as the Machine would hold it).
		objects.push({
			object_id: "SERIES-2027",
			object_type: "series",
			title: "NWANA Open Series 2027",
			source: "machine",
			source_type: "series",
			source_id: null,
			status: "active",
			metadata: JSON.stringify({ description: "Series 2027" }),
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		});
		const result = await linkPacket(
			db,
			{ kind: "race", title: "5K Orlando", event_date: "2026-12-05", parent_object_id: "SERIES-2027" },
			904,
			"Orlando 5K",
		);
		expect(result.ok).toBe(true);

		// Calendar projection carries the date and the series scope.
		expect(calendar).toHaveLength(1);
		expect(calendar[0].kind).toBe("competition");
		expect(calendar[0].event_date).toBe("2026-12-05");
		expect(calendar[0].series_ref).toBe("SERIES-2027");

		// Parent relationship recorded; type comes from the objects table.
		const partOf = relationships.find((r) => r.relationship_type === "part_of");
		expect(partOf?.subject_object_id).toBe("RUNSIGNUP-RACE-904");
		expect(partOf?.target_object_id).toBe("SERIES-2027");
		expect(result.fanout.parent_relationship).toContain("PARTOF-SERIES-2027");

		// Activity log written to the existing audit_events.
		expect(audit).toHaveLength(1);
		expect(audit[0].object_id).toBe("RUNSIGNUP-RACE-904");
		expect(result.fanout.activity).toBe(true);

		// Race is not a sellable kind: no sponsorship draft.
		expect(assets).toHaveLength(0);
		expect(result.fanout.sponsorship_asset).toBeNull();

		// Summary persisted on the packet for the Operating Center.
		const packet = await getCreationPacket(db, result.packet_id);
		expect(packet?.meta.fanout?.calendar?.kind).toBe("competition");
	});

	it("a series packet generates a sponsorship draft", async () => {
		const { db, assets } = makeFanoutDb();
		const result = await linkPacket(db, { kind: "series", title: "NWANA Open Series 2027" }, 905, "Series Race");
		expect(result.fanout.sponsorship_asset).not.toBeNull();
		expect(result.fanout.sponsorship_asset?.generated).toBe(true);
		expect(assets).toHaveLength(1);
		expect(assets[0].object_type).toBe("series");
		expect(assets[0].object_id).toBe("RUNSIGNUP-RACE-905");
		expect(assets[0].stage).toBe("draft");
	});

	it("a championship packet gets the championship scope on its calendar row", async () => {
		const { db, calendar } = makeFanoutDb();
		await linkPacket(db, { kind: "championship", title: "US Championship", event_date: "2027-06-01" }, 906, "Champ Race");
		expect(calendar[0].kind).toBe("competition");
		expect(calendar[0].championship_ref).toBe("RUNSIGNUP-RACE-906");
		expect(calendar[0].series_ref).toBeNull();
	});
});

describe("news gate", () => {
	it("creates a news item only when announce_news is set", async () => {
		const { db: db1, news: news1 } = makeFanoutDb();
		const r1 = await linkPacket(db1, { kind: "race", title: "Quiet Race", announce_news: true }, 907, "Quiet");
		expect(r1.fanout.news).not.toBeNull();
		expect(news1).toHaveLength(1);

		const { db: db2, news: news2 } = makeFanoutDb();
		const r2 = await linkPacket(db2, { kind: "race", title: "Quieter Race" }, 908, "Quieter");
		expect(r2.fanout.news).toBeNull();
		expect(news2).toHaveLength(0);
	});
});

describe("idempotency", () => {
	it("re-linking the same packet does not duplicate fan-out rows", async () => {
		const { db, calendar, relationships, audit, news, assets } = makeFanoutDb();
		const packet = await createCreationPacket(db, {
			kind: "series",
			title: "Series X",
			event_date: "2027-01-10",
			announce_news: true,
		});
		vi.stubGlobal("fetch", raceFetch(909, "Series X Race"));
		const first = await linkRunSignupRace({ db, accessToken: "tok", packetId: packet.packet_id, raceId: 909 });
		const second = await linkRunSignupRace({ db, accessToken: "tok", packetId: packet.packet_id, raceId: 909 });
		expect(first.ok && second.ok).toBe(true);

		expect(calendar.filter((c) => c.object_id === "RUNSIGNUP-RACE-909")).toHaveLength(1);
		expect(
			relationships.filter(
				(r) => r.relationship_type === "linked_to" && r.target_object_id === "RUNSIGNUP-RACE-909",
			),
		).toHaveLength(1);
		// News slug dedupes instead of duplicating.
		expect(news).toHaveLength(2);
		expect(new Set(news.map((n) => n.slug)).size).toBe(2);
		// Sponsorship draft is not regenerated.
		expect(assets).toHaveLength(1);
		expect(second.fanout.sponsorship_asset?.generated).toBe(false);
		// Audit log is append-only by design: one row per link.
		expect(audit).toHaveLength(2);
	});
});

describe("creation workflow safety is unchanged", () => {	it("packets still default to dry-run with UNKNOWN write access", async () => {
		const { db } = makeFanoutDb();
		const packet = await createCreationPacket(db, { kind: "race", title: "Safe" });
		const plan = buildWritePlan(packet);
		expect(plan.write_access).toBe("UNKNOWN");
		expect(plan.steps.every((s) => s.status === "pending" || s.status === "done")).toBe(true);
	});

	it("API steps still require the explicit APPLY_STEP confirmation", async () => {
		const { db } = makeFanoutDb();
		const packet = await createCreationPacket(db, { kind: "race", title: "Safe", description: "A test race" });
		const step = packet.meta.steps.find((s) => s.step_id === "set_race_description");
		expect(step).toBeDefined();
		await expect(
			applyCreationStep({ db, accessToken: "tok", packetId: packet.packet_id, stepId: "set_race_description", confirm: "yes" }),
		).rejects.toThrow(APPLY_STEP_CONFIRM);
	});
});

describe("ahotu lane auto-enqueue", () => {
	it("linking a race packet enqueues one Ahotu row", async () => {
		const { db, ahotuQueue } = makeFanoutDb();
		await linkPacket(
			db,
			{ kind: "race", title: "5K Orlando", event_date: "2026-12-05", distance: "5K" },
			909,
			"Race 909",
		);
		expect(ahotuQueue).toHaveLength(1);
		expect(ahotuQueue[0].object_id).toBe("RUNSIGNUP-RACE-909");
		expect(ahotuQueue[0].kind).toBe("race");
		expect(ahotuQueue[0].status).toBe("queued");
		const pkg = JSON.parse(ahotuQueue[0].package_json as string);
		expect(pkg.edition_date).toBe("2026-12-05");
		expect(pkg.distances).toEqual(["5K"]);
		expect(pkg.race_activity).toBe("Nordic walking");
	});

	it("re-linking does not duplicate the Ahotu row", async () => {
		const { db, ahotuQueue } = makeFanoutDb();
		const input = { kind: "race" as const, title: "Quiet Race" };
		const packet = await createCreationPacket(db, input);
		vi.stubGlobal("fetch", raceFetch(910, "Quiet"));
		await linkRunSignupRace({ db, accessToken: "tok", packetId: packet.packet_id, raceId: 910 });
		await linkRunSignupRace({ db, accessToken: "tok", packetId: packet.packet_id, raceId: 910 });
		expect(ahotuQueue).toHaveLength(1);
	});

	it("linking a challenge never touches the Ahotu queue", async () => {
		const { db, ahotuQueue } = makeFanoutDb();
		await linkPacket(
			db,
			{ kind: "challenge", title: "30K Challenge", event_date: "2026-11-01" },
			911,
			"Challenge Race",
		);
		expect(ahotuQueue).toHaveLength(0);
	});
});
