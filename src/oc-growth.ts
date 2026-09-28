// Operating Center — Growth section (Summary/Actions/Details pattern).
//
// Six functions: sponsorship, fundraising, sellers, partners, funds, igf.
// Every function has a 1-2 line human description and three SEPARATE views
// [ Summary ] [ Actions ] [ Details ], one visible at a time, deep-linkable
// as /operating-center/growth?tab=<function>&view=<summary|actions|details>.
//
// Content rules:
//   Summary = management summary only: live metrics, what the Machine did,
//     what needs attention. No tech tables.
//   Actions = ONLY real manual owner actions from the verified POST list;
//     Machine-automatic vs owner-manual is labeled. Missing endpoints get an
//     honest note, never invented controls.
//   Details = deep working data: tables, records, history.
// All numbers are live from the verified GET endpoints; missing data gets an
// honest empty state, never invented numbers.
//
// Fundraising and sponsorship are SEPARATE processes/lifecycles — never
// merged. The Instructor Growth Fund (igf) is a fundraising asset here; the
// operational outcome (funded places -> students -> completions ->
// certifications) lives in Academy -> Performance, never money here.

import { ocSectionShell, ocFunction, ocViewScript } from "./oc-shell";

// ---------------------------------------------------------------------------
// 1. Sponsorship
// ---------------------------------------------------------------------------

const SPONSORSHIP_DESC =
	"Commercial sponsorship pipeline — packages generated for NWANA properties, tracked stage by stage. Separate from fundraising: this is revenue from sponsors buying into the system.";

const SPONSORSHIP_SUMMARY_HTML = `<section class="panel"><h2>Sponsorship summary</h2><div id="sponsorship-sum">Loading…</div></section>`;

const SPONSORSHIP_ACTIONS_HTML = `<section class="panel"><h2>Generate a package</h2>
		<form id="sponsorship-generate-form">
			<label for="sponsorship-object-type">Object type</label>
			<select id="sponsorship-object-type" name="object_type"><option value="series">series</option><option value="fund">fund</option></select>
			<label for="sponsorship-object-id">Object id</label>
			<input id="sponsorship-object-id" name="object_id" required maxlength="120" placeholder="SERIES_2026 or a fund id">
			<button type="submit">Generate package</button>
			<div class="message" id="sponsorship-generate-message" aria-live="polite"></div>
		</form></section>
	<section class="panel"><h2>Advance an asset</h2>
		<p class="meta"><strong>Machine (automatic):</strong> none here — packages are generated and every stage move is done by the owner. <strong>Owner (manual):</strong> the actions below.</p>
		<div class="message" id="sponsorship-act-message" aria-live="polite"></div>
		<div id="sponsorship-act">Loading…</div></section>`;

const SPONSORSHIP_DETAILS_HTML = `<section class="panel"><h2>Sponsorship assets</h2><div id="sponsorship-det">Loading…</div></section>`;

const SPONSORSHIP_SCRIPT = `
	const sponsorship_LABEL={draft:'Draft',packaged:'Packaged',offered:'Offered',negotiating:'Negotiating',committed:'Committed',fulfilled:'Fulfilled',renewal:'Renewal'};
	const sponsorship_TRANSITIONS={draft:['packaged'],packaged:['draft','offered'],offered:['packaged','negotiating'],negotiating:['offered','committed'],committed:['negotiating','fulfilled'],fulfilled:['committed','renewal'],renewal:[]};
	async function sponsorship_fetchAssets(){
		return await api('/api/operating-center/sponsorship-assets');
	}
	async function sponsorship_advanceAsset(assetId,toStage,msg){
		if(msg)msg.textContent='Moving…';
		try{
			await api('/api/operating-center/sponsorship-assets/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({asset_id:assetId,to_stage:toStage})});
			if(msg)msg.textContent='Moved to '+toStage+'.';
			await boot_sponsorship_actions();
		}catch(err){if(msg)msg.textContent=err.message}
	}
	async function boot_sponsorship_summary(){
		const box=document.querySelector('#sponsorship-sum');
		try{
			const data=await sponsorship_fetchAssets();
			const assets=data.assets||[];
			const byStage={};
			assets.forEach(a=>{byStage[a.stage]=(byStage[a.stage]||0)+1});
			let html='<div class="item"><strong>Assets by stage <span class="badge">'+assets.length+' total</span></strong><div class="detail">'+
				Object.keys(sponsorship_LABEL).map(s=>esc(sponsorship_LABEL[s])+': '+(byStage[s]||0)).join(' · ')+'</div></div>';
			const weekAgo=Date.now()-7*86400000;
			const recent=assets.filter(a=>a.stage_updated_at&&Date.parse(a.stage_updated_at)>=weekAgo);
			if(recent.length)html+='<div class="item"><strong>Recent movement</strong><div class="detail">'+recent.map(a=>'&bull; '+esc(a.title)+' &rarr; '+esc(sponsorship_LABEL[a.stage]||a.stage)).join('<br>')+'</div></div>';
			const drafts=assets.filter(a=>a.stage==='draft');
			const attn=[];
			if(!assets.length)attn.push('No sponsorship assets exist yet — generate the first package in Actions.');
			if(drafts.length)attn.push(drafts.length+' asset(s) stuck in Draft: '+drafts.map(a=>a.title).join(', '));
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Nothing here runs automatically: every package was generated and every stage move was made by the owner. This view only reads the live asset registry.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_sponsorship_actions(){
		const box=document.querySelector('#sponsorship-act');
		const msg=document.querySelector('#sponsorship-act-message');
		try{
			const data=await sponsorship_fetchAssets();
			const assets=data.assets||[];
			if(!assets.length){box.innerHTML='<div class="unavailable">No assets yet — generate one with the form above.</div>';return}
			box.innerHTML=assets.map(a=>{
				const moves=(sponsorship_TRANSITIONS[a.stage]||[]);
				const buttons=moves.map(s=>'<button class="secondary" data-sponsorship-advance="'+esc(a.id)+'" data-to="'+esc(s)+'" type="button">Move to '+esc(sponsorship_LABEL[s]||s)+'</button>').join('');
				return '<div class="item"><strong>'+esc(a.title)+'<span class="badge">'+esc(sponsorship_LABEL[a.stage]||a.stage)+'</span></strong><div>'+(buttons||'<span class="meta">Terminal stage.</span>')+'</div></div>';
			}).join('');
			box.querySelectorAll('[data-sponsorship-advance]').forEach(b=>b.addEventListener('click',()=>sponsorship_advanceAsset(b.dataset.sponsorshipAdvance,b.dataset.to,msg)));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_sponsorship_details(){
		const box=document.querySelector('#sponsorship-det');
		try{
			const data=await sponsorship_fetchAssets();
			const assets=data.assets||[];
			if(!assets.length){box.innerHTML='<div class="unavailable">No sponsorship assets yet.</div>';return}
			box.innerHTML=assets.map(a=>
				'<div class="item"><strong>'+esc(a.title)+'<span class="badge">'+esc(sponsorship_LABEL[a.stage]||a.stage)+'</span></strong>'+
				'<div class="meta">id: '+esc(a.id)+' · '+esc(a.object_type)+' · '+esc(a.object_id)+(a.stage_updated_at?' · stage updated '+esc(String(a.stage_updated_at).slice(0,10)):'')+'</div>'+
				(a.description?'<div class="detail"><b>Package:</b> '+esc(a.description)+'</div>':'')+
				(a.audience?'<div class="detail"><b>Audience:</b> '+esc(a.audience)+'</div>':'')+
				(a.delivers?'<div class="detail"><b>Delivers:</b> '+esc(a.delivers)+'</div>':'')+
				(a.reference_pricing?'<div class="detail"><b>Reference pricing:</b> '+esc(a.reference_pricing)+'</div>':'')+
				(a.next_action?'<div class="detail"><b>Next action:</b> '+esc(a.next_action)+'</div>':'')+
				'</div>'
			).join('');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	// The generate form is static HTML, so it is wired once at page load.
	document.querySelector('#sponsorship-generate-form').addEventListener('submit',async(e)=>{
		e.preventDefault();
		const m=document.querySelector('#sponsorship-generate-message');m.textContent='Generating…';
		try{
			const fd=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,String(v)]));
			const data=await api('/api/operating-center/sponsorship-assets/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({object_type:fd.object_type,object_id:fd.object_id})});
			m.textContent=data.generated?'Package generated.':'Package already exists.';
			await boot_sponsorship_actions();
		}catch(err){m.textContent=err.message}
	});
`;

const SPONSORSHIP_PANELS = ocFunction(
	"sponsorship",
	SPONSORSHIP_DESC,
	SPONSORSHIP_SUMMARY_HTML,
	SPONSORSHIP_ACTIONS_HTML,
	SPONSORSHIP_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 2. Fundraising
// ---------------------------------------------------------------------------

const FUNDRAISING_DESC =
	"The fundraising sprint — goal, raised, prospects and follow-ups from live data. Prospect stage moves are owner actions in Funds → Actions; this tab has no mutation endpoint of its own.";

const FUNDRAISING_SUMMARY_HTML = `<section class="panel"><h2>Fundraising summary</h2><div id="fundraising-sum">Loading…</div></section>`;

const FUNDRAISING_ACTIONS_HTML = `<section class="panel"><h2>Fundraising actions</h2>
		<p class="meta"><strong>Machine (automatic):</strong> reads this overview — there is no fundraising-specific mutation endpoint. <strong>Owner (manual):</strong> advancing a prospect is an owner action in Funds → Actions, the real action behind this tab.</p>
		<div id="fundraising-act">Loading…</div></section>`;

const FUNDRAISING_DETAILS_HTML = `<section class="panel"><h2>Prospects</h2><div id="fundraising-det-prospects">Loading…</div></section>
	<section class="panel"><h2>Follow-up calendar</h2><div id="fundraising-det-calendar">Loading…</div></section>
	<section class="panel"><h2>Tiers</h2><div id="fundraising-det-tiers">Loading…</div></section>`;

const FUNDRAISING_SCRIPT = `
	function fundraising_money(n){return '$'+Number(n||0).toLocaleString('en-US')}
	async function fundraising_fetchOverview(){
		return await api('/api/operating-center/fundraising/overview');
	}
	async function boot_fundraising_summary(){
		const box=document.querySelector('#fundraising-sum');
		try{
			const data=await fundraising_fetchOverview();
			const f=data.fund;
			if(!f){box.innerHTML='<div class="unavailable">No fund objects yet. The next step is seeding the first fund in Funds → Actions.</div>';return}
			const cal=f.follow_up_calendar||{};
			let html='<div class="item"><strong>'+esc(f.name)+'<span class="badge">'+esc(f.status)+'</span></strong>'+
				'<div class="detail">Goal '+fundraising_money(f.goal_amount)+' · Raised '+fundraising_money(f.raised_amount)+' · '+esc(f.prospect_count)+' prospect(s)</div>'+
				'<div class="detail">Follow-ups due now: <strong>'+esc(f.follow_ups_due_now)+'</strong> (window: due '+esc(cal.due||0)+', overdue '+esc(cal.overdue||0)+')</div>'+
				'<div class="detail">Tiers: '+Object.entries(f.tiers||{}).map(([t,n])=>esc(t)+' × '+n).join(', ')+'</div></div>';
			const attn=[];
			if(Number(f.follow_ups_due_now)>0)attn.push(f.follow_ups_due_now+' follow-up(s) due now — send them from Funds → Actions.');
			if(Number(cal.overdue)>0)attn.push(cal.overdue+' follow-up(s) overdue.');
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Computed this overview live from the prospect pipeline. Sending and stage moves stay owner-manual in Funds.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_fundraising_actions(){
		const box=document.querySelector('#fundraising-act');
		try{
			const data=await api('/api/operating-center/fund');
			const hasFunds=(data.funds||[]).length>0;
			box.innerHTML='<div class="item"><strong>Advance a prospect</strong><div class="detail">Fundraising prospects are advanced in Funds → Actions — the real owner action behind this tab.</div><div class="mrow"><button type="button" class="secondary" data-qa="funds|actions">Go to Funds → Actions</button></div></div>'+
				(hasFunds?'':'<div class="item"><strong>Seed the first fund</strong><div class="detail">No funds exist yet. The "Seed fund" owner action lives in Funds → Actions and only appears while no funds exist.</div><div class="mrow"><button type="button" class="secondary" data-qa="funds|actions">Go to Funds → Actions</button></div></div>');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	function fundraising_fuText(p){
		const fu=p.follow_up_status;
		if(fu==='overdue')return '<span class="followup-overdue">overdue</span>';
		if(fu==='due')return '<span class="followup-due">due</span>';
		return esc(fu||'—');
	}
	async function boot_fundraising_details(){
		const pb=document.querySelector('#fundraising-det-prospects');
		const cb=document.querySelector('#fundraising-det-calendar');
		const tb=document.querySelector('#fundraising-det-tiers');
		const fail=e=>{const m='<div class="unavailable">'+esc(e.message||e)+'</div>';pb.innerHTML=m;cb.innerHTML=m;tb.innerHTML=m};
		try{
			const data=await fundraising_fetchOverview();
			const f=data.fund;
			if(!f){fail(new Error('No fund objects yet.'));return}
			const stages=Object.entries(f.stage_counts||{}).filter(([,n])=>n>0).map(([s,n])=>esc(s)+': '+n).join(' · ');
			const prospects=f.prospects||[];
			pb.innerHTML='<div class="meta">Pipeline: '+(stages||'empty')+'</div>'+
				(prospects.length?'<table class="data"><thead><tr><th>Prospect</th><th>Stage</th><th>Ask</th><th>Sent</th><th>Follow-up</th></tr></thead><tbody>'+
				prospects.map(p=>'<tr><td><strong>'+esc(p.name)+'</strong></td><td>'+esc(p.stage)+'</td><td>'+esc(p.ask_tier)+' · $'+esc(p.ask_amount)+'</td><td>'+esc(p.sent_at?String(p.sent_at).slice(0,10):'—')+'</td><td>'+fundraising_fuText(p)+(p.follow_up_due_at?' ('+esc(String(p.follow_up_due_at).slice(0,10))+')':'')+'</td></tr>').join('')+'</tbody></table>'
				:'<div class="unavailable">No prospects yet.</div>')+
				'<p class="meta">Stage moves happen in <a href="/operating-center/growth?tab=funds&view=actions">Funds → Actions</a>.</p>';
			const cal=f.follow_up_calendar||{};
			const pending=prospects.filter(p=>p.follow_up_status==='due'||p.follow_up_status==='overdue');
			cb.innerHTML='<div class="detail">Due in window: <strong>'+esc(cal.due||0)+'</strong> · Overdue: <strong>'+esc(cal.overdue||0)+'</strong></div>'+
				(pending.length?pending.map(p=>'<div class="meta">'+esc(p.name)+': '+esc(p.follow_up_status)+(p.follow_up_due_at?' — '+esc(String(p.follow_up_due_at).slice(0,10)):'')+'</div>').join(''):'<div class="meta">No follow-ups pending.</div>');
			tb.innerHTML='<div class="detail">'+Object.entries(f.tiers||{}).map(([t,n])=>esc(t)+' × '+n).join(', ')+'</div>';
		}catch(err){fail(err)}
	}
`;

const FUNDRAISING_PANELS = ocFunction(
	"fundraising",
	FUNDRAISING_DESC,
	FUNDRAISING_SUMMARY_HTML,
	FUNDRAISING_ACTIONS_HTML,
	FUNDRAISING_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 3. Sellers (exclusive-seller pipeline + Zubie Five answers)
// ---------------------------------------------------------------------------

const SELLERS_DESC =
	"Commission sellers evaluating NWANA's inventory — the pipeline by company and stage, with the next dated step. The owner advances stages; the Machine only reads.";

const SELLERS_SUMMARY_HTML = `<section class="panel"><h2>Sellers summary</h2><div id="sellers-sum">Loading…</div></section>`;

const SELLERS_ACTIONS_HTML = `<section class="panel"><h2>Seller stage controls</h2>
		<p class="meta"><strong>Machine (automatic):</strong> reads this pipeline — nothing changes automatically. <strong>Owner (manual):</strong> the stage controls below.</p>
		<div class="message" id="sellers-act-message" aria-live="polite"></div>
		<div id="sellers-act">Loading…</div></section>`;

const SELLERS_DETAILS_HTML = `<section class="panel"><h2>Seller records</h2><div id="sellers-det">Loading…</div></section>`;

const SELLERS_SCRIPT = `
	// Seller ids are NOT in /api/operating-center/sellers/overview (the
	// server strips them), so the owner controls map company -> id from the
	// migration 0033 seed. Stage values are the ones observed in that seed;
	// the stage API accepts any non-empty value.
	const sellers_ID_BY_COMPANY={'Integrity 9':'integrity-9','Zubie Five':'zubie-five','Sea Theory':'sea-theory','Elevate':'elevate','Playfly':'playfly','Arco Global Media':'arco-global-media','The Sho Agency':'the-sho-agency','Sportsman Solutions':'sportsman-solutions','NXS Management':'nxs-management','SSEC':'ssec'};
	const sellers_STAGES=['Meeting confirmed','Reply received — numbers requested','Evaluating','Contacted — no reply'];
	async function sellers_fetchOverview(){
		return await api('/api/operating-center/sellers/overview');
	}
	async function sellers_advanceStage(sellerId){
		const msg=document.querySelector('#sellers-act-message');
		const sel=document.querySelector('select[data-seller-stage="'+sellerId+'"]');
		if(!sel)return;
		if(msg)msg.textContent='Moving…';
		try{
			await api('/api/operating-center/sellers/stage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({seller_id:sellerId,to_stage:sel.value})});
			if(msg)msg.textContent='Stage updated.';
			await boot_sellers_actions();
		}catch(err){if(msg)msg.textContent=err.message}
	}
	async function boot_sellers_summary(){
		const box=document.querySelector('#sellers-sum');
		try{
			const data=await sellers_fetchOverview();
			const sellers=data.sellers||[];
			const byStage={};
			sellers.forEach(s=>{byStage[s.stage]=(byStage[s.stage]||0)+1});
			const today=new Date().toISOString().slice(0,10);
			const overdue=sellers.filter(s=>s.next_date&&String(s.next_date)<today);
			let html='<div class="item"><strong>Seller pipeline <span class="badge">'+sellers.length+' conversation(s)</span></strong>';
			if(sellers.length)html+='<div class="detail">'+Object.keys(byStage).map(st=>esc(st)+': '+byStage[st]).join(' · ')+'</div>';
			const dated=sellers.filter(s=>s.next_date);
			if(dated.length)html+='<div class="detail">Next dated steps:<br>&bull; '+dated.map(s=>esc(s.company)+': '+esc(s.next_step)+' ('+esc(s.next_date)+')').join('<br>&bull; ')+'</div>';
			html+='</div>';
			const attn=[];
			if(!sellers.length)attn.push('No seller conversations recorded.');
			for(const s of overdue)attn.push(s.company+': next step "'+s.next_step+'" was dated '+s.next_date+' — overdue, follow up.');
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Reads this pipeline on demand; nothing changes automatically. Stage moves are owner actions below.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_sellers_actions(){
		const box=document.querySelector('#sellers-act');
		try{
			const data=await sellers_fetchOverview();
			const known=(data.sellers||[]).filter(s=>sellers_ID_BY_COMPANY[s.company]);
			if(!known.length){box.innerHTML='<div class="unavailable">No sellers with known ids — stage controls need the migration 0033 id map.</div>';return}
			box.innerHTML=known.map(s=>{
				const id=sellers_ID_BY_COMPANY[s.company];
				const opts=sellers_STAGES.map(st=>'<option value="'+esc(st)+'"'+(st===s.stage?' selected':'')+'>'+esc(st)+'</option>').join('');
				return '<div class="item"><strong>'+esc(s.company)+' — '+esc(s.contact)+'<span class="badge">'+esc(s.stage)+'</span></strong>'+
					'<div class="meta">Set stage: <select data-seller-stage="'+esc(id)+'" style="width:auto">'+opts+'</select> '+
					'<button type="button" class="secondary" data-seller-advance="'+esc(id)+'">Advance stage</button></div></div>';
			}).join('');
			box.querySelectorAll('[data-seller-advance]').forEach(b=>b.addEventListener('click',()=>sellers_advanceStage(b.dataset.sellerAdvance)));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_sellers_details(){
		const box=document.querySelector('#sellers-det');
		try{
			const data=await sellers_fetchOverview();
			let html='';
			for(const s of (data.sellers||[])){
				html+='<div class="item"><strong>'+esc(s.company)+' — '+esc(s.contact)+'<span class="badge">'+esc(s.stage)+'</span></strong>'+
					'<div class="meta">'+esc(s.role)+'</div>'+
					'<div class="detail">'+esc(s.last_event)+' <span class="meta">('+esc(s.last_event_date)+')</span></div>'+
					'<div class="detail"><b>Next:</b> '+esc(s.next_step)+(s.next_date?' <span class="meta">('+esc(s.next_date)+')</span>':'')+'</div></div>';
			}
			html+='<h3>What Zubie Five asked (2026-09-22)</h3><p class="meta">Adam Zubiate asked for numbers before a first call. The sellers report answers each question with what the machine can verify.</p>';
			for(const a of (data.zubie_five_answers||[])){
				html+='<div class="item"><strong>'+esc(a.question)+'</strong><div class="detail">'+esc(a.answer)+'</div></div>';
			}
			box.innerHTML=html||'<div class="unavailable">No sellers.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const SELLERS_PANELS = ocFunction(
	"sellers",
	SELLERS_DESC,
	SELLERS_SUMMARY_HTML,
	SELLERS_ACTIONS_HTML,
	SELLERS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 4. Partners (strategic partnership conversations)
// ---------------------------------------------------------------------------

const PARTNERS_DESC =
	"Strategic partnership conversations — one partnership for the whole system, not individual properties. The owner advances stages; the Machine only reads.";

const PARTNERS_SUMMARY_HTML = `<section class="panel"><h2>Partners summary</h2><div id="partners-sum">Loading…</div></section>`;

const PARTNERS_ACTIONS_HTML = `<section class="panel"><h2>Partner stage controls</h2>
		<p class="meta"><strong>Machine (automatic):</strong> reads this pipeline — nothing changes automatically. <strong>Owner (manual):</strong> the stage controls below.</p>
		<div class="message" id="partners-act-message" aria-live="polite"></div>
		<div id="partners-act">Loading…</div></section>`;

const PARTNERS_DETAILS_HTML = `<section class="panel"><h2>Partner records</h2><div id="partners-det">Loading…</div></section>`;

const PARTNERS_SCRIPT = `
	// Same id caveat as sellers: /api/operating-center/partners/overview
	// strips partner ids, so the map below is the migration 0033 seed.
	// The only stage value observed in the seed is listed; the stage API
	// accepts any non-empty value.
	const partners_ID_BY_NAME={'AARP':'aarp'};
	const partners_STAGES=['Draft — no recipient yet'];
	async function partners_fetchOverview(){
		return await api('/api/operating-center/partners/overview');
	}
	async function partners_advanceStage(partnerId){
		const msg=document.querySelector('#partners-act-message');
		const sel=document.querySelector('select[data-partner-stage="'+partnerId+'"]');
		if(!sel)return;
		if(msg)msg.textContent='Moving…';
		try{
			await api('/api/operating-center/partners/stage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({partner_id:partnerId,to_stage:sel.value})});
			if(msg)msg.textContent='Stage updated.';
			await boot_partners_actions();
		}catch(err){if(msg)msg.textContent=err.message}
	}
	async function boot_partners_summary(){
		const box=document.querySelector('#partners-sum');
		try{
			const data=await partners_fetchOverview();
			const partners=data.partners||[];
			const byStage={};
			partners.forEach(p=>{byStage[p.stage]=(byStage[p.stage]||0)+1});
			let html='<div class="item"><strong>Partner pipeline <span class="badge">'+partners.length+' conversation(s)</span></strong>';
			if(partners.length)html+='<div class="detail">'+Object.keys(byStage).map(st=>esc(st)+': '+byStage[st]).join(' · ')+'</div>';
			if(partners.length)html+='<div class="detail">'+partners.map(p=>'&bull; '+esc(p.name)+' — '+esc(p.subject)).join('<br>')+'</div>';
			html+='</div>';
			const attn=[];
			if(!partners.length)attn.push('No partner conversations recorded.');
			else if(partners.length&&partners.every(p=>p.stage===partners_STAGES[0]))attn.push('All partner records are still at "'+partners_STAGES[0]+'" — no recipient named yet.');
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Reads this pipeline on demand; nothing changes automatically. Stage moves are owner actions below.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_partners_actions(){
		const box=document.querySelector('#partners-act');
		try{
			const data=await partners_fetchOverview();
			const known=(data.partners||[]).filter(p=>partners_ID_BY_NAME[p.name]);
			if(!known.length){box.innerHTML='<div class="unavailable">No partners with known ids — stage controls need the migration 0033 id map.</div>';return}
			box.innerHTML=known.map(p=>{
				const id=partners_ID_BY_NAME[p.name];
				const opts=partners_STAGES.map(st=>'<option value="'+esc(st)+'"'+(st===p.stage?' selected':'')+'>'+esc(st)+'</option>').join('');
				return '<div class="item"><strong>'+esc(p.name)+'<span class="badge">'+esc(p.stage)+'</span></strong>'+
					'<div class="meta">Set stage: <select data-partner-stage="'+esc(id)+'" style="width:auto">'+opts+'</select> '+
					'<button type="button" class="secondary" data-partner-advance="'+esc(id)+'">Advance stage</button></div></div>';
			}).join('');
			box.querySelectorAll('[data-partner-advance]').forEach(b=>b.addEventListener('click',()=>partners_advanceStage(b.dataset.partnerAdvance)));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_partners_details(){
		const box=document.querySelector('#partners-det');
		try{
			const data=await partners_fetchOverview();
			let html='';
			for(const p of (data.partners||[])){
				html+='<div class="item"><strong>'+esc(p.name)+'<span class="badge">'+esc(p.stage)+'</span></strong>'+
					'<div class="detail"><b>Proposal:</b> '+esc(p.subject)+'</div>'+
					'<div class="detail">'+esc(p.last_event)+' <span class="meta">('+esc(p.last_event_date)+')</span></div></div>';
			}
			html+='<p class="meta">Registry note: '+esc(data.note||'—')+'</p>';
			box.innerHTML=html||'<div class="unavailable">No partners.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const PARTNERS_PANELS = ocFunction(
	"partners",
	PARTNERS_DESC,
	PARTNERS_SUMMARY_HTML,
	PARTNERS_ACTIONS_HTML,
	PARTNERS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 5. Funds (Executive money view)
// ---------------------------------------------------------------------------

const FUNDS_DESC =
	"Executive money view — every fund's goal, raised, prospects and follow-ups. Fundraising and sponsorship are separate processes with separate lifecycles; they are only shown side by side, never merged.";

const FUNDS_SUMMARY_HTML = `<section class="panel"><h2>Funds summary</h2><div id="funds-sum">Loading…</div></section>`;

const FUNDS_ACTIONS_HTML = `<section class="panel"><h2>Fund actions</h2>
		<p class="meta"><strong>Machine (automatic):</strong> none here — the owner presses Send; the machine never sends. <strong>Owner (manual):</strong> advance a prospect, or seed the first fund (only meaningful while no funds exist).</p>
		<div class="message" id="funds-act-message" aria-live="polite"></div>
		<div id="funds-act">Loading…</div></section>`;

const FUNDS_DETAILS_HTML = `<section class="panel"><h2>Fund prospect records</h2><div id="funds-det">Loading…</div></section>`;

const FUNDS_SCRIPT = `
	const funds_ORDER=['prospect','verified','drafted','sent','follow_up','committed','stewardship','recognition'];
	const funds_LABEL={prospect:'Prospect',verified:'Verified',drafted:'Drafted',sent:'Sent',follow_up:'Follow-up',committed:'Committed',stewardship:'Stewardship',recognition:'Public recognition'};
	function funds_money(n){return '$'+Number(n||0).toLocaleString('en-US')}
	async function funds_fetch(){
		return await api('/api/operating-center/fund');
	}
	async function boot_funds_summary(){
		const box=document.querySelector('#funds-sum');
		try{
			const data=await funds_fetch();
			const funds=data.funds||[];
			let html='';
			if(!funds.length){
				html='<div class="unavailable">No funds yet. The next step is the "Seed fund" owner action in Actions.</div>';
			}else{
				html=funds.map(f=>{
					const fund=f.fund;
					const pct=fund.goal_amount?Math.round(100*fund.raised_amount/fund.goal_amount):0;
					const dueNow=Number(f.follow_ups_due_now||0);
					const counts=funds_ORDER.map(s=>esc(funds_LABEL[s])+': '+((f.stage_counts||{})[s]||0)).join(' · ');
					return '<div class="item"><strong>'+esc(fund.name)+'<span class="badge">'+esc(fund.status)+'</span></strong>'+
						'<div class="detail">Goal '+funds_money(fund.goal_amount)+' · Raised '+funds_money(fund.raised_amount)+' ('+pct+'%) · '+(f.prospects||[]).length+' prospect(s)</div>'+
						'<div class="meta'+(dueNow?' followup-due':'')+'">Follow-ups due now: '+dueNow+'</div>'+
						'<div class="meta">'+counts+'</div></div>';
				}).join('');
			}
			try{
				const m=await api('/api/operating-center/money/overview');
				const fr=m.fundraising||{}, dn=m.donations||{}, sp=m.sponsorship||{};
				html+='<div class="item"><strong>Executive total (all revenue)</strong>'+
					'<div class="detail">Fundraising: raised '+funds_money((fr.totals||{}).raised_amount)+' of '+funds_money((fr.totals||{}).goal_amount)+'</div>'+
					'<div class="detail">Donations: '+(dn.available?'<span class="badge-ok">connected</span>':'<span class="unavailable">'+esc(dn.reason||'not available')+'</span>')+'</div>'+
					'<div class="detail">Sponsorship committed assets: '+(sp.committed_count!=null?esc(sp.committed_count):'—')+'</div>'+
					'<div class="meta">'+esc(m.disclaimer||'')+'</div></div>';
			}catch(err2){html+='<div class="item"><strong>Executive total (all revenue)</strong><div class="unavailable">'+esc(err2.message)+'</div></div>'}
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Computed this view live from the fund registry. The owner presses Send; the machine never sends. Fundraising and sponsorship are separate processes — shown side by side here, never merged.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_funds_actions(){
		const box=document.querySelector('#funds-act');
		const msg=document.querySelector('#funds-act-message');
		try{
			const data=await funds_fetch();
			const funds=data.funds||[];
			let html='';
			if(!funds.length){
				html='<div class="item"><strong>Seed fund</strong><div class="detail">No funds exist yet — this is the only time the Seed action is meaningful. It creates the first fund record.</div>'+
					'<div class="mrow"><button type="button" class="secondary" data-funds-seed>Seed fund</button></div></div>';
			}else{
				for(const f of funds){
					html+='<div class="item"><strong>'+esc(f.fund.name)+'</strong>'+
						(f.prospects||[]).map(p=>{
							const next=funds_ORDER[funds_ORDER.indexOf(p.stage)+1];
							const btn=next?'<button type="button" class="secondary" data-funds-advance="'+esc(p.id)+'" data-to="'+esc(next)+'">Move to '+esc(funds_LABEL[next])+'</button>':'<span class="meta">Terminal stage</span>';
							return '<div class="item"><strong>'+esc(p.name)+'<span class="badge">'+esc(funds_LABEL[p.stage]||p.stage)+'</span></strong><div class="mrow">'+btn+'</div></div>';
						}).join('')+'</div>';
				}
				html+='<p class="meta">The "Seed fund" action appears only while no funds exist.</p>';
			}
			box.innerHTML=html||'<div class="unavailable">No data.</div>';
			const seedBtn=box.querySelector('[data-funds-seed]');
			if(seedBtn)seedBtn.addEventListener('click',async()=>{
				msg.textContent='Seeding…';
				try{
					await api('/api/operating-center/fund/seed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})});
					msg.textContent='Fund seeded.';
					await boot_funds_actions();
				}catch(err){msg.textContent=err.message}
			});
			box.querySelectorAll('[data-funds-advance]').forEach(b=>b.addEventListener('click',async()=>{
				msg.textContent='Moving…';
				try{
					await api('/api/operating-center/fund/prospect/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prospect_id:b.dataset.fundsAdvance,to_stage:b.dataset.to})});
					msg.textContent='Moved.';
					await boot_funds_actions();
				}catch(err){msg.textContent=err.message}
			}));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_funds_details(){
		const box=document.querySelector('#funds-det');
		try{
			const data=await funds_fetch();
			const funds=data.funds||[];
			if(!funds.length){box.innerHTML='<div class="unavailable">No funds yet.</div>';return}
			box.innerHTML=funds.map(f=>{
				const rows=(f.prospects||[]).map(p=>{
					const fu=p.follow_up_status;
					const fuDate=p.follow_up_due_at?String(p.follow_up_due_at).slice(0,10):'';
					const fuTxt=!fu||fu==='none'?'—':fu==='upcoming'?'due '+fuDate:fu==='due'?'due now ('+fuDate+')':'overdue ('+fuDate+')';
					return '<tr><td><strong>'+esc(p.name)+'</strong></td><td>'+esc(funds_LABEL[p.stage]||p.stage)+'</td><td>'+esc(p.ask_tier||'—')+'</td><td>'+esc(p.sent_at?String(p.sent_at).slice(0,10):'—')+'</td><td>'+esc(fuTxt)+'</td><td>'+esc(p.next_action||'—')+'</td></tr>';
				}).join('');
				return '<h3>'+esc(f.fund.name)+'</h3>'+
					'<div class="meta">Goal '+funds_money(f.fund.goal_amount)+' · Raised '+funds_money(f.fund.raised_amount)+' · '+esc(f.fund.status)+'</div>'+
					(rows?'<table class="data"><thead><tr><th>Prospect</th><th>Stage</th><th>Ask tier</th><th>Sent</th><th>Follow-up</th><th>Next action</th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="unavailable">No prospects.</div>');
			}).join('');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const FUNDS_PANELS = ocFunction(
	"funds",
	FUNDS_DESC,
	FUNDS_SUMMARY_HTML,
	FUNDS_ACTIONS_HTML,
	FUNDS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 6. Instructor Growth Fund (fundraising-asset view)
// ---------------------------------------------------------------------------

const IGF_DESC =
	"The Instructor Growth Fund as a fundraising asset — goal, prospects and follow-ups. The operational outcome (funded places → students → completions → certifications) lives in Academy → Performance.";

const IGF_SUMMARY_HTML = `<section class="panel"><h2>Instructor Growth Fund summary</h2><div id="igf-sum">Loading…</div></section>`;

const IGF_ACTIONS_HTML = `<section class="panel"><h2>Instructor Growth Fund actions</h2>
		<p class="meta"><strong>Machine (automatic):</strong> none here — the owner presses Send; the machine never sends. <strong>Owner (manual):</strong> advance a prospect below.</p>
		<div class="message" id="igf-act-message" aria-live="polite"></div>
		<div id="igf-act">Loading…</div></section>`;

const IGF_DETAILS_HTML = `<section class="panel"><h2>Instructor Growth Fund records</h2>
		<p class="meta">This is the fundraising-asset view: goal, raised, prospects, stages, follow-ups. The operational outcome — funded places → students → completions → certifications/instructors — lives in Academy → Performance, never money here.</p>
		<div id="igf-det">Loading…</div></section>`;

const IGF_SCRIPT = `
	const igf_ORDER=['prospect','verified','drafted','sent','follow_up','committed','stewardship','recognition'];
	const igf_LABEL={prospect:'Prospect',verified:'Verified',drafted:'Drafted',sent:'Sent',follow_up:'Follow-up',committed:'Committed',stewardship:'Stewardship',recognition:'Public recognition'};
	function igf_money(n){return '$'+Number(n||0).toLocaleString('en-US')}
	async function igf_findFund(){
		const data=await api('/api/operating-center/fund');
		return (data.funds||[]).find(x=>x.fund&&x.fund.name==='Instructor Growth Fund')||null;
	}
	function igf_fuLine(p){
		const fu=p.follow_up_status;
		if(!fu||fu==='none')return '';
		const fuDate=p.follow_up_due_at?esc(String(p.follow_up_due_at).slice(0,10)):'';
		const cls=fu==='overdue'?'followup-overdue':fu==='due'?'followup-due':'';
		return '<div class="meta '+cls+'">Follow-up '+(fu==='upcoming'?'due '+fuDate:fu==='due'?'due now ('+fuDate+')':'overdue (was due '+fuDate+')')+'.</div>';
	}
	function igf_prospectRows(f,withButtons){
		return (f.prospects||[]).map(p=>{
			const next=igf_ORDER[igf_ORDER.indexOf(p.stage)+1];
			const btn=withButtons
				?(next?'<button type="button" class="secondary" data-igf-advance="'+esc(p.id)+'" data-to="'+esc(next)+'">Move to '+esc(igf_LABEL[next])+'</button>':'<span class="meta">Terminal stage</span>')
				:'';
			return '<div class="item"><strong>'+esc(p.name)+'<span class="badge">'+esc(igf_LABEL[p.stage]||p.stage)+'</span></strong>'+
				'<div class="meta">ask '+esc(p.ask_tier||'—')+' · '+(p.sent_at?'sent '+esc(String(p.sent_at).slice(0,10)):'not sent')+'</div>'+
				igf_fuLine(p)+
				'<div class="meta">Next: '+esc(p.next_action||'—')+'</div>'+
				(btn?'<div class="mrow">'+btn+'</div>':'')+'</div>';
		}).join('');
	}
	function igf_header(f,compact){
		const fund=f.fund;
		const pct=fund.goal_amount?Math.round(100*fund.raised_amount/fund.goal_amount):0;
		const dueNow=Number(f.follow_ups_due_now||0);
		let h='<div class="item"><strong>'+esc(fund.name)+'<span class="badge">'+esc(fund.status)+'</span></strong>'+
			'<div class="detail">Goal '+igf_money(fund.goal_amount)+' · Raised '+igf_money(fund.raised_amount)+' ('+pct+'%) · '+(f.prospects||[]).length+' prospect(s)</div>'+
			'<div class="meta'+(dueNow?' followup-due':'')+'">Follow-ups due now: '+dueNow+'</div>';
		if(!compact)h+='<div class="meta">'+igf_ORDER.map(s=>esc(igf_LABEL[s])+': '+((f.stage_counts||{})[s]||0)).join(' · ')+'</div>';
		return h+'</div>';
	}
	async function boot_igf_summary(){
		const box=document.querySelector('#igf-sum');
		try{
			const f=await igf_findFund();
			if(!f){box.innerHTML='<div class="unavailable">The Instructor Growth Fund is not seeded yet — the next step is the "Seed fund" owner action in <button type="button" class="secondary" data-qa="funds|actions">Funds → Actions</button>.</div>';return}
			let html=igf_header(f,false);
			const attn=[];
			if(Number(f.follow_ups_due_now)>0)attn.push(f.follow_ups_due_now+' follow-up(s) due now.');
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Read this fund live from the registry. The owner presses Send; the machine never sends.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_igf_actions(){
		const box=document.querySelector('#igf-act');
		const msg=document.querySelector('#igf-act-message');
		try{
			const f=await igf_findFund();
			if(!f){box.innerHTML='<div class="unavailable">The Instructor Growth Fund is not seeded yet — seed it in Funds → Actions.</div>';return}
			box.innerHTML=igf_header(f,true)+igf_prospectRows(f,true);
			box.querySelectorAll('[data-igf-advance]').forEach(b=>b.addEventListener('click',async()=>{
				msg.textContent='Moving…';
				try{
					await api('/api/operating-center/fund/prospect/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prospect_id:b.dataset.igfAdvance,to_stage:b.dataset.to})});
					msg.textContent='Moved.';
					await boot_igf_actions();
				}catch(err){msg.textContent=err.message}
			}));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_igf_details(){
		const box=document.querySelector('#igf-det');
		try{
			const f=await igf_findFund();
			if(!f){box.innerHTML='<div class="unavailable">The Instructor Growth Fund is not seeded yet.</div>';return}
			box.innerHTML=igf_header(f,false)+igf_prospectRows(f,false);
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const IGF_PANELS = ocFunction(
	"igf",
	IGF_DESC,
	IGF_SUMMARY_HTML,
	IGF_ACTIONS_HTML,
	IGF_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// View routing (Summary / Actions / Details per function) — appended once
// ---------------------------------------------------------------------------

const GRO_VIEW_SCRIPT = ocViewScript("gro", [
	"sponsorship",
	"fundraising",
	"sellers",
	"partners",
	"funds",
	"igf",
]);

// ---------------------------------------------------------------------------

export function renderGrowthSectionHtml(): string {
	return ocSectionShell({
		section: "growth",
		title: "Growth",
		subtitle: "Revenue engines — sponsorship, fundraising, sellers, partners, funds.",
		queryTabs: true,
		tabs: [
			{ id: "sponsorship", label: "Sponsorship", panelsHtml: SPONSORSHIP_PANELS, script: SPONSORSHIP_SCRIPT },
			{ id: "fundraising", label: "Fundraising", panelsHtml: FUNDRAISING_PANELS, script: FUNDRAISING_SCRIPT, reportId: "fundraising" },
			{ id: "sellers", label: "Sellers", panelsHtml: SELLERS_PANELS, script: SELLERS_SCRIPT, reportId: "sellers" },
			{ id: "partners", label: "Partners", panelsHtml: PARTNERS_PANELS, script: PARTNERS_SCRIPT, reportId: "partners" },
			{ id: "funds", label: "Funds", panelsHtml: FUNDS_PANELS, script: FUNDS_SCRIPT },
			{ id: "igf", label: "Instructor Growth Fund", panelsHtml: IGF_PANELS, script: IGF_SCRIPT + GRO_VIEW_SCRIPT },
		],
	});
}
