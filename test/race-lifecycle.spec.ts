import { describe, expect, it } from "vitest";
import {
	buildNextRacePrep,
	buildSeries2026LevelsWritePlan,
	classifySeries2026Level,
	computeLifecycleDistanceState,
	computeSeries2026Levels,
	confirmRaceLifecyclePrep,
	deriveEventStage,
	getRaceLifecycleView,
	parseNwanaTime,
	series2026LevelDisplayName,
} from "../src/race-lifecycle";
import { renderOperatingCenterHtml } from "../src/operating-center";

const source1K = {
	distance: "1K",
	raceId: 209980,
	raceSeriesId: 1444,
	raceSeriesYearId: 2110,
};

describe("Series 2026 level classification (NWANA-FINAL.ps1 parity)", () => {
	it("parses MM:SS and H:MM:SS times", () => {
		expect(parseNwanaTime("5:36")).toBe(336);
		expect(parseNwanaTime("1:05:00")).toBe(3900);
		expect(parseNwanaTime(" 6:00 ")).toBe(360);
		expect(parseNwanaTime(null)).toBe(null);
		expect(parseNwanaTime("")).toBe(null);
		expect(parseNwanaTime("fast")).toBe(null);
	});

	it("classifies strictly below each threshold, ties fall to the slower level", () => {
		expect(classifySeries2026Level("1K", 359)).toBe("Elite");
		expect(classifySeries2026Level("1K", 360)).toBe("High Performance");
		expect(classifySeries2026Level("1K", 390)).toBe("Performance");
		expect(classifySeries2026Level("1K", 420)).toBe("Competitive");
		expect(classifySeries2026Level("1K", 450)).toBe("Open");
		expect(classifySeries2026Level("1K", 900)).toBe("Open");
		expect(classifySeries2026Level("5K", 1979)).toBe("Elite");
		expect(classifySeries2026Level("5K", 1980)).toBe("High Performance");
	});

	it("rejects an unknown distance", () => {
		expect(() => classifySeries2026Level("2K", 100)).toThrow("Unknown Series 2026 distance");
	});

	it("renders the public threshold label", () => {
		expect(series2026LevelDisplayName("1K", "Elite")).toBe("Elite (< 6:00)");
		expect(series2026LevelDisplayName("1K", "Open")).toBe("Open (7:30+)");
	});

	it("ranks Level Place within Level + Gender with 1000/999/998 points", () => {
		const computed = computeSeries2026Levels("1K", [
			{ first_name: "Albert", last_name: "Fatikhov", gender: "M", chip_time: "5:50" },
			{ first_name: "Runner", last_name: "Two", gender: "M", chip_time: "5:55" },
			{ first_name: "Runner", last_name: "Three", gender: "F", chip_time: "5:52" },
			{ first_name: "Runner", last_name: "Four", gender: "M", chip_time: "6:10" },
		]);

		const byName = new Map(computed.map((row) => [row.athlete, row]));
		expect(byName.get("Albert Fatikhov")).toMatchObject({
			level: "Elite",
			level_display: "Elite (< 6:00)",
			level_place: 1,
			points: 1000,
		});
		expect(byName.get("Runner Two")).toMatchObject({
			level: "Elite",
			level_place: 2,
			points: 999,
		});
		expect(byName.get("Runner Three")).toMatchObject({
			level: "Elite",
			level_place: 1,
			points: 1000,
		});
		expect(byName.get("Runner Four")).toMatchObject({
			level: "High Performance",
			level_place: 1,
			points: 1000,
		});
	});

	it("throws on a missing time instead of guessing", () => {
		expect(() =>
			computeSeries2026Levels("1K", [{ first_name: "No", last_name: "Time", gender: "M" }]),
		).toThrow("Missing or invalid time");
	});
});

describe("levels write plan (dry run only)", () => {
	it("prepares payloads without executing anything", () => {
		const computed = computeSeries2026Levels("1K", [
			{ first_name: "Albert", last_name: "Fatikhov", gender: "M", chip_time: "5:50" },
		]);
		const plan = buildSeries2026LevelsWritePlan({
			distance: "1K",
			raceId: 209980,
			raceSeriesId: 1444,
			raceSeriesYearId: 2110,
			eventId: 111,
			resultSetId: 222,
			computed,
			writeAccess: "UNKNOWN",
		});

		expect(plan.write_mode).toBe("dry_run");
		expect(plan.executed).toBe(false);
		expect(plan.write_access).toBe("UNKNOWN");
		expect(plan.steps.map((step) => step.step)).toEqual([
			"ensure_custom_fields",
			"ensure_scoring_types",
			"upload_standings",
			"write_result_fields",
		]);
		const scoring = plan.steps[1].payload as { scoring_type_names: string[] };
		expect(scoring.scoring_type_names).toContain(
			"Elite Men (Elite (< 6:00); tie: best time)",
		);
		expect(scoring.scoring_type_names).toContain(
			"Open Women (Open (7:30+); tie: best time)",
		);
		expect(scoring.scoring_type_names).toHaveLength(10);
		expect(plan.report).toContain("DRY RUN");
		expect(plan.report).toContain("nothing was written");
	});
});

describe("event stage derivation", () => {
	it("maps platform facts to lifecycle stages", () => {
		expect(
			deriveEventStage({ eventDate: "2026-09-01", nowDate: "2026-09-22", hasResults: true, finalized: true, publication: "PUBLISHED" }),
		).toBe("published");
		expect(
			deriveEventStage({ eventDate: "2026-09-01", nowDate: "2026-09-22", hasResults: true, finalized: true, publication: "BASELINE" }),
		).toBe("published");
		expect(
			deriveEventStage({ eventDate: "2026-09-01", nowDate: "2026-09-22", hasResults: true, finalized: true, publication: "PENDING" }),
		).toBe("levels_computed");
		expect(
			deriveEventStage({ eventDate: "2026-09-01", nowDate: "2026-09-22", hasResults: true, finalized: false, publication: "PENDING" }),
		).toBe("verifying");
		expect(
			deriveEventStage({ eventDate: "2026-10-03", nowDate: "2026-09-22", hasResults: false, finalized: false, publication: "PENDING" }),
		).toBe("registration_open");
		expect(
			deriveEventStage({ eventDate: "2026-09-19", nowDate: "2026-09-22", hasResults: false, finalized: false, publication: "PENDING" }),
		).toBe("awaiting_results");
		expect(
			deriveEventStage({ eventDate: null, nowDate: "2026-09-22", hasResults: false, finalized: false, publication: "PENDING" }),
		).toBe("awaiting_results");
	});
});

describe("lifecycle distance state", () => {
	const finalizedEvent = {
		eventId: 1,
		eventName: "September 1K",
		eventDate: "2026-09-05",
		registrationUrl: null,
		hasResults: true,
		finalized: true,
		publication: "PENDING" as const,
		publicationKey: "runsignup:series-2026:209980:1:10",
	};
	const upcomingEvent = {
		eventId: 2,
		eventName: "October 1K",
		eventDate: "2026-10-03",
		registrationUrl: "https://runsignup.com/Race/1K",
		hasResults: false,
		finalized: false,
		publication: "PENDING" as const,
		publicationKey: null,
	};

	it("focuses on the earliest unfinished event and flags the owner action", () => {
		const state = computeLifecycleDistanceState({
			source: source1K,
			events: [finalizedEvent, upcomingEvent],
			nowDate: "2026-09-22",
			previousActiveEventId: null,
			previousPrepConfirmed: false,
			previousPrep: null,
		});

		expect(state.stage).toBe("levels_computed");
		expect(state.active_event?.event_id).toBe(1);
		expect(state.owner_action_required).toBe(true);
		expect(state.owner_action).toContain("PUBLISH");
		expect(state.events.find((event) => event.event_id === 1)?.stage).toBe("levels_computed");
		expect(state.events.find((event) => event.event_id === 2)?.stage).toBe("registration_open");
	});

	it("moves to next_race_prep with drafts when the previous event is published", () => {
		const state = computeLifecycleDistanceState({
			source: source1K,
			events: [{ ...finalizedEvent, publication: "PUBLISHED" as const }, upcomingEvent],
			nowDate: "2026-09-22",
			previousActiveEventId: 1,
			previousPrepConfirmed: false,
			previousPrep: null,
		});

		expect(state.stage).toBe("next_race_prep");
		expect(state.active_event?.event_id).toBe(2);
		expect(state.prep?.status).toBe("DRAFT");
		expect(state.prep?.email.dashboard_id).toBe(513494);
		expect(state.prep?.email.classification).toBe("MARKETING");
		expect(state.prep?.email.send).toBe("manual in Email Marketing Dashboard");
		expect(state.owner_action_required).toBe(true);
	});

	it("opens registration after the owner confirms prep", () => {
		const prep = buildNextRacePrep({
			distance: "1K",
			eventName: "October 1K",
			eventDate: "2026-10-03",
			registrationUrl: null,
		});
		const state = computeLifecycleDistanceState({
			source: source1K,
			events: [{ ...finalizedEvent, publication: "PUBLISHED" as const }, upcomingEvent],
			nowDate: "2026-09-22",
			previousActiveEventId: 2,
			previousPrepConfirmed: true,
			previousPrep: prep,
		});

		expect(state.stage).toBe("registration_open");
		expect(state.prep_confirmed).toBe(true);
	});

	it("regenerates prep when the active event changes", () => {
		const prep = buildNextRacePrep({
			distance: "1K",
			eventName: "October 1K",
			eventDate: "2026-10-03",
			registrationUrl: null,
		});
		const state = computeLifecycleDistanceState({
			source: source1K,
			events: [{ ...finalizedEvent, publication: "PUBLISHED" as const }, upcomingEvent],
			nowDate: "2026-09-22",
			previousActiveEventId: 1,
			previousPrepConfirmed: true,
			previousPrep: prep,
		});

		expect(state.stage).toBe("next_race_prep");
		expect(state.prep_confirmed).toBe(false);
		expect(state.prep?.announcement.text).toContain("October 1K");
	});
});

describe("next race prep drafts", () => {
	it("prepares announcement and email as manual drafts", () => {
		const prep = buildNextRacePrep({
			distance: "3K",
			eventName: "October 3K",
			eventDate: "2026-10-10",
			registrationUrl: "https://runsignup.com/Race/3K",
		});

		expect(prep.status).toBe("DRAFT");
		expect(prep.announcement.send).toBe("manual");
		expect(prep.announcement.channels).toHaveLength(4);
		expect(prep.announcement.text).toContain("October 3K");
		expect(prep.email.subject).toContain("October 3K");
		expect(prep.email.body).toContain("https://runsignup.com/Race/3K");
	});
});

describe("operating center lifecycle view", () => {
	it("renders the Series 2026 race lifecycle panel", () => {
		const html = renderOperatingCenterHtml();
		expect(html).toContain("Гонки Series 2026");
		expect(html).toContain("/api/operating-center/race-lifecycle");
		expect(html).toContain("Обновить все дистанции");
	});
});

describe("lifecycle persistence (in-memory D1 stub)", () => {
	type Row = Record<string, unknown>;

	function makeDb(rows: Row[]) {
		const calls: Array<{ sql: string; args: unknown[] }> = [];
		const db = {
			prepare(sql: string) {
				return {
					bind(...args: unknown[]) {
						return {
							async first() {
								calls.push({ sql, args });
								return rows[0] ?? null;
							},
							async all() {
								calls.push({ sql, args });
								return { results: rows };
							},
							async run() {
								calls.push({ sql, args });
								if (sql.includes("SET stage = 'registration_open'")) {
									rows[0].stage = "registration_open";
									rows[0].prep_confirmed = "true";
								}
								return { success: true };
							},
						};
					},
				};
			},
		};
		return { db: db as unknown as D1Database, calls };
	}

	it("confirms prep only from the next_race_prep stage", async () => {
		const { db } = makeDb([{ stage: "next_race_prep" }]);
		const result = await confirmRaceLifecyclePrep(db, "1K");
		expect(result).toEqual({ ok: true, distance: "1K", stage: "registration_open" });
	});

	it("refuses prep confirmation from any other stage", async () => {
		const { db } = makeDb([{ stage: "verifying" }]);
		await expect(confirmRaceLifecyclePrep(db, "1K")).rejects.toThrow(
			"not in next_race_prep",
		);
	});

	it("reads the stored lifecycle view with owner actions", async () => {
		const { db } = makeDb([
			{
				series: "SERIES_2026",
				distance: "1K",
				race_id: 209980,
				active_event_id: 2,
				active_event_name: "October 1K",
				active_event_date: "2026-10-03",
				stage: "next_race_prep",
				events_json: "[]",
				prep_json: null,
				prep_confirmed: "false",
				write_access: "UNKNOWN",
				write_mode: "dry_run",
				synced_at: "2026-09-22T00:00:00Z",
			},
		]);
		const view = await getRaceLifecycleView(db);
		expect(view.ok).toBe(true);
		expect(view.distances).toHaveLength(1);
		expect(view.distances[0]).toMatchObject({
			distance: "1K",
			stage: "next_race_prep",
			owner_action_required: true,
			write_access: "UNKNOWN",
			write_mode: "dry_run",
		});
		expect(view.distances[0].active_event?.event_id).toBe(2);
	});
});
