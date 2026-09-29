// Operating Center — Sport section.
//
// Five functions, each with a 1-2 line human description and three separate
// views [ Summary ] [ Actions ] [ Details ] (one visible at a time),
// deep-linkable as /operating-center/sport?tab=<function>&view=<summary|actions|details>.
//
//   1. results — Series 2026 race results: live lifecycle per distance,
//      publication status, manual refresh sync, prep confirm, publish buttons.
//   2. series — series/championship/race creation packets + competition
//      calendar.
//   3. challenges — challenge creation packets + challenge calendar.
//   4. groups — NW Groups network overview (report id "groups").
//   5. creation — object creation packets: summary counts, the new-packet
//      form + packet list + the full 5-step packet detail inline in Actions,
//      and the "what the machine can and cannot do" capability table in
//      Details.
//
// Content rules: Summary = management summary only (live numbers, what the
// Machine did, what needs attention — no tech tables). Actions = only real
// manual owner actions that exist in the API today (verified; nothing
// invented). Details = deep working data: tables, records, statuses.
//
// Tab scripts reuse the shell's global esc()/api(); the owner-key gate lives
// in the shell, so no tab script touches the gate. The shell concatenates
// all tab scripts into one <script> block, so every top-level name in them
// is unique across the page (prefixed by tab id). The view-routing script
// (ocViewScript, prefix "spo") is appended exactly once.

import { ocFunction, ocSectionShell, ocViewScript } from "./oc-shell";
import {
	OBJECT_CREATION_KINDS,
	OBJECT_FIELD_CAPABILITIES,
} from "./object-creation";

function escHtml(v: unknown): string {
	return String(v ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Adapted verbatim from operating-center-creation.ts: what the machine can
// and cannot do with the RunSignup API (verified 2026-09-26).
function creationCapabilityTableHtml(): string {
	const rows = OBJECT_FIELD_CAPABILITIES.map((c) => {
		const badge =
			c.capability === "dashboard_only"
				? '<span class="badge-warn">dashboard only</span>'
				: c.capability === "api_replace"
					? '<span class="badge-err">API: full replace</span>'
					: c.capability === "api_upsert_delete_omitted"
						? '<span class="badge-err">API: deletes omitted</span>'
						: c.endpoint
							? '<span class="badge-ok">API writable</span>'
							: '<span class="badge-warn">API exists, URL unverified</span>';
		return (
			'<div class="item"><strong>' +
			escHtml(c.field) +
			badge +
			"</strong><div class=\"detail\">" +
			(c.endpoint ? "<b>Endpoint:</b> " + escHtml(c.endpoint) + "<br>" : "") +
			"<b>Access:</b> " +
			escHtml(c.access) +
			"<br>" +
			escHtml(c.note) +
			"</div></div>"
		);
	}).join("");
	return (
		'<section class="panel"><h2>What the machine can and cannot do</h2>' +
		'<p class="meta">Verified against the official RunSignup API docs on 2026-09-26. ' +
		"Creating the object itself is always a dashboard step; the machine never claims otherwise.</p>" +
		rows +
		"</section>"
	);
}

// ---------------------------------------------------------------------------
// 1. Results
// ---------------------------------------------------------------------------

// Custom classes used by the results tab that the shared shell does not
// define (.ok/.err/.event/.sync-status/plain tables/.btnrow), scoped to this
// tabpanel so they cannot leak into the other tabs.
const RESULTS_CSS = `<style>
	#tabpanel-results .ok{color:#1c6b3a;font-weight:650}
	#tabpanel-results .err{color:#a3322b;font-weight:650}
	#tabpanel-results .event{border-top:1px solid #dce4df;padding:14px 0}
	#tabpanel-results .event:first-of-type{border-top:0}
	#tabpanel-results .sync-status{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px}
	#tabpanel-results .sync-status div{background:#f5f7f5;border:1px solid #dce4df;border-radius:9px;padding:8px 10px;font-size:13px}
	#tabpanel-results table{width:100%;border-collapse:collapse;margin-top:8px}
	#tabpanel-results th,#tabpanel-results td{text-align:left;padding:8px 10px;border-bottom:1px solid #dce4df;font-size:14px}
	#tabpanel-results th{color:#66736d;font-weight:650}
	#tabpanel-results .btnrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}
	#tabpanel-results .btnrow button{width:auto;margin-top:0}
	#tabpanel-results .badge-err{display:inline-block;background:#fbe4e4;border-radius:6px;padding:2px 8px;font-size:13px;color:#a4262c;font-weight:650}
	#tabpanel-results .matrix-wrap{overflow-x:auto;margin-top:8px;border:1px solid #dce4df;border-radius:9px}
	#tabpanel-results table.matrix{width:max-content;min-width:100%;margin-top:0}
	#tabpanel-results table.matrix th,#tabpanel-results table.matrix td{white-space:nowrap;vertical-align:top}
	#tabpanel-results table.matrix th.stickycol,#tabpanel-results table.matrix td.stickycol{position:sticky;left:0;z-index:2;background:#fff;box-shadow:1px 0 0 #dce4df;min-width:170px;max-width:230px;white-space:normal}
	#tabpanel-results table.matrix thead th.stickycol{background:#f5f7f5}
	#tabpanel-results table.matrix .badge,#tabpanel-results table.matrix .badge-warn,#tabpanel-results table.matrix .badge-err{margin-left:0}
	#tabpanel-results .matrix-ctl{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-top:8px}
	#tabpanel-results .matrix-ctl label{font-size:13px;color:#66736d;display:block;margin-bottom:2px}
	#tabpanel-results .matrix-ctl input,#tabpanel-results .matrix-ctl select{width:auto;margin-top:0}
	#tabpanel-results .matrix-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:13px;color:#66736d}
	#tabpanel-results .pager{display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap}
	#tabpanel-results .pager button{width:auto;margin-top:0}
</style>`;

const RESULTS_SUMMARY_HTML = RESULTS_CSS + `<section class="panel"><h2>Results summary</h2><div id="results-sum">Loading…</div></section>
<section class="panel"><h2>Registrations vs results — four separate metrics</h2><div id="results-reg">Loading…</div></section>`;

const RESULTS_ACTIONS_HTML = `<section class="panel"><h2>Results actions</h2>
	<p class="meta"><strong>Your one decision per result:</strong> approve it or disqualify it (with a reason) below. <strong>After your decision the Machine runs everything itself</strong> — levels, level places, points, standings, publication, winner news, social congratulations, next-race promotion. No separate confirmations below this line. A disqualified result scores 0 points and is excluded from standings. <strong>Machine (automatic):</strong> computes performance levels, points, and level places on demand and keeps the per-distance lifecycle. <strong>Owner (manual):</strong> result decisions, refreshing sync, confirming prep.</p>
	<h3>Approve results</h3>
	<div id="results-approve-actions"><div class="unavailable">Loading…</div></div>
	<div id="results-act">Loading…</div>
	<h3 style="margin-top:16px">Sync registrations</h3><p class="meta">One POST to /api/series-2026/registrations/sync — pulls RunSignup participant records for all 6 Series 2026 races into the registration data layer (separate from results). Manual only.</p>
	<div class="item"><strong>Registration sync</strong><div class="detail" id="results-reg-sync-status">Not synced in this session.</div><div class="btnrow"><button type="button" class="secondary" id="results-reg-sync-btn">Sync registrations now</button></div><div class="message" aria-live="polite"></div></div></section>`;

const RESULTS_DETAILS_HTML = `<section class="panel"><h2>Sync status</h2><div class="sync-status" id="results-det-sync">Loading…</div></section>
	<section class="panel"><h2>Athlete progression matrix</h2><p class="meta">One row per athlete, one column per event of the distance (left to right by date), then season totals. The same model feeds the public Results page. Races counts valid approved finishes only — DNS, DSQ, and registrations without a valid result never count. Standings stay separate per Performance Level and division.</p><div id="results-det-matrix">Loading…</div></section>
	<section class="panel"><h2>Full lifecycle</h2><div id="results-det-lifecycle">Loading…</div></section>`;

const RESULTS_SCRIPT = `
	const results_DISTANCES=['1K','3K','5K','10K','15K','20K'];
	// --- Athlete progression matrix (ADR-0043): rows = athletes, columns =
	// events of the distance by date, then season totals. One shared model
	// with the public site; server-side search + pagination.
	let results_matrixPage=1;
	function results_matrixCellHtml(c){
		switch(c.state){
			case 'registered':return '<span class="badge">Registered</span>';
			case 'submitted':return '<span class="badge-warn">Submitted</span>';
			case 'approved':return '<span class="badge">Approved · Processing</span>';
			case 'exception':return '<span class="badge-err">Exception</span>';
			case 'dns':return '<span class="badge">DNS</span>';
			case 'dsq':return '<span class="badge-err">DSQ</span>';
			case 'final':return '<strong>'+esc(c.time||'—')+'</strong><div class="meta">'+esc(c.level||'')+' · '+esc(c.points==null?'':String(c.points))+' pts</div>';
			default:return '<span class="meta">—</span>';
		}
	}
	function results_matrixShortName(e){
		const name=String(e.event_name||('Event '+e.event_id));
		return name.length>24?name.slice(0,23)+'…':name;
	}
	function results_matrixTableHtml(data){
		const events=data.events||[];
		const rows=data.rows||[];
		const pg=data.pagination||{page:1,total_pages:1,total:0,per_page:50};
		if(!events.length)return '<div class="unavailable">No events found for this distance.</div>';
		let h='<div class="meta">'+esc(String(pg.total))+' athlete(s) · generated '+esc(data.generated_at||'')+'</div>';
		h+='<div class="matrix-wrap"><table class="matrix"><thead><tr><th class="stickycol">Athlete</th>';
		for(const e of events){
			h+='<th>'+esc(results_matrixShortName(e))+'<br><span class="meta">'+esc(e.event_date||'')+'</span></th>';
		}
		h+='<th>Races</th><th>Best time</th><th>Level / Division</th><th>Points</th><th>Rank</th></tr></thead><tbody>';
		if(!rows.length){
			h+='<tr><td class="stickycol" colspan="'+(events.length+6)+'"><div class="unavailable">No athletes match.</div></td></tr>';
		}
		for(const r of rows){
			h+='<tr><td class="stickycol"><strong>'+esc(r.name)+'</strong>'+(r.gender?'<br><span class="meta">'+esc(r.gender)+'</span>':'')+'</td>';
			for(const e of events){
				const c=(r.cells||{})[String(e.event_id)]||{state:'empty'};
				h+='<td>'+results_matrixCellHtml(c)+'</td>';
			}
			const buckets=r.buckets||[];
			const stack=buckets.length?buckets.map(b=>'<div>'+esc(b.level)+' '+esc(b.gender)+'</div>').join(''):'<span class="meta">—</span>';
			const pts=buckets.length?buckets.map(b=>'<div>'+esc(String(b.points))+'</div>').join(''):'<span class="meta">—</span>';
			const ranks=buckets.length?buckets.map(b=>'<div>#'+esc(String(b.rank))+'</div>').join(''):'<span class="meta">—</span>';
			h+='<td>'+esc(String(r.races))+'</td><td>'+esc(r.best_time||'—')+'</td><td>'+stack+'</td><td>'+pts+'</td><td>'+ranks+'</td></tr>';
		}
		h+='</tbody></table></div>';
		h+='<div class="pager"><button type="button" class="secondary" data-mxpage="'+(pg.page-1)+'"'+(pg.page<=1?' disabled':'')+'>Prev</button>'+
			'<span class="meta">Page '+esc(String(pg.page))+' of '+esc(String(pg.total_pages))+' · '+esc(String(pg.total))+' athletes</span>'+
			'<button type="button" class="secondary" data-mxpage="'+(pg.page+1)+'"'+(pg.page>=pg.total_pages?' disabled':'')+'>Next</button></div>';
		const bkts=data.buckets||[];
		if(bkts.length){
			h+='<h3 style="margin-top:16px">Standings by level and division</h3>';
			for(const b of bkts){
				const entries=(b.entries||[]).slice(0,20);
				h+='<h4>'+esc(b.level)+' — '+esc(b.gender)+'</h4>'+
					'<table><thead><tr><th>Rank</th><th>Athlete</th><th>Points</th><th>Races</th><th>Best time</th></tr></thead><tbody>'+
					entries.map(e=>'<tr><td>#'+esc(String(e.rank))+'</td><td>'+esc(e.name)+'</td><td>'+esc(String(e.points))+'</td><td>'+esc(String(e.races))+'</td><td>'+esc(e.best_time||'—')+'</td></tr>').join('')+
					'</tbody></table>';
				if((b.entries||[]).length>20)h+='<div class="meta">Top 20 of '+esc(String(b.entries.length))+' shown.</div>';
			}
		}
		return h;
	}
	async function results_matrixFetch(page){
		const box=document.querySelector('#results-det-matrix');
		if(!box)return;
		const out=box.querySelector('#results-mx-out');
		const distance=box.querySelector('#results-mx-distance').value;
		const search=box.querySelector('#results-mx-search').value.trim();
		const from=box.querySelector('#results-mx-from').value;
		const to=box.querySelector('#results-mx-to').value;
		const per_page=box.querySelector('#results-mx-perpage').value;
		results_matrixPage=page||1;
		out.innerHTML='<div class="unavailable">Loading…</div>';
		try{
			const qs=new URLSearchParams({distance:distance,page:String(results_matrixPage),per_page:String(per_page)});
			if(search)qs.set('search',search);
			if(from)qs.set('from',from);
			if(to)qs.set('to',to);
			const data=await api('/api/operating-center/series-2026/results/progression?'+qs.toString());
			out.innerHTML=results_matrixTableHtml(data);
			out.querySelectorAll('[data-mxpage]').forEach(function(btn){
				btn.addEventListener('click',function(){results_matrixFetch(Number(btn.dataset.mxpage));});
			});
		}catch(err){out.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_results_matrix(){
		const box=document.querySelector('#results-det-matrix');
		if(!box)return;
		box.innerHTML=
			'<div class="matrix-ctl">'+
			'<div><label>Distance</label><select id="results-mx-distance">'+results_DISTANCES.map(d=>'<option value="'+d+'"'+(d==='5K'?' selected':'')+'>'+d+'</option>').join('')+'</select></div>'+
			'<div><label>Athlete search</label><input id="results-mx-search" placeholder="name…" style="min-width:150px"></div>'+
			'<div><label>Events from</label><input id="results-mx-from" type="date"></div>'+
			'<div><label>Events to</label><input id="results-mx-to" type="date"></div>'+
			'<div><label>Rows per page</label><select id="results-mx-perpage"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option><option value="200">200</option></select></div>'+
			'<div><button type="button" class="secondary" id="results-mx-load">Load matrix</button></div>'+
			'</div>'+
			'<div class="matrix-legend">'+
			'<span><span class="badge">Registered</span> signed up, no result yet</span>'+
			'<span><span class="badge-warn">Submitted</span> result in, awaiting your decision</span>'+
			'<span><span class="badge">Approved · Processing</span> decided, the Machine is running</span>'+
			'<span><span class="badge-err">Exception</span> result without registration</span>'+
			'<span><span class="badge">DNS</span> registered, no result after the deadline</span>'+
			'<span><span class="badge-err">DSQ</span> disqualified by you</span>'+
			'<span><strong>time · level · pts</strong> final approved result</span>'+
			'</div>'+
			'<div id="results-mx-out" style="margin-top:8px"><div class="unavailable">Loading…</div></div>';
		box.querySelector('#results-mx-load').addEventListener('click',function(){results_matrixFetch(1);});
		box.querySelector('#results-mx-search').addEventListener('keydown',function(e){if(e.key==='Enter')results_matrixFetch(1);});
		await results_matrixFetch(1);
	}
	async function results_fetchLifecycle(){return await api('/api/operating-center/race-lifecycle');}
	async function results_fetchPreview(){
		try{return await api('/sources/runsignup/series-2026/results-preview');}
		catch(err){return {error:err.message||String(err)};}
	}
	async function results_fetchParticipation(){
		try{return await api('/api/series-2026/registrations/totals');}
		catch(err){return {error:err.message||String(err)};}
	}
	function results_participationHtml(data){
		if(data.error)return '<div class="unavailable">'+esc(data.error)+'</div>';
		const reg=data.registrations||{};
		const rows=(reg.byRace||[]).map(function(r){
			return '<tr><td>'+esc(r.distance)+'</td><td>'+esc(String(r.registrations))+'</td><td>'+esc(String(r.activeRegistrations))+'</td><td>'+esc(String(r.registeredParticipants))+'</td></tr>';
		}).join('');
		return '<div class="item"><strong>Registrations</strong><div class="detail">'+esc(String(reg.totalRegistrations||0))+' total · '+esc(String(reg.activeRegistrations||0))+' active. One registration = one RunSignup registration record.</div></div>'+
			'<div class="item"><strong>Registered participants</strong><div class="detail">'+esc(String(reg.uniqueRegisteredParticipants||0))+' distinct RunSignup users with at least one active registration.</div></div>'+
			'<div class="item"><strong>Athletes with verified finishes</strong><div class="detail">'+esc(String(data.uniqueAthletesWithResults||0))+' distinct athletes in finalized results (from race_event_results — not registrations).</div></div>'+
			'<div class="item"><strong>Verified finishes</strong><div class="detail">'+esc(String(data.verifiedFinishes||0))+' finalized result records (from race_event_results — not registrations).</div></div>'+
			(rows?'<table><thead><tr><th>Distance</th><th>Registrations</th><th>Active</th><th>Participants</th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="unavailable">No registration data yet — run the sync from Actions.</div>')+
			'<div class="meta">Registrations last synced: '+esc((reg.lastSyncAt)||'never')+' · computed '+esc(data.computedAt||'')+'</div>';
	}
	async function boot_results_summary(){
		const box=document.querySelector('#results-sum');
		try{
			const life=await results_fetchLifecycle();
			const distances=life.distances||[];
			let html='';
			for(const d of distances){
				const ev=d.active_event;
				html+='<div class="item"><strong>'+esc(d.distance)+' — '+esc(d.stage)+'</strong>'+
					'<div class="detail">'+(ev?esc(ev.event_name||'')+' · '+esc(ev.event_date||'')+' · ':'')+(d.synced_at?'synced '+esc(d.synced_at):'never synced')+'</div></div>';
			}
			if(prev.error){
				html+='<div class="item"><strong>Publication status <span class="badge-warn">unavailable</span></strong><div class="detail">'+esc(prev.error)+'</div></div>';
			}else{
				const drafts=prev.drafts||[];
				const ready=drafts.filter(x=>x.publication_required&&x.publication_status!=='PUBLISHED');
				const published=drafts.filter(x=>x.publication_status==='PUBLISHED').length;
				html+='<div class="item"><strong>Publication status</strong><div class="detail">'+ready.length+' result(s) ready to publish · '+published+' published</div></div>';
			}
			const prepCount=distances.filter(d=>d.stage==='next_race_prep'&&d.prep).length;
			html+='<div class="item"><strong>Prep awaiting review</strong><div class="detail">'+(prepCount?prepCount+' race(s) in next-race prep — confirm in Actions.':'None.')+'</div></div>';
			const attn=[];
			for(const d of distances){
				if(d.stage==='verifying')attn.push(d.distance+' is in verifying — approve its results in Actions to run the full pipeline.');
				if(!d.synced_at)attn.push(d.distance+' has never been synced from RunSignup.');
			}
			if(!prev.error){
				const ready=(prev.drafts||[]).filter(x=>x.publication_required&&x.publication_status!=='PUBLISHED');
				if(ready.length)attn.push(ready.length+' result(s) ready for publication — publish them in Actions.');
			}
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Computes performance levels, level places, and points from approved results and keeps the per-distance lifecycle (registration_open → awaiting_results → verifying → levels_computed → published → next_race_prep). You approve results in Actions — after that the Machine runs levels, standings, publication, winner news, social, and next-race promotion by itself.</div></div>';
			box.innerHTML=html;
			try{
				const part=await results_fetchParticipation();
				document.querySelector('#results-reg').innerHTML=results_participationHtml(part);
			}catch(err){document.querySelector('#results-reg').innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_results_actions(){
		const box=document.querySelector('#results-act');
		try{
			const life=await results_fetchLifecycle();
			const distances=life.distances||[];
			let html='<h3>Refresh sync</h3><p class="meta">One POST per distance to /api/operating-center/race-lifecycle/sync. The Machine does not sync automatically.</p>'+
				distances.map(d=>'<div class="item"><strong>'+esc(d.distance)+'</strong><div class="detail">'+(d.synced_at?'Last synced '+esc(d.synced_at):'Never synced')+'</div><div class="btnrow"><button type="button" class="secondary" data-sync="'+esc(d.distance)+'">Refresh '+esc(d.distance)+'</button></div><div class="message" aria-live="polite"></div></div>').join('');
			const prep=distances.filter(d=>d.stage==='next_race_prep'&&d.prep);
			html+='<h3>Confirm prep</h3>';
			if(prep.length){
				html+=prep.map(d=>'<div class="item"><strong>'+esc(d.distance)+' — next-race prep ready</strong><div class="detail">'+esc(d.owner_action||'Prep needs review')+'. Drafts: announcement + email (Send stays manual).</div><div class="btnrow"><button type="button" class="secondary" data-prep="'+esc(d.distance)+'">Confirm prep</button></div><div class="message" aria-live="polite"></div></div>').join('');
			}else{
				html+='<div class="unavailable">No race in prep review right now.</div>';
			}
			box.innerHTML=html;
			box.querySelectorAll('[data-sync]').forEach(function(btn){
				btn.addEventListener('click',async()=>{
					const item=btn.closest('.item');const msg=item.querySelector('.message');msg.textContent='Syncing '+btn.dataset.sync+'…';
					try{
						await api('/api/operating-center/race-lifecycle/sync?distance='+encodeURIComponent(btn.dataset.sync),{method:'POST'});
						msg.textContent='Synced.';
					}catch(err){msg.textContent=err.message}
				});
			});
			box.querySelectorAll('[data-prep]').forEach(function(btn){
				btn.addEventListener('click',async()=>{
					const item=btn.closest('.item');const msg=item.querySelector('.message');msg.textContent='Confirming prep…';
					try{
						await api('/api/operating-center/race-lifecycle/prep-confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distance:btn.dataset.prep})});
						msg.textContent='Prep confirmed.';
					}catch(err){msg.textContent=err.message}
				});
			});
			// ADR-0042: result approval UI. After approval the Machine runs
			// levels, standings, publication, winner news, social, next-race
			// promo by itself — no separate publish action exists anymore.
			const approveBox=document.querySelector('#results-approve-actions');
			const activeEvents=distances.map(d=>({distance:d.distance,event:d.active_event})).filter(x=>x.event&&x.event.event_id);
			if(!activeEvents.length){approveBox.innerHTML='<div class="unavailable">No active events with results.</div>';}
			else{
				const opts=activeEvents.map(x=>'<option value="'+esc(x.distance)+'|'+x.event.event_id+'">'+esc(x.distance)+' — '+esc(x.event.event_name||('Event '+x.event.event_id))+' · '+esc(x.event.event_date||'')+'</option>').join('');
				approveBox.innerHTML='<div class="item"><strong>Event</strong><div class="btnrow"><select id="results-approve-event" style="max-width:100%">'+opts+'</select><button type="button" class="secondary" id="results-approve-load">Load results</button></div></div><div id="results-approve-table"></div><div class="message" id="results-approve-msg" aria-live="polite"></div>';
				const loadBtn=approveBox.querySelector('#results-approve-load');
				loadBtn.addEventListener('click',async()=>{
					const sel=approveBox.querySelector('#results-approve-event').value.split('|');
					const distance=sel[0],eventId=sel[1];
					const tbl=approveBox.querySelector('#results-approve-table');
					const msg=approveBox.querySelector('#results-approve-msg');
					tbl.innerHTML='<div class="unavailable">Loading…</div>';msg.textContent='';
					try{
						const data=await api('/api/operating-center/series-2026/results/pending?distance='+encodeURIComponent(distance)+'&event_id='+encodeURIComponent(eventId));
						const rows=data.results||[];
						if(!rows.length){tbl.innerHTML='<div class="unavailable">No results on RunSignup for this event.</div>';return;}
						tbl.innerHTML='<table><thead><tr><th></th><th>Athlete</th><th>Time</th><th>Decision</th><th></th></tr></thead><tbody>'+
							rows.map(r=>'<tr><td>'+(r.disqualified||r.approved?'':'<input type="checkbox" data-rid="'+esc(r.result_id)+'">')+'</td><td>'+esc(r.athlete)+'</td><td>'+esc(r.time||'—')+'</td>'+
								'<td>'+(r.disqualified
									?'<span class="warn">Disqualified</span>'+(r.disqualification_reason?' — '+esc(r.disqualification_reason):'')
									:(r.approved?'<span class="ok">Approved</span>':'<span class="err">Pending</span>'))+'</td>'+
								'<td>'+(r.disqualified||r.approved
									?'<button type="button" class="secondary" data-clear="'+esc(r.result_id)+'">Clear decision</button>'
									:'<button type="button" class="secondary" data-dsq="'+esc(r.result_id)+'">Disqualify</button>')+'</td></tr>').join('')+
							'</tbody></table>'+
							'<div class="meta">Trigger: '+esc(data.trigger.detail)+'</div>'+
							'<div class="meta">Your two sports decisions: Approve, or Disqualify with a reason. A disqualified result scores 0 points and is excluded from standings.</div>'+
							'<div class="btnrow"><button type="button" class="secondary" id="results-approve-sel">Approve selected</button><button type="button" class="secondary" id="results-approve-all">Approve all pending</button><button type="button" class="secondary" id="results-dsq-sel">Disqualify selected</button><button type="button" class="secondary" id="results-approve-retry">Process now (retry)</button></div>';
						async function doApprove(ids){
							if(!ids.length){msg.textContent='Nothing selected.';return;}
							if(!confirm('Approve '+ids.length+' result(s)?\\n\\nAfter approval the Machine runs the full downstream lifecycle automatically: levels, points, standings, publication, winner news, social congratulations, next-race promotion.'))return;
							msg.textContent='Approving… the Machine is running the downstream lifecycle. This may take a minute.';
							try{
								const res=await api('/api/operating-center/series-2026/results/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distance:distance,event_id:Number(eventId),result_ids:ids})});
								if(res.process&&res.process.ok){msg.textContent='Done: approved '+res.approved+', trigger '+res.trigger.reason+', all steps ok.';}
								else if(res.process){msg.textContent='Approved '+res.approved+', but processing failed: '+(res.process.error||'see Details');}
								else{msg.textContent='Approved '+res.approved+'. Trigger not fired: '+res.trigger.detail;}
								loadBtn.click();
							}catch(err){msg.textContent=err.message}
						}
						tbl.querySelector('#results-approve-sel').addEventListener('click',()=>doApprove(Array.from(tbl.querySelectorAll('input[data-rid]:checked')).map(c=>c.dataset.rid)));
						tbl.querySelector('#results-approve-all').addEventListener('click',()=>doApprove(Array.from(tbl.querySelectorAll('input[data-rid]')).map(c=>c.dataset.rid)));
						async function doDisqualify(ids){
							if(!ids.length){msg.textContent='Nothing selected.';return;}
							const reason=prompt('Disqualification reason (required, recorded in the audit trail):');
							if(reason===null)return;
							if(!reason.trim()){msg.textContent='A disqualification reason is required.';return;}
							if(!confirm('Disqualify '+ids.length+' result(s)?\\n\\nReason: '+reason.trim()+'\\n\\nA disqualified result scores 0 points and is excluded from standings. After your decision the Machine re-evaluates the event and runs the downstream lifecycle when the trigger fires.'))return;
							msg.textContent='Recording disqualification… the Machine is re-evaluating the event. This may take a minute.';
							try{
								const res=await api('/api/operating-center/series-2026/results/disqualify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distance:distance,event_id:Number(eventId),result_ids:ids,reason:reason.trim()})});
								if(res.process&&res.process.ok){msg.textContent='Done: disqualified '+res.disqualified+', trigger '+res.trigger.reason+', all steps ok.';}
								else if(res.process){msg.textContent='Disqualified '+res.disqualified+', but processing failed: '+(res.process.error||'see Details');}
								else{msg.textContent='Disqualified '+res.disqualified+'. Trigger not fired: '+res.trigger.detail;}
								loadBtn.click();
							}catch(err){msg.textContent=err.message}
						}
						tbl.querySelector('#results-dsq-sel').addEventListener('click',()=>doDisqualify(Array.from(tbl.querySelectorAll('input[data-rid]:checked')).map(c=>c.dataset.rid)));
						tbl.querySelectorAll('[data-dsq]').forEach(function(btn){
							btn.addEventListener('click',function(){doDisqualify([btn.dataset.dsq]);});
						});
						tbl.querySelectorAll('[data-clear]').forEach(function(btn){
							btn.addEventListener('click',async function(){
								if(!confirm('Clear your decision on this result? It returns to Submitted (no approval, no disqualification).'))return;
								msg.textContent='Clearing decision…';
								try{
									const res=await api('/api/operating-center/series-2026/results/clear-decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distance:distance,event_id:Number(eventId),result_id:btn.dataset.clear})});
									msg.textContent=(res.clearedApproval||res.clearedDisqualification)?'Decision cleared — the result is Submitted again.':'No decision was recorded for this result.';
									loadBtn.click();
								}catch(err){msg.textContent=err.message}
							});
						});
						tbl.querySelector('#results-approve-retry').addEventListener('click',async()=>{
							msg.textContent='Evaluating trigger…';
							try{
								const res=await api('/api/operating-center/series-2026/results/process-now',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distance:distance,event_id:Number(eventId)})});
								msg.textContent=res.fired?(res.process&&res.process.ok?'Processing finished: all steps ok.':'Processing failed: '+(res.process&&res.process.error||'unknown')):('Not fired: '+res.trigger.detail);
								loadBtn.click();
							}catch(err){msg.textContent=err.message}
						});
					}catch(err){tbl.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
				});
			}
			const regBtn=box.querySelector('#results-reg-sync-btn');
			if(regBtn){
				regBtn.addEventListener('click',async()=>{
					const item=regBtn.closest('.item');const msg=item.querySelector('.message');const status=box.querySelector('#results-reg-sync-status');
					msg.textContent='Syncing registrations from RunSignup…';regBtn.disabled=true;
					try{
						const res=await api('/api/series-2026/registrations/sync',{method:'POST'});
						msg.textContent=res.ok?('Synced: '+res.totalFetched+' fetched, '+res.totalStored+' stored.'):('Sync finished with errors — check the response.');
						if(status)status.textContent='Last sync attempt: '+new Date().toISOString()+' · '+res.totalFetched+' fetched / '+res.totalStored+' stored';
					}catch(err){msg.textContent=err.message}
					regBtn.disabled=false;
				});
			}
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_results_details(){
		try{
			const life=await results_fetchLifecycle();
			const distances=life.distances||[];
			const syncBox=document.querySelector('#results-det-sync');
			syncBox.innerHTML=distances.length?distances.map(d=>
				'<div><strong>'+esc(d.distance)+'</strong><br>'+
				(d.synced_at?'<span class="ok">Synced</span><br><span class="meta">'+esc(d.synced_at)+'</span>':'<span class="err">Never synced</span>')+
				'</div>').join(''):'<div class="unavailable">No lifecycle state yet.</div>';
			const lcBox=document.querySelector('#results-det-lifecycle');
			lcBox.innerHTML=distances.length?distances.map(d=>{
				const ev=d.active_event;
				return '<div class="item"><strong>'+esc(d.distance)+' — '+esc(d.stage)+'</strong>'+
					'<div class="detail">Active event: '+(ev?esc(ev.event_name||'')+' · '+esc(ev.event_date||''): 'none')+'</div>'+
					(d.owner_action?'<div class="detail">Owner action: '+esc(d.owner_action)+'</div>':'')+
					'<div class="detail">Write access: '+esc(d.write_access)+' (dry_run)'+(d.prep?' · prep drafts ready':'')+'</div>'+
					'<div class="meta">Synced: '+(d.synced_at?esc(d.synced_at):'never')+'</div></div>';
			}).join(''):'<div class="unavailable">No lifecycle state yet.</div>';
			await boot_results_matrix();
		}catch(err){
			const m=document.querySelector('#tabpanel-results .oc-tab-error');
			if(m)m.textContent='Error: '+(err.message||err);
		}
	}
`;

const RESULTS_PANELS = ocFunction(
	"results",
	"Series 2026 race results — live lifecycle per distance, athlete progression matrix, and result decisions. You approve or disqualify results; the Machine runs the rest.",
	RESULTS_SUMMARY_HTML,
	RESULTS_ACTIONS_HTML,
	RESULTS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 2. Series
// ---------------------------------------------------------------------------

const SERIES_SUMMARY_HTML = `<section class="panel"><h2>Series & championships summary</h2><div id="series-sum">Loading…</div></section>`;

const SERIES_ACTIONS_HTML = `<section class="panel"><h2>Series actions</h2>
	<p class="meta"><strong>Machine (automatic):</strong> builds each packet's dry-run plan and runs read-only probes; writing happens only through explicit confirms in the Creation tab. <strong>Owner (manual):</strong> the action below — packet creation itself lives in Creation.</p>
	<div id="series-act">Loading…</div></section>`;

const SERIES_DETAILS_HTML = `<section class="panel"><h2>Series, championship & race packets</h2><div id="series-det-packets">Loading…</div></section>
	<section class="panel"><h2>Competition calendar</h2><div id="series-det-calendar">Loading…</div></section>`;

const SERIES_SCRIPT = `
	function series_statusBadge(status){
		if(status==='complete')return '<span class="badge-ok">complete</span>';
		if(status==='manual_pending')return '<span class="badge-warn">manual last mile</span>';
		return '<span class="badge">in progress</span>';
	}
	function series_packetLink(p){return '/operating-center/sport?tab=creation&view=actions&packet_id='+encodeURIComponent(p.packet_id);}
	async function series_fetchPackets(){
		const data=await api('/api/operating-center/object-creation/packets');
		return (data.packets||[]).filter(p=>['series','championship','race'].indexOf(p.kind)>=0);
	}
	async function boot_series_summary(){
		const box=document.querySelector('#series-sum');
		try{
			const packets=await series_fetchPackets();
			const byStatus={},byKind={};
			for(const p of packets){byStatus[p.status]=(byStatus[p.status]||0)+1;byKind[p.kind]=(byKind[p.kind]||0)+1;}
			let html='<div class="item"><strong>Creation packets</strong><div class="detail">'+packets.length+' series / championship / race packet(s)</div>';
			if(packets.length){
				html+='<div class="detail">By kind: '+Object.keys(byKind).map(k=>esc(k)+': '+byKind[k]).join(' · ')+'</div>';
				html+='<div class="detail">By status: '+Object.keys(byStatus).map(s=>esc(s)+': '+byStatus[s]).join(' · ')+'</div>';
			}
			html+='</div>';
			try{
				const cdata=await api('/api/operating-center/object-creation/calendar?kind=series');
				const rows=cdata.competition||[];
				html+='<div class="item"><strong>Competition calendar</strong><div class="detail">'+rows.length+' entr'+(rows.length===1?'y':'ies')+'</div>';
				if(rows.length)html+='<div class="detail">'+rows.slice(0,5).map(r=>'&bull; '+esc(r.title)+(r.event_date?' · '+esc(r.event_date):'')).join('<br>')+'</div>';
				html+='</div>';
			}catch(err){html+='<div class="item"><strong>Competition calendar <span class="badge-warn">unavailable</span></strong><div class="detail">'+esc(err.message)+'</div></div>';}
			const attn=packets.filter(p=>p.status!=='complete'&&p.status!=='manual_pending');
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(p=>'<a href="'+esc(series_packetLink(p))+'">'+esc(p.title)+'</a> ('+esc(p.status)+')').join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Keeps the packet lifecycle and the competition calendar from live packet data. Creating the object itself is always a dashboard step; the Machine never claims otherwise.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_series_actions(){
		const box=document.querySelector('#series-act');
		box.innerHTML='<div class="item"><strong>Create a series / championship / race packet</strong>'+
			'<div class="detail">Packet creation lives in the Creation tab: the Machine builds the dry-run plan there and you confirm each write.</div>'+
			'<div class="btnrow" style="display:flex;gap:8px;margin-top:8px"><button type="button" class="secondary" id="series-new-packet">New packet in Creation</button></div></div>';
		const btn=box.querySelector('#series-new-packet');
		if(btn)btn.addEventListener('click',function(){__spoSetView('creation','actions',true);});
	}
	async function boot_series_details(){
		const pb=document.querySelector('#series-det-packets');
		try{
			const packets=await series_fetchPackets();
			pb.innerHTML=packets.length?packets.map(p=>
				'<div class="item"><strong><a href="'+esc(series_packetLink(p))+'">'+esc(p.title)+'</a>'+series_statusBadge(p.status)+'</strong>'+
				'<div class="detail"><b>Kind:</b> '+esc(p.kind_label||p.kind)+' · <b>Status:</b> '+esc(p.status)+'</div>'+
				'<div class="detail"><b>Event date:</b> '+esc(p.event_date||'not recorded')+(p.runsignup_race_id?' · <b>Race ID:</b> '+esc(p.runsignup_race_id):' · race not linked yet')+'</div></div>'
			).join(''):'<div class="unavailable">No series, championship, or race packets yet. Create one in the Creation tab.</div>';
		}catch(err){pb.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		const cb=document.querySelector('#series-det-calendar');
		try{
			const cdata=await api('/api/operating-center/object-creation/calendar?kind=series');
			const rows=cdata.competition||[];
			cb.innerHTML=rows.length?'<table class="data"><thead><tr><th>Event</th><th>Date</th><th>Status</th><th>Public page</th></tr></thead><tbody>'+
				rows.map(r=>'<tr><td>'+esc(r.title)+'</td><td>'+esc(r.event_date||'—')+'</td><td>'+esc(r.status||'—')+'</td><td>'+(r.url?'<a href="'+esc(r.url)+'" target="_blank" rel="noopener">Open</a>':'—')+'</td></tr>').join('')+'</tbody></table>'
				:'<div class="unavailable">No competition calendar entries.</div>';
		}catch(err){cb.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const SERIES_PANELS = ocFunction(
	"series",
	"Series, championships, and individual races — creation packets by status and kind plus the competition calendar. Packet creation lives in the Creation tab.",
	SERIES_SUMMARY_HTML,
	SERIES_ACTIONS_HTML,
	SERIES_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 3. Challenges
// ---------------------------------------------------------------------------

const CHALLENGES_SUMMARY_HTML = `<section class="panel"><h2>Challenges summary</h2><div id="challenges-sum">Loading…</div></section>`;

const CHALLENGES_ACTIONS_HTML = `<section class="panel"><h2>Challenges actions</h2>
	<p class="meta"><strong>Machine (automatic):</strong> builds each challenge packet's dry-run plan and runs read-only probes; writing happens only through explicit confirms in the Creation tab. <strong>Owner (manual):</strong> the action below — packet creation itself lives in Creation.</p>
	<div id="challenges-act">Loading…</div></section>`;

const CHALLENGES_DETAILS_HTML = `<section class="panel"><h2>Challenge packets</h2><div id="challenges-det-packets">Loading…</div></section>
	<section class="panel"><h2>Challenge calendar</h2><div id="challenges-det-calendar">Loading…</div></section>`;

const CHALLENGES_SCRIPT = `
	function challenges_statusBadge(status){
		if(status==='complete')return '<span class="badge-ok">complete</span>';
		if(status==='manual_pending')return '<span class="badge-warn">manual last mile</span>';
		return '<span class="badge">in progress</span>';
	}
	function challenges_packetLink(p){return '/operating-center/sport?tab=creation&view=actions&packet_id='+encodeURIComponent(p.packet_id);}
	async function challenges_fetchPackets(){
		const data=await api('/api/operating-center/object-creation/packets');
		return (data.packets||[]).filter(p=>p.kind==='challenge');
	}
	async function boot_challenges_summary(){
		const box=document.querySelector('#challenges-sum');
		try{
			const packets=await challenges_fetchPackets();
			const byStatus={};
			for(const p of packets){byStatus[p.status]=(byStatus[p.status]||0)+1;}
			let html='<div class="item"><strong>Challenge packets</strong><div class="detail">'+packets.length+' challenge packet(s)</div>';
			if(packets.length)html+='<div class="detail">By status: '+Object.keys(byStatus).map(s=>esc(s)+': '+byStatus[s]).join(' · ')+'</div>';
			html+='</div>';
			try{
				const cdata=await api('/api/operating-center/object-creation/calendar?kind=challenge');
				const rows=cdata.challenge||[];
				html+='<div class="item"><strong>Challenge calendar</strong><div class="detail">'+rows.length+' entr'+(rows.length===1?'y':'ies')+'</div>';
				if(rows.length)html+='<div class="detail">'+rows.slice(0,5).map(r=>'&bull; '+esc(r.title)+(r.event_date?' · '+esc(r.event_date):'')).join('<br>')+'</div>';
				html+='</div>';
			}catch(err){html+='<div class="item"><strong>Challenge calendar <span class="badge-warn">unavailable</span></strong><div class="detail">'+esc(err.message)+'</div></div>';}
			const attn=packets.filter(p=>p.status!=='complete'&&p.status!=='manual_pending');
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(p=>'<a href="'+esc(challenges_packetLink(p))+'">'+esc(p.title)+'</a> ('+esc(p.status)+')').join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Keeps the challenge packet lifecycle and the challenge calendar from live packet data. Creating the object itself is always a dashboard step; the Machine never claims otherwise.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_challenges_actions(){
		const box=document.querySelector('#challenges-act');
		box.innerHTML='<div class="item"><strong>Create a challenge packet</strong>'+
			'<div class="detail">Packet creation lives in the Creation tab: the Machine builds the dry-run plan there and you confirm each write.</div>'+
			'<div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="secondary" id="challenges-new-packet">New packet in Creation</button></div></div>';
		const btn=box.querySelector('#challenges-new-packet');
		if(btn)btn.addEventListener('click',function(){__spoSetView('creation','actions',true);});
	}
	async function boot_challenges_details(){
		const pb=document.querySelector('#challenges-det-packets');
		try{
			const packets=await challenges_fetchPackets();
			pb.innerHTML=packets.length?packets.map(p=>
				'<div class="item"><strong><a href="'+esc(challenges_packetLink(p))+'">'+esc(p.title)+'</a>'+challenges_statusBadge(p.status)+'</strong>'+
				'<div class="detail"><b>Kind:</b> '+esc(p.kind_label||p.kind)+' · <b>Status:</b> '+esc(p.status)+'</div>'+
				'<div class="detail"><b>Event date:</b> '+esc(p.event_date||'not recorded')+(p.runsignup_race_id?' · <b>Race ID:</b> '+esc(p.runsignup_race_id):' · race not linked yet')+'</div></div>'
			).join(''):'<div class="unavailable">No challenge packets yet. Create one in the Creation tab.</div>';
		}catch(err){pb.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		const cb=document.querySelector('#challenges-det-calendar');
		try{
			const cdata=await api('/api/operating-center/object-creation/calendar?kind=challenge');
			const rows=cdata.challenge||[];
			cb.innerHTML=rows.length?'<table class="data"><thead><tr><th>Challenge</th><th>Date</th><th>Status</th><th>Public page</th></tr></thead><tbody>'+
				rows.map(r=>'<tr><td>'+esc(r.title)+'</td><td>'+esc(r.event_date||'—')+'</td><td>'+esc(r.status||'—')+'</td><td>'+(r.url?'<a href="'+esc(r.url)+'" target="_blank" rel="noopener">Open</a>':'—')+'</td></tr>').join('')+'</tbody></table>'
				:'<div class="unavailable">No challenge calendar entries.</div>';
		}catch(err){cb.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const CHALLENGES_PANELS = ocFunction(
	"challenges",
	"Challenges — creation packets by status plus the challenge calendar. Packet creation lives in the Creation tab.",
	CHALLENGES_SUMMARY_HTML,
	CHALLENGES_ACTIONS_HTML,
	CHALLENGES_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 4. Groups
// ---------------------------------------------------------------------------

const GROUPS_SUMMARY_HTML = `<section class="panel"><h2>Groups summary</h2><div id="groups-sum">Loading…</div></section>`;

const GROUPS_ACTIONS_HTML = `<section class="panel"><h2>Groups actions</h2>
	<p class="meta"><strong>Machine (automatic):</strong> shows the public ladder and funnel below. <strong>Owner (manual):</strong> there are no group mutations in the API — groups register themselves through the public funnel. The buttons below open the funnel pages.</p>
	<div id="groups-act">Loading…</div></section>`;

const GROUPS_DETAILS_HTML = `<section class="panel"><h2>Ladder detail</h2><div id="groups-det-ladder">Loading…</div></section>
	<section class="panel"><h2>Public funnel</h2><div id="groups-det-funnel">Loading…</div></section>`;

const GROUPS_SCRIPT = `
	async function groups_fetchOverview(){
		return await api('/api/operating-center/groups/overview');
	}
	async function boot_groups_summary(){
		const box=document.querySelector('#groups-sum');
		try{
			const data=await groups_fetchOverview();
			let html='<div class="item"><strong>Growth ladder</strong>';
			for(const s of (data.ladder||[])){
				html+='<div class="detail">&bull; <b>'+esc(s.step)+'</b> — '+esc(s.description)+'</div>';
			}
			html+='</div>';
			const f=data.funnel||{};
			html+='<div class="item"><strong>Public funnel</strong><div class="detail"><a href="'+esc(f.member_org)+'" target="_blank" rel="noopener">'+esc(f.member_org)+'</a><br><a href="'+esc(f.register)+'" target="_blank" rel="noopener">'+esc(f.register)+'</a></div></div>';
			html+='<div class="item"><strong>Group counts <span class="badge-warn">not yet tracked</span></strong><div class="detail">'+esc(data.stats&&data.stats.note||'No group statistics are tracked yet.')+'</div></div>';
			html+='<div class="item"><strong>Needs attention</strong><div class="detail">Group counts are not tracked yet — the next step is to start counting registered groups so the network size is visible here.</div></div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Keeps this overview from the live groups configuration. Groups register through the public funnel; the Machine does not create them.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_groups_actions(){
		const box=document.querySelector('#groups-act');
		try{
			const data=await groups_fetchOverview();
			const f=data.funnel||{};
			box.innerHTML='<div class="item"><strong>Member organization page</strong><div class="detail">Public page groups use to join the network.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="'+esc(f.member_org)+'" target="_blank" rel="noopener">Open member page</a></div></div>'+
				'<div class="item"><strong>Group registration</strong><div class="detail">Public registration funnel for new groups.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="'+esc(f.register)+'" target="_blank" rel="noopener">Open registration</a></div></div>'+
				'<div class="item"><strong>No other group actions exist</strong><div class="detail">The API has no group create/update/delete operations. If a mutation is needed, it happens manually on the public site — nothing here is wired to a fake endpoint.</div></div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_groups_details(){
		try{
			const data=await groups_fetchOverview();
			const lb=document.querySelector('#groups-det-ladder');
			lb.innerHTML=(data.ladder||[]).length?(data.ladder||[]).map(function(s){
				return '<div class="item"><strong>'+esc(s.step)+'</strong><div class="detail">'+esc(s.description)+'</div></div>';
			}).join(''):'<div class="unavailable">No ladder steps configured.</div>';
			const f=data.funnel||{};
			const fb=document.querySelector('#groups-det-funnel');
			fb.innerHTML='<table class="data"><tbody>'+
				'<tr><th>Member organization page</th><td><a href="'+esc(f.member_org)+'" target="_blank" rel="noopener">'+esc(f.member_org)+'</a></td></tr>'+
				'<tr><th>Group registration</th><td><a href="'+esc(f.register)+'" target="_blank" rel="noopener">'+esc(f.register)+'</a></td></tr>'+
				'</tbody></table>';
		}catch(err){
			const m=document.querySelector('#tabpanel-groups .oc-tab-error');
			if(m)m.textContent='Error: '+(err.message||err);
		}
	}
`;

const GROUPS_PANELS = ocFunction(
	"groups",
	"NW Groups — the public ladder, the registration funnel, and what the network needs next. Groups register themselves; group counts are not tracked yet.",
	GROUPS_SUMMARY_HTML,
	GROUPS_ACTIONS_HTML,
	GROUPS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 5. Creation (list + new-packet form + packet detail, all 5 steps)
// ---------------------------------------------------------------------------

// Custom classes used by the creation tab that the shared shell does not
// define, scoped to this tabpanel so they cannot leak into the other tabs.
const CREATION_CSS = `<style>
	#tabpanel-creation .badge-err{display:inline-block;background:#fbe4e4;border-radius:6px;padding:2px 8px;font-size:13px;color:#a4262c;font-weight:650;margin-left:8px}
	#tabpanel-creation .warn{color:#a4262c;font-weight:650}
	#tabpanel-creation .note{color:#66736d;font-size:14px}
	#tabpanel-creation pre.payload{background:#0f1a14;color:#d7e6dc;border-radius:9px;padding:12px;overflow:auto;font-size:12.5px;max-height:320px}
	#tabpanel-creation ol.steps{margin:8px 0;padding-left:22px}
	#tabpanel-creation .row{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
	@media(max-width:700px){#tabpanel-creation .row{grid-template-columns:1fr}}
	#tabpanel-creation .btnrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}
	#tabpanel-creation .btnrow button{width:auto;margin-top:0}
</style>`;

const CREATION_SUMMARY_HTML = CREATION_CSS + `<section class="panel"><h2>Creation summary</h2><div id="creation-sum">Loading…</div></section>`;

const CREATION_ACTIONS_HTML = `<section class="panel"><h2>New object packet</h2>
		<p class="meta"><strong>Machine (automatic):</strong> builds the 5-step dry-run plan, runs the read-only credential probe, and applies API steps only after your typed APPLY_STEP confirmation. Creating the object itself is always a dashboard step. <strong>Owner (manual):</strong> the actions below.</p>
		<form id="new-packet-form">
			<label for="np-kind">Object kind</label>
			<select id="np-kind" name="kind">${OBJECT_CREATION_KINDS.map(
				(k) => `<option value="${escHtml(k.kind)}">${escHtml(k.label)}</option>`,
			).join("")}</select>
			<label for="np-title">Title</label>
			<input id="np-title" name="title" required maxlength="200" placeholder="e.g. NWANA Open 5K — Orlando">
			<div class="row">
				<div><label for="np-date">Event date</label><input id="np-date" name="event_date" placeholder="YYYY-MM-DD"></div>
				<div><label for="np-distance">Distance</label><input id="np-distance" name="distance" placeholder="e.g. 5K"></div>
			</div>
			<div class="row">
				<div><label for="np-format">Format</label><input id="np-format" name="format" placeholder="in-person / virtual"></div>
				<div><label for="np-fb">Facebook page ID</label><input id="np-fb" name="facebook_page_id" placeholder="optional"></div>
			</div>
			<label for="np-desc">Description</label>
			<textarea id="np-desc" name="description" placeholder="Written to the RunSignup race via API after the race is linked."></textarea>
			<div class="row">
				<div><label for="np-url">External race URL</label><input id="np-url" name="external_race_url" placeholder="https://…"></div>
				<div><label for="np-results">External results URL</label><input id="np-results" name="external_results_url" placeholder="https://…"></div>
			</div>
			<div class="row">
				<div><label for="np-parent">Parent series / championship object ID</label><input id="np-parent" name="parent_object_id" placeholder="optional — e.g. RUNSIGNUP-RACE-123"></div>
				<div><label class="check"><input type="checkbox" id="np-news" name="announce_news"> Announce on the public site (news item)</label></div>
			</div>
			<label for="np-notes">Notes</label>
			<textarea id="np-notes" name="notes" placeholder="Internal notes for the owner."></textarea>
			<button type="submit">Create packet</button>
			<div class="message" id="new-packet-message" aria-live="polite"></div>
		</form>
		<p class="note">Registration periods, age-based pricing, questions, and coupons can be added on the packet page after creation.</p>
	</section>
	<section class="panel"><h2>Creation packets</h2><div id="packet-list">Loading…</div><div class="message" id="packet-message"></div></section>
	<section class="panel"><h2>Packet detail</h2>
		<div class="message" id="packet-detail-hint">Select a packet to open its 5-step detail.</div>
		<div id="packet-detail-wrap" hidden><div id="packet-body">Loading…</div></div>
	</section>`;

const CREATION_DETAILS_HTML = creationCapabilityTableHtml() +
	`<section class="panel"><h2>Packet records</h2><div id="creation-det-packets">Loading…</div></section>`;

const CREATION_SCRIPT = `
	function creation_packetId(){try{return new URLSearchParams(location.search).get('packet_id')||''}catch(e){return ''}}
	function creation_packetLink(p){return '/operating-center/sport?tab=creation&view=actions&packet_id='+encodeURIComponent(p.packet_id);}
	function creation_stepBadge(s){
		if(s==='done')return '<span class="badge-ok">done</span>';
		if(s==='error')return '<span class="badge-err">error</span>';
		if(s==='skipped')return '<span class="badge">skipped</span>';
		return '<span class="badge">pending</span>';
	}
	function creation_prettify(v){try{return JSON.stringify(v,null,2)}catch(e){return String(v)}}
	async function creation_fetchPackets(){return await api('/api/operating-center/object-creation/packets');}
	async function boot_creation_summary(){
		const box=document.querySelector('#creation-sum');
		try{
			const data=await creation_fetchPackets();
			const packets=data.packets||[];
			const byStatus={},byKind={};
			for(const p of packets){byStatus[p.status]=(byStatus[p.status]||0)+1;byKind[p.kind]=(byKind[p.kind]||0)+1;}
			let html='<div class="item"><strong>Creation packets</strong><div class="detail">'+packets.length+' packet(s) in total</div>';
			if(packets.length){
				html+='<div class="detail">By status: '+Object.keys(byStatus).map(s=>esc(s)+': '+byStatus[s]).join(' · ')+'</div>';
				html+='<div class="detail">By kind: '+Object.keys(byKind).map(k=>esc(k)+': '+byKind[k]).join(' · ')+'</div>';
			}
			html+='</div>';
			html+='<div class="item"><strong>What the Machine does</strong><div class="detail">Builds a dry-run plan for every packet (verify/link race → read-only credential probe → per-step API applies with typed APPLY_STEP confirmation → manual last mile). Nothing is applied without your explicit confirmation per step; creating the object itself always stays a dashboard step.</div></div>';
			const stuck=packets.filter(p=>p.status!=='complete'&&p.status!=='manual_pending');
			html+='<div class="item"><strong>Needs attention</strong>'+(stuck.length?'<div class="detail">&bull; '+stuck.map(p=>'<a href="'+esc(creation_packetLink(p))+'">'+esc(p.title)+'</a> ('+esc(p.status)+')').join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_creation_actions(){
		const box=document.querySelector('#packet-list');
		try{
			const data=await creation_fetchPackets();
			const packets=data.packets||[];
			if(!packets.length){box.innerHTML='<div class="unavailable">No creation packets yet. Create the first one above.</div>'}
			else{
				box.innerHTML=packets.map(p=>{
					const statusBadge=p.status==='complete'
						?'<span class="badge-ok">complete</span>'
						:p.status==='manual_pending'
						?'<span class="badge-warn">manual last mile</span>'
						:'<span class="badge">in progress</span>';
					const race=p.runsignup_race_id?'<div class="detail"><b>Race ID:</b> '+esc(p.runsignup_race_id)+(p.runsignup_race_name?' — '+esc(p.runsignup_race_name):'')+'</div>':'<div class="detail"><b>Race ID:</b> not linked yet</div>';
					return '<div class="item"><strong><a href="'+esc(creation_packetLink(p))+'">'+esc(p.title)+'</a>'+statusBadge+'</strong>'+
						'<div class="detail"><b>Kind:</b> '+esc(p.kind_label||p.kind)+' · <b>Status:</b> '+esc(p.status)+'</div>'+race+'</div>';
				}).join('');
			}
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		const form=document.querySelector('#new-packet-form');
		if(form&&!form.dataset.wired){
			form.dataset.wired='1';
			form.addEventListener('submit',async e=>{
				e.preventDefault();
				const m=document.querySelector('#new-packet-message');m.textContent='Creating…';
				const f=new FormData(e.currentTarget);
				const body={};
				['kind','title','description','event_date','distance','format','external_race_url','external_results_url','facebook_page_id','notes'].forEach(k=>{const v=String(f.get(k)||'').trim();if(v)body[k]=v});
				const parent=String(f.get('parent_object_id')||'').trim();if(parent)body.parent_object_id=parent;
				body.announce_news=f.get('announce_news')==='on';
				try{
					const data=await api('/api/operating-center/object-creation/packets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
					location.href='/operating-center/sport?tab=creation&view=actions&packet_id='+encodeURIComponent(data.packet.packet_id);
				}catch(err){m.textContent=err.message}
			});
		}
		const pid=creation_packetId();
		const wrap=document.querySelector('#packet-detail-wrap');
		const hint=document.querySelector('#packet-detail-hint');
		if(wrap)wrap.hidden=!pid;
		if(hint)hint.hidden=!!pid;
		if(pid){await boot_creation_detail()}
	}
	async function boot_creation_detail(){
		const pid=creation_packetId();
		const box=document.querySelector('#packet-body');
		if(!pid){box.innerHTML='<div class="unavailable">Missing packet_id.</div>';return}
		try{
			const data=await api('/api/operating-center/object-creation/packet?packet_id='+encodeURIComponent(pid));
			creation_render(data.packet,data.plan);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	function creation_render(p,plan){
		const meta=p.meta||{};
		const steps=plan.steps||[];
		const manual=plan.manual_last_mile||[];
		let h='<section class="panel"><h2>'+esc(p.title)+'</h2>'+
			'<div class="detail"><b>Kind:</b> '+esc(meta.kind||'')+' · <b>Status:</b> '+esc(p.status)+
			' · <b>Write access:</b> '+esc(plan.write_access||'UNKNOWN')+'</div>'+
			(plan.linked
				?'<div class="detail"><b>RunSignup race:</b> '+esc(plan.runsignup_race_id)+(meta.runsignup_race_name?' — '+esc(meta.runsignup_race_name):'')+'</div>'
				:'<div class="detail"><b>RunSignup race:</b> not linked yet</div>')+
			(plan.probe_note?'<div class="detail"><b>Probe:</b> '+esc(plan.probe_note)+'</div>':'')+
			'<div class="detail meta">'+esc(plan.report||'')+'</div>';
		if(meta.fanout){
			const f=meta.fanout;
			const items=[];
			if(f.calendar)items.push('<b>Public calendar</b> ('+esc(f.calendar.kind)+')');
			if(f.parent_relationship)items.push('<b>Series/championship link</b>');
			if(f.news)items.push('<b>News</b> /'+esc(f.news.slug));
			if(f.sponsorship_asset)items.push('<b>Sponsorship draft</b>'+(f.sponsorship_asset.generated?' (new)':''));
			if(f.activity)items.push('<b>Activity log</b>');
			h+='<div class="detail"><b>Published surfaces:</b> '+(items.length?items.join(' · '):'none')+'</div>';
		}
		h+='</section>';

		h+='<section class="panel"><h2>1. Link the dashboard-created race</h2>'+
			'<p class="meta">Create the object in the RunSignup dashboard first (the API cannot do it), then paste the Race ID. The machine verifies it with a read-only API call.</p>'+
			'<form id="link-form"><div class="row"><div><label for="link-race">Race ID</label><input id="link-race" name="race_id" inputmode="numeric" placeholder="e.g. 123456"'+(plan.linked?' value="'+esc(plan.runsignup_race_id)+'"':'')+'></div>'+
			'<div><label for="link-event">Event ID (optional)</label><input id="link-event" name="event_id" inputmode="numeric" placeholder="needed for periods / pricing"'+(meta.runsignup_event_id?' value="'+esc(meta.runsignup_event_id)+'"':'')+'></div></div>'+
			'<button type="submit">Verify and link</button><div class="message" id="link-message"></div></form></section>';

		h+='<section class="panel"><h2>2. Read-only credential probe</h2>'+
			'<p class="meta">A safe GET that never writes anything. The workflow is not ready until this probe succeeds.</p>'+
			'<button type="button" class="secondary" id="probe-btn">Run read-only probe</button><div class="message" id="probe-message"></div></section>';

		h+='<section class="panel"><h2>3. API steps — dry-run plan</h2>'+
			'<p class="meta">Nothing below is executed until you type APPLY_STEP under a step and confirm it. Steps marked full replace show their payload for review first.</p>';
		if(!steps.length){h+='<div class="unavailable">No API steps: add fields on this page (section 5) or create a richer packet.</div>'}
		steps.forEach(s=>{
			h+='<div class="item"><strong>'+esc(s.title)+creation_stepBadge(s.status)+'</strong>'+
				'<div class="detail">'+esc(s.description)+'</div>'+
				(s.endpoint?'<div class="detail"><b>Endpoint:</b> '+esc(s.endpoint)+'</div>':'')+
				(s.replace_semantics?'<div class="detail"><b>Semantics:</b> '+esc(s.replace_semantics)+'</div>':'')+
				(s.warnings&&s.warnings.length?'<div class="detail warn">'+s.warnings.map(w=>'⚠ '+esc(w)).join('<br>')+'</div>':'')+
				(s.needs_event_id?'<div class="detail warn">Waiting for the Event ID: set it in section 1 after creating the event in the dashboard.</div>':'');
			if(s.payload_preview!=null){h+='<pre class="payload">'+esc(creation_prettify(s.payload_preview))+'</pre>'}
			if(s.status==='pending'||s.status==='error'){
				h+='<form class="apply-form" data-step="'+esc(s.step_id)+'"><label>Type APPLY_STEP to confirm this write</label>'+
					'<input name="confirm" placeholder="APPLY_STEP" autocomplete="off">'+
					'<button type="submit" class="secondary">Apply this step via API</button><div class="message"></div></form>';
			}
			h+='</div>';
		});
		h+='</section>';

		h+='<section class="panel"><h2>4. Manual last mile</h2>'+
			'<p class="meta">Only what the API cannot do. Each item tells you the exact dashboard location.</p>';
		manual.forEach(s=>{
			h+='<div class="item"><strong>'+esc(s.title)+creation_stepBadge(s.status)+'</strong>'+
				'<div class="detail">'+esc(s.description)+'</div>';
			if(s.dashboard_steps&&s.dashboard_steps.length){
				h+='<ol class="steps">'+s.dashboard_steps.map(d=>'<li>'+esc(d)+'</li>').join('')+'</ol>';
			}
			if(s.status==='pending'||s.status==='error'){
				h+='<button type="button" class="secondary manual-btn" data-step="'+esc(s.step_id)+'">Mark done</button>';
			}
			h+='</div>';
		});
		h+='</section>';

		h+='<section class="panel"><h2>5. Edit packet fields</h2>'+
			'<p class="meta">Changes rebuild the step plan and keep completed steps done. Arrays are JSON (e.g. registration periods, pricing, questions, coupons).</p>'+
			'<form id="fields-form">'+
			'<label for="f-desc">Description</label><textarea id="f-desc" name="description">'+esc(meta.description||'')+'</textarea>'+
			'<div class="row"><div><label for="f-date">Event date</label><input id="f-date" name="event_date" value="'+esc(meta.event_date||'')+'"></div>'+
			'<div><label for="f-distance">Distance</label><input id="f-distance" name="distance" value="'+esc(meta.distance||'')+'"></div></div>'+
			'<div class="row"><div><label for="f-format">Format</label><input id="f-format" name="format" value="'+esc(meta.format||'')+'"></div>'+
			'<div><label for="f-fb">Facebook page ID</label><input id="f-fb" name="facebook_page_id" value="'+esc(meta.facebook_page_id||'')+'"></div></div>'+
			'<div class="row"><div><label for="f-url">External race URL</label><input id="f-url" name="external_race_url" value="'+esc(meta.external_race_url||'')+'"></div>'+
			'<div><label for="f-results">External results URL</label><input id="f-results" name="external_results_url" value="'+esc(meta.external_results_url||'')+'"></div></div>'+
			'<div class="row"><div><label for="f-event">Event ID</label><input id="f-event" name="runsignup_event_id" inputmode="numeric" value="'+esc(meta.runsignup_event_id||'')+'"></div>'+
			'<div><label for="f-parent">Parent series / championship object ID</label><input id="f-parent" name="parent_object_id" value="'+esc(meta.parent_object_id||'')+'"></div></div>'+
			'<div class="row"><div><label class="check"><input type="checkbox" id="f-news" name="announce_news"'+(meta.announce_news?' checked':'')+'> Announce on the public site</label></div>'+
			'<div><label class="check"><input type="checkbox" id="f-spons" name="sponsorship_relevant"'+(meta.sponsorship_relevant===false?'':' checked')+'> Sponsorship-relevant</label></div></div>'+
			'<div class="row"><div><label for="f-append">Questions mode</label><select id="f-append" name="append_questions"><option value="T"'+(meta.append_questions===false?'':' selected')+'>Append (safe, keeps existing)</option><option value="F"'+(meta.append_questions===false?' selected':'')+'>Replace (deletes omitted)</option></select></div></div>'+
			'<label for="f-periods">Registration periods (JSON array)</label><textarea id="f-periods" name="registration_periods">'+esc(creation_prettify(meta.registration_periods||[]))+'</textarea>'+
			'<label for="f-pricing">Age-based pricing (JSON array)</label><textarea id="f-pricing" name="age_based_pricing">'+esc(creation_prettify(meta.age_based_pricing||[]))+'</textarea>'+
			'<label for="f-questions">Questions (JSON array)</label><textarea id="f-questions" name="questions">'+esc(creation_prettify(meta.questions||[]))+'</textarea>'+
			'<label for="f-coupons">Coupons (JSON array)</label><textarea id="f-coupons" name="coupons">'+esc(creation_prettify(meta.coupons||[]))+'</textarea>'+
			'<label for="f-notes">Notes</label><textarea id="f-notes" name="notes">'+esc(meta.notes||'')+'</textarea>'+
			'<button type="submit">Save fields</button><div class="message" id="fields-message"></div></form></section>';

		box.innerHTML=h;

		document.querySelector('#link-form').addEventListener('submit',async e=>{
			e.preventDefault();
			const m=document.querySelector('#link-message');m.textContent='Verifying…';
			const f=new FormData(e.currentTarget);
			const body={packet_id:creation_packetId(),race_id:Number(f.get('race_id'))};
			const eid=String(f.get('event_id')||'').trim();
			if(eid)body.event_id=Number(eid);
			try{const d=await api('/api/operating-center/object-creation/link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});m.textContent='Linked: race '+d.race_id+(d.race_name?' ('+d.race_name+')':'');boot_creation_detail()}catch(err){m.textContent=err.message}
		});
		document.querySelector('#probe-btn').addEventListener('click',async e=>{
			const m=document.querySelector('#probe-message');m.textContent='Probing (read-only)…';
			try{const d=await api('/api/operating-center/object-creation/probe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({packet_id:creation_packetId()})});m.textContent=d.probe.note;boot_creation_detail()}catch(err){m.textContent=err.message}
		});
		Array.prototype.forEach.call(document.querySelectorAll('.apply-form'),form=>{
			form.addEventListener('submit',async e=>{
				e.preventDefault();
				const m=form.querySelector('.message');
				const confirm=String(new FormData(form).get('confirm')||'').trim();
				if(confirm!=='APPLY_STEP'){m.textContent='Type APPLY_STEP exactly to confirm.';return}
				m.textContent='Applying…';
				try{const d=await api('/api/operating-center/object-creation/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({packet_id:creation_packetId(),step_id:form.dataset.step,confirm:'APPLY_STEP'})});m.textContent=d.detail;boot_creation_detail()}catch(err){m.textContent=err.message}
			});
		});
		Array.prototype.forEach.call(document.querySelectorAll('.manual-btn'),btn=>{
			btn.addEventListener('click',async ()=>{
				try{await api('/api/operating-center/object-creation/manual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({packet_id:creation_packetId(),step_id:btn.dataset.step})});boot_creation_detail()}catch(err){btn.textContent='Failed: '+err.message}
			});
		});
		document.querySelector('#fields-form').addEventListener('submit',async e=>{
			e.preventDefault();
			const m=document.querySelector('#fields-message');m.textContent='Saving…';
			const f=new FormData(e.currentTarget);
			const body={packet_id:creation_packetId()};
			['description','event_date','distance','format','external_race_url','external_results_url','facebook_page_id','notes'].forEach(k=>{body[k]=String(f.get(k)||'')});
			const par=String(f.get('parent_object_id')||'').trim();body.parent_object_id=par;
			body.announce_news=f.get('announce_news')==='on';
			body.sponsorship_relevant=f.get('sponsorship_relevant')==='on';
			const eid=String(f.get('runsignup_event_id')||'').trim();
			if(eid)body.runsignup_event_id=Number(eid);
			body.append_questions=String(f.get('append_questions')||'T')==='T';
			try{
				['registration_periods','age_based_pricing','questions','coupons'].forEach(k=>{
					const raw=String(f.get(k)||'').trim();
					body[k]=raw?JSON.parse(raw):[];
				});
			}catch(err){m.textContent='Invalid JSON: '+err.message;return}
			try{await api('/api/operating-center/object-creation/fields',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});m.textContent='Saved.';boot_creation_detail()}catch(err){m.textContent=err.message}
		});
	}
	async function boot_creation_details(){
		const box=document.querySelector('#creation-det-packets');
		try{
			const data=await creation_fetchPackets();
			const packets=data.packets||[];
			box.innerHTML=packets.length?'<table class="data"><thead><tr><th>Packet</th><th>Kind</th><th>Status</th><th>Event date</th><th>RunSignup race</th></tr></thead><tbody>'+
				packets.map(p=>'<tr><td><a href="'+esc(creation_packetLink(p))+'">'+esc(p.title)+'</a></td><td>'+esc(p.kind_label||p.kind)+'</td><td>'+esc(p.status)+'</td><td>'+esc(p.event_date||'—')+'</td><td>'+(p.runsignup_race_id?esc(p.runsignup_race_id)+(p.runsignup_race_name?' — '+esc(p.runsignup_race_name):''):'not linked')+'</td></tr>').join('')+'</tbody></table>'
				:'<div class="unavailable">No creation packets yet.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const CREATION_PANELS = ocFunction(
	"creation",
	"Object creation — the Machine's 5-step pipeline for races, series, championships, and challenges: dry-run plans, read-only probes, confirmed writes, and the manual last mile.",
	CREATION_SUMMARY_HTML,
	CREATION_ACTIONS_HTML,
	CREATION_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// Section export
// ---------------------------------------------------------------------------

export function renderSportSectionHtml(): string {
	return ocSectionShell({
		section: "sport",
		title: "Sport",
		subtitle: "Results, competitions, groups, and creation.",
		queryTabs: true,
		tabs: [
			{ id: "results", label: "Results", panelsHtml: RESULTS_PANELS, script: RESULTS_SCRIPT },
			{ id: "series", label: "Series", panelsHtml: SERIES_PANELS, script: SERIES_SCRIPT },
			{ id: "challenges", label: "Challenges", panelsHtml: CHALLENGES_PANELS, script: CHALLENGES_SCRIPT },
			{ id: "groups", label: "Groups", panelsHtml: GROUPS_PANELS, script: GROUPS_SCRIPT, reportId: "groups" },
			{ id: "creation", label: "Creation", panelsHtml: CREATION_PANELS, script: CREATION_SCRIPT + ocViewScript("spo", ["results", "series", "challenges", "groups", "creation"]) },
		],
	});
}
