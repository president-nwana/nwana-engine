type InitiativeInputType =
	| "THOUGHT"
	| "PROBLEM"
	| "OPPORTUNITY"
	| "TASK"
	| "SOURCE_MATERIAL";

type BoardSubmissionType =
	| "QUESTION"
	| "INITIATIVE"
	| "PROPOSAL"
	| "THOUGHT"
	| "PROBLEM"
	| "OPPORTUNITY"
	| "TASK"
	| "REPORT"
	| "DISCUSSION"
	| "DECISION_REQUEST"
	| "REQUEST_TO_SPEAK"
	| "SOURCE_MATERIAL";

export interface InitiativeInput {
	input_type?: string;
	title?: string;
	description?: string;
	desired_result?: string;
	submitted_by?: string;
	source_filename?: string;
}

export interface BoardSubmissionInput {
	submission_type?: string;
	title?: string;
	description?: string;
	requested_outcome?: string;
	submitted_by?: string;
	requested_meeting_date?: string;
}

const INITIATIVE_TYPES = new Set<InitiativeInputType>([
	"THOUGHT",
	"PROBLEM",
	"OPPORTUNITY",
	"TASK",
	"SOURCE_MATERIAL",
]);

const BOARD_SUBMISSION_TYPES = new Set<BoardSubmissionType>([
	"QUESTION",
	"INITIATIVE",
	"PROPOSAL",
	"THOUGHT",
	"PROBLEM",
	"OPPORTUNITY",
	"TASK",
	"REPORT",
	"DISCUSSION",
	"DECISION_REQUEST",
	"REQUEST_TO_SPEAK",
	"SOURCE_MATERIAL",
]);

function clean(value: unknown, maximumLength: number): string {
	return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

export function validateInitiativeInput(input: InitiativeInput): {
	input_type: InitiativeInputType;
	title: string;
	description: string;
	desired_result: string | null;
	submitted_by: string;
	source_filename: string | null;
} {
	const inputType = clean(input.input_type, 40).toUpperCase();
	const title = clean(input.title, 200);
	const description = clean(input.description, 20_000);
	const submittedBy = clean(input.submitted_by, 200);

	if (!INITIATIVE_TYPES.has(inputType as InitiativeInputType)) {
		throw new Error("A valid initiative input_type is required");
	}
	if (!title) throw new Error("Initiative title is required");
	if (!description) throw new Error("Initiative description is required");
	if (!submittedBy) throw new Error("Initiative submitter is required");

	return {
		input_type: inputType as InitiativeInputType,
		title,
		description,
		desired_result: clean(input.desired_result, 2_000) || null,
		submitted_by: submittedBy,
		source_filename: clean(input.source_filename, 500) || null,
	};
}

export function validateBoardSubmissionInput(input: BoardSubmissionInput): {
	submission_type: BoardSubmissionType;
	title: string;
	description: string;
	requested_outcome: string | null;
	submitted_by: string;
	requested_meeting_date: string | null;
} {
	const submissionType = clean(input.submission_type, 40).toUpperCase();
	const title = clean(input.title, 200);
	const description = clean(input.description, 20_000);
	const submittedBy = clean(input.submitted_by, 200);
	const requestedMeetingDate = clean(input.requested_meeting_date, 10);

	if (!BOARD_SUBMISSION_TYPES.has(submissionType as BoardSubmissionType)) {
		throw new Error("A valid Board submission_type is required");
	}
	if (!title) throw new Error("Board submission title is required");
	if (!description) throw new Error("Board submission description is required");
	if (!submittedBy) throw new Error("Board submission author is required");
	if (requestedMeetingDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedMeetingDate)) {
		throw new Error("requested_meeting_date must use YYYY-MM-DD");
	}

	return {
		submission_type: submissionType as BoardSubmissionType,
		title,
		description,
		requested_outcome: clean(input.requested_outcome, 2_000) || null,
		submitted_by: submittedBy,
		requested_meeting_date: requestedMeetingDate || null,
	};
}

function response(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"access-control-allow-origin": "*",
		},
	});
}

async function readBody<T>(request: Request): Promise<T> {
	try {
		return (await request.json()) as T;
	} catch {
		throw new Error("Request body must be valid JSON");
	}
}

function timingSafeEqual(a: string, b: string): boolean {
	const aBytes = new TextEncoder().encode(a);
	const bBytes = new TextEncoder().encode(b);
	if (aBytes.length !== bBytes.length) return false;
	let diff = 0;
	for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
	return diff === 0;
}

export function extractOperatingCenterKey(request: Request): string {
	const header = request.headers.get("authorization") ?? "";
	const bearer = header.toLowerCase().startsWith("bearer ")
		? header.slice(7).trim()
		: "";
	if (bearer) return bearer;
	try {
		return new URL(request.url).searchParams.get("key") ?? "";
	} catch {
		return "";
	}
}

export function isOperatingCenterAuthorized(
	request: Request,
	expectedKey: string | undefined,
): boolean {
	if (!expectedKey) return false;
	return timingSafeEqual(extractOperatingCenterKey(request), expectedKey);
}

export async function createInitiative(request: Request, db: D1Database): Promise<Response> {
	const input = validateInitiativeInput(await readBody<InitiativeInput>(request));
	const initiativeId = `INIT-${crypto.randomUUID()}`;
	const auditId = `AUDIT-${crypto.randomUUID()}`;

	await db.batch([
		db.prepare(`
			INSERT INTO initiatives (
				initiative_id, input_type, title, description, desired_result,
				status, submitted_by, source_filename
			) VALUES (?, ?, ?, ?, ?, 'NEW', ?, ?)
		`).bind(
			initiativeId,
			input.input_type,
			input.title,
			input.description,
			input.desired_result,
			input.submitted_by,
			input.source_filename,
		),
		db.prepare(`
			INSERT INTO audit_events (audit_id, object_id, action, module, status, details)
			VALUES (?, ?, 'INITIATIVE_SUBMITTED', 'OPERATING_CENTER', 'SUCCESS', ?)
		`).bind(auditId, initiativeId, JSON.stringify({ input_type: input.input_type })),
	]);

	return response({ ok: true, initiative_id: initiativeId, status: "NEW" }, 201);
}

export async function listInitiatives(db: D1Database): Promise<Response> {
	const result = await db.prepare(`
		SELECT initiative_id, input_type, title, description, desired_result,
			status, submitted_by, source_filename, created_at, updated_at
		FROM initiatives
		ORDER BY created_at DESC
		LIMIT 100
	`).all();

	return response({ ok: true, initiatives: result.results });
}

export async function findNextBoardMeetingId(db: D1Database): Promise<string | null> {
	const next = await db.prepare(`
		SELECT meeting_id FROM board_meetings
		WHERE status IN ('DRAFT', 'OPEN')
		ORDER BY
			CASE WHEN scheduled_for IS NOT NULL AND substr(scheduled_for, 1, 10) >= date('now') THEN 0 ELSE 1 END,
			scheduled_for ASC,
			created_at DESC
		LIMIT 1
	`).first<{ meeting_id: string }>();
	return next ? next.meeting_id : null;
}

export async function createBoardSubmission(request: Request, db: D1Database): Promise<Response> {
	const input = validateBoardSubmissionInput(await readBody<BoardSubmissionInput>(request));
	const submissionId = `BOARD-SUB-${crypto.randomUUID()}`;
	const auditId = `AUDIT-${crypto.randomUUID()}`;

	// The protocol fills during the week on its own: a submission without an
	// explicit requested meeting date joins the nearest upcoming Draft/Open
	// meeting agenda immediately. Items with an explicit date stay PENDING for
	// manual triage.
	let attachedMeetingId: string | null = null;
	if (!input.requested_meeting_date) {
		attachedMeetingId = await findNextBoardMeetingId(db);
	}
	const status = attachedMeetingId ? "AGENDA" : "PENDING";

	await db.batch([
		db.prepare(`
			INSERT INTO board_submissions (
				submission_id, meeting_id, submission_type, title, description,
				requested_outcome, submitted_by, requested_meeting_date, status
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			submissionId,
			attachedMeetingId,
			input.submission_type,
			input.title,
			input.description,
			input.requested_outcome,
			input.submitted_by,
			input.requested_meeting_date,
			status,
		),
		db.prepare(`
			INSERT INTO audit_events (audit_id, object_id, action, module, status, details)
			VALUES (?, ?, 'BOARD_SUBMISSION_ADDED', 'BOARD', 'SUCCESS', ?)
		`).bind(auditId, submissionId, JSON.stringify({ submission_type: input.submission_type, meeting_id: attachedMeetingId })),
	]);

	return response({ ok: true, submission_id: submissionId, status, meeting_id: attachedMeetingId, auto_attached: attachedMeetingId !== null }, 201);
}

export async function listBoardSubmissions(db: D1Database): Promise<Response> {
	const result = await db.prepare(`
		SELECT submission_id, meeting_id, submission_type, title, description,
			requested_outcome, submitted_by, requested_meeting_date, status,
			created_at, updated_at
		FROM board_submissions
		WHERE status IN ('PENDING', 'AGENDA')
		ORDER BY COALESCE(requested_meeting_date, '9999-12-31'), created_at
		LIMIT 200
	`).all();

	return response({ ok: true, submissions: result.results });
}

async function count(db: D1Database, sql: string): Promise<number> {
	const row = await db.prepare(sql).first<{ total: number }>();
	return Number(row?.total ?? 0);
}

// ADR-0023: activity feed. What is happening (audit trail), what is new
// (recent events), what requires reading (owner attention items). Built
// from the audit log plus explicit queues. No per-member read state: there
// is no verified member identity, and read acknowledgement is an explicit
// owner-wide action, not inferred browser state.
export interface ActivityItem {
	id: string;
	ts: string;
	label: string;
	detail: string | null;
	kind: string;
	requires_reading: boolean;
	acknowledged: boolean;
}

function activityLabel(action: string, module: string, details: string | null): string {
	const d: Record<string, string> = details ? (JSON.parse(details) as Record<string, string>) : {};
	switch (action) {
		case "BOARD_SUBMISSION_CREATED":
			return `New Board submission: ${d.title ?? d.submission_id ?? "untitled"}`;
		case "PROTOCOL_FORMED":
			return `Weekly protocol formed for the ${d.meeting_date ?? "upcoming"} meeting`;
		case "PROTOCOL_PROCESSED":
			return `Protocol processed: ${d.processed ?? 0} decisions`;
		case "BOARD_UPLOAD_ROUTED":
			return `File uploaded and routed: ${d.filename ?? d.upload_id ?? "file"}`;
		case "MEDIA_PLAN_CREATED":
			return `Media plan created: ${d.title ?? d.plan_id ?? "plan"}`;
		case "MEDIA_PLAN_APPROVED":
			return `Media plan approved: ${d.plan_id ?? "plan"}`;
		case "MEDIA_ARTICLE_ADDED":
			return `Article drafted: ${d.title ?? d.article_id ?? "article"}`;
		case "MEDIA_ARTICLE_PUBLISHED":
			return `Article published to site news: ${d.article_id ?? "article"}`;
		case "DECISION_REQUEST_CREATED":
			return `Decision requested: ${d.title ?? d.request_id ?? "item"}`;
		case "FUND_CREATED":
			return `Fund created: ${d.name ?? d.fund_id ?? "fund"}`;
		default:
			return module ? `${module}: ${action}` : action;
	}
}

export async function getActivityFeed(db: D1Database): Promise<Response> {
	const items: ActivityItem[] = [];

	// Owner-wide read acknowledgments (durable). Acknowledged items are
	// still shown, but no longer flagged as requiring reading.
	const acked = await db
		.prepare(`SELECT item_id FROM read_acknowledgments`)
		.all<{ item_id: string }>()
		.then((r) => new Set((r.results ?? []).map((x) => x.item_id)))
		.catch(() => new Set<string>());

	// Recent audit events: what happened.
	const events = await db
		.prepare(
			`SELECT action, module, details, created_at
			 FROM audit_events
			 ORDER BY created_at DESC
			 LIMIT 30`,
		)
		.all<{ action: string; module: string | null; details: string | null; created_at: string }>();

	for (const e of events.results ?? []) {
		const id = `audit-${e.action}-${e.created_at}`;
		items.push({
			id,
			ts: e.created_at,
			label: activityLabel(e.action, e.module ?? "", e.details),
			detail: null,
			kind: "event",
			requires_reading: false,
			acknowledged: acked.has(id),
		});
	}

	// Queues that require the owner's eyes.
	const pendingRequests = await db
		.prepare(
			`SELECT request_id, title, created_at
			 FROM decision_requests
			 WHERE status = 'PENDING'
			 ORDER BY created_at DESC
			 LIMIT 10`,
		)
		.all<{ request_id: string; title: string | null; created_at: string }>()
		.catch(() => ({ results: [] as { request_id: string; title: string | null; created_at: string }[] }));

	for (const r of pendingRequests.results ?? []) {
		const id = `req-${r.request_id}`;
		items.push({
			id,
			ts: r.created_at,
			label: `Decision requested: ${r.title ?? r.request_id}`,
			detail: "The machine prepared this and is waiting for owner approval.",
			kind: "decision_request",
			requires_reading: !acked.has(id),
			acknowledged: acked.has(id),
		});
	}

	const needsOwner = await db
		.prepare(
			`SELECT upload_id, filename, created_at
			 FROM board_uploads
			 WHERE route = 'NEEDS_OWNER'
			 ORDER BY created_at DESC
			 LIMIT 10`,
		)
		.all<{ upload_id: string; filename: string; created_at: string }>()
		.catch(() => ({ results: [] as { upload_id: string; filename: string; created_at: string }[] }));

	for (const u of needsOwner.results ?? []) {
		const id = `upload-${u.upload_id}`;
		items.push({
			id,
			ts: u.created_at,
			label: `Upload needs owner review: ${u.filename}`,
			detail: "The machine could not classify this file. Review and route it.",
			kind: "upload_review",
			requires_reading: !acked.has(id),
			acknowledged: acked.has(id),
		});
	}

	items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
	return response({ ok: true, items: items.slice(0, 40) });
}

// Explicit owner-wide read acknowledgment. The owner marks an activity
// item as read; the acknowledgment is durable. There is no per-member
// read state because there is no verified member identity.
export async function acknowledgeRead(request: Request, db: D1Database): Promise<Response> {
	const body = await readBody<{ item_id?: string; note?: string }>(request);
	const itemId = (body.item_id ?? "").trim();
	if (!itemId) {
		return response({ ok: false, error: "item_id is required" }, 400);
	}
	const note = (body.note ?? "").trim() || null;
	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO read_acknowledgments (item_id, acknowledged_at, note)
			 VALUES (?, ?, ?)
			 ON CONFLICT(item_id) DO UPDATE SET acknowledged_at = excluded.acknowledged_at, note = excluded.note`,
		)
		.bind(itemId, now, note)
		.run();
	return response({ ok: true, item_id: itemId, acknowledged_at: now });
}

export async function getOperatingCenterOverview(db: D1Database): Promise<Response> {
	const [initiatives, boardItems, decisions, workItems, objects, publishedResults] = await Promise.all([
		count(db, "SELECT COUNT(*) AS total FROM initiatives WHERE status IN ('NEW', 'UNDER_REVIEW', 'PROPOSED')"),
		count(db, "SELECT COUNT(*) AS total FROM board_submissions WHERE status IN ('PENDING', 'AGENDA')"),
		count(db, "SELECT COUNT(*) AS total FROM decision_requests WHERE status = 'PENDING'"),
		count(db, "SELECT COUNT(*) AS total FROM work_items WHERE status IN ('READY', 'IN_PROGRESS', 'BLOCKED')"),
		count(db, "SELECT COUNT(*) AS total FROM objects"),
		count(db, "SELECT COUNT(*) AS total FROM result_publication_history WHERE status = 'PUBLISHED'"),
	]);

	return response({
		ok: true,
		generated_at: new Date().toISOString(),
		counts: {
			active_initiatives: initiatives,
			pending_board_submissions: boardItems,
			pending_decisions: decisions,
			active_work_items: workItems,
			connected_objects: objects,
			published_results: publishedResults,
		},
		sections: {
			competition_calendar: { available: true, endpoint: "/api/operating-center/race-lifecycle" },
			sponsors: { available: false, reason: "Sponsor pipeline is not connected yet" },
			donations: { available: false, reason: "Donation outcome feed is not connected yet" },
			google_ads: { available: true, endpoint: "/integrations/google-ads/status" },
			meta: { available: true, endpoint: "/integrations/meta/status" },
		},
	});
}

export type OperatingCenterPageId = "overview" | "results" | "funds" | "media" | "board" | "uploads" | "sponsorship" | "activity" | "sites" | "social" | "ads" | "sellers" | "partners" | "fundraising" | "groups" | "meetings" | "operations";

/**
 * ADR-0023: shared button menu rendered directly under the header on every
 * operating-center page. Same markup everywhere so the cockpit navigates as one.
 * ADR-0027: 15 buttons (7 new screens: sites, social, ads, sellers,
 * partners, fundraising, groups).
 * ADR-0028: 16 buttons (meetings added).
 */
export function operatingCenterMenu(active: OperatingCenterPageId): string {
	const items: Array<{ id: OperatingCenterPageId; label: string; href: string }> = [
		{ id: "overview", label: "Overview", href: "/operating-center" },
		{ id: "results", label: "Results", href: "/operating-center/results" },
		{ id: "funds", label: "Funds", href: "/operating-center/funds" },
		{ id: "media", label: "Media", href: "/operating-center/media" },
		{ id: "board", label: "Board", href: "/operating-center/board" },
		{ id: "uploads", label: "Uploads", href: "/operating-center/uploads" },
		{ id: "sponsorship", label: "Sponsorship", href: "/operating-center/sponsorship" },
		{ id: "activity", label: "Activity", href: "/operating-center/activity" },
		{ id: "sites", label: "Sites", href: "/operating-center/sites" },
		{ id: "social", label: "Social", href: "/operating-center/social" },
		{ id: "ads", label: "Ads", href: "/operating-center/ads" },
		{ id: "sellers", label: "Sellers", href: "/operating-center/sellers" },
		{ id: "partners", label: "Partners", href: "/operating-center/partners" },
		{ id: "fundraising", label: "Fundraising", href: "/operating-center/fundraising" },
		{ id: "groups", label: "Groups", href: "/operating-center/groups" },
		{ id: "meetings", label: "Meetings", href: "/operating-center/meetings" },
		{ id: "operations", label: "Operations", href: "/operating-center/operations" },
	];
	return (
		'<nav class="oc-menu" aria-label="Operating center">' +
		items
			.map((i) =>
				i.id === active
					? '<a class="oc-menu-btn oc-menu-active" href="' + i.href + '" aria-current="page">' + i.label + "</a>"
					: '<a class="oc-menu-btn" href="' + i.href + '">' + i.label + "</a>",
			)
			.join("") +
		"</nav>"
	);
}

export function renderOperatingCenterHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
		.oc-menu-btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
		.oc-menu-btn:hover{background:#3a7455}.oc-menu-active{background:#fff;color:var(--brand)}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.stat,.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px}.stat strong{display:block;font-size:30px}.stat span{color:var(--muted)}
		.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:20px}h2{margin:0 0 14px;font-size:22px}label{display:block;margin:12px 0 5px;font-weight:650}input,select,textarea,button{width:100%;font:inherit}input,select,textarea{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white}textarea{min-height:105px;resize:vertical}button{margin-top:14px;border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer}.message{min-height:24px;color:var(--muted);margin-top:9px}.queue{margin-top:20px}.item{border-top:1px solid var(--line);padding:12px 0}.item:first-child{border-top:0}.item strong{display:block}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}.followup-due{color:#b35400;font-weight:700}.followup-overdue{color:#b00020;font-weight:700}
	</style>
</head>
<body>
	<header><h1>NWANA Operating Center</h1><p>What is happening, what needs a decision, and what happens next.</p></header>
	${operatingCenterMenu("overview")}
	<main>
		<section class="panel" id="gate" hidden>
			<h2>Owner access</h2>
			<p class="unavailable">This page is private. Enter the operating center key to continue.</p>
			<form id="key-form">
				<label for="owner-key">Operating center key</label>
				<input id="owner-key" name="owner_key" type="password" autocomplete="current-password" required>
				<button type="submit">Open operating center</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
		<section class="stats" id="stats"><div class="stat"><strong>…</strong><span>Loading verified state</span></div></section>
		<section class="panel" id="lifecycle-panel" style="margin-top:20px"><h2>Series 2026 race lifecycle</h2>
			<p class="meta">One row per distance lives on the results page now.</p>
			<div id="lifecycle-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/results">Open results →</a></p>
		</section>
		<section class="panel" id="fund-card" style="margin-top:20px"><h2>Funds</h2>
			<p class="meta">Fund objects and prospect pipelines live on their own page now, like race results.</p>
			<div id="fund-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/funds">Open funds →</a></p>
		</section>
		<section class="panel" id="media-card" style="margin-top:20px"><h2>Media plan</h2>
			<p class="meta">You set the topics; the machine runs the plan and article lifecycle and drafts the articles.</p>
			<div id="media-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/media">Open media workspace →</a></p>
		</section>
		<section class="panel" id="activity-card" style="margin-top:20px"><h2>Activity</h2>
			<p class="meta">What is happening, what is new, and what requires the owner's eyes. The full feed lives on its own page.</p>
			<div id="activity-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/activity">Open activity →</a></p>
		</section>
		<section class="panel" id="member-actions-panel" style="margin-top:20px"><h2>What board members can do</h2>
			<p class="meta">The operating center is the board's cockpit. Every member can:</p>
			<ul>
				<li><strong>Submit to the board:</strong> open the <a href="/operating-center/board">Board workspace</a> to add questions, initiatives, or wishes. Submissions are collected into the weekly Sunday protocol.</li>
				<li><strong>Upload files:</strong> open the <a href="/operating-center/uploads">Uploads</a> page to share contact lists, task lists, meeting material, or media drafts. The machine classifies and routes each file automatically.</li>
				<li><strong>Review activity:</strong> open the <a href="/operating-center/activity">Activity</a> page for new submissions, decisions, and uploads. Items under "Requires reading" need attention; mark them read when done.</li>
				<li><strong>Track the media plan:</strong> open the <a href="/operating-center/media">Media plan</a> page to see article drafts, approvals, site publication, and press distribution.</li>
				<li><strong>Track funds:</strong> open the <a href="/operating-center/funds">Funds</a> page for the full fundraising pipeline.</li>
			</ul>
			<p class="meta">Consequential actions (sends, publications, spending, agreements) always require explicit owner confirmation. The machine prepares; the owner decides.</p>
		</section>
		<section class="panel" id="uploads-summary-panel" style="margin-top:20px"><h2>Board uploads</h2>
			<div id="uploads-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/uploads">Open uploads →</a></p>
		</section>
		<section class="panel" id="sponsorship-card" style="margin-top:20px"><h2>Sponsorship assets</h2>
			<p class="meta">Machine-generated seller packages, one per object. Stages: draft → packaged → offered → negotiating → committed → fulfilled → renewal. The full list and stage advancement live on their own page.</p>
			<div id="sponsorship-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/sponsorship">Open sponsorship →</a></p>
		</section>
		<section class="panel" id="sites-card" style="margin-top:20px"><h2>Sites</h2>
			<p class="meta">Every NWANA web property with a short description and traffic stats once analytics is connected. Each screen has a downloadable report.</p>
			<div id="sites-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/sites">Open sites →</a></p>
		</section>
		<section class="panel" id="social-card" style="margin-top:20px"><h2>Social</h2>
			<p class="meta">Accounts, pages, and groups with verified statistics. Each screen has a downloadable report.</p>
			<div id="social-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/social">Open social →</a></p>
		</section>
		<section class="panel" id="ads-card" style="margin-top:20px"><h2>Google Ads + Analytics</h2>
			<p class="meta">Campaigns, spend, keywords, and site analytics once the accounts are connected. Each screen has a downloadable report.</p>
			<div id="ads-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/ads">Open ads →</a></p>
		</section>
		<section class="panel" id="sellers-card" style="margin-top:20px"><h2>Sellers</h2>
			<p class="meta">The exclusive-seller pipeline: stages, next steps, and the answers an incoming seller asked for. Each screen has a downloadable report.</p>
			<div id="sellers-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/sellers">Open sellers →</a></p>
		</section>
		<section class="panel" id="partners-card" style="margin-top:20px"><h2>Partners</h2>
			<p class="meta">The partner pipeline from the outreach registry. Each screen has a downloadable report.</p>
			<div id="partners-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/partners">Open partners →</a></p>
		</section>
		<section class="panel" id="fundraising-card" style="margin-top:20px"><h2>Fundraising</h2>
			<p class="meta">The Fund object: the $50K Founding Circle bridge sprint, pipeline, and follow-up calendar. Each screen has a downloadable report.</p>
			<div id="fundraising-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/fundraising">Open fundraising →</a></p>
		</section>
		<section class="panel" id="groups-card" style="margin-top:20px"><h2>NW Groups</h2>
			<p class="meta">The group license ladder and the public funnel, with network statistics once tracked. Each screen has a downloadable report.</p>
			<div id="groups-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/groups">Open groups →</a></p>
		</section>
		<section class="panel" id="meetings-card" style="margin-top:20px"><h2>Meetings</h2>
			<p class="meta">External meetings on the calendar and the board meeting log, each with a downloadable report.</p>
			<div id="meetings-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/meetings">Open meetings →</a></p>
		</section>
		<section class="panel" id="operations-card" style="margin-top:20px"><h2>Operations</h2>
			<p class="meta">The operational queue: every current source, its required result, action, channel, status, and exact next step.</p>
			<div id="operations-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/operations">Open operations →</a></p>
		</section>
		<section class="panel" id="board-summary-panel" style="margin-top:20px"><h2>Board workspace</h2>
			<div id="board-summary">Loading…</div>
			<p class="meta"><a href="/operating-center/board">Open board workspace →</a></p>
		</section>
		<section class="grid queue"><div class="panel"><h2>Board queue</h2><div id="board-items">Loading…</div><p class="meta">Submissions join the nearest upcoming meeting protocol automatically. Open the <a href="/operating-center/board">Board workspace</a> to triage.</p></div></section>
		</div>
	</main>
	<script>
		const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
		const KEY_STORAGE='nwana_operating_center_key';
		const gate=document.querySelector('#gate');
		const app=document.querySelector('#app');
		function getKey(){try{return localStorage.getItem(KEY_STORAGE)||''}catch(e){return ''}}
		function setKey(k){try{localStorage.setItem(KEY_STORAGE,k)}catch(e){}}
		function clearKey(){try{localStorage.removeItem(KEY_STORAGE)}catch(e){}}
		function showGate(message){app.hidden=true;gate.hidden=false;if(message)document.querySelector('#key-message').textContent=message}
		function showApp(){gate.hidden=true;app.hidden=false}
		async function api(path,options){const r=await fetch(path,Object.assign({},options||{},{headers:Object.assign({},(options&&options.headers)||{},{authorization:'Bearer '+getKey()})}));let d=null;try{d=await r.json()}catch(e){}if(r.status===401){clearKey();showGate('The key was rejected. Enter the owner key again.');throw new Error('Unauthorized')}if(!r.ok)throw new Error((d&&d.error)||'Request failed');return d}
		function formJson(form){return Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,String(v)]))}
		let pendingSubmissionsCache=[];
		async function load(){
			const [o,b]=await Promise.all([api('/api/operating-center/overview'),api('/api/board/submissions')]);
			pendingSubmissionsCache=b.submissions||[];
			const labels={pending_board_submissions:'Board items',pending_decisions:'Decisions needed',active_work_items:'Active work',connected_objects:'Connected objects',published_results:'Published results'};
			document.querySelector('#stats').innerHTML=Object.entries(o.counts).map(([k,v])=>'<div class="stat"><strong>'+esc(v)+'</strong><span>'+esc(labels[k]||k)+'</span></div>').join('');
			document.querySelector('#board-items').innerHTML=b.submissions.length?'<div class="meta">'+b.submissions.length+' pending submissions awaiting triage. The next meeting protocol forms automatically on Sunday.</div>':'<div class="unavailable">No pending Board items.</div>';
			loadLifecycleSummary();
			loadFundSummary();
			loadMediaSummary();
			loadActivitySummary();
			loadBoardSummary();
			loadUploadsSummary();
			loadSponsorshipSummary();
			loadSitesSummary();
			loadSocialSummary();
			loadAdsSummary();
			loadSellersSummary();
			loadPartnersSummary();
			loadFundraisingSummary();
			loadGroupsSummary();
			loadMeetingsSummary();
			loadOperationsSummary();
		}
		async function pickNextMeetingLocal(meetings){
			const today=new Date().toISOString().slice(0,10);
			const open=(meetings||[]).filter(m=>m.status==='DRAFT'||m.status==='OPEN');
			const dated=open.filter(m=>m.scheduled_for&&String(m.scheduled_for).slice(0,10)>=today)
				.sort((a,b)=>String(a.scheduled_for).localeCompare(String(b.scheduled_for)));
			if(dated.length)return dated[0];
			const undated=open.filter(m=>!m.scheduled_for);
			if(undated.length)return undated[0];
			return null;
		}
		async function loadBoardSummary(){
			const box=document.querySelector('#board-summary');
			try{
				const [m,w,c]=await Promise.all([api('/api/board/meetings'),api('/api/board/work-items'),api('/api/board/cadence').catch(()=>null)]);
				const meetings=m.meetings||[];
				const next=pickNextMeetingLocal(meetings);
				const items=w.work_items||[];
				const active=items.filter(x=>x.status!=='DONE').length;
				const overdue=items.filter(x=>x.due_date && new Date(x.due_date)<new Date() && x.status!=='DONE').length;
				const pend=(pendingSubmissionsCache||[]).filter(s=>s.status==='PENDING').length;
				let html='';
				if(next){
					const dstr=next.scheduled_for?String(next.scheduled_for).slice(0,10):'date TBD';
					let when='';
					if(c&&c.cadence){const tz=String(c.cadence.timezone||'').replace('America/','');when=' · '+esc(c.cadence.weekday)+'s '+esc(c.cadence.time)+(tz?' '+esc(tz)+' time':'')}
					const agenda=Number(next.agenda_count||0);
					html+='<div style="font-size:18px;font-weight:700;margin-bottom:6px">Next Board meeting: '+esc(dstr)+when+'</div>';
					html+='<div class="meta">Protocol: '+agenda+' item'+(agenda===1?'':'s')+(pend?' · '+pend+' waiting in the queue':'')+' · '+esc(next.status==='DRAFT'?'Draft':next.status==='OPEN'?'Open':'Closed')+'</div>';
				}else{
					html+='<div class="unavailable">No upcoming meeting.</div>';
				}
				html+='<div class="meta" style="margin-top:6px">'+active+' active work item'+(active===1?'':'s')+(overdue?' · <span style="color:#a00">'+overdue+' overdue</span>':'')+'</div>';
				box.innerHTML=html;
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadUploadsSummary(){
			const box=document.querySelector('#uploads-summary');
			try{
				const data=await api('/api/operating-center/uploads');
				const uploads=data.uploads||[];
				if(!uploads.length){box.innerHTML='<div class="unavailable">No uploads yet.</div>';return}
				const latest=uploads[0];
				box.innerHTML='<div class="meta">'+uploads.length+' upload'+(uploads.length===1?'':'s')+' routed · latest: '+esc(latest.filename)+' ('+esc(latest.route_label)+')</div>';
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadFundSummary(){
			const box=document.querySelector('#fund-summary');
			const money=n=>'$'+Number(n||0).toLocaleString('en-US');
			try{
				const data=await api('/api/operating-center/fund');
				if(!data.funds.length){box.innerHTML='<div class="unavailable">No funds yet.</div>';return}
				const raised=data.funds.reduce((s,f)=>s+Number(f.fund.raised_amount||0),0);
				const goal=data.funds.reduce((s,f)=>s+Number(f.fund.goal_amount||0),0);
				const due=data.funds.reduce((s,f)=>s+Number(f.follow_ups_due_now||0),0);
				box.innerHTML='<div class="meta">'+data.funds.length+' fund'+(data.funds.length>1?'s':'')+' · raised '+money(raised)+' of '+money(goal)+' goal</div>'+
					'<div class="meta'+(due?' followup-due':'')+'">'+due+' follow-up'+(due===1?'':'s')+' due now</div>'+
					'<div class="meta">'+data.funds.map(f=>esc(f.fund.name)).join(' · ')+'</div>';
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadMediaSummary(){
			const box=document.querySelector('#media-summary');
			try{
				const data=await api('/api/operating-center/media/overview');
				if(!data.plans.length){box.innerHTML='<div class="unavailable">No media plans yet. Create one in the media workspace.</div>';return}
				box.innerHTML=data.plans.map(p=>'<div class="item"><strong>'+esc(p.title)+'</strong><div class="meta">'+esc(p.status)+' · '+p.article_count+' article'+(p.article_count===1?'':'s')+' ('+p.ready_count+' ready, '+p.published_count+' published)</div></div>').join('');
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadActivitySummary(){
			const box=document.querySelector('#activity-summary');
			try{
				const data=await api('/api/operating-center/activity');
				const items=data.items||[];
				const req=items.filter(i=>i.requires_reading);
				const fresh=items.filter(i=>!i.requires_reading).slice(0,3);
				box.innerHTML='<div class="meta'+(req.length?' followup-due':'')+'">'+req.length+' item'+(req.length===1?'':'s')+' require'+(req.length===1?'s':'')+' reading</div>'+
					(fresh.length?fresh.map(i=>'<div class="meta">· '+esc(i.label)+'</div>').join(''):'<div class="unavailable">No recent activity.</div>');
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadSponsorshipSummary(){
			const box=document.querySelector('#sponsorship-summary');
			const label={draft:'Draft',packaged:'Packaged',offered:'Offered',negotiating:'Negotiating',committed:'Committed',fulfilled:'Fulfilled',renewal:'Renewal'};
			try{
				const data=await api('/api/operating-center/sponsorship-assets');
				const assets=data.assets||[];
				if(!assets.length){box.innerHTML='<div class="unavailable">No sponsorship assets yet. Generate one on the sponsorship page.</div>';return}
				const byStage={};
				assets.forEach(a=>{byStage[a.stage]=(byStage[a.stage]||0)+1});
				box.innerHTML='<div class="meta">'+Object.entries(byStage).map(([s,c])=>esc(label[s]||s)+': <strong>'+c+'</strong>').join(' · ')+'</div>'+
					'<div class="meta">'+assets.length+' total asset'+(assets.length===1?'':'s')+'</div>';
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadSitesSummary(){
			const box=document.querySelector('#sites-summary');
			try{
				const data=await api('/api/operating-center/sites/overview');
				const sites=data.sites||[];
				box.innerHTML='<div class="meta">'+sites.length+' web propert'+(sites.length===1?'y':'ies')+'</div>'+
					'<div class="meta">Analytics: <span class="unavailable">not connected</span></div>';
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadSocialSummary(){
			const box=document.querySelector('#social-summary');
			try{
				const data=await api('/api/operating-center/social/overview');
				const accounts=data.accounts||[];
				const connected=accounts.filter(a=>a.status==='Connected').length;
				box.innerHTML='<div class="meta">'+accounts.length+' accounts known · '+connected+' connected</div>'+
					'<div class="meta">LinkedIn: 8 followers (observed 2026-09-22)</div>';
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadAdsSummary(){
			const box=document.querySelector('#ads-summary');
			try{
				const data=await api('/api/operating-center/ads/overview');
				const planned=(data.planned_campaigns||[]).length;
				box.innerHTML='<div class="meta">Google Ads: <span class="unavailable">not connected</span> · Analytics: <span class="unavailable">not set up</span></div>'+
					'<div class="meta">'+planned+' planned campaigns (machine spec, not live)</div>';
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadSellersSummary(){
			const box=document.querySelector('#sellers-summary');
			try{
				const data=await api('/api/operating-center/sellers/overview');
				const sellers=data.sellers||[];
				const dated=sellers.filter(s=>s.next_date).sort((a,b)=>String(a.next_date).localeCompare(String(b.next_date)));
				box.innerHTML='<div class="meta">'+sellers.length+' seller records</div>'+
					(dated.length?'<div class="meta">Next: '+esc(dated[0].company)+' — '+esc(dated[0].next_date)+'</div>':'<div class="unavailable">No dated next steps.</div>');
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadPartnersSummary(){
			const box=document.querySelector('#partners-summary');
			try{
				const data=await api('/api/operating-center/partners/overview');
				const partners=data.partners||[];
				box.innerHTML='<div class="meta">'+partners.length+' partner record'+(partners.length===1?'':'s')+'</div>'+
					(partners.length?'<div class="meta">'+esc(partners[0].name)+' — '+esc(partners[0].stage)+'</div>':'<div class="unavailable">No partners yet.</div>');
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadFundraisingSummary(){
			const box=document.querySelector('#fundraising-summary');
			try{
				const data=await api('/api/operating-center/fundraising/overview');
				const f=data.fund;
				if(!f){box.innerHTML='<div class="unavailable">No fund objects yet.</div>';return}
				box.innerHTML='<div class="meta">$'+esc(f.goal_amount)+' goal · $'+esc(f.raised_amount)+' raised</div>'+
					'<div class="meta">'+esc(f.prospect_count)+' prospects'+(f.follow_ups_due_now?' · <span class="followup-due">'+f.follow_ups_due_now+' follow-up'+(f.follow_ups_due_now===1?'':'s')+' due</span>':'')+'</div>';
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadGroupsSummary(){
			const box=document.querySelector('#groups-summary');
			try{
				const data=await api('/api/operating-center/groups/overview');
				const ladder=data.ladder||[];
				box.innerHTML='<div class="meta">'+ladder.length+'-step license ladder</div>'+
					'<div class="meta">Group counts: <span class="unavailable">not yet tracked</span></div>';
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadOperationsSummary(){
			const box=document.querySelector('#operations-summary');
			try{
				const data=await api('/api/operating-center/operations/overview');
				const rows=(data.queue&&data.queue.rows)||[];
				const counts={};rows.forEach(r=>{counts[r.status]=(counts[r.status]||0)+1});
				let html='<div class="meta">'+rows.length+' operational rows</div>';
				for(const st of ['READY_TO_ACT','NEEDS_OWNER_INPUT','BLOCKED_EXTERNAL']){
					if(counts[st])html+='<div class="meta">'+st+': '+counts[st]+'</div>';
				}
				box.innerHTML=html;
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadMeetingsSummary(){
			const box=document.querySelector('#meetings-summary');
			try{
				const data=await api('/api/operating-center/meetings/overview');
				const ext=data.external_meetings||[];
				const actionable=ext.filter(m=>m.status==='confirmed'||m.status==='awaiting scheduling');
				const boardCount=(data.board_upcoming||[]).length+(data.board_past||[]).length;
				let html='<div class="meta">'+ext.length+' external meeting'+(ext.length===1?'':'s')+' tracked ('+actionable.length+' upcoming)</div>';
				if(actionable.length)html+='<div class="meta">Next: '+esc(actionable[0].title)+' · '+esc(actionable[0].display_when)+'</div>';
				html+='<div class="meta">Board meetings in the log: '+boardCount+'</div>';
				box.innerHTML=html;
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadLifecycleSummary(){
			const box=document.querySelector('#lifecycle-summary');
			try{
				const data=await api('/api/operating-center/race-lifecycle');
				if(!data.distances.length){box.innerHTML='<div class="unavailable">No lifecycle state yet. Open <a href="/operating-center/results">Race results</a>; opening the page runs the first sync automatically.</div>';return}
				const order=['registration_open','awaiting_results','verifying','levels_computed','published','next_race_prep'];
				const counts={};data.distances.forEach(d=>{counts[d.stage]=(counts[d.stage]||0)+1});
				const prep=data.distances.filter(d=>d.stage==='next_race_prep').length;
				box.innerHTML='<div class="meta">'+order.filter(s=>counts[s]).map(s=>counts[s]+' × '+esc(s)).join(' · ')+'</div>'+
					(prep?'<div class="meta followup-due">'+prep+' prep'+(prep>1?'s':'')+' need'+(prep>1?'':'s')+' review</div>':'<div class="meta">No prep awaiting review.</div>');
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		function renderLoadError(err){document.querySelector('#stats').innerHTML='<div class="stat"><strong>Unavailable</strong><span>'+esc(err.message)+'</span></div>'}
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();load().catch(renderLoadError)});
		if(getKey()){showApp();load().catch(renderLoadError)}else{showGate('')}
	</script>
</body></html>`;
}

export function renderRaceResultsHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Series 2026 race results — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9;--ok:#1c6b3a;--err:#a3322b}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}header a{color:#dce9e2}
		.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
		.oc-menu-btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
		.oc-menu-btn:hover{background:#3a7455}.oc-menu-active{background:#fff;color:var(--brand)}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		h2{margin:0 0 14px;font-size:22px}h3{margin:18px 0 8px;font-size:18px}h4{margin:14px 0 4px;font-size:16px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,button{font:inherit}input{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white;width:100%}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;width:auto;margin-top:14px}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.ok{color:var(--ok);font-weight:650}.err{color:var(--err);font-weight:650}
		table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-size:14px}th{color:var(--muted);font-weight:650}
		.event{border-top:1px solid var(--line);padding:14px 0}.event:first-of-type{border-top:0}
		.nav{margin-bottom:18px}.nav a{color:var(--brand);font-weight:650}
		.sync-status{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px}
		.sync-status div{background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:13px}
	</style>
</head>
<body>
	<header><h1>Series 2026 race results</h1><p>Past races only, newest first. Results refresh automatically every time this page is opened or reloaded. No buttons, no timers.</p></header>
	${operatingCenterMenu("results")}
	<main>
		<section class="panel" id="gate" hidden>
			<h2>Owner access</h2>
			<p class="unavailable">This page is private. Enter the operating center key to continue.</p>
			<form id="key-form">
				<label for="owner-key">Operating center key</label>
				<input id="owner-key" name="owner_key" type="password" autocomplete="current-password" required>
				<button type="submit">Open results</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
			<section class="panel">
				<h2>Series 2026 race lifecycle</h2>
				<p class="meta">One row per distance. Stages: registration_open → awaiting_results → verifying (owner) → levels_computed → published → next_race_prep.</p>
				<div><span class="message" id="lifecycle-message" aria-live="polite"></span></div>
				<div id="lifecycle">Loading…</div>
			</section>
			<section class="panel">
				<h2>Sync status</h2>
				<div class="message" id="sync-message" aria-live="polite">Refreshing results from RunSignup…</div>
				<div class="sync-status" id="sync-status"></div>
			</section>
			<div id="results">Loading…</div>
		</div>
	</main>
	<script>
		const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
		const KEY_STORAGE='nwana_operating_center_key';
		const gate=document.querySelector('#gate');
		const app=document.querySelector('#app');
		const DISTANCES=['1K','3K','5K','10K','15K','20K'];
		function getKey(){try{return localStorage.getItem(KEY_STORAGE)||''}catch(e){return ''}}
		function setKey(k){try{localStorage.setItem(KEY_STORAGE,k)}catch(e){}}
		function clearKey(){try{localStorage.removeItem(KEY_STORAGE)}catch(e){}}
		function showGate(message){app.hidden=true;gate.hidden=false;if(message)document.querySelector('#key-message').textContent=message}
		function showApp(){gate.hidden=true;app.hidden=false}
		async function api(path,options){const r=await fetch(path,Object.assign({},options||{},{headers:Object.assign({},(options&&options.headers)||{},{authorization:'Bearer '+getKey()})}));let d=null;try{d=await r.json()}catch(e){}if(r.status===401){clearKey();showGate('The key was rejected. Enter the owner key again.');throw new Error('Unauthorized')}if(!r.ok)throw new Error((d&&d.error)||'Request failed');return d}
		function publicationLabel(s){return s==='PUBLISHED'?'Published':s==='BASELINE'?'Historical baseline':'Not published yet'}
		function renderSyncStatus(statuses){
			document.querySelector('#sync-status').innerHTML=statuses.map(s=>
				'<div><strong>'+esc(s.distance)+'</strong><br>'+
				(s.ok?'<span class="ok">Synced</span>':'<span class="err">Sync failed</span><br><span class="meta">'+esc(s.error)+'</span>')+
				'</div>').join('');
		}
		function renderLevelBlock(level,rows){
			const body=rows.length?'<table><thead><tr><th>Athlete</th><th>Gender</th><th>Time</th><th>Level place</th></tr></thead><tbody>'+
				rows.map(r=>'<tr><td>'+esc(r.athlete)+'</td><td>'+esc(r.gender)+'</td><td>'+esc(r.time)+'</td><td>'+esc(r.level_place)+'</td></tr>').join('')+'</tbody></table>'
				:'<div class="unavailable">No finishers in this level.</div>';
			return '<h4>'+esc(level.name)+' ('+esc(level.threshold)+')</h4>'+body;
		}
		function renderResults(data){
			const box=document.querySelector('#results');
			if(!data.distances.length){box.innerHTML='<div class="panel"><div class="unavailable">No results yet.</div></div>';return}
			box.innerHTML=data.distances.map(d=>{
				const levels=Array.isArray(d.levels)&&d.levels.length?d.levels:[];
				const events=d.events.length?d.events.map(e=>{
					const link=e.results_url?'<a href="'+esc(e.results_url)+'" target="_blank" rel="noopener">Full results on RunSignup</a>':'<span class="unavailable">RunSignup link not available</span>';
					const blocks=levels.length?levels.map(l=>{
						const rows=(e.results||[]).filter(r=>String(r.performance_level||'').indexOf(l.name)===0);
						return renderLevelBlock(l,rows);
					}).join(''):'<div class="unavailable">No results synced for this event yet.</div>';
					return '<div class="event"><h3>'+esc(e.event_name||('Event '+e.event_id))+' · '+esc(e.event_date||'')+'</h3>'+
						'<div class="meta">'+esc(String(e.result_count))+' results'+(e.finalized?' · finalized':'')+' · Publication: '+esc(publicationLabel(e.publication_status))+' · '+link+'</div>'+blocks+'</div>';
				}).join(''):'<div class="unavailable">No past races with results yet.</div>';
				return '<section class="panel"><h2>'+esc(d.distance)+' — '+esc(d.stage)+'</h2>'+
					'<div class="meta">'+(d.synced_at?'Synced '+esc(d.synced_at):'Never synced')+'</div>'+
					events+'</section>';
			}).join('');
		}
		async function loadLifecycle(){
			const box=document.querySelector('#lifecycle');
			try{
				const data=await api('/api/operating-center/race-lifecycle');
				if(!data.distances.length){box.innerHTML='<div class="unavailable">No lifecycle state yet.</div>';return}
				box.innerHTML=data.distances.map(d=>{
					const ev=d.active_event;
					const action=(d.owner_action&&d.stage!=='next_race_prep')?'<div class="meta">Owner action: '+esc(d.owner_action)+'</div>':'';
					const prep=(d.stage==='next_race_prep'&&d.prep)?'<div class="meta">'+esc(d.owner_action||'Prep needs review')+'. Drafts ready: announcement + email (Send stays manual). <button data-prep="'+esc(d.distance)+'" style="width:auto">Confirm prep</button></div>':'';
					return '<div class="item"><strong>'+esc(d.distance)+' — '+esc(d.stage)+'</strong>'+
						'<div class="meta">'+(ev?esc(ev.event_name||'')+' · '+esc(ev.event_date||'')+' · ':'')+'write: '+esc(d.write_access)+' (dry_run)'+(d.synced_at?' · synced '+esc(d.synced_at):'')+'</div>'+
						action+prep+'</div>';
				}).join('');
				box.querySelectorAll('[data-prep]').forEach(btn=>btn.addEventListener('click',async()=>{
					const m=document.querySelector('#lifecycle-message');m.textContent='Confirming prep…';
					try{await api('/api/operating-center/race-lifecycle/prep-confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distance:btn.dataset.prep})});m.textContent='Prep confirmed.';await loadLifecycle()}catch(err){m.textContent=err.message}
				}));
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function refresh(){
			const m=document.querySelector('#sync-message');
			m.textContent='Refreshing results from RunSignup…';
			const statuses=[];
			for(const d of DISTANCES){
				try{
					await api('/api/operating-center/race-lifecycle/sync?distance='+encodeURIComponent(d),{method:'POST'});
					statuses.push({distance:d,ok:true});
				}catch(err){statuses.push({distance:d,ok:false,error:err.message})}
				renderSyncStatus(statuses);
			}
			const failed=statuses.filter(s=>!s.ok);
			m.textContent=failed.length
				? 'Refresh finished with errors on '+failed.map(s=>s.distance).join(', ')+'. Showing the last synced results below.'
				: 'Results are up to date.';
			try{renderResults(await api('/api/operating-center/race-results'))}
			catch(err){document.querySelector('#results').innerHTML='<div class="panel"><div class="unavailable">'+esc(err.message)+'</div></div>'}
		}
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();refresh();loadLifecycle()});
		if(getKey()){showApp();refresh();loadLifecycle()}else{showGate('')}
	</script>
</body></html>`;
}

export type SiteNewsKind = "news" | "winner_announcement";

export interface SiteNewsInput {
	title?: unknown;
	slug?: unknown;
	body_html?: unknown;
	published_at?: unknown;
	kind?: unknown;
	created_by?: unknown;
}

function slugifySiteNewsTitle(title: string): string {
	const slug = title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-")
		.slice(0, 120);
	return slug || "news";
}

function validSiteNewsPublishedAt(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value);
}

export async function publishSiteNews(
	request: Request,
	db: D1Database,
): Promise<Response> {
	const input = await readBody<SiteNewsInput>(request);
	const title = clean(input.title, 200);
	const kind = clean(input.kind, 30).toLowerCase() || "news";
	const bodyHtml = clean(input.body_html, 200_000);
	const createdBy = clean(input.created_by, 200) || null;

	if (!title) throw new Error("News title is required");
	if (kind !== "news" && kind !== "winner_announcement") {
		throw new Error("kind must be 'news' or 'winner_announcement'");
	}

	const publishedAt = clean(input.published_at, 40) || new Date().toISOString();
	if (!validSiteNewsPublishedAt(publishedAt)) {
		throw new Error("published_at must be a date or ISO timestamp");
	}

	let baseSlug = clean(input.slug, 140).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || slugifySiteNewsTitle(title);
	let slug = baseSlug;
	for (let attempt = 2; attempt <= 100; attempt++) {
		const taken = await db
			.prepare("SELECT id FROM site_news WHERE slug = ?")
			.bind(slug)
			.first<{ id: number }>();
		if (!taken) break;
		slug = `${baseSlug}-${attempt}`;
	}
	const taken = await db
		.prepare("SELECT id FROM site_news WHERE slug = ?")
		.bind(slug)
		.first<{ id: number }>();
	if (taken) throw new Error("Unable to generate a unique slug");

	const result = await db
		.prepare(
			`INSERT INTO site_news (slug, title, body_html, published_at, kind, created_by)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.bind(slug, title, bodyHtml, publishedAt, kind, createdBy)
		.run();

	return response(
		{
			ok: true,
			id: result.meta.last_row_id,
			slug,
			kind,
			published_at: publishedAt,
		},
		201,
	);
}

// ---------------------------------------------------------------------------
// Engine-side news auto-publish (ADR-0011).
//
// When a result publication is confirmed with an explicit PUBLISH, the engine
// also writes a winner announcement into site_news, the public site's news
// feed. This is the machine's own distribution surface (its own D1 table),
// so no owner key is needed at this point: the owner's explicit PUBLISH
// confirmation is the authorization. Nothing is sent externally and nothing
// is written back to RunSignup. The write is idempotent per publication key.

export interface WinnerAnnouncementRow {
	athlete: string;
	gender: string | null;
	time: string | null;
	performance_level: string | null;
	level_place: string | null;
}

export interface WinnerAnnouncementInput {
	publicationKey: string;
	eventName: string | null;
	eventDate: string | null;
	distance: string | null;
	rows: ReadonlyArray<WinnerAnnouncementRow>;
}

export interface WinnerAnnouncementNews {
	title: string;
	body_html: string;
	slug: string;
}

const WINNER_LEVEL_ORDER = [
	"Elite",
	"High Performance",
	"Performance",
	"Competitive",
	"Open",
] as const;

function winnerLevelOrder(value: string | null): number {
	if (!value) return WINNER_LEVEL_ORDER.length;
	const index = WINNER_LEVEL_ORDER.findIndex((level) =>
		value.startsWith(level),
	);
	return index === -1 ? WINNER_LEVEL_ORDER.length : index;
}

function escapeNewsHtml(value: string): string {
	return value.replace(/[&<>"']/g, (c) => {
		switch (c) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			default:
				return "&#39;";
		}
	});
}

// Pure: builds a winner-announcement news item from level winners
// (level_place "1"). Returns null when no winners are present, so the
// caller publishes nothing instead of an empty announcement.
export function buildWinnerAnnouncementNews(
	input: WinnerAnnouncementInput,
): WinnerAnnouncementNews | null {
	const winners = input.rows.filter(
		(row) => String(row.level_place ?? "").trim() === "1",
	);
	if (winners.length === 0) return null;

	const byLevel = new Map<string, WinnerAnnouncementRow[]>();
	for (const winner of winners) {
		const level = (winner.performance_level ?? "").trim() || "Open";
		const group = byLevel.get(level);
		if (group) group.push(winner);
		else byLevel.set(level, [winner]);
	}
	const orderedLevels = [...byLevel.keys()].sort(
		(a, b) => winnerLevelOrder(a) - winnerLevelOrder(b),
	);

	const eventLabel = (input.eventName ?? "").trim() ||
		`NWANA ${((input.distance ?? "").trim() || "race")}`;
	const dateLabel = (input.eventDate ?? "").trim();
	const title = `Winner congratulations: ${eventLabel}`;

	const lines: string[] = [];
	lines.push(
		`<p>Congratulations to the winners of ${escapeNewsHtml(eventLabel)}` +
			(dateLabel ? ` (${escapeNewsHtml(dateLabel)})` : "") +
			`!</p>`,
	);
	for (const level of orderedLevels) {
		lines.push(`<h3>${escapeNewsHtml(level)}</h3>`);
		lines.push("<ul>");
		for (const winner of byLevel.get(level) ?? []) {
			const name = escapeNewsHtml((winner.athlete ?? "").trim() || "Unknown athlete");
			const detailParts: string[] = [];
			const gender = (winner.gender ?? "").trim();
			if (gender) detailParts.push(escapeNewsHtml(gender));
			const time = (winner.time ?? "").trim();
			if (time) detailParts.push(escapeNewsHtml(time));
			const detail = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
			lines.push(`<li>${name}${detail}</li>`);
		}
		lines.push("</ul>");
	}
	lines.push(
		`<p>Full results are published in the <a href="/results">results section</a>.</p>`,
	);

	return {
		title,
		body_html: lines.join("\n"),
		slug: winnerAnnouncementSlug(input.publicationKey),
	};
}

export function winnerAnnouncementSlug(publicationKey: string): string {
	const safe = publicationKey
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 100);
	return `winner-announcement-${safe || "news"}`;
}

export interface AutoPublishNewsOutcome {
	published: boolean;
	slug?: string;
	skipped?: string;
}

// Server-side: reads the stored per-event results snapshot and writes one
// winner-announcement row into site_news. Idempotent per publication key.
export async function autoPublishWinnerNews(
	db: D1Database,
	params: {
		publicationKey: string;
		series: string;
		raceId: number;
		eventId: number;
	},
): Promise<AutoPublishNewsOutcome> {
	const slug = winnerAnnouncementSlug(params.publicationKey);
	const existing = await db
		.prepare("SELECT id FROM site_news WHERE slug = ?")
		.bind(slug)
		.first<{ id: number }>();
	if (existing) return { published: false, skipped: "already_exists" };

	const snapshot = await db
		.prepare(
			`SELECT event_name, event_date, distance, results_json
			 FROM race_event_results
			 WHERE series = ? AND race_id = ? AND event_id = ?
			 LIMIT 1`,
		)
		.bind(params.series, params.raceId, params.eventId)
		.first<{
			event_name: string | null;
			event_date: string | null;
			distance: string | null;
			results_json: string;
		}>();
	if (!snapshot) return { published: false, skipped: "no_results_snapshot" };

	let rows: WinnerAnnouncementRow[];
	try {
		const parsed: unknown = JSON.parse(snapshot.results_json);
		if (!Array.isArray(parsed)) return { published: false, skipped: "unparseable_results" };
		rows = parsed as WinnerAnnouncementRow[];
	} catch {
		return { published: false, skipped: "unparseable_results" };
	}

	const news = buildWinnerAnnouncementNews({
		publicationKey: params.publicationKey,
		eventName: snapshot.event_name,
		eventDate: snapshot.event_date,
		distance: snapshot.distance,
		rows,
	});
	if (!news) return { published: false, skipped: "no_winners" };

	await db
		.prepare(
			`INSERT INTO site_news (slug, title, body_html, published_at, kind, created_by)
			 VALUES (?, ?, ?, ?, 'winner_announcement', 'engine:auto-publish')`,
		)
		.bind(news.slug, news.title, news.body_html, new Date().toISOString())
		.run();

	return { published: true, slug: news.slug };
}

// ---------------------------------------------------------------------------
// Race-announced auto-publish (ADR-0012)
//
// Mirror of the winner-announcement flow for the START of the competition
// lifecycle: when the engine first sees a new race event during a lifecycle
// sync, it writes one "new race announced" row into site_news. Creating the
// object starts its public life immediately: name, date, distance, and the
// registration link, factual only. No owner key is needed at this point:
// the owner's explicit sync trigger is the authorization, the write is
// internal to the engine's own D1, nothing is sent externally, and nothing
// is written back to RunSignup.
//
// New events only: race_event_first_seen records every event the engine has
// observed. Events that existed before this feature deployed were backfilled
// into that table, so the first sync after deploy announces nothing
// retroactively. Idempotency is per (series, distance, event_id) via the
// first-seen marker plus a deterministic slug.
//
// kind is 'news' (not a new kind value): the site_news CHECK constraint only
// allows 'news' and 'winner_announcement', and the public site renders every
// kind in the feed without filtering, so a new kind would require a risky
// D1 table rebuild for no rendering benefit. The slug prefix
// 'race-announced-' and created_by 'engine:auto-publish' identify these rows.

export interface RaceAnnouncementInput {
	series: string;
	distance: string;
	raceId: number;
	eventId: number;
	eventName: string | null;
	eventDate: string | null;
	registrationUrl: string | null;
}

export interface RaceAnnouncementNews {
	title: string;
	body_html: string;
	slug: string;
}

export interface RaceAnnouncementOutcome {
	event_id: number;
	published: boolean;
	slug?: string;
	skipped?: string;
}

// Pure: builds the announcement. Always returns an item: every first-seen
// event is announced, with factual fallbacks for missing fields. Nothing is
// invented: only the name, date, distance, and registration link the sync
// actually observed.
export function buildRaceAnnouncementNews(
	input: RaceAnnouncementInput,
): RaceAnnouncementNews {
	const distanceLabel = (input.distance ?? "").trim();
	const eventLabel = (input.eventName ?? "").trim() ||
		`NWANA ${distanceLabel || "race"}`;
	const dateLabel = (input.eventDate ?? "").trim();
	const title = `New race announced: ${eventLabel}`;

	const lines: string[] = [];
	lines.push(
		`<p>${escapeNewsHtml(eventLabel)} has been announced` +
			(dateLabel ? ` and is scheduled for ${escapeNewsHtml(dateLabel)}` : "") +
			`.</p>`,
	);
	if (distanceLabel) {
		lines.push(`<p>Distance: ${escapeNewsHtml(distanceLabel)}.</p>`);
	}
	const regUrl = (input.registrationUrl ?? "").trim();
	if (regUrl) {
		lines.push(
			`<p><a href="${escapeNewsHtml(regUrl)}">Race and registration details on RunSignup</a></p>`,
		);
	}
	lines.push(
		`<p>Results, performance levels, and standings are published here as the race completes.</p>`,
	);

	return {
		title,
		body_html: lines.join("\n"),
		slug: raceAnnouncementSlug(input.series, input.distance, input.eventId),
	};
}

export function raceAnnouncementSlug(
	series: string,
	distance: string,
	eventId: number,
): string {
	const safe = `${series}-${distance}-${eventId}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 100);
	return `race-announced-${safe || "news"}`;
}

// Server-side: announces an event the first time the engine sees it.
// Idempotent per (series, distance, event_id).
export async function autoPublishRaceAnnouncedNews(
	db: D1Database,
	params: RaceAnnouncementInput,
): Promise<AutoPublishNewsOutcome> {
	const slug = raceAnnouncementSlug(params.series, params.distance, params.eventId);
	const seen = await db
		.prepare(
			"SELECT event_id FROM race_event_first_seen WHERE series = ? AND distance = ? AND event_id = ?",
		)
		.bind(params.series, params.distance, params.eventId)
		.first<{ event_id: number }>();
	if (seen) return { published: false, skipped: "already_announced" };

	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT OR IGNORE INTO race_event_first_seen
			 (series, distance, race_id, event_id, event_name, event_date, first_seen_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			params.series,
			params.distance,
			params.raceId,
			params.eventId,
			params.eventName,
			params.eventDate,
			now,
		)
		.run();

	const news = buildRaceAnnouncementNews(params);
	await db
		.prepare(
			`INSERT INTO site_news (slug, title, body_html, published_at, kind, created_by)
			 VALUES (?, ?, ?, ?, 'news', 'engine:auto-publish')`,
		)
		.bind(news.slug, news.title, news.body_html, now)
		.run();

	return { published: true, slug: news.slug };
}

// One-shot backfill: marks every event already stored in
// race_event_results as seen, so the first deploy never announces the
// existing events as new. Safe to re-run (INSERT OR IGNORE).
export async function backfillRaceEventFirstSeen(
	db: D1Database,
	seenAt: string,
): Promise<{ marked: number }> {
	const result = await db
		.prepare(
			`INSERT OR IGNORE INTO race_event_first_seen
			 (series, distance, race_id, event_id, event_name, event_date, first_seen_at)
			 SELECT series, distance, race_id, event_id, event_name, event_date, ?
			 FROM race_event_results`,
		)
		.bind(seenAt)
		.run();
	const changes = (result as { meta?: { changes?: unknown } }).meta?.changes;
	return { marked: typeof changes === "number" ? changes : 0 };
}

// ---------------------------------------------------------------------------
// Next-race promo auto-publish (ADR-0013)
//
// Mirror of the winner-announcement flow for the END of the competition
// lifecycle: when a result publication is confirmed with an explicit PUBLISH,
// the engine also writes one "next race" promo row into site_news. The
// publication celebrates the past; the promo points the reader at the
// future: the next not-yet-run event of the same series and distance, by
// date. This closes the publication -> next event loop: every published
// result advertises the next registration. Internal D1 writes only; the
// owner's explicit PUBLISH confirmation is the authorization; nothing is
// sent externally and nothing is written back to RunSignup.
//
// kind is 'news' (same choice as ADR-0012): the site_news CHECK constraint
// only allows 'news' and 'winner_announcement', and a promo is not a winner
// announcement. The slug prefix 'next-race-' and created_by
// 'engine:auto-publish' identify these rows. Idempotency is per publication
// key via a deterministic slug. When there is no upcoming event, nothing is
// written and the publish response reports the skip reason.

export interface NextRacePromoInput {
	publicationKey: string;
	series: string;
	raceId: number;
	eventId: number;
	// YYYY-MM-DD "today" for the past/future comparison; defaults to today
	// UTC. Tests pass this explicitly so they do not depend on the clock.
	nowDate?: string;
}

export interface NextRacePromoDetails {
	eventId: number;
	eventName: string | null;
	eventDate: string | null;
	distance: string;
	registrationUrl: string | null;
}

export interface NextRacePromoNews {
	title: string;
	body_html: string;
	slug: string;
}

// Normalizes the date formats the engine stores into YYYY-MM-DD so a
// past/future comparison never depends on RunSignup's format. This is the
// same logic as normalizeRunSignupDate in race-lifecycle.ts, duplicated
// here because that module imports this one (a shared import would be
// circular).
function normalizePromoEventDate(value: string | null): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
	if (usMatch) {
		const month = Number(usMatch[1]);
		const day = Number(usMatch[2]);
		const year = Number(usMatch[3]);
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	}
	const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
	if (isoMatch) {
		const month = Number(isoMatch[2]);
		const day = Number(isoMatch[3]);
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
	}
	return null;
}

// Pure: builds the promo. Factual only: name, date, distance, and the
// registration link the lifecycle sync observed, nothing invented.
export function buildNextRacePromoNews(input: {
	publicationKey: string;
	next: NextRacePromoDetails;
}): NextRacePromoNews {
	const distanceLabel = (input.next.distance ?? "").trim();
	const eventLabel =
		(input.next.eventName ?? "").trim() || `NWANA ${distanceLabel || "race"}`;
	const dateLabel = (input.next.eventDate ?? "").trim();
	const title = `Next race: ${eventLabel}`;

	const lines: string[] = [];
	lines.push(
		`<p>The next ${escapeNewsHtml(eventLabel)}` +
			(dateLabel ? ` is scheduled for ${escapeNewsHtml(dateLabel)}` : " is coming up") +
			`.</p>`,
	);
	if (distanceLabel) {
		lines.push(`<p>Distance: ${escapeNewsHtml(distanceLabel)}.</p>`);
	}
	const regUrl = (input.next.registrationUrl ?? "").trim();
	if (regUrl) {
		lines.push(
			`<p><a href="${escapeNewsHtml(regUrl)}">Register on RunSignup</a></p>`,
		);
	}
	lines.push(
		`<p>Results from the latest race are published in the <a href="/results">results section</a>.</p>`,
	);

	return {
		title,
		body_html: lines.join("\n"),
		slug: nextRacePromoSlug(input.publicationKey),
	};
}

export function nextRacePromoSlug(publicationKey: string): string {
	const safe = publicationKey
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 100);
	return `next-race-${safe || "news"}`;
}

// Server-side: promotes the next upcoming not-yet-run event of the same
// series and distance, by date. "Not-yet-run" follows the engine's own
// convention: event_date strictly after today (today counts as past, like
// the results page). Idempotent per publication key.
export async function autoPublishNextRacePromo(
	db: D1Database,
	params: NextRacePromoInput,
): Promise<AutoPublishNewsOutcome> {
	const slug = nextRacePromoSlug(params.publicationKey);
	const existing = await db
		.prepare("SELECT id FROM site_news WHERE slug = ?")
		.bind(slug)
		.first<{ id: number }>();
	if (existing) return { published: false, skipped: "already_exists" };

	// The published event's distance, using the engine's series/distance
	// grouping (race_event_results is keyed by series, distance, event_id).
	const self = await db
		.prepare(
			`SELECT distance FROM race_event_results
			 WHERE series = ? AND race_id = ? AND event_id = ?
			 LIMIT 1`,
		)
		.bind(params.series, params.raceId, params.eventId)
		.first<{ distance: string | null }>();
	const distance = (self?.distance ?? "").trim();
	if (!distance) return { published: false, skipped: "no_results_snapshot" };

	const today = params.nowDate ?? new Date().toISOString().slice(0, 10);
	const candidates = await db
		.prepare(
			`SELECT event_id, event_name, event_date, distance, registration_url
			 FROM race_event_results
			 WHERE series = ? AND distance = ?`,
		)
		.bind(params.series, distance)
		.all<{
			event_id: number;
			event_name: string | null;
			event_date: string | null;
			distance: string;
			registration_url: string | null;
		}>();

	let next: { date: string; row: NextRacePromoDetails } | null = null;
	for (const row of candidates.results) {
		const date = normalizePromoEventDate(row.event_date);
		if (!date || date <= today) continue;
		if (!next || date < next.date) {
			next = {
				date,
				row: {
					eventId: row.event_id,
					eventName: row.event_name,
					eventDate: row.event_date,
					distance: row.distance,
					registrationUrl: row.registration_url,
				},
			};
		}
	}
	if (!next) return { published: false, skipped: "no_upcoming_race" };

	const news = buildNextRacePromoNews({
		publicationKey: params.publicationKey,
		next: next.row,
	});
	await db
		.prepare(
			`INSERT INTO site_news (slug, title, body_html, published_at, kind, created_by)
			 VALUES (?, ?, ?, ?, 'news', 'engine:auto-publish')`,
		)
		.bind(news.slug, news.title, news.body_html, new Date().toISOString())
		.run();

	return { published: true, slug: news.slug };
}
