// Operating Center — Operations section (7-section rebuild).
//
// Thin shell around ocSectionShell with three tabs:
//  1. activity — "Requires reading" list (with "Mark as read" per item) +
//     "What is new" feed. Was renderActivityHtml
//     (src/operating-center-activity.ts).
//  2. system — the full operational queue grouped by source with required
//     result, channel, business outcome, and exact next step. Was
//     renderOperationsHtml (src/operating-center-screens.ts), report id
//     "operations" reused unchanged.
//  3. exceptions — the same queue filtered to ONLY NEEDS_OWNER_INPUT and
//     BLOCKED_EXTERNAL items, each with its exact next step,
//     owner-input-needed, and external blocker fields.
//
// Tab scripts reuse the shell's global esc()/api(); the owner-key gate lives
// in the shell, so no tab script touches the gate.

import { ocSectionShell } from "./oc-shell";

const ACTIVITY_PANELS = `<section class="panel">
				<h2>Requires reading</h2>
				<div id="activity-reading">Loading…</div>
			</section>
			<section class="panel">
				<h2>What is new</h2>
				<div id="activity-new">Loading…</div>
			</section>`;

const ACTIVITY_SCRIPT = `
	async function boot_activity(){
		const reading=document.querySelector('#activity-reading');
		const fresh=document.querySelector('#activity-new');
		try{
			const data=await api('/api/operating-center/activity');
			const req=data.items.filter(i=>i.requires_reading);
			const rest=data.items.filter(i=>!i.requires_reading);
			reading.innerHTML=req.length?req.map(i=>'<div class="item"><strong>'+esc(i.label)+'</strong>'+(i.detail?'<div class="meta">'+esc(i.detail)+'</div>':'')+'<div class="meta">'+esc(i.ts)+'</div><button data-ack="'+esc(i.id)+'" style="width:auto">Mark as read</button></div>').join(''):'<div class="unavailable">Nothing requires reading.</div>';
			fresh.innerHTML=rest.length?rest.slice(0,30).map(i=>'<div class="item">'+esc(i.label)+'<div class="meta">'+esc(i.ts)+'</div></div>').join(''):'<div class="unavailable">No recent activity.</div>';
			reading.querySelectorAll('[data-ack]').forEach(btn=>btn.addEventListener('click',()=>activityAckRead(btn.dataset.ack)));
		}catch(err){reading.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';fresh.innerHTML=''}
	}
	async function activityAckRead(itemId){
		try{
			await api('/api/operating-center/activity/acknowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({item_id:itemId})});
			boot_activity();
		}catch(err){alert('Failed: '+err.message)}
	}
`;

// Shared queue-rendering helpers for the system/exceptions tabs, declared
// once (the shell concatenates all tab scripts into one <script> block, so
// boot_exceptions can use them without redeclaration).
const OPS_HELPERS = `
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
		let html='<div class="item"><strong>'+esc(u.rule_id)+'<span class="badge-warn">NEEDS_OWNER_INPUT</span></strong>';
		html+='<div class="detail">'+esc(u.action_ids.length)+' actions: '+esc(u.action_ids.join(', '))+'</div>';
		html+='<div class="detail"><b>Owner input needed:</b> '+esc(u.owner_input)+'</div></div>';
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
		let html='<h3>Actions in config carried by no current source</h3>';
		for(const u of unrouted){html+=ops_unroutedHtml(u)}
		return html;
	}
	function ops_queueNote(data){
		return 'Generated '+esc(data.generated_at)+'. Google Ads execution '+(data.google_ads_execution_allowed?'allowed':'not allowed (read-only integration)')+'.';
	}
`;

const SYSTEM_PANELS = `<section class="panel">
				<h2>Operational queue</h2>
				<div id="operations-queue">Loading…</div>
				<p class="meta" id="operations-note"></p>
			</section>`;

const SYSTEM_SCRIPT = OPS_HELPERS + `
	async function boot_system(){
		const box=document.querySelector('#operations-queue');
		const note=document.querySelector('#operations-note');
		try{
			const data=await api('/api/operating-center/operations/overview');
			const rows=(data.queue&&data.queue.rows)||[];
			let html=ops_groupRows(rows)+ops_unroutedSection(data);
			box.innerHTML=html;
			note.textContent=ops_queueNote(data);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const EXCEPTIONS_PANELS = `<section class="panel">
				<h2>Exceptions</h2>
				<p class="meta">Only items that need owner input or are blocked externally.</p>
				<div id="exceptions-queue">Loading…</div>
				<p class="meta" id="exceptions-note"></p>
			</section>`;

const EXCEPTIONS_SCRIPT = `
	async function boot_exceptions(){
		const box=document.querySelector('#exceptions-queue');
		const note=document.querySelector('#exceptions-note');
		try{
			const data=await api('/api/operating-center/operations/overview');
			const rows=((data.queue&&data.queue.rows)||[]).filter(r=>r.status==='NEEDS_OWNER_INPUT'||r.status==='BLOCKED_EXTERNAL');
			let html=ops_groupRows(rows)+ops_unroutedSection(data);
			if(!html){html='<div class="unavailable">No exceptions. Nothing needs owner input or is blocked externally.</div>'}
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
		tabs: [
			{
				id: "activity",
				label: "Activity",
				panelsHtml: ACTIVITY_PANELS,
				script: ACTIVITY_SCRIPT,
			},
			{
				id: "system",
				label: "System state",
				panelsHtml: SYSTEM_PANELS,
				script: SYSTEM_SCRIPT,
				reportId: "operations",
			},
			{
				id: "exceptions",
				label: "Exceptions",
				panelsHtml: EXCEPTIONS_PANELS,
				script: EXCEPTIONS_SCRIPT,
			},
		],
	});
}
