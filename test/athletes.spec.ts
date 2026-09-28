// Canonical athlete profiles: victory rule, DSQ/DNS exclusion, non-final
// exclusion, per-distance breakdown, best times, materialized refresh.

import { describe, expect, it } from "vitest";
import {
	computeAthleteStats,
	getAthleteProfile,
	refreshAthleteStats,
} from "../src/athletes";

interface EventRow {
	event_date: string | null;
	distance: string | null;
	results_json: string;
	finalized: number;
}

function makeDb(events: EventRow[], dsqIds: string[] = [], profile: any = null) {
	let stored: any = profile;
	const norm = (s: string) => s.replace(/\s+/g, " ").trim();
	const db = {
		prepare(rawSql: string) {
			const sql = norm(rawSql);
			let args: unknown[] = [];
			const stmt = {
				bind(...params: unknown[]) {
					args = params;
					return stmt;
				},
				async all<T>() {
					if (sql.startsWith("SELECT event_date, distance, results_json, finalized")) {
						return { results: events.filter((e) => e.finalized === 1) as unknown as T[] };
					}
					if (sql.startsWith("SELECT result_id FROM series_result_disqualifications")) {
						return { results: dsqIds.map((id) => ({ result_id: id })) as unknown as T[] };
					}
					if (sql.startsWith("SELECT slug, full_name, stats_computed_at")) {
						return { results: stored ? [{ slug: stored.slug, full_name: stored.full_name, stats_computed_at: stored.stats_computed_at }] as unknown as T[] : [] };
					}
					throw new Error("unexpected SELECT: " + sql);
				},
				async first<T>() {
					if (sql.startsWith("SELECT * FROM athlete_profiles WHERE slug = ?")) {
						return (stored && stored.slug === args[0] ? stored : null) as unknown as T;
					}
					throw new Error("unexpected first: " + sql);
				},
				async run() {
					if (sql.startsWith("UPDATE athlete_profiles")) {
						if (stored && stored.slug === args[3]) {
							stored = {
								...stored,
								computed_stats_json: args[0],
								stats_computed_at: args[1],
								updated_at: args[2],
							};
						}
						return { success: true };
					}
					throw new Error("unexpected run: " + sql);
				},
			};
			return stmt;
		},
	};
	return { db: db as unknown as D1Database, getStored: () => stored };
}

const EVENTS: EventRow[] = [
	{
		event_date: "2026-09-26",
		distance: "3K",
		finalized: 1,
		results_json: JSON.stringify([
			{ athlete: "Albert Fatikhov", time: "18:54", level_place: "1", result_id: "232501676" },
			{ athlete: "Susan Otto", time: "22:10", level_place: "1", result_id: "r2" },
		]),
	},
	{
		event_date: "2026-09-27",
		distance: "5K",
		finalized: 1,
		results_json: JSON.stringify([
			{ athlete: "Albert Fatikhov", time: "30:38", level_place: "2", result_id: "r3" },
			{ athlete: "Michael Blanchard", time: "39:11", level_place: "1", result_id: "r4" },
		]),
	},
	{
		event_date: "2026-09-27",
		distance: "5K",
		finalized: 0, // draft / non-final: must be excluded
		results_json: JSON.stringify([
			{ athlete: "Albert Fatikhov", time: "29:00", level_place: "1", result_id: "r5" },
		]),
	},
];

describe("computeAthleteStats", () => {
	it("counts wins as level_place 1 in finalized results only", async () => {
		const { db } = makeDb(EVENTS);
		const s = await computeAthleteStats(db, "Albert Fatikhov");
		expect(s.starts).toBe(2); // non-finalized event excluded
		expect(s.finishes).toBe(2);
		expect(s.wins).toBe(1); // 3K win; 5K was place 2
		expect(s.podiums).toBe(2);
		expect(s.season_wins).toEqual({ "2026": 1 });
		expect(s.by_distance["3K"].wins).toBe(1);
		expect(s.by_distance["5K"].wins).toBe(0);
		expect(s.best_times["3K"]).toBe("18:54");
		expect(s.best_times["5K"]).toBe("30:38");
		expect(s.last_event_date).toBe("2026-09-27");
	});

	it("excludes owner-disqualified results even with level_place 1", async () => {
		const { db } = makeDb(EVENTS, ["232501676"]);
		const s = await computeAthleteStats(db, "Albert Fatikhov");
		expect(s.starts).toBe(1);
		expect(s.wins).toBe(0);
	});

	it("excludes DNS/DNF/DSQ from finishes, wins, best times", async () => {
		const events: EventRow[] = [
			{
				event_date: "2026-09-20",
				distance: "10K",
				finalized: 1,
				results_json: JSON.stringify([
					{ athlete: "Albert Fatikhov", time: "DNS", level_place: null, result_id: "d1" },
					{ athlete: "Albert Fatikhov", time: "DSQ", level_place: "1", result_id: "d2" },
				]),
			},
		];
		const { db } = makeDb(events);
		const s = await computeAthleteStats(db, "Albert Fatikhov");
		expect(s.starts).toBe(2);
		expect(s.finishes).toBe(0);
		expect(s.wins).toBe(0);
		expect(s.best_times["10K"]).toBeUndefined();
	});

	it("matches athlete names case-insensitively", async () => {
		const { db } = makeDb(EVENTS);
		const s = await computeAthleteStats(db, "albert fatikhov");
		expect(s.starts).toBe(2);
	});
});

describe("refreshAthleteStats", () => {
	it("materializes stats into the profile row (Engine is the single writer)", async () => {
		const profile = {
			slug: "albert-fatikhov",
			full_name: "Albert Fatikhov",
			results_name: "Albert Fatikhov",
			org_role: "President",
			athlete_role: "Athlete",
			country_code: "US",
			public_property_url: "https://albertfatikhov.nwaofna.org/",
			photo_url: null,
			credentials_json: "[]",
			computed_stats_json: null,
			stats_computed_at: null,
			updated_at: "2026-09-28T00:00:00Z",
		};
		const { db, getStored } = makeDb(EVENTS, [], profile);
		const s = await refreshAthleteStats(db, "albert-fatikhov");
		expect(s).not.toBeNull();
		expect(s!.wins).toBe(1);
		const stored = getStored();
		expect(stored.stats_computed_at).toBe(s!.computed_at);
		const reread = await getAthleteProfile(db, "albert-fatikhov");
		expect(reread!.stats!.wins).toBe(1);
		expect(reread!.full_name).toBe("Albert Fatikhov");
	});

	it("returns null for unknown slug", async () => {
		const { db } = makeDb(EVENTS, [], null);
		expect(await refreshAthleteStats(db, "nope")).toBeNull();
		expect(await getAthleteProfile(db, "nope")).toBeNull();
	});
});
