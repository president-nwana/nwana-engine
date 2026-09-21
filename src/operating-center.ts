type InitiativeInputType =
	| "THOUGHT"
	| "PROBLEM"
	| "OPPORTUNITY"
	| "TASK"
	| "SOURCE_MATERIAL";

type BoardSubmissionType =
	| "QUESTION"
	| "PROPOSAL"
	| "REPORT"
	| "DECISION_REQUEST"
	| "DISCUSSION"
	| "REQUEST_TO_SPEAK";

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
	"PROPOSAL",
	"REPORT",
	"DECISION_REQUEST",
	"DISCUSSION",
	"REQUEST_TO_SPEAK",
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

export async function createBoardSubmission(request: Request, db: D1Database): Promise<Response> {
	const input = validateBoardSubmissionInput(await readBody<BoardSubmissionInput>(request));
	const submissionId = `BOARD-SUB-${crypto.randomUUID()}`;
	const auditId = `AUDIT-${crypto.randomUUID()}`;

	await db.batch([
		db.prepare(`
			INSERT INTO board_submissions (
				submission_id, submission_type, title, description,
				requested_outcome, submitted_by, requested_meeting_date, status
			) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
		`).bind(
			submissionId,
			input.submission_type,
			input.title,
			input.description,
			input.requested_outcome,
			input.submitted_by,
			input.requested_meeting_date,
		),
		db.prepare(`
			INSERT INTO audit_events (audit_id, object_id, action, module, status, details)
			VALUES (?, ?, 'BOARD_SUBMISSION_ADDED', 'BOARD', 'SUCCESS', ?)
		`).bind(auditId, submissionId, JSON.stringify({ submission_type: input.submission_type })),
	]);

	return response({ ok: true, submission_id: submissionId, status: "PENDING" }, 201);
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
			competition_calendar: { available: false, reason: "Verified scheduled-date feed is not connected yet" },
			sponsors: { available: false, reason: "Sponsor pipeline is not connected yet" },
			donations: { available: false, reason: "Donation outcome feed is not connected yet" },
			google_ads: { available: true, endpoint: "/integrations/google-ads/status" },
			meta: { available: true, endpoint: "/integrations/meta/status" },
		},
	});
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
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.stat,.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px}.stat strong{display:block;font-size:30px}.stat span{color:var(--muted)}
		.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:20px}h2{margin:0 0 14px;font-size:22px}label{display:block;margin:12px 0 5px;font-weight:650}input,select,textarea,button{width:100%;font:inherit}input,select,textarea{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white}textarea{min-height:105px;resize:vertical}button{margin-top:14px;border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer}.message{min-height:24px;color:var(--muted);margin-top:9px}.queue{margin-top:20px}.item{border-top:1px solid var(--line);padding:12px 0}.item:first-child{border-top:0}.item strong{display:block}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
	</style>
</head>
<body>
	<header><h1>NWANA Operating Center</h1><p>What is happening, what needs a decision, and what happens next.</p></header>
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
		<section class="grid">
			<form class="panel" id="initiative-form"><h2>Submit an initiative</h2>
				<label for="initiative-type">Input type</label><select id="initiative-type" name="input_type"><option>THOUGHT</option><option>PROBLEM</option><option>OPPORTUNITY</option><option>TASK</option><option>SOURCE_MATERIAL</option></select>
				<label for="initiative-title">Title</label><input id="initiative-title" name="title" required maxlength="200">
				<label for="initiative-description">Thought, task, or material</label><textarea id="initiative-description" name="description" required></textarea>
				<label for="initiative-result">Desired result, if known</label><textarea id="initiative-result" name="desired_result"></textarea>
				<label for="initiative-author">Submitted by</label><input id="initiative-author" name="submitted_by" required>
				<button type="submit">Save initiative</button><div class="message" aria-live="polite"></div>
			</form>
			<form class="panel" id="board-form"><h2>Add a Board item</h2>
				<label for="board-type">Item type</label><select id="board-type" name="submission_type"><option>QUESTION</option><option>PROPOSAL</option><option>REPORT</option><option>DECISION_REQUEST</option><option>DISCUSSION</option><option>REQUEST_TO_SPEAK</option></select>
				<label for="board-title">Title</label><input id="board-title" name="title" required maxlength="200">
				<label for="board-description">Description</label><textarea id="board-description" name="description" required></textarea>
				<label for="board-outcome">Requested outcome</label><textarea id="board-outcome" name="requested_outcome"></textarea>
				<label for="board-author">Board member</label><input id="board-author" name="submitted_by" required>
				<label for="board-date">Requested meeting date</label><input id="board-date" name="requested_meeting_date" type="date">
				<button type="submit">Add to Board queue</button><div class="message" aria-live="polite"></div>
			</form>
		</section>
		<section class="grid queue"><div class="panel"><h2>Initiatives</h2><div id="initiatives">Loading…</div></div><div class="panel"><h2>Board queue</h2><div id="board-items">Loading…</div></div></section>
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
		async function load(){
			const [o,i,b]=await Promise.all([api('/api/operating-center/overview'),api('/api/initiatives'),api('/api/board/submissions')]);
			const labels={active_initiatives:'Active initiatives',pending_board_submissions:'Board items',pending_decisions:'Decisions needed',active_work_items:'Active work',connected_objects:'Connected objects',published_results:'Published results'};
			document.querySelector('#stats').innerHTML=Object.entries(o.counts).map(([k,v])=>'<div class="stat"><strong>'+esc(v)+'</strong><span>'+esc(labels[k]||k)+'</span></div>').join('');
			document.querySelector('#initiatives').innerHTML=i.initiatives.length?i.initiatives.map(x=>'<div class="item"><strong>'+esc(x.title)+'</strong><div class="meta">'+esc(x.input_type)+' · '+esc(x.submitted_by)+' · '+esc(x.status)+'</div></div>').join(''):'<div class="unavailable">No initiatives yet.</div>';
			document.querySelector('#board-items').innerHTML=b.submissions.length?b.submissions.map(x=>'<div class="item"><strong>'+esc(x.title)+'</strong><div class="meta">'+esc(x.submission_type)+' · '+esc(x.submitted_by)+' · '+esc(x.status)+'</div></div>').join(''):'<div class="unavailable">No pending Board items.</div>';
		}
		function renderLoadError(err){document.querySelector('#stats').innerHTML='<div class="stat"><strong>Unavailable</strong><span>'+esc(err.message)+'</span></div>'}
		for(const [id,path] of [['initiative-form','/api/initiatives'],['board-form','/api/board/submissions']])document.querySelector('#'+id).addEventListener('submit',async e=>{e.preventDefault();const m=e.currentTarget.querySelector('.message');m.textContent='Saving…';try{await api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(formJson(e.currentTarget))});e.currentTarget.reset();m.textContent='Saved.';await load()}catch(err){m.textContent=err.message}});
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();load().catch(renderLoadError)});
		if(getKey()){showApp();load().catch(renderLoadError)}else{showGate('')}
	</script>
</body></html>`;
}
