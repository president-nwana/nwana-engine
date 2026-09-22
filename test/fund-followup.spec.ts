import { describe, expect, it } from "vitest";
import {
	FOLLOWUP_OVERDUE_DAYS,
	FOLLOWUP_WINDOW_DAYS,
	followUpDueAt,
	followUpStatus,
	formatFollowUpDate,
} from "../src/fund-followup";
import { getFundView, type FundProspectRecord, type FundRecord } from "../src/fund";

const SENT_AT = "2026-09-22T14:19:00.000Z"; // Pool 4 factual send time

describe("fund follow-up due dates (ADR-0018)", () => {
	it("opens the follow-up window at 14 days after sent_at", () => {
		expect(FOLLOWUP_WINDOW_DAYS).toBe(14);
		expect(FOLLOWUP_OVERDUE_DAYS).toBe(21);
		expect(followUpDueAt(SENT_AT)).toBe("2026-10-06T14:19:00.000Z");
	});

	it("returns null when nothing was sent or sent_at is unusable", () => {
		expect(followUpDueAt(null)).toBeNull();
		expect(followUpDueAt(undefined)).toBeNull();
		expect(followUpDueAt("")).toBeNull();
		expect(followUpDueAt("not-a-date")).toBeNull();
	});

	it("reports upcoming before the window opens", () => {
		expect(followUpStatus("sent", SENT_AT, "2026-09-22T22:00:00.000Z")).toBe("upcoming");
		expect(followUpStatus("sent", SENT_AT, "2026-10-05T23:59:59.000Z")).toBe("upcoming");
	});

	it("reports due inside the 14-21 day window, inclusive of the due moment", () => {
		expect(followUpStatus("sent", SENT_AT, "2026-10-06T14:19:00.000Z")).toBe("due");
		expect(followUpStatus("sent", SENT_AT, "2026-10-10T00:00:00.000Z")).toBe("due");
		expect(followUpStatus("sent", SENT_AT, "2026-10-13T14:18:59.999Z")).toBe("due");
	});

	it("reports overdue once 21 days pass with no follow-up", () => {
		expect(followUpStatus("sent", SENT_AT, "2026-10-13T14:19:00.000Z")).toBe("overdue");
		expect(followUpStatus("sent", SENT_AT, "2026-11-01T00:00:00.000Z")).toBe("overdue");
	});

	it("reports none for stages that cannot have a due follow-up", () => {
		const now = "2026-11-01T00:00:00.000Z"; // well past overdue
		for (const stage of ["prospect", "verified", "drafted", "follow_up", "committed", "stewardship", "recognition"]) {
			expect(followUpStatus(stage, SENT_AT, now)).toBe("none");
		}
	});

	it("reports none when the dates are missing or unusable", () => {
		expect(followUpStatus("sent", null, "2026-10-10T00:00:00.000Z")).toBe("none");
		expect(followUpStatus("sent", "not-a-date", "2026-10-10T00:00:00.000Z")).toBe("none");
		expect(followUpStatus("sent", SENT_AT, "not-a-date")).toBe("none");
	});

	it("formats the due date as a plain calendar date", () => {
		expect(formatFollowUpDate("2026-10-06T14:19:00.000Z")).toBe("2026-10-06");
		expect(formatFollowUpDate(null)).toBe("");
	});
});

// Minimal D1 stub matching the exact SELECTs issued by getFundView.
function makeViewDb(funds: FundRecord[], prospects: FundProspectRecord[]) {
	return {
		prepare(sql: string) {
			return {
				bind(..._params: unknown[]) {
					return this;
				},
				async first() {
					throw new Error(`unexpected first(): ${sql}`);
				},
				async all() {
					if (sql.startsWith("SELECT * FROM funds ORDER BY created_at")) {
						return { results: [...funds] };
					}
					if (sql.startsWith("SELECT * FROM fund_prospects ORDER BY name")) {
						return { results: [...prospects].sort((a, b) => a.name.localeCompare(b.name)) };
					}
					throw new Error(`unexpected all(): ${sql}`);
				},
				async run() {
					throw new Error(`unexpected run(): ${sql}`);
				},
			};
		},
	} as unknown as D1Database;
}

function prospect(overrides: Partial<FundProspectRecord> & { name: string }): FundProspectRecord {
	return {
		id: `p-${overrides.name}`,
		fund_id: "fund-1",
		email: "x@example.org",
		stage: "sent",
		ask_amount: 5000,
		ask_tier: "$5K Founder",
		subject: "Subject",
		one_pager_version: "v5",
		sent_at: SENT_AT,
		stage_updated_at: SENT_AT,
		notes: null,
		...overrides,
	};
}

const FUND: FundRecord = {
	id: "fund-1",
	name: "Test Fund",
	slug: "test-fund",
	goal_amount: 50000,
	raised_amount: 0,
	currency: "USD",
	status: "active",
	description: null,
	created_at: "2026-09-20T00:00:00.000Z",
	updated_at: "2026-09-22T00:00:00.000Z",
};

describe("fund view follow-up surfacing (ADR-0018)", () => {
	it("carries due dates and statuses per prospect and a due-now count per fund", async () => {
		const db = makeViewDb([FUND], [
			prospect({ name: "Anna" }), // sent, due in window
			prospect({ name: "Boris", sent_at: null }), // sent but no sent_at
			prospect({ name: "Cora", stage: "follow_up" }), // follow-up already sent
		]);
		const view = await getFundView(db, "2026-10-07T12:00:00.000Z");
		const fund = view.funds[0];
		const byName = Object.fromEntries(fund.prospects.map((p) => [p.name, p]));

		expect(byName["Anna"].follow_up_due_at).toBe("2026-10-06T14:19:00.000Z");
		expect(byName["Anna"].follow_up_status).toBe("due");
		expect(byName["Anna"].next_action).toContain("Follow-up due 2026-10-06.");

		expect(byName["Boris"].follow_up_due_at).toBeNull();
		expect(byName["Boris"].follow_up_status).toBe("none");

		expect(byName["Cora"].follow_up_status).toBe("none");

		expect(fund.follow_ups_due_now).toBe(1);
	});

	it("counts overdue prospects in the due-now summary", async () => {
		const db = makeViewDb([FUND], [prospect({ name: "Anna" })]);
		const view = await getFundView(db, "2026-10-20T00:00:00.000Z");
		expect(view.funds[0].prospects[0].follow_up_status).toBe("overdue");
		expect(view.funds[0].follow_ups_due_now).toBe(1);
	});

	it("shows zero due when the window has not opened yet", async () => {
		const db = makeViewDb([FUND], [prospect({ name: "Anna" })]);
		const view = await getFundView(db, "2026-09-23T00:00:00.000Z");
		expect(view.funds[0].prospects[0].follow_up_status).toBe("upcoming");
		expect(view.funds[0].follow_ups_due_now).toBe(0);
	});
});
