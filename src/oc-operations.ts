// Operating Center — Operations section.
//
// Three functions, each with [ Summary ] [ Actions ] [ Details ] views
// (approved pattern from src/oc-marketing.ts):
//  1. activity — live activity feed: summary (requires-reading count + 3
//     latest items), actions (the "Requires reading" inbox with a real
//     "Mark as read" button per item — the only verified owner action on
//     this page), details (the full "What is new" feed + full inbox).
//  2. system — the full operational queue grouped by source (report id
//     "operations" reused unchanged): summary = queue counts by status +
//     generated-at + Google Ads execution mode; actions = honest read-only
//     note + jump buttons to the owning section's Actions view per source;
//     details = the full queue + unrouted rules.
//  3. exceptions — the queue filtered to NEEDS_OWNER_INPUT and
//     BLOCKED_EXTERNAL: summary = counts + one-line needs; actions = the
//     jump-to-section buttons (where the owner actually acts on each
//     exception); details = full exception rows with owner input, external
//     blocker, and exact next step.
//
// All tab scripts share one OPS_* helper block (the shell concatenates every
// tab script into a single <script> block, so helpers are declared once and
// usable from any boot function). The shell's global esc()/api() are reused;
// the owner-key gate lives in the shell, so no tab script touches the gate.

import { ocSectionShell, ocFunction, ocViewScript } from "./oc-shell";

// Shared queue/feed helpers, declared once for the whole page (top-level
// names all ops_-prefixed and unique across the page).
const OPS_SHARED_SCRIPT = `
	async function ops_fetchActivity(){
		return await api('/api/operating-center/activity');
	}
	async function ops_fetchQueue(){
		return await api('/api/operating-center/operations/overview');
	}
	async function ops_ackRead(itemId){
		try{
			await api('/api/operating-center/activity/acknowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({item_id:itemId})});
			await boot_activity_actions();
			await boot_activity_details();
		}catch(err){alert('Failed: '+err.message)}
	}
	function ops_activityLine(i){
		return '<div class="item"><strong>'+esc(i.label)+'</strong>'
			+(i.detail?'<div class="meta">'+esc(i.detail)+'</div>':'')
			+'<div class="meta">'+esc(i.ts)+'</div></div>';
	}
	function ops_renderItem(r){
		const badge=r.status==='READY_TO_ACT'?'badge-ok':(r.status==='NEEDS_OWNER_INPUT'?'badge-warn':'badge');
		let html='<div class="item"><strong>'+esc(r.action||'(no action)')+'<span class="'+badge+'">'+esc(r.status)+'</span></strong>';
		html+='<div class="detail"><b>Required result:</b> '+esc(r.required_result||'not assigned')+'</div>';
		html+='<div class="detail"><b>Channel:</b> '+esc(r.channel||'not assigned')+' <b>Outcome:</b> '+esc(r.business_outcome)+'</div>';
		if(r.owner_input){html+='<div class="detail"><b>Owner input needed:</b> '+esc(r.owner_input)+'</div>'}
		if(r.external_blocker){html+='<div class="detail"><b>External blocker:</b> '+esc(r.external_blocker)+'</div>'}
		html+='<div class="detail"><b>Next step:</b> '+esc(r.exact_next_step)+'</div>';
		if(r.downstream_state){html+='<div class="meta">Proposal state: '+esc(r.downstream_state)+'</div>'}
		html+='</div>';
		return html;
	}
	function ops_unroutedHtml(u){
		let html='<div class="item"><strong>'+esc(human(u.rule_id))+'<span class="badge">'+esc(human('NEEDS_OWNER_INPUT'))+'</span></strong>';
		html+='<div class="detail">'+esc(u.action_ids.length)+' planned actions: '+esc(u.action_ids.map(human).join(', '))+'</div>';
		html+='<div class="detail"><b>Note:</b> '+esc(u.owner_input)+'</div></div>';
		return html;
	}
	function ops_groupRows(rows){
		const groups={};const order=[];
		for(const r of rows){
			if(!groups[r.source_title]){groups[r.source_title]=[];order.push(r.source_title)}
			groups[r.source_title].push(r);
		}
		let html='';
		for(const title of order){
			html+='<h3>'+esc(title)+'</h3>';
			for(const r of groups[title]){html+=ops_renderItem(r)}
		}
		return html;
	}
	function ops_unroutedSection(data){
		const unrouted=(data.queue&&data.queue.unrouted_rules)||[];
		if(!unrouted.length)return '';
		let html='<h3>Dormant automation rules</h3><p class="meta">These rules are configured but currently have no live source feeding them. They are parked — not broken, not urgent. They will activate on their own when their source appears.</p>';
		for(const u of unrouted){html+=ops_unroutedHtml(u)}
		return html;
	}
	function ops_queueNote(data){
		return 'Generated '+esc(data.generated_at)+'. Google Ads execution '+(data.google_ads_execution_allowed?'allowed':'not allowed (read-only integration)')+'.';
	}
	function ops_count(rows,status){
		return rows.filter(r=>r.status===status).length;
	}
	// source_title -> the owning section's Actions screen. Unknown sources
	// get null and are rendered without a button (honest: no invented link).
	function ops_jumpUrl(title){
		const t=String(title||'');
		const v='view=actions';
		if(/series 2026/i.test(t)) return '/operating-center/sport?tab=results&'+v;
		if(/\\bSPORT\\b/i.test(t)) return '/operating-center/sport?tab=series&'+v;
		if(/instructor growth fund/i.test(t)) return '/operating-center/growth?tab=igf&'+v;
		if(/founding circle|donation|bridge sprint|fundraising/i.test(t)) return '/operating-center/growth?tab=fundraising&'+v;
		if(/\\bfund\\b|\\$50k/i.test(t)) return '/operating-center/growth?tab=funds&'+v;
		if(/sponsor/i.test(t)) return '/operating-center/growth?tab=sponsorship&'+v;
		if(/seller/i.test(t)) return '/operating-center/growth?tab=sellers&'+v;
		if(/partner/i.test(t)) return '/operating-center/growth?tab=partners&'+v;
		if(/press|media/i.test(t)) return '/operating-center/marketing?tab=media&'+v;
		if(/google ads|\\bads\\b/i.test(t)) return '/operating-center/marketing?tab=ads&'+v;
		if(/social|threads|instagram|facebook/i.test(t)) return '/operating-center/marketing?tab=social&'+v;
		if(/analytics|ga4/i.test(t)) return '/operating-center/marketing?tab=analytics&'+v;
		if(/academy|course|certification|license/i.test(t)) return '/operating-center/academy?tab=courses&'+v;
		if(/board|meeting|decision/i.test(t)) return '/operating-center/board?tab=board&'+v;
		return null;
	}
	function ops_jumpButtonsHtml(titles,emptyText){
		let html='';let n=0;
		for(const t of titles){
			const u=ops_jumpUrl(t);
			if(!u)continue;
			n++;
			html+='<div class="item"><strong>'+esc(t)+'</strong>'
				+'<div class="detail"><a class="oc-view-btn" style="display:inline-block;text-decoration:none;margin-top:0" href="'+esc(u)+'">Open Actions</a></div></div>';
		}
		if(!n)html='<div class="item"><strong>No mapped actions</strong><div class="detail">'+esc(emptyText)+'</div></div>';
		return html;
	}
`;

// ---------------------------------------------------------------------------
// 1. activity
// ---------------------------------------------------------------------------

const ACTIVITY_SUMMARY_HTML = `<section class="panel"><h2>Activity summary</h2><div id="ops-act-sum">Loading…</div></section>`;

const ACTIVITY_ACTIONS_HTML = `<section class="panel"><h2>Requires reading</h2>
	<p class="meta"><strong>Machine (automatic):</strong> collects the activity feed from every section. <strong>Owner (manual):</strong> mark items as read below — the only manual action on this screen.</p>
	<div id="ops-act-reading">Loading…</div>
	<div><button type="button" class="secondary" id="ops-act-full">Open the full feed</button></div></section>`;

const ACTIVITY_DETAILS_HTML = `<section class="panel"><h2>Requires reading — full list</h2><div id="ops-act-reading-full">Loading…</div></section>
	<section class="panel"><h2>What is new</h2><div id="ops-act-new">Loading…</div></section>`;

const ACTIVITY_PANELS = ocFunction(
	"activity",
	"What happened across the Machine and what needs your eyes: the live activity feed, plus a small inbox you mark as read.",
	ACTIVITY_SUMMARY_HTML,
	ACTIVITY_ACTIONS_HTML,
	ACTIVITY_DETAILS_HTML,
);

const ACTIVITY_SCRIPT = OPS_SHARED_SCRIPT + `
	async function boot_activity_summary(){
		const box=document.querySelector('#ops-act-sum');
		try{
			const data=await ops_fetchActivity();
			const items=data.items||[];
			const req=items.filter(i=>i.requires_reading);
			const latest=items.slice(0,3);
			let html='<div class="stats">'
				+'<div class="stat"><strong>'+req.length+'</strong><span>Require reading</span></div>'
				+'<div class="stat"><strong>'+items.length+'</strong><span>Feed items</span></div>'
				+'</div>';
			html+='<h3>Latest</h3>';
			html+=latest.length?latest.map(ops_activityLine).join(''):'<div class="unavailable">No recent activity.</div>';
			html+='<h3>Needs attention</h3>';
			html+=req.length
				?'<div class="item"><strong>'+req.length+' item(s) require reading</strong><div class="detail">Mark them as read in Actions.</div></div>'
				:'<div class="item"><strong>Nothing needs attention</strong><div class="detail">No items require reading right now.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	function ops_bindAck(box){
		box.querySelectorAll('[data-ack]').forEach(function(btn){
			btn.addEventListener('click',function(){ops_ackRead(btn.getAttribute('data-ack'))});
		});
	}
	function ops_readingListHtml(req){
		return req.length
			?req.map(function(i){
				return '<div class="item"><strong>'+esc(i.label)+'</strong>'
					+(i.detail?'<div class="meta">'+esc(i.detail)+'</div>':'')
					+'<div class="meta">'+esc(i.ts)+'</div>'
					+'<button type="button" data-ack="'+esc(i.id)+'" style="width:auto">Mark as read</button></div>';
			}).join('')
			:'<div class="unavailable">Nothing requires reading.</div>';
	}
	async function boot_activity_actions(){
		const box=document.querySelector('#ops-act-reading');
		try{
			const data=await ops_fetchActivity();
			const req=(data.items||[]).filter(i=>i.requires_reading);
			box.innerHTML=ops_readingListHtml(req);
			ops_bindAck(box);
			const full=document.querySelector('#ops-act-full');
			if(full)full.addEventListener('click',function(){__opsSetView('activity','details',true)});
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_activity_details(){
		const reading=document.querySelector('#ops-act-reading-full');
		const fresh=document.querySelector('#ops-act-new');
		try{
			const data=await ops_fetchActivity();
			const items=data.items||[];
			const req=items.filter(i=>i.requires_reading);
			const rest=items.filter(i=>!i.requires_reading);
			reading.innerHTML=ops_readingListHtml(req);
			ops_bindAck(reading);
			fresh.innerHTML=rest.length
				?rest.slice(0,30).map(ops_activityLine).join('')
				:'<div class="unavailable">No recent activity.</div>';
		}catch(err){reading.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';fresh.innerHTML=''}
	}
` + ocViewScript("ops", ["activity", "system", "exceptions"]);

// ---------------------------------------------------------------------------
// 2. system
// ---------------------------------------------------------------------------

const SYSTEM_SUMMARY_HTML = `<section class="panel"><h2>Queue summary</h2><div id="ops-sys-sum">Loading…</div></section>`;

const SYSTEM_ACTIONS_HTML = `<section class="panel"><h2>Act on the queue</h2>
	<p class="meta"><strong>Machine (automatic):</strong> the Machine builds and maintains this queue itself — there is no manual “add to queue” or “edit queue” action. <strong>Owner (manual):</strong> each row already names its exact next step and its owning section; go there to act. The buttons below jump to the right Actions screen for each mapped source.</p>
	<div id="ops-sys-act">Loading…</div></section>`;

const SYSTEM_DETAILS_HTML = `<section class="panel"><h2>Operational queue</h2><div id="ops-sys-det">Loading…</div>
	<p class="meta" id="ops-sys-det-note"></p></section>`;

const SYSTEM_PANELS = ocFunction(
	"system",
	"The Machine's live operational queue: what it is doing, what is ready, and what waits on you or on an outside party. The Machine maintains it — you act in the owning sections.",
	SYSTEM_SUMMARY_HTML,
	SYSTEM_ACTIONS_HTML,
	SYSTEM_DETAILS_HTML,
);

const SYSTEM_SCRIPT = `
	async function boot_system_summary(){
		const box=document.querySelector('#ops-sys-sum');
		try{
			const data=await ops_fetchQueue();
			const rows=(data.queue&&data.queue.rows)||[];
			const ready=ops_count(rows,'READY_TO_ACT');
			const need=ops_count(rows,'NEEDS_OWNER_INPUT');
			const blocked=ops_count(rows,'BLOCKED_EXTERNAL');
			let html='<div class="stats">'
				+'<div class="stat"><strong>'+ready+'</strong><span>Ready to act</span></div>'
				+'<div class="stat"><strong>'+need+'</strong><span>Need owner input</span></div>'
				+'<div class="stat"><strong>'+blocked+'</strong><span>Blocked externally</span></div>'
				+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Regenerated the queue at '+esc(data.generated_at)+': '+rows.length+' row(s) tracked.</div></div>';
			html+='<div class="item"><strong>Google Ads execution</strong><div class="detail">'+(data.google_ads_execution_allowed?'Allowed.':'Not allowed — the Google Ads integration is read-only.')+'</div></div>';
			const attn=[];
			if(need)attn.push(need+' item(s) need owner input — see Exceptions.');
			if(blocked)attn.push(blocked+' item(s) are blocked externally — see Exceptions.');
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_system_actions(){
		const box=document.querySelector('#ops-sys-act');
		try{
			const data=await ops_fetchQueue();
			const rows=(data.queue&&data.queue.rows)||[];
			const order=[];const seen={};
			for(const r of rows){
				const t=r.source_title||'Not assigned';
				if(!seen[t]){seen[t]=1;order.push(t)}
			}
			let html='<div class="item"><strong>Exceptions</strong><div class="detail">'+ops_count(rows,'NEEDS_OWNER_INPUT')+' need owner input, '+ops_count(rows,'BLOCKED_EXTERNAL')+' blocked externally.</div><div><button type="button" class="secondary" id="ops-sys-exc">Open Exceptions</button></div></div>';
			html+='<div class="item"><strong>Sync RunSignup money</strong><div class="detail">Pulls the latest donations and paid registrations from RunSignup into the Engine. This is the explicit owner-triggered sync — nothing syncs automatically.</div><div class="mrow"><button type="button" class="secondary" id="ops-sync-donations">Sync donations</button> <button type="button" class="secondary" id="ops-sync-registrations">Sync registrations</button></div><div class="message" id="ops-sync-message" aria-live="polite"></div></div>';
			html+=ops_jumpButtonsHtml(order,'None of the current sources maps to a section Actions screen — act from the rows in Details.');
			box.innerHTML=html;
			const eb=document.querySelector('#ops-sys-exc');
			if(eb)eb.addEventListener('click',function(){__opsSetView('exceptions','summary',true)});
			const sm=document.querySelector('#ops-sync-message');
			async function ops_runSync(kind,url){
				if(sm)sm.textContent='Syncing '+kind+'…';
				try{
					const r=await api(url,{method:'POST'});
					if(sm)sm.textContent=r&&r.ok!==false?'Synced '+kind+'. Refresh the Money views to see the update.':'Sync finished with a warning.';
				}catch(err){if(sm)sm.textContent=err.message}
			}
			const sd=document.querySelector('#ops-sync-donations');
			if(sd)sd.addEventListener('click',function(){ops_runSync('donations','/api/operating-center/money/sync')});
			const sr=document.querySelector('#ops-sync-registrations');
			if(sr)sr.addEventListener('click',function(){ops_runSync('registrations','/api/operating-center/money/sync-registrations')});
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_system_details(){
		const box=document.querySelector('#ops-sys-det');
		const note=document.querySelector('#ops-sys-det-note');
		try{
			const data=await ops_fetchQueue();
			const rows=(data.queue&&data.queue.rows)||[];
			let html=ops_groupRows(rows)+ops_unroutedSection(data);
			if(!html)html='<div class="unavailable">The queue is empty.</div>';
			box.innerHTML=html;
			note.textContent=ops_queueNote(data);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------
// 3. exceptions
// ---------------------------------------------------------------------------

const EXCEPTIONS_SUMMARY_HTML = `<section class="panel"><h2>Exceptions summary</h2><div id="ops-exc-sum">Loading…</div></section>`;

const EXCEPTIONS_ACTIONS_HTML = `<section class="panel"><h2>Act on the exceptions</h2>
	<p class="meta"><strong>Machine (automatic):</strong> the Machine detects and lists these exceptions itself. <strong>Owner (manual):</strong> this is where the owner goes to act on each exception — the buttons jump to the owning section's Actions screen.</p>
	<div id="ops-exc-act">Loading…</div></section>`;

const EXCEPTIONS_DETAILS_HTML = `<section class="panel"><h2>Exceptions</h2>
	<p class="meta">Only items that need owner input or are blocked externally.</p>
	<div id="ops-exc-det">Loading…</div>
	<p class="meta" id="ops-exc-det-note"></p></section>`;

const EXCEPTIONS_PANELS = ocFunction(
	"exceptions",
	"Only the queue rows that need owner input or are stuck on an outside party — the smallest list that still needs you.",
	EXCEPTIONS_SUMMARY_HTML,
	EXCEPTIONS_ACTIONS_HTML,
	EXCEPTIONS_DETAILS_HTML,
);

const EXCEPTIONS_SCRIPT = `
	function ops_exceptions(rows){
		return rows.filter(r=>r.status==='NEEDS_OWNER_INPUT'||r.status==='BLOCKED_EXTERNAL');
	}
	function ops_exceptionOneLiner(r){
		const need=r.status==='NEEDS_OWNER_INPUT'?(r.owner_input||'owner input needed'):(r.external_blocker||'external blocker');
		return '&bull; '+esc(r.action||'(no action)')+' — '+esc(need);
	}
	async function boot_exceptions_summary(){
		const box=document.querySelector('#ops-exc-sum');
		try{
			const data=await ops_fetchQueue();
			const rows=(data.queue&&data.queue.rows)||[];
			const exc=ops_exceptions(rows);
			const need=ops_count(rows,'NEEDS_OWNER_INPUT');
			const blocked=ops_count(rows,'BLOCKED_EXTERNAL');
			let html='<div class="stats">'
				+'<div class="stat"><strong>'+need+'</strong><span>Need owner input</span></div>'
				+'<div class="stat"><strong>'+blocked+'</strong><span>Blocked externally</span></div>'
				+'</div>';
			if(exc.length){
				html+='<h3>What each needs</h3><div class="item"><div class="detail">'+exc.map(ops_exceptionOneLiner).join('<br>')+'</div></div>';
				html+='<div class="item"><strong>Needs attention</strong><div class="detail">Act on each exception in Actions, or read the full rows in Details.</div></div>';
			}else{
				html+='<div class="item"><strong>Nothing needs attention</strong><div class="detail">No exceptions. Nothing needs owner input or is blocked externally.</div></div>';
			}
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_exceptions_actions(){
		const box=document.querySelector('#ops-exc-act');
		try{
			const data=await ops_fetchQueue();
			const rows=(data.queue&&data.queue.rows)||[];
			const exc=ops_exceptions(rows);
			const order=[];const seen={};
			for(const r of exc){
				const t=r.source_title||'Not assigned';
				if(!seen[t]){seen[t]=1;order.push(t)}
			}
			let html='';
			if(!exc.length)html='<div class="item"><strong>No exceptions</strong><div class="detail">Nothing needs owner input or is blocked externally right now.</div></div>';
			else html=ops_jumpButtonsHtml(order,'None of the exception sources maps to a section Actions screen — act from the rows in Details.');
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_exceptions_details(){
		const box=document.querySelector('#ops-exc-det');
		const note=document.querySelector('#ops-exc-det-note');
		try{
			const data=await ops_fetchQueue();
			const rows=(data.queue&&data.queue.rows)||[];
			const exc=ops_exceptions(rows);
			let html=ops_groupRows(exc)+ops_unroutedSection(data);
			if(!html)html='<div class="unavailable">No exceptions. Nothing needs owner input or is blocked externally.</div>';
			box.innerHTML=html;
			note.textContent=ops_queueNote(data);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

export function renderOperationsSectionHtml(): string {
	return ocSectionShell({
		section: "operations",
		title: "Operations",
		subtitle: "Activity, system state, and exceptions.",
		queryTabs: true,
		tabs: [
			{ id: "activity", label: "Activity", panelsHtml: ACTIVITY_PANELS, script: ACTIVITY_SCRIPT },
			{
				id: "system",
				label: "System state",
				panelsHtml: SYSTEM_PANELS,
				script: SYSTEM_SCRIPT,
				reportId: "operations",
			},
			{ id: "exceptions", label: "Exceptions", panelsHtml: EXCEPTIONS_PANELS, script: EXCEPTIONS_SCRIPT },
		],
	});
}
