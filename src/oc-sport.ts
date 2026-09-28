// Operating Center — Sport section (7-section rebuild).
//
// Thin shell around ocSectionShell with five tabs:
//  1. results — Series 2026 race results: result publication (Publish
//     buttons), per-distance race lifecycle with Confirm prep, sync status,
//     and per-event/per-level result tables. Was renderRaceResultsHtml
//     (src/operating-center.ts).
//  2. series — series/championship/race creation packets + competition
//     calendar (NEW).
//  3. challenges — challenge creation packets + challenge calendar (NEW).
//  4. groups — NW Groups network overview. Was renderGroupsHtml
//     (src/operating-center-screens.ts); report id "groups" reused unchanged.
//  5. creation — object creation packets + new-packet form + the packet
//     detail (all 5 steps: verify/link race, credential probe, per-step
//     APPLY_STEP confirm forms, manual last mile with Mark-done buttons).
//     Was renderCreationHtml / renderCreationPacketHtml
//     (src/operating-center-creation.ts); the packet detail is an inline
//     panel shown only when ?packet_id= is present.
//
// Tab scripts reuse the shell's global esc()/api(); the owner-key gate lives
// in the shell, so no tab script touches the gate. The shell concatenates all
// tab scripts into one <script> block, so every top-level name in them is
// unique across the page (prefixed by tab id where needed).

import { ocSectionShell } from "./oc-shell";
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
// define (.ok/.err/.event/.sync-status/plain tables), scoped to this tabpanel
// so they cannot leak into the other tabs.
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
</style>`;

const RESULTS_PANELS = RESULTS_CSS + `<section class="panel">
			<h2>Result publication</h2>
			<p class="meta">One click per ready result: publishes to 4 Meta destinations and the NWANA site news (winner announcement + next-race promo). Requires the owner key and an explicit confirmation. Already-published results are skipped automatically.</p>
			<div id="pub-drafts">Loading…</div>
		</section>
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
		<div id="results">Loading…</div>`;

const RESULTS_SCRIPT = `
	const results_DISTANCES=['1K','3K','5K','10K','15K','20K'];
	function results_publicationLabel(s){return s==='PUBLISHED'?'Published':s==='BASELINE'?'Historical baseline':'Not published yet'}
	function results_renderSyncStatus(statuses){
		document.querySelector('#sync-status').innerHTML=statuses.map(s=>
			'<div><strong>'+esc(s.distance)+'</strong><br>'+
			(s.ok?'<span class="ok">Synced</span>':'<span class="err">Sync failed</span><br><span class="meta">'+esc(s.error)+'</span>')+
			'</div>').join('');
	}
	function results_renderLevelBlock(level,rows){
		const body=rows.length?'<table><thead><tr><th>Athlete</th><th>Gender</th><th>Time</th><th>Level place</th></tr></thead><tbody>'+
			rows.map(r=>'<tr><td>'+esc(r.athlete)+'</td><td>'+esc(r.gender)+'</td><td>'+esc(r.time)+'</td><td>'+esc(r.level_place)+'</td></tr>').join('')+'</tbody></table>'
			:'<div class="unavailable">No finishers in this level.</div>';
		return '<h4>'+esc(level.name)+' ('+esc(level.threshold)+')</h4>'+body;
	}
	function results_renderResults(data){
		const box=document.querySelector('#results');
		if(!data.distances.length){box.innerHTML='<div class="panel"><div class="unavailable">No results yet.</div></div>';return}
		box.innerHTML=data.distances.map(d=>{
			const levels=Array.isArray(d.levels)&&d.levels.length?d.levels:[];
			const events=d.events.length?d.events.map(e=>{
				const link=e.results_url?'<a href="'+esc(e.results_url)+'" target="_blank" rel="noopener">Full results on RunSignup</a>':'<span class="unavailable">RunSignup link not available</span>';
				const blocks=levels.length?levels.map(l=>{
					const rows=(e.results||[]).filter(r=>String(r.performance_level||'').indexOf(l.name)===0);
					return results_renderLevelBlock(l,rows);
				}).join(''):'<div class="unavailable">No results synced for this event yet.</div>';
				return '<div class="event"><h3>'+esc(e.event_name||('Event '+e.event_id))+' · '+esc(e.event_date||'')+'</h3>'+
					'<div class="meta">'+esc(String(e.result_count))+' results'+(e.finalized?' · finalized':'')+' · Publication: '+esc(results_publicationLabel(e.publication_status))+' · '+link+'</div>'+blocks+'</div>';
			}).join(''):'<div class="unavailable">No past races with results yet.</div>';
			return '<section class="panel"><h2>'+esc(d.distance)+' — '+esc(d.stage)+'</h2>'+
				'<div class="meta">'+(d.synced_at?'Synced '+esc(d.synced_at):'Never synced')+'</div>'+
				events+'</section>';
		}).join('');
	}
	async function results_loadLifecycle(){
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
				try{await api('/api/operating-center/race-lifecycle/prep-confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distance:btn.dataset.prep})});m.textContent='Prep confirmed.';await results_loadLifecycle()}catch(err){m.textContent=err.message}
			}));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function results_loadPubDrafts(){
		const box=document.querySelector('#pub-drafts');
		try{
			const data=await api('/sources/runsignup/series-2026/results-preview');
			const ready=(data.drafts||[]).filter(d=>d.publication_required);
			if(!ready.length){box.innerHTML='<div class="unavailable">No results ready for publication.</div>';return}
			box.innerHTML=ready.map(d=>{
				const title=(d.editorial_draft&&d.editorial_draft.title)||d.publication_key;
				const card='/result-publications/card/'+encodeURIComponent(d.publication_key)+'.jpg';
				return '<div class="event"><strong>'+esc(title)+'</strong>'+
					'<div class="meta">'+esc((d.source&&d.source.distance)||'')+' · Status: '+esc(d.publication_status)+'</div>'+
					'<div><a href="'+esc(card)+'" target="_blank" rel="noopener">Preview card</a></div>'+
					'<button data-pubkey="'+esc(d.publication_key)+'" style="width:auto">Publish result</button></div>';
			}).join('');
			box.querySelectorAll('[data-pubkey]').forEach(btn=>btn.addEventListener('click',async()=>{
				const key=btn.dataset.pubkey;
				if(!confirm('Publish this result?\\n\\nDestinations: 4 Meta pages + NWANA site news (winner announcement + next-race promo).\\nThis cannot be undone.'))return;
				btn.disabled=true;
				try{
					const res=await api('/result-publications/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({publication_key:key,confirmation:'PUBLISH'})});
					alert(res.already_published?'Already published.':'Published.');
					await results_loadPubDrafts();
				}catch(err){alert(err.message);btn.disabled=false}
			}));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_results(){
		const m=document.querySelector('#sync-message');
		m.textContent='Refreshing results from RunSignup…';
		const statuses=[];
		for(const d of results_DISTANCES){
			try{
				await api('/api/operating-center/race-lifecycle/sync?distance='+encodeURIComponent(d),{method:'POST'});
				statuses.push({distance:d,ok:true});
			}catch(err){statuses.push({distance:d,ok:false,error:err.message})}
			results_renderSyncStatus(statuses);
		}
		const failed=statuses.filter(s=>!s.ok);
		m.textContent=failed.length
			? 'Refresh finished with errors on '+failed.map(s=>s.distance).join(', ')+'. Showing the last synced results below.'
			: 'Results are up to date.';
		try{results_renderResults(await api('/api/operating-center/race-results'))}
		catch(err){document.querySelector('#results').innerHTML='<div class="panel"><div class="unavailable">'+esc(err.message)+'</div></div>'}
		await results_loadLifecycle();
		await results_loadPubDrafts();
	}
`;

// ---------------------------------------------------------------------------
// 2. Series (NEW)
// ---------------------------------------------------------------------------

const SERIES_PANELS = `<section class="panel"><h2>Series & championships</h2><div class="message" id="series-message"></div><div id="series-list">Loading…</div></section><section class="panel"><h2>Calendar</h2><div id="series-calendar">Loading…</div></section>`;

const SERIES_SCRIPT = `
	function series_statusBadge(status){
		if(status==='complete')return '<span class="badge-ok">complete</span>';
		if(status==='manual_pending')return '<span class="badge-warn">manual last mile</span>';
		return '<span class="badge">in progress</span>';
	}
	async function boot_series(){
		const msg=document.querySelector('#series-message');
		const list=document.querySelector('#series-list');
		const cal=document.querySelector('#series-calendar');
		try{
			const data=await api('/api/operating-center/object-creation/packets');
			const packets=(data.packets||[]).filter(p=>['series','championship','race'].indexOf(p.kind)>=0);
			msg.textContent=packets.length?packets.length+' packet(s).':'';
			if(!packets.length){list.innerHTML='<div class="unavailable">No series, championship, or race packets yet. Create one on the Creation tab.</div>'}
			else{
				list.innerHTML=packets.map(p=>
					'<div class="item"><strong><a href="/operating-center/sport?packet_id='+encodeURIComponent(p.packet_id)+'#creation">'+esc(p.title)+'</a>'+series_statusBadge(p.status)+'</strong>'+
					'<div class="detail"><b>Kind:</b> '+esc(p.kind_label||p.kind)+' · <b>Status:</b> '+esc(p.status)+'</div>'+
					'<div class="detail"><b>Event date:</b> '+esc(p.event_date||'not recorded')+'</div></div>'
				).join('');
			}
		}catch(err){list.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		try{
			const cdata=await api('/api/operating-center/object-creation/calendar?kind=series');
			const rows=cdata.competition||[];
			if(!rows.length){cal.innerHTML='<div class="unavailable">No competition calendar entries.</div>'}
			else{
				cal.innerHTML=rows.map(r=>
					'<div class="item"><strong>'+esc(r.title)+'</strong>'+
					'<div class="detail"><b>Event date:</b> '+esc(r.event_date||'not recorded')+' · <b>Status:</b> '+esc(r.status||'not recorded')+'</div>'+
					(r.url?'<div class="detail"><a href="'+esc(r.url)+'" target="_blank" rel="noopener">Public page</a></div>':'')+'</div>'
				).join('');
			}
		}catch(err){cal.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------
// 3. Challenges (NEW)
// ---------------------------------------------------------------------------

const CHALLENGES_PANELS = `<section class="panel"><h2>Challenges</h2><div class="message" id="challenges-message"></div><div id="challenges-list">Loading…</div></section><section class="panel"><h2>Calendar</h2><div id="challenges-calendar">Loading…</div></section>`;

const CHALLENGES_SCRIPT = `
	function challenges_statusBadge(status){
		if(status==='complete')return '<span class="badge-ok">complete</span>';
		if(status==='manual_pending')return '<span class="badge-warn">manual last mile</span>';
		return '<span class="badge">in progress</span>';
	}
	async function boot_challenges(){
		const msg=document.querySelector('#challenges-message');
		const list=document.querySelector('#challenges-list');
		const cal=document.querySelector('#challenges-calendar');
		try{
			const data=await api('/api/operating-center/object-creation/packets');
			const packets=(data.packets||[]).filter(p=>p.kind==='challenge');
			msg.textContent=packets.length?packets.length+' packet(s).':'';
			if(!packets.length){list.innerHTML='<div class="unavailable">No challenge packets yet. Create one on the Creation tab.</div>'}
			else{
				list.innerHTML=packets.map(p=>
					'<div class="item"><strong><a href="/operating-center/sport?packet_id='+encodeURIComponent(p.packet_id)+'#creation">'+esc(p.title)+'</a>'+challenges_statusBadge(p.status)+'</strong>'+
					'<div class="detail"><b>Kind:</b> '+esc(p.kind_label||p.kind)+' · <b>Status:</b> '+esc(p.status)+'</div>'+
					'<div class="detail"><b>Event date:</b> '+esc(p.event_date||'not recorded')+'</div></div>'
				).join('');
			}
		}catch(err){list.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		try{
			const cdata=await api('/api/operating-center/object-creation/calendar?kind=challenge');
			const rows=cdata.challenge||[];
			if(!rows.length){cal.innerHTML='<div class="unavailable">No challenge calendar entries.</div>'}
			else{
				cal.innerHTML=rows.map(r=>
					'<div class="item"><strong>'+esc(r.title)+'</strong>'+
					'<div class="detail"><b>Event date:</b> '+esc(r.event_date||'not recorded')+' · <b>Status:</b> '+esc(r.status||'not recorded')+'</div>'+
					(r.url?'<div class="detail"><a href="'+esc(r.url)+'" target="_blank" rel="noopener">Public page</a></div>':'')+'</div>'
				).join('');
			}
		}catch(err){cal.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------
// 4. Groups
// ---------------------------------------------------------------------------

const GROUPS_PANELS = `<section class="panel">
			<h2>Group network</h2>
			<div id="groups-list">Loading…</div>
		</section>`;

const GROUPS_SCRIPT = `
	async function boot_groups(){
		const box=document.querySelector('#groups-list');
		try{
			const data=await api('/api/operating-center/groups/overview');
			let html='<h3>How groups scale the federation</h3>';
			for(const s of (data.ladder||[])){
				html+='<div class="item"><strong>'+esc(s.step)+'</strong><div class="detail">'+esc(s.description)+'</div></div>';
			}
			html+='<h3>Public funnel</h3><div class="detail"><a href="'+esc(data.funnel.member_org)+'" target="_blank" rel="noopener">'+esc(data.funnel.member_org)+'</a><br><a href="'+esc(data.funnel.register)+'" target="_blank" rel="noopener">'+esc(data.funnel.register)+'</a></div>';
			html+='<div class="item"><strong>Group statistics<span class="badge-warn">Not yet tracked</span></strong><div class="detail">'+esc(data.stats.note)+'</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

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
</style>`;

const CREATION_LIST_SCRIPT = `
	async function boot_creation(){
		const box=document.querySelector('#packet-list');
		const msg=document.querySelector('#packet-message');
		try{
			const data=await api('/api/operating-center/object-creation/packets');
			const packets=data.packets||[];
			if(!packets.length){box.innerHTML='<div class="unavailable">No creation packets yet. Create the first one below.</div>'}
			else{
				box.innerHTML=packets.map(p=>{
					const statusBadge=p.status==='complete'
						?'<span class="badge-ok">complete</span>'
						:p.status==='manual_pending'
						?'<span class="badge-warn">manual last mile</span>'
						:'<span class="badge">in progress</span>';
					const race=p.runsignup_race_id?'<div class="detail"><b>Race ID:</b> '+esc(p.runsignup_race_id)+(p.runsignup_race_name?' — '+esc(p.runsignup_race_name):'')+'</div>':'<div class="detail"><b>Race ID:</b> not linked yet</div>';
					return '<div class="item"><strong><a href="/operating-center/sport?packet_id='+encodeURIComponent(p.packet_id)+'#creation">'+esc(p.title)+'</a>'+statusBadge+'</strong>'+
						'<div class="detail"><b>Kind:</b> '+esc(p.kind_label)+' · <b>Status:</b> '+esc(p.status)+'</div>'+race+'</div>';
				}).join('');
			}
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		const pid=new URLSearchParams(location.search).get('packet_id')||'';
		const wrap=document.querySelector('#packet-detail-wrap');
		const hint=document.querySelector('#packet-detail-hint');
		if(wrap)wrap.hidden=!pid;
		if(hint)hint.hidden=!!pid;
		if(pid){await boot_creation_detail()}
	}
	document.querySelector('#new-packet-form').addEventListener('submit',async e=>{
		e.preventDefault();
		const m=document.querySelector('#new-packet-message');m.textContent='Creating…';
		const f=new FormData(e.currentTarget);
		const body={};
		['kind','title','description','event_date','distance','format','external_race_url','external_results_url','facebook_page_id','notes'].forEach(k=>{const v=String(f.get(k)||'').trim();if(v)body[k]=v});
		const parent=String(f.get('parent_object_id')||'').trim();if(parent)body.parent_object_id=parent;
		body.announce_news=f.get('announce_news')==='on';
		try{
			const data=await api('/api/operating-center/object-creation/packets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
			location.href='/operating-center/sport?packet_id='+encodeURIComponent(data.packet.packet_id)+'#creation';
		}catch(err){m.textContent=err.message}
	});
`;

const CREATION_DETAIL_SCRIPT = `
	function creation_packetId(){return new URLSearchParams(location.search).get('packet_id')||''}
	function creation_stepBadge(s){
		if(s==='done')return '<span class="badge-ok">done</span>';
		if(s==='error')return '<span class="badge-err">error</span>';
		if(s==='skipped')return '<span class="badge">skipped</span>';
		return '<span class="badge">pending</span>';
	}
	function creation_prettify(v){try{return JSON.stringify(v,null,2)}catch(e){return String(v)}}
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
		// Published surfaces: where the linked object automatically appeared
		// (fan-out ran inside the link action — no second manual entry).
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
				(s.needs_event_id?'<div class="detail warn">Waiting for the Event ID: set it in section 1 after creating the event in the dashboard.</div>':'')+
				(s.payload_preview!=null?'<pre class="payload">'+esc(creation_prettify(s.payload_preview))+'</pre>':'')+
				(s.status==='error'&&meta.steps?('<div class="detail warn">Last error is shown on the packet record.</div>'):'');
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
`;

// ---------------------------------------------------------------------------
// Section export
// ---------------------------------------------------------------------------

export function renderSportSectionHtml(): string {
	const kindOptions = OBJECT_CREATION_KINDS.map(
		(k) => `<option value="${escHtml(k.kind)}">${escHtml(k.label)}</option>`,
	).join("");
	const creationPanels =
		CREATION_CSS +
		`<section class="panel"><h2>Creation packets</h2><div id="packet-list">Loading…</div><div class="message" id="packet-message"></div></section>` +
		`<section class="panel"><h2>New object packet</h2>
			<form id="new-packet-form">
				<label for="np-kind">Object kind</label>
				<select id="np-kind" name="kind">${kindOptions}</select>
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
			</section>` +
		creationCapabilityTableHtml() +
		`<section class="panel"><h2>Packet detail</h2>
			<div class="message" id="packet-detail-hint">Select a packet to open its 5-step detail.</div>
			<div id="packet-detail-wrap" hidden><div id="packet-body">Loading…</div></div>
		</section>`;
	return ocSectionShell({
		section: "sport",
		title: "Sport",
		subtitle: "Results, competitions, groups, and creation.",
		tabs: [
			{ id: "results", label: "Results", panelsHtml: RESULTS_PANELS, script: RESULTS_SCRIPT },
			{ id: "series", label: "Series", panelsHtml: SERIES_PANELS, script: SERIES_SCRIPT },
			{ id: "challenges", label: "Challenges", panelsHtml: CHALLENGES_PANELS, script: CHALLENGES_SCRIPT },
			{ id: "groups", label: "Groups", panelsHtml: GROUPS_PANELS, script: GROUPS_SCRIPT, reportId: "groups" },
			{ id: "creation", label: "Creation", panelsHtml: creationPanels, script: CREATION_LIST_SCRIPT + CREATION_DETAIL_SCRIPT },
		],
	});
}
