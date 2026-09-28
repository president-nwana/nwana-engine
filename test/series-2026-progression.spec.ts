// ADR-0043: one shared Series 2026 progression model for the Operating
// Center and the public site. Pure computation tests.

import { describe, expect, it } from "vitest";
import {
	buildProgressionMatrix,
	type ProgressionAthleteInput,
	type ProgressionCellInput,
	type ProgressionEvent,
} from "../src/series-2026-progression";

const NOW = Date.parse("2026-09-28T12:00:00Z");

function event(id: number, deadline: string | null): ProgressionEvent {
	return { event_id: id, event_name: `Event ${id}`, event_date: "2026-09-2" + id, deadline };
}

function cell(partial: Partial<ProgressionCellInput>): ProgressionCellInput {
	return {
		registered: false, submitted: false, approved: false,
		disqualified: false, processed: false, time: null,
		time_seconds: null, level: null, level_place: null,
		points: null, gender: null,
		...partial,
	};
}

function athlete(name: string, gender: string | null, cells: Record<string, ProgressionCellInput>): ProgressionAthleteInput {
	return { name, gender, cells };
}

const PAST_DEADLINE = "2026-09-20T00:00:00Z";
const FUTURE_DEADLINE = "2026-10-20T00:00:00Z";

describe("progression cell states", () => {
	const events = [event(1, PAST_DEADLINE), event(2, FUTURE_DEADLINE)];

	it("OC: registered before the deadline shows Registered, after it DNS", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [
				athlete("Jane Doe", "F", {
					"1": cell({ registered: true }),
					"2": cell({ registered: true }),
				}),
			],
		}, "oc");
		const row = m.rows[0];
		expect(row.cells["1"].state).toBe("dns");
		expect(row.cells["2"].state).toBe("registered");
	});

	it("OC: DNS never appears before the deadline even without a result", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events: [event(2, FUTURE_DEADLINE)], now: NOW,
			athletes: [athlete("Jane Doe", "F", { "2": cell({ registered: true }) })],
		}, "oc");
		expect(m.rows[0].cells["2"].state).toBe("registered");
	});

	it("OC: submitted without a decision stays Submitted, never DSQ", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [athlete("Jane Doe", "F", { "1": cell({ registered: true, submitted: true, time: "36:35" }) })],
		}, "oc");
		expect(m.rows[0].cells["1"].state).toBe("submitted");
	});

	it("OC: approved but unprocessed shows Approved, disqualified shows DSQ", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [
				athlete("A One", "M", { "1": cell({ registered: true, submitted: true, approved: true }) }),
				athlete("B Two", "M", { "1": cell({ registered: true, submitted: true, disqualified: true }) }),
			],
		}, "oc");
		expect(m.rows[0].cells["1"].state).toBe("approved");
		expect(m.rows[1].cells["1"].state).toBe("dsq");
	});

	it("OC: result without registration is an Exception", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [athlete("Stranger", "M", { "1": cell({ submitted: true, time: "40:00" }) })],
		}, "oc");
		expect(m.rows[0].cells["1"].state).toBe("exception");
	});

	it("public: never exposes Submitted / Approved / Exception states", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [
				athlete("A One", "M", { "1": cell({ registered: true, submitted: true }) }),
				athlete("B Two", "M", { "1": cell({ registered: true, submitted: true, approved: true }) }),
				athlete("C Three", "M", { "1": cell({ submitted: true }) }),
				athlete("D Four", "F", { "1": cell({ registered: true }) }),
				athlete("E Five", "M", { "1": cell({ registered: true, submitted: true, disqualified: true }) }),
			],
		}, "public");
		const states = m.rows.map((r) => r.cells["1"].state);
		expect(states).toEqual(["empty", "empty", "empty", "dns", "dsq"]);
	});

	it("public: final cells carry time, level and points", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [athlete("Albert Fatikhov", "M", {
				"1": cell({ registered: true, submitted: true, approved: true, processed: true, time: "30:38", time_seconds: 1838, level: "Elite", level_place: 1, points: 1000, gender: "M" }),
			})],
		}, "public");
		const c = m.rows[0].cells["1"];
		expect(c.state).toBe("final");
		expect(c.time).toBe("30:38");
		expect(c.level).toBe("Elite");
		expect(c.points).toBe(1000);
	});
});

describe("summary columns and standings buckets", () => {
	const events = [event(1, PAST_DEADLINE), event(2, PAST_DEADLINE)];

	function finalCell(time: string, seconds: number, level: string, place: number, gender: string): ProgressionCellInput {
		return cell({
			registered: true, submitted: true, approved: true, processed: true,
			time, time_seconds: seconds, level, level_place: place,
			points: 1001 - place, gender,
		});
	}

	it("Races counts only valid approved finishes: DNS and DSQ excluded", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [
				athlete("Runner", "M", {
					"1": finalCell("30:00", 1800, "Elite", 1, "M"),
					"2": cell({ registered: true, disqualified: true, submitted: true }),
				}),
				athlete("Walker", "F", {
					"1": cell({ registered: true }),
					"2": cell({ registered: true }),
				}),
			],
		}, "oc");
		expect(m.rows[0].races).toBe(1);
		expect(m.rows[1].races).toBe(0);
	});

	it("Best Time is the minimum over valid finishes", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [athlete("Runner", "M", {
				"1": finalCell("31:00", 1860, "Elite", 2, "M"),
				"2": finalCell("30:00", 1800, "Elite", 1, "M"),
			})],
		}, "oc");
		expect(m.rows[0].best_time).toBe("30:00");
	});

	it("standings buckets never mix Performance Levels: one entry per level", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [
				athlete("Versatile", "M", {
					"1": finalCell("19:30", 1170, "Elite", 1, "M"),
					"2": finalCell("25:00", 1500, "Performance", 1, "M"),
				}),
				athlete("Steady", "M", {
					"1": finalCell("19:40", 1180, "Elite", 2, "M"),
					"2": finalCell("19:50", 1190, "Elite", 3, "M"),
				}),
			],
		}, "oc");
		const versatile = m.rows[0];
		expect(versatile.buckets.map((b) => `${b.level}:${b.points}`).sort()).toEqual([
			"Elite:1000",
			"Performance:1000",
		]);
		// Buckets exist separately; no fake combined total.
		const eliteMen = m.buckets.find((b) => b.level === "Elite" && b.gender === "Men")!;
		const perfMen = m.buckets.find((b) => b.level === "Performance" && b.gender === "Men")!;
		expect(eliteMen.entries.map((e) => e.name)).toEqual(["Steady", "Versatile"]);
		expect(eliteMen.entries[0].points).toBe(1997);
		expect(eliteMen.entries[1].points).toBe(1000);
		expect(perfMen.entries.map((e) => e.name)).toEqual(["Versatile"]);
	});

	it("ranks are per bucket and gender-separated", () => {
		const m = buildProgressionMatrix({
			distance: "5K", events, now: NOW,
			athletes: [
				athlete("Man One", "M", { "1": finalCell("30:00", 1800, "Elite", 1, "M") }),
				athlete("Woman One", "F", { "1": finalCell("30:00", 1800, "Elite", 1, "F") }),
				athlete("Man Two", "M", { "1": finalCell("31:00", 1860, "Elite", 2, "M") }),
			],
		}, "oc");
		const men = m.buckets.find((b) => b.level === "Elite" && b.gender === "Men")!;
		const women = m.buckets.find((b) => b.level === "Elite" && b.gender === "Women")!;
		expect(men.entries.map((e) => [e.name, e.rank])).toEqual([["Man One", 1], ["Man Two", 2]]);
		expect(women.entries.map((e) => [e.name, e.rank])).toEqual([["Woman One", 1]]);
		const manOne = m.rows.find((r) => r.name === "Man One")!;
		expect(manOne.buckets).toEqual([{ level: "Elite", gender: "Men", points: 1000, races: 1, rank: 1 }]);
	});

	it("OC and public share the same buckets and ranks", () => {
		const input = {
			distance: "5K", events, now: NOW,
			athletes: [athlete("Runner", "M", { "1": finalCell("30:00", 1800, "Elite", 1, "M") })],
		};
		const oc = buildProgressionMatrix(input, "oc");
		const pub = buildProgressionMatrix(input, "public");
		expect(pub.buckets).toEqual(oc.buckets);
		expect(pub.rows[0].races).toBe(oc.rows[0].races);
		expect(pub.rows[0].best_time).toBe(oc.rows[0].best_time);
	});
});
