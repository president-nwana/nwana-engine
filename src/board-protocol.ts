// ADR-0024: Board protocol completion.
//
// Albert's directive 2026-09-22:
//   1. By every Sunday 2:00 PM New York time the machine forms the meeting
//      protocol from all pending submissions. formWeeklyProtocol ensures the
//      Sunday meeting exists, sweeps every PENDING submission onto its
//      agenda, and stamps protocol_formed_at.
//   2. After the meeting the machine processes the protocol and starts the
//      work it is authorized and capable of doing. processProtocol runs on
//      meeting close: every CONFIRMED decision becomes (or keeps) a tracked
//      work item, and when the decision recorded a machine_action the
//      machine prepares the draft and files a decision_request for owner
//      review. Sends, money, signatures, and external actions stay
//      human-confirmed: the machine prepares, never executes.
//   3. Board members upload files; the machine routes each file:
//      contacts -> RunSignup list staging, tasks -> tracked work items,
//      discussion material -> the meeting agenda, news material -> media
//      plan drafts. Nothing is lost: unclassifiable files land on the
//      agenda as source material flagged NEEDS_OWNER.
//
// EVENT-DRIVEN ARCHITECTURE (owner decision 2026-09-19, SYSTEM_STATE.md):
// the weekly meeting pattern does NOT authorize timers, polling, cron, or
// recurring background work. There is no scheduled job. Instead:
//
//   - reconcileProtocolIfDue runs on owner-authorized operating-center
//     activity (the operating-center overview call, i.e. every time the
//     owner opens the main screen). On the first owner interaction of the
//     week it ensures the coming Sunday's meeting exists and forms its
//     protocol if not already formed. Submissions arriving during the week
//     auto-attach to that meeting on creation (ADR-0020), so by Sunday
//     2:00 PM the protocol is complete.
//   - POST /api/board/protocol/form lets the owner form (or re-form) the
//     protocol explicitly at any time.
//
// Honest limitation: if the owner does not open the operating center during
// a week and never calls the manual endpoint, no protocol forms that week.
// The machine does not independently fire at 2:00 PM on its own; it acts
// when the owner acts. The UI shows the protocol-formation state so the
// gap is visible, not silent.

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"access-control-allow-origin": "*",
		},
	});
}

async function audit(db: D1Database, objectId: string, action: string, module: string, details: unknown): Promise<void> {
	await db
		.prepare(
			`INSERT INTO audit_events (audit_id, object_id, action, module, status, details)
			 VALUES (?, ?, ?, ?, 'SUCCESS', ?)`,
		)
		.bind(`AUDIT-${crypto.randomUUID()}`, objectId, action, module, JSON.stringify(details ?? {}))
		.run();
}

// ---------------------------------------------------------------------------
// Sunday protocol formation
// ---------------------------------------------------------------------------

// The date (YYYY-MM-DD) of the coming Sunday in America/New_York.
// If today is Sunday, returns today: the formation job runs before the 2 PM
// meeting and assembles today's protocol.
export function nextSundayInNewYork(now: Date): string {
	const dayFmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const wdFmt = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		weekday: "short",
	});
	for (let i = 0; i < 8; i++) {
		const d = new Date(now.getTime() + i * 86400000);
		if (wdFmt.format(d) === "Sun") return dayFmt.format(d);
	}
	throw new Error("Could not find the coming Sunday");
}

export async function formWeeklyProtocol(db: D1Database, now: Date = new Date()): Promise<Response> {
	const sunday = nextSundayInNewYork(now);
	const nowIso = now.toISOString();

	let meeting = await db
		.prepare(
			`SELECT meeting_id, title, status FROM board_meetings
			 WHERE substr(scheduled_for, 1, 10) = ? AND status IN ('DRAFT', 'OPEN')
			 ORDER BY created_at LIMIT 1`,
		)
		.bind(sunday)
		.first<{ meeting_id: string; title: string; status: string }>();

	let meetingId: string;
	let created = false;
	if (meeting) {
		meetingId = meeting.meeting_id;
	} else {
		meetingId = `MEET-${crypto.randomUUID()}`;
		await db
			.prepare(
				`INSERT INTO board_meetings (meeting_id, title, scheduled_for, status)
				 VALUES (?, ?, ?, 'DRAFT')`,
			)
			.bind(meetingId, "Weekly Board meeting", sunday)
			.run();
		created = true;
	}

	const swept = await db
		.prepare(
			`UPDATE board_submissions SET meeting_id = ?, status = 'AGENDA', updated_at = ?
			 WHERE status = 'PENDING'`,
		)
		.bind(meetingId, nowIso)
		.run();
	const sweptCount = Number(swept.meta?.changes ?? 0);

	await db
		.prepare(`UPDATE board_meetings SET protocol_formed_at = ?, updated_at = ? WHERE meeting_id = ?`)
		.bind(nowIso, nowIso, meetingId)
		.run();

	await audit(db, meetingId, "PROTOCOL_FORMED", "BOARD", { sunday, meeting_created: created, swept: sweptCount });

	return jsonResponse({
		ok: true,
		meeting_id: meetingId,
		sunday,
		meeting_created: created,
		swept: sweptCount,
		protocol_formed: true,
	});
}

// Event-driven weekly reconciliation (replaces the cron the verified-
// requirements rule forbids). Called from owner-authorized operating-center
// activity (the overview call, i.e. every owner visit). On the first owner
// interaction of the week it makes sure the coming Sunday meeting exists
// and its protocol is formed; later calls are no-ops. Submissions created
// during the week auto-attach to that meeting on submission (ADR-0020), so
// the Sunday protocol is complete by 2:00 PM New York time without any
// timer, poll, or background job.
//
// Returns null when the protocol was already formed (no-op), otherwise the
// parsed formWeeklyProtocol result. Never throws: a reconciliation failure
// must not break the owner's page load.
export async function reconcileProtocolIfDue(
	db: D1Database,
	now: Date = new Date(),
): Promise<Record<string, unknown> | null> {
	try {
		const sunday = nextSundayInNewYork(now);
		const existing = await db
			.prepare(
				`SELECT meeting_id, protocol_formed_at FROM board_meetings
				 WHERE substr(scheduled_for, 1, 10) = ?
				 ORDER BY created_at LIMIT 1`,
			)
			.bind(sunday)
			.first<{ meeting_id: string; protocol_formed_at: string | null }>();
		if (existing && existing.protocol_formed_at) return null;
		const res = await formWeeklyProtocol(db, now);
		const body = (await res.json()) as Record<string, unknown>;
		return { reconciled: true, ...body };
	} catch (err) {
		console.error("reconcileProtocolIfDue failed:", err instanceof Error ? err.message : err);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Post-meeting protocol processing
// ---------------------------------------------------------------------------

export const MACHINE_ACTIONS = ["NONE", "PREPARE_NEWS_DRAFT", "PREPARE_EMAIL_DRAFT"] as const;
export type MachineAction = (typeof MACHINE_ACTIONS)[number];

export function isMachineAction(value: string): value is MachineAction {
	return (MACHINE_ACTIONS as readonly string[]).includes(value);
}

function buildMachineDraft(action: MachineAction, decisionText: string): string {
	const header =
		"Machine-prepared draft for owner review. Not sent, not published. Edit freely before any use.\n\n";
	if (action === "PREPARE_NEWS_DRAFT") {
		return (
			header +
			`Proposed news item based on the Board decision:\n\n"${decisionText}"\n\n` +
			`Suggested headline: ${decisionText.length > 90 ? `${decisionText.slice(0, 87)}...` : decisionText}\n\n` +
			`Body (edit before publishing): The NWANA Board has decided: ${decisionText} ` +
			`Details, dates, and responsible persons will be confirmed before this text goes to the site news feed.`
		);
	}
	return (
		header +
		`Proposed email based on the Board decision:\n\n"${decisionText}"\n\n` +
		`Subject (edit before use): NWANA Board update\n\n` +
		`Body (edit before sending; the machine never sends): Dear colleagues, the NWANA Board has decided the following: ${decisionText} ` +
		`The responsible person and deadline are tracked in the operating center.`
	);
}

// Runs when a meeting closes. Every CONFIRMED decision keeps or gains a
// tracked work item; decisions with a machine_action get a prepared draft
// plus a decision_request so the owner reviews before anything consequential.
export async function processProtocol(
	db: D1Database,
	meetingId: string,
): Promise<{ processed: number; work_items_ensured: number; drafts_prepared: number }> {
	const decisions = await db
		.prepare(
			`SELECT decision_id, decision_text, outcome, responsible_person, due_date, machine_action
			 FROM board_decisions WHERE meeting_id = ? AND outcome = 'CONFIRMED'`,
		)
		.bind(meetingId)
		.all<{
			decision_id: string;
			decision_text: string;
			outcome: string;
			responsible_person: string | null;
			due_date: string | null;
			machine_action: string | null;
		}>();

	let processed = 0;
	let workItemsEnsured = 0;
	let draftsPrepared = 0;

	for (const d of decisions.results) {
		const existing = await db
			.prepare(`SELECT work_item_id FROM work_items WHERE board_decision_id = ?`)
			.bind(d.decision_id)
			.first<{ work_item_id: string }>();
		let workItemId = existing?.work_item_id ?? null;
		if (!workItemId) {
			workItemId = `WI-${crypto.randomUUID()}`;
			const title =
				d.decision_text.length > 120 ? `${d.decision_text.slice(0, 117)}...` : d.decision_text;
			await db
				.prepare(
					`INSERT INTO work_items
					 (work_item_id, board_decision_id, title, description, work_type, status, assigned_to, due_date)
					 VALUES (?, ?, ?, ?, 'BOARD_DECISION', 'READY', ?, ?)`,
				)
				.bind(workItemId, d.decision_id, title, d.decision_text, d.responsible_person, d.due_date)
				.run();
			workItemsEnsured++;
		}

		let machineResult = "WORK_ITEM_READY";
		const action = (d.machine_action ?? "NONE").toUpperCase();
		if (action === "PREPARE_NEWS_DRAFT" || action === "PREPARE_EMAIL_DRAFT") {
			const draft = buildMachineDraft(action, d.decision_text);
			const requestId = `DR-${crypto.randomUUID()}`;
			const shortTitle =
				d.decision_text.length > 80 ? `${d.decision_text.slice(0, 77)}...` : d.decision_text;
			await db
				.prepare(
					`INSERT INTO decision_requests
					 (decision_request_id, work_item_id, decision_scope, question, evidence, status, requested_from)
					 VALUES (?, ?, 'BOARD_MACHINE_ACTION', ?, ?, 'PENDING', 'MACHINE')`,
				)
				.bind(
					requestId,
					workItemId,
					`Review machine-prepared draft: ${shortTitle}`,
					draft,
				)
				.run();
			draftsPrepared++;
			machineResult = "DRAFT_PREPARED";
		}
		await db
			.prepare(`UPDATE board_decisions SET machine_result = ? WHERE decision_id = ?`)
			.bind(machineResult, d.decision_id)
			.run();
		processed++;
	}

	await audit(db, meetingId, "PROTOCOL_PROCESSED", "BOARD", {
		processed,
		work_items_ensured: workItemsEnsured,
		drafts_prepared: draftsPrepared,
	});

	return { processed, work_items_ensured: workItemsEnsured, drafts_prepared: draftsPrepared };
}

// ---------------------------------------------------------------------------
// Board member file uploads with machine routing
// ---------------------------------------------------------------------------

export const UPLOAD_ROUTINGS = [
	"RUNSIGNUP_CONTACTS",
	"WORK_ITEM",
	"MEETING_AGENDA",
	"MEDIA_DRAFT",
	"NEEDS_OWNER",
] as const;
export type UploadRouting = (typeof UPLOAD_ROUTINGS)[number];

export const ROUTE_LABELS: Record<UploadRouting, string> = {
	RUNSIGNUP_CONTACTS: "RunSignup contact staging",
	WORK_ITEM: "tracked work",
	MEETING_AGENDA: "the meeting agenda",
	MEDIA_DRAFT: "media drafts",
	NEEDS_OWNER: "owner review",
};

// Accepted upload formats: plain text only (contacts arrive as CSV/TXT).
export const TEXT_EXTENSIONS = ["csv", "txt", "md", "tsv", "json"];

export const MAX_UPLOAD_BYTES = 512 * 1024;
// The stored content column holds the complete file: MAX_CONTENT_CHARS must
// be large enough for any accepted upload, so content is never silently
// truncated.
export const MAX_CONTENT_CHARS = 2 * 1024 * 1024;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function classifyUpload(filename: string, content: string): UploadRouting {
	const name = filename.toLowerCase();
	const body = content.toLowerCase();
	// Contacts: emails present, or contact-ish filename with emails.
	const emailCount = (content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).length;
	if (emailCount >= 3 || (/contact|mailing|subscriber|donor|audience|rsvp/.test(name) && emailCount >= 1)) {
		return "RUNSIGNUP_CONTACTS";
	}
	// Tracked work: task lists (checkbox lines), or task-ish filename.
	if (/^- \[[ x]\]/m.test(content) || /task|todo|action item|checklist/.test(name)) {
		return "WORK_ITEM";
	}
	// Meeting agenda: discussion material.
	if (
		/discuss|agenda|meeting|minutes|proposal|initiative|question for the board/.test(name) ||
		/discuss|agenda|question for the board|proposal/.test(body.slice(0, 2000))
	) {
		return "MEETING_AGENDA";
	}
	// Media: news/article material.
	if (/news|press|article|story|announcement|release|media/.test(name) || /press release|news article/.test(body.slice(0, 2000))) {
		return "MEDIA_DRAFT";
	}
	return "NEEDS_OWNER";
}

export interface ParsedContact {
	name: string;
	email: string;
	phone: string;
}

function splitRow(row: string): string[] {
	const delim = row.includes("\t") ? "\t" : row.includes(";") ? ";" : ",";
	return row.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
}

// Parse a contact list: header row with email/phone/name-ish columns, or a
// bare list of emails. Deduplicates by email, falling back to phone.
export function parseContacts(content: string): ParsedContact[] {
	const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
	if (!lines.length) return [];
	const header = splitRow(lines[0]).map((c) => c.toLowerCase());
	const emailIdx = header.findIndex((c) => /e-?mail/.test(c));
	const phoneIdx = header.findIndex((c) => /phone|tel|mobile|cell/.test(c));
	const nameIdx = header.findIndex((c) => /name/.test(c));
	const seen = new Set<string>();
	const out: ParsedContact[] = [];
	const push = (name: string, email: string, phone: string) => {
		const key = (email || phone).toLowerCase();
		if (!key || seen.has(key)) return;
		seen.add(key);
		out.push({ name: name.trim(), email: email.trim(), phone: phone.trim() });
	};
	if (emailIdx >= 0 || phoneIdx >= 0) {
		for (const line of lines.slice(1)) {
			const cols = splitRow(line);
			push(cols[nameIdx] ?? "", cols[emailIdx] ?? "", cols[phoneIdx] ?? "");
		}
		return out;
	}
	for (const line of lines) {
		const m = line.match(EMAIL_RE);
		if (m) push("", m[0], "");
	}
	return out;
}

async function findNextBoardMeetingId(db: D1Database): Promise<string | null> {
	const next = await db
		.prepare(
			`SELECT meeting_id FROM board_meetings
			 WHERE status IN ('DRAFT', 'OPEN')
			 ORDER BY
				CASE WHEN scheduled_for IS NOT NULL AND substr(scheduled_for, 1, 10) >= date('now') THEN 0 ELSE 1 END,
				scheduled_for ASC,
				created_at DESC
			 LIMIT 1`,
		)
		.first<{ meeting_id: string }>();
	return next ? next.meeting_id : null;
}

export interface RouteUploadInput {
	filename: string;
	mime: string | null;
	sizeBytes: number;
	content: string;
	uploadedBy: string | null;
}

export interface RouteUploadResult {
	upload_id: string;
	routing: UploadRouting;
	routing_status: "ROUTED" | "NEEDS_OWNER";
	detail: Record<string, unknown>;
}

export async function routeUpload(db: D1Database, input: RouteUploadInput): Promise<RouteUploadResult> {
	// Validation at the top: no downstream records are created before the
	// input is verified. This protects direct calls as well as the HTTP handler.
	const ext = (input.filename.split(".").pop() ?? "").toLowerCase();
	if (!TEXT_EXTENSIONS.includes(ext)) {
		throw new Error(`Unsupported file type ".${ext || "?"}". Accepted: ${TEXT_EXTENSIONS.join(", ")}.`);
	}
	if (input.sizeBytes > MAX_UPLOAD_BYTES) {
		throw new Error(`File is ${(input.sizeBytes / 1024).toFixed(0)} KB; the limit is ${MAX_UPLOAD_BYTES / 1024} KB.`);
	}
	if (input.sizeBytes === 0 || !input.content.trim()) {
		throw new Error("The file is empty.");
	}
	if (input.content.length > MAX_CONTENT_CHARS) {
		throw new Error(`File content exceeds the ${MAX_CONTENT_CHARS}-character storage limit; rejected before routing.`);
	}

	const uploadId = `UPLOAD-${crypto.randomUUID()}`;
	const routing = classifyUpload(input.filename, input.content);
	const detail: Record<string, unknown> = { routing };
	let routingStatus: "ROUTED" | "NEEDS_OWNER" = "ROUTED";

	if (routing === "RUNSIGNUP_CONTACTS") {
		// The machine parses, deduplicates, and stages an import-ready file.
		// The actual import happens in the RunSignup Email Marketing
		// dashboard by a human: no documented public Email V2 list-write API
		// was found, and the owner presses the buttons. The staged CSV is
		// served from a dedicated download endpoint; the raw upload content
		// is never exposed in ordinary list views.
		const contacts = parseContacts(input.content);
		const emailCount = contacts.filter((c) => c.email).length;
		const phoneCount = contacts.filter((c) => c.phone).length;
		const workItemId = `WI-${crypto.randomUUID()}`;
		await db
			.prepare(
				`INSERT INTO work_items
				 (work_item_id, title, description, work_type, status, assigned_to)
				 VALUES (?, ?, ?, 'CONTACT_IMPORT', 'READY', ?)`,
			)
			.bind(
				workItemId,
				`Import ${contacts.length} contacts into RunSignup`,
				`Machine-parsed and deduplicated from "${input.filename}" (${emailCount} with email, ${phoneCount} with phone). ` +
					`Steps for the owner: open the RunSignup Email Marketing dashboard (ID 513494), create or pick the list, ` +
					`download the staged CSV from the upload record, import it, then mark this work item done. ` +
					`The machine never imports on its own.`,
				input.uploadedBy,
			)
			.run();
		detail.contacts = contacts.length;
		detail.email_count = emailCount;
		detail.phone_count = phoneCount;
		detail.work_item_id = workItemId;
		detail.staged_csv_url = `/api/operating-center/uploads/${uploadId}/staged-contacts.csv`;
	} else if (routing === "WORK_ITEM") {
		const workItemId = `WI-${crypto.randomUUID()}`;
		const title = input.filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Board-uploaded work";
		await db
			.prepare(
				`INSERT INTO work_items
				 (work_item_id, title, description, work_type, status, assigned_to)
				 VALUES (?, ?, ?, 'BOARD_UPLOAD', 'READY', ?)`,
			)
			.bind(workItemId, title.slice(0, 120), input.content.slice(0, 4000), input.uploadedBy)
			.run();
		detail.work_item_id = workItemId;
		detail.title = title;
	} else if (routing === "MEDIA_DRAFT") {
		const plan = await db
			.prepare(
				`SELECT plan_id FROM media_plans
				 WHERE status IN ('DRAFT', 'APPROVED', 'IN_PROGRESS')
				 ORDER BY created_at DESC LIMIT 1`,
			)
			.first<{ plan_id: string }>();
		if (plan) {
			const articleId = `ARTICLE-${crypto.randomUUID()}`;
			const title = input.filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Board-uploaded material";
			await db
				.prepare(
					`INSERT INTO media_articles (article_id, plan_id, title, angle, body_html, status)
					 VALUES (?, ?, ?, ?, ?, 'DRAFT')`,
				)
				.bind(articleId, plan.plan_id, title.slice(0, 200), "Board-uploaded material; draft to be written.", input.content.slice(0, 20000))
				.run();
			detail.article_id = articleId;
			detail.plan_id = plan.plan_id;
		} else {
			routingStatus = "NEEDS_OWNER";
			detail.note = "No media plan exists yet; owner decides where this material goes.";
		}
	} else {
		// NEEDS_OWNER and MEETING_AGENDA: the material joins the meeting
		// protocol as source material so the Board sees it and decides.
		// Nothing uploaded is ever silently dropped.
		const meetingId = await findNextBoardMeetingId(db);
		const submissionId = `BOARD-SUB-${crypto.randomUUID()}`;
		const nowIso = new Date().toISOString();
		await db
			.prepare(
				`INSERT INTO board_submissions
				 (submission_id, meeting_id, submission_type, title, description, submitted_by, status)
				 VALUES (?, ?, 'SOURCE_MATERIAL', ?, ?, ?, ?)`,
			)
			.bind(
				submissionId,
				meetingId,
				`Uploaded file: ${input.filename}`,
				`Board member upload (${input.sizeBytes} bytes). Content stored on the upload record ${uploadId}.` +
					(routing === "NEEDS_OWNER" ? " The machine could not classify this file; the Board decides where it goes." : ""),
				input.uploadedBy ?? "Board member",
				meetingId ? "AGENDA" : "PENDING",
			)
			.run();
		detail.submission_id = submissionId;
		detail.meeting_id = meetingId;
		if (routing === "NEEDS_OWNER") routingStatus = "NEEDS_OWNER";
		await audit(db, submissionId, "BOARD_SUBMISSION_ADDED", "BOARD", {
			submission_type: "SOURCE_MATERIAL",
			meeting_id: meetingId,
			from_upload: uploadId,
		});
	}

	// The complete accepted content is stored: files are rejected before
	// routing when they exceed the byte limit, so nothing is ever silently
	// truncated. MAX_CONTENT_CHARS is sized for any accepted upload.
	if (input.content.length > MAX_CONTENT_CHARS) {
		throw new Error(
			`Upload content exceeds the ${MAX_CONTENT_CHARS}-character storage limit; the file was rejected before routing.`,
		);
	}
	await db
		.prepare(
			`INSERT INTO board_uploads
			 (upload_id, filename, mime, size_bytes, content, uploaded_by, routing, routing_status, routed_detail)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			uploadId,
			input.filename,
			input.mime,
			input.sizeBytes,
			input.content,
			input.uploadedBy,
			routing,
			routingStatus,
			JSON.stringify(detail),
		)
		.run();

	await audit(db, uploadId, "UPLOAD_ROUTED", "BOARD", { filename: input.filename, routing, routing_status: routingStatus });

	return { upload_id: uploadId, routing, routing_status: routingStatus, detail };
}

export async function listUploads(db: D1Database): Promise<Response> {
	const result = await db
		.prepare(
			`SELECT upload_id, filename, mime, size_bytes, uploaded_by, routing, routing_status, routed_detail, created_at
			 FROM board_uploads ORDER BY created_at DESC LIMIT 50`,
		)
		.all();
	return jsonResponse({ ok: true, uploads: result.results });
}

// Build the staged import CSV from stored upload content. Quoted and
// escaped per RFC 4180 so commas, quotes, and newlines survive.
function csvField(value: string): string {
	const v = value ?? "";
	return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildStagedCsv(content: string): string {
	const contacts = parseContacts(content);
	const header = "name,email,phone";
	const rows = contacts.map((c) => [csvField(c.name), csvField(c.email), csvField(c.phone)].join(","));
	return [header, ...rows].join("\n");
}

export async function getStagedCsv(db: D1Database, uploadId: string): Promise<Response> {
	const row = await db
		.prepare(`SELECT filename, content, routing FROM board_uploads WHERE upload_id = ?`)
		.bind(uploadId)
		.first<{ filename: string; content: string; routing: string }>();
	if (!row) return jsonResponse({ ok: false, error: "Upload not found" }, 404);
	if (row.routing !== "RUNSIGNUP_CONTACTS") {
		return jsonResponse({ ok: false, error: "This upload is not a staged contact list" }, 400);
	}
	const csv = buildStagedCsv(row.content);
	const contacts = parseContacts(row.content);
	return new Response(csv, {
		status: 200,
		headers: {
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": `attachment; filename="runsignup-import-${uploadId}.csv"`,
		},
	});
}

export async function handleUpload(request: Request, db: D1Database): Promise<Response> {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return jsonResponse({ ok: false, error: "Expected a multipart form upload" }, 400);
	}
	const file = form.get("file");
	if (!(file instanceof File)) {
		return jsonResponse({ ok: false, error: "No file attached (field name 'file')" }, 400);
	}
	// Reject before routing: invalid and oversized uploads never reach the
	// classifier.
	const filename = file.name || "upload.bin";
	const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
	if (!TEXT_EXTENSIONS.includes(ext)) {
		return jsonResponse(
			{
				ok: false,
				error: `Unsupported file type ".${ext || "?"}". Accepted: ${TEXT_EXTENSIONS.join(", ")}. Board uploads are text formats only (contacts arrive as CSV/TXT).`,
			},
			400,
		);
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		return jsonResponse(
			{ ok: false, error: `File is ${(file.size / 1024).toFixed(0)} KB; the limit is ${MAX_UPLOAD_BYTES / 1024} KB. Split the file and upload the parts.` },
			413,
		);
	}
	if (file.size === 0) {
		return jsonResponse({ ok: false, error: "The file is empty" }, 400);
	}
	const content = await file.text();
	if (content.length > MAX_CONTENT_CHARS) {
		return jsonResponse(
			{ ok: false, error: `File content exceeds the ${MAX_CONTENT_CHARS}-character storage limit; rejected before routing.` },
			413,
		);
	}
	const uploadedBy = typeof form.get("uploaded_by") === "string" ? (form.get("uploaded_by") as string).slice(0, 120) : null;
	try {
		const result = await routeUpload(db, {
			filename,
			mime: file.type || null,
			sizeBytes: file.size,
			content,
			uploadedBy,
		});
		return jsonResponse({ ok: true, ...result }, 201);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Upload failed";
		// Map validation errors to 400/413.
		const status = message.includes("limit is") || message.includes("exceeds") ? 413 : 400;
		return jsonResponse({ ok: false, error: message }, status);
	}
}
