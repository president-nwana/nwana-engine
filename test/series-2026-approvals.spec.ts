// ADR-0042: owner approves results; the Machine runs the downstream lifecycle.
// Tests for the approval store and the pure trigger decision.

import { describe, expect, it } from "vitest";
import {
	allResultsApproved,
	getEventApprovals,
	recordResultApproval,
} from "../src/series-2026-approvals";
import {
	decideTrigger,
	type EventRegistration,
	type LiveEventResult,
} from "../src/series-2026-auto-process";

// Minimal in-memory D1 double: supports only the approval queries.
function makeApprovalDb() {
	const rows = new Map<string, Record<string, unknown>>();
	const key = (r: Record<string, unknown>) =>
		`${r.series}|${r.distance}|${r.event_id}|${r.result_id}`;
	return {
		prepare(sql: string) {
			const isInsert = /INSERT INTO series_result_approvals/i.test(sql);
			return {
				bind(...args: unknown[]) {
					return {
						async run() {
							if (isInsert) {
								const [series, distance, race_id, event_id, result_id, athlete, time, approved_at, , source] =
									args;
								const k = `${series}|${distance}|${event_id}|${result_id}`;
								if (!rows.has(k)) {
									rows.set(k, {
										series, distance, raceId: race_id, eventId: event_id,
										resultId: result_id, athlete, time,
										approvedAt: approved_at, approvedBy: "owner", source,
									});
								}
							}
						},
						async first() {
							if (/FROM series_result_approvals/i.test(sql)) {
								const [, distance, event_id, result_id] = args;
								return (
									rows.get(`${args[0]}|${distance}|${event_id}|${result_id}`) ?? null
								);
							}
							return null;
						},
						async all() {
							const [, distance, event_id] = args;
							const prefix = `${args[0]}|${distance}|${event_id}|`;
							const results = [...rows.entries()]
								.filter(([k]) => k.startsWith(prefix))
								.map(([, v]) => v);
							return { results };
						},
					};
				},
			};
		},
	} as unknown as D1Database;
}

describe("series_result_approvals", () => {
	it("records one approval and reads it back", async () => {
		const db = makeApprovalDb();
		const approval = await recordResultApproval(db, {
			distance: "5K",
			raceId: 209477,
			eventId: 1173956,
			resultId: "232506108",
			athlete: "ALBERT FATIKHOV",
			time: "30:38",
			source: "oc",
		});
		expect(approval.resultId).toBe("232506108");
		expect(approval.approvedBy).toBe("owner");
		const map = await getEventApprovals(db, "5K", 1173956);
		expect(map.has("232506108")).toBe(true);
	});

	it("is idempotent: re-approval keeps the earliest timestamp", async () => {
		const db = makeApprovalDb();
		const first = await recordResultApproval(db, {
			distance: "5K", raceId: 209477, eventId: 1173956,
			resultId: "1", athlete: "A", time: "30:00", source: "oc",
		});
		const second = await recordResultApproval(db, {
			distance: "5K", raceId: 209477, eventId: 1173956,
			resultId: "1", athlete: "A", time: "30:00", source: "oc",
		});
		expect(second.approvedAt).toBe(first.approvedAt);
		expect((await getEventApprovals(db, "5K", 1173956)).size).toBe(1);
	});

	it("allResultsApproved is false unless every result is approved", async () => {
		const db = makeApprovalDb();
		expect(await allResultsApproved(db, "5K", 1173956, [])).toBe(false);
		await recordResultApproval(db, {
			distance: "5K", raceId: 209477, eventId: 1173956,
			resultId: "1", source: "oc",
		});
		expect(await allResultsApproved(db, "5K", 1173956, ["1"])).toBe(true);
		expect(await allResultsApproved(db, "5K", 1173956, ["1", "2"])).toBe(false);
	});

	it("never creates approvals on its own: no auto-approve helper exists", async () => {
		// The module exports only record/get/all; there is no function that
		// approves without an explicit owner action.
		const exported = await import("../src/series-2026-approvals");
		expect(Object.keys(exported).sort()).toEqual(
			["APPROVAL_SERIES", "allResultsApproved", "getEventApprovals", "recordResultApproval"],
		);
	});
});

function reg(first: string, last: string): EventRegistration {
	return {
		registration_id: `${first}-${last}`,
		user_id: "u1",
		first_name: first,
		last_name: last,
		status: "active",
	};
}

function res(id: string, athlete: string, time: string): LiveEventResult {
	return { result_id: id, athlete, gender: null, time };
}

describe("decideTrigger", () => {
	const regs = [reg("Albert", "Fatikhov"), reg("Susan", "Otto"), reg("Michael", "Blanchard")];
	const results = [
		res("1", "ALBERT FATIKHOV", "30:38"),
		res("2", "Susan Otto", "36:35"),
		res("3", "Michael Blanchard", "39:11"),
	];

	it("fires all_approved when every result is approved and every registrant submitted", () => {
		const d = decideTrigger({
			registrations: regs,
			results,
			approvedResultIds: ["1", "2", "3"],
			deadline: null,
		});
		expect(d.fire).toBe(true);
		expect(d.reason).toBe("all_approved");
	});

	it("waits when approvals are incomplete and no deadline passed", () => {
		const d = decideTrigger({
			registrations: regs,
			results,
			approvedResultIds: ["1"],
			deadline: new Date(Date.now() + 86400000).toISOString(),
		});
		expect(d.fire).toBe(false);
		expect(d.reason).toBe("waiting");
		expect(d.unapprovedResults.map((r) => r.result_id)).toEqual(["2", "3"]);
	});

	it("waits when a registered athlete has not submitted", () => {
		const d = decideTrigger({
			registrations: [...regs, reg("Jane", "Doe")],
			results,
			approvedResultIds: ["1", "2", "3"],
			deadline: null,
		});
		expect(d.fire).toBe(false);
		expect(d.reason).toBe("waiting");
		expect(d.missingSubmissions).toEqual(["Jane Doe"]);
	});

	it("fires deadline_reached with approved results and marks the rest as exceptions", () => {
		const d = decideTrigger({
			registrations: regs,
			results,
			approvedResultIds: ["1"],
			deadline: new Date(Date.now() - 1000).toISOString(),
		});
		expect(d.fire).toBe(true);
		expect(d.reason).toBe("deadline_reached");
		expect(d.unapprovedResults.map((r) => r.result_id)).toEqual(["2", "3"]);
	});

	it("does not fire after the deadline when nothing is approved", () => {
		const d = decideTrigger({
			registrations: regs,
			results,
			approvedResultIds: [],
			deadline: new Date(Date.now() - 1000).toISOString(),
		});
		expect(d.fire).toBe(false);
		expect(d.reason).toBe("exception");
	});

	it("treats results from unregistered athletes as an exception, never auto-process", () => {
		const d = decideTrigger({
			registrations: regs,
			results: [...results, res("9", "Stranger Danger", "40:00")],
			approvedResultIds: ["1", "2", "3", "9"],
			deadline: null,
		});
		expect(d.fire).toBe(false);
		expect(d.reason).toBe("exception");
		expect(d.unregisteredResults.map((r) => r.athlete)).toEqual(["Stranger Danger"]);
	});

	it("does not fire on an empty result set", () => {
		const d = decideTrigger({
			registrations: regs,
			results: [],
			approvedResultIds: [],
			deadline: null,
		});
		expect(d.fire).toBe(false);
		expect(d.reason).toBe("waiting");
	});
});

describe("isEventPublished (cron guard)", () => {
	function makePubDb(status: string | null) {
		return {
			prepare() {
				return {
					bind() {
						return {
							async first() {
								return status === null ? null : { status };
							},
						};
					},
				};
			},
		} as unknown as D1Database;
	}

	it("returns true when the latest publication status is PUBLISHED", async () => {
		const { isEventPublished } = await import("../src/series-2026-auto-process");
		expect(await isEventPublished(makePubDb("PUBLISHED"), 209477, 1173956)).toBe(true);
	});

	it("returns false when publication is in progress or absent", async () => {
		const { isEventPublished } = await import("../src/series-2026-auto-process");
		expect(await isEventPublished(makePubDb("PREPARING"), 209477, 1173956)).toBe(false);
		expect(await isEventPublished(makePubDb(null), 209477, 1173956)).toBe(false);
	});
});
