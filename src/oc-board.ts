// Board section of the Operating Center rebuild.
//
// Five tabs, all reusing the former screens' panels and client-side logic:
//  - "Board"    (id board):      pre-meeting digest, Submit-to-the-Board intake,
//                                board queue, meeting workspace (open/agenda/close/
//                                minutes, schedule-a-meeting). From
//                                src/operating-center-board.ts. The record-a-decision
//                                form and the per-meeting decisions list moved to
//                                the Decisions tab (below).
//  - "Meetings" (id meetings):  external meetings + board meeting log. From
//                                MEETINGS_SCRIPT / renderMeetingsHtml in
//                                src/operating-center-screens.ts. reportId "meetings"
//                                preserved so /api/operating-center/report/meetings
//                                keeps working.
//  - "Uploads"  (id uploads):   upload form + routed uploads list + staged
//                                contacts CSV download. From
//                                src/operating-center-uploads.ts.
//  - "Decisions" (id decisions): record-a-decision form + decisions list,
//                                extracted from src/operating-center-board.ts.
//  - "Work items" (id workitems): tracked-work summary (status counts, overdue),
//                                extracted from src/operating-center-board.ts.
//
// The shell owns the owner-key gate and the global esc()/api() helpers; this
// file declares none of those. All top-level script names are prefixed per tab
// so nothing collides across the section page.

import { ocSectionShell } from "./oc-shell";

// ---------------------------------------------------------------------------
// Tab 1: Board
// ---------------------------------------------------------------------------

const BOARD_PANELS = `
	<section class="panel"><h2>Pre-meeting digest</h2>
		<p class="meta">State of NWANA before the meeting: what the Board decided, what is done, what is overdue, and what needs the next decision.</p>
		<div id="digest">Loading…</div>
	</section>
	<section class="panel">
		<form id="board-form"><h2>Submit to the Board</h2>
			<p class="meta">One intake for everything: a question, an initiative, a proposal, a thought, a problem, an opportunity, a task, a report, or a request to speak. Items without a requested meeting date join the nearest upcoming meeting protocol automatically.</p>
			<label for="board-type">Item type</label><select id="board-type" name="submission_type"><option>QUESTION</option><option>INITIATIVE</option><option>PROPOSAL</option><option>THOUGHT</option><option>PROBLEM</option><option>OPPORTUNITY</option><option>TASK</option><option>DISCUSSION</option><option>REPORT</option><option>DECISION_REQUEST</option><option>REQUEST_TO_SPEAK</option><option>SOURCE_MATERIAL</option></select>
			<label for="board-title">Title</label><input id="board-title" name="title" required maxlength="200">
			<label for="board-description">Description</label><textarea id="board-description" name="description" required></textarea>
			<label for="board-outcome">Requested outcome or desired result</label><textarea id="board-outcome" name="requested_outcome"></textarea>
			<label for="board-author">Board member</label><input id="board-author" name="submitted_by" required>
			<label for="board-date">Requested meeting date (optional)</label><input id="board-date" name="requested_meeting_date" type="date">
			<button type="submit">Submit to the Board</button><div class="message" aria-live="polite"></div>
		</form>
	</section>
	<section class="panel"><h2>Board queue</h2><div id="board-items">Loading…</div><p class="meta">Submissions join the nearest upcoming meeting protocol automatically.</p></section>
	<section class="panel"><h2>Board meetings</h2>
		<p class="meta">The weekly meeting loop. New items join the nearest upcoming meeting protocol automatically as they arrive during the week. Stages: Draft → Open → Closed. Record each decision with a responsible person and due date; a confirmed decision immediately becomes tracked work. Unresolved agenda items return to the queue when the meeting closes.</p>
		<div id="next-meeting" style="margin-bottom:16px">Loading…</div>
		<div id="meetings">Loading…</div>
		<div id="meeting-detail" style="margin-top:16px"></div>
		<form id="meeting-create-form" style="margin-top:16px">
			<h3 style="margin:0 0 8px;font-size:18px">Schedule a meeting</h3>
			<label for="meeting-title">Meeting title</label><input id="meeting-title" name="title" required maxlength="200" placeholder="Weekly Board meeting">
			<label for="meeting-date">Scheduled date</label><input id="meeting-date" name="scheduled_for" type="date">
			<button type="submit">Create meeting</button>
			<div class="message" id="meeting-create-message" aria-live="polite"></div>
		</form>
	</section>`;

const BOARD_SCRIPT = `
	function board_formJson(form){return Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,String(v)]))}
	function board_wireForm(box,fid,path,after){
		const f=box.querySelector('#'+fid);
		if(f)f.addEventListener('submit',async e=>{
			e.preventDefault();
			const msg=e.target.querySelector('.message');msg.textContent='Saving…';
			try{
				const fd=board_formJson(e.target);
				if(fid==='agenda-form'){fd.submission_ids=[...e.target.querySelectorAll('input[name="sid"]:checked')].map(c=>c.value)}
				await api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fd)});
				msg.textContent='Saved.';
				if(after)await after();
				await b_selectMeeting(b_selectedMeetingId);
			}catch(err){msg.textContent=err.message}
		});
	}
	let b_pendingSubmissionsCache=[];
	let b_selectedMeetingId=null;
	async function b_loadDigest(){
		const box=document.querySelector('#digest');
		try{
			const d=await api('/api/board/digest');
			const m=d.upcoming_meeting;
			const sec=(title,body)=>'<h3>'+esc(title)+'</h3>'+(body||'<div class="unavailable">None.</div>');
			const meetingHtml=m
				?'<div class="item"><strong>'+esc(m.title)+'</strong><div class="meta">'+esc(m.scheduled_for||'unscheduled')+' · '+esc(m.status)+(m.protocol_formed_at?' · protocol formed':' · protocol not formed yet')+'</div><div class="meta">Cadence: '+esc(d.cadence.weekday)+' '+esc(d.cadence.time)+' ('+esc(d.cadence.timezone)+')</div></div>'
				:'<div class="unavailable">No upcoming meeting.</div>';
			const subs=d.open_submissions.map(s=>'<div class="item"><strong>'+esc(s.title)+'</strong><div class="meta">'+esc(s.submission_type)+' · '+esc(s.submitted_by||'—')+'</div></div>').join('');
			const agenda=d.agenda.map(a=>'<div class="item"><strong>'+esc(a.title)+'</strong><div class="meta">'+esc(a.status)+(a.preexisting?' · on the agenda since before this meeting was created':'')+'</div></div>').join('');
			const decisions=d.recent_decisions.map(x=>'<div class="item"><strong>'+esc(x.submission_title||x.decision_text)+'</strong><div class="meta">'+esc(x.outcome||'')+(x.responsible_person?' · '+esc(x.responsible_person):'')+(x.due_date?' · due '+esc(x.due_date):'')+'</div></div>').join('');
			const overdue=d.overdue_work.map(w=>'<div class="item"><strong>'+esc(w.title)+'</strong><div class="meta">'+esc(w.status)+' · due '+esc(w.due_date||'—')+(w.assigned_to?' · '+esc(w.assigned_to):'')+'</div></div>').join('');
			const blocked=d.blocked_work.map(w=>'<div class="item"><strong>'+esc(w.title)+'</strong><div class="meta">Blocked'+(w.blocker?': '+esc(w.blocker):'')+'</div></div>').join('');
			box.innerHTML=
				sec('Upcoming meeting',meetingHtml)+
				sec('Submissions awaiting triage ('+d.open_submissions.length+')',subs)+
				sec('Agenda ('+d.agenda.length+')',agenda)+
				sec('Recent Board decisions',decisions)+
				sec('Overdue work ('+d.overdue_work.length+')',overdue)+
				sec('Blocked work ('+d.blocked_work.length+')',blocked);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_board(){
		const b=await api('/api/board/submissions');
		b_pendingSubmissionsCache=b.submissions||[];
		const pend=b_pendingSubmissionsCache.filter(s=>s.status==='PENDING');
		document.querySelector('#board-items').innerHTML=pend.length?pend.map(s=>'<div class="item"><strong>'+esc(s.title)+'</strong><div class="meta">'+esc(s.submission_type)+' · '+esc(s.submitted_by)+' · '+esc(s.status)+'</div></div>').join(''):'<div class="unavailable">No pending Board items.</div>';
		let cadence=null;
		try{cadence=(await api('/api/board/cadence')).cadence||null}catch(e){}
		await b_loadMeetings(cadence);
		await b_loadDigest();
	}
	function b_pickNextMeeting(meetings){
		const today=new Date().toISOString().slice(0,10);
		const open=(meetings||[]).filter(m=>m.status==='DRAFT'||m.status==='OPEN');
		const dated=open.filter(m=>m.scheduled_for&&String(m.scheduled_for).slice(0,10)>=today)
			.sort((a,b)=>String(a.scheduled_for).localeCompare(String(b.scheduled_for)));
		if(dated.length)return dated[0];
		const undated=open.filter(m=>!m.scheduled_for);
		if(undated.length)return undated[0];
		return null;
	}
	async function b_renderNextMeeting(meetings,cadence){
		const box=document.querySelector('#next-meeting');
		const next=b_pickNextMeeting(meetings);
		if(!next){box.innerHTML='<div class="unavailable">No upcoming meeting yet. The machine schedules the next one automatically; use the form below for an extra meeting.</div>';return}
		try{
			const d=await api('/api/board/meetings/'+encodeURIComponent(next.meeting_id));
			const m=d.meeting;
			const agenda=d.agenda||[];
			const pending=(b_pendingSubmissionsCache||[]).filter(s=>s.status==='PENDING').length;
			const label={DRAFT:'Draft',OPEN:'Open',CLOSED:'Closed'};
			let when='';
			if(cadence){const tz=String(cadence.timezone||'').replace('America/','');when=' · '+esc(cadence.weekday)+'s '+esc(cadence.time)+(tz?' '+esc(tz)+' time':'')}
			let html='<div class="item"><strong>Next meeting: '+esc(m.title)+'</strong>'+
				'<div class="meta">'+(m.scheduled_for?esc(String(m.scheduled_for).slice(0,10))+' · ':'')+esc(label[m.status]||m.status)+when+' · protocol: '+agenda.length+' items'+(pending?' · '+pending+' waiting in the queue':'')+'</div>'+
				'<div class="meta" style="margin-top:8px">Protocol (fills during the week):</div>';
			html+=agenda.length?agenda.map(a=>'<div class="item"><strong>'+esc(a.title)+'</strong><div class="meta">'+esc(a.submission_type)+' · '+esc(a.submitted_by)+' · '+esc(a.status)+'</div></div>').join(''):'<div class="unavailable">No items yet. New submissions join this protocol automatically.</div>';
			html+='<div style="margin-top:8px"><button data-meeting="'+esc(m.meeting_id)+'" style="width:auto">Open meeting workspace</button></div></div>';
			box.innerHTML=html;
			box.querySelectorAll('[data-meeting]').forEach(btn=>btn.addEventListener('click',()=>b_selectMeeting(btn.dataset.meeting)));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function b_loadMeetings(cadence){
		const box=document.querySelector('#meetings');
		try{
			const data=await api('/api/board/meetings');
			if(!data.meetings.length){box.innerHTML='<div class="unavailable">No meetings yet. Create one below.</div>';document.querySelector('#next-meeting').innerHTML='<div class="unavailable">No upcoming meeting yet. The machine schedules the next one automatically; use the form below for an extra meeting.</div>';return}
			const label={DRAFT:'Draft',OPEN:'Open',CLOSED:'Closed'};
			box.innerHTML=data.meetings.map(m=>'<div class="item"><strong>'+esc(m.title)+'</strong>'+
				'<div class="meta">'+(m.scheduled_for?esc(String(m.scheduled_for).slice(0,10))+' · ':'')+esc(label[m.status]||m.status)+' · agenda '+m.agenda_count+' · decisions '+m.decision_count+'</div>'+
				'<div><button data-meeting="'+esc(m.meeting_id)+'" style="width:auto">Open workspace</button></div></div>').join('');
			box.querySelectorAll('[data-meeting]').forEach(btn=>btn.addEventListener('click',()=>b_selectMeeting(btn.dataset.meeting)));
			await b_renderNextMeeting(data.meetings,cadence);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function b_selectMeeting(id){
		b_selectedMeetingId=id;
		const box=document.querySelector('#meeting-detail');
		box.innerHTML='Loading…';
		try{
			const d=await api('/api/board/meetings/'+encodeURIComponent(id));
			const m=d.meeting;
			const label={DRAFT:'Draft',OPEN:'Open',CLOSED:'Closed'};
			let html='<div class="item"><strong>'+esc(m.title)+'</strong><div class="meta">'+esc(label[m.status]||m.status)+(m.scheduled_for?' · '+esc(String(m.scheduled_for).slice(0,10)):'')+(m.attendees?' · attendees: '+esc(m.attendees):'')+'</div></div>';
			if(m.status==='DRAFT'){
				html+='<form id="meeting-open-form"><label>Attendees (as written by the owner)</label><input name="attendees" maxlength="500" placeholder="Names of attendees"><button type="submit" style="width:auto">Open meeting</button><div class="message" aria-live="polite"></div></form>';
			}
			if(m.status==='DRAFT'||m.status==='OPEN'){
				const pend=b_pendingSubmissionsCache.filter(s=>s.status==='PENDING');
				html+='<h3 style="margin:16px 0 8px;font-size:18px">Add to agenda</h3>';
				html+=pend.length?'<form id="agenda-form">'+pend.map(s=>'<label style="font-weight:400"><input type="checkbox" name="sid" value="'+esc(s.submission_id)+'" style="width:auto"> '+esc(s.title)+' <span class="meta">('+esc(s.submission_type)+' · '+esc(s.submitted_by)+')</span></label>').join('')+'<button type="submit" style="width:auto">Add selected to agenda</button><div class="message" aria-live="polite"></div></form>':'<div class="unavailable">No pending items in the queue.</div>';
			}
			html+='<h3 style="margin:16px 0 8px;font-size:18px">Agenda</h3>';
			html+=d.agenda.length?d.agenda.map(a=>'<div class="item"><strong>'+esc(a.title)+'</strong><div class="meta">'+esc(a.submission_type)+' · '+esc(a.submitted_by)+' · '+esc(a.status)+'</div>'+(a.requested_outcome?'<div class="meta">Requested outcome: '+esc(a.requested_outcome)+'</div>':'')+'</div>').join(''):'<div class="unavailable">Agenda is empty.</div>';
			if(m.status==='OPEN'){
				html+='<h3 style="margin:16px 0 8px;font-size:18px">Close meeting</h3><form id="meeting-close-form"><label>Minutes</label><textarea name="minutes"></textarea><button type="submit" style="width:auto">Close meeting</button><div class="message" aria-live="polite"></div></form>';
			}
			if(m.minutes){html+='<h3 style="margin:16px 0 8px;font-size:18px">Minutes</h3><div class="meta">'+esc(m.minutes)+'</div>'}
			box.innerHTML=html;
			const mid='/api/board/meetings/'+encodeURIComponent(b_selectedMeetingId);
			board_wireForm(box,'meeting-open-form',mid+'/open',b_loadMeetings);
			board_wireForm(box,'agenda-form',mid+'/agenda',b_loadMeetings);
			board_wireForm(box,'meeting-close-form',mid+'/close',b_loadMeetings);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	function b_wireTopForm(id,path){
		document.querySelector('#'+id).addEventListener('submit',async e=>{e.preventDefault();const m=e.currentTarget.querySelector('.message');m.textContent='Saving…';try{await api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(board_formJson(e.currentTarget))});e.currentTarget.reset();m.textContent='Saved.';await boot_board()}catch(err){m.textContent=err.message}});
	}
	b_wireTopForm('board-form','/api/board/submissions');
	b_wireTopForm('meeting-create-form','/api/board/meetings');
`;

// ---------------------------------------------------------------------------
// Tab 2: Meetings (from MEETINGS_SCRIPT / renderMeetingsHtml)
// ---------------------------------------------------------------------------

const MEETINGS_PANELS = `
	<section class="panel">
		<h2>External meetings</h2>
		<div id="meetings-external-list">Loading…</div>
	</section>
	<section class="panel">
		<h2>Board meetings</h2>
		<h3>Upcoming</h3>
		<div id="meetings-board-upcoming">Loading…</div>
		<h3>Past</h3>
		<div id="meetings-board-past">Loading…</div>
	</section>`;

const MEETINGS_SCRIPT = `
	async function boot_meetings(){
		const ext=document.querySelector('#meetings-external-list');
		const bup=document.querySelector('#meetings-board-upcoming');
		const bpast=document.querySelector('#meetings-board-past');
		try{
			const data=await api('/api/operating-center/meetings/overview');
			let html='';
			for(const m of (data.external_meetings||[])){
				const badge=m.status==='confirmed'?'<span class="badge">'+esc(m.status)+'</span>':'<span class="badge-warn">'+esc(m.status)+'</span>';
				html+='<div class="item"><strong>'+esc(m.title)+badge+'</strong>'+
					'<div class="meta">'+esc(m.counterparty)+'</div>'+
					'<div class="detail"><b>When:</b> '+esc(m.display_when)+'</div>'+
					'<div class="detail"><b>Where:</b> '+esc(m.location)+'</div>'+
					'<div class="detail">'+esc(m.purpose)+'</div>'+
					(m.join_url?'<div class="detail"><b>Join:</b> <a href="'+esc(m.join_url)+'" target="_blank" rel="noopener">Open meeting link</a>'+(m.join_access?' · '+esc(m.join_access):'')+'</div>':'')+
					(m.next_step?'<div class="detail"><b>Next:</b> '+esc(m.next_step)+'</div>':'')+'</div>';
			}
			ext.innerHTML=html||'<div class="unavailable">No external meetings tracked.</div>';
			const up=data.board_upcoming||[];
			let upHtml='';
			for(const m of up){
				const label=m.status==='DRAFT'?'draft':(m.status==='OPEN'?'open':m.status.toLowerCase());
				upHtml+='<div class="item"><strong>'+esc(m.title)+'<span class="badge">'+esc(label)+'</span></strong>'+
					'<div class="detail"><b>When:</b> '+esc(m.scheduled_for||'Not scheduled')+'</div>'+
					'<div class="detail"><b>Agenda items:</b> '+esc(m.agenda_count)+'</div></div>';
			}
			bup.innerHTML=up.length?upHtml:'<div class="unavailable">No upcoming board meetings (draft or open).</div>';
			const past=data.board_past||[];
			let pastHtml='';
			for(const m of past){
				const minutes=m.minutes_present?'recorded':'not recorded';
				pastHtml+='<div class="item"><strong>'+esc(m.title)+'<span class="badge">done</span></strong>'+
					'<div class="detail"><b>Date:</b> '+esc(m.scheduled_for||String(m.closed_at||'').slice(0,10)||'Unknown')+'</div>'+
					'<div class="detail"><b>Minutes:</b> '+esc(minutes)+'</div>'+
					'<div class="detail"><b>Decisions:</b> '+esc(m.decision_count)+'</div></div>';
			}
			bpast.innerHTML=past.length?pastHtml:'<div class="unavailable">No board meetings recorded yet.</div>';
		}catch(err){
			ext.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
			bup.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
			bpast.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
		}
	}
`;

// ---------------------------------------------------------------------------
// Tab 3: Uploads (from renderUploadsHtml)
// ---------------------------------------------------------------------------

const UPLOADS_PANELS = `
	<section class="panel">
		<h2>Upload a file</h2>
		<form id="upload-form" enctype="multipart/form-data" style="margin-bottom:12px">
			<label for="upload-name">Your name</label>
			<input id="upload-name" name="uploaded_by" required maxlength="120" placeholder="Who is uploading">
			<label for="upload-file">File</label>
			<input id="upload-file" name="file" type="file" required accept=".csv,.txt,.md,.tsv,.json">
			<button type="submit">Upload and route</button>
			<div class="message" id="upload-message" aria-live="polite"></div>
		</form>
	</section>
	<section class="panel">
		<h2>Routed uploads</h2>
		<div id="uploads-list">Loading…</div>
	</section>`;

const UPLOADS_SCRIPT = `
	async function bup_loadUploads(){
		const box=document.querySelector('#uploads-list');
		try{
			const data=await api('/api/operating-center/uploads');
			if(!data.uploads.length){box.innerHTML='<div class="unavailable">No uploads yet.</div>';return}
			box.innerHTML=data.uploads.map(u=>'<div class="item"><strong>'+esc(u.filename)+'</strong><div class="meta">'+esc(u.route_label)+' · '+esc(u.classification)+' · '+esc(u.uploaded_by||'unknown')+' · '+esc(u.created_at)+'</div>'+(u.staged_csv_url?'<div class="meta"><a href="'+esc(u.staged_csv_url)+'">Download staged contacts CSV</a> (import by hand in RunSignup Email Marketing)</div>':'')+'</div>').join('');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_uploads(){
		await bup_loadUploads();
	}
	document.querySelector('#upload-form').addEventListener('submit',async(e)=>{
		e.preventDefault();
		const m=document.querySelector('#upload-message');m.textContent='Uploading and routing…';
		try{
			const fd=new FormData(e.target);
			const file=fd.get('file');
			if(file&&file.size>512*1024){m.textContent='File is too large. Maximum 512 KB.';return}
			const res=await fetch('/api/operating-center/uploads',{method:'POST',headers:{authorization:'Bearer '+getKey()},body:fd});
			const data=await res.json();
			if(!res.ok)throw new Error(data.error||'Upload failed');
			m.textContent='Uploaded and routed: '+data.route_label+'.';
			e.target.reset();
			await bup_loadUploads();
		}catch(err){m.textContent=err.message}
	});
`;

// ---------------------------------------------------------------------------
// Tab 4: Decisions (record-a-decision form + decisions list, extracted from
// src/operating-center-board.ts)
// ---------------------------------------------------------------------------

const DECISIONS_PANELS = `
	<section class="panel">
		<form id="decision-form"><h2>Record a decision</h2>
			<p class="meta">Record a Board decision against an agenda item of an open meeting, or as a general decision. A confirmed decision immediately becomes tracked work.</p>
			<label for="decision-submission">Agenda item (optional)</label><select id="decision-submission" name="submission_id"><option value="">General decision</option></select>
			<label for="decision-text">Decision</label><textarea id="decision-text" name="decision_text" required></textarea>
			<label for="decision-outcome">Outcome</label><select id="decision-outcome" name="outcome"><option>CONFIRMED</option><option>DEFERRED</option><option>REJECTED</option></select>
			<label for="decision-responsible">Responsible person</label><input id="decision-responsible" name="responsible_person" maxlength="200">
			<label for="decision-due">Due date</label><input id="decision-due" name="due_date" type="date">
			<label for="decision-vote">Vote record (optional)</label><input id="decision-vote" name="vote_record" maxlength="500">
			<button type="submit" style="width:auto">Record decision</button><div class="message" aria-live="polite"></div>
		</form>
	</section>
	<section class="panel"><h2>Decisions</h2><div id="decisions-list">Loading…</div></section>`;

const DECISIONS_SCRIPT = `
	async function bdec_loadAgendaOptions(){
		const sel=document.querySelector('#decision-submission');
		try{
			const data=await api('/api/board/meetings');
			const open=(data.meetings||[]).filter(m=>m.status==='OPEN');
			const opts=[];
			for(const m of open){
				try{
					const d=await api('/api/board/meetings/'+encodeURIComponent(m.meeting_id));
					for(const a of (d.agenda||[])){
						if(a.status==='AGENDA')opts.push('<option value="'+esc(a.submission_id)+'">'+esc(m.title)+' — '+esc(a.title)+'</option>');
					}
				}catch(e){}
			}
			sel.innerHTML='<option value="">General decision</option>'+opts.join('');
		}catch(err){sel.innerHTML='<option value="">General decision</option>'}
	}
	async function bdec_loadDecisions(){
		const box=document.querySelector('#decisions-list');
		try{
			const d=await api('/api/board/digest');
			const dec=d.recent_decisions||[];
			box.innerHTML=dec.length?dec.map(x=>'<div class="item"><strong>'+esc(x.decision_text)+'</strong><div class="meta">'+esc(x.outcome)+(x.submission_title?' · '+esc(x.submission_title):'')+(x.responsible_person?' · '+esc(x.responsible_person):'')+(x.due_date?' · due '+esc(String(x.due_date).slice(0,10)):'')+'</div></div>').join(''):'<div class="unavailable">No decisions recorded yet.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_decisions(){
		await bdec_loadAgendaOptions();
		await bdec_loadDecisions();
	}
	document.querySelector('#decision-form').addEventListener('submit',async e=>{
		e.preventDefault();
		const m=e.currentTarget.querySelector('.message');m.textContent='Saving…';
		try{
			await api('/api/board/decisions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(board_formJson(e.currentTarget))});
			e.currentTarget.reset();m.textContent='Saved.';
			await bdec_loadAgendaOptions();
			await bdec_loadDecisions();
		}catch(err){m.textContent=err.message}
	});
`;

// ---------------------------------------------------------------------------
// Tab 5: Work items (from the work-items panel of
// src/operating-center-board.ts)
// ---------------------------------------------------------------------------

const WORKITEMS_PANELS = `
	<section class="panel"><h2>Work items</h2>
		<p class="meta">Tracked work from Board decisions. Stages: Ready → In progress → Done (Blocked allowed).</p>
		<div id="work-items">Loading…</div>
	</section>`;

const WORKITEMS_SCRIPT = `
	async function bwi_loadWorkItems(){
		const box=document.querySelector('#work-items');
		try{
			const data=await api('/api/board/work-items');
			if(!data.work_items.length){box.innerHTML='<div class="unavailable">No active work items. Confirmed Board decisions with a responsible person or due date appear here.</div>';return}
			const byStatus={};
			data.work_items.forEach(w=>{byStatus[w.status]=(byStatus[w.status]||0)+1});
			const summary=Object.entries(byStatus).map(([s,c])=>esc(s)+': <strong>'+c+'</strong>').join(' · ');
			const overdue=data.work_items.filter(w=>w.due_date && new Date(w.due_date)<new Date() && w.status!=='DONE').length;
			box.innerHTML='<div class="meta">'+summary+'</div>'+(overdue?'<div class="meta" style="color:#a00">'+overdue+' overdue</div>':'')+'<div class="meta">'+data.work_items.length+' active items.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_workitems(){
		await bwi_loadWorkItems();
	}
`;

export function renderBoardSectionHtml(): string {
	return ocSectionShell({
		section: "board",
		title: "Board",
		subtitle: "Governance — digest, meetings, uploads, decisions, work items.",
		tabs: [
			{ id: "board", label: "Board", panelsHtml: BOARD_PANELS, script: BOARD_SCRIPT },
			{ id: "meetings", label: "Meetings", panelsHtml: MEETINGS_PANELS, script: MEETINGS_SCRIPT, reportId: "meetings" },
			{ id: "uploads", label: "Uploads", panelsHtml: UPLOADS_PANELS, script: UPLOADS_SCRIPT },
			{ id: "decisions", label: "Decisions", panelsHtml: DECISIONS_PANELS, script: DECISIONS_SCRIPT },
			{ id: "workitems", label: "Work items", panelsHtml: WORKITEMS_PANELS, script: WORKITEMS_SCRIPT },
		],
	});
}
