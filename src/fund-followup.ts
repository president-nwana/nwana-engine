// ADR-0018: Fund follow-up reminders.
//
// The standing rule is one follow-up per sent letter at 2-3 weeks.
// The machine NEVER sends the follow-up: it computes WHEN it is due
// from the stored sent_at and surfaces it. The owner still presses Send.
//
// follow_up_due_at = sent_at + 14 days (the follow-up window opens).
// Status is derived per render and never stored, so it cannot drift:
//   upcoming: now < due date
//   due:      due date <= now < sent_at + 21 days
//   overdue:  now >= sent_at + 21 days with no follow-up
// Only a prospect sitting at stage "sent" can have a due follow-up.
// Every other stage (including follow_up, where the follow-up was
// already sent) reports "none". Prospects with no sent_at have no due date.

export const FOLLOWUP_WINDOW_DAYS = 14;
export const FOLLOWUP_OVERDUE_DAYS = 21;

export type FollowUpStatus = "none" | "upcoming" | "due" | "overdue";

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
	none: "No follow-up due",
	upcoming: "Follow-up upcoming",
	due: "Follow-up due now",
	overdue: "Follow-up overdue",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined): number | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

// sent_at + 14 days as an ISO timestamp. Null when there is no sent_at
// (nothing was sent, so nothing can come due) or it is unparseable.
export function followUpDueAt(sentAt: string | null | undefined): string | null {
	const ms = parseDate(sentAt);
	if (ms === null) return null;
	return new Date(ms + FOLLOWUP_WINDOW_DAYS * DAY_MS).toISOString();
}

// Derived follow-up status for one prospect at one moment. nowIso is a
// parameter (not read from the clock) so the logic stays pure and testable;
// callers pass the view generation time.
export function followUpStatus(
	stage: string,
	sentAt: string | null | undefined,
	nowIso: string,
): FollowUpStatus {
	if (stage !== "sent") return "none";
	const sentMs = parseDate(sentAt);
	const nowMs = parseDate(nowIso);
	if (sentMs === null || nowMs === null) return "none";
	const dueMs = sentMs + FOLLOWUP_WINDOW_DAYS * DAY_MS;
	const overdueMs = sentMs + FOLLOWUP_OVERDUE_DAYS * DAY_MS;
	if (nowMs >= overdueMs) return "overdue";
	if (nowMs >= dueMs) return "due";
	return "upcoming";
}

// "2026-10-06T14:19:00.000Z" -> "2026-10-06". Empty string when null.
export function formatFollowUpDate(iso: string | null | undefined): string {
	if (!iso) return "";
	return iso.slice(0, 10);
}
