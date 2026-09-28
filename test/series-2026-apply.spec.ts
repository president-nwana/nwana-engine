import { describe, expect, it } from "vitest";
import {
	APPLY_LEVELS_CONFIRMATION,
	applySeries2026Levels,
	buildResultFieldRows,
	scoringTypeName,
} from "../src/series-2026-apply";
import { computeSeries2026Levels } from "../src/race-lifecycle";

type Row = Record<string, unknown>;

function makeDb(lifecycleRow: Row | null) {
	const inserts: Row[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...args: unknown[]) {
					return {
						async first() {
							return lifecycleRow;
						},
						async run() {
							inserts.push({ sql, args });
							return { success: true };
						},
					};
				},
			};
		},
	};
	return { db: db as unknown as D1Database, inserts };
}

const verifyingRow: Row = {
	write_access: "CONFIRMED",
	events_json: JSON.stringify([{ event_id: 1177636, stage: "verifying" }]),
};

describe("applySeries2026Levels gates", () => {
	it("rejects without the exact owner confirmation and writes nothing", async () => {
		const { db, inserts } = makeDb(verifyingRow);
		const result = await applySeries2026Levels({
			db,
			accessToken: "token",
			distance: "3K",
			eventId: 1177636,
			confirmation: "yes",
		});
		expect(result.ok).toBe(false);
		expect(result.error).toContain(APPLY_LEVELS_CONFIRMATION);
		expect(result.steps).toHaveLength(1);
		expect(inserts).toHaveLength(0);
	});

	it("rejects an unknown distance", async () => {
		const { db } = makeDb(verifyingRow);
		const result = await applySeries2026Levels({
			db,
			accessToken: "token",
			distance: "100K",
			eventId: 1,
			confirmation: APPLY_LEVELS_CONFIRMATION,
		});
		expect(result.ok).toBe(false);
		expect(result.error).toContain("Unknown Series 2026 distance");
	});

	it("rejects when write access was never confirmed and logs the rejection", async () => {
		const { db, inserts } = makeDb({
			write_access: "UNKNOWN",
			events_json: JSON.stringify([{ event_id: 1177636, stage: "verifying" }]),
		});
		const result = await applySeries2026Levels({
			db,
			accessToken: "token",
			distance: "3K",
			eventId: 1177636,
			confirmation: APPLY_LEVELS_CONFIRMATION,
		});
		expect(result.ok).toBe(false);
		expect(result.steps[0].step).toBe("check_write_access");
		expect(result.error).toContain("write test");
		expect(inserts).toHaveLength(1);
		expect(inserts[0].args).toContain("REJECTED");
	});

	it("rejects when the event is not in the verifying stage", async () => {
		const { db, inserts } = makeDb({
			write_access: "CONFIRMED",
			events_json: JSON.stringify([{ event_id: 1177636, stage: "levels_computed" }]),
		});
		const result = await applySeries2026Levels({
			db,
			accessToken: "token",
			distance: "3K",
			eventId: 1177636,
			confirmation: APPLY_LEVELS_CONFIRMATION,
		});
		expect(result.ok).toBe(false);
		expect(result.steps[0].step).toBe("check_stage");
		expect(result.error).toContain("levels_computed");
		expect(inserts).toHaveLength(1);
		expect(inserts[0].args).toContain("REJECTED");
	});

	it("rejects an event that is missing from the last synced state", async () => {
		const { db } = makeDb({ write_access: "CONFIRMED", events_json: "[]" });
		const result = await applySeries2026Levels({
			db,
			accessToken: "token",
			distance: "3K",
			eventId: 1177636,
			confirmation: APPLY_LEVELS_CONFIRMATION,
		});
		expect(result.ok).toBe(false);
		expect(result.error).toContain("sync");
	});
});

describe("apply payload builders", () => {
	it("builds scoring type names matching the public RunSignup series leaderboard", () => {
		expect(scoringTypeName("1K", "Elite", "Men")).toBe(
			"Elite Men (Elite (< 6:00); tie: best time)",
		);
		expect(scoringTypeName("3K", "Open", "Women")).toBe(
			"Open Women (Open (23:00+); tie: best time)",
		);
	});

	it("keys result field rows by result_id with custom-field-<id> values", () => {
		// Real 2026-09-26 3K result shape: empty chip_time, clock_time set.
		const computed = computeSeries2026Levels("3K", [
			{
				result_id: 232501676,
				first_name: "ALBERT",
				last_name: "FATIKHOV",
				gender: "M",
				chip_time: "",
				clock_time: "18:54",
			},
		]);
		const rows = buildResultFieldRows(computed, [{ result_id: 232501676 }], [777], 654103, 654104);
		expect(rows).toEqual([
			{
				result_id: 232501676,
				registration_id: 777,
				place: null,
				bib: null,
				first_name: null,
				last_name: null,
				gender: null,
				city: null,
				state: null,
				country_code: null,
				clock_time: null,
				chip_time: null,
				age: null,
				"custom-field-654103": "Elite (< 20:00)",
				"custom-field-654104": "1",
			},
		]);
	});

	it("refuses to build rows when a result_id is missing", () => {
		const computed = computeSeries2026Levels("3K", [
			{ first_name: "No", last_name: "Id", gender: "M", clock_time: "18:54" },
		]);
		expect(() => buildResultFieldRows(computed, [{}], [777], 1, 2)).toThrow("result_id");
	});

	it("writes empty level fields for disqualified results (ADR-0043)", () => {
		const computed = computeSeries2026Levels("3K", [
			{
				result_id: 232501676,
				first_name: "ALBERT",
				last_name: "FATIKHOV",
				gender: "M",
				chip_time: "",
				clock_time: "18:54",
			},
		]);
		const rows = buildResultFieldRows(
			computed, [{ result_id: 232501676 }], [777], 654103, 654104,
			new Set(["232501676"]),
		);
		expect(rows[0]["custom-field-654103"]).toBe("");
		expect(rows[0]["custom-field-654104"]).toBe("");
		// Identity fields are preserved: the row keeps its time and athlete.
		expect(rows[0].result_id).toBe(232501676);
	});
});
