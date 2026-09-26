// Object creation page for the Operating Center.
//
// The owner creates a new NWANA object ONCE here. The machine fills every
// field the official RunSignup API accepts, links the Machine object to the
// dashboard-created RunSignup race, and hands the owner an exact manual last
// mile for the fields the API cannot touch (object creation itself is always
// dashboard-only by design). Nothing is written to RunSignup without the
// owner's explicit per-step confirmation.
//
// OWNER'S HARD RULE applies: every value on this page comes from D1 or a
// real API response. The field-capability map is a repo fact compiled from
// the official docs (verified 2026-09-26); where the exact API URL is not
// yet verified, the step stays manual.

import { operatingCenterMenu } from "./operating-center";
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

// Local page shell, adapted from the shared screen shell: header, menu,
// owner-key gate, app container, and the common client prelude. Page-specific
// UI goes in panelsHtml; page-specific logic (which must define boot()) goes
// in script. The script must not contain backticks or ${ sequences.
function creationShell(opts: {
	title: string;
	subtitle: string;
	panelsHtml: string;
	script: string;
}): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>${escHtml(opts.title)} — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9;--warn:#b35400;--danger:#a4262c}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
		.oc-menu-btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
		.oc-menu-btn:hover{background:#3a7455}.oc-menu-active{background:#fff;color:var(--brand)}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		h2{margin:0 0 14px;font-size:22px}h3{margin:18px 0 8px;font-size:18px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,button,select,textarea{font:inherit}
		input,select,textarea{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white;width:100%}
		textarea{min-height:80px;font-family:ui-monospace,monospace;font-size:13px}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;margin-top:14px}
		button.secondary{background:white;color:var(--brand);border:1px solid var(--brand);width:auto;margin:8px 8px 0 0}
		button.danger{background:var(--danger)}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:14px 0}.item:first-of-type{border-top:0}.item strong{display:block}
		.badge{display:inline-block;background:var(--accent);border-radius:6px;padding:2px 8px;font-size:13px;color:var(--brand);font-weight:650;margin-left:8px}
		.badge-warn{display:inline-block;background:#fbeedf;border-radius:6px;padding:2px 8px;font-size:13px;color:var(--warn);font-weight:650;margin-left:8px}
		.badge-err{display:inline-block;background:#fbe4e4;border-radius:6px;padding:2px 8px;font-size:13px;color:var(--danger);font-weight:650;margin-left:8px}
		.badge-ok{display:inline-block;background:#e5efe9;border-radius:6px;padding:2px 8px;font-size:13px;color:#183d2d;font-weight:650;margin-left:8px}
		.detail{margin:6px 0;font-size:15px}.detail b{color:var(--muted);font-weight:650}
		pre.payload{background:#0f1a14;color:#d7e6dc;border-radius:9px;padding:12px;overflow:auto;font-size:12.5px;max-height:320px}
		.warn{color:var(--danger);font-weight:650}.note{color:var(--muted);font-size:14px}
		ol.steps{margin:8px 0;padding-left:22px}.row{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
		@media(max-width:700px){.row{grid-template-columns:1fr}}
	</style>
</head>
<body>
	<header><h1>${escHtml(opts.title)}</h1><p>${escHtml(opts.subtitle)}</p></header>
	${operatingCenterMenu("creation")}
	<main>
		<section class="panel" id="gate" hidden>
			<h2>Owner access</h2>
			<p class="unavailable">This page is private. Enter the operating center key to continue.</p>
			<form id="key-form">
				<label for="owner-key">Operating center key</label>
				<input id="owner-key" name="owner_key" type="password" autocomplete="current-password" required>
				<button type="submit">Open ${escHtml(opts.title.toLowerCase())}</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
			${opts.panelsHtml}
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
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();boot()});
		${opts.script}
		if(getKey()){showApp();boot()}else{showGate('')}
	</script>
</body></html>`;
}

function capabilityTableHtml(): string {
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
// List page: all packets + the new-packet form.
// ---------------------------------------------------------------------------

const CREATION_LIST_SCRIPT = `
	async function boot(){
		const box=document.querySelector('#packet-list');
		const msg=document.querySelector('#packet-message');
		try{
			const data=await api('/api/operating-center/object-creation/packets');
			const packets=data.packets||[];
			if(!packets.length){box.innerHTML='<div class="unavailable">No creation packets yet. Create the first one below.</div>';return}
			box.innerHTML=packets.map(p=>{
				const statusBadge=p.status==='complete'
					?'<span class="badge-ok">complete</span>'
					:p.status==='manual_pending'
					?'<span class="badge-warn">manual last mile</span>'
					:'<span class="badge">in progress</span>';
				const race=p.runsignup_race_id?'<div class="detail"><b>Race ID:</b> '+esc(p.runsignup_race_id)+(p.runsignup_race_name?' — '+esc(p.runsignup_race_name):'')+'</div>':'<div class="detail"><b>Race ID:</b> not linked yet</div>';
				return '<div class="item"><strong><a href="/operating-center/creation/packet?packet_id='+esc(p.packet_id)+'">'+esc(p.title)+'</a>'+statusBadge+'</strong>'+
					'<div class="detail"><b>Kind:</b> '+esc(p.kind_label)+' · <b>Status:</b> '+esc(p.status)+'</div>'+race+'</div>';
			}).join('');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	document.querySelector('#new-packet-form').addEventListener('submit',async e=>{
		e.preventDefault();
		const m=document.querySelector('#new-packet-message');m.textContent='Creating…';
		const f=new FormData(e.currentTarget);
		const body={};
		['kind','title','description','event_date','distance','format','external_race_url','external_results_url','facebook_page_id','notes'].forEach(k=>{const v=String(f.get(k)||'').trim();if(v)body[k]=v});
		try{
			const data=await api('/api/operating-center/object-creation/packets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
			location.href='/operating-center/creation/packet?packet_id='+encodeURIComponent(data.packet.packet_id);
		}catch(err){m.textContent=err.message}
	});
`;

export function renderCreationHtml(): string {
	const kindOptions = OBJECT_CREATION_KINDS.map(
		(k) => `<option value="${escHtml(k.kind)}">${escHtml(k.label)}</option>`,
	).join("");
	return creationShell({
		title: "Create objects",
		subtitle:
			"Create a new NWANA object once. The machine fills every field the RunSignup API accepts, links the dashboard-created race, and hands you an exact manual last mile for the rest. Nothing is written without your explicit per-step confirmation.",
		panelsHtml:
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
				<label for="np-notes">Notes</label>
				<textarea id="np-notes" name="notes" placeholder="Internal notes for the owner."></textarea>
				<button type="submit">Create packet</button>
				<div class="message" id="new-packet-message" aria-live="polite"></div>
			</form>
			<p class="note">Registration periods, age-based pricing, questions, and coupons can be added on the packet page after creation.</p>
			</section>` +
			capabilityTableHtml(),
		script: CREATION_LIST_SCRIPT,
	});
}

// ---------------------------------------------------------------------------
// Detail page: the packet, its dry-run plan, the apply flow, manual last mile.
// ---------------------------------------------------------------------------

const CREATION_DETAIL_SCRIPT = `
	function packetId(){return new URLSearchParams(location.search).get('packet_id')||''}
	function stepBadge(s){
		if(s==='done')return '<span class="badge-ok">done</span>';
		if(s==='error')return '<span class="badge-err">error</span>';
		if(s==='skipped')return '<span class="badge">skipped</span>';
		return '<span class="badge">pending</span>';
	}
	function prettify(v){try{return JSON.stringify(v,null,2)}catch(e){return String(v)}}
	async function boot(){
		const pid=packetId();
		const box=document.querySelector('#packet-body');
		if(!pid){box.innerHTML='<div class="unavailable">Missing packet_id.</div>';return}
		try{
			const data=await api('/api/operating-center/object-creation/packet?packet_id='+encodeURIComponent(pid));
			render(data.packet,data.plan);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	function render(p,plan){
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
			'<div class="detail meta">'+esc(plan.report||'')+'</div></section>';

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
			h+='<div class="item"><strong>'+esc(s.title)+stepBadge(s.status)+'</strong>'+
				'<div class="detail">'+esc(s.description)+'</div>'+
				(s.endpoint?'<div class="detail"><b>Endpoint:</b> '+esc(s.endpoint)+'</div>':'')+
				(s.replace_semantics?'<div class="detail"><b>Semantics:</b> '+esc(s.replace_semantics)+'</div>':'')+
				(s.warnings&&s.warnings.length?'<div class="detail warn">'+s.warnings.map(w=>'⚠ '+esc(w)).join('<br>')+'</div>':'')+
				(s.needs_event_id?'<div class="detail warn">Waiting for the Event ID: set it in section 1 after creating the event in the dashboard.</div>':'')+
				(s.payload_preview!=null?'<pre class="payload">'+esc(prettify(s.payload_preview))+'</pre>':'')+
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
			h+='<div class="item"><strong>'+esc(s.title)+stepBadge(s.status)+'</strong>'+
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
			'<div><label for="f-append">Questions mode</label><select id="f-append" name="append_questions"><option value="T"'+(meta.append_questions===false?'':' selected')+'>Append (safe, keeps existing)</option><option value="F"'+(meta.append_questions===false?' selected':'')+'>Replace (deletes omitted)</option></select></div></div>'+
			'<label for="f-periods">Registration periods (JSON array)</label><textarea id="f-periods" name="registration_periods">'+esc(prettify(meta.registration_periods||[]))+'</textarea>'+
			'<label for="f-pricing">Age-based pricing (JSON array)</label><textarea id="f-pricing" name="age_based_pricing">'+esc(prettify(meta.age_based_pricing||[]))+'</textarea>'+
			'<label for="f-questions">Questions (JSON array)</label><textarea id="f-questions" name="questions">'+esc(prettify(meta.questions||[]))+'</textarea>'+
			'<label for="f-coupons">Coupons (JSON array)</label><textarea id="f-coupons" name="coupons">'+esc(prettify(meta.coupons||[]))+'</textarea>'+
			'<label for="f-notes">Notes</label><textarea id="f-notes" name="notes">'+esc(meta.notes||'')+'</textarea>'+
			'<button type="submit">Save fields</button><div class="message" id="fields-message"></div></form></section>';

		box.innerHTML=h;

		document.querySelector('#link-form').addEventListener('submit',async e=>{
			e.preventDefault();
			const m=document.querySelector('#link-message');m.textContent='Verifying…';
			const f=new FormData(e.currentTarget);
			const body={packet_id:packetId(),race_id:Number(f.get('race_id'))};
			const eid=String(f.get('event_id')||'').trim();
			if(eid)body.event_id=Number(eid);
			try{const d=await api('/api/operating-center/object-creation/link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});m.textContent='Linked: race '+d.race_id+(d.race_name?' ('+d.race_name+')':'');boot()}catch(err){m.textContent=err.message}
		});
		document.querySelector('#probe-btn').addEventListener('click',async e=>{
			const m=document.querySelector('#probe-message');m.textContent='Probing (read-only)…';
			try{const d=await api('/api/operating-center/object-creation/probe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({packet_id:packetId()})});m.textContent=d.probe.note;boot()}catch(err){m.textContent=err.message}
		});
		Array.prototype.forEach.call(document.querySelectorAll('.apply-form'),form=>{
			form.addEventListener('submit',async e=>{
				e.preventDefault();
				const m=form.querySelector('.message');
				const confirm=String(new FormData(form).get('confirm')||'').trim();
				if(confirm!=='APPLY_STEP'){m.textContent='Type APPLY_STEP exactly to confirm.';return}
				m.textContent='Applying…';
				try{const d=await api('/api/operating-center/object-creation/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({packet_id:packetId(),step_id:form.dataset.step,confirm:'APPLY_STEP'})});m.textContent=d.detail;boot()}catch(err){m.textContent=err.message}
			});
		});
		Array.prototype.forEach.call(document.querySelectorAll('.manual-btn'),btn=>{
			btn.addEventListener('click',async ()=>{
				try{await api('/api/operating-center/object-creation/manual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({packet_id:packetId(),step_id:btn.dataset.step})});boot()}catch(err){btn.textContent='Failed: '+err.message}
			});
		});
		document.querySelector('#fields-form').addEventListener('submit',async e=>{
			e.preventDefault();
			const m=document.querySelector('#fields-message');m.textContent='Saving…';
			const f=new FormData(e.currentTarget);
			const body={packet_id:packetId()};
			['description','event_date','distance','format','external_race_url','external_results_url','facebook_page_id','notes'].forEach(k=>{body[k]=String(f.get(k)||'')});
			const eid=String(f.get('runsignup_event_id')||'').trim();
			if(eid)body.runsignup_event_id=Number(eid);
			body.append_questions=String(f.get('append_questions')||'T')==='T';
			try{
				['registration_periods','age_based_pricing','questions','coupons'].forEach(k=>{
					const raw=String(f.get(k)||'').trim();
					body[k]=raw?JSON.parse(raw):[];
				});
			}catch(err){m.textContent='Invalid JSON: '+err.message;return}
			try{await api('/api/operating-center/object-creation/fields',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});m.textContent='Saved.';boot()}catch(err){m.textContent=err.message}
		});
	}
`;

export function renderCreationPacketHtml(): string {
	return creationShell({
		title: "Creation packet",
		subtitle:
			"The packet, its dry-run plan, per-step API apply with explicit confirmation, and the exact manual last mile.",
		panelsHtml: '<div id="packet-body">Loading…</div>',
		script: CREATION_DETAIL_SCRIPT,
	});
}
