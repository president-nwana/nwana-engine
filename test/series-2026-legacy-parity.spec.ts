import { describe, expect, it } from "vitest";
import {
	allScoringTypeNames,
	buildResultFieldRows,
	groupStandingsByScoringType,
	legacyScoringTypeIds,
	scoringTypeName,
} from "../src/series-2026-apply";
import { computeSeries2026Levels } from "../src/race-lifecycle";

// Regression case: Albert's real 2026-09-26 3K result.
// Race 210000, Event 1177636, Result Set 664979, Result 232501676.
// Manual result entry: no registration_id/user_id in the row; the
// registration id comes from the parallel registration_ids array.
const REAL_3K_INPUT = [
	{
		result_id: 232501676,
		first_name: "Albert",
		last_name: "Fatikhov",
		gender: "M",
		chip_time: "",
		clock_time: "18:54",
	},
];

function computed3K() {
	return computeSeries2026Levels("3K", REAL_3K_INPUT);
}

describe("legacy parity: real 2026-09-26 3K regression case", () => {
	it("classifies 18:54 (blank chip_time) as Elite, Level Place 1, 1000 points", () => {
		const computed = computed3K();
		expect(computed).toHaveLength(1);
		expect(computed[0].level).toBe("Elite");
		expect(computed[0].level_display).toBe("Elite (< 20:00)");
		expect(computed[0].level_place).toBe(1);
		expect(computed[0].points).toBe(1000);
	});

	it("builds a full legacy-style result row with registration_id from the parallel array", () => {
		const computed = computed3K();
		const rawRows = [
			{
				result_id: 232501676,
				place: null,
				bib: "101",
				first_name: "Albert",
				last_name: "Fatikhov",
				gender: "M",
				city: "St. Petersburg",
				state: "FL",
				country_code: "US",
				clock_time: "18:54",
				chip_time: "",
				age: 45,
				// No registration_id in the row (manual result entry).
				"custom-field-999": "kept",
			},
		];
		const rows = buildResultFieldRows(computed, rawRows, [123456], 654103, 654104);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		expect(row.result_id).toBe(232501676);
		expect(row.registration_id).toBe(123456);
		expect(row.bib).toBe("101");
		expect(row.clock_time).toBe("18:54");
		expect(row.chip_time).toBe(null); // text() normalizes blank to null
		expect(row["custom-field-999"]).toBe("kept");
		expect(row["custom-field-654103"]).toBe("Elite (< 20:00)");
		expect(row["custom-field-654104"]).toBe("1");
	});

	it("fails when registration_ids length does not match results", () => {
		const computed = computed3K();
		expect(() =>
			buildResultFieldRows(computed, [{ result_id: 1 }], [], 1, 2),
		).toThrow(/registration_ids count does not match results/);
	});

	it("fails when a row has no registration id to map", () => {
		const computed = computed3K();
		expect(() =>
			buildResultFieldRows(computed, [{ result_id: 1 }], [null], 1, 2),
		).toThrow(/no registration_id/);
	});
});

describe("legacy parity: scoring types", () => {
	it("defines all ten level x gender names in legacy order", () => {
		const names = allScoringTypeNames("3K");
		expect(names).toHaveLength(10);
		expect(names[0]).toBe("Elite Men (Elite (< 20:00); tie: best time)");
		expect(names[1]).toBe("Elite Women (Elite (< 20:00); tie: best time)");
		expect(names[2]).toBe("High Performance Men (High Performance (< 21:00); tie: best time)");
		expect(names[names.length - 1]).toBe("Open Women (Open (23:00+); tie: best time)");
		const levels = ["Elite", "High Performance", "Performance", "Competitive", "Open"] as const;
		for (const level of levels) {
			expect(names).toContain(scoringTypeName("3K", level, "Men"));
			expect(names).toContain(scoringTypeName("3K", level, "Women"));
		}
	});

	it("selects only pre-v4 names for deletion, never the wanted ones", () => {
		const existing = new Map<string, number>([
			["Elite Men (Elite (< 20:00); tie: best time)", 100],
			["Elite Men (Elite (< 20:00))", 90],
			["High Performance Women", 91],
			["Some Other Type", 92],
			["Open Men (Open (30:00+))", 93],
		]);
		expect(legacyScoringTypeIds(existing, "3K")).toEqual([90, 91, 93]);
	});
});

describe("legacy parity: standings grouping", () => {
	it("produces all ten groups including empties, in legacy order", () => {
		const computed = [
			...computed3K().map((row) => ({ ...row })),
			{
				result_id: 2,
				athlete: "Jane Runner",
				gender: "F",
				time: "22:00",
				time_seconds: 1320,
				level: "High Performance",
				level_display: "High Performance (< 21:00)",
				level_place: 1,
				points: 1000,
			},
		];
		const groups = groupStandingsByScoringType(computed, [123456, 123457], "3K");
		expect(groups).toHaveLength(10);
		expect(groups[0].name).toBe("Elite Men (Elite (< 20:00); tie: best time)");
		expect(groups[0].rows).toEqual([[123456, 1000, 1]]);
		const womenHighPerf = groups.find((g) => g.name.startsWith("High Performance Women"));
		expect(womenHighPerf?.rows).toEqual([[123457, 1000, 1]]);
		const eliteWomen = groups.find((g) => g.name.startsWith("Elite Women"));
		expect(eliteWomen?.rows).toEqual([]);
	});

	it("fails when participant ids do not cover all results", () => {
		const computed = computed3K();
		expect(() => groupStandingsByScoringType(computed, [], "3K")).toThrow(
			/Incomplete series participant mapping/,
		);
	});
});
