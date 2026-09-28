// Operating Center — Growth section (7-section rebuild).
//
// Six tabs, each reusing one former screen's panels and client-side logic:
//  1. sponsorship — generate-package form, assets by stage, stage
//     advancement buttons. Was renderSponsorshipHtml
//     (src/operating-center-sponsorship.ts). No report id (the old screen
//     had none).
//  2. fundraising — the Fund object summary. Was renderFundraisingHtml
//     (src/operating-center-screens.ts), report id "fundraising" reused
//     unchanged.
//  3. sellers — exclusive-seller pipeline + Zubie Five answers. Was
//     renderSellersHtml (src/operating-center-screens.ts), report id
//     "sellers" reused unchanged. NEW vs the old screen: per-seller stage
//     controls calling the existing POST /api/operating-center/sellers/stage
//     {seller_id, to_stage}. Seller ids are NOT in the overview response
//     (toSellerRecord strips them), so the script carries the id map from
//     migrations/0033-seller-partner-pipeline.sql; rows without a known id
//     get no controls.
//  4. partners — partner pipeline. Was renderPartnersHtml
//     (src/operating-center-screens.ts), report id "partners" reused
//     unchanged. NEW vs the old screen: per-partner stage controls calling
//     the existing POST /api/operating-center/partners/stage
//     {partner_id, to_stage}.
//  5. funds — Executive money view detail with prospect advance buttons.
//     Was renderFundsHtml (src/operating-center-funds.ts). No report id
//     (the old screen had none).
//  6. igf — NEW tab: the "Instructor Growth Fund" rendered with the same
//     fund-detail markup and the same prospect-advance actions as the Funds
//     tab, via the same /api/operating-center/fund endpoint. No new API
//     routes, no new services, no new runtime cost.
//
// Tab scripts reuse the shell's global esc()/api(); the owner-key gate lives
// in the shell, so no tab script touches the gate. All top-level script
// names are prefixed per tab (the shell concatenates all tab scripts into
// one <script> block).

import { ocSectionShell } from "./oc-shell";

// ---------------------------------------------------------------------------
// 1. Sponsorship
// ---------------------------------------------------------------------------

const SPONSORSHIP_PANELS = `<section class="panel">
				<h2>Generate a package</h2>
				<form id="sponsorship-generate-form">
					<label for="sponsorship-object-type">Object type</label>
					<select id="sponsorship-object-type" name="object_type"><option value="series">series</option><option value="fund">fund</option></select>
					<label for="sponsorship-object-id">Object id</label>
					<input id="sponsorship-object-id" name="object_id" required maxlength="120" placeholder="SERIES_2026 or a fund id">
					<button type="submit">Generate package</button>
					<div class="message" id="sponsorship-generate-message" aria-live="polite"></div>
				</form>
			</section>
			<section class="panel">
				<h2>Assets</h2>
				<div class="message" id="sponsorship-message" aria-live="polite"></div>
				<div id="sponsorship-assets">Loading…</div>
			</section>`;

const SPONSORSHIP_SCRIPT = `
	const sponsorship_LABEL={draft:'Draft',packaged:'Packaged',offered:'Offered',negotiating:'Negotiating',committed:'Committed',fulfilled:'Fulfilled',renewal:'Renewal'};
	const sponsorship_TRANSITIONS={draft:['packaged'],packaged:['draft','offered'],offered:['packaged','negotiating'],negotiating:['offered','committed'],committed:['negotiating','fulfilled'],fulfilled:['committed','renewal'],renewal:[]};
	function sponsorship_formJson(form){return Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,String(v)]))}
	async function sponsorship_advanceAsset(assetId,toStage,msg){
		msg.textContent='Moving…';
		try{
			await api('/api/operating-center/sponsorship-assets/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({asset_id:assetId,to_stage:toStage})});
			msg.textContent='Moved to '+toStage+'.';
			await boot_sponsorship();
		}catch(err){msg.textContent=err.message}
	}
	async function boot_sponsorship(){
		const box=document.querySelector('#sponsorship-assets');
		const msg=document.querySelector('#sponsorship-message');
		try{
			const data=await api('/api/operating-center/sponsorship-assets');
			const assets=data.assets||[];
			if(!assets.length){box.innerHTML='<div class="unavailable">No sponsorship assets yet. Generate one above.</div>';return}
			box.innerHTML=assets.map(a=>{
				const moves=(sponsorship_TRANSITIONS[a.stage]||[]);
				const buttons=moves.map(s=>'<button class="secondary" data-advance="'+esc(a.id)+'" data-to="'+esc(s)+'" type="button">Move to '+esc(sponsorship_LABEL[s]||s)+'</button>').join('');
				return '<div class="item"><strong>'+esc(a.title)+'<span class="badge">'+esc(sponsorship_LABEL[a.stage]||a.stage)+'</span></strong>'+
					'<div class="meta">'+esc(a.object_type)+' · '+esc(a.object_id)+(a.stage_updated_at?' · stage updated '+esc(String(a.stage_updated_at).slice(0,10)):'')+'</div>'+
					(a.description?'<div class="detail"><b>Package:</b> '+esc(a.description)+'</div>':'')+
					(a.audience?'<div class="detail"><b>Audience:</b> '+esc(a.audience)+'</div>':'')+
					(a.delivers?'<div class="detail"><b>Delivers:</b> '+esc(a.delivers)+'</div>':'')+
					(a.reference_pricing?'<div class="detail"><b>Reference pricing:</b> '+esc(a.reference_pricing)+'</div>':'')+
					(a.next_action?'<div class="detail"><b>Next action:</b> '+esc(a.next_action)+'</div>':'')+
					(buttons?'<div>'+buttons+'</div>':'<div class="meta">Terminal stage.</div>')+
					'</div>';
			}).join('');
			box.querySelectorAll('[data-advance]').forEach(b=>b.addEventListener('click',()=>sponsorship_advanceAsset(b.dataset.advance,b.dataset.to,msg)));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	document.querySelector('#sponsorship-generate-form').addEventListener('submit',async(e)=>{
		e.preventDefault();
		const m=document.querySelector('#sponsorship-generate-message');m.textContent='Generating…';
		try{
			const fd=sponsorship_formJson(e.target);
			const data=await api('/api/operating-center/sponsorship-assets/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({object_type:fd.object_type,object_id:fd.object_id})});
			m.textContent=data.generated?'Package generated.':'Package already exists.';
			await boot_sponsorship();
		}catch(err){m.textContent=err.message}
	});
`;

// ---------------------------------------------------------------------------
// 2. Fundraising
// ---------------------------------------------------------------------------

const FUNDRAISING_PANELS = `<section class="panel">
				<h2>Founding Circle bridge sprint</h2>
				<div id="fundraising-list">Loading…</div>
			</section>`;

const FUNDRAISING_SCRIPT = `
	async function boot_fundraising(){
		const box=document.querySelector('#fundraising-list');
		try{
			const data=await api('/api/operating-center/fundraising/overview');
			const f=data.fund;
			if(!f){box.innerHTML='<div class="unavailable">No fund objects yet.</div>';return}
			const stages=Object.entries(f.stage_counts||{}).filter(([,n])=>n>0).map(([s,n])=>esc(s)+': '+n).join(' &middot; ');
			let html='<div class="item"><strong>'+esc(f.name)+'<span class="badge">'+esc(f.status)+'</span></strong>';
			html+='<div class="detail">'+esc(f.description||'')+'</div>';
			html+='<div class="detail"><b>Goal:</b> $'+esc(f.goal_amount)+' &middot; <b>Raised:</b> $'+esc(f.raised_amount)+' &middot; <b>Prospects:</b> '+esc(f.prospect_count)+'</div>';
			html+='<div class="detail"><b>Pipeline:</b> '+stages+'</div>';
			html+='<div class="detail"><b>Follow-ups due now:</b> '+esc(f.follow_ups_due_now)+' (window: due '+esc(f.follow_up_calendar.due)+', overdue '+esc(f.follow_up_calendar.overdue)+')</div>';
			html+='<div class="detail"><b>Tiers:</b> '+Object.entries(f.tiers||{}).map(([t,n])=>esc(t)+' &times; '+n).join(', ')+'</div></div>';
			html+='<h3>Prospects</h3>';
			for(const p of (f.prospects||[])){
				html+='<div class="item"><strong>'+esc(p.name)+'<span class="badge">'+esc(p.stage)+'</span></strong>'+
					'<div class="meta">'+esc(p.ask_tier)+' &middot; asked $'+esc(p.ask_amount)+(p.sent_at?' &middot; sent '+esc(String(p.sent_at).slice(0,10)):'')+'</div>'+
					(p.follow_up_status==='due'?'<div class="detail"><b>Follow-up due:</b> '+esc(String(p.follow_up_due_at||'').slice(0,10))+'</div>':'')+
					(p.follow_up_status==='overdue'?'<div class="detail"><b style="color:#b00020">Follow-up overdue:</b> '+esc(String(p.follow_up_due_at||'').slice(0,10))+'</div>':'')+
					'</div>';
			}
			html+='<p class="meta">The full prospect pipeline with stage advancement lives on the <a href="/operating-center/growth#funds">Funds tab</a>.</p>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------
// 3. Sellers (with NEW owner stage-advance controls)
// ---------------------------------------------------------------------------

const SELLERS_PANELS = `<section class="panel">
				<h2>Exclusive-seller conversations</h2>
				<div id="sellers-list">Loading…</div>
			</section>`;

const SELLERS_SCRIPT = `
	// Seller ids are NOT in /api/operating-center/sellers/overview (the
	// server strips them), so the owner controls map company -> id from the
	// migration 0033 seed. Stage values are the ones observed in that seed;
	// the stage API accepts any non-empty value.
	const sellers_ID_BY_COMPANY={'Integrity 9':'integrity-9','Zubie Five':'zubie-five','Sea Theory':'sea-theory','Elevate':'elevate','Playfly':'playfly','Arco Global Media':'arco-global-media','The Sho Agency':'the-sho-agency','Sportsman Solutions':'sportsman-solutions','NXS Management':'nxs-management','SSEC':'ssec'};
	const sellers_STAGES=['Meeting confirmed','Reply received — numbers requested','Evaluating','Contacted — no reply'];
	function sellers_stageControl(s){
		const id=sellers_ID_BY_COMPANY[s.company];
		if(!id)return '';
		const opts=sellers_STAGES.map(st=>'<option value="'+esc(st)+'"'+(st===s.stage?' selected':'')+'>'+esc(st)+'</option>').join('');
		return '<div class="meta">Set stage: <select data-seller-stage="'+esc(id)+'" style="width:auto">'+opts+'</select> '+
			'<button type="button" class="secondary" data-seller-advance="'+esc(id)+'">Advance stage</button></div>';
	}
	async function sellers_advanceStage(sellerId){
		const panel=document.querySelector('#tabpanel-sellers');
		const m=panel?panel.querySelector('.oc-tab-error'):null;
		const sel=panel?panel.querySelector('select[data-seller-stage="'+esc(sellerId)+'"]'):null;
		if(!sel)return;
		if(m)m.textContent='Moving…';
		try{
			await api('/api/operating-center/sellers/stage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({seller_id:sellerId,to_stage:sel.value})});
			if(m)m.textContent='Stage updated.';
			await boot_sellers();
		}catch(err){if(m)m.textContent=err.message}
	}
	async function boot_sellers(){
		const box=document.querySelector('#sellers-list');
		try{
			const data=await api('/api/operating-center/sellers/overview');
			let html='<h3>Seller pipeline</h3>';
			for(const s of (data.sellers||[])){
				html+='<div class="item"><strong>'+esc(s.company)+' — '+esc(s.contact)+'<span class="badge">'+esc(s.stage)+'</span></strong>'+
					'<div class="meta">'+esc(s.role)+'</div>'+
					'<div class="detail">'+esc(s.last_event)+' <span class="meta">('+esc(s.last_event_date)+')</span></div>'+
					'<div class="detail"><b>Next:</b> '+esc(s.next_step)+(s.next_date?' <span class="meta">('+esc(s.next_date)+')</span>':'')+'</div>'+
					sellers_stageControl(s)+'</div>';
			}
			html+='<h3>What Zubie Five asked (2026-09-22)</h3><p class="meta">Adam Zubiate asked for numbers before a first call. The sellers report answers each question with what the machine can verify.</p>';
			for(const a of (data.zubie_five_answers||[])){
				html+='<div class="item"><strong>'+esc(a.question)+'</strong><div class="detail">'+esc(a.answer)+'</div></div>';
			}
			box.innerHTML=html;
			box.querySelectorAll('[data-seller-advance]').forEach(b=>b.addEventListener('click',()=>sellers_advanceStage(b.dataset.sellerAdvance)));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------
// 4. Partners (with NEW owner stage-advance controls)
// ---------------------------------------------------------------------------

const PARTNERS_PANELS = `<section class="panel">
				<h2>Partnerships</h2>
				<div id="partners-list">Loading…</div>
			</section>`;

const PARTNERS_SCRIPT = `
	// Same id caveat as sellers: /api/operating-center/partners/overview
	// strips partner ids, so the map below is the migration 0033 seed.
	// The only stage value observed in the seed is listed; the stage API
	// accepts any non-empty value.
	const partners_ID_BY_NAME={'AARP':'aarp'};
	const partners_STAGES=['Draft — no recipient yet'];
	function partners_stageControl(p){
		const id=partners_ID_BY_NAME[p.name];
		if(!id)return '';
		const opts=partners_STAGES.map(st=>'<option value="'+esc(st)+'"'+(st===p.stage?' selected':'')+'>'+esc(st)+'</option>').join('');
		return '<div class="meta">Set stage: <select data-partner-stage="'+esc(id)+'" style="width:auto">'+opts+'</select> '+
			'<button type="button" class="secondary" data-partner-advance="'+esc(id)+'">Advance stage</button></div>';
	}
	async function partners_advanceStage(partnerId){
		const panel=document.querySelector('#tabpanel-partners');
		const m=panel?panel.querySelector('.oc-tab-error'):null;
		const sel=panel?panel.querySelector('select[data-partner-stage="'+esc(partnerId)+'"]'):null;
		if(!sel)return;
		if(m)m.textContent='Moving…';
		try{
			await api('/api/operating-center/partners/stage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({partner_id:partnerId,to_stage:sel.value})});
			if(m)m.textContent='Stage updated.';
			await boot_partners();
		}catch(err){if(m)m.textContent=err.message}
	}
	async function boot_partners(){
		const box=document.querySelector('#partners-list');
		try{
			const data=await api('/api/operating-center/partners/overview');
			let html='';
			for(const p of (data.partners||[])){
				html+='<div class="item"><strong>'+esc(p.name)+'<span class="badge">'+esc(p.stage)+'</span></strong>'+
					'<div class="detail"><b>Proposal:</b> '+esc(p.subject)+'</div>'+
					'<div class="detail">'+esc(p.last_event)+' <span class="meta">('+esc(p.last_event_date)+')</span></div>'+
					partners_stageControl(p)+'</div>';
			}
			html+='<p class="meta">'+esc(data.note)+'</p>';
			box.innerHTML=html;
			box.querySelectorAll('[data-partner-advance]').forEach(b=>b.addEventListener('click',()=>partners_advanceStage(b.dataset.partnerAdvance)));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------
// 5. Funds (Executive money view detail)
// ---------------------------------------------------------------------------

const FUNDS_PANELS = `<section class="panel">
				<div><span class="message" id="fund-message" aria-live="polite"></span></div>
				<div id="funds">Loading…</div>
			</section>`;

const FUNDS_SCRIPT = `
	async function boot_funds(){
		const box=document.querySelector('#funds');
		const order=['prospect','verified','drafted','sent','follow_up','committed','stewardship','recognition'];
		const label={prospect:'Prospect',verified:'Verified',drafted:'Drafted',sent:'Sent',follow_up:'Follow-up',committed:'Committed',stewardship:'Stewardship',recognition:'Public recognition'};
		const money=n=>'$'+Number(n||0).toLocaleString('en-US');
		try{
			const data=await api('/api/operating-center/fund');
			if(!data.funds.length){box.innerHTML='<div class="unavailable">No funds yet.</div>';return}
			box.innerHTML=data.funds.map(f=>{
				const counts=order.map(s=>esc(label[s])+': '+f.stage_counts[s]).join(' · ');
				const pct=f.fund.goal_amount?Math.round(100*f.fund.raised_amount/f.fund.goal_amount):0;
				const dueNow=Number(f.follow_ups_due_now||0);
				const dueLine='<div class="meta'+(dueNow?' followup-due':'')+'">Follow-ups due now: '+dueNow+'. The owner presses Send; the machine never sends.</div>';
				const rows=f.prospects.map(p=>{
					const next=order[order.indexOf(p.stage)+1];
					const btn=next?'<button data-advance="'+esc(p.id)+'" data-to="'+esc(next)+'" style="width:auto">Move to '+esc(label[next])+'</button>':'<span class="meta">Terminal stage</span>';
					const fu=p.follow_up_status;
					const fuDate=p.follow_up_due_at?esc(String(p.follow_up_due_at).slice(0,10)):'';
					const fuLine=fu==='none'?'':'<div class="meta '+(fu==='overdue'?'followup-overdue':fu==='due'?'followup-due':'')+'">Follow-up '+(fu==='upcoming'?'due '+fuDate:fu==='due'?'due now ('+fuDate+')':'overdue (was due '+fuDate+')')+'.</div>';
					return '<div class="item"><strong>'+esc(p.name)+'</strong>'+
						'<div class="meta">'+esc(label[p.stage]||p.stage)+' · ask '+esc(p.ask_tier||'')+' · '+(p.sent_at?'sent '+esc(p.sent_at.slice(0,10)):'not sent')+'</div>'+
						fuLine+
						'<div class="meta">Next: '+esc(p.next_action)+'</div>'+
						'<div>'+btn+'</div></div>';
				}).join('');
				return '<div class="item"><strong>'+esc(f.fund.name)+'</strong>'+
					'<div class="meta">Goal '+money(f.fund.goal_amount)+' · Raised '+money(f.fund.raised_amount)+' ('+pct+'%) · '+esc(f.fund.status)+'</div>'+
					dueLine+
					'<div class="meta">'+esc(counts)+'</div>'+rows+'</div>';
			}).join('');
			box.querySelectorAll('[data-advance]').forEach(btn=>btn.addEventListener('click',async()=>{
				const m=document.querySelector('#fund-message');m.textContent='Moving…';
				try{await api('/api/operating-center/fund/prospect/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prospect_id:btn.dataset.advance,to_stage:btn.dataset.to})});m.textContent='Moved.';await boot_funds()}catch(err){m.textContent=err.message}
			}));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------
// 6. Instructor Growth Fund (NEW: single-fund fundraising-asset view)
// ---------------------------------------------------------------------------

const IGF_PANELS = `<section class="panel">
				<h2>Instructor Growth Fund</h2>
				<p class="meta">This tab is the fundraising-asset view of the Instructor Growth Fund: goal, raised, prospects, stages, and follow-ups. The operational outcome — funded places &rarr; students &rarr; completions &rarr; certifications/instructors — lives in Academy &rarr; Performance, never money here.</p>
				<div><span class="message" id="igf-message" aria-live="polite"></span></div>
				<div id="igf-detail">Loading…</div>
			</section>`;

const IGF_SCRIPT = `
	const igf_ORDER=['prospect','verified','drafted','sent','follow_up','committed','stewardship','recognition'];
	const igf_LABEL={prospect:'Prospect',verified:'Verified',drafted:'Drafted',sent:'Sent',follow_up:'Follow-up',committed:'Committed',stewardship:'Stewardship',recognition:'Public recognition'};
	function igf_money(n){return '$'+Number(n||0).toLocaleString('en-US')}
	function igf_fundHtml(f){
		const counts=igf_ORDER.map(s=>esc(igf_LABEL[s])+': '+f.stage_counts[s]).join(' · ');
		const pct=f.fund.goal_amount?Math.round(100*f.fund.raised_amount/f.fund.goal_amount):0;
		const dueNow=Number(f.follow_ups_due_now||0);
		const dueLine='<div class="meta'+(dueNow?' followup-due':'')+'">Follow-ups due now: '+dueNow+'. The owner presses Send; the machine never sends.</div>';
		const rows=f.prospects.map(p=>{
			const next=igf_ORDER[igf_ORDER.indexOf(p.stage)+1];
			const btn=next?'<button data-igf-advance="'+esc(p.id)+'" data-to="'+esc(next)+'" style="width:auto">Move to '+esc(igf_LABEL[next])+'</button>':'<span class="meta">Terminal stage</span>';
			const fu=p.follow_up_status;
			const fuDate=p.follow_up_due_at?esc(String(p.follow_up_due_at).slice(0,10)):'';
			const fuLine=fu==='none'?'':'<div class="meta '+(fu==='overdue'?'followup-overdue':fu==='due'?'followup-due':'')+'">Follow-up '+(fu==='upcoming'?'due '+fuDate:fu==='due'?'due now ('+fuDate+')':'overdue (was due '+fuDate+')')+'.</div>';
			return '<div class="item"><strong>'+esc(p.name)+'</strong>'+
				'<div class="meta">'+esc(igf_LABEL[p.stage]||p.stage)+' · ask '+esc(p.ask_tier||'')+' · '+(p.sent_at?'sent '+esc(p.sent_at.slice(0,10)):'not sent')+'</div>'+
				fuLine+
				'<div class="meta">Next: '+esc(p.next_action)+'</div>'+
				'<div>'+btn+'</div></div>';
		}).join('');
		return '<div class="item"><strong>'+esc(f.fund.name)+'</strong>'+
			'<div class="meta">Goal '+igf_money(f.fund.goal_amount)+' · Raised '+igf_money(f.fund.raised_amount)+' ('+pct+'%) · '+esc(f.fund.status)+'</div>'+
			dueLine+
			'<div class="meta">'+esc(counts)+'</div>'+rows+'</div>';
	}
	async function boot_igf(){
		const box=document.querySelector('#igf-detail');
		const m=document.querySelector('#igf-message');
		try{
			const data=await api('/api/operating-center/fund');
			const f=(data.funds||[]).find(x=>x.fund&&x.fund.name==='Instructor Growth Fund');
			if(!f){box.innerHTML='<div class="unavailable">The Instructor Growth Fund is not seeded yet — open the Funds tab to create it.</div>';return}
			box.innerHTML=igf_fundHtml(f);
			box.querySelectorAll('[data-igf-advance]').forEach(btn=>btn.addEventListener('click',async()=>{
				m.textContent='Moving…';
				try{await api('/api/operating-center/fund/prospect/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prospect_id:btn.dataset.igfAdvance,to_stage:btn.dataset.to})});m.textContent='Moved.';await boot_igf()}catch(err){m.textContent=err.message}
			}));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------

export function renderGrowthSectionHtml(): string {
	return ocSectionShell({
		section: "growth",
		title: "Growth",
		subtitle: "Revenue engines — sponsorship, fundraising, sellers, partners, funds.",
		tabs: [
			{ id: "sponsorship", label: "Sponsorship", panelsHtml: SPONSORSHIP_PANELS, script: SPONSORSHIP_SCRIPT },
			{ id: "fundraising", label: "Fundraising", panelsHtml: FUNDRAISING_PANELS, script: FUNDRAISING_SCRIPT, reportId: "fundraising" },
			{ id: "sellers", label: "Sellers", panelsHtml: SELLERS_PANELS, script: SELLERS_SCRIPT, reportId: "sellers" },
			{ id: "partners", label: "Partners", panelsHtml: PARTNERS_PANELS, script: PARTNERS_SCRIPT, reportId: "partners" },
			{ id: "funds", label: "Funds", panelsHtml: FUNDS_PANELS, script: FUNDS_SCRIPT },
			{ id: "igf", label: "Instructor Growth Fund", panelsHtml: IGF_PANELS, script: IGF_SCRIPT },
		],
	});
}
