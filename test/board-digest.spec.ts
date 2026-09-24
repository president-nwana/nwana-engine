import { describe, expect, it } from "vitest";
import { getBoardDigest } from "../src/board-digest";
import { renderBoardHtml } from "../src/operating-center-board";

const NOW = new Date("2026-09-24T12:00:00.000Z"); // 2026-09-24 in America/New_York

// Minimal stateful D1 stub keyed on SQL prefixes issued by
// src/board-digest.ts (and getBoardCadence in src/board-protocol.ts).
// Counts every run(): the digest must never write.
function makeDigestDb(seed: boolean) {
	const meetings = seed
		? [
				{
					meeting_id: "m1", title: "Weekly Board meeting",
					scheduled_for: "2026-09-27", status: "DRAFT",
					protocol_formed_at: null, created_at: "2026-09-22T10:00:00.000Z",
				},
			]
		: [];
	const submissions = seed
		? [
				{
					submission_id: "s1", submission_type: "QUESTION", title: "Triage me",
					submitted_by: "A. Member", requested_outcome: null,
					status: "PENDING", meeting_id: null,
					created_at: "2026-09-23T10:00:00.000Z",
				},
				{
					submission_id: "s2", submission_type: "PROPOSAL", title: "Carried item",
					submitted_by: "B. Member", requested_outcome: "Approve",
					status: "AGENDA", meeting_id: "m1",
					created_at: "2026-09-15T10:00:00.000Z", // before the meeting: carried over
				},
				{
					submission_id: "s3", submission_type: "INITIATIVE", title: "Fresh agenda item",
					submitted_by: "C. Member", requested_outcome: null,
					status: "AGENDA", meeting_id: "m1",
					created_at: "2026-09-23T11:00:00.000Z",
				},
			]
		: [];
	const decisions = seed
		? [
				{
					decision_id: "d1", submission_id: "s2", decision_text: "Approved the proposal",
					outcome: "CONFIRMED", responsible_person: "A. Member",
					due_date: "2026-10-01", meeting_id: "m1",
					created_at: "2026-09-20T10:00:00.000Z",
				},
			]
		: [];
	const workItems = seed
		? [
				{
					work_item_id: "w1", title: "Overdue task", status: "IN_PROGRESS",
					assigned_to: "A. Member", due_date: "2026-09-20", blocker: null,
					created_at: "2026-09-18T10:00:00.000Z",
				},
				{
					work_item_id: "w2", title: "Blocked task", status: "BLOCKED",
					assigned_to: "B. Member", due_date: "2026-10-05", blocker: "Waiting on vendor",
					created_at: "2026-09-19T10:00:00.000Z",
				},
				{
					work_item_id: "w3", title: "Done task", status: "DONE",
					assigned_to: "C. Member", due_date: "2026-09-10", blocker: null,
					created_at: "2026-09-12T10:00:00.000Z",
				},
			]
		: [];
	let runs = 0;
	const db = {
		prepare(sql: string) {
			let args: unknown[] = [];
			return {
				bind(...params: unknown[]) {
					args = params;
					return this;
				},
				async first() {
					if (sql.includes("FROM board_meetings") && sql.includes("status IN ('DRAFT', 'OPEN')")) {
						const rows = meetings.filter(
							(m) => (m.scheduled_for ?? "9999-12-31") >= "2026-09-24",
						);
						return rows[0] ?? null;
					}
					throw new Error(`unexpected first(): ${sql}`);
				},
				async all() {
					if (sql.includes("FROM board_settings")) return { results: [] };
					if (sql.includes("FROM board_submissions") && sql.includes("status = 'PENDING'")) {
						return { results: submissions.filter((s) => s.status === "PENDING") };
					}
					if (sql.includes("FROM board_submissions") && sql.includes("meeting_id = ?")) {
						return {
							results: submissions.filter(
								(s) => s.meeting_id === args[0] && (s.status === "AGENDA" || s.status === "DECIDED"),
							),
						};
					}
					if (sql.includes("FROM board_decisions d")) {
						return {
							results: decisions.map((d) => ({
								...d,
								submission_title: "Carried item",
								meeting_date: "2026-09-27",
							})),
						};
					}
					if (sql.includes("FROM work_items w")) {
						return { results: workItems.filter((w) => w.status !== "DONE") };
					}
					throw new Error(`unexpected all(): ${sql}`);
				},
				async run() {
					runs += 1;
					return { success: true };
				},
			};
		},
	} as unknown as D1Database;
	return { db, runCount: () => runs };
}

describe("board pre-meeting digest", () => {
	it("returns explicit empty states and never creates a meeting", async () => {
		const { db, runCount } = makeDigestDb(false);
		const digest = await getBoardDigest(db, NOW);
		expect(digest.ok).toBe(true);
		expect(digest.upcoming_meeting).toBeNull();
		expect(digest.open_submissions).toEqual([]);
		expect(digest.agenda).toEqual([]);
		expect(digest.recent_decisions).toEqual([]);
		expect(digest.overdue_work).toEqual([]);
		expect(digest.blocked_work).toEqual([]);
		expect(runCount()).toBe(0);
	});

	it("assembles all sections from existing board data", async () => {
		const { db, runCount } = makeDigestDb(true);
		const digest = await getBoardDigest(db, NOW);

		expect(digest.upcoming_meeting?.meeting_id).toBe("m1");
		expect(digest.cadence.timezone).toBe("America/New_York");

		expect(digest.open_submissions.map((s) => s.submission_id)).toEqual(["s1"]);

		expect(digest.agenda.map((a) => a.submission_id)).toEqual(["s2", "s3"]);
		expect(digest.agenda.find((a) => a.submission_id === "s2")?.preexisting).toBe(true);
		expect(digest.agenda.find((a) => a.submission_id === "s3")?.preexisting).toBe(false);

		expect(digest.recent_decisions).toHaveLength(1);
		expect(digest.recent_decisions[0].responsible_person).toBe("A. Member");
		expect(digest.recent_decisions[0].due_date).toBe("2026-10-01");

		expect(digest.overdue_work.map((w) => w.work_item_id)).toEqual(["w1"]);
		expect(digest.blocked_work.map((w) => w.work_item_id)).toEqual(["w2"]);
		// DONE items are excluded everywhere.
		expect(digest.overdue_work.concat(digest.blocked_work).some((w) => w.work_item_id === "w3")).toBe(false);

		expect(runCount()).toBe(0);
	});

	it("renders the digest panel on the board page with valid JS", () => {
		const html = renderBoardHtml();
		expect(html).toContain('id="digest"');
		expect(html).toContain("Pre-meeting digest");
		const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
