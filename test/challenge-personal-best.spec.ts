// Tests for challenge-personal-best.ts (recognition v1).
// Pure-logic tests + recompute/ingest tests against a minimal in-memory
// fake of the D1 surface used by the module. Series 2026 code is only
// imported read-only (never modified); these tests pin that the charity
// path classifies exactly like classifySeries2026Level.

import { describe, expect, it } from "vitest";
import {
	classifyCharityNwLevel,
	computePersonalBest,
	ingestChallengeResultRows,
	isSpeedEvent,
	recomputePersonalBest,
	SPEED_EVENT_IDS,
	type PbActivityInput,
	type PbDatabase,
} from "../src/challenge-personal-best";
import { classifySeries2026Level } from "../src/race-lifecycle";

const NW_5K = 1222836; // Nordic Walking — 5K
const RUN_5K = 1222848; // Running — 5K (no levels)
const NW_WEEKLY = 1222833; // mileage (no PB at all)

interface ActRow {
	tally_split_num: number;
	rsu_user_id: number;
	sub_event_id: number;
	time_s: number | null;
	activity_date: string;
}
interface PbRow {
	rsu_user_id: number;
	event_id: number;
	best_time_s: number;
	best_tally_split_num: number;
	best_activity_date: string;
	previous_best_s: number | null;
	improvement_s: number | null;
	performance_level: string | null;
	pb_achieved_at: string;
}

/** Minimal in-memory fake implementing the exact SQL the module issues. */
function makeFakeDb(seedActivities: ActRow[] = []): PbDatabase & {
	activities: Map<number, ActRow>;
	pbs: Map<string, PbRow>;
} {
	const activities = new Map<number, ActRow>(seedActivities.map((a) => [a.tally_split_num, a]));
	const pbs = new Map<string, PbRow>();
	const norm = (sql: string) => sql.toLowerCase().replace(/\s+/g, " ").trim();

	const db: PbDatabase & { activities: Map<number, ActRow>; pbs: Map<string, PbRow> } = {
		activities,
		pbs,
		prepare(sql: string) {
			const q = norm(sql);
			return {
				bind(...args: unknown[]) {
					const first = async <T>(): Promise<T | null> => {
						if (q.startsWith("select best_time_s from challenge_personal_bests")) {
							const row = pbs.get(`${args[0]}:${args[1]}`);
							return (row ? { best_time_s: row.best_time_s } : null) as T | null;
						}
						throw new Error("fakeDb.first: unsupported query: " + q);
					};
					const all = async <T>(): Promise<{ results: T[] }> => {
						if (q.startsWith("select tally_split_num, time_s, activity_date from challenge_activities")) {
							const [uid, eid] = args as [number, number];
							const results = [...activities.values()]
								.filter((a) => a.rsu_user_id === uid && a.sub_event_id === eid && a.time_s !== null && a.time_s > 0)
								.map((a) => ({
									tally_split_num: a.tally_split_num,
									time_s: a.time_s,
									activity_date: a.activity_date,
								}));
							return { results: results as T[] };
						}
						throw new Error("fakeDb.all: unsupported query: " + q);
					};
					const run = async (): Promise<unknown> => {
						if (q.startsWith("delete from challenge_personal_bests")) {
							pbs.delete(`${args[0]}:${args[1]}`);
							return { meta: { changes: 1 } };
						}
						if (q.startsWith("insert or replace into challenge_personal_bests")) {
							const [uid, eid, best, tally, date, prev, impr, level] = args as [
								number, number, number, number, string,
								number | null, number | null, string | null,
							];
							const key = `${uid}:${eid}`;
							const existing = pbs.get(key);
							pbs.set(key, {
								rsu_user_id: uid, event_id: eid, best_time_s: best,
								best_tally_split_num: tally, best_activity_date: date,
								previous_best_s: prev, improvement_s: impr, performance_level: level,
								pb_achieved_at: existing?.pb_achieved_at ?? "2026-10-07T00:00:00.000Z",
							});
							return { meta: { changes: 1 } };
						}
						if (q.startsWith("insert or ignore into challenge_activities")) {
							const [tally, , , subEid, , uid, , date, , timeS] = args as [
								number, unknown, unknown, number, unknown, number,
								unknown, string, unknown, number | null,
							];
							if (activities.has(tally)) return { meta: { changes: 0 } };
							activities.set(tally, {
								tally_split_num: tally, rsu_user_id: uid, sub_event_id: subEid,
								time_s: timeS, activity_date: date,
							});
							return { meta: { changes: 1 } };
						}
						throw new Error("fakeDb.run: unsupported query: " + q);
					};
					return { first, all, run };
				},
			};
		},
	};
	return db;
}

const act = (
	tally: number, uid: number, eid: number, timeS: number | null, date: string,
): ActRow => ({ tally_split_num: tally, rsu_user_id: uid, sub_event_id: eid, time_s: timeS, activity_date: date });

describe("speed event set", () => {
	it("covers exactly the 19 fixed-distance events", () => {
		expect(SPEED_EVENT_IDS).toHaveLength(19);
		expect(isSpeedEvent(1222834)).toBe(true);
		expect(isSpeedEvent(1222850)).toBe(true); // Running HM
		expect(isSpeedEvent(1222900)).toBe(true); // Walking 10K
		expect(isSpeedEvent(NW_WEEKLY)).toBe(false);
		expect(isSpeedEvent(1222838)).toBe(false); // relay
		expect(isSpeedEvent(1222924)).toBe(false); // open challenge
	});
});

describe("computePersonalBest (pure)", () => {
	it("returns null with no valid results", () => {
		expect(computePersonalBest(NW_5K, [])).toBeNull();
		expect(
			computePersonalBest(NW_5K, [
				{ tally_split_num: 1, time_s: 0, activity_date: "2026-10-01" },
			]),
		).toBeNull();
	});

	it("records a baseline on the first valid result", () => {
		const pb = computePersonalBest(NW_5K, [
			{ tally_split_num: 7, time_s: 2400, activity_date: "2026-10-01" },
		]);
		expect(pb).toMatchObject({
			best_time_s: 2400,
			best_tally_split_num: 7,
			previous_best_s: null,
			improvement_s: null,
			total_valid_results: 1,
		});
	});

	it("detects improvement and stores previous/new/improvement", () => {
		const activities: PbActivityInput[] = [
			{ tally_split_num: 7, time_s: 2400, activity_date: "2026-10-01" },
			{ tally_split_num: 8, time_s: 2250, activity_date: "2026-10-05" },
		];
		const pb = computePersonalBest(NW_5K, activities)!;
		expect(pb.best_time_s).toBe(2250);
		expect(pb.previous_best_s).toBe(2400);
		expect(pb.improvement_s).toBe(150);
	});

	it("ignores null/zero/negative times", () => {
		const pb = computePersonalBest(NW_5K, [
			{ tally_split_num: 1, time_s: 2400, activity_date: "2026-10-01" },
			{ tally_split_num: 2, time_s: 0, activity_date: "2026-10-02" },
			{ tally_split_num: 3, time_s: -5, activity_date: "2026-10-03" },
		]);
		expect(pb!.total_valid_results).toBe(1);
		expect(pb!.best_time_s).toBe(2400);
	});

	it("breaks ties deterministically (earliest date wins)", () => {
		const pb = computePersonalBest(NW_5K, [
			{ tally_split_num: 9, time_s: 2250, activity_date: "2026-10-06" },
			{ tally_split_num: 8, time_s: 2250, activity_date: "2026-10-05" },
		]);
		expect(pb!.best_tally_split_num).toBe(8);
		expect(pb!.improvement_s).toBe(0);
	});
});

describe("recomputePersonalBest (derived row lifecycle)", () => {
	it("creates baseline, flags improvement, ignores slower results", async () => {
		const db = makeFakeDb([act(7, 100, NW_5K, 2400, "2026-10-01")]);
		let r = await recomputePersonalBest(db, 100, NW_5K);
		expect(r.isNewPb).toBe(false); // baseline, nothing before
		expect(r.pb!.best_time_s).toBe(2400);

		db.activities.set(8, act(8, 100, NW_5K, 2250, "2026-10-05"));
		r = await recomputePersonalBest(db, 100, NW_5K);
		expect(r.isNewPb).toBe(true);
		expect(r.previousBestBefore).toBe(2400);
		expect(r.pb).toMatchObject({ best_time_s: 2250, previous_best_s: 2400, improvement_s: 150 });

		db.activities.set(9, act(9, 100, NW_5K, 2300, "2026-10-06"));
		r = await recomputePersonalBest(db, 100, NW_5K);
		expect(r.isNewPb).toBe(false);
		expect(r.pb!.best_time_s).toBe(2250);
	});

	it("recalculates when the current PB activity is deleted", async () => {
		const db = makeFakeDb([
			act(7, 100, NW_5K, 2400, "2026-10-01"),
			act(8, 100, NW_5K, 2250, "2026-10-05"),
			act(9, 100, NW_5K, 2300, "2026-10-06"),
		]);
		await recomputePersonalBest(db, 100, NW_5K);
		expect(db.pbs.get("100:1222836")!.best_time_s).toBe(2250);

		db.activities.delete(8); // delete the PB activity
		const r = await recomputePersonalBest(db, 100, NW_5K);
		expect(r.pb).toMatchObject({ best_time_s: 2300, previous_best_s: 2400, improvement_s: 100 });
	});

	it("removes the PB row when no valid results remain", async () => {
		const db = makeFakeDb([act(7, 100, NW_5K, 2400, "2026-10-01")]);
		await recomputePersonalBest(db, 100, NW_5K);
		expect(db.pbs.has("100:1222836")).toBe(true);
		db.activities.delete(7);
		const r = await recomputePersonalBest(db, 100, NW_5K);
		expect(r.pb).toBeNull();
		expect(db.pbs.has("100:1222836")).toBe(false);
	});

	it("is a no-op for non-speed events", async () => {
		const db = makeFakeDb([act(7, 100, NW_WEEKLY, 2400, "2026-10-01")]);
		const r = await recomputePersonalBest(db, 100, NW_WEEKLY);
		expect(r.pb).toBeNull();
		expect(db.pbs.size).toBe(0);
	});

	it("stores the NW performance level on the PB row (and null elsewhere)", async () => {
		const db = makeFakeDb([
			act(7, 100, NW_5K, 2040, "2026-10-01"), // 34:00 -> High Performance (< 35:00)
			act(8, 200, RUN_5K, 1500, "2026-10-01"), // Running: no levels
		]);
		await recomputePersonalBest(db, 100, NW_5K);
		await recomputePersonalBest(db, 200, RUN_5K);
		expect(db.pbs.get("100:1222836")!.performance_level).toBe("High Performance");
		expect(db.pbs.get("200:1222848")!.performance_level).toBeNull();
	});
});

describe("classifyCharityNwLevel (Series 2026 thresholds, read-only)", () => {
	it("matches classifySeries2026Level exactly on every boundary", () => {
		const cases: Array<[number, string, number[]]> = [
			[1222834, "1K", [359, 360, 389, 390, 419, 420, 449, 450, 900]],
			[1222835, "3K", [1199, 1200, 1259, 1260, 1319, 1320, 1379, 1380, 2000]],
			[1222836, "5K", [1979, 1980, 2099, 2100, 2219, 2220, 2399, 2400, 3600]],
			[1222837, "10K", [3899, 3900, 4199, 4200, 4499, 4500, 4799, 4800, 9000]],
		];
		for (const [eventId, dist, seconds] of cases) {
			for (const s of seconds) {
				expect(classifyCharityNwLevel(eventId, s)).toBe(classifySeries2026Level(dist, s));
			}
		}
	});

	it("spot-checks the approved table values", () => {
		expect(classifyCharityNwLevel(1222834, 359)).toBe("Elite");
		expect(classifyCharityNwLevel(1222834, 450)).toBe("Open");
		expect(classifyCharityNwLevel(1222835, 1379)).toBe("Competitive");
		expect(classifyCharityNwLevel(1222836, 2399)).toBe("Competitive");
		expect(classifyCharityNwLevel(1222837, 3899)).toBe("Elite");
		expect(classifyCharityNwLevel(1222837, 4800)).toBe("Open");
	});

	it("returns null outside the 4 NW events — no invented thresholds", () => {
		expect(classifyCharityNwLevel(1222848, 1200)).toBeNull(); // Running 5K
		expect(classifyCharityNwLevel(1222841, 1200)).toBeNull(); // Race Walking 3K
		expect(classifyCharityNwLevel(1222854, 1200)).toBeNull(); // Cycling 10K
		expect(classifyCharityNwLevel(1222899, 1800)).toBeNull(); // Walking 5K
		expect(classifyCharityNwLevel(1222833, 1800)).toBeNull(); // NW Weekly
		expect(classifyCharityNwLevel(999999, 100)).toBeNull();
		expect(classifyCharityNwLevel(1222836, 0)).toBeNull();
		expect(classifyCharityNwLevel(1222836, -10)).toBeNull();
	});
});

describe("ingestChallengeResultRows (stub)", () => {
	it("upserts idempotently and recomputes affected PBs", async () => {
		const db = makeFakeDb();
		const rows = [
			{
				tally_split_num: 1, race_id: 216323, submit_event_id: NW_5K, sub_event_id: NW_5K,
				registration_id: 5, rsu_user_id: 100, activity_date: "2026-10-01",
				distance_m: 5000, time_s: 2400,
			},
			{
				tally_split_num: 2, race_id: 216323, submit_event_id: NW_5K, sub_event_id: NW_5K,
				registration_id: 5, rsu_user_id: 100, activity_date: "2026-10-05",
				distance_m: 5000, time_s: 2250,
			},
		];
		const r1 = await ingestChallengeResultRows(db, rows);
		expect(r1).toEqual({ upserted: 2, pbRecomputed: 1 });
		expect(db.pbs.get("100:1222836")).toMatchObject({ best_time_s: 2250, improvement_s: 150 });

		const r2 = await ingestChallengeResultRows(db, rows); // re-ingest: idempotent
		expect(r2).toEqual({ upserted: 0, pbRecomputed: 0 });
	});

	it("skips non-speed events for PB recompute", async () => {
		const db = makeFakeDb();
		const r = await ingestChallengeResultRows(db, [
			{
				tally_split_num: 3, race_id: 216323, submit_event_id: NW_WEEKLY, sub_event_id: NW_WEEKLY,
				registration_id: 6, rsu_user_id: 101, activity_date: "2026-10-01",
				distance_m: 8000, time_s: null,
			},
		]);
		expect(r).toEqual({ upserted: 1, pbRecomputed: 0 });
		expect(db.pbs.size).toBe(0);
	});
});
