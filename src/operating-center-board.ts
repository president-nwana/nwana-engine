// Board workspace page: intake, meetings, work items. The main overview
// shows only a compact summary; the full workspace lives here.

import { operatingCenterMenu } from "./operating-center";

export function renderBoardHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Board workspace — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
		.oc-menu-btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
		.oc-menu-btn:hover{background:#3a7455}.oc-menu-active{background:#fff;color:var(--brand)}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		.nav{margin-bottom:18px}.nav a{color:var(--brand);font-weight:650}
		h2{margin:0 0 14px;font-size:22px}h3{margin:18px 0 8px;font-size:18px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,select,textarea,button{font:inherit;width:100%}
		input,select,textarea{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white}textarea{min-height:120px;resize:vertical}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;margin-top:14px}
		button.secondary{background:white;color:var(--brand);border:1px solid var(--brand);width:auto;margin-right:8px}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:12px 0}.item:first-of-type{border-top:0}.item strong{display:block}
	</style>
</head>
<body>
	<header><h1>Board workspace</h1><p>Submissions, the weekly Sunday protocol, meeting minutes, decisions, and tracked work. The machine forms the protocol from submissions; the board decides; confirmed decisions become tracked work.</p></header>
	${operatingCenterMenu("board")}
	<main>
		<div class="nav"><a href="/operating-center">← Back to Operating Center</a></div>
		<section class="panel" id="gate" hidden>
			<h2>Owner access</h2>
			<p class="unavailable">This page is private. Enter the operating center key to continue.</p>
			<form id="key-form">
				<label for="owner-key">Operating center key</label>
				<input id="owner-key" name="owner_key" type="password" autocomplete="current-password" required>
				<button type="submit">Open board workspace</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
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
			</section>
			<section class="panel"><h2>Work items</h2>
				<p class="meta">Tracked work from Board decisions. Stages: Ready → In progress → Done (Blocked allowed).</p>
				<div id="work-items">Loading…</div>
			</section>
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
		let selectedMeetingId=null;
		async function load(){
			const b=await api('/api/board/submissions');
			pendingSubmissionsCache=b.submissions||[];
			const pend=pendingSubmissionsCache.filter(s=>s.status==='PENDING');
			document.querySelector('#board-items').innerHTML=pend.length?pend.map(s=>'<div class="item"><strong>'+esc(s.title)+'</strong><div class="meta">'+esc(s.submission_type)+' · '+esc(s.submitted_by)+' · '+esc(s.status)+'</div></div>').join(''):'<div class="unavailable">No pending Board items.</div>';
			let cadence=null;
			try{cadence=(await api('/api/board/cadence')).cadence||null}catch(e){}
			await loadMeetings(cadence);
			await loadWorkItems();
		}
		function pickNextMeeting(meetings){
			const today=new Date().toISOString().slice(0,10);
			const open=(meetings||[]).filter(m=>m.status==='DRAFT'||m.status==='OPEN');
			const dated=open.filter(m=>m.scheduled_for&&String(m.scheduled_for).slice(0,10)>=today)
				.sort((a,b)=>String(a.scheduled_for).localeCompare(String(b.scheduled_for)));
			if(dated.length)return dated[0];
			const undated=open.filter(m=>!m.scheduled_for);
			if(undated.length)return undated[0];
			return null;
		}
		async function renderNextMeeting(meetings,cadence){
			const box=document.querySelector('#next-meeting');
			const next=pickNextMeeting(meetings);
			if(!next){box.innerHTML='<div class="unavailable">No upcoming meeting yet. The machine schedules the next one automatically; use the form below for an extra meeting.</div>';return}
			try{
				const d=await api('/api/board/meetings/'+encodeURIComponent(next.meeting_id));
				const m=d.meeting;
				const agenda=d.agenda||[];
				const pending=(pendingSubmissionsCache||[]).filter(s=>s.status==='PENDING').length;
				const label={DRAFT:'Draft',OPEN:'Open',CLOSED:'Closed'};
				let when='';
				if(cadence){const tz=String(cadence.timezone||'').replace('America/','');when=' · '+esc(cadence.weekday)+'s '+esc(cadence.time)+(tz?' '+esc(tz)+' time':'')}
				let html='<div class="item"><strong>Next meeting: '+esc(m.title)+'</strong>'+
					'<div class="meta">'+(m.scheduled_for?esc(String(m.scheduled_for).slice(0,10))+' · ':'')+esc(label[m.status]||m.status)+when+' · protocol: '+agenda.length+' items'+(pending?' · '+pending+' waiting in the queue':'')+'</div>'+
					'<div class="meta" style="margin-top:8px">Protocol (fills during the week):</div>';
				html+=agenda.length?agenda.map(a=>'<div class="item"><strong>'+esc(a.title)+'</strong><div class="meta">'+esc(a.submission_type)+' · '+esc(a.submitted_by)+' · '+esc(a.status)+'</div></div>').join(''):'<div class="unavailable">No items yet. New submissions join this protocol automatically.</div>';
				html+='<div style="margin-top:8px"><button data-meeting="'+esc(m.meeting_id)+'" style="width:auto">Open meeting workspace</button></div></div>';
				box.innerHTML=html;
				box.querySelectorAll('[data-meeting]').forEach(btn=>btn.addEventListener('click',()=>selectMeeting(btn.dataset.meeting)));
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadMeetings(cadence){
			const box=document.querySelector('#meetings');
			try{
				const data=await api('/api/board/meetings');
				if(!data.meetings.length){box.innerHTML='<div class="unavailable">No meetings yet. Create one below.</div>';document.querySelector('#next-meeting').innerHTML='<div class="unavailable">No upcoming meeting yet. The machine schedules the next one automatically; use the form below for an extra meeting.</div>';return}
				const label={DRAFT:'Draft',OPEN:'Open',CLOSED:'Closed'};
				box.innerHTML=data.meetings.map(m=>'<div class="item"><strong>'+esc(m.title)+'</strong>'+
					'<div class="meta">'+(m.scheduled_for?esc(String(m.scheduled_for).slice(0,10))+' · ':'')+esc(label[m.status]||m.status)+' · agenda '+m.agenda_count+' · decisions '+m.decision_count+'</div>'+
					'<div><button data-meeting="'+esc(m.meeting_id)+'" style="width:auto">Open workspace</button></div></div>').join('');
				box.querySelectorAll('[data-meeting]').forEach(btn=>btn.addEventListener('click',()=>selectMeeting(btn.dataset.meeting)));
				await renderNextMeeting(data.meetings,cadence);
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function selectMeeting(id){
			selectedMeetingId=id;
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
					const pend=pendingSubmissionsCache.filter(s=>s.status==='PENDING');
					html+='<h3 style="margin:16px 0 8px;font-size:18px">Add to agenda</h3>';
					html+=pend.length?'<form id="agenda-form">'+pend.map(s=>'<label style="font-weight:400"><input type="checkbox" name="sid" value="'+esc(s.submission_id)+'" style="width:auto"> '+esc(s.title)+' <span class="meta">('+esc(s.submission_type)+' · '+esc(s.submitted_by)+')</span></label>').join('')+'<button type="submit" style="width:auto">Add selected to agenda</button><div class="message" aria-live="polite"></div></form>':'<div class="unavailable">No pending items in the queue.</div>';
				}
				html+='<h3 style="margin:16px 0 8px;font-size:18px">Agenda</h3>';
				html+=d.agenda.length?d.agenda.map(a=>'<div class="item"><strong>'+esc(a.title)+'</strong><div class="meta">'+esc(a.submission_type)+' · '+esc(a.submitted_by)+' · '+esc(a.status)+'</div>'+(a.requested_outcome?'<div class="meta">Requested outcome: '+esc(a.requested_outcome)+'</div>':'')+'</div>').join(''):'<div class="unavailable">Agenda is empty.</div>';
				if(m.status==='OPEN'){
					const undecided=d.agenda.filter(a=>a.status==='AGENDA');
					html+='<h3 style="margin:16px 0 8px;font-size:18px">Record a decision</h3><form id="decision-form">'+
						'<label>Agenda item (optional)</label><select name="submission_id"><option value="">General decision</option>'+undecided.map(a=>'<option value="'+esc(a.submission_id)+'">'+esc(a.title)+'</option>').join('')+'</select>'+
						'<label>Decision</label><textarea name="decision_text" required></textarea>'+
						'<label>Outcome</label><select name="outcome"><option>CONFIRMED</option><option>DEFERRED</option><option>REJECTED</option></select>'+
						'<label>Responsible person</label><input name="responsible_person" maxlength="200">'+
						'<label>Due date</label><input name="due_date" type="date">'+
						'<label>Vote record (optional)</label><input name="vote_record" maxlength="500">'+
						'<button type="submit" style="width:auto">Record decision</button><div class="message" aria-live="polite"></div></form>';
					html+='<h3 style="margin:16px 0 8px;font-size:18px">Close meeting</h3><form id="meeting-close-form"><label>Minutes</label><textarea name="minutes"></textarea><button type="submit" style="width:auto">Close meeting</button><div class="message" aria-live="polite"></div></form>';
				}
				html+='<h3 style="margin:16px 0 8px;font-size:18px">Decisions</h3>';
				html+=d.decisions.length?d.decisions.map(x=>'<div class="item"><strong>'+esc(x.decision_text)+'</strong><div class="meta">'+esc(x.outcome)+(x.submission_title?' · '+esc(x.submission_title):'')+(x.responsible_person?' · '+esc(x.responsible_person):'')+(x.due_date?' · due '+esc(String(x.due_date).slice(0,10)):'')+'</div></div>').join(''):'<div class="unavailable">No decisions recorded yet.</div>';
				if(m.minutes){html+='<h3 style="margin:16px 0 8px;font-size:18px">Minutes</h3><div class="meta">'+esc(m.minutes)+'</div>'}
				box.innerHTML=html;
				const wire=(fid,path,after)=>{
					const f=box.querySelector('#'+fid);
					if(f)f.addEventListener('submit',async e=>{
						e.preventDefault();
						const msg=e.target.querySelector('.message');msg.textContent='Saving…';
						try{
							const fd=formJson(e.target);
							if(fid==='agenda-form'){fd.submission_ids=[...e.target.querySelectorAll('input[name="sid"]:checked')].map(c=>c.value)}
							await api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fd)});
							msg.textContent='Saved.';
							if(after)await after();
							await selectMeeting(selectedMeetingId);
						}catch(err){msg.textContent=err.message}
					});
				};
				const mid='/api/board/meetings/'+encodeURIComponent(selectedMeetingId);
				wire('meeting-open-form',mid+'/open',loadMeetings);
				wire('agenda-form',mid+'/agenda',loadMeetings);
				wire('decision-form','/api/board/decisions',async()=>{await loadMeetings();await loadWorkItems()});
				wire('meeting-close-form',mid+'/close',loadMeetings);
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function loadWorkItems(){
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
		for(const [id,path] of [['board-form','/api/board/submissions'],['meeting-create-form','/api/board/meetings']])document.querySelector('#'+id).addEventListener('submit',async e=>{e.preventDefault();const m=e.currentTarget.querySelector('.message');m.textContent='Saving…';try{await api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(formJson(e.currentTarget))});e.currentTarget.reset();m.textContent='Saved.';await load()}catch(err){m.textContent=err.message}});
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();load().catch(err=>{document.querySelector('#board-items').innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'})});
		if(getKey()){showApp();load().catch(err=>{document.querySelector('#board-items').innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'})}else{showGate('')}
	</script>
</body></html>`;
}
