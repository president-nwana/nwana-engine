import { describe, expect, it } from "vitest";
import {
	advanceBoardWorkItem,
	advanceInitiative,
	closeBoardMeeting,
	createBoardMeeting,
	getBoardMeetingDetail,
	isDecisionOutcome,
	isInitiativeStage,
	isMeetingStage,
	isSubmissionTriage,
	isWorkItemStage,
	listBoardMeetings,
	listBoardWorkItems,
	openBoardMeeting,
	recordBoardDecision,
	transitionInitiative,
	transitionMeeting,
	transitionWorkItem,
	triageAgenda,
	workItemNextAction,
} from "../src/board";

// Minimal stateful D1 stub: tables keyed on the exact SQL prefixes issued
// by src/board.ts. No invented members, meetings, or decisions: every row
// is created by an explicit call in the test.
function makeBoardDb() {
	const meetings: Record<string, unknown>[] = [];
	const submissions: Record<string, unknown>[] = [];
	const decisions: Record<string, unknown>[] = [];
	const workItems: Record<string, unknown>[] = [];
	const initiatives: Record<string, unknown>[] = [];
	const find = (rows: Record<string, unknown>[], key: string, value: unknown) =>
		rows.find((r) => r[key] === value);
	const db = {
		prepare(sql: string) {
			let args: unknown[] = [];
			const api = {
				bind(...params: unknown[]) {
					args = params;
					return api;
				},
				async first() {
					if (sql.startsWith("SELECT status, metadata FROM board_meetings WHERE meeting_id = ?")) {
						const m = find(meetings, "meeting_id", args[0]);
						return m ? { status: m.status, metadata: m.metadata } : null;
					}
					if (sql.startsWith("SELECT status FROM board_meetings WHERE meeting_id = ?")) {
						const m = find(meetings, "meeting_id", args[0]);
						return m ? { status: m.status } : null;
					}
					if (sql.startsWith("SELECT * FROM board_meetings WHERE meeting_id = ?")) {
						return find(meetings, "meeting_id", args[0]) ?? null;
					}
					if (sql.startsWith("SELECT status, meeting_id FROM board_submissions WHERE submission_id = ?")) {
						const s = find(submissions, "submission_id", args[0]);
						return s ? { status: s.status, meeting_id: s.meeting_id } : null;
					}
					if (sql.startsWith("SELECT status FROM work_items WHERE work_item_id = ?")) {
						const w = find(workItems, "work_item_id", args[0]);
						return w ? { status: w.status } : null;
					}
					if (sql.startsWith("SELECT status FROM initiatives WHERE initiative_id = ?")) {
						const i = find(initiatives, "initiative_id", args[0]);
						return i ? { status: i.status } : null;
					}
					if (sql.startsWith("SELECT work_item_id FROM work_items WHERE board_decision_id = ?")) {
						const w = find(workItems, "board_decision_id", args[0]);
						return w ? { work_item_id: w.work_item_id } : null;
					}
					throw new Error(`unexpected first(): ${sql}`);
				},
				async all() {
					if (sql.startsWith("SELECT m.meeting_id, m.title")) {
						return {
							results: meetings.map((m) => ({
								...m,
								agenda_count: submissions.filter(
									(s) => s.meeting_id === m.meeting_id && s.status === "AGENDA",
								).length,
								decision_count: decisions.filter((d) => d.meeting_id === m.meeting_id).length,
							})),
						};
					}
					if (sql.startsWith("SELECT submission_id, submission_type")) {
						return {
							results: submissions.filter(
								(s) => s.meeting_id === args[0] && (s.status === "AGENDA" || s.status === "DECIDED"),
							),
						};
					}
					if (sql.startsWith("SELECT d.decision_id")) {
						return {
							results: decisions
								.filter((d) => d.meeting_id === args[0])
								.map((d) => ({
									...d,
									submission_title: find(submissions, "submission_id", d.submission_id)?.title ?? null,
								})),
						};
					}
					if (sql.startsWith("SELECT w.work_item_id")) {
						return { results: workItems.filter((w) => w.status !== "DONE") };
					}
					if (sql.startsWith("SELECT decision_id, decision_text, outcome, responsible_person, due_date, machine_action")) {
						return {
							results: decisions.filter(
								(d) => d.meeting_id === args[0] && d.outcome === "CONFIRMED"
							),
						};
					}
					throw new Error(`unexpected all(): ${sql}`);
				},
				async run() {
					if (sql.startsWith("INSERT INTO board_meetings")) {
						meetings.push({
							meeting_id: args[0], title: args[1], scheduled_for: args[2],
							status: "DRAFT", opened_at: null, closed_at: null,
							minutes: null, metadata: null, created_at: "2026-09-22T00:00:00.000Z",
						});
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("UPDATE board_meetings SET status = 'OPEN'")) {
						const m = find(meetings, "meeting_id", args[3]);
						if (m) { m.status = "OPEN"; m.opened_at = args[0]; m.metadata = args[1]; }
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("UPDATE board_meetings SET status = 'CLOSED'")) {
						const m = find(meetings, "meeting_id", args[3]);
						if (m) { m.status = "CLOSED"; m.closed_at = args[0]; m.minutes = args[1]; }
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("UPDATE board_submissions SET meeting_id = ?")) {
						const s = find(submissions, "submission_id", args[2]);
						if (s) { s.meeting_id = args[0]; s.status = "AGENDA"; }
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("UPDATE board_submissions SET status = 'DECIDED'")) {
						const s = find(submissions, "submission_id", args[1]);
						if (s) s.status = "DECIDED";
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("UPDATE board_submissions SET status = 'PENDING'")) {
						let n = 0;
						for (const s of submissions) {
							if (s.meeting_id === args[1] && s.status === "AGENDA") { s.status = "PENDING"; n++; }
						}
						return { meta: { changes: n } };
					}
					if (sql.startsWith("INSERT INTO board_decisions")) {
						decisions.push({
							decision_id: args[0], meeting_id: args[1], submission_id: args[2],
							decision_text: args[3], outcome: args[4], vote_record: args[5],
							responsible_person: args[6], due_date: args[7], status: "CONFIRMED",
							created_at: "2026-09-22T00:00:00.000Z",
						});
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("INSERT INTO work_items")) {
						workItems.push({
							work_item_id: args[0], board_decision_id: args[1], title: args[2],
							description: args[3], work_type: "BOARD_DECISION", status: "READY",
							assigned_to: args[4], due_date: args[5], blocker: null, outcome: null,
							created_at: "2026-09-22T00:00:00.000Z",
						});
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("UPDATE work_items SET status")) {
						const w = find(workItems, "work_item_id", args[4]);
						if (w) {
							w.status = args[0];
							if (args[1]) w.blocker = args[1];
							if (args[2]) w.outcome = args[2];
						}
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("UPDATE initiatives SET status")) {
						const i = find(initiatives, "initiative_id", args[2]);
						if (i) i.status = args[0];
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("INSERT INTO audit_events")) {
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith("UPDATE board_decisions SET machine_result")) {
						const d = find(decisions, "decision_id", args[1]);
						if (d) d.machine_result = args[0];
						return { meta: { changes: 1 } };
					}
					throw new Error(`unexpected run(): ${sql}`);
				},
			};
			return api;
		},
	};
	return {
		db: db as unknown as D1Database,
		meetings, submissions, decisions, workItems, initiatives,
	};
}

function post(path: string, body: unknown): Request {
	return new Request(`https://example.com${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("meeting lifecycle state machine", () => {
	it("moves DRAFT -> OPEN -> CLOSED and rejects skips", () => {
		expect(isMeetingStage("OPEN")).toBe(true);
		expect(isMeetingStage("NOPE")).toBe(false);
		expect(transitionMeeting("DRAFT", "OPEN").ok).toBe(true);
		expect(transitionMeeting("OPEN", "CLOSED").ok).toBe(true);
		expect(transitionMeeting("DRAFT", "CLOSED").ok).toBe(false);
		expect(transitionMeeting("CLOSED", "OPEN").ok).toBe(false);
	});
});

describe("work item lifecycle state machine", () => {
	it("moves READY -> IN_PROGRESS -> DONE with BLOCKED as a side state", () => {
		expect(isWorkItemStage("DONE")).toBe(true);
		expect(transitionWorkItem("READY", "IN_PROGRESS").ok).toBe(true);
		expect(transitionWorkItem("IN_PROGRESS", "DONE").ok).toBe(true);
		expect(transitionWorkItem("READY", "BLOCKED").ok).toBe(true);
		expect(transitionWorkItem("BLOCKED", "IN_PROGRESS").ok).toBe(true);
		expect(transitionWorkItem("READY", "DONE").ok).toBe(false);
		expect(transitionWorkItem("DONE", "READY").ok).toBe(false);
		expect(workItemNextAction("BLOCKED")).toContain("blocker");
	});
});

describe("initiative lifecycle state machine", () => {
	it("moves NEW -> UNDER_REVIEW -> APPROVED -> CONVERTED with DECLINED as an exit", () => {
		expect(isInitiativeStage("NEW")).toBe(true);
		expect(transitionInitiative("NEW", "UNDER_REVIEW").ok).toBe(true);
		expect(transitionInitiative("UNDER_REVIEW", "APPROVED").ok).toBe(true);
		expect(transitionInitiative("UNDER_REVIEW", "DECLINED").ok).toBe(true);
		expect(transitionInitiative("APPROVED", "CONVERTED").ok).toBe(true);
		expect(transitionInitiative("NEW", "APPROVED").ok).toBe(false);
		expect(transitionInitiative("DECLINED", "NEW").ok).toBe(false);
	});
});

describe("decision outcomes and submission triage vocabulary", () => {
	it("accepts only CONFIRMED, DEFERRED, REJECTED", () => {
		expect(isDecisionOutcome("CONFIRMED")).toBe(true);
		expect(isDecisionOutcome("MAYBE")).toBe(false);
	});
	it("accepts only PENDING, AGENDA, DECIDED", () => {
		expect(isSubmissionTriage("AGENDA")).toBe(true);
		expect(isSubmissionTriage("TABLED")).toBe(false);
	});
});

describe("full board meeting loop", () => {
	it("creates, opens, triages, decides, tracks work, and closes with carryover", async () => {
		const { db, meetings, submissions, decisions, workItems } = makeBoardDb();
		submissions.push(
			{ submission_id: "BOARD-SUB-1", submission_type: "PROPOSAL", title: "Approve prize budget", description: "d", requested_outcome: "o", submitted_by: "Owner", requested_meeting_date: null, status: "PENDING", meeting_id: null, created_at: "2026-09-22T00:00:00.000Z" },
			{ submission_id: "BOARD-SUB-2", submission_type: "QUESTION", title: "Series 2027 naming", description: "d", requested_outcome: null, submitted_by: "Owner", requested_meeting_date: null, status: "PENDING", meeting_id: null, created_at: "2026-09-22T00:00:00.000Z" },
		);

		// Create and open.
		const created = await (await createBoardMeeting(post("/api/board/meetings", { title: "Weekly Board", scheduled_for: "2026-09-25" }), db)).json() as { meeting_id: string };
		expect(created.meeting_id.startsWith("MEET-")).toBe(true);
		const opened = await (await openBoardMeeting(post("/x/open", { attendees: "Albert Fatikhov" }), db, created.meeting_id)).json() as { status: string };
		expect(opened.status).toBe("OPEN");
		expect(meetings[0].status).toBe("OPEN");

		// Triage: one real id, one unknown id.
		const triaged = await (await triageAgenda(post("/x/agenda", { submission_ids: ["BOARD-SUB-1", "BOARD-SUB-9"] }), db, created.meeting_id)).json() as { added: string[]; skipped: { submission_id: string }[] };
		expect(triaged.added).toEqual(["BOARD-SUB-1"]);
		expect(triaged.skipped.map((s) => s.submission_id)).toEqual(["BOARD-SUB-9"]);
		expect(submissions[0].status).toBe("AGENDA");

		// Record a confirmed decision with owner and due date: creates a work item.
		const decided = await (await recordBoardDecision(post("/api/board/decisions", {
			meeting_id: created.meeting_id,
			submission_id: "BOARD-SUB-1",
			decision_text: "Approve the $500 prize budget for October races",
			outcome: "CONFIRMED",
			responsible_person: "Albert Fatikhov",
			due_date: "2026-10-02",
		}), db)).json() as { decision_id: string; work_item_id: string | null };
		expect(decided.decision_id.startsWith("DEC-")).toBe(true);
		expect(decided.work_item_id?.startsWith("WI-")).toBe(true);
		expect(decisions).toHaveLength(1);
		expect(workItems).toHaveLength(1);
		expect(workItems[0].assigned_to).toBe("Albert Fatikhov");
		expect(workItems[0].due_date).toBe("2026-10-02");
		expect(submissions[0].status).toBe("DECIDED");

		// A general deferred decision creates no work item.
		const deferred = await (await recordBoardDecision(post("/api/board/decisions", {
			meeting_id: created.meeting_id,
			decision_text: "Defer the naming question to next week",
			outcome: "DEFERRED",
		}), db)).json() as { work_item_id: string | null };
		expect(deferred.work_item_id).toBeNull();
		expect(workItems).toHaveLength(1);

		// Work item tracking.
		const listed = await (await listBoardWorkItems(db)).json() as { work_items: { work_item_id: string; next_action: string }[] };
		expect(listed.work_items).toHaveLength(1);
		expect(listed.work_items[0].next_action).toContain("Start");
		const advanced = await (await advanceBoardWorkItem(post("/x/advance", { work_item_id: decided.work_item_id, to_status: "IN_PROGRESS" }), db)).json() as { status: string };
		expect(advanced.status).toBe("IN_PROGRESS");
		const badAdvance = await (await advanceBoardWorkItem(post("/x/advance", { work_item_id: decided.work_item_id, to_status: "READY" }), db));
		expect(badAdvance.status).toBe(200); // IN_PROGRESS -> READY is a legal correction
		const doneResp = await advanceBoardWorkItem(post("/x/advance", { work_item_id: decided.work_item_id, to_status: "DONE" }), db);
		expect(doneResp.status).toBe(400); // READY -> DONE is not allowed

		// Meeting detail shows agenda and decisions.
		const detail = await (await getBoardMeetingDetail(db, created.meeting_id)).json() as { agenda: unknown[]; decisions: unknown[] };
		expect(detail.agenda).toHaveLength(1);
		expect(detail.decisions).toHaveLength(2);

		// Triage the second submission, then close: it carries back to PENDING.
		await triageAgenda(post("/x/agenda", { submission_ids: ["BOARD-SUB-2"] }), db, created.meeting_id);
		const closed = await (await closeBoardMeeting(post("/x/close", { minutes: "Prize budget approved." }), db, created.meeting_id)).json() as { status: string; carried_over: number };
		expect(closed.status).toBe("CLOSED");
		expect(closed.carried_over).toBe(1);
		expect(submissions[1].status).toBe("PENDING");
		expect(meetings[0].minutes).toBe("Prize budget approved.");

		// Closed meetings reject new decisions and triage.
		const afterClose = await recordBoardDecision(post("/api/board/decisions", {
			meeting_id: created.meeting_id, decision_text: "Too late", outcome: "CONFIRMED",
		}), db);
		expect(afterClose.status).toBe(400);
	});

	it("rejects a decision for a submission that is not on the agenda", async () => {
		const { db, submissions } = makeBoardDb();
		submissions.push(
			{ submission_id: "BOARD-SUB-1", submission_type: "PROPOSAL", title: "X", description: "d", requested_outcome: null, submitted_by: "Owner", requested_meeting_date: null, status: "PENDING", meeting_id: null, created_at: "2026-09-22T00:00:00.000Z" },
		);
		const created = await (await createBoardMeeting(post("/api/board/meetings", { title: "M" }), db)).json() as { meeting_id: string };
		await openBoardMeeting(post("/x/open", {}), db, created.meeting_id);
		const resp = await recordBoardDecision(post("/api/board/decisions", {
			meeting_id: created.meeting_id, submission_id: "BOARD-SUB-1",
			decision_text: "Decide without triage", outcome: "CONFIRMED",
		}), db);
		expect(resp.status).toBe(400);
	});

	it("lists meetings with agenda and decision counts", async () => {
		const { db } = makeBoardDb();
		const created = await (await createBoardMeeting(post("/api/board/meetings", { title: "M1" }), db)).json() as { meeting_id: string };
		const listed = await (await listBoardMeetings(db)).json() as { meetings: { title: string; agenda_count: number; decision_count: number }[] };
		expect(listed.meetings).toHaveLength(1);
		expect(listed.meetings[0].agenda_count).toBe(0);
		expect(listed.meetings[0].decision_count).toBe(0);
		expect(created.meeting_id).toBeTruthy();
	});
});

describe("initiative advancement", () => {
	it("advances an initiative through review to conversion", async () => {
		const { db, initiatives } = makeBoardDb();
		initiatives.push({ initiative_id: "INIT-1", status: "NEW" });
		const r1 = await (await advanceInitiative(post("/x", { initiative_id: "INIT-1", to_status: "UNDER_REVIEW" }), db)).json() as { status: string };
		expect(r1.status).toBe("UNDER_REVIEW");
		const r2 = await advanceInitiative(post("/x", { initiative_id: "INIT-1", to_status: "APPROVED" }), db);
		expect(r2.status).toBe(200);
		const bad = await advanceInitiative(post("/x", { initiative_id: "INIT-1", to_status: "CONVERTED" }), db);
		expect(bad.status).toBe(200); // APPROVED -> CONVERTED is legal
		expect(initiatives[0].status).toBe("CONVERTED");
		const unknown = await advanceInitiative(post("/x", { initiative_id: "INIT-9", to_status: "UNDER_REVIEW" }), db);
		expect(unknown.status).toBe(404);
	});
});
