// Operating Center — Marketing section.
//
// Five functions: Ads, Analytics, Social, Media, Sites. Every function has:
//   - a 1-2 line human description,
//   - three navigation buttons [ Summary ] [ Actions ] [ Details ],
//   - three SEPARATE views (one visible at a time), deep-linkable as
//     /operating-center/marketing?tab=<function>&view=<summary|actions|details>.
//
// Content rules: Summary = management summary only (live numbers, what the
// Machine did, what needs attention). Actions = real manual owner actions
// that exist in the API today (verified; nothing invented). Details = deep
// working data. GA4 traffic lives in Analytics only; Ads keeps the Ad Grants
// compliance snapshot computed from live Ads data.

import { ocSectionShell } from "./oc-shell";

/** One function block: description + 3 view buttons + 3 separate views. */
function mktFunction(
	id: string,
	description: string,
	summaryHtml: string,
	actionsHtml: string,
	detailsHtml: string,
): string {
	return (
		`<p class="oc-func-desc">${description}</p>` +
		`<nav class="oc-views" aria-label="Views" data-views="${id}">` +
		`<button type="button" class="oc-view-btn oc-view-active" data-view="summary">Summary</button>` +
		`<button type="button" class="oc-view-btn" data-view="actions">Actions</button>` +
		`<button type="button" class="oc-view-btn" data-view="details">Details</button>` +
		`</nav>` +
		`<div class="oc-view" data-viewpanel="summary" data-func="${id}">${summaryHtml}</div>` +
		`<div class="oc-view" data-viewpanel="actions" data-func="${id}" hidden>${actionsHtml}</div>` +
		`<div class="oc-view" data-viewpanel="details" data-func="${id}" hidden>${detailsHtml}</div>`
	);
}

// ---------------------------------------------------------------------------
// 1. Ads
// ---------------------------------------------------------------------------

const ADS_SUMMARY_HTML = `<section class="panel"><h2>Ads summary</h2><div id="ads-sum">Loading…</div></section>`;

const ADS_ACTIONS_HTML = `<section class="panel"><h2>Ads actions</h2>
	<p class="meta"><strong>Machine (automatic):</strong> reads the Google Ads account, computes the Ad Grants compliance snapshot, and prepares campaign proposals from verified intents. <strong>Owner (manual):</strong> the actions below. Creating or changing campaigns is disabled — the owner reviews every proposal before anything is created.</p>
	<div id="ads-act">Loading…</div></section>`;

const ADS_DETAILS_HTML = `<section class="panel"><h2>Live campaigns</h2><div id="ads-det-campaigns">Loading…</div></section>
	<section class="panel"><h2>Ad Grants compliance</h2><div id="ads-det-compliance">Loading…</div></section>
	<section class="panel"><h2>Machine proposals</h2><div id="ads-det-proposals">Loading…</div></section>
	<section class="panel"><h2>Orchestration decisions</h2><div id="ads-det-orch">Loading…</div></section>
	<section class="panel"><h2>Data sources</h2><div id="ads-det-sources">Loading…</div></section>`;

const ADS_SCRIPT = `
	async function ads_fetchOverview(){
		return await api('/api/operating-center/ads/overview');
	}
	// Parameterized live Google Ads metrics (campaigns, ad groups, geo,
	// conversion actions) from the canonical metrics layer. Never throws:
	// the summary renders the overview even when this read fails.
	async function ads_fetchMetricsLast30(){
		try{
			const d=await api('/api/operating-center/ads/metrics?preset=last30');
			return {ok:true,data:d};
		}catch(err){return {ok:false,error:err.message||String(err),data:null}}
	}
	function ads_connBadge(connected){
		return connected ? '<span class="badge-ok">Connected</span>' : '<span class="badge-warn">Not connected</span>';
	}
	async function boot_ads_summary(){
		const box=document.querySelector('#ads-sum');
		try{
			const results=await Promise.all([ads_fetchOverview(),ads_fetchMetricsLast30()]);
			const data=results[0];
			const m30=results[1];
			const ads=data.google_ads;
			const live=data.live_account;
			const gc=data.grants_compliance;
			const proposals=data.machine_proposals||[];
			const proposed=proposals.filter(p=>p.state==='PROPOSED').length;
			const attn=[];
			let html='<div class="item"><strong>Google Ads '+ads_connBadge(ads.connected)+'</strong><div class="detail">'+esc(ads.note)+'</div></div>';
			if(live&&live.available&&!live.error){
				const cs=live.campaigns||[];
				const tot=cs.reduce((a,c)=>({impr:a.impr+Number(c.impressions||0),clicks:a.clicks+Number(c.clicks||0),conv:a.conv+Number(c.conversions||0),cost:a.cost+Number(c.cost_usd||0)}),{impr:0,clicks:0,conv:0,cost:0});
				html+='<div class="item"><strong>Live account</strong><div class="detail">'+cs.length+' campaign(s) · '+esc(live.date_range)+'</div>'
					+'<div class="detail">Spend $'+tot.cost.toFixed(2)+' · '+tot.impr.toLocaleString('en-US')+' impressions · '+tot.clicks.toLocaleString('en-US')+' clicks · '+tot.conv+' conversions</div></div>';
			}else if(live&&live.error){
				html+='<div class="item"><strong>Live account <span class="badge-warn">Read error</span></strong><div class="detail">'+esc(live.error)+'</div></div>';
			}
			if(gc&&gc.available){
				const gb=gc.status==='ok'?'<span class="badge-ok">OK</span>':gc.status==='watch'?'<span class="badge-warn">WATCH</span>':'<span class="badge-warn">AT RISK</span>';
				const below=(gc.campaigns||[]).filter(c=>c.below_threshold).length;
				html+='<div class="item"><strong>Ad Grants compliance '+gb+'</strong><div class="detail">Account CTR '+(gc.account_ctr!=null?(gc.account_ctr*100).toFixed(2)+'%':'n/a')+' · '+below+' campaign(s) below the 5% threshold · '+esc(gc.date_range)+'</div></div>';
			}
			// Parameterized live metrics (last 30 days) from the canonical
			// metrics layer. OWNER_ACTION_REQUIRED renders the exact owner
			// action text instead of a generic error.
			if(m30.ok&&m30.data&&m30.data.ok){
				const t=m30.data.account_totals||{};
				const ctr=(t.ctr!=null?(Number(t.ctr)*100).toFixed(2)+'%':'n/a');
				html+='<div class="item"><strong>Last 30 days <span class="badge-ok">live</span></strong>'
					+'<div class="detail">'+Number(t.impressions||0).toLocaleString('en-US')+' impressions · '+Number(t.clicks||0).toLocaleString('en-US')+' clicks · CTR '+ctr+' · Spend $'+Number(t.cost_usd||0).toFixed(2)+' · '+Number(t.conversions||0)+' conversions</div>'
					+'<div class="detail">Period '+esc(m30.data.period.start)+' to '+esc(m30.data.period.end)+' · '+esc(m30.data.data_quality)+'</div>'
					+'<div class="detail">The full breakdown (campaigns, ad groups, geo, conversion actions) is included in the Details view below.</div></div>';
			}else{
				const dq=m30.data&&m30.data.data_quality;
				const note=(m30.data&&(m30.data.error||m30.data.quality_note))||m30.error||'Could not read parameterized metrics.';
				const needsOwner=dq==='OWNER_ACTION_REQUIRED';
				html+='<div class="item"><strong>Last 30 days metrics '+(needsOwner?'<span class="badge-warn">owner action required</span>':'<span class="badge-warn">unavailable</span>')+'</strong>'
					+'<div class="detail">'+esc(note)+'</div>'
					+'<div class="detail">Full breakdown endpoint: <code>GET /api/operating-center/ads/metrics?preset=last30</code></div></div>';
				if(needsOwner)attn.push('Google Ads metrics need an owner action: '+note);
			}
			html+='<div class="item"><strong>Machine proposals</strong><div class="detail">'+proposed+' proposed · '+proposals.length+' total in the current set</div></div>';
			if(!ads.connected)attn.push('Google Ads is not connected — connect it in Actions to let the Machine read the account.');
			if(ads.error)attn.push('Ads connection error: '+ads.error);
			if(gc&&gc.available&&gc.status!=='ok')attn.push('Ad Grants compliance is '+gc.status.toUpperCase()+' — review the per-campaign CTR in Details.');
			if(gc&&gc.available){const b=(gc.campaigns||[]).filter(c=>c.below_threshold);if(b.length)attn.push(b.length+' campaign(s) below the 5% CTR threshold: '+b.map(c=>c.name).join(', '));}
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Read the account read-only, computed the compliance snapshot, and prepared '+proposals.length+' campaign proposal(s) from verified intents. Campaign creation stays disabled.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_ads_actions(){
		const box=document.querySelector('#ads-act');
		try{
			const data=await ads_fetchOverview();
			const ads=data.google_ads;
			let html='';
			if(!ads.connected){
				html+='<div class="item"><strong>Connect Google Ads</strong><div class="detail">Owner consent required. After connecting, the Machine reads the account automatically.</div><div class="row"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/integrations/google-ads/connect" target="_blank" rel="noopener">Connect Google Ads</a></div></div>';
			}else{
				html+='<div class="item"><strong>Open the Google Ads account</strong><div class="detail">External — the live account in a new tab. The Machine never changes campaigns.</div><div class="row"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="https://ads.google.com/" target="_blank" rel="noopener">Open Google Ads</a></div></div>';
			}
			html+='<div class="item"><strong>Review proposals</strong><div class="detail">Proposals are prepared by the Machine automatically from verified campaign intents — there is no manual “prepare proposal” action. Review the current set in Details.</div><div class="row"><button type="button" class="secondary" data-goto-details>Open Details</button></div></div>';
			box.innerHTML=html;
			const gd=box.querySelector('[data-goto-details]');
			if(gd)gd.addEventListener('click',()=>__mktSetView('ads','details',true));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_ads_details(){
		try{
			const data=await ads_fetchOverview();
			const live=data.live_account;
			const gc=data.grants_compliance;
			const cb=document.querySelector('#ads-det-campaigns');
			if(live&&live.available&&!live.error){
				const cs=live.campaigns||[];
				cb.innerHTML=cs.length?'<table class="data"><thead><tr><th>Campaign</th><th>Status</th><th>Budget/day</th><th>Impr.</th><th>Clicks</th><th>Conv.</th><th>Spend</th></tr></thead><tbody>'+
					cs.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc(human(c.status))+'</td><td>$'+Number(c.daily_budget_usd).toFixed(2)+'</td><td>'+Number(c.impressions||0).toLocaleString('en-US')+'</td><td>'+Number(c.clicks||0).toLocaleString('en-US')+'</td><td>'+esc(c.conversions)+'</td><td>$'+Number(c.cost_usd).toFixed(2)+'</td></tr>').join('')+'</tbody></table><div class="meta">'+esc(live.date_range)+' · Google Ads account · read-only</div>'
					:'<div class="unavailable">No campaigns found in the connected Google Ads account.</div>';
			}else if(live&&live.error){
				cb.innerHTML='<div class="unavailable">Could not read account data: '+esc(live.error)+'</div>';
			}else{
				cb.innerHTML='<div class="unavailable">Live account data is available only when Google Ads is connected.</div>';
			}
			const gb=document.querySelector('#ads-det-compliance');
			if(gc&&gc.available){
				const badge=gc.status==='ok'?'<span class="badge-ok">OK</span>':gc.status==='watch'?'<span class="badge-warn">WATCH</span>':'<span class="badge-warn">AT RISK</span>';
				gb.innerHTML='<div class="item"><strong>Account CTR '+(gc.account_ctr!=null?(gc.account_ctr*100).toFixed(2)+'%':'n/a')+' '+badge+'</strong><div class="detail">'+esc(gc.note)+'</div>'+
					(gc.campaigns||[]).map(c=>'<div class="meta">'+esc(c.name)+': '+(c.ctr!=null?(c.ctr*100).toFixed(2)+'%':'n/a')+' CTR '+(c.below_threshold?'<span class="badge-warn">below 5%</span>':'<span class="badge-ok">ok</span>')+'</div>').join('')+
					'<div class="meta">Snapshot over '+esc(gc.date_range)+'. Grants requires ≥5% account CTR; two consecutive months below risks deactivation. Snapshot only, not month-over-month history.</div></div>';
			}else{
				gb.innerHTML='<div class="unavailable">Compliance snapshot unavailable.</div>';
			}
			const pb=document.querySelector('#ads-det-proposals');
			const proposals=data.machine_proposals||[];
			pb.innerHTML=proposals.length?proposals.map(function(p){
				const st=p.state==='PROPOSED'?'<span class="badge-ok">'+esc(p.state)+'</span>':'<span class="badge-warn">'+esc(p.state)+'</span>';
				let h='<div class="item"><strong>'+esc(p.name||'(unnamed proposal)')+' '+st+'</strong>'
					+'<div class="meta">Proposal ID: '+esc(p.proposal_id)+'</div>'
					+'<div class="meta">Budget: $'+(p.daily_budget!=null?Number(p.daily_budget).toFixed(2):'?')+'/day · Target: '+esc(p.target_url||'none')+'</div>'
					+'<div class="meta">Origin: '+(p.origin?esc(p.origin):'unknown')+' · Source: '+esc(p.source_kind)+' / '+esc(p.source_identity)+'</div>';
				if(p.source_object){
					h+='<div class="meta">Source object: '+esc(p.source_object.object_id)+(p.source_object.object_type?' ('+esc(p.source_object.object_type)+')':'')+(p.source_object.title?' - '+esc(p.source_object.title):'')+'</div>';
				}else{h+='<div class="meta">Source object: not yet linked</div>';}
				h+='<div class="meta">Purpose: '+esc(p.purpose)+'</div>'
					+'<div class="meta">Distribution rule: '+(p.distribution.rule_id?esc(p.distribution.rule_id):'none')+'</div>'
					+'<div class="meta">Channel: '+(p.distribution.channel?esc(p.distribution.channel):'none')+'</div>'
					+'<div class="meta">Creation eligibility: '+(p.creation_eligible?'eligible':'not eligible')+'</div>';
				if(p.conflict)h+='<div class="meta">Live conflict: '+esc(p.conflict.live_campaign_name)+'</div>';
				if((p.missing_fields||[]).length)h+='<div class="meta">Missing fields: '+p.missing_fields.map(esc).join(', ')+'</div>';
				for(const g of (p.ad_groups||[])){
					const kws=(g.keywords||[]).map(function(k){return esc(k.text)+' ('+esc(k.match_type)+')'}).join(', ');
					h+='<div class="detail"><b>'+esc(g.name)+':</b> max CPC $'+Number(g.default_cpc).toFixed(2)+', '+g.ads_count+' ads<br>Keywords: '+kws+'</div>';
				}
				h+=((p.policy_violations||[]).length===0)?'<div class="detail">Ad Grants policy: PASS</div>':'<div class="detail">Ad Grants policy violations: '+p.policy_violations.map(esc).join('; ')+'</div>';
				h+='<div class="detail">Next action: '+esc(p.next_action)+'</div></div>';
				return h;
			}).join(''):'<div class="unavailable">No proposals prepared.</div>';
			const ob=document.querySelector('#ads-det-orch');
			const orch=data.orchestration||[];
			ob.innerHTML='<p class="meta">What the Machine decided for every known source: required result, candidate action, channel. Read-only.</p>'+
				(orch.length?orch.map(function(d){
					const dBadge=d.state==='DECIDED'?'<span class="badge-ok">'+esc(d.state)+'</span>':'<span class="badge-warn">'+esc(d.state)+'</span>';
					let h='<div class="item"><strong>'+esc(d.source_identity)+' '+dBadge+'</strong>'
						+'<div class="meta">Decision ID: '+esc(d.decision_id)+' · Source: '+esc(d.source_kind)+(d.purpose?' · Purpose: '+esc(d.purpose):'')+'</div>';
					if(d.required_result)h+='<div class="detail">Required result: '+esc(d.required_result)+'</div>';
					if(d.candidate_action)h+='<div class="detail">Candidate action: '+esc(d.candidate_action)+'</div>';
					h+='<div class="meta">Channel: '+(d.channel?esc(d.channel):'none')+(d.priority!=null?' · Priority: '+esc(String(d.priority)):'')+'</div>';
					if(d.execution_mode)h+='<div class="meta">Execution mode: '+esc(d.execution_mode)+'</div>';
					h+='<div class="detail">'+esc(d.factual_reason)+'</div></div>';
					return h;
				}).join(''):'<div class="unavailable">No orchestration decisions.</div>');
			document.querySelector('#ads-det-sources').innerHTML='<div class="detail">'+(data.capabilities||[]).map(w=>'&bull; '+esc(w)).join('<br>')+'</div>';
		}catch(err){
			const m=document.querySelector('#tabpanel-ads .oc-tab-error');
			if(m)m.textContent='Error: '+(err.message||err);
		}
	}
`;

const ADS_PANELS = mktFunction(
	"ads",
	"Google Ads — live campaign performance, Ad Grants compliance, and the Machine's campaign proposals. The Machine reads the account and prepares proposals automatically; creating or changing campaigns is disabled.",
	ADS_SUMMARY_HTML,
	ADS_ACTIONS_HTML,
	ADS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 2. Analytics
// ---------------------------------------------------------------------------

const ANALYTICS_SUMMARY_HTML = `<section class="panel"><h2>Analytics summary</h2><div id="analytics-sum">Loading…</div></section>`;

const ANALYTICS_ACTIONS_HTML = `<section class="panel"><h2>Analytics actions</h2>
	<p class="meta"><strong>Machine (automatic):</strong> reads GA4 traffic on demand — nothing here changes Analytics settings. <strong>Owner (manual):</strong> the actions below.</p>
	<div id="analytics-act">Loading…</div></section>`;

const ANALYTICS_DETAILS_HTML = `<section class="panel"><h2>Traffic by host</h2><div id="analytics-det-hosts">Loading…</div></section>
	<section class="panel"><h2>Connection</h2><div id="analytics-det-conn">Loading…</div></section>`;

const ANALYTICS_SCRIPT = `
	async function analytics_fetchTraffic(){
		try{ return await api('/api/operating-center/analytics/traffic'); }
		catch(err){ return { ok:false, error: err.message||String(err) }; }
	}
	// Canonical GA4 audience report: last 7 days vs prior 7 days, with
	// percent changes (sessions, views, users). Never throws: the traffic
	// card above renders even when this read fails.
	async function analytics_fetchAudience(){
		try{
			const d=await api('/api/operating-center/analytics/audience?preset=last7&compare=1');
			return {ok:true,data:d};
		}catch(err){return {ok:false,error:err.message||String(err),data:null}}
	}
	function ga4_fmtPct(p){
		if(p===null||p===undefined)return 'n/a';
		return (p>=0?'+':'')+Number(p).toFixed(2)+'%';
	}
	function ga4_audienceHtml(a){
		const rows=[['sessions','Sessions'],['screenPageViews','Views'],['totalUsers','Users']];
		let html='<div class="item"><strong>GA4 audience — last 7 days vs prior 7 days <span class="badge-ok">live</span></strong>';
		for(const e of rows){
			const t=a.totals[e[0]];
			if(!t||!t.current){html+='<div class="detail">'+e[1]+': not returned</div>';continue}
			const cur=Number(t.current.value)||0;
			const prior=t.prior!=null?Number(t.prior.value):null;
			html+='<div class="detail">'+e[1]+': <strong>'+cur.toLocaleString('en-US')+'</strong>'+(prior!==null?' (prior '+prior.toLocaleString('en-US')+')':'')+' · change '+ga4_fmtPct(t.percent_change)+'</div>';
		}
		html+='<div class="detail">Period '+esc(a.period_start)+' to '+esc(a.period_end)+' vs '+esc(a.compare_period_start)+' to '+esc(a.compare_period_end)+' · fetched '+esc(a.fetched_at)+' · '+esc(a.data_quality)+'</div>';
		html+='<div class="detail">Full audience report: see the Details view below.</div>';
		html+='</div>';
		return html;
	}
	async function analytics_fetchGa(){
		try{ const d=await api('/api/operating-center/ads/overview'); return d.google_analytics||{}; }
		catch(err){ return { connected:false, error: err.message||String(err) }; }
	}
	async function boot_analytics_summary(){
		const box=document.querySelector('#analytics-sum');
		const t=await analytics_fetchTraffic();
		const ga=await analytics_fetchGa();
		const badge=ga.connected?'<span class="badge-ok">Connected</span>':'<span class="badge-warn">Not connected</span>';
		let html='<div class="item"><strong>Google Analytics '+badge+'</strong>';
		if(t.ok){
			html+='<div class="detail">'+Number(t.totals.sessions||0).toLocaleString('en-US')+' sessions · '+Number(t.totals.total_users||0).toLocaleString('en-US')+' users · '+esc(t.date_range)+'</div>';
			const hosts=(t.hosts||[]).slice(0,5);
			if(hosts.length)html+='<div class="detail">'+hosts.map(h=>'&bull; '+esc(h.hostname||'(unknown)')+': '+Number(h.sessions||0).toLocaleString('en-US')+' sessions').join('<br>')+'</div>';
			else html+='<div class="detail">No traffic recorded in this period.</div>';
		}else{
			html+='<div class="detail">'+esc(t.error||'No traffic data returned.')+'</div>';
		}
		html+='</div>';
		const aud=await analytics_fetchAudience();
		if(aud.ok&&aud.data&&aud.data.ok&&aud.data.totals){
			html+=ga4_audienceHtml(aud.data);
		}else{
			const note=(aud.data&&(aud.data.error||aud.data.quality_note))||aud.error||'Could not read GA4 audience metrics.';
			html+='<div class="item"><strong>GA4 audience — last 7 days vs prior 7 days <span class="badge-warn">unavailable</span></strong><div class="detail">'+esc(note)+'</div></div>';
		}
		const attn=[];
		if(!ga.connected)attn.push('Google Analytics is not connected — connect it in Actions so the Machine can read traffic.');
		html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
		html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Pulled these numbers live from GA4 when you opened this view. Read-only; the Machine never changes Analytics settings.</div></div>';
		box.innerHTML=html;
	}
	async function boot_analytics_actions(){
		const box=document.querySelector('#analytics-act');
		const ga=await analytics_fetchGa();
		let html='';
		if(!ga.connected){
			html+='<div class="item"><strong>Connect Google Analytics</strong><div class="detail">Owner consent required. '+(ga.error?esc(ga.error):'No GA4 property is linked yet.')+'</div><div class="row"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/integrations/google-analytics/connect" target="_blank" rel="noopener">Connect Google Analytics</a></div></div>';
		}else{
			html+='<div class="item"><strong>No manual actions here</strong><div class="detail">Traffic is read automatically by the Machine; there is nothing for the owner to run or configure in this view.</div><div class="row"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="https://analytics.google.com/" target="_blank" rel="noopener">Open Google Analytics</a></div></div>';
		}
		box.innerHTML=html;
	}
	async function boot_analytics_details(){
		const t=await analytics_fetchTraffic();
		const ga=await analytics_fetchGa();
		const hb=document.querySelector('#analytics-det-hosts');
		if(t.ok){
			const rows=(t.hosts||[]).map(h=>'<tr><td>'+esc(h.hostname||'(unknown host)')+'</td><td>'+Number(h.sessions||0).toLocaleString('en-US')+'</td><td>'+Number(h.total_users||0).toLocaleString('en-US')+'</td></tr>').join('');
			hb.innerHTML='<div class="detail">GA4 property '+esc(t.property_id)+' · '+esc(t.date_range)+'</div>'+
				(rows?'<table class="data"><thead><tr><th>Host</th><th>Sessions</th><th>Users</th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="unavailable">No traffic recorded in this period.</div>');
		}else{
			hb.innerHTML='<div class="unavailable">'+esc(t.error||'No traffic data returned.')+'</div>';
		}
		const cb=document.querySelector('#analytics-det-conn');
		const badge=ga.connected?'<span class="badge-ok">Connected</span>':'<span class="badge-warn">Not connected</span>';
		cb.innerHTML='<div class="item"><strong>Google Analytics '+badge+'</strong><div class="detail">'+esc(ga.note||ga.error||'No connection information available.')+'</div>'+(ga.property_id?'<div class="meta">Property ID: '+esc(ga.property_id)+'</div>':'')+'</div>';
	}
`;

const ANALYTICS_PANELS = mktFunction(
	"analytics",
	"Website traffic from Google Analytics 4 — sessions and users across NWANA sites. Read-only: the Machine reads it, nothing here changes Analytics.",
	ANALYTICS_SUMMARY_HTML,
	ANALYTICS_ACTIONS_HTML,
	ANALYTICS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 3. Social
// ---------------------------------------------------------------------------

const SOCIAL_SUMMARY_HTML = `<section class="panel"><h2>Social summary</h2><div id="social-sum">Loading…</div></section>`;

const SOCIAL_ACTIONS_HTML = `<section class="panel" id="yt-panel"><h2>YouTube</h2>
	<p class="meta"><strong>Machine (automatic):</strong> nothing here runs automatically — uploading and publishing are owner-manual by design. Uploads are created as <strong>unlisted drafts</strong>; a video goes <strong>public only</strong> through the separate Publish step with your explicit confirmation.</p>
	<div id="yt-status">Loading…</div>
	<h3>Upload (unlisted draft)</h3>
	<label for="yt-source">Source video URL</label>
	<input id="yt-source" placeholder="https://…" autocomplete="off">
	<label for="yt-title">Title (max 100 characters)</label>
	<input id="yt-title" maxlength="100" autocomplete="off">
	<label for="yt-description">Description</label>
	<textarea id="yt-description" rows="3"></textarea>
	<label for="yt-tags">Tags (comma separated)</label>
	<input id="yt-tags" placeholder="NordicWalking, NWANA" autocomplete="off">
	<button type="button" id="yt-upload">Upload as unlisted</button>
	<div class="message" id="yt-upload-message" aria-live="polite"></div>
	<div id="yt-upload-result"></div>
	<h3>Publish to public</h3>
	<p class="meta">Explicit owner confirmation required. This is the only action that makes a video public.</p>
	<label for="yt-video-id">Video ID</label>
	<input id="yt-video-id" placeholder="e.g. dQw4w9WgXcQ" autocomplete="off">
	<button type="button" id="yt-publish">Publish to public</button>
	<div class="message" id="yt-publish-message" aria-live="polite"></div>
	</section>
	<section class="panel" id="pack-panel"><h2>Distribution packs (manual last mile)</h2>
	<p class="meta"><strong>Machine (automatic):</strong> prepares copy-ready text per channel. <strong>Owner (manual):</strong> you post on each channel yourself. Data the packet does not carry shows as [NEEDS: …] — never invented.</p>
	<label for="pack-id">Creation packet id</label>
	<input id="pack-id" placeholder="e.g. pkt_… (for NWANA news: paste the canonical news URL)" autocomplete="off">
	<label for="pack-type">Object type</label>
	<select id="pack-type">
		<option value="">Auto (from packet kind)</option>
		<option value="series_results">Series results</option>
		<option value="competition_event">Competition event</option>
		<option value="championship">Championship</option>
		<option value="challenge">Challenge</option>
		<option value="news_item">NWANA news</option>
	</select>
	<label for="pack-channel">Channel</label>
	<select id="pack-channel">
		<option value="all">All channels</option>
		<option value="threads">Threads</option>
		<option value="linkedin">LinkedIn</option>
		<option value="youtube">YouTube</option>
		<option value="eventbrite">Eventbrite</option>
		<option value="generic">Generic</option>
	</select>
	<button type="button" id="pack-build">Build packs</button>
	<div class="message" id="pack-message" aria-live="polite"></div>
	<div id="pack-list"></div></section>`;

const SOCIAL_DETAILS_HTML = `<section class="panel"><h2>Accounts</h2><div id="social-det">Loading…</div></section>`;

const SOCIAL_SCRIPT = `
	async function social_fetchOverview(){
		return await api('/api/operating-center/social/overview');
	}
	// Live Meta read: per-destination metrics from the production Meta
	// integration (followers, posts, reach, impressions, ...). Never throws:
	// callers fall back to the static last-known list when this fails.
	async function social_fetchLiveOverview(){
		try{
			const d=await api('/api/operating-center/social/overview?live=1');
			if(d&&d.ok&&(d.destinations||[]).length)return {ok:true,data:d};
			return {ok:false,error:(d&&d.error)||'The live Meta read returned no destinations.'};
		}catch(err){return {ok:false,error:err.message||String(err)}}
	}
	function social_findMetric(metrics,name){
		for(const m of (metrics||[])){if(m.metric_name===name)return m}
		return null;
	}
	function social_fmtNum(v){
		const n=Number(v);
		return isFinite(n)?n.toLocaleString('en-US'):esc(String(v));
	}
	function social_qualityBadge(q){
		if(q==='LIVE_VERIFIED')return '<span class="badge-ok">live</span>';
		return '<span class="badge-warn">'+esc(String(q||'unknown'))+'</span>';
	}
	function social_lastRefresh(d,dest){
		const f=social_findMetric(dest.metrics,'followers');
		if(f&&f.fetched_at)return f.fetched_at;
		if(dest.metrics&&dest.metrics.length&&dest.metrics[0].fetched_at)return dest.metrics[0].fetched_at;
		return d.generated_at||'';
	}
	// Live summary card per destination: live follower counts, posts, reach,
	// impressions, plus last refresh and data quality. Never hardcodes a
	// number — every value comes from the live read above.
	function social_liveSummaryHtml(d){
		let html='';
		for(const dest of (d.destinations||[])){
			const f=social_findMetric(dest.metrics,'followers');
			const posts=social_findMetric(dest.metrics,'posts');
			const reach=social_findMetric(dest.metrics,'reach');
			const impr=social_findMetric(dest.metrics,'impressions');
			html+='<div class="item"><strong>'+esc(dest.platform)+' — '+esc(dest.name)+' '+social_qualityBadge(dest.data_quality)+'</strong>';
			const parts=[];
			if(f)parts.push('Followers: <strong>'+social_fmtNum(f.value)+'</strong>');
			if(posts)parts.push('Posts: '+social_fmtNum(posts.value));
			if(reach)parts.push('Reach: '+social_fmtNum(reach.value));
			if(impr)parts.push('Impressions: '+social_fmtNum(impr.value));
			if(parts.length)html+='<div class="detail">'+parts.join(' · ')+'</div>';
			else html+='<div class="detail unavailable">No live metrics returned for this destination.</div>';
			if(dest.error)html+='<div class="detail unavailable">'+esc(dest.error)+'</div>';
			html+='<div class="meta">Last refresh: '+esc(social_lastRefresh(d,dest))+' · data quality: '+esc(dest.data_quality)+'</div></div>';
		}
		return html;
	}
	// Static fallback: the recorded account list, explicitly labeled as last
	// known and NOT live. Observed dates are kept verbatim (2026-09-22).
	async function social_staticSummaryHtml(note){
		let html='<div class="item"><strong>Live social metrics <span class="badge-warn">unavailable</span></strong>';
		if(note)html+='<div class="detail">'+esc(note)+'</div>';
		html+='<div class="detail">Showing last known values below — these are <strong>not</strong> live.</div></div>';
		const data=await social_fetchOverview();
		for(const a of (data.accounts||[])){
			html+='<div class="item"><strong>'+esc(a.platform)+' — '+esc(a.handle)+' <span class="badge-warn">last known</span></strong>';
			if(a.stats&&a.stats.length){
				html+='<div class="detail">Last known (observed 2026-09-22): '+a.stats.map(function(s){return esc(s.label)+': <strong>'+esc(s.value)+'</strong>'}).join(' · ')+'</div>';
			}else{
				html+='<div class="detail unavailable">No verified statistics recorded for this account (last known: none).</div>';
			}
			html+='<div class="detail">'+esc(a.note)+'</div></div>';
		}
		return html;
	}
	async function social_fetchYtStatus(){
		try{ return await api('/integrations/youtube/status'); }
		catch(err){ return { connected:false, error: err.message||String(err) }; }
	}
	function social_statusBadge(s){
		const v=String(s||'').toLowerCase();
		if(v.indexOf('connect')>=0&&v.indexOf('not')<0&&v.indexOf('dis')<0)return '<span class="badge-ok">'+esc(s)+'</span>';
		if(v.indexOf('not')>=0||v.indexOf('dis')>=0||v.indexOf('error')>=0)return '<span class="badge-warn">'+esc(s)+'</span>';
		return '<span class="badge">'+esc(s)+'</span>';
	}
	async function boot_social_summary(){
		const box=document.querySelector('#social-sum');
		// Live Meta read and YouTube status are independent: one failing never
		// blocks the other, and the static last-known list only shows when the
		// live read fails.
		const [live,yt]=await Promise.all([social_fetchLiveOverview(),social_fetchYtStatus()]);
		let html='';
		let liveDests=[];
		let usedLive=false;
		if(live.ok){
			usedLive=true;
			liveDests=live.data.destinations||[];
			html+='<div class="item"><strong>Live social metrics <span class="badge-ok">live</span></strong><div class="detail">Period '+esc(live.data.period.start)+' to '+esc(live.data.period.end)+' · fetched '+esc(live.data.generated_at)+'</div></div>';
			html+=social_liveSummaryHtml(live.data);
		}else{
			try{ html+=await social_staticSummaryHtml(live.error); }
			catch(err){ html='<div class="unavailable">'+esc(err.message||String(err))+'</div>'; }
		}
		html+='<div class="item"><strong>YouTube '+(yt.connected?'<span class="badge-ok">connected</span>':'<span class="badge-warn">not connected</span>')+'</strong>';
		if(yt.connected)html+='<div class="detail">Channel: '+esc(yt.channel_title||yt.channel_id||'')+'</div>';
		else html+='<div class="detail">'+esc(yt.error||'No OAuth credential stored yet.')+'</div>';
		html+='</div>';
		const attn=[];
		if(usedLive){
			for(const d of liveDests){
				if(d.data_quality!=='LIVE_VERIFIED'&&d.data_quality!=='LIVE_PARTIAL')attn.push(d.platform+' ('+d.name+'): '+d.data_quality+(d.error?' — '+d.error:''));
			}
		}else{
			attn.push('Live social metrics are unavailable — showing last known values. Restore the Meta read to see live numbers.');
		}
		if(!yt.connected)attn.push('YouTube is not connected — connect it in Actions to enable uploads.');
		html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
		html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Read the Meta destinations live on demand. Posting itself is always manual.</div></div>';
		box.innerHTML=html;
	}
	async function social_buildPacks(){
		const idEl=document.querySelector('#pack-id');
		const typeEl=document.querySelector('#pack-type');
		const chEl=document.querySelector('#pack-channel');
		const box=document.querySelector('#pack-list');
		const msg=document.querySelector('#pack-message');
		if(!idEl||!box)return;
		const id=idEl.value.trim();
		const typeVal=typeEl&&typeEl.value?typeEl.value:'';
		const isNews=typeVal==='news_item';
		if(!id&&!isNews){box.innerHTML='<div class="unavailable">Enter a creation packet id.</div>';return;}
		if(msg)msg.textContent='Building packs…';
		box.innerHTML='';
		try{
			const params=new URLSearchParams({channel:chEl?chEl.value:'all'});
			if(typeVal)params.set('type',typeVal);
			if(isNews){params.set('canonical_url',id);}
			else{params.set('id',id);}
			const data=await api('/api/operating-center/distribution/packs?'+params.toString());
			let html='<div class="detail"><strong>Packet:</strong> '+esc(data.packet.title)+'<span class="badge">'+esc(data.objectTypeLabel)+'</span></div>';
			const order=['threads','linkedin','youtube','eventbrite','generic'];
			for(const ch of order){
				const pk=(data.packs||{})[ch];
				if(!pk)continue;
				html+='<div class="item"><strong>'+esc(ch.toUpperCase())+'</strong>';
				if(pk.title)html+='<div class="detail"><strong>Title:</strong> '+esc(pk.title)+'</div>';
				html+='<div class="detail"><button type="button" class="secondary" data-copy="'+esc(ch)+'">Copy text</button>'
					+(pk.truncated?'<span class="badge-warn">truncated to channel limit</span>':'')
					+'</div>';
				html+='<pre id="pack-text-'+esc(ch)+'" style="white-space:pre-wrap;background:#f5f7f5;border:1px solid #dce4df;border-radius:9px;padding:12px;font:14px/1.5 system-ui,sans-serif">'+esc(pk.text)+'</pre>';
				html+='<div class="meta">Target: '+(pk.targetUrl?'<a href="'+esc(pk.targetUrl)+'" target="_blank" rel="noopener">'+esc(pk.targetUrl)+'</a>':'none')+'</div>';
				html+='<div class="meta">Image: '+esc(pk.imageSpec.kind)+' — '+esc(pk.imageSpec.headline)+' / '+esc(pk.imageSpec.subline)+'</div>';
				if((pk.missingFields||[]).length)html+='<div class="detail unavailable">Missing data (fill in the packet, then rebuild): '+pk.missingFields.map(esc).join(', ')+'</div>';
				html+='</div>';
			}
			box.innerHTML=html;
			box.querySelectorAll('button[data-copy]').forEach(function(btn){
				btn.addEventListener('click',function(){
					const t=document.querySelector('#pack-text-'+btn.getAttribute('data-copy'));
					if(t&&navigator.clipboard){navigator.clipboard.writeText(t.textContent).catch(function(){});}
				});
			});
			if(msg)msg.textContent='Packs ready. Copy the text and post manually on each channel.';
		}catch(err){
			if(msg)msg.textContent='';
			box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
		}
	}
	async function social_youTubeUpload(){
		const srcEl=document.querySelector('#yt-source');
		const titleEl=document.querySelector('#yt-title');
		const descEl=document.querySelector('#yt-description');
		const tagsEl=document.querySelector('#yt-tags');
		const msg=document.querySelector('#yt-upload-message');
		const box=document.querySelector('#yt-upload-result');
		if(!srcEl||!titleEl||!box)return;
		const sourceUrl=srcEl.value.trim();
		const title=titleEl.value.trim();
		if(!sourceUrl||!title){if(msg)msg.textContent='Source URL and title are required.';return;}
		const tags=(tagsEl&&tagsEl.value||'').split(',').map(function(t){return t.trim()}).filter(Boolean);
		if(msg)msg.textContent='Uploading as unlisted draft…';
		box.innerHTML='';
		try{
			const r=await api('/api/operating-center/youtube/upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceUrl:sourceUrl,title:title,description:descEl?descEl.value:'',tags:tags})});
			box.innerHTML='<div class="item"><strong>Uploaded <span class="badge">unlisted</span></strong><div class="detail">Video ID: '+esc(r.video_id)+'</div><div class="detail"><a href="'+esc(r.url)+'" target="_blank" rel="noopener">'+esc(r.url)+'</a></div><div class="meta">Nothing was published to public. Use Publish below for an explicit public release.</div></div>';
			const vidEl=document.querySelector('#yt-video-id');
			if(vidEl)vidEl.value=r.video_id;
			if(msg)msg.textContent='Upload complete.';
		}catch(err){if(msg)msg.textContent='';box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function social_youTubePublish(){
		const vidEl=document.querySelector('#yt-video-id');
		const msg=document.querySelector('#yt-publish-message');
		if(!vidEl)return;
		const videoId=vidEl.value.trim();
		if(!videoId){if(msg)msg.textContent='Enter a video ID.';return;}
		if(!confirm('Publish video '+videoId+' to PUBLIC on the NWANA YouTube channel?'))return;
		if(msg)msg.textContent='Publishing…';
		try{
			const r=await api('/api/operating-center/youtube/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({videoId:videoId,confirmation:'PUBLISH'})});
			if(msg)msg.textContent='Video '+r.video_id+' is now '+r.privacy_status+'.';
		}catch(err){if(msg)msg.textContent=err.message}
	}
	async function boot_social_actions(){
		const stBox=document.querySelector('#yt-status');
		const yt=await social_fetchYtStatus();
		if(stBox){
			if(yt.connected)stBox.innerHTML='<div class="item"><strong>YouTube <span class="badge-ok">connected</span></strong><div class="detail">Channel: '+esc(yt.channel_title||yt.channel_id||'')+'</div></div>';
			else stBox.innerHTML='<div class="item"><strong>YouTube <span class="badge-warn">not connected</span></strong><div class="detail">'+esc(yt.error||'No OAuth credential stored yet.')+'</div><div class="detail"><a href="/integrations/youtube/connect" target="_blank" rel="noopener">Connect the NWANA channel (owner Google consent)</a></div></div>';
		}
		const packBtn=document.querySelector('#pack-build');
		if(packBtn)packBtn.addEventListener('click',social_buildPacks);
		const ytUploadBtn=document.querySelector('#yt-upload');
		if(ytUploadBtn)ytUploadBtn.addEventListener('click',social_youTubeUpload);
		const ytPublishBtn=document.querySelector('#yt-publish');
		if(ytPublishBtn)ytPublishBtn.addEventListener('click',social_youTubePublish);
	}
	async function boot_social_details(){
		const box=document.querySelector('#social-det');
		// Live per-destination metric tables first; the static last-known list
		// only renders when the live read fails.
		const live=await social_fetchLiveOverview();
		if(live.ok){
			let html='<div class="detail">Live Meta destinations · period '+esc(live.data.period.start)+' to '+esc(live.data.period.end)+' · fetched '+esc(live.data.generated_at)+'</div>';
			for(const dest of (live.data.destinations||[])){
				html+='<div class="item"><strong>'+esc(dest.platform)+' — '+esc(dest.name)+' '+social_qualityBadge(dest.data_quality)+'</strong>';
				const ms=dest.metrics||[];
				if(ms.length){
					html+='<table class="data"><thead><tr><th>Metric</th><th>Value</th><th>Period</th><th>Refreshed</th></tr></thead><tbody>'+
						ms.map(function(m){return '<tr><td>'+esc(m.metric_name)+'</td><td>'+social_fmtNum(m.value)+'</td><td>'+esc(m.period_start)+' – '+esc(m.period_end)+'</td><td>'+esc(m.fetched_at)+'</td></tr>'}).join('')+'</tbody></table>';
				}else{
					html+='<div class="detail unavailable">No live metrics returned for this destination.</div>';
				}
				if(dest.error)html+='<div class="detail unavailable">'+esc(dest.error)+'</div>';
				html+='<div class="meta">Status: '+esc(dest.data_quality)+'</div></div>';
			}
			box.innerHTML=html;
			return;
		}
		try{
			const data=await social_fetchOverview();
			let html='<div class="item"><strong>Live social metrics <span class="badge-warn">unavailable</span></strong><div class="detail">'+esc(live.error||'The live Meta read failed.')+'</div><div class="detail">Last known values below — <strong>not</strong> live (observed 2026-09-22).</div></div>';
			for(const a of (data.accounts||[])){
				html+='<div class="item"><strong>'+esc(a.platform)+' — '+esc(a.handle)+' <span class="badge-warn">last known</span> '+social_statusBadge(a.status)+'</strong>';
				if(a.url)html+='<div class="detail"><a href="'+esc(a.url)+'" target="_blank" rel="noopener">'+esc(a.url)+'</a></div>';
				if(a.stats&&a.stats.length){
					html+='<table class="data"><tbody>'+a.stats.map(function(s){return '<tr><th>'+esc(s.label)+'</th><td>'+esc(s.value)+'</td></tr>'}).join('')+'</tbody></table>';
				}else{
					html+='<div class="detail unavailable">No verified statistics recorded for this account.</div>';
				}
				html+='<div class="detail">'+esc(a.note)+'</div></div>';
			}
			box.innerHTML=html||'<div class="unavailable">No accounts.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const SOCIAL_PANELS = mktFunction(
	"social",
	"Social channels — connected accounts, YouTube publishing, and copy-ready distribution packs. The Machine prepares; you post.",
	SOCIAL_SUMMARY_HTML,
	SOCIAL_ACTIONS_HTML,
	SOCIAL_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 3b. News Center — automatic drafts, manual composer, press releases
// ---------------------------------------------------------------------------

const NEWS_STYLE = `<style>
	.news-queue .item{border:1px solid #dce4df;border-radius:9px;padding:12px;margin:8px 0;background:#fff}
	.news-queue .item h4{margin:0 0 6px}
	.news-composer textarea{width:100%;min-height:120px;font:15px/1.5 system-ui,sans-serif;padding:10px;border:1px solid #dce4df;border-radius:9px;box-sizing:border-box}
	.news-composer input[type=text]{width:100%;padding:10px;border:1px solid #dce4df;border-radius:9px;font-size:16px;box-sizing:border-box}
	.dest-checks{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0}
	.dest-checks label{display:flex;gap:6px;align-items:center;font-size:15px;background:#f5f7f5;padding:8px 12px;border-radius:8px;cursor:pointer}
	.dest-checks label.disabled{opacity:.45;cursor:not-allowed}
	.toggle-row{display:flex;gap:10px;align-items:center;margin:6px 0;font-size:15px}
</style>`;

const NEWS_SUMMARY_HTML = `<section class="panel"><h2>News summary</h2><div id="news-sum">Loading…</div></section>`;

const NEWS_ACTIONS_HTML = NEWS_STYLE + `
	<section class="panel">
		<h2>Automatic news</h2>
		<div class="meta">The Machine watches race results and the race calendar, and drafts news automatically. Drafts wait for your review unless you switch on auto-publish below.</div>
		<div class="mrow"><button type="button" id="news-check">Check for news now</button><span class="meta" id="news-check-msg"></span></div>
		<div id="news-auto-settings" style="margin-top:10px"><div class="meta">Loading settings…</div></div>
	</section>
	<section class="panel news-queue">
		<h2>Drafts waiting for review</h2>
		<div id="news-queue"><div class="meta">Loading…</div></div>
	</section>
	<section class="panel news-composer">
		<h2>Write news manually</h2>
		<div class="meta">Write once, send everywhere. Tick the destinations and press Publish.</div>
		<div style="margin:10px 0"><input type="text" id="news-title" placeholder="Headline"></div>
		<div style="margin:10px 0"><textarea id="news-body" placeholder="News text…"></textarea></div>
		<div class="dest-checks" id="news-dests">
			<label><input type="checkbox" value="site" checked> Website</label>
			<label><input type="checkbox" value="facebook" checked> Facebook</label>
			<label><input type="checkbox" value="instagram" checked> Instagram</label>
			<label id="dest-linkedin"><input type="checkbox" value="linkedin" disabled> LinkedIn <span class="meta" id="linkedin-status">(checking…)</span></label>
			<label id="dest-threads"><input type="checkbox" value="threads" disabled> Threads <span class="meta" id="threads-status">(checking…)</span></label>
		</div>
		<div class="mrow" id="social-connect-row" style="margin-bottom:10px">
			<a class="oc-menu-btn" href="/integrations/linkedin/connect" target="_blank" rel="noopener" id="connect-linkedin" hidden>Connect LinkedIn</a>
			<a class="oc-menu-btn" href="/integrations/threads/connect" target="_blank" rel="noopener" id="connect-threads" hidden>Connect Threads</a>
		</div>
		<div class="mrow"><button type="button" id="news-publish">Publish</button><span class="meta" id="news-pub-msg"></span></div>
	</section>
	<section class="panel news-composer">
		<h2>Press releases</h2>
		<div class="meta">A press release is a separate genre: formal tone, dateline, quotes, boilerplate — sent to journalists, not posted to social. Draft it here; the media-list distribution is coming next.</div>
		<div style="margin:10px 0"><input type="text" id="pr-headline" placeholder="Headline"></div>
		<div style="margin:10px 0"><input type="text" id="pr-dateline" placeholder="Dateline (e.g. SAINT PETERSBURG, Fla. — October 2, 2026)"></div>
		<div style="margin:10px 0"><textarea id="pr-body" placeholder="Release body…"></textarea></div>
		<div style="margin:10px 0"><input type="text" id="pr-contact" placeholder="Media contact (name, phone, email)"></div>
		<div class="mrow"><button type="button" id="pr-save">Save draft</button><span class="meta" id="pr-msg"></span></div>
		<div id="pr-list" style="margin-top:10px"><div class="meta">Loading drafts…</div></div>
	</section>`;

const NEWS_DETAILS_HTML = `<section class="panel"><h2>Recently published</h2><div id="news-recent">Loading…</div></section>`;

const NEWS_SCRIPT = `
	async function news_loadSummary(){
		var box=document.querySelector('#news-sum'); if(!box)return;
		try{
			var q=await api('/api/operating-center/news/auto-queue');
			var n=(q.queue||[]).length;
			box.innerHTML='<div class="detail">'+(n? '<strong>'+n+'</strong> draft'+(n===1?'':'s')+' waiting for your review.' : 'No drafts waiting. The Machine will draft news when results come in or races approach.')+'</div>';
		}catch(e){box.innerHTML='<div class="unavailable">'+esc(e.message)+'</div>';}
	}
	async function news_loadQueue(){
		var box=document.querySelector('#news-queue'); if(!box)return;
		try{
			var q=await api('/api/operating-center/news/auto-queue');
			if(!(q.queue||[]).length){box.innerHTML='<div class="meta">No drafts. Press \\u201cCheck for news now\\u201d to scan.</div>';return;}
			box.innerHTML=q.queue.map(function(d){
				return '<div class="item"><h4>'+esc(d.title)+'</h4><div class="meta">'+esc(d.type_label||d.news_type)+' \\u00b7 '+esc(d.created_at||'')+'</div><div class="detail">'+esc(d.angle||'')+'</div><div class="mrow"><button type="button" data-news-publish="'+esc(d.article_id)+'">Publish to website</button></div></div>';
			}).join('');
			box.querySelectorAll('[data-news-publish]').forEach(function(b){
				b.addEventListener('click',async function(){
					b.disabled=true;
					try{await api('/api/operating-center/news/auto-publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({article_id:b.getAttribute('data-news-publish')})});await news_loadQueue();await news_loadSummary();}
					catch(e){b.disabled=false;alert(e.message);}
				});
			});
		}catch(e){box.innerHTML='<div class="unavailable">'+esc(e.message)+'</div>';}
	}
	async function news_loadSettings(){
		var box=document.querySelector('#news-auto-settings'); if(!box)return;
		try{
			var r=await api('/api/operating-center/news/auto-settings');
			box.innerHTML=(r.settings||[]).map(function(s){
				return '<label class="toggle-row"><input type="checkbox" data-news-type="'+esc(s.news_type)+'"'+(s.auto_publish?' checked':'')+'> Auto-publish: '+esc(s.type_label)+'</label>';
			}).join('')+'<div class="meta">When auto-publish is on, the Machine publishes that kind of news to the website immediately \\u2014 no review step.</div>';
			box.querySelectorAll('[data-news-type]').forEach(function(cb){
				cb.addEventListener('change',async function(){
					try{await api('/api/operating-center/news/auto-settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({news_type:cb.getAttribute('data-news-type'),auto_publish:cb.checked})});}
					catch(e){cb.checked=!cb.checked;alert(e.message);}
				});
			});
		}catch(e){box.innerHTML='<div class="unavailable">'+esc(e.message)+'</div>';}
	}
	async function news_checkSocial(){
		try{
			var r=await api('/api/operating-center/news/social-status');
			var li=document.querySelector('#dest-linkedin input');
			var th=document.querySelector('#dest-threads input');
			var ls=document.querySelector('#linkedin-status');
			var ts=document.querySelector('#threads-status');
			if(r.linkedin){ if(li){li.disabled=false;li.checked=true;} if(ls)ls.textContent='(connected)'; var cl=document.querySelector('#connect-linkedin'); if(cl)cl.hidden=true; }
			else { if(ls)ls.textContent='(not connected)'; var cl2=document.querySelector('#connect-linkedin'); if(cl2)cl2.hidden=false; }
			if(r.threads){ if(th){th.disabled=false;th.checked=true;} if(ts)ts.textContent='(connected)'; var ct=document.querySelector('#connect-threads'); if(ct)ct.hidden=true; }
			else { if(ts)ts.textContent='(not connected)'; var ct2=document.querySelector('#connect-threads'); if(ct2)ct2.hidden=false; }
		}catch(e){}
	}
	function news_boot(){
		news_loadSummary(); news_loadQueue(); news_loadSettings(); news_checkSocial();
		var recent=document.querySelector('#news-recent');
		if(recent)recent.innerHTML='<div class="meta">Latest site news appears on nwaofna.org/news.</div>';
		var check=document.querySelector('#news-check');
		if(check)check.addEventListener('click',async function(){
			var msg=document.querySelector('#news-check-msg'); if(msg)msg.textContent='Scanning\\u2026';
			try{
				var r=await api('/api/operating-center/news/auto-generate',{method:'POST'});
				var n=(r.drafts||[]).length;
				if(msg)msg.textContent=n?('Drafted '+n+' item'+(n===1?'':'s')+'.'):('Nothing new found.');
				await news_loadQueue(); await news_loadSummary();
			}catch(e){if(msg)msg.textContent=e.message;}
		});
		news_pr_boot();
		var pub=document.querySelector('#news-publish');
		if(pub)pub.addEventListener('click',async function(){
			var msg=document.querySelector('#news-pub-msg');
			var title=(document.querySelector('#news-title')||{}).value||'';
			var body=(document.querySelector('#news-body')||{}).value||'';
			if(!title.trim()||!body.trim()){if(msg)msg.textContent='Headline and text are required.';return;}
			if(msg)msg.textContent='Publishing\\u2026'; pub.disabled=true;
			try{
				var dests=Array.prototype.map.call(document.querySelectorAll('#news-dests input:checked'),function(c){return c.value;});
				var r=await api('/api/operating-center/news/compose',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:title,body:body,destinations:dests})});
				if(msg)msg.textContent='Published: '+(r.published||[]).join(', ')+'.';
				document.querySelector('#news-title').value='';document.querySelector('#news-body').value='';
				await news_loadSummary();
			}catch(e){if(msg)msg.textContent=e.message;}
			pub.disabled=false;
		});
	}
	async function news_pr_boot(){
		var list=document.querySelector('#pr-list');
		async function load(){
			if(!list)return;
			try{
				var r=await api('/api/operating-center/news/press-releases');
				var items=r.releases||[];
				list.innerHTML=items.length?items.map(function(x){
					return '<div class="item"><h4>'+esc(x.headline)+'</h4><div class="meta">'+esc(x.status)+' · '+esc(x.created_at||'')+'</div></div>';
				}).join(''):'<div class="meta">No press-release drafts yet.</div>';
			}catch(e){if(list)list.innerHTML='<div class="unavailable">'+esc(e.message)+'</div>';}
		}
		await load();
		var save=document.querySelector('#pr-save');
		if(save)save.addEventListener('click',async function(){
			var msg=document.querySelector('#pr-msg');
			var headline=(document.querySelector('#pr-headline')||{}).value||'';
			var dateline=(document.querySelector('#pr-dateline')||{}).value||'';
			var body=(document.querySelector('#pr-body')||{}).value||'';
			var contact=(document.querySelector('#pr-contact')||{}).value||'';
			if(!headline.trim()||!body.trim()){if(msg)msg.textContent='Headline and body are required.';return;}
			try{
				await api('/api/operating-center/news/press-releases',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({headline:headline,dateline:dateline,body:body,contact:contact})});
				if(msg)msg.textContent='Draft saved.';
				document.querySelector('#pr-headline').value='';document.querySelector('#pr-dateline').value='';
				document.querySelector('#pr-body').value='';document.querySelector('#pr-contact').value='';
				await load();
			}catch(e){if(msg)msg.textContent=e.message;}
		});
	}
`;

const NEWS_PANELS = mktFunction(
	"news",
	"News Center — the Machine drafts news automatically; you review and publish, or write manually and send everywhere at once.",
	NEWS_SUMMARY_HTML,
	NEWS_ACTIONS_HTML,
	NEWS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 4. Media
// ---------------------------------------------------------------------------

const MEDIA_STYLE = `<style>
			.mrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}.mrow button{width:auto;margin-top:0}
			.mangle{font-style:italic;color:#66736d;font-size:14px;margin:4px 0}
			.post-text{background:#fbfdfb;border:1px solid #dce4df;border-radius:9px;padding:12px;white-space:pre-wrap;font-size:15px;margin:8px 0;max-height:340px;overflow:auto}
			.post-title{font-weight:700;margin:8px 0 0}
			.mnotes{background:#fffdf6;border:1px dashed #d8c98f;border-radius:9px;padding:10px 12px;font-size:14px;margin:8px 0;white-space:pre-wrap}
			.msource{color:#66736d;font-size:13px}
			.badge.warn{background:#fdf3e0;color:#8a5a00}
			.badge.sent{background:#dcefe4;color:#1d6b3c}
			button.approve{background:#1d6b3c;font-size:17px;padding:14px 26px}
		</style>`;

const MEDIA_SUMMARY_HTML = `<section class="panel"><h2>Media summary</h2><div id="media-sum">Loading…</div></section>`;

const MEDIA_ACTIONS_HTML = MEDIA_STYLE + `
	<div id="media-review-block" hidden>
		<div class="message" id="review-message" aria-live="polite"></div>
		<section class="panel" id="article-panel"><h2>News item</h2><div id="article">Loading…</div></section>
		<section class="panel"><h2>Content variants</h2><div id="variants">Loading…</div></section>
		<section class="panel">
			<h2>Distribution actions</h2>
			<div class="meta" style="margin-bottom:10px">Each action shows its destination, the exact text to post, and its status. After you post manually on a channel, press “Mark as sent”.</div>
			<div id="distributions">Loading…</div>
		</section>
		<section class="panel" id="approve-panel">
			<h2>Approve</h2>
			<p>Approval marks the draft variants as approved and records your decision in the audit log. It does <strong>not</strong> send or publish anything — every channel stays manual last mile.</p>
			<div class="mrow"><button id="approve-btn" class="approve" type="button">Approve distribution</button></div>
			<div class="message" id="approve-message" aria-live="polite"></div>
		</section>
	</div>
	<div id="media-review-hint" class="message">Open an article's Review link to see its distribution checklist here.</div>
	<section class="panel">
		<h2>Media plans</h2>
		<p class="meta"><strong>Machine (automatic):</strong> composes draft plans from verified sources only — every article slot cites its source. <strong>Owner (manual):</strong> create, approve, and publish below.</p>
		<div id="plans">Loading…</div>
		<div class="message" id="plans-message" aria-live="polite"></div>
		<div class="mrow" style="margin-top:8px"><button id="compose-plan" class="secondary" type="button">Compose plan from verified sources</button></div>
		<form id="plan-form">
			<h3>New plan</h3>
			<label for="plan-title">Title</label><input id="plan-title" name="title" required maxlength="200">
			<label for="plan-period">Period</label><input id="plan-period" name="period" maxlength="60" placeholder="Q4 2026">
			<label for="plan-notes">Notes</label><textarea id="plan-notes" name="notes"></textarea>
			<button type="submit" class="secondary">Create plan</button>
			<div class="message" aria-live="polite"></div>
		</form>
	</section>
	<section class="panel" id="plan-detail-panel" hidden>
		<h2 id="plan-detail-title">Plan</h2>
		<div class="meta" id="plan-detail-meta"></div>
		<div class="mrow" id="plan-actions"></div>
		<div class="message" id="plan-detail-message" aria-live="polite"></div>
		<h3>Articles</h3>
		<div id="articles">Loading…</div>
		<form id="article-form">
			<h3>Add article</h3>
			<label for="article-title">Title</label><input id="article-title" name="title" required maxlength="200">
			<label for="article-angle">Angle</label><textarea id="article-angle" name="angle" style="min-height:60px"></textarea>
			<button type="submit" class="secondary">Add article</button>
			<div class="message" aria-live="polite"></div>
		</form>
	</section>`;

const MEDIA_DETAILS_HTML = `<section class="panel"><h2>Plans and articles</h2><div id="media-det">Loading…</div></section>`;

const MEDIA_SCRIPT = `
	let media_selectedPlan=null;
	const media_PLAN_LABEL={DRAFT:'Draft',APPROVED:'Approved',IN_PROGRESS:'In progress',DONE:'Done'};
	const media_ART_LABEL={DRAFT:'Draft',READY:'Ready for review',APPROVED:'Approved',PUBLISHED:'Published'};
	async function boot_media_summary(){
		const box=document.querySelector('#media-sum');
		try{
			const d=await api('/api/operating-center/media/overview');
			const plans=d.plans||[];
			const byStatus={};
			let articles=0,ready=0,published=0;
			for(const p of plans){
				byStatus[p.status]=(byStatus[p.status]||0)+1;
				articles+=Number(p.article_count||0);ready+=Number(p.ready_count||0);published+=Number(p.published_count||0);
			}
			let html='<div class="item"><strong>Media plans</strong><div class="detail">'+plans.length+' plan(s) · '+articles+' articles · '+published+' published</div>';
			if(plans.length)html+='<div class="detail">'+Object.keys(byStatus).map(s=>esc(media_PLAN_LABEL[s]||s)+': '+byStatus[s]).join(' · ')+'</div>';
			html+='</div>';
			const attn=[];
			if((byStatus['DRAFT']||0)>0)attn.push(byStatus['DRAFT']+' draft plan(s) awaiting approval.');
			if(ready>0)attn.push(ready+' article(s) ready for review — approve them in Actions.');
			html+='<div class="item"><strong>Needs attention</strong>'+(attn.length?'<div class="detail">&bull; '+attn.map(esc).join('<br>&bull; ')+'</div>':'<div class="detail">Nothing needs attention right now.</div>')+'</div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Keeps the plan and article lifecycle; drafts are composed from verified sources only, with every article slot citing its source. Publishing is always owner-manual.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function media_loadPlans(){
		const box=document.querySelector('#plans');
		try{
			const data=await api('/api/operating-center/media/plans');
			if(!data.plans.length){box.innerHTML='<div class="unavailable">No media plans yet. Create one below: the machine provides the plan and article lifecycle, you provide the topics.</div>';return}
			box.innerHTML=data.plans.map(function(p){return '<div class="item"><strong>'+esc(p.title)+'<span class="badge">'+esc(media_PLAN_LABEL[p.status]||p.status)+'</span></strong>'+
				'<div class="meta">'+(p.period?esc(p.period)+' · ':'')+p.article_count+' articles · '+p.published_count+' published</div>'+
				'<div class="mrow"><button data-plan="'+esc(p.plan_id)+'" class="secondary" type="button">Open plan</button></div></div>'}).join('');
			box.querySelectorAll('[data-plan]').forEach(function(b){b.addEventListener('click',function(){media_openPlan(b.dataset.plan)})});
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function media_openPlan(planId){
		media_selectedPlan=planId;
		const panel=document.querySelector('#plan-detail-panel');
		panel.hidden=false;
		try{
			const d=await api('/api/operating-center/media/plans/'+encodeURIComponent(planId));
			const p=d.plan;
			document.querySelector('#plan-detail-title').textContent=p.title;
			document.querySelector('#plan-detail-meta').textContent=(p.period?p.period+' · ':'')+media_PLAN_LABEL[p.status]+(p.notes?' · '+p.notes:'');
			const actions=document.querySelector('#plan-actions');
			actions.innerHTML=p.status==='DRAFT'?'<button id="approve-plan" class="secondary" type="button">Approve plan</button>':'';
			const ab=document.querySelector('#approve-plan');
			if(ab)ab.addEventListener('click',async()=>{
				const m=document.querySelector('#plan-detail-message');m.textContent='Approving…';
				try{await api('/api/operating-center/media/plans/'+encodeURIComponent(planId)+'/approve',{method:'POST'});m.textContent='Plan approved.';await media_loadPlans();await media_openPlan(planId)}catch(err){m.textContent=err.message}
			});
			const box=document.querySelector('#articles');
			const arts=d.articles||[];
			box.innerHTML=arts.length?arts.map(function(a){
				let row='<div class="item"><strong>'+esc(a.title)+'<span class="badge">'+esc(media_ART_LABEL[a.status]||a.status)+'</span></strong>';
				if(a.angle)row+='<div class="mangle">'+esc(a.angle)+'</div>';
				if(a.published_at)row+='<div class="meta">Published '+esc(String(a.published_at).slice(0,10))+'</div>';
				row+='<div class="mrow">';
				if(a.status==='DRAFT'||a.status==='READY')row+='<button data-edit="'+esc(a.article_id)+'" class="secondary" type="button">Write / edit draft</button>';
				if(a.status==='READY')row+='<button data-approve-article="'+esc(a.article_id)+'" class="secondary" type="button">Approve article</button>';
				if(a.status==='APPROVED')row+='<button data-publish="'+esc(a.article_id)+'" class="secondary" type="button">Publish to site news</button>';
				row+='</div><div class="message" aria-live="polite"></div>';
				if(a.status==='PUBLISHED'){
					row+='<div data-distributions="'+esc(a.article_id)+'"><div class="meta">Loading distributions…</div></div>';
					row+='<div data-distribute-form="'+esc(a.article_id)+'" hidden><h3 style="font-size:16px;margin:12px 0 4px">Record external distribution</h3>'+
						'<div class="meta">The send itself happens outside this system by the owner. Recording it here keeps the press trail in one place.</div>'+
						'<label>Channel</label><select data-channel><option>PRESS_RELEASE</option><option>EMAIL_PITCH</option><option>WIRE</option><option>MEDIA_KIT</option><option>OTHER</option></select>'+
						'<label>Outlet (optional)</label><input data-outlet maxlength="200" placeholder="Outlet or journalist name">'+
						'<label>Notes (optional)</label><textarea data-notes style="min-height:60px" placeholder="What was sent, to whom, follow-up"></textarea>'+
						'<div class="mrow"><button data-record-dist="'+esc(a.article_id)+'" class="secondary" type="button">Record distribution</button>'+
						'<button data-toggle-distform="'+esc(a.article_id)+'" class="secondary" type="button">Cancel</button></div></div>';
					row+='<div class="mrow"><button data-show-distform="'+esc(a.article_id)+'" class="secondary" type="button">Record external distribution</button></div>';
				}
				row+='<div data-editor="'+esc(a.article_id)+'" hidden><label>Article body (HTML)</label><textarea data-body style="min-height:220px"></textarea><div class="mrow"><button data-save-body="'+esc(a.article_id)+'" class="secondary" type="button">Save draft</button></div></div>';
				return row+'</div>';
			}).join(''):'<div class="unavailable">No articles yet.</div>';
			box.querySelectorAll('[data-edit]').forEach(function(b){b.addEventListener('click',function(){
				const ed=box.querySelector('[data-editor="'+b.dataset.edit+'"]');
				ed.hidden=!ed.hidden;
			})});
			box.querySelectorAll('[data-save-body]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Saving…';
				const body=box.querySelector('[data-editor="'+b.dataset.saveBody+'"] [data-body]').value;
				try{await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.saveBody)+'/body',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body_html:body})});msg.textContent='Draft saved: ready for review.';await media_openPlan(media_selectedPlan)}catch(err){msg.textContent=err.message}
			})});
			box.querySelectorAll('[data-approve-article]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Approving…';
				try{await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.approveArticle)+'/approve',{method:'POST'});msg.textContent='Approved.';await media_loadPlans();await media_openPlan(media_selectedPlan)}catch(err){msg.textContent=err.message}
			})});
			box.querySelectorAll('[data-publish]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Publishing…';
				try{await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.publish)+'/publish',{method:'POST'});msg.textContent='Published to site news.';await media_loadPlans();await media_openPlan(media_selectedPlan)}catch(err){msg.textContent=err.message}
			})});
			async function loadDistributions(articleId){
				const box2=box.querySelector('[data-distributions="'+articleId+'"]');
				if(!box2)return;
				try{
					const d=await api('/api/operating-center/media/articles/'+encodeURIComponent(articleId)+'/distributions');
					const ds=d.distributions||[];
					box2.innerHTML='<div class="meta" style="margin-top:8px">External distribution:</div>'+
						(ds.length?ds.map(function(x){return '<div class="item"><strong>'+esc(x.channel)+'</strong>'+(x.outlet_name?'<div class="meta">'+esc(x.outlet_name)+'</div>':'')+'<div class="meta">Recorded '+esc(String(x.sent_at).slice(0,10))+(x.notes?' · '+esc(x.notes):'')+'</div></div>'}).join(''):'<div class="unavailable">Not distributed externally yet.</div>');
				}catch(err){box2.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
			}
			box.querySelectorAll('[data-distributions]').forEach(function(el){loadDistributions(el.dataset.distributions)});
			box.querySelectorAll('[data-show-distform]').forEach(function(b){b.addEventListener('click',function(){
				const f=box.querySelector('[data-distribute-form="'+b.dataset.showDistform+'"]');
				if(f)f.hidden=false;
			})});
			box.querySelectorAll('[data-toggle-distform]').forEach(function(b){b.addEventListener('click',function(){
				const f=box.querySelector('[data-distribute-form="'+b.dataset.toggleDistform+'"]');
				if(f)f.hidden=true;
			})});
			box.querySelectorAll('[data-record-dist]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Recording…';
				const f=box.querySelector('[data-distribute-form="'+b.dataset.recordDist+'"]');
				try{
					await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.recordDist)+'/distribute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel:f.querySelector('[data-channel]').value,outlet_name:f.querySelector('[data-outlet]').value,notes:f.querySelector('[data-notes]').value})});
					msg.textContent='Distribution recorded.';f.hidden=true;await loadDistributions(b.dataset.recordDist);
				}catch(err){msg.textContent=err.message}
			})});
			panel.scrollIntoView();
		}catch(err){document.querySelector('#plan-detail-message').textContent=err.message}
	}
	const media_review_STATUS_BADGE={prepared:'<span class="badge warn">prepared</span>',sent:'<span class="badge sent">sent</span>',DRAFT:'<span class="badge warn">draft</span>',READY:'<span class="badge">ready</span>',APPROVED:'<span class="badge sent">approved</span>',PUBLISHED:'<span class="badge sent">published</span>'};
	function media_review_badge(s){return media_review_STATUS_BADGE[s]||'<span class="badge">'+esc(s)+'</span>'}
	function media_review_copyText(btnId,textId){const b=document.getElementById(btnId);if(!b)return;b.addEventListener('click',async()=>{const t=document.getElementById(textId).textContent;try{await navigator.clipboard.writeText(t);b.textContent='Copied ✓';setTimeout(()=>b.textContent='Copy text',1500)}catch(e){b.textContent='Copy failed'}})}
	async function media_review_load(articleId){
		if(!articleId){document.querySelector('#review-message').textContent='Missing article_id in the URL.';return}
		try{
			const d=await api('/api/operating-center/news/review?article_id='+encodeURIComponent(articleId));
			const r=d.review;
			const a=r.article;
			document.querySelector('#article').innerHTML=
				'<div class="item"><strong>'+esc(a.title)+' '+media_review_badge(a.status)+'</strong>'+
				'<div class="meta">article_id: '+esc(a.article_id)+' · published: '+esc(a.published_at||'—')+' · kind: '+esc(a.angle||'—')+'</div>'+
				'<div class="post-text">'+esc(a.body_html)+'</div></div>';
			document.querySelector('#variants').innerHTML=r.variants.length?r.variants.map(function(v,i){
				return '<div class="item"><strong>'+esc(v.title)+' '+media_review_badge(v.status)+'</strong>'+
				'<div class="meta">'+esc(v.variant_type)+' · '+esc(v.variant_id)+'</div>'+
				'<div class="post-text" id="variant-text-'+i+'">'+esc(v.body)+'</div>'+
				'<div class="mrow"><button class="secondary" type="button" id="copy-variant-'+i+'">Copy text</button></div></div>'
			}).join(''):'<div class="unavailable">No variants.</div>';
			r.variants.forEach(function(v,i){media_review_copyText('copy-variant-'+i,'variant-text-'+i)});
			const allApproved=r.variants.length>0&&r.variants.every(function(v){return v.status==='APPROVED'});
			document.querySelector('#distributions').innerHTML=r.distributions.length?r.distributions.map(function(x,i){
				const sent=x.status==='sent';
				return '<div class="item" data-dist="'+esc(x.distribution_id)+'"><strong>'+esc(x.outlet_name||x.channel)+' '+media_review_badge(x.status)+'</strong>'+
				'<div class="meta">channel: '+esc(x.channel)+' · prepared: '+esc(x.created_at||'—')+(x.sent_at?' · sent: '+esc(x.sent_at):'')+'</div>'+
				(x.post_title?'<div class="post-title">Title: '+esc(x.post_title)+'</div>':'')+
				'<div class="post-text" id="dist-text-'+i+'">'+esc(x.post_text||'(no text)')+'</div>'+
				'<div class="msource">Text source: '+esc(x.text_source)+'</div>'+
				(x.notes?'<div class="mnotes">'+esc(x.notes)+'</div>':'')+
				'<div class="mrow"><button class="secondary" type="button" id="copy-dist-'+i+'">Copy text</button>'+
				(sent?'':'<button class="secondary" type="button" data-mark-sent="'+esc(x.distribution_id)+'"'+(allApproved?'':' disabled title="Approve the distribution first"')+'>Mark as sent</button>')+'</div>'+
				'<div class="message" data-dist-msg></div></div>';
			}).join(''):'<div class="unavailable">No distribution actions.</div>';
			r.distributions.forEach(function(x,i){media_review_copyText('copy-dist-'+i,'dist-text-'+i)});
			document.querySelectorAll('[data-mark-sent]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('[data-dist-msg]');msg.textContent='Recording…';
				try{await api('/api/operating-center/news/review/mark-sent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distribution_id:b.dataset.markSent})});msg.textContent='Marked as sent.';await media_review_load(articleId)}catch(err){msg.textContent=err.message}
			})});
			const ap=document.querySelector('#approve-panel');
			if(allApproved){ap.querySelector('p').innerHTML='Distribution approved. Post each channel manually, then mark it as sent above.';const ab2=document.querySelector('#approve-btn');ab2.disabled=true;ab2.textContent='Approved ✓'}
		}catch(err){document.querySelector('#review-message').textContent=err.message}
	}
	function media_review_maybe(){
		const hint=document.querySelector('#media-review-hint');
		const block=document.querySelector('#media-review-block');
		let aid='';
		try{aid=new URLSearchParams(location.search).get('article_id')||''}catch(e){}
		if(!aid){if(block)block.hidden=true;if(hint)hint.hidden=false;return;}
		if(hint)hint.hidden=true;if(block)block.hidden=false;
		const ab=document.querySelector('#approve-btn');
		if(ab)ab.addEventListener('click',async()=>{
			const m=document.querySelector('#approve-message');m.textContent='Approving…';
			try{const r=await api('/api/operating-center/news/review/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({article_id:aid})});m.textContent='Approved: '+r.variants_approved+' variants, '+r.distributions_prepared+' prepared actions. Nothing was sent.';await media_review_load(aid)}catch(err){m.textContent=err.message}
		});
		media_review_load(aid);
	}
	async function boot_media_actions(){
		const cp=document.querySelector('#compose-plan');
		if(cp)cp.addEventListener('click',async()=>{
			const m=document.querySelector('#plans-message');m.textContent='Composing plan from verified sources…';
			try{
				const r=await api('/api/operating-center/media/plans/compose',{method:'POST'});
				m.textContent='Composed: '+r.article_count+' article slots, all with cited sources.';
				await media_loadPlans();await media_openPlan(r.plan_id);
			}catch(err){m.textContent=err.message}
		});
		const pf=document.querySelector('#plan-form');
		if(pf)pf.addEventListener('submit',async e=>{
			e.preventDefault();const m=e.target.querySelector('.message');m.textContent='Creating…';
			try{
				const fd=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,String(v)]));
				const r=await api('/api/operating-center/media/plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fd)});
				e.target.reset();m.textContent='Created.';await media_loadPlans();await media_openPlan(r.plan_id);
			}catch(err){m.textContent=err.message}
		});
		const af=document.querySelector('#article-form');
		if(af)af.addEventListener('submit',async e=>{
			e.preventDefault();const m=e.target.querySelector('.message');m.textContent='Adding…';
			try{
				const fd=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,String(v)]));
				await api('/api/operating-center/media/plans/'+encodeURIComponent(media_selectedPlan)+'/articles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fd)});
				e.target.reset();m.textContent='Added.';await media_loadPlans();await media_openPlan(media_selectedPlan);
			}catch(err){m.textContent=err.message}
		});
		await media_loadPlans();
		media_review_maybe();
	}
	async function boot_media_details(){
		const box=document.querySelector('#media-det');
		try{
			const data=await api('/api/operating-center/media/plans');
			const plans=(data.plans||[]).slice(0,20);
			if(!plans.length){box.innerHTML='<div class="unavailable">No media plans yet.</div>';return;}
			box.innerHTML='<div class="message">Loading plan details…</div>';
			const details=await Promise.all(plans.map(async p=>{
				try{
					const d=await api('/api/operating-center/media/plans/'+encodeURIComponent(p.plan_id));
					return {plan:p,articles:d.articles||[]};
				}catch(err){return {plan:p,articles:[],error:err.message};}
			}));
			box.innerHTML=details.map(function(x){
				const p=x.plan;
				let h='<div class="item"><strong>'+esc(p.title)+'<span class="badge">'+esc(media_PLAN_LABEL[p.status]||p.status)+'</span></strong>'
					+'<div class="meta">'+(p.period?esc(p.period)+' · ':'')+p.article_count+' articles · '+p.published_count+' published'+(p.created_at?' · created '+esc(String(p.created_at).slice(0,10)):'')+'</div>';
				if(x.error){h+='<div class="detail unavailable">'+esc(x.error)+'</div>';}
				else if(x.articles.length){
					h+='<table class="data"><thead><tr><th>Article</th><th>Status</th><th>Published</th></tr></thead><tbody>'+
						x.articles.map(a=>'<tr><td>'+esc(a.title)+'</td><td>'+esc(media_ART_LABEL[a.status]||a.status)+'</td><td>'+esc(a.published_at?String(a.published_at).slice(0,10):'—')+'</td></tr>').join('')+'</tbody></table>';
				}else{h+='<div class="detail unavailable">No articles.</div>';}
				return h+'</div>';
			}).join('');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const MEDIA_PANELS = mktFunction(
	"media",
	"Content workspace — media plans, site news, press releases, and the distribution checklist. The Machine drafts from verified sources; the owner approves and publishes.",
	MEDIA_SUMMARY_HTML,
	MEDIA_ACTIONS_HTML,
	MEDIA_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 5. Sites
// ---------------------------------------------------------------------------

const SITES_SUMMARY_HTML = `<section class="panel"><h2>Sites summary</h2><div id="sites-sum">Loading…</div></section>`;

const SITES_ACTIONS_HTML = `<section class="panel"><h2>Sites actions</h2>
	<p class="meta"><strong>Machine (automatic):</strong> monitors the property list — there is no automatic publishing here. <strong>Owner (manual):</strong> open any site below; publishing news to a site happens in Media → Actions (“Publish to site news”).</p>
	<div id="sites-act">Loading…</div></section>`;

const SITES_DETAILS_HTML = `<section class="panel"><h2>Web properties</h2><div id="sites-det">Loading…</div></section>`;

const SITES_SCRIPT = `
	async function sites_fetchOverview(){
		return await api('/api/operating-center/sites/overview');
	}
	async function boot_sites_summary(){
		const box=document.querySelector('#sites-sum');
		try{
			const data=await sites_fetchOverview();
			const sites=data.sites||[];
			let html='<div class="item"><strong>Web properties</strong><div class="detail">'+sites.length+' live propert'+(sites.length===1?'y':'ies')+'</div>';
			if(sites.length)html+='<div class="detail">'+sites.map(s=>'&bull; '+esc(s.name)).join('<br>')+'</div>';
			html+='</div>';
			html+='<div class="item"><strong>Needs attention</strong><div class="detail">Nothing needs attention right now.</div></div>';
			html+='<div class="item"><strong>What the Machine did</strong><div class="detail">Keeps this property list current. Traffic statistics live in Analytics.</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_sites_actions(){
		const box=document.querySelector('#sites-act');
		try{
			const data=await sites_fetchOverview();
			const sites=data.sites||[];
			let html='<div class="item"><strong>Publish news to a site</strong><div class="detail">Site publishing is part of the Media workflow — approve an article and publish it to site news there.</div><div class="mrow"><button type="button" class="secondary" data-goto-media>Open Media → Actions</button></div></div>';
			for(const s of sites){
				html+='<div class="item"><strong>'+esc(s.name)+'</strong><div class="mrow"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="'+esc(s.url)+'" target="_blank" rel="noopener">Open site</a></div></div>';
			}
			box.innerHTML=html;
			const gm=box.querySelector('[data-goto-media]');
			if(gm)gm.addEventListener('click',()=>__mktSetView('media','actions',true));
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_sites_details(){
		const box=document.querySelector('#sites-det');
		try{
			const data=await sites_fetchOverview();
			const sites=data.sites||[];
			box.innerHTML=sites.length?'<table class="data"><thead><tr><th>Property</th><th>URL</th><th>What it is</th></tr></thead><tbody>'+
				sites.map(s=>'<tr><td><strong>'+esc(s.name)+'</strong></td><td><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.url)+'</a></td><td>'+esc(s.description)+'</td></tr>').join('')+'</tbody></table>'
				:'<div class="unavailable">No web properties listed.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const SITES_PANELS = mktFunction(
	"sites",
	"NWANA web properties — the public sites and what each one is for. Traffic statistics live in Analytics.",
	SITES_SUMMARY_HTML,
	SITES_ACTIONS_HTML,
	SITES_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// View routing: Summary / Actions / Details per function
// ---------------------------------------------------------------------------

const MKT_VIEW_SCRIPT = `
	var __mktBootedViews={};
	function __mktViewParam(){
		try{var v=new URLSearchParams(location.search).get('view');return (v==='actions'||v==='details')?v:'summary';}
		catch(e){return 'summary';}
	}
	function __mktActivateView(tab,view){
		var panel=document.querySelector('#tabpanel-'+tab);
		if(!panel)return;
		var btns=panel.querySelectorAll('[data-views] .oc-view-btn');
		for(var i=0;i<btns.length;i++){btns[i].classList.toggle('oc-view-active',btns[i].getAttribute('data-view')===view);}
		var panels=panel.querySelectorAll('[data-viewpanel]');
		for(var j=0;j<panels.length;j++){panels[j].hidden=panels[j].getAttribute('data-viewpanel')!==view;}
		var key=tab+':'+view;
		if(!__mktBootedViews[key]){
			__mktBootedViews[key]=1;
			var f=window['boot_'+tab+'_'+view];
			if(typeof f==='function'){f().catch(function(e){var m=panel.querySelector('.oc-tab-error');if(m)m.textContent='Error: '+(e&&e.message||e);});}
		}
	}
	function __mktSetView(tab,view,push){
		var u;try{u=new URL(location.href);}catch(e){return;}
		u.searchParams.set('tab',tab);u.searchParams.set('view',view);
		if(push){history.pushState({},'',u);}else{history.replaceState({},'',u);}
		__activateTab(tab);
		__mktActivateView(tab,view);
	}
	function __mktBootTab(tab){__mktActivateView(tab,__mktViewParam());}
	async function boot_ads(){__mktBootTab('ads');}
	async function boot_analytics(){__mktBootTab('analytics');}
	async function boot_social(){__mktBootTab('social');}
	async function boot_media(){__mktBootTab('media');}
	async function boot_news(){__mktBootTab('news');}
	async function boot_sites(){__mktBootTab('sites');}
	window.__onTabNavigate=function(id){__mktSetView(id,'summary',true);};
	window.addEventListener('popstate',function(){
		__activateInitialTab();
		var active=document.querySelector('.oc-tab.oc-tab-active');
		var tab=active?active.getAttribute('data-tab'):'ads';
		__mktActivateView(tab,__mktViewParam());
	});
	document.querySelector('#app').addEventListener('click',function(e){
		var q=e.target.closest('[data-mkt-qa]');
		if(q){
			var parts=String(q.getAttribute('data-mkt-qa')).split('|');
			var qtab=parts[0],qview=parts[1]||'summary',qsel=parts[2]||'';
			__mktSetView(qtab,qview,true);
			if(q.getAttribute('data-qa-press')==='1'){
				setTimeout(function(){var a=document.querySelector('#article-angle');if(a&&!a.value)a.value='Press release: ';},600);
			}
			if(qsel===' #article-form'||qsel==='#article-form'){
				/* The article form lives inside the plan detail panel: open the
				   most recent plan first so the form is visible, then scroll. */
				setTimeout(async function(){
					try{
						var pd=await api('/api/operating-center/media/plans');
						if(pd.plans&&pd.plans.length){await media_openPlan(pd.plans[0].plan_id);}
					}catch(e){}
					setTimeout(function(){var el=document.querySelector('#article-form');if(el&&!el.hidden)el.scrollIntoView();},400);
				},600);
				return;
			}
			if(qsel){setTimeout(function(){var el=document.querySelector(qsel);if(el&&!el.hidden)el.scrollIntoView();},600);}
			return;
		}
		var b=e.target.closest('.oc-views .oc-view-btn');
		if(b){
			var panel=b.closest('.oc-tabpanel');
			var btab=panel?panel.getAttribute('data-tab'):'';
			if(btab)__mktSetView(btab,b.getAttribute('data-view'),true);
		}
	});
	(function(){
		try{
			var h=(location.hash||'').replace(/^#/,'').split('?')[0];
			var tabs=['ads','analytics','social','media','sites'];
			var sp=new URLSearchParams(location.search);
			if(!sp.get('tab')&&tabs.indexOf(h)>=0){
				sp.set('tab',h);
				if(!sp.get('view'))sp.set('view','summary');
				history.replaceState({},'',location.pathname+'?'+sp.toString());
			}
		}catch(e){}
	})();
`;

// ---------------------------------------------------------------------------
// Quick actions (top of #app, after the gate unlocks) — all English
// ---------------------------------------------------------------------------

const MKT_QUICK_ACTIONS =
	`<span>Quick actions:</span>` +
	`<button type="button" data-mkt-qa="social|actions|#pack-panel">Create post</button>` +
	`<button type="button" data-mkt-qa="media|actions|#article-form">Site news</button>` +
	`<button type="button" data-mkt-qa="media|actions|#article-form" data-qa-press="1">Press release</button>` +
	`<button type="button" data-mkt-qa="ads|details|">Review Ads proposals</button>` +
	`<button type="button" data-mkt-qa="analytics|summary|">Open analytics</button>`;

export function renderMarketingSectionHtml(): string {
	return ocSectionShell({
		section: "marketing",
		title: "Marketing",
		subtitle: "Channels, content and campaigns — the Machine prepares, the owner publishes.",
		queryTabs: true,
		appTopHtml: MKT_QUICK_ACTIONS,
		tabs: [
			{ id: "ads", label: "Ads", panelsHtml: ADS_PANELS, script: ADS_SCRIPT + MKT_VIEW_SCRIPT, reportId: "ads" },
			{ id: "analytics", label: "Analytics", panelsHtml: ANALYTICS_PANELS, script: ANALYTICS_SCRIPT },
			{ id: "social", label: "Social", panelsHtml: SOCIAL_PANELS, script: SOCIAL_SCRIPT, reportId: "social" },
			{ id: "news", label: "News", panelsHtml: NEWS_PANELS, script: NEWS_SCRIPT, reportId: "news" },
			{ id: "media", label: "Media", panelsHtml: MEDIA_PANELS, script: MEDIA_SCRIPT },
			{ id: "sites", label: "Sites", panelsHtml: SITES_PANELS, script: SITES_SCRIPT, reportId: "sites" },
		],
	});
}
