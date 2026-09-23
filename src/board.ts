// ADR-0019: Board meeting loop — the management layer of the machine.
//
// Initiative intake and Board submissions already existed (ADR-0006,
// migration 0018) but nothing could happen to them: no meeting could be
// recorded, no agenda built, no decision stored, no work tracked. The
// board_meetings, board_decisions, and work_items tables existed and were
// never written. This module closes that loop for a solo owner running
// weekly Board meetings:
//
//   meeting: DRAFT -> OPEN -> CLOSED
//   agenda triage: PENDING -> AGENDA (unresolved items return to PENDING
//     when the meeting closes, so they carry into the next meeting)
//   decision: CONFIRMED | DEFERRED | REJECTED, with responsible person
//     and due date; a CONFIRMED decision immediately becomes a linked
//     work item (ADR-0006 requirement)
//   work item: READY -> IN_PROGRESS -> DONE (BLOCKED allowed)
//   initiative: NEW -> UNDER_REVIEW -> APPROVED -> CONVERTED
//     (or UNDER_REVIEW -> DECLINED)
//
// The machine never invents Board members, meetings, or decisions: every
// record is created by an explicit owner action, and empty states stay
// explicit. No emails, no notifications, no Gmail of any kind.
//
// ADR-0022: post-meeting protocol processing. When a meeting closes,
// processProtocol (from board-protocol.ts) ensures every CONFIRMED decision
// becomes tracked work and executes the machine_action chosen at decision
// time (prepare a draft for owner review). Sends and consequential actions
// stay human-confirmed.

import { isMachineAction, processProtocol } from "./board-protocol";

export const MEETING_STAGES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type MeetingStage = (typeof MEETING_STAGES)[number];

export const MEETING_STAGE_LABELS: Record<MeetingStage, string> = {
	DRAFT: "Draft",
	OPEN: "Open",
	CLOSED: "Closed",
};

const MEETING_TRANSITIONS: Record<MeetingStage, MeetingStage[]> = {
	DRAFT: ["OPEN"],
	OPEN: ["CLOSED"],
	CLOSED: [],
};

export function isMeetingStage(value: string): value is MeetingStage {
	return (MEETING_STAGES as readonly string[]).includes(value);
}

export function transitionMeeting(
	current: string,
	target: string,
): { ok: boolean; to: MeetingStage | null; reason: string | null } {
	if (!isMeetingStage(current)) {
		return { ok: false, to: null, reason: `Unknown meeting stage "${current}"` };
	}
	if (!isMeetingStage(target)) {
		return { ok: false, to: null, reason: `Unknown meeting stage "${target}"` };
	}
	if (current === target) return { ok: true, to: current, reason: null };
	if (!MEETING_TRANSITIONS[current].includes(target)) {
		return {
			ok: false,
			to: null,
			reason: `Meeting stage "${current}" cannot move to "${target}". Allowed: ${MEETING_TRANSITIONS[current].join(", ") || "none (terminal)"}.`,
		};
	}
	return { ok: true, to: target, reason: null };
}

export const DECISION_OUTCOMES = ["CONFIRMED", "DEFERRED", "REJECTED"] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export const DECISION_OUTCOME_LABELS: Record<DecisionOutcome, string> = {
	CONFIRMED: "Confirmed",
	DEFERRED: "Deferred",
	REJECTED: "Rejected",
};

export function isDecisionOutcome(value: string): value is DecisionOutcome {
	return (DECISION_OUTCOMES as readonly string[]).includes(value);
}

export const WORK_ITEM_STAGES = [
	"READY",
	"IN_PROGRESS",
	"BLOCKED",
	"DONE",
] as const;
export type WorkItemStage = (typeof WORK_ITEM_STAGES)[number];

export const WORK_ITEM_STAGE_LABELS: Record<WorkItemStage, string> = {
	READY: "Ready",
	IN_PROGRESS: "In progress",
	BLOCKED: "Blocked",
	DONE: "Done",
};

// Forward flow plus one-step corrections backward; BLOCKED is a side state.
// DONE is terminal: finished work stays finished.
const WORK_ITEM_TRANSITIONS: Record<WorkItemStage, WorkItemStage[]> = {
	READY: ["IN_PROGRESS", "BLOCKED"],
	IN_PROGRESS: ["READY", "BLOCKED", "DONE"],
	BLOCKED: ["READY", "IN_PROGRESS"],
	DONE: [],
};

export function isWorkItemStage(value: string): value is WorkItemStage {
	return (WORK_ITEM_STAGES as readonly string[]).includes(value);
}

export function transitionWorkItem(
	current: string,
	target: string,
): { ok: boolean; to: WorkItemStage | null; reason: string | null } {
	if (!isWorkItemStage(current)) {
		return { ok: false, to: null, reason: `Unknown work item stage "${current}"` };
	}
	if (!isWorkItemStage(target)) {
		return { ok: false, to: null, reason: `Unknown work item stage "${target}"` };
	}
	if (current === target) return { ok: true, to: current, reason: null };
	if (!WORK_ITEM_TRANSITIONS[current].includes(target)) {
		return {
			ok: false,
			to: null,
			reason: `Work item stage "${current}" cannot move to "${target}". Allowed: ${WORK_ITEM_TRANSITIONS[current].join(", ") || "none (terminal)"}.`,
		};
	}
	return { ok: true, to: target, reason: null };
}

export function workItemNextAction(stage: WorkItemStage): string {
	switch (stage) {
		case "READY":
			return "Start the work or assign it explicitly.";
		case "IN_PROGRESS":
			return "Finish the work, or mark it Blocked with the exact blocker.";
		case "BLOCKED":
			return "Resolve the recorded blocker, then move it back to Ready or In progress.";
		case "DONE":
			return "Work is complete. It stays on the record.";
	}
}

export const INITIATIVE_STAGES = [
	"NEW",
	"UNDER_REVIEW",
	"PROPOSED",
	"APPROVED",
	"DECLINED",
	"CONVERTED",
] as const;
export type InitiativeStage = (typeof INITIATIVE_STAGES)[number];

export const INITIATIVE_STAGE_LABELS: Record<InitiativeStage, string> = {
	NEW: "New",
	UNDER_REVIEW: "Under review",
	PROPOSED: "Proposed",
	APPROVED: "Approved",
	DECLINED: "Declined",
	CONVERTED: "Converted",
};

const INITIATIVE_TRANSITIONS: Record<InitiativeStage, InitiativeStage[]> = {
	NEW: ["UNDER_REVIEW"],
	UNDER_REVIEW: ["APPROVED", "DECLINED"],
	PROPOSED: ["UNDER_REVIEW"],
	APPROVED: ["CONVERTED"],
	DECLINED: [],
	CONVERTED: [],
};

export function isInitiativeStage(value: string): value is InitiativeStage {
	return (INITIATIVE_STAGES as readonly string[]).includes(value);
}

export function transitionInitiative(
	current: string,
	target: string,
): { ok: boolean; to: InitiativeStage | null; reason: string | null } {
	if (!isInitiativeStage(current)) {
		return { ok: false, to: null, reason: `Unknown initiative stage "${current}"` };
	}
	if (!isInitiativeStage(target)) {
		return { ok: false, to: null, reason: `Unknown initiative stage "${target}"` };
	}
	if (current === target) return { ok: true, to: current, reason: null };
	if (!INITIATIVE_TRANSITIONS[current].includes(target)) {
		return {
			ok: false,
			to: null,
			reason: `Initiative stage "${current}" cannot move to "${target}". Allowed: ${INITIATIVE_TRANSITIONS[current].join(", ") || "none (terminal)"}.`,
		};
	}
	return { ok: true, to: target, reason: null };
}

// Submission triage vocabulary used by the meeting loop. PENDING items live
// in the intake queue; AGENDA items belong to an open meeting; DECIDED items
// were resolved by a recorded decision; items still on the agenda when a
// meeting closes return to PENDING so the next meeting can pick them up.
export const SUBMISSION_TRIAGE = ["PENDING", "AGENDA", "DECIDED"] as const;
export type SubmissionTriage = (typeof SUBMISSION_TRIAGE)[number];

export function isSubmissionTriage(value: string): value is SubmissionTriage {
	return (SUBMISSION_TRIAGE as readonly string[]).includes(value);
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"access-control-allow-origin": "*",
		},
	});
}

async function readJsonBody<T>(request: Request): Promise<T> {
	try {
		return (await request.json()) as T;
	} catch {
		throw new Error("Request body must be valid JSON");
	}
}

export interface BoardMeetingInput {
	title: string;
	scheduled_for?: string;
}

export interface BoardMeetingRecord {
	meeting_id: string;
	title: string;
	scheduled_for: string | null;
	status: string;
	opened_at: string | null;
	closed_at: string | null;
	minutes: string | null;
	attendees: string | null;
	agenda_count: number;
	decision_count: number;
	created_at: string;
}

function parseAttendees(metadata: string | null): string | null {
	if (!metadata) return null;
	try {
		const parsed = JSON.parse(metadata) as { attendees?: unknown };
		return typeof parsed.attendees === "string" && parsed.attendees.trim()
			? parsed.attendees
			: null;
	} catch {
		return null;
	}
}

export async function createBoardMeeting(
	request: Request,
	db: D1Database,
): Promise<Response> {
	const input = await readJsonBody<BoardMeetingInput>(request);
	const title = (input.title ?? "").trim();
	if (!title) throw new Error("Meeting title is required");
	const scheduledFor = (input.scheduled_for ?? "").trim() || null;
	if (scheduledFor && !/^\d{4}-\d{2}-\d{2}/.test(scheduledFor)) {
		throw new Error("scheduled_for must be a date like 2026-09-25");
	}
	const meetingId = `MEET-${crypto.randomUUID()}`;
	await db
		.prepare(
			`INSERT INTO board_meetings (meeting_id, title, scheduled_for, status)
			 VALUES (?, ?, ?, 'DRAFT')`,
		)
		.bind(meetingId, title, scheduledFor)
		.run();
	return jsonResponse({ ok: true, meeting_id: meetingId, status: "DRAFT" }, 201);
}

export async function listBoardMeetings(db: D1Database): Promise<Response> {
	const result = await db
		.prepare(
			`SELECT m.meeting_id, m.title, m.scheduled_for, m.status,
			        m.opened_at, m.closed_at, m.minutes, m.metadata, m.created_at,
			        (SELECT COUNT(*) FROM board_submissions s WHERE s.meeting_id = m.meeting_id AND s.status = 'AGENDA') AS agenda_count,
			        (SELECT COUNT(*) FROM board_decisions d WHERE d.meeting_id = m.meeting_id) AS decision_count
			 FROM board_meetings m
			 ORDER BY COALESCE(m.scheduled_for, '9999-12-31') DESC, m.created_at DESC
			 LIMIT 100`,
		)
		.all<{
			meeting_id: string;
			title: string;
			scheduled_for: string | null;
			status: string;
			opened_at: string | null;
			closed_at: string | null;
			minutes: string | null;
			metadata: string | null;
			created_at: string;
			agenda_count: number;
			decision_count: number;
		}>();
	const meetings: BoardMeetingRecord[] = result.results.map((m) => ({
		meeting_id: m.meeting_id,
		title: m.title,
		scheduled_for: m.scheduled_for,
		status: m.status,
		opened_at: m.opened_at,
		closed_at: m.closed_at,
		minutes: m.minutes,
		attendees: parseAttendees(m.metadata),
		agenda_count: Number(m.agenda_count ?? 0),
		decision_count: Number(m.decision_count ?? 0),
		created_at: m.created_at,
	}));
	return jsonResponse({ ok: true, meetings });
}

export async function getBoardMeetingDetail(
	db: D1Database,
	meetingId: string,
): Promise<Response> {
	const meeting = await db
		.prepare(`SELECT * FROM board_meetings WHERE meeting_id = ?`)
		.bind(meetingId)
		.first<{
			meeting_id: string;
			title: string;
			scheduled_for: string | null;
			status: string;
			opened_at: string | null;
			closed_at: string | null;
			minutes: string | null;
			metadata: string | null;
			created_at: string;
		}>();
	if (!meeting) {
		return jsonResponse({ ok: false, error: `Meeting "${meetingId}" not found` }, 404);
	}
	const agenda = await db
		.prepare(
			`SELECT submission_id, submission_type, title, description,
			        requested_outcome, submitted_by, requested_meeting_date, status
			 FROM board_submissions
			 WHERE meeting_id = ? AND status IN ('AGENDA', 'DECIDED')
			 ORDER BY created_at`,
		)
		.bind(meetingId)
		.all();
	const decisions = await db
		.prepare(
			`SELECT d.decision_id, d.submission_id, d.decision_text, d.outcome,
			        d.vote_record, d.responsible_person, d.due_date, d.status,
			        d.created_at, s.title AS submission_title
			 FROM board_decisions d
			 LEFT JOIN board_submissions s ON s.submission_id = d.submission_id
			 WHERE d.meeting_id = ?
			 ORDER BY d.created_at`,
		)
		.bind(meetingId)
		.all();
	return jsonResponse({
		ok: true,
		meeting: {
			meeting_id: meeting.meeting_id,
			title: meeting.title,
			scheduled_for: meeting.scheduled_for,
			status: meeting.status,
			opened_at: meeting.opened_at,
			closed_at: meeting.closed_at,
			minutes: meeting.minutes,
			attendees: parseAttendees(meeting.metadata),
			created_at: meeting.created_at,
		},
		agenda: agenda.results,
		decisions: decisions.results,
	});
}

export async function openBoardMeeting(
	request: Request,
	db: D1Database,
	meetingId: string,
): Promise<Response> {
	const body = await readJsonBody<{ attendees?: string }>(request);
	const meeting = await db
		.prepare(`SELECT status, metadata FROM board_meetings WHERE meeting_id = ?`)
		.bind(meetingId)
		.first<{ status: string; metadata: string | null }>();
	if (!meeting) {
		return jsonResponse({ ok: false, error: `Meeting "${meetingId}" not found` }, 404);
	}
	const t = transitionMeeting(meeting.status, "OPEN");
	if (!t.ok || !t.to) {
		return jsonResponse({ ok: false, error: t.reason }, 400);
	}
	const attendees = (body.attendees ?? "").trim() || null;
	let metadata = meeting.metadata;
	if (attendees) {
		let parsed: Record<string, unknown> = {};
		try {
			parsed = meeting.metadata ? (JSON.parse(meeting.metadata) as Record<string, unknown>) : {};
		} catch {
			parsed = {};
		}
		parsed.attendees = attendees;
		metadata = JSON.stringify(parsed);
	}
	const now = new Date().toISOString();
	await db
		.prepare(
			`UPDATE board_meetings SET status = 'OPEN', opened_at = ?, metadata = ?, updated_at = ? WHERE meeting_id = ?`,
		)
		.bind(now, metadata, now, meetingId)
		.run();
	await auditEvent(db, meetingId, "MEETING_OPENED", { attendees });
	return jsonResponse({ ok: true, meeting_id: meetingId, status: "OPEN" });
}

export async function triageAgenda(
	request: Request,
	db: D1Database,
	meetingId: string,
): Promise<Response> {
	const body = await readJsonBody<{ submission_ids?: string[] }>(request);
	const ids = Array.isArray(body.submission_ids) ? body.submission_ids : [];
	if (!ids.length) throw new Error("submission_ids must be a non-empty array");
	const meeting = await db
		.prepare(`SELECT status FROM board_meetings WHERE meeting_id = ?`)
		.bind(meetingId)
		.first<{ status: string }>();
	if (!meeting) {
		return jsonResponse({ ok: false, error: `Meeting "${meetingId}" not found` }, 404);
	}
	if (meeting.status !== "DRAFT" && meeting.status !== "OPEN") {
		return jsonResponse(
			{ ok: false, error: `Cannot triage agenda for a ${meeting.status} meeting` },
			400,
		);
	}
	const added: string[] = [];
	const skipped: { submission_id: string; reason: string }[] = [];
	const now = new Date().toISOString();
	for (const rawId of ids) {
		const sid = String(rawId ?? "").trim();
		if (!sid) {
			skipped.push({ submission_id: String(rawId), reason: "Empty id" });
			continue;
		}
		const sub = await db
			.prepare(`SELECT status, meeting_id FROM board_submissions WHERE submission_id = ?`)
			.bind(sid)
			.first<{ status: string; meeting_id: string | null }>();
		if (!sub) {
			skipped.push({ submission_id: sid, reason: "Not found" });
			continue;
		}
		if (sub.status !== "PENDING") {
			skipped.push({ submission_id: sid, reason: `Status is ${sub.status}, only PENDING items can join the agenda` });
			continue;
		}
		await db
			.prepare(`UPDATE board_submissions SET meeting_id = ?, status = 'AGENDA', updated_at = ? WHERE submission_id = ?`)
			.bind(meetingId, now, sid)
			.run();
		added.push(sid);
	}
	return jsonResponse({ ok: true, meeting_id: meetingId, added, skipped });
}

export interface BoardDecisionInput {
	meeting_id: string;
	submission_id?: string;
	decision_text: string;
	outcome: string;
	vote_record?: string;
	responsible_person?: string;
	due_date?: string;
	machine_action?: string;
}

async function auditEvent(
	db: D1Database,
	objectId: string,
	action: string,
	details: unknown,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO audit_events (audit_id, object_id, action, module, status, details)
			 VALUES (?, ?, ?, 'BOARD', 'SUCCESS', ?)`,
		)
		.bind(`AUDIT-${crypto.randomUUID()}`, objectId, action, JSON.stringify(details ?? {}))
		.run();
}

export async function recordBoardDecision(
	request: Request,
	db: D1Database,
): Promise<Response> {
	const input = await readJsonBody<BoardDecisionInput>(request);
	const meetingId = (input.meeting_id ?? "").trim();
	if (!meetingId) throw new Error("meeting_id is required");
	const decisionText = (input.decision_text ?? "").trim();
	if (!decisionText) throw new Error("decision_text is required");
	const outcome = (input.outcome ?? "").trim().toUpperCase();
	if (!isDecisionOutcome(outcome)) {
		throw new Error(`outcome must be one of ${DECISION_OUTCOMES.join(", ")}`);
	}
	const responsiblePerson = (input.responsible_person ?? "").trim() || null;
	const dueDate = (input.due_date ?? "").trim() || null;
	if (dueDate && !/^\d{4}-\d{2}-\d{2}/.test(dueDate)) {
		throw new Error("due_date must be a date like 2026-10-02");
	}
	const voteRecord = (input.vote_record ?? "").trim() || null;
	const submissionId = (input.submission_id ?? "").trim() || null;
	const machineAction = (input.machine_action ?? "NONE").trim().toUpperCase();
	if (!isMachineAction(machineAction)) {
		throw new Error("machine_action must be one of NONE, PREPARE_NEWS_DRAFT, PREPARE_EMAIL_DRAFT");
	}

	const meeting = await db
		.prepare(`SELECT status FROM board_meetings WHERE meeting_id = ?`)
		.bind(meetingId)
		.first<{ status: string }>();
	if (!meeting) {
		return jsonResponse({ ok: false, error: `Meeting "${meetingId}" not found` }, 404);
	}
	if (meeting.status !== "OPEN") {
		return jsonResponse(
			{ ok: false, error: `Decisions can only be recorded in an OPEN meeting (this one is ${meeting.status})` },
			400,
		);
	}
	if (submissionId) {
		const sub = await db
			.prepare(`SELECT status, meeting_id FROM board_submissions WHERE submission_id = ?`)
			.bind(submissionId)
			.first<{ status: string; meeting_id: string | null }>();
		if (!sub) {
			return jsonResponse({ ok: false, error: `Submission "${submissionId}" not found` }, 404);
		}
		if (sub.meeting_id !== meetingId || sub.status !== "AGENDA") {
			return jsonResponse(
				{ ok: false, error: `Submission "${submissionId}" is not on this meeting's agenda` },
				400,
			);
		}
	}

	const decisionId = `DEC-${crypto.randomUUID()}`;
	await db
		.prepare(
			`INSERT INTO board_decisions
			 (decision_id, meeting_id, submission_id, decision_text, outcome, vote_record, responsible_person, due_date, status, machine_action)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)`,
		)
		.bind(decisionId, meetingId, submissionId, decisionText, outcome, voteRecord, responsiblePerson, dueDate, machineAction)
		.run();
	await auditEvent(db, decisionId, "BOARD_DECISION_RECORDED", { meeting_id: meetingId, outcome, machine_action: machineAction });

	let workItemId: string | null = null;
	if (outcome === "CONFIRMED" && (responsiblePerson || dueDate)) {
		// ADR-0006: a confirmed decision immediately becomes tracked work.
		workItemId = `WI-${crypto.randomUUID()}`;
		const title = decisionText.length > 120 ? `${decisionText.slice(0, 117)}...` : decisionText;
		await db
			.prepare(
				`INSERT INTO work_items
				 (work_item_id, board_decision_id, title, description, work_type, status, assigned_to, due_date)
				 VALUES (?, ?, ?, ?, 'BOARD_DECISION', 'READY', ?, ?)`,
			)
			.bind(workItemId, decisionId, title, decisionText, responsiblePerson, dueDate)
			.run();
	}

	if (submissionId && (outcome === "CONFIRMED" || outcome === "REJECTED")) {
		const now = new Date().toISOString();
		await db
			.prepare(`UPDATE board_submissions SET status = 'DECIDED', updated_at = ? WHERE submission_id = ?`)
			.bind(now, submissionId)
			.run();
	}

	return jsonResponse(
		{ ok: true, decision_id: decisionId, outcome, work_item_id: workItemId },
		201,
	);
}

export async function closeBoardMeeting(
	request: Request,
	db: D1Database,
	meetingId: string,
): Promise<Response> {
	const body = await readJsonBody<{ minutes?: string }>(request);
	const meeting = await db
		.prepare(`SELECT status FROM board_meetings WHERE meeting_id = ?`)
		.bind(meetingId)
		.first<{ status: string }>();
	if (!meeting) {
		return jsonResponse({ ok: false, error: `Meeting "${meetingId}" not found` }, 404);
	}
	const t = transitionMeeting(meeting.status, "CLOSED");
	if (!t.ok || !t.to) {
		return jsonResponse({ ok: false, error: t.reason }, 400);
	}
	const minutes = (body.minutes ?? "").trim() || null;
	const now = new Date().toISOString();
	await db
		.prepare(`UPDATE board_meetings SET status = 'CLOSED', closed_at = ?, minutes = ?, updated_at = ? WHERE meeting_id = ?`)
		.bind(now, minutes, now, meetingId)
		.run();
	// Unresolved agenda items carry into the next meeting: back to PENDING,
	// keeping their meeting_id as history.
	const carried = await db
		.prepare(
			`UPDATE board_submissions SET status = 'PENDING', updated_at = ?
			 WHERE meeting_id = ? AND status = 'AGENDA'`,
		)
		.bind(now, meetingId)
		.run();
	// ADR-0022: the machine processes the protocol and starts the work it
	// is authorized and capable of doing. Sends and consequential actions
	// stay human-confirmed.
	const processing = await processProtocol(db, meetingId);
	await auditEvent(db, meetingId, "MEETING_CLOSED", { carried_over: Number(carried.meta?.changes ?? 0) });
	return jsonResponse({
		ok: true,
		meeting_id: meetingId,
		status: "CLOSED",
		carried_over: Number(carried.meta?.changes ?? 0),
		protocol_processing: processing,
	});
}

export async function listBoardWorkItems(db: D1Database): Promise<Response> {
	const result = await db
		.prepare(
			`SELECT w.work_item_id, w.title, w.description, w.work_type, w.status,
			        w.assigned_to, w.due_date, w.blocker, w.outcome, w.created_at,
			        d.decision_text, d.outcome AS decision_outcome,
			        m.meeting_id, m.title AS meeting_title
			 FROM work_items w
			 LEFT JOIN board_decisions d ON d.decision_id = w.board_decision_id
			 LEFT JOIN board_meetings m ON m.meeting_id = d.meeting_id
			 WHERE w.status != 'DONE'
			 ORDER BY COALESCE(w.due_date, '9999-12-31'), w.created_at
			 LIMIT 200`,
		)
		.all();
	const items = result.results.map((w) => {
		const row = w as Record<string, unknown>;
		const stage = String(row.status ?? "READY");
		return {
			...row,
			next_action: isWorkItemStage(stage) ? workItemNextAction(stage) : "Unknown stage: review manually.",
		};
	});
	return jsonResponse({ ok: true, work_items: items });
}

export async function advanceBoardWorkItem(
	request: Request,
	db: D1Database,
): Promise<Response> {
	const body = await readJsonBody<{ work_item_id?: string; to_status?: string; blocker?: string }>(request);
	const workItemId = (body.work_item_id ?? "").trim();
	if (!workItemId) throw new Error("work_item_id is required");
	const toStage = (body.to_status ?? "").trim().toUpperCase();
	const current = await db
		.prepare(`SELECT status FROM work_items WHERE work_item_id = ?`)
		.bind(workItemId)
		.first<{ status: string }>();
	if (!current) {
		return jsonResponse({ ok: false, error: `Work item "${workItemId}" not found` }, 404);
	}
	const t = transitionWorkItem(current.status, toStage);
	if (!t.ok || !t.to) {
		return jsonResponse({ ok: false, error: t.reason }, 400);
	}
	const now = new Date().toISOString();
	const blocker = toStage === "BLOCKED" ? (body.blocker ?? "").trim() || null : null;
	const outcome = toStage === "DONE" ? "Completed." : null;
	await db
		.prepare(
			`UPDATE work_items SET status = ?, blocker = COALESCE(?, blocker), outcome = COALESCE(?, outcome), updated_at = ? WHERE work_item_id = ?`,
		)
		.bind(t.to, blocker, outcome, now, workItemId)
		.run();
	return jsonResponse({ ok: true, work_item_id: workItemId, status: t.to });
}

export async function advanceInitiative(
	request: Request,
	db: D1Database,
): Promise<Response> {
	const body = await readJsonBody<{ initiative_id?: string; to_status?: string }>(request);
	const initiativeId = (body.initiative_id ?? "").trim();
	if (!initiativeId) throw new Error("initiative_id is required");
	const toStage = (body.to_status ?? "").trim().toUpperCase();
	const current = await db
		.prepare(`SELECT status FROM initiatives WHERE initiative_id = ?`)
		.bind(initiativeId)
		.first<{ status: string }>();
	if (!current) {
		return jsonResponse({ ok: false, error: `Initiative "${initiativeId}" not found` }, 404);
	}
	const t = transitionInitiative(current.status, toStage);
	if (!t.ok || !t.to) {
		return jsonResponse({ ok: false, error: t.reason }, 400);
	}
	const now = new Date().toISOString();
	await db
		.prepare(`UPDATE initiatives SET status = ?, updated_at = ? WHERE initiative_id = ?`)
		.bind(t.to, now, initiativeId)
		.run();
	return jsonResponse({ ok: true, initiative_id: initiativeId, status: t.to });
}
