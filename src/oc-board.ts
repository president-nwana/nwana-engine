// Board section of the Operating Center.
//
// Five functions, each with a 1-2 line human description and three separate
// views (Summary / Actions / Details), deep-linkable as
// /operating-center/board?tab=<function>&view=<summary|actions|details>.
// View routing comes from ocViewScript("boa", [...]) appended below; the
// shell calls boot_<tabid>() per tab, which routes lazily to
// boot_<tabid>_<view>().
//
// All former screens' functionality is preserved, redistributed across the
// views per the approved Marketing pattern:
//   - "Board"     (id board):     pre-meeting digest (Summary); Submit-to-
//                                the-Board intake, schedule-a-meeting, and the
//                                meeting workspace open/agenda/close (Actions);
//                                board queue + full meetings list (Details).
//   - "Meetings"  (id meetings):  external + board meeting overviews. The
//                                external-meetings endpoint is GET-only, so
//                                Actions holds honest notes, not fake buttons.
//                                reportId "meetings" is preserved so
//                                /api/operating-center/report/meetings keeps
//                                working.
//   - "Uploads"   (id uploads):   upload count + latest routed file (Summary);
//                                upload form (Actions); full routed list with
//                                staged contacts CSV links (Details).
//   - "Decisions" (id decisions): recent decisions (Summary);
//                                record-a-decision form with agenda-item select
//                                from open meetings (Actions); full decisions
//                                list (Details).
//   - "Work items"(id workitems): status counts + overdue (Summary);
//                                per-item stage advance with blocker prompt
//                                (Actions); full work item table (Details).
//
// The shell owns the owner-key gate and the global esc()/api()/getKey()
// helpers; this file declares none of those. All top-level script names use
// the b_/bdec_/bwi_/bup_/b_meet_ prefixes or boa-ids so nothing collides
// across the section page. Operating cost: $0 (static HTML/JS; on-demand
// reads, no polling).

import { ocFunction, ocSectionShell, ocViewScript } from "./oc-shell";

// ---------------------------------------------------------------------------
// Tab 1: Board
// ---------------------------------------------------------------------------

const BOARD_SUMMARY_HTML = `<section class="panel"><h2>Board summary</h2>
	<p class="meta">State of NWANA before the meeting: what the Board decided, what is done, what is overdue, and what needs the next decision. Live data from the Board digest.</p>
	<div id="b-board-sum">Loading…</div></section>`;

const BOARD_ACTIONS_HTML = `<section class="panel"><h2>Submit to the Board</h2>
	<p class="meta"><strong>Machine (automatic):</strong> forms the meeting protocol from the queue during the week, schedules the next meeting automatically, and returns unresolved agenda items to the queue when a meeting closes. <strong>Owner (manual):</strong> the forms and the meeting workspace below.</p>
	<form id="b-board-intake-form"><h3 style="margin:0 0 8px;font-size:18px">New item</h3>
		<p class="meta">One intake for everything: a question, an initiative, a proposal, a thought, a problem, an opportunity, a task, a report, or a request to speak. Items without a requested meeting date join the nearest upcoming meeting protocol automatically.</p>
		<label for="b-board-type">Item type</label><select id="b-board-type" name="submission_type"><option>QUESTION</option><option>INITIATIVE</option><option>PROPOSAL</option><option>THOUGHT</option><option>PROBLEM</option><option>OPPORTUNITY</option><option>TASK</option><option>DISCUSSION</option><option>REPORT</option><option>DECISION_REQUEST</option><option>REQUEST_TO_SPEAK</option><option>SOURCE_MATERIAL</option></select>
		<label for="b-board-title">Title</label><input id="b-board-title" name="title" required maxlength="200">
		<label for="b-board-description">Description</label><textarea id="b-board-description" name="description" required></textarea>
		<label for="b-board-outcome">Requested outcome or desired result</label><textarea id="b-board-outcome" name="requested_outcome"></textarea>
		<label for="b-board-author">Board member</label><input id="b-board-author" name="submitted_by" required>
		<label for="b-board-date">Requested meeting date (optional)</label><input id="b-board-date" name="requested_meeting_date" type="date">
		<button type="submit">Submit to the Board</button><div class="message" aria-live="polite"></div>
	</form></section>
	<section class="panel"><h2>Meeting workspace</h2>
	<p class="meta">The weekly meeting loop. Stages: Draft → Open → Closed. Open a meeting, add pending items to the agenda, close it with minutes. Record each decision with a responsible person and a due date — a confirmed decision immediately becomes tracked work.</p>
	<div id="b-board-act-next" style="margin-bottom:16px">Loading…</div>
	<div id="b-board-act-meetings">Loading…</div>
	<div id="b-board-act-detail" style="margin-top:16px"></div>
	<form id="b-board-meet-form" style="margin-top:16px">
		<h3 style="margin:0 0 8px;font-size:18px">Schedule a meeting</h3>
		<label for="b-board-meet-title">Meeting title</label><input id="b-board-meet-title" name="title" required maxlength="200" placeholder="Weekly Board meeting">
		<label for="b-board-meet-date">Scheduled date</label><input id="b-board-meet-date" name="scheduled_for" type="date">
		<button type="submit">Create meeting</button>
		<div class="message" id="b-board-meet-message" aria-live="polite"></div>
	</form></section>`;

const BOARD_DETAILS_HTML = `<section class="panel"><h2>Board queue</h2><div id="b-board-det-queue">Loading…</div><p class="meta">Submissions join the nearest upcoming meeting protocol automatically.</p></section>
	<section class="panel"><h2>All board meetings</h2><div id="b-board-det-meetings">Loading…</div></section>`;

const BOARD_SCRIPT = `
	function b_formJson(form){
		const fd=new FormData(form);
		const obj={};
		for(const pair of fd){obj[pair[0]]=String(pair[1]);}
		return obj;
	}
	async function b_board_fetchDigest(){
		return await api('/api/board/digest');
	}
	async function b_board_refreshSummary(){
		try{if(window.__boaBootedViews&&window.__boaBootedViews['board:summary'])await boot_board_summary();}catch(e){}
	}
	async function boot_board_summary(){
		const box=document.querySelector('#b-board-sum');
		try{
			const d=await b_board_fetchDigest();
			const m=d.upcoming_meeting;
			const sec=function(title,body){return '<h3>'+esc(title)+'</h3>'+(body||'<div class="unavailable">None.</div>')};
			const meetingHtml=m
				?'<div class="item"><strong>'+esc(m.title)+'</strong><div class="meta">'+esc(m.scheduled_for||'unscheduled')+' · '+esc(m.status)+(m.protocol_formed_at?' · protocol formed':' · protocol not formed yet')+'</div><div class="meta">Cadence: '+esc(d.cadence.weekday)+' '+esc(d.cadence.time)+' ('+esc(d.cadence.timezone)+')</div></div>'
				:'<div class="unavailable">No upcoming meeting.</div>';
			const subs=(d.open_submissions||[]).map(function(s){return '<div class="item"><strong>'+esc(s.title)+'</strong><div class="meta">'+esc(s.submission_type)+' · '+esc(s.submitted_by||'—')+'</div></div>'}).join('');
			const agenda=(d.agenda||[]).map(function(a){return '<div class="item"><strong>'+esc(a.title)+'</strong><div class="meta">'+esc(a.status)+(a.preexisting?' · on the agenda since before this meeting was created':'')+'</div></div>'}).join('');
			const decisions=(d.recent_decisions||[]).map(function(x){return '<div class="item"><strong>'+esc(x.submission_title||x.decision_text)+'</strong><div class="meta">'+esc(x.outcome||'')+(x.responsible_person?' · '+esc(x.responsible_person):'')+(x.due_date?' · due '+esc(x.due_date):'')+'</div></div>'}).join('');
			const overdue=(d.overdue_work||[]).map(function(w){return '<div class="item"><strong>'+esc(w.title)+'</strong><div class="meta">'+esc(w.status)+' · due '+esc(w.due_date||'—')+(w.assigned_to?' · '+esc(w.assigned_to):'')+'</div></div>'}).join('');
			const blocked=(d.blocked_work||[]).map(function(w){return '<div class="item"><strong>'+esc(w.title)+'</strong><div class="meta">Blocked'+(w.blocker?': '+esc(w.blocker):'')+'</div></div>'}).join('');
			const attn=[];
			if(!m)attn.push('No upcoming meeting is scheduled.');
			if((d.open_submissions||[]).length)attn.push((d.open_submissions||[]).length+' submission(s) awaiting triage.');
			if((d.overdue_work||[]).length)attn.push((d.overdue_work||[]).length+' overdue work item(s).');
			if((d.blocked_work||[]).length)attn.push((d.blocked_work||[]).length+' blocked work item(s).');
			box.innerHTML=
				sec('Upcoming meeting',meetingHtml)+
				sec('Submissions awaiting triage ('+(d.open_submissions||[]).length+')',subs)+
				sec('Agenda ('+(d.agenda||[]).length+')',agenda)+
				sec('Recent Board decisions',decisions)+
				sec('Overdue work ('+(d.overdue_work||[]).length+')',overdue)+
				sec('Blocked work ('+(d.blocked_work||[]).length+')',blocked)+
				sec('Needs attention',attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+
				'<h3>What the Machine did</h3><div class="detail">Forms the meeting protocol from the queue during the week, schedules the next meeting automatically, and returns unresolved agenda items to the queue when a meeting closes.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	let b_act_pendingCache=[];
	let b_act_selectedMeetingId=null;
	function b_act_wireForm(box,fid,path){
		const f=box.querySelector('#'+fid);
		if(!f)return;
		f.addEventListener('submit',async function(e){
			e.preventDefault();
			const msg=e.target.querySelector('.message');msg.textContent='Saving…';
			try{
				const fd=b_formJson(e.target);
				if(fid==='b-board-agenda-form'){fd.submission_ids=Array.prototype.map.call(e.target.querySelectorAll('input[name="sid"]:checked'),function(c){return c.value});}
				await api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fd)});
				msg.textContent='Saved.';
				await b_act_loadMeetings();
				if(b_act_selectedMeetingId)await b_act_selectMeeting(b_act_selectedMeetingId);
				await b_board_refreshSummary();
			}catch(err){msg.textContent=err.message}
		});
	}
	function b_act_pickNextMeeting(meetings){
		const today=new Date().toISOString().slice(0,10);
		const open=(meetings||[]).filter(function(m){return m.status==='DRAFT'||m.status==='OPEN'});
		const dated=open.filter(function(m){return m.scheduled_for&&String(m.scheduled_for).slice(0,10)>=today})
			.sort(function(a,b){return String(a.scheduled_for).localeCompare(String(b.scheduled_for))});
		if(dated.length)return dated[0];
		const undated=open.filter(function(m){return !m.scheduled_for});
		if(undated.length)return undated[0];
		return null;
	}
	async function b_act_renderNextMeeting(meetings,cadence){
		const box=document.querySelector('#b-board-act-next');
		const next=b_act_pickNextMeeting(meetings);
		if(!next){box.innerHTML='<div class="unavailable">No upcoming meeting yet. The Machine schedules the next one automatically; use the form below for an extra meeting.</div>';return}
		try{
			const d=await api('/api/board/meetings/'+encodeURIComponent(next.meeting_id));
			const m=d.meeting;
			const agenda=d.agenda||[];
			const pending=(b_act_pendingCache||[]).filter(function(s){return s.status==='PENDING'}).length;
			const label={DRAFT:'Draft',OPEN:'Open',CLOSED:'Closed'};
			let when='';
			if(cadence){const tz=String(cadence.timezone||'').replace('America/','');when=' · '+esc(cadence.weekday)+'s '+esc(cadence.time)+(tz?' '+esc(tz)+' time':'')}
			let html='<div class="item"><strong>Next meeting: '+esc(m.title)+'</strong>'+
				'<div class="meta">'+(m.scheduled_for?esc(String(m.scheduled_for).slice(0,10))+' · ':'')+esc(label[m.status]||m.status)+when+' · protocol: '+agenda.length+' items'+(pending?' · '+pending+' waiting in the queue':'')+'</div>'+
				'<div class="meta" style="margin-top:8px">Protocol (fills during the week):</div>';
			html+=agenda.length?agenda.map(function(a){return '<div class="item"><strong>'+esc(a.title)+'</strong><div class="meta">'+esc(a.submission_type)+' · '+esc(a.submitted_by)+' · '+esc(a.status)+'</div></div>'}).join(''):'<div class="unavailable">No items yet. New submissions join this protocol automatically.</div>';
			html+='<div style="margin-top:8px"><button data-meeting="'+esc(m.meeting_id)+'" style="width:auto">Open meeting workspace</button></div></div>';
			box.innerHTML=html;
			box.querySelectorAll('[data-meeting]').forEach(function(btn){btn.addEventListener('click',function(){b_act_selectMeeting(btn.getAttribute('data-meeting'))})});
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function b_act_loadMeetings(){
		const box=document.querySelector('#b-board-act-meetings');
		try{
			const data=await api('/api/board/meetings');
			let cadence=null;
			try{cadence=(await api('/api/board/cadence')).cadence||null}catch(e){}
			if(!(data.meetings||[]).length){
				box.innerHTML='<div class="unavailable">No meetings yet. Create one below.</div>';
				document.querySelector('#b-board-act-next').innerHTML='<div class="unavailable">No upcoming meeting yet. The Machine schedules the next one automatically; use the form below for an extra meeting.</div>';
				return;
			}
			const label={DRAFT:'Draft',OPEN:'Open',CLOSED:'Closed'};
			box.innerHTML=data.meetings.map(function(m){return '<div class="item"><strong>'+esc(m.title)+'</strong>'+
				'<div class="meta">'+(m.scheduled_for?esc(String(m.scheduled_for).slice(0,10))+' · ':'')+esc(label[m.status]||m.status)+' · agenda '+(m.agenda_count||0)+' · decisions '+(m.decision_count||0)+'</div>'+
				'<div><button data-meeting="'+esc(m.meeting_id)+'" style="width:auto">Open workspace</button></div></div>'}).join('');
			box.querySelectorAll('[data-meeting]').forEach(function(btn){btn.addEventListener('click',function(){b_act_selectMeeting(btn.getAttribute('data-meeting'))})});
			await b_act_renderNextMeeting(data.meetings,cadence);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function b_act_selectMeeting(id){
		b_act_selectedMeetingId=id;
		const box=document.querySelector('#b-board-act-detail');
		box.innerHTML='Loading…';
		try{
			const d=await api('/api/board/meetings/'+encodeURIComponent(id));
			const m=d.meeting;
			const label={DRAFT:'Draft',OPEN:'Open',CLOSED:'Closed'};
			let html='<div class="item"><strong>'+esc(m.title)+'</strong><div class="meta">'+esc(label[m.status]||m.status)+(m.scheduled_for?' · '+esc(String(m.scheduled_for).slice(0,10)):'')+(m.attendees?' · attendees: '+esc(m.attendees):'')+'</div></div>';
			if(m.status==='DRAFT'){
				html+='<form id="b-board-open-form"><label>Attendees (as written by the owner)</label><input name="attendees" maxlength="500" placeholder="Names of attendees"><button type="submit" style="width:auto">Open meeting</button><div class="message" aria-live="polite"></div></form>';
			}
			if(m.status==='DRAFT'||m.status==='OPEN'){
				const pend=b_act_pendingCache.filter(function(s){return s.status==='PENDING'});
				html+='<h3 style="margin:16px 0 8px;font-size:18px">Add to agenda</h3>';
				html+=pend.length?'<form id="b-board-agenda-form">'+pend.map(function(s){return '<label style="font-weight:400"><input type="checkbox" name="sid" value="'+esc(s.submission_id)+'" style="width:auto"> '+esc(s.title)+' <span class="meta">('+esc(s.submission_type)+' · '+esc(s.submitted_by)+')</span></label>'}).join('')+'<button type="submit" style="width:auto">Add selected to agenda</button><div class="message" aria-live="polite"></div></form>':'<div class="unavailable">No pending items in the queue.</div>';
			}
			html+='<h3 style="margin:16px 0 8px;font-size:18px">Agenda</h3>';
			html+=(d.agenda||[]).length?(d.agenda||[]).map(function(a){return '<div class="item"><strong>'+esc(a.title)+'</strong><div class="meta">'+esc(a.submission_type)+' · '+esc(a.submitted_by)+' · '+esc(a.status)+'</div>'+(a.requested_outcome?'<div class="meta">Requested outcome: '+esc(a.requested_outcome)+'</div>':'')+'</div>'}).join(''):'<div class="unavailable">Agenda is empty.</div>';
			if(m.status==='OPEN'){
				html+='<h3 style="margin:16px 0 8px;font-size:18px">Close meeting</h3><form id="b-board-close-form"><label>Minutes</label><textarea name="minutes"></textarea><button type="submit" style="width:auto">Close meeting</button><div class="message" aria-live="polite"></div></form>';
			}
			if(m.minutes){html+='<h3 style="margin:16px 0 8px;font-size:18px">Minutes</h3><div class="meta">'+esc(m.minutes)+'</div>'}
			box.innerHTML=html;
			const mid='/api/board/meetings/'+encodeURIComponent(b_act_selectedMeetingId);
			b_act_wireForm(box,'b-board-open-form',mid+'/open');
			b_act_wireForm(box,'b-board-agenda-form',mid+'/agenda');
			b_act_wireForm(box,'b-board-close-form',mid+'/close');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function b_act_refreshCache(){
		try{const b=await api('/api/board/submissions');b_act_pendingCache=b.submissions||[];}catch(e){b_act_pendingCache=[]}
	}
	function b_act_wireTopForm(id,path){
		const f=document.querySelector('#'+id);
		if(!f)return;
		f.addEventListener('submit',async function(e){
			e.preventDefault();
			const m=e.currentTarget.querySelector('.message');m.textContent='Saving…';
			try{
				await api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b_formJson(e.currentTarget))});
				e.currentTarget.reset();m.textContent='Saved.';
				await b_act_refreshCache();
				await b_act_loadMeetings();
				await b_board_refreshSummary();
			}catch(err){m.textContent=err.message}
		});
	}
	async function boot_board_actions(){
		await b_act_refreshCache();
		b_act_wireTopForm('b-board-intake-form','/api/board/submissions');
		b_act_wireTopForm('b-board-meet-form','/api/board/meetings');
		await b_act_loadMeetings();
	}
	async function boot_board_details(){
		const q=document.querySelector('#b-board-det-queue');
		try{
			const data=await api('/api/board/submissions');
			const subs=data.submissions||[];
			q.innerHTML=subs.length?subs.map(function(s){
				return '<div class="item"><strong>'+esc(s.title)+'</strong><div class="meta">'+esc(s.submission_type)+' · '+esc(s.submitted_by||'—')+' · '+esc(s.status)+'</div>'+(s.description?'<div class="detail">'+esc(s.description)+'</div>':'')+(s.requested_outcome?'<div class="meta">Requested outcome: '+esc(s.requested_outcome)+'</div>':'')+'</div>';
			}).join(''):'<div class="unavailable">No submissions in the board queue.</div>';
		}catch(err){q.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		const mb=document.querySelector('#b-board-det-meetings');
		try{
			const data=await api('/api/board/meetings');
			const ms=data.meetings||[];
			const label={DRAFT:'Draft',OPEN:'Open',CLOSED:'Closed'};
			mb.innerHTML=ms.length?ms.map(function(m){
				return '<div class="item"><strong>'+esc(m.title)+'</strong><div class="meta">'+(m.scheduled_for?esc(String(m.scheduled_for).slice(0,10))+' · ':'')+esc(label[m.status]||m.status)+' · agenda '+(m.agenda_count||0)+' · decisions '+(m.decision_count||0)+'</div>'+(m.minutes?'<div class="detail">Minutes recorded.</div>':'')+'</div>';
			}).join(''):'<div class="unavailable">No meetings yet.</div>';
		}catch(err){mb.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const BOARD_PANELS = ocFunction(
	"board",
	"Board governance — the pre-meeting digest, the submissions intake, and the meeting workspace. The Machine keeps the meeting loop running; the owner submits items and runs the meeting.",
	BOARD_SUMMARY_HTML,
	BOARD_ACTIONS_HTML,
	BOARD_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// Tab 2: Meetings
// ---------------------------------------------------------------------------

const MEETINGS_SUMMARY_HTML = `<section class="panel"><h2>Meetings summary</h2>
	<p class="meta">What is coming up and what happened — external meetings from the registry and board meetings. Live data.</p>
	<h3>Upcoming external meetings</h3><div id="b-meet-sum-ext">Loading…</div>
	<h3>Upcoming board meetings</h3><div id="b-meet-sum-board">Loading…</div></section>`;

const MEETINGS_ACTIONS_HTML = `<section class="panel"><h2>Meetings actions</h2>
	<p class="meta"><strong>Machine (automatic):</strong> nothing here runs automatically. <strong>Owner (manual):</strong> the options below.</p>
	<div class="item"><strong>External meetings</strong><div class="detail">Read from the registry; the API exposes no add, edit, or cancel endpoint, so there is no manual action to wire up here. To track a new external meeting, add it to the registry first.</div></div>
	<div class="item"><strong>Schedule a board meeting</strong><div class="detail">Board meetings are scheduled in the Board function, where the owner runs the meeting loop.</div><div style="margin-top:8px"><button type="button" class="secondary" id="b-meet-act-goto-board">Open Board → Actions</button></div></div></section>`;

const MEETINGS_DETAILS_HTML = `<section class="panel"><h2>External meetings</h2><div id="b-meet-det-ext">Loading…</div></section>
	<section class="panel"><h2>Board meetings</h2><h3>Upcoming</h3><div id="b-meet-det-board-up">Loading…</div><h3>Past</h3><div id="b-meet-det-board-past">Loading…</div></section>`;

const MEETINGS_SCRIPT = `
	function b_meet_extRow(m){
		const badge=m.status==='confirmed'?'<span class="badge">'+esc(m.status)+'</span>':'<span class="badge-warn">'+esc(m.status)+'</span>';
		return '<div class="item"><strong>'+esc(m.title)+' '+badge+'</strong>'+
			'<div class="meta">'+esc(m.counterparty)+'</div>'+
			'<div class="detail"><b>When:</b> '+esc(m.display_when)+'</div>'+
			'<div class="detail"><b>Where:</b> '+esc(m.location)+'</div>'+
			'<div class="detail">'+esc(m.purpose)+'</div>'+
			(m.join_url?'<div class="detail"><b>Join:</b> <a href="'+esc(m.join_url)+'" target="_blank" rel="noopener">Open meeting link</a>'+(m.join_access?' · '+esc(m.join_access):'')+'</div>':'')+
			(m.next_step?'<div class="detail"><b>Next:</b> '+esc(m.next_step)+'</div>':'')+'</div>';
	}
	function b_meet_boardUpRow(m){
		const label=m.status==='DRAFT'?'draft':(m.status==='OPEN'?'open':String(m.status||'').toLowerCase());
		return '<div class="item"><strong>'+esc(m.title)+'<span class="badge">'+esc(label)+'</span></strong>'+
			'<div class="detail"><b>When:</b> '+esc(m.scheduled_for||'Not scheduled')+'</div>'+
			'<div class="detail"><b>Agenda items:</b> '+esc(m.agenda_count)+'</div></div>';
	}
	function b_meet_boardPastRow(m){
		const minutes=m.minutes_present?'recorded':'not recorded';
		return '<div class="item"><strong>'+esc(m.title)+'<span class="badge">done</span></strong>'+
			'<div class="detail"><b>Date:</b> '+esc(m.scheduled_for||String(m.closed_at||'').slice(0,10)||'Unknown')+'</div>'+
			'<div class="detail"><b>Minutes:</b> '+esc(minutes)+'</div>'+
			'<div class="detail"><b>Decisions:</b> '+esc(m.decision_count)+'</div></div>';
	}
	async function b_meet_fetchOverview(){
		return await api('/api/operating-center/meetings/overview');
	}
	async function boot_meetings_summary(){
		const ex=document.querySelector('#b-meet-sum-ext');
		const bb=document.querySelector('#b-meet-sum-board');
		try{
			const data=await b_meet_fetchOverview();
			const exts=data.external_meetings||[];
			ex.innerHTML=exts.length?exts.slice(0,5).map(b_meet_extRow).join(''):'<div class="unavailable">No external meetings tracked.</div>';
			const up=data.board_upcoming||[];
			bb.innerHTML=up.length?up.slice(0,5).map(b_meet_boardUpRow).join(''):'<div class="unavailable">No upcoming board meetings (draft or open).</div>';
		}catch(err){
			ex.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
			bb.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
		}
	}
	async function boot_meetings_actions(){
		const btn=document.querySelector('#b-meet-act-goto-board');
		if(btn)btn.addEventListener('click',function(){__boaSetView('board','actions',true)});
	}
	async function boot_meetings_details(){
		const ex=document.querySelector('#b-meet-det-ext');
		const bup=document.querySelector('#b-meet-det-board-up');
		const bpast=document.querySelector('#b-meet-det-board-past');
		try{
			const data=await b_meet_fetchOverview();
			const exts=data.external_meetings||[];
			ex.innerHTML=exts.length?exts.map(b_meet_extRow).join(''):'<div class="unavailable">No external meetings tracked.</div>';
			const up=data.board_upcoming||[];
			bup.innerHTML=up.length?up.map(b_meet_boardUpRow).join(''):'<div class="unavailable">No upcoming board meetings (draft or open).</div>';
			const past=data.board_past||[];
			bpast.innerHTML=past.length?past.map(b_meet_boardPastRow).join(''):'<div class="unavailable">No board meetings recorded yet.</div>';
		}catch(err){
			ex.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
			bup.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
			bpast.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
		}
	}
`;

const MEETINGS_PANELS = ocFunction(
	"meetings",
	"Board and external meetings — what is on the calendar and what happened. External meetings come from the registry (read-only); board meetings are scheduled in the Board function.",
	MEETINGS_SUMMARY_HTML,
	MEETINGS_ACTIONS_HTML,
	MEETINGS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// Tab 3: Uploads
// ---------------------------------------------------------------------------

const UPLOADS_SUMMARY_HTML = `<section class="panel"><h2>Uploads summary</h2>
	<p class="meta">Live count of files the Machine routed, and the latest routed file.</p>
	<div id="b-up-sum">Loading…</div></section>`;

const UPLOADS_ACTIONS_HTML = `<section class="panel"><h2>Upload a file</h2>
	<p class="meta"><strong>Machine (automatic):</strong> classifies and routes the file, and stages contacts CSVs for manual import. <strong>Owner (manual):</strong> upload below, then import the staged CSV by hand in RunSignup Email Marketing.</p>
	<form id="bup-form" enctype="multipart/form-data" style="margin-bottom:12px">
		<label for="bup-name">Your name</label>
		<input id="bup-name" name="uploaded_by" required maxlength="120" placeholder="Who is uploading">
		<label for="bup-file">File</label>
		<input id="bup-file" name="file" type="file" required accept=".csv,.txt,.md,.tsv,.json">
		<button type="submit">Upload and route</button>
		<div class="message" id="bup-message" aria-live="polite"></div>
	</form></section>`;

const UPLOADS_DETAILS_HTML = `<section class="panel"><h2>Routed uploads</h2><div id="b-up-det-list">Loading…</div></section>`;

const UPLOADS_SCRIPT = `
	function bup_upRow(u){
		return '<div class="item"><strong>'+esc(u.filename)+'</strong><div class="meta">'+esc(u.route_label)+' · '+esc(u.classification)+' · '+esc(u.uploaded_by||'unknown')+' · '+esc(u.created_at)+'</div>'+(u.staged_csv_url?'<div class="meta"><a href="'+esc(u.staged_csv_url)+'">Download staged contacts CSV</a> (import by hand in RunSignup Email Marketing)</div>':'')+'</div>';
	}
	async function bup_fetchUploads(){
		return await api('/api/operating-center/uploads');
	}
	async function bup_loadDetails(){
		const box=document.querySelector('#b-up-det-list');
		try{
			const data=await bup_fetchUploads();
			const ups=data.uploads||[];
			box.innerHTML=ups.length?ups.map(bup_upRow).join(''):'<div class="unavailable">No uploads yet.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_uploads_summary(){
		const box=document.querySelector('#b-up-sum');
		try{
			const data=await bup_fetchUploads();
			const ups=data.uploads||[];
			let html='<div class="item"><strong>Files routed</strong><div class="detail">'+ups.length+' file(s) routed by the Machine.</div></div>';
			if(ups.length){
				const u=ups[0];
				html+='<div class="item"><strong>Latest routed file</strong><div class="detail">'+esc(u.filename)+' · '+esc(u.route_label)+' · '+esc(u.classification)+'</div><div class="meta">Uploaded by '+esc(u.uploaded_by||'unknown')+' · '+esc(u.created_at)+'</div></div>';
			}else{
				html+='<div class="unavailable">No uploads yet. Upload a file in Actions — the Machine classifies and routes it automatically.</div>';
			}
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Classifies each upload and routes it to its destination; staged contacts CSVs wait for manual import in RunSignup Email Marketing.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_uploads_actions(){
		const f=document.querySelector('#bup-form');
		if(!f)return;
		f.addEventListener('submit',async function(e){
			e.preventDefault();
			const m=document.querySelector('#bup-message');m.textContent='Uploading and routing…';
			try{
				const fd=new FormData(e.target);
				const file=fd.get('file');
				if(file&&file.size>512*1024){m.textContent='File is too large. Maximum 512 KB.';return}
				const res=await fetch('/api/operating-center/uploads',{method:'POST',headers:{authorization:'Bearer '+getKey()},body:fd});
				const data=await res.json();
				if(!res.ok)throw new Error(data.error||'Upload failed');
				m.textContent='Uploaded and routed: '+data.route_label+'.';
				e.target.reset();
				await bup_loadDetails();
				try{if(window.__boaBootedViews&&window.__boaBootedViews['uploads:summary'])await boot_uploads_summary();}catch(x){}
			}catch(err){m.textContent=err.message}
		});
	}
	async function boot_uploads_details(){
		await bup_loadDetails();
	}
`;

const UPLOADS_PANELS = ocFunction(
	"uploads",
	"File intake — upload a file and the Machine classifies and routes it; the staged contacts CSV comes back for manual import into RunSignup Email Marketing.",
	UPLOADS_SUMMARY_HTML,
	UPLOADS_ACTIONS_HTML,
	UPLOADS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// Tab 4: Decisions
// ---------------------------------------------------------------------------

const DECISIONS_SUMMARY_HTML = `<section class="panel"><h2>Decisions summary</h2>
	<p class="meta">The latest Board decisions. A confirmed decision with a responsible person or due date immediately becomes tracked work.</p>
	<div id="b-dec-sum">Loading…</div></section>`;

const DECISIONS_ACTIONS_HTML = `<section class="panel"><h2>Record a decision</h2>
	<p class="meta"><strong>Machine (automatic):</strong> turns a confirmed decision into tracked work. <strong>Owner (manual):</strong> record below — from an open meeting's agenda or as a general decision.</p>
	<form id="b-dec-act-form">
		<label for="b-dec-act-submission">Agenda item (optional)</label><select id="b-dec-act-submission" name="submission_id"><option value="">General decision</option></select>
		<label for="b-dec-act-text">Decision</label><textarea id="b-dec-act-text" name="decision_text" required></textarea>
		<label for="b-dec-act-outcome">Outcome</label><select id="b-dec-act-outcome" name="outcome"><option>CONFIRMED</option><option>DEFERRED</option><option>REJECTED</option></select>
		<label for="b-dec-act-responsible">Responsible person</label><input id="b-dec-act-responsible" name="responsible_person" maxlength="200">
		<label for="b-dec-act-due">Due date</label><input id="b-dec-act-due" name="due_date" type="date">
		<label for="b-dec-act-vote">Vote record (optional)</label><input id="b-dec-act-vote" name="vote_record" maxlength="500">
		<button type="submit" style="width:auto">Record decision</button><div class="message" aria-live="polite"></div>
	</form></section>`;

const DECISIONS_DETAILS_HTML = `<section class="panel"><h2>All decisions</h2><div id="b-dec-det-list">Loading…</div></section>`;

const DECISIONS_SCRIPT = `
	async function bdec_fetchDecisions(){
		const d=await api('/api/board/digest');
		return d.recent_decisions||[];
	}
	function bdec_decRow(x){
		return '<div class="item"><strong>'+esc(x.decision_text)+'</strong><div class="meta">'+esc(x.outcome||'')+(x.submission_title?' · '+esc(x.submission_title):'')+(x.responsible_person?' · '+esc(x.responsible_person):'')+(x.due_date?' · due '+esc(String(x.due_date).slice(0,10)):'')+'</div></div>';
	}
	async function bdec_loadAgendaOptions(){
		const sel=document.querySelector('#b-dec-act-submission');
		if(!sel)return;
		try{
			const data=await api('/api/board/meetings');
			const open=(data.meetings||[]).filter(function(m){return m.status==='OPEN'});
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
	async function boot_decisions_summary(){
		const box=document.querySelector('#b-dec-sum');
		try{
			const dec=await bdec_fetchDecisions();
			let html='<div class="item"><strong>Recent decisions</strong><div class="detail">'+dec.length+' decision(s) recorded.</div></div>';
			html+=dec.length?dec.slice(0,5).map(bdec_decRow).join(''):'<div class="unavailable">No decisions recorded yet.</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">A confirmed decision with a responsible person or due date immediately becomes tracked work in the Work items function.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_decisions_details(){
		const box=document.querySelector('#b-dec-det-list');
		try{
			const dec=await bdec_fetchDecisions();
			box.innerHTML=dec.length?dec.map(bdec_decRow).join(''):'<div class="unavailable">No decisions recorded yet.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_decisions_actions(){
		await bdec_loadAgendaOptions();
		const f=document.querySelector('#b-dec-act-form');
		if(!f)return;
		f.addEventListener('submit',async function(e){
			e.preventDefault();
			const m=e.currentTarget.querySelector('.message');m.textContent='Saving…';
			try{
				await api('/api/board/decisions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b_formJson(e.currentTarget))});
				e.currentTarget.reset();m.textContent='Saved.';
				await bdec_loadAgendaOptions();
				try{if(window.__boaBootedViews&&window.__boaBootedViews['decisions:summary'])await boot_decisions_summary();}catch(x){}
				try{if(window.__boaBootedViews&&window.__boaBootedViews['decisions:details'])await boot_decisions_details();}catch(x){}
			}catch(err){m.textContent=err.message}
		});
	}
`;

const DECISIONS_PANELS = ocFunction(
	"decisions",
	"Board decisions — record a decision from an open meeting or as a general decision; a confirmed decision immediately becomes tracked work.",
	DECISIONS_SUMMARY_HTML,
	DECISIONS_ACTIONS_HTML,
	DECISIONS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// Tab 5: Work items
// ---------------------------------------------------------------------------

const WORKITEMS_SUMMARY_HTML = `<section class="panel"><h2>Work items summary</h2>
	<p class="meta">Live state of tracked work from Board decisions. Stages: READY → IN_PROGRESS → DONE; BLOCKED allowed at any point.</p>
	<div id="b-wi-sum">Loading…</div></section>`;

const WORKITEMS_ACTIONS_HTML = `<section class="panel"><h2>Advance work items</h2>
	<p class="meta"><strong>Machine (automatic):</strong> validates every stage transition. <strong>Owner (manual):</strong> move each item to its next stage below — when you choose BLOCKED you will be asked for the blocker text.</p>
	<div id="b-wi-act">Loading…</div></section>`;

const WORKITEMS_DETAILS_HTML = `<section class="panel"><h2>All work items</h2><div id="b-wi-det">Loading…</div></section>`;

const WORKITEMS_SCRIPT = `
	const bwi_STAGES=['READY','IN_PROGRESS','BLOCKED','DONE'];
	async function bwi_fetchItems(){
		const data=await api('/api/board/work-items');
		return data.work_items||[];
	}
	async function boot_workitems_summary(){
		const box=document.querySelector('#b-wi-sum');
		try{
			const items=await bwi_fetchItems();
			const by={};
			items.forEach(function(w){by[w.status]=(by[w.status]||0)+1});
			const overdue=items.filter(function(w){return w.due_date&&new Date(w.due_date)<new Date()&&w.status!=='DONE'}).length;
			const blocked=items.filter(function(w){return w.status==='BLOCKED'});
			let html='<div class="item"><strong>Active work items: '+items.length+'</strong>';
			html+='<div class="detail">'+(Object.keys(by).length?Object.keys(by).sort().map(function(s){return esc(s)+': '+by[s]}).join(' · '):'none')+'</div>';
			html+='<div class="detail">'+(overdue?'<span class="followup-overdue">'+overdue+' overdue</span>':'No overdue items.')+'</div></div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">A confirmed Board decision with a responsible person or due date automatically becomes a tracked work item here; stages, blockers, and next actions are tracked per item.</div></div>';
			const attn=[];
			if(overdue)attn.push(overdue+' work item(s) overdue — advance or unblock them in Actions.');
			if(blocked.length)attn.push(blocked.length+' blocked: '+blocked.map(function(w){return w.title}).join(', '));
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function bwi_refreshOtherViews(){
		try{if(window.__boaBootedViews&&window.__boaBootedViews['workitems:summary'])await boot_workitems_summary();}catch(x){}
		try{if(window.__boaBootedViews&&window.__boaBootedViews['workitems:details'])await boot_workitems_details();}catch(x){}
	}
	async function boot_workitems_actions(){
		const box=document.querySelector('#b-wi-act');
		try{
			const items=await bwi_fetchItems();
			if(!items.length){box.innerHTML='<div class="unavailable">No active work items. Confirmed Board decisions with a responsible person or due date appear here.</div>';return}
			box.innerHTML='<div class="detail meta"><strong>Owner (manual):</strong> advance each item through its stages. The Machine validates the transition.</div>'+items.map(function(w){
				const wid=esc(w.work_item_id);
				const opts=bwi_STAGES.map(function(s){return '<option value="'+s+'"'+(s===w.status?' selected':'')+'>'+s+'</option>'}).join('');
				return '<div class="item" data-wi="'+wid+'"><strong>'+esc(w.title)+'</strong>'+
					'<div class="meta">Current: '+esc(w.status)+(w.assigned_to?' · '+esc(w.assigned_to):'')+(w.due_date?' · due '+esc(String(w.due_date).slice(0,10)):'')+(w.blocker&&w.status==='BLOCKED'?' · blocker: '+esc(w.blocker):'')+'</div>'+
					'<div class="detail">'+esc(w.next_action||'')+'</div>'+
					'<label>Move to stage</label><select data-stage>'+opts+'</select>'+
					'<div style="margin-top:8px"><button type="button" class="secondary" data-advance>Advance</button></div>'+
					'<div class="message" aria-live="polite"></div></div>';
			}).join('');
			box.querySelectorAll('[data-advance]').forEach(function(btn){
				btn.addEventListener('click',async function(){
					const item=btn.closest('.item');
					const msg=item.querySelector('.message');
					const to=item.querySelector('[data-stage]').value;
					const wid=item.getAttribute('data-wi');
					let blocker='';
					if(to==='BLOCKED'){
						blocker=prompt('What is blocking this item?');
						if(!blocker||!blocker.trim()){msg.textContent='Cancelled: a blocker text is required to move to BLOCKED.';return;}
					}
					msg.textContent='Advancing…';
					try{
						const body={work_item_id:wid,to_status:to};
						if(blocker)body.blocker=blocker.trim();
						const r=await api('/api/board/work-items/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
						msg.textContent='Now '+r.status+'.';
						await bwi_refreshOtherViews();
						await boot_workitems_actions();
					}catch(err){msg.textContent=err.message}
				});
			});
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_workitems_details(){
		const box=document.querySelector('#b-wi-det');
		try{
			const items=await bwi_fetchItems();
			if(!items.length){box.innerHTML='<div class="unavailable">No active work items. Confirmed Board decisions with a responsible person or due date appear here.</div>';return}
			box.innerHTML='<table class="data"><thead><tr><th>Title</th><th>Description</th><th>Status</th><th>Assigned to</th><th>Due</th><th>Blocker</th><th>Outcome</th><th>Next action</th><th>Source</th></tr></thead><tbody>'+
				items.map(function(w){
					const src=(w.meeting_title?esc(w.meeting_title):'')+(w.decision_text?((w.meeting_title?'<br>':'')+esc(String(w.decision_text).slice(0,80))):'');
					return '<tr><td>'+esc(w.title)+'</td><td>'+esc(w.description||'—')+'</td><td>'+esc(w.status)+'</td><td>'+esc(w.assigned_to||'—')+'</td><td>'+esc(w.due_date?String(w.due_date).slice(0,10):'—')+'</td><td>'+esc(w.blocker||'—')+'</td><td>'+esc(w.outcome||'—')+'</td><td>'+esc(w.next_action||'—')+'</td><td>'+(src||'—')+'</td></tr>';
				}).join('')+'</tbody></table>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const WORKITEMS_PANELS = ocFunction(
	"workitems",
	"Tracked work from Board decisions — stage, blocker, and next action per item. The owner advances items through the stages; the Machine validates every transition.",
	WORKITEMS_SUMMARY_HTML,
	WORKITEMS_ACTIONS_HTML,
	WORKITEMS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// View routing (Summary / Actions / Details per function), appended once
// ---------------------------------------------------------------------------

const BOA_VIEW_SCRIPT = ocViewScript("boa", ["board", "meetings", "uploads", "decisions", "workitems"]);

export function renderBoardSectionHtml(): string {
	return ocSectionShell({
		section: "board",
		title: "Board",
		subtitle: "Governance — digest, meetings, uploads, decisions, work items.",
		queryTabs: true,
		tabs: [
			{ id: "board", label: "Board", panelsHtml: BOARD_PANELS, script: BOARD_SCRIPT + BOA_VIEW_SCRIPT },
			{ id: "meetings", label: "Meetings", panelsHtml: MEETINGS_PANELS, script: MEETINGS_SCRIPT, reportId: "meetings" },
			{ id: "uploads", label: "Uploads", panelsHtml: UPLOADS_PANELS, script: UPLOADS_SCRIPT },
			{ id: "decisions", label: "Decisions", panelsHtml: DECISIONS_PANELS, script: DECISIONS_SCRIPT },
			{ id: "workitems", label: "Work items", panelsHtml: WORKITEMS_PANELS, script: WORKITEMS_SCRIPT },
		],
	});
}
