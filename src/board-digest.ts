import { getBoardCadence, todayInZone } from "./board-protocol";

// Board pre-meeting digest: one read-only call answering "state of NWANA
// before the meeting". Pure aggregation over existing board tables — no
// writes, no new tables, no stage remodeling. The digest never creates a
// meeting: unlike ensureUpcomingMeeting it runs the upcoming-meeting
// lookup read-only and returns upcoming_meeting: null when none exists.

export interface DigestMeeting {
	meeting_id: string;
	title: string;
	scheduled_for: string | null;
	status: string;
	protocol_formed_at: string | null;
	created_at: string;
}

export interface DigestSubmission {
	submission_id: string;
	submission_type: string;
	title: string;
	submitted_by: string | null;
	requested_outcome: string | null;
	created_at: string;
}

export interface DigestAgendaItem extends DigestSubmission {
	status: string;
	preexisting: boolean;
}

export interface DigestDecision {
	decision_id: string;
	submission_id: string | null;
	submission_title: string | null;
	decision_text: string;
	outcome: string | null;
	responsible_person: string | null;
	due_date: string | null;
	meeting_date: string | null;
	created_at: string;
}

export interface DigestWorkItem {
	work_item_id: string;
	title: string;
	status: string;
	assigned_to: string | null;
	due_date: string | null;
	blocker: string | null;
	meeting_title: string | null;
}

export interface BoardDigest {
	ok: true;
	generated_at: string;
	upcoming_meeting: DigestMeeting | null;
	cadence: {
		weekday: string;
		time: string;
		timezone: string;
		title: string;
	};
	open_submissions: DigestSubmission[];
	agenda: DigestAgendaItem[];
	recent_decisions: DigestDecision[];
	overdue_work: DigestWorkItem[];
	blocked_work: DigestWorkItem[];
}

export async function getBoardDigest(
	db: D1Database,
	now: Date = new Date(),
): Promise<BoardDigest> {
	const cadence = await getBoardCadence(db);
	const today = todayInZone(now, cadence.timezone);

	const upcoming = await db
		.prepare(
			`SELECT meeting_id, title, scheduled_for, status, protocol_formed_at, created_at
			 FROM board_meetings
			 WHERE status IN ('DRAFT', 'OPEN')
			   AND (scheduled_for IS NULL OR substr(scheduled_for, 1, 10) >= ?)
			 ORDER BY scheduled_for ASC, created_at DESC
			 LIMIT 1`,
		)
		.bind(today)
		.first<DigestMeeting>();

	const submissions = await db
		.prepare(
			`SELECT submission_id, submission_type, title, submitted_by,
			        requested_outcome, created_at
			 FROM board_submissions
			 WHERE status = 'PENDING'
			 ORDER BY COALESCE(requested_meeting_date, '9999-12-31'), created_at
			 LIMIT 200`,
		)
		.all<DigestSubmission>();

	let agenda: DigestAgendaItem[] = [];
	if (upcoming) {
		const rows = await db
			.prepare(
				`SELECT submission_id, submission_type, title, submitted_by,
				        requested_outcome, status, created_at
				 FROM board_submissions
				 WHERE meeting_id = ? AND status IN ('AGENDA', 'DECIDED')
				 ORDER BY created_at`,
			)
			.bind(upcoming.meeting_id)
			.all<DigestSubmission & { status: string }>();
		agenda = rows.results.map((row) => ({
			...row,
			// Existed before this meeting was created. This is honest
			// about what the data proves: the item may have rolled over
			// from a prior meeting's unresolved agenda, or it may be an
			// older submission triaged onto this agenda for the first
			// time. The meeting-close rollover overwrites meeting_id, so
			// a true carry-over cannot be distinguished afterwards.
			preexisting: row.created_at < upcoming.created_at,
		}));
	}

	const decisions = await db
		.prepare(
			`SELECT d.decision_id, d.submission_id, d.decision_text, d.outcome,
			        d.responsible_person, d.due_date, d.created_at,
			        s.title AS submission_title, m.scheduled_for AS meeting_date
			 FROM board_decisions d
			 LEFT JOIN board_submissions s ON s.submission_id = d.submission_id
			 LEFT JOIN board_meetings m ON m.meeting_id = d.meeting_id
			 ORDER BY d.created_at DESC
			 LIMIT 10`,
		)
		.all<DigestDecision>();

	const work = await db
		.prepare(
			`SELECT w.work_item_id, w.title, w.status, w.assigned_to, w.due_date,
			        w.blocker, m.title AS meeting_title
			 FROM work_items w
			 LEFT JOIN board_decisions d ON d.decision_id = w.board_decision_id
			 LEFT JOIN board_meetings m ON m.meeting_id = d.meeting_id
			 WHERE w.status != 'DONE'
			 ORDER BY COALESCE(w.due_date, '9999-12-31'), w.created_at
			 LIMIT 200`,
		)
		.all<DigestWorkItem>();

	const openWork = work.results ?? [];
	const overdue_work = openWork.filter(
		(item) => item.due_date != null && item.due_date.slice(0, 10) < today,
	);
	const blocked_work = openWork.filter((item) => item.status === "BLOCKED");

	return {
		ok: true,
		generated_at: new Date().toISOString(),
		upcoming_meeting: upcoming ?? null,
		cadence: {
			weekday: cadence.weekday,
			time: cadence.time,
			timezone: cadence.timezone,
			title: cadence.title,
		},
		open_submissions: submissions.results ?? [],
		agenda,
		recent_decisions: decisions.results ?? [],
		overdue_work,
		blocked_work,
	};
}
