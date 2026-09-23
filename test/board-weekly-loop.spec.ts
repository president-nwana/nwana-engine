// Board weekly loop: the standing-meeting guarantee.
//
// ADR-0025. The Board cycle runs itself:
//   1. ensureUpcomingMeeting(db) always returns exactly one upcoming
//      DRAFT/OPEN meeting, creating the cadence meeting when none exists.
//   2. Board submissions land on the protocol as board members submit them
//      (ADR-0020), and the weekly sweep moves the PENDING queue in.
//   3. Closing a meeting creates the next one and rolls unresolved/deferred
//      agenda items straight into the next protocol, showing author and date.
//   4. The operating-center pages show the next meeting date and the
//      protocol size, and carry only valid inline JavaScript.
import { describe, expect, it, vi } from "vitest";
import {
	ensureUpcomingMeeting,
	getBoardCadence,
	nextWeekdayDateInZone,
} from "../src/board-protocol";
import { renderOperatingCenterHtml } from "../src/operating-center";
import { renderBoardHtml } from "../src/operating-center-board";

vi.mock("../src/shared", async (importOriginal) => {
	const mod = (await importOriginal()) as Record<string, unknown>;
	return { ...mod, auditEvent: async () => ({ ok: true }) };
});
vi.mock("../src/board-protocol", async (importOriginal) => {
	const mod = (await importOriginal()) as Record<string, unknown>;
	return { ...mod, audit: async () => ({ ok: true }) };
});

interface MeetingRow {
	meeting_id: string;
	title: string;
	scheduled_for: string | null;
	status: string;
	created_at: string;
	protocol_formed_at: string | null;
}
interface SubmissionRow {
	submission_id: string;
	title: string;
	submission_type: string;
	submitted_by: string;
	status: string;
	meeting_id: string | null;
	created_at: string;
}

function makeDb(settings: Record<string, string> = {}) {
	const meetings: MeetingRow[] = [];
	const submissions: SubmissionRow[] = [];
	const pick = (sql: string, args: unknown[]) => {
		const stmt = {
			_sql: sql,
			_args: args,
			bind(...a: unknown[]) {
				return pick(sql, a);
			},
			async first() {
				// Nearest-upcoming query: DRAFT/OPEN, future-or-undated first.
				if (
					sql.startsWith("SELECT meeting_id, title, scheduled_for, status FROM board_meetings") &&
					sql.includes("CASE WHEN scheduled_for IS NULL")
				) {
					const today = String(args[0]);
					const open = meetings.filter((m) => m.status === "DRAFT" || m.status === "OPEN");
					const future = open
						.filter((m) => m.scheduled_for == null || m.scheduled_for.slice(0, 10) >= today)
						.sort((a, b) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? ""));
					const chosen = future[0] ?? open[0];
					return chosen
						? {
								meeting_id: chosen.meeting_id,
								title: chosen.title,
								scheduled_for: chosen.scheduled_for,
								status: chosen.status,
							}
						: null;
				}
				if (
					sql.includes("SELECT meeting_id FROM board_meetings") &&
					sql.includes("date('now')")
				) {
					const open = meetings.filter((m) => m.status === "DRAFT" || m.status === "OPEN");
					const future = open
						.filter((m) => m.scheduled_for != null)
						.sort((a, b) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? ""));
					const chosen = future[0] ?? open[0];
					return chosen ? { meeting_id: chosen.meeting_id } : null;
				}
				if (sql.includes("substr(scheduled_for, 1, 10) = ?") && sql.includes("status IN ('DRAFT', 'OPEN')")) {
					const m = meetings.find(
						(x) => x.scheduled_for?.slice(0, 10) === String(args[0]) && (x.status === "DRAFT" || x.status === "OPEN"),
					);
					return m
						? { meeting_id: m.meeting_id, title: m.title, scheduled_for: m.scheduled_for, status: m.status }
						: null;
				}
				if (sql.startsWith("SELECT status FROM board_meetings WHERE meeting_id = ?")) {
					const m = meetings.find((x) => x.meeting_id === String(args[0]));
					return m ? { status: m.status } : null;
				}
				throw new Error(`unexpected first(): ${sql}`);
			},
			async all() {
				if (sql.startsWith("SELECT key, value FROM board_settings")) {
					return {
						results: Object.entries(settings).map(([key, value]) => ({ key, value })),
					};
				}
				if (sql.startsWith("SELECT submission_id FROM board_submissions WHERE meeting_id = ? AND status = 'AGENDA'")) {
					return {
						results: submissions
							.filter((s) => s.meeting_id === String(args[0]) && s.status === "AGENDA")
							.map((s) => ({ submission_id: s.submission_id })),
					};
				}
				if (sql.startsWith("SELECT submission_id, submission_type")) {
					return {
						results: submissions.filter(
							(s) => s.meeting_id === String(args[0]) && (s.status === "AGENDA" || s.status === "DECIDED"),
						),
					};
				}
				if (
					sql.startsWith("SELECT decision_id, decision_text, outcome, responsible_person, due_date, machine_action") ||
					sql.startsWith("SELECT d.decision_id")
				) {
					return { results: [] };
				}
				throw new Error(`unexpected all(): ${sql}`);
			},
			async run() {
				if (sql.startsWith("INSERT INTO board_meetings")) {
					meetings.push({
						meeting_id: String(args[0]),
						title: String(args[1]),
						scheduled_for: args[2] == null ? null : String(args[2]),
						status: "DRAFT",
						created_at: new Date().toISOString(),
						protocol_formed_at: null,
					});
					return { meta: { changes: 1 } };
				}
				if (sql.startsWith("UPDATE board_meetings SET protocol_formed_at = ?")) {
					const m = meetings.find((x) => x.meeting_id === String(args[2]));
					if (m) m.protocol_formed_at = String(args[0]);
					return { meta: { changes: 1 } };
				}
				if (sql.startsWith("UPDATE board_meetings SET status = 'CLOSED'")) {
					const m = meetings.find((x) => x.meeting_id === String(args[3]));
					if (m) m.status = "CLOSED";
					return { meta: { changes: 1 } };
				}
				if (sql.startsWith("UPDATE board_submissions SET meeting_id = ?, status = 'AGENDA', updated_at = ?")) {
					if (sql.includes("WHERE status = 'PENDING'")) {
						let n = 0;
						for (const s of submissions) {
							if (s.status === "PENDING") {
								s.meeting_id = String(args[0]);
								s.status = "AGENDA";
								n++;
							}
						}
						return { meta: { changes: n } };
					}
					const s = submissions.find(
						(x) => x.submission_id === String(args[2]) && x.status === "PENDING",
					);
					if (s) {
						s.meeting_id = String(args[0]);
						s.status = "AGENDA";
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				}
				if (sql.startsWith("UPDATE board_submissions SET status = 'PENDING'")) {
					let n = 0;
					for (const s of submissions) {
						if (s.meeting_id === String(args[1]) && s.status === "AGENDA") {
							s.status = "PENDING";
							n++;
						}
					}
					return { meta: { changes: n } };
				}
				if (sql.includes("INSERT INTO board_submissions")) {
					submissions.push({
						submission_id: String(args[0]),
						title: String(args[3]),
						submission_type: String(args[2]),
						submitted_by: String(args[6]),
						status: String(args[8]),
						meeting_id: args[1] == null ? null : String(args[1]),
						created_at: new Date().toISOString(),
					});
					return { meta: { changes: 1 } };
				}
				if (sql.includes("INSERT INTO audit_events") || sql.includes("INSERT INTO audit")) {
					return { meta: { changes: 1 } };
				}
				throw new Error(`unexpected run(): ${sql}`);
			},
		};
		return stmt;
	};
	const db = {
		prepare: (sql: string) => pick(sql, []),
		async batch(stmts: { _sql: string; _args: unknown[] }[]) {
			// Execute each stub statement through the same run() logic.
			for (const s of stmts) await pick(s._sql, s._args).run();
			return stmts.map(() => ({ meta: { changes: 1 } }));
		},
	} as unknown as D1Database;
	return { db, meetings, submissions };
}

describe("nextWeekdayDateInZone", () => {
	it("returns the coming Sunday in New York, or today when it is Sunday", () => {
		// Tuesday 2026-09-22 12:00 UTC -> coming Sunday is 2026-09-27.
		expect(nextWeekdayDateInZone(new Date("2026-09-22T12:00:00Z"), "Sunday", "America/New_York")).toBe(
			"2026-09-27",
		);
		// Sunday 2026-09-27 18:00 UTC = 2:00 PM EDT -> today.
		expect(nextWeekdayDateInZone(new Date("2026-09-27T18:00:00Z"), "Sunday", "America/New_York")).toBe(
			"2026-09-27",
		);
		// DST edge: late October Sunday is still Sunday in New York.
		expect(nextWeekdayDateInZone(new Date("2026-10-30T12:00:00Z"), "Sunday", "America/New_York")).toBe(
			"2026-11-01",
		);
	});
});

describe("getBoardCadence", () => {
	it("defaults to weekly Sunday 2:00 PM New York time", async () => {
		const { db } = makeDb();
		const cadence = await getBoardCadence(db);
		expect(cadence).toMatchObject({
			cadence: "weekly",
			weekday: "Sunday",
			time: "14:00",
			timezone: "America/New_York",
			title: "Weekly Board meeting",
		});
	});

	it("reads an overridden schedule from board_settings", async () => {
		const { db } = makeDb({ meeting_weekday: "Monday", meeting_time: "10:30" });
		const cadence = await getBoardCadence(db);
		expect(cadence.weekday).toBe("Monday");
		expect(cadence.time).toBe("10:30");
		expect(cadence.timezone).toBe("America/New_York");
	});
});

describe("ensureUpcomingMeeting", () => {
	it("creates the cadence meeting when none exists, and is idempotent", async () => {
		const { db, meetings } = makeDb();
		const first = await ensureUpcomingMeeting(db, new Date("2026-09-22T12:00:00Z"));
		expect(first.created).toBe(true);
		expect(first.scheduled_for).toBe("2026-09-27");
		expect(meetings).toHaveLength(1);

		const second = await ensureUpcomingMeeting(db, new Date("2026-09-22T13:00:00Z"));
		expect(second.created).toBe(false);
		expect(second.meeting_id).toBe(first.meeting_id);
		expect(meetings).toHaveLength(1);
	});

	it("reuses an existing upcoming meeting instead of creating a new one", async () => {
		const { db, meetings } = makeDb();
		meetings.push({
			meeting_id: "MEET-EXTRA",
			title: "Special Board session",
			scheduled_for: "2026-09-25",
			status: "DRAFT",
			created_at: "2026-09-22T00:00:00.000Z",
			protocol_formed_at: null,
		});
		const next = await ensureUpcomingMeeting(db, new Date("2026-09-22T12:00:00Z"));
		expect(next.created).toBe(false);
		expect(next.meeting_id).toBe("MEET-EXTRA");
		expect(meetings).toHaveLength(1);
	});
});

describe("submission flow into the protocol", () => {
	it("a new submission auto-attaches to the upcoming meeting when none is named", async () => {
		const { createBoardSubmission } = await import("../src/operating-center");
		const { db, meetings, submissions } = makeDb();
		const ensured = await ensureUpcomingMeeting(db, new Date("2026-09-22T12:00:00Z"));
		const req = new Request("https://x/api/board/submissions", {
			method: "POST",
			body: JSON.stringify({
				submission_type: "QUESTION",
				title: "Approve the October prize budget",
				description: "Board approval for the October race prize budget.",
				submitted_by: "Albert Tazetdinov",
			}),
		});
		const created = (await (await createBoardSubmission(req, db)).json()) as {
			ok: boolean;
			status: string;
			meeting_id: string | null;
			auto_attached: boolean;
		};
		expect(created.ok).toBe(true);
		expect(created.auto_attached).toBe(true);
		expect(created.status).toBe("AGENDA");
		expect(created.meeting_id).toBe(ensured.meeting_id);
		expect(submissions).toHaveLength(1);
		expect(submissions[0].meeting_id).toBe(ensured.meeting_id);
		expect(meetings).toHaveLength(1);
	});

	it("the weekly sweep moves the PENDING queue onto the protocol", async () => {
		const { formWeeklyProtocol } = await import("../src/board-protocol");
		const { db, meetings, submissions } = makeDb();
		submissions.push({
			submission_id: "BOARD-SUB-2",
			title: "Confirm the November race calendar",
			submission_type: "QUESTION",
			submitted_by: "Liene Visocka",
			status: "PENDING",
			meeting_id: null,
			created_at: "2026-09-23T09:00:00.000Z",
		});
		const res = await formWeeklyProtocol(db, new Date("2026-09-22T12:00:00Z"));
		const body = (await res.json()) as { ok: boolean; swept: number; sunday: string };
		expect(body.ok).toBe(true);
		expect(body.swept).toBe(1);
		expect(body.sunday).toBe("2026-09-27");
		expect(submissions[0].status).toBe("AGENDA");
		expect(submissions[0].meeting_id).toBe(meetings[0].meeting_id);
	});
});

describe("closeBoardMeeting rollover", () => {
	it("creates the next meeting and carries unresolved/deferred items into its protocol", async () => {
		const { closeBoardMeeting } = await import("../src/board");
		const { db, meetings, submissions } = makeDb();
		meetings.push({
			meeting_id: "MEET-NOW",
			title: "Weekly Board meeting",
			scheduled_for: "2026-09-20",
			status: "OPEN",
			created_at: "2026-09-13T00:00:00.000Z",
			protocol_formed_at: "2026-09-20T18:00:00.000Z",
		});
		submissions.push({
			submission_id: "BOARD-SUB-A",
			title: "Unresolved question",
			submission_type: "QUESTION",
			submitted_by: "Albert Tazetdinov",
			status: "AGENDA",
			meeting_id: "MEET-NOW",
			created_at: "2026-09-18T10:00:00.000Z",
		});
		submissions.push({
			submission_id: "BOARD-SUB-B",
			title: "Deferred initiative",
			submission_type: "INITIATIVE",
			submitted_by: "Maris Vainovskis",
			status: "AGENDA",
			meeting_id: "MEET-NOW",
			created_at: "2026-09-19T11:00:00.000Z",
		});
		const req = new Request("https://x/close", {
			method: "POST",
			body: JSON.stringify({ minutes: "Done." }),
		});
		const closed = (await (
			await closeBoardMeeting(req, db, "MEET-NOW")
		).json()) as {
			status: string;
			carried_over: number;
			rolled_over: number;
			next_meeting_id: string | null;
		};
		expect(closed.status).toBe("CLOSED");
		expect(closed.carried_over).toBe(2);
		expect(closed.rolled_over).toBe(2);
		expect(closed.next_meeting_id).not.toBeNull();
		expect(closed.next_meeting_id).not.toBe("MEET-NOW");
		// The next meeting exists and both items sit on its protocol.
		const next = meetings.find((m) => m.meeting_id === closed.next_meeting_id);
		expect(next?.status).toBe("DRAFT");
		for (const s of submissions) {
			expect(s.status).toBe("AGENDA");
			expect(s.meeting_id).toBe(closed.next_meeting_id);
			// Author and submission date stay visible on the item.
			expect(s.submitted_by).toBeTruthy();
			expect(s.created_at).toBeTruthy();
		}
	});
});

describe("board pages", () => {
	const mainHtml = renderOperatingCenterHtml();
	const boardPage = renderBoardHtml();

	it("shows the next meeting date and protocol count on the main page", () => {
		expect(mainHtml).toContain("id=\"board-summary\"");
		expect(mainHtml).toContain("Next Board meeting");
		expect(mainHtml).toContain("Protocol:");
		expect(mainHtml).toContain("href=\"/operating-center/board\"");
	});

	it("embeds syntactically valid JavaScript on the main page", () => {
		const scripts = [...mainHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});

	it("embeds syntactically valid JavaScript on the board page", () => {
		const scripts = [...boardPage.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
