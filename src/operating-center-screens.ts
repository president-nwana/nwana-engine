// ADR-0027: seven new operating-center screens, each with a downloadable
// external-ready report (Sites, Social, Ads, Sellers, Partners,
// Fundraising, Groups). ADR-0028 adds an eighth screen: Meetings.
// Sponsorship already has its own page (ADR-0026) and is untouched.
//
// OWNER'S HARD RULE: every number on every screen comes from a real
// source (D1, a connected API, or a repo fact). Where the source is not
// connected or has no data, the screen shows an honest "not connected /
// no data yet" state. No placeholder numbers, ever.

import { operatingCenterMenu, type OperatingCenterPageId } from "./operating-center";
import { getFundView } from "./fund";
import { validateCampaignSpec, type CampaignSpec, type DesiredState, type DistributionLink, type ProposalOrigin, type SourceObjectLink } from "./google-ads-state";
import { buildDesiredState } from "./google-ads-current";
import { currentProposalIntents } from "./google-ads-current";
import { buildProposals, type ProposalRecord } from "./google-ads-proposals";
import type { NormalizedCampaignIntent } from "./google-ads-intent";
// ADR-0029: the Ads screen reads the real Google Ads connection state from
// the existing live integration (src/google-ads.ts), never a hardcoded flag.
// ADR-0030: the screen is a read-only operational view of the real account:
// live campaigns come from the Google Ads API, never from the planned spec.
import { getGoogleAdsStatus, getGoogleAdsAccountSnapshot, GOOGLE_ADS_LIVE_CUSTOMER_ID, GOOGLE_ADS_METRICS_LABEL, type GoogleAdsEnv, type GoogleAdsLiveCampaign } from "./google-ads";
// ADR-0032: the Ads screen shows the machine's orchestration decisions
// (source -> required result -> candidate action -> channel) as their own
// logical layer, separate from the live account and the machine proposals.
import { getOrchestrationDecisions } from "./orchestration-google-ads";
import type { OrchestrationDecision } from "./orchestration";

export type ReportScreenId =
	| "sites"
	| "social"
	| "ads"
	| "sellers"
	| "partners"
	| "fundraising"
	| "groups"
	| "meetings";

export const REPORT_SCREENS: Array<{
	id: ReportScreenId;
	page: OperatingCenterPageId;
	label: string;
	path: string;
	reportPath: string;
}> = [
	{ id: "sites", page: "sites", label: "Sites", path: "/operating-center/sites", reportPath: "/api/operating-center/report/sites" },
	{ id: "social", page: "social", label: "Social", path: "/operating-center/social", reportPath: "/api/operating-center/report/social" },
	{ id: "ads", page: "ads", label: "Ads", path: "/operating-center/ads", reportPath: "/api/operating-center/report/ads" },
	{ id: "sellers", page: "sellers", label: "Sellers", path: "/operating-center/sellers", reportPath: "/api/operating-center/report/sellers" },
	{ id: "partners", page: "partners", label: "Partners", path: "/operating-center/partners", reportPath: "/api/operating-center/report/partners" },
	{ id: "fundraising", page: "fundraising", label: "Fundraising", path: "/operating-center/fundraising", reportPath: "/api/operating-center/report/fundraising" },
	{ id: "groups", page: "groups", label: "Groups", path: "/operating-center/groups", reportPath: "/api/operating-center/report/groups" },
	{ id: "meetings", page: "meetings", label: "Meetings", path: "/operating-center/meetings", reportPath: "/api/operating-center/report/meetings" },
];

function escHtml(v: unknown): string {
	return String(v ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Shared page shell for the ADR-0027/0028 screens: header, 16-button menu,
// owner-key gate, app container, and the common client prelude (esc, key
// storage, api() with the owner key, downloadReport()). Page-specific UI
// goes in panelsHtml; page-specific logic (which must define boot()) goes
// in script. The script must not contain backticks or ${ sequences.
function ocScreenShell(opts: {
	page: OperatingCenterPageId;
	title: string;
	subtitle: string;
	panelsHtml: string;
	script: string;
	reportId: ReportScreenId;
}): string {
	const filename = "nwana-" + opts.reportId + "-report";
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>${escHtml(opts.title)} — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9;--warn:#b35400}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
		.oc-menu-btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
		.oc-menu-btn:hover{background:#3a7455}.oc-menu-active{background:#fff;color:var(--brand)}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		h2{margin:0 0 14px;font-size:22px}h3{margin:18px 0 8px;font-size:18px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,button{font:inherit}input{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white;width:100%}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;margin-top:14px}
		button.secondary{background:white;color:var(--brand);border:1px solid var(--brand);width:auto;margin:8px 8px 0 0}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:14px 0}.item:first-of-type{border-top:0}.item strong{display:block}
		.badge{display:inline-block;background:var(--accent);border-radius:6px;padding:2px 8px;font-size:13px;color:var(--brand);font-weight:650;margin-left:8px}
		.badge-warn{display:inline-block;background:#fbeedf;border-radius:6px;padding:2px 8px;font-size:13px;color:var(--warn);font-weight:650;margin-left:8px}
		.badge-ok{display:inline-block;background:#e5efe9;border-radius:6px;padding:2px 8px;font-size:13px;color:#183d2d;font-weight:650;margin-left:8px}
		.detail{margin:6px 0;font-size:15px}.detail b{color:var(--muted);font-weight:650}
		table.data{width:100%;border-collapse:collapse;margin-top:8px}table.data th,table.data td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-size:15px}table.data th{color:var(--muted);font-weight:650}
	</style>
</head>
<body>
	<header><h1>${escHtml(opts.title)}</h1><p>${escHtml(opts.subtitle)}</p></header>
	${operatingCenterMenu(opts.page)}
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
			<section class="panel">
				<h2>Download report</h2>
				<p class="meta">A self-contained, external-ready snapshot of this screen as it is right now: current data, report date, no internal fields. Open it in a browser and print to PDF to hand to an outside party.</p>
				<button type="button" id="report-download" data-screen="${opts.reportId}" data-filename="${filename}">Download report (.html)</button>
				<div class="message" id="report-message" aria-live="polite"></div>
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
		function downloadReport(screen,filename){
			const m=document.querySelector('#report-message');if(m)m.textContent='Preparing report…';
			fetch('/api/operating-center/report/'+screen,{headers:{authorization:'Bearer '+getKey()}}).then(r=>{if(r.status===401){clearKey();showGate('The key was rejected. Enter the owner key again.');throw new Error('Unauthorized')}if(!r.ok)throw new Error('Report request failed');return r.text()}).then(html=>{const blob=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename+'.html';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);if(m)m.textContent='Report downloaded.'}).catch(err=>{if(m)m.textContent=err.message});
		}
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();boot()});
		document.querySelector('#report-download').addEventListener('click',e=>{const b=e.currentTarget;downloadReport(b.dataset.screen,b.dataset.filename)});
		${opts.script}
		if(getKey()){showApp();boot()}else{showGate('')}
	</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// 1. Sites
// ---------------------------------------------------------------------------

export interface SiteRecord {
	url: string;
	name: string;
	description: string;
}

export const NWANA_SITES: SiteRecord[] = [
	{ url: "https://nwaofna.org", name: "nwaofna.org", description: "Main federation website. A new Cloudflare site is in staging; the DNS switch happens only after full owner approval." },
	{ url: "https://ticketsignup.io/w/nwaofna", name: "ticketsignup.io/w/nwaofna", description: "Mirror of the main site on TicketSignup." },
	{ url: "https://series.nwaofna.org", name: "series.nwaofna.org", description: "Series 2026 hub: race calendar, verified results, and season standings." },
	{ url: "https://sport.nwaofna.org", name: "sport.nwaofna.org", description: "RunSignup race site: registrations and the online donation page." },
	{ url: "https://albertfatikhov.nwaofna.org", name: "albertfatikhov.nwaofna.org", description: "Personal page of NWANA president Albert Fatikhov." },
	{ url: "https://nwaofna.com", name: "nwaofna.com", description: "Legacy site with health and clinical Nordic walking content." },
	{ url: "https://academy.nwaofna.org", name: "academy.nwaofna.org", description: "Moodle learning platform for the NWANA Academy. Stays on its current hosting; not part of the site migration." },
];

export interface SitesOverview {
	ok: true;
	generated_at: string;
	sites: SiteRecord[];
	analytics: { connected: false; note: string };
}

export function getSitesOverview(): SitesOverview {
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		sites: NWANA_SITES,
		analytics: {
			connected: false,
			note: "Traffic analytics are not connected. Visitor numbers will appear here once an analytics source is attached.",
		},
	};
}

const SITES_SCRIPT = `
	async function boot(){
		const box=document.querySelector('#sites-list');
		const msg=document.querySelector('#sites-message');
		try{
			const data=await api('/api/operating-center/sites/overview');
			const sites=data.sites||[];
			box.innerHTML=sites.map(s=>'<div class="item"><strong><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.name)+'</a></strong><div class="detail">'+esc(s.description)+'</div></div>').join('')+
				'<div class="item"><strong>Traffic statistics<span class="badge-warn">Analytics not connected</span></strong><div class="detail">'+esc(data.analytics?data.analytics.note:'')+'</div></div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

export function renderSitesHtml(): string {
	return ocScreenShell({
		page: "sites",
		title: "Sites",
		subtitle: "Every NWANA web property in one place: what it is, where it lives, and its traffic once analytics is connected.",
		panelsHtml: `<section class="panel">
			<h2>Web properties</h2>
			<div class="message" id="sites-message" aria-live="polite"></div>
			<div id="sites-list">Loading…</div>
		</section>`,
		script: SITES_SCRIPT,
		reportId: "sites",
	});
}

// ---------------------------------------------------------------------------
// 3. Google Ads + Google Analytics
// ---------------------------------------------------------------------------

// ADR-0029: the Ads screen reads the real Google Ads connection state from
// the existing live integration (getGoogleAdsStatus, src/google-ads.ts,
// verified 2026-09-19). The previous ADR-0027 version hardcoded
// "Not connected" here; that stale state was factually wrong and is removed.
export interface AdsOverview {
	ok: true;
	generated_at: string;
	google_ads: {
		connected: boolean;
		configured: boolean;
		access_level: string;
		customers: string[];
		execution_allowed: boolean;
		error?: string;
		note: string;
	};
	google_analytics: { connected: false; note: string };
	// ADR-0030: live account snapshot from the Google Ads API (read-only).
	// available=false when the integration is not connected; then the
	// connection block above carries the state. error holds the real
	// account-read failure, never invented zeros.
	live_account: {
		available: boolean;
		customer_id: string;
		date_range: string;
		campaigns: GoogleAdsLiveCampaign[];
		error?: string;
	};
	// ADR-0016: the machine's desired-state spec. These campaigns are
	// PLANNED, not live: nothing has been created in any account.
	// Never presented as live data.
	planned_campaigns: Array<{
		name: string;
		daily_budget: number;
		status_in_account: string;
		ad_groups: Array<{ name: string; keywords: string[] }>;
	}>;
	// Proposal layer: the desired-state spec enriched with per-proposal
	// status, the Ad Grants policy validation result (from the existing
	// validator), and the next action. Never mixed with live campaigns.
	machine_proposals: MachineProposal[];
	// ADR-0032: orchestration decisions (source -> required result ->
	// candidate action -> channel decision). The machine's own logical
	// layer, separate from the live account and the machine proposals.
	orchestration: OrchestrationDecision[];
	// What the screen currently shows (real connection state plus the
	// planned spec). Google Analytics is deliberately untouched here.
	capabilities: string[];
}

type AdsStatusReader = typeof getGoogleAdsStatus;
type AdsAccountReader = typeof getGoogleAdsAccountSnapshot;

/**
 * Universal machine proposal, produced by the generic Google Ads
 * proposal pipeline (google-ads-proposals.ts) from a normalized
 * intent. The screen renders this record; it never builds proposals
 * itself.
 */
export type MachineProposal = ProposalRecord;

/**
 * Runs normalized intents through the generic proposal pipeline.
 * Thin presentation-layer wrapper around buildProposals.
 */
export function buildMachineProposals(
	intents: ReadonlyArray<NormalizedCampaignIntent>,
	liveCampaigns: GoogleAdsLiveCampaign[],
): MachineProposal[] {
	return buildProposals(intents, liveCampaigns);
}

export async function getAdsOverview(
	env: GoogleAdsEnv,
	readStatus: AdsStatusReader = getGoogleAdsStatus,
	readAccount: AdsAccountReader = getGoogleAdsAccountSnapshot,
): Promise<AdsOverview> {
	const spec = buildDesiredState();
	const status = await readStatus(env);
	const customers = status.customers ?? [];
	let note: string;
	if (status.connected) {
		note = `Connected. Read-only ${status.access_level} access to ` +
			`${customers.length} account(s): ${customers.join(", ")}. ` +
			`Campaign creation and mutation are disabled.`;
	} else if (status.error) {
		note = `Connection error: ${status.error}`;
	} else if (!status.configured) {
		const missing = (status.missing_configuration ?? []).join(", ");
		note = `Not connected: ${missing || "configuration"} missing.`;
	} else {
		note = "Configured but not connected: no OAuth credential stored yet.";
	}
	// ADR-0030: live account data is read only when the integration is
	// connected, via one bounded read-only API request. No D1 writes.
	let liveAccount: AdsOverview["live_account"];
	if (status.connected) {
		const snapshot = await readAccount(env, GOOGLE_ADS_LIVE_CUSTOMER_ID);
		liveAccount = {
			available: true,
			customer_id: snapshot.customer_id,
			date_range: snapshot.date_range,
			campaigns: snapshot.campaigns,
			...(snapshot.error ? { error: snapshot.error } : {}),
		};
	} else {
		liveAccount = {
			available: false,
			customer_id: GOOGLE_ADS_LIVE_CUSTOMER_ID,
			date_range: GOOGLE_ADS_METRICS_LABEL,
			campaigns: [],
		};
	}
	// ADR-0032: build proposals once, then attach the downstream proposal
	// state to the Google Ads orchestration decisions so the owner sees
	// decision -> intent -> proposal as separate logical layers in one view.
	const proposals = buildMachineProposals(currentProposalIntents(), liveAccount.campaigns);
	const downstream = new Map(proposals.map((p) => [p.proposal_id, p.state]));
	const orchestration = await getOrchestrationDecisions(env.nwana_engine_db, downstream);
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		google_ads: {
			connected: status.connected,
			configured: status.configured,
			access_level: status.access_level,
			customers,
			execution_allowed: status.execution_allowed,
			...(status.error ? { error: status.error } : {}),
			note,
		},
		google_analytics: {
			connected: false,
			note: "Not set up. No Analytics property is attached to the NWANA sites yet.",
		},
		live_account: liveAccount,
		planned_campaigns: spec.campaigns.map((c) => ({
			name: c.name,
			daily_budget: c.daily_budget,
			status_in_account: "Not created (planned only)",
			ad_groups: c.ad_groups.map((g) => ({
				name: g.name,
				keywords: g.keywords.map((k) => k.text + " [" + k.match_type + "]"),
			})),
		})),
		machine_proposals: proposals,
		// ADR-0032: orchestration decisions are their own logical layer,
		// separate from the live account and the machine proposals.
		orchestration,
		capabilities: [
			"Real Google Ads connection state (connected or the actual error)",
			"Access level and accessible customer account(s)",
			"Campaign creation/mutation status (currently disabled)",
			"Live campaign data from the connected account (read-only)",
			"Orchestration decisions: source, required result, candidate action, channel (read-only)",
			"Machine campaign proposals (owner review required)",
		],
	};
}

const ADS_SCRIPT = `
	async function boot(){
		const box=document.querySelector('#ads-list');
		try{
			const data=await api('/api/operating-center/ads/overview');
			const ads=data.google_ads;
			const badge=ads.connected?'<span class="badge-ok">Connected</span>':'<span class="badge-warn">Not connected</span>';
			let html='<div class="item"><strong>Google Ads '+badge+'</strong><div class="detail">'+esc(ads.note)+'</div>';
			html+='<div class="meta">Access level: '+esc(ads.access_level)+'</div>';
			if((ads.customers||[]).length){html+='<div class="meta">Accounts: '+ads.customers.map(esc).join(', ')+'</div>';}
			html+='<div class="meta">Campaign creation/mutation: '+(ads.execution_allowed?'enabled':'disabled')+'</div>';
			if(ads.error){html+='<div class="detail">Error: '+esc(ads.error)+'</div>';}
			html+='</div>';
			const live=data.live_account;
			if(live&&live.available){
				html+='<h3>LIVE GOOGLE ADS ACCOUNT</h3><p class="meta">Real data from account '+esc(live.customer_id)+', '+esc(live.date_range)+'. Read-only; the machine never changes campaigns.</p>';
				if(live.error){
					html+='<div class="item"><strong>Account data<span class="badge-warn">Read error</span></strong><div class="detail">Could not read account data: '+esc(live.error)+'</div></div>';
				}else if((live.campaigns||[]).length===0){
					html+='<div class="item"><div class="detail">No campaigns found in the connected Google Ads account.</div></div>';
				}else{
					for(const c of live.campaigns){
						const st=c.status==='ENABLED'?'<span class="badge-ok">'+esc(c.status)+'</span>':'<span class="badge-warn">'+esc(c.status)+'</span>';
						html+='<div class="item"><strong>'+esc(c.name)+' '+st+'</strong>'
							+'<div class="meta">Budget: $'+Number(c.daily_budget_usd).toFixed(2)+'/day</div>'
							+'<div class="detail">Impressions: '+esc(c.impressions)+' &middot; Clicks: '+esc(c.clicks)+' &middot; Conversions: '+esc(c.conversions)+' &middot; Spend: $'+Number(c.cost_usd).toFixed(2)+'</div>'
							+'</div>';
					}
				}
			}
			html+='<div class="item"><strong>Google Analytics<span class="badge-warn">Not set up</span></strong><div class="detail">'+esc(data.google_analytics.note)+'</div></div>';
			html+='<h3>ORCHESTRATION DECISIONS</h3><p class="meta">What the machine decided for every known source: required result, candidate action, channel. Sources with no evidence stay undecided; incomplete evidence is reported, never guessed. Read-only.</p>';
			for(const d of (data.orchestration||[])){
				const dBadge=d.state==='DECIDED'?'<span class="badge-ok">'+esc(d.state)+'</span>':'<span class="badge-warn">'+esc(d.state)+'</span>';
				html+='<div class="item"><strong>'+esc(d.source_identity)+' '+dBadge+'</strong>'
					+'<div class="meta">Decision ID: '+esc(d.decision_id)+'</div>'
					+'<div class="meta">Source: '+esc(d.source_kind)+(d.purpose?' &middot; Purpose: '+esc(d.purpose):'')+'</div>';
				if(d.required_result){html+='<div class="detail">Required result: '+esc(d.required_result)+'</div>';}
				if(d.candidate_action){html+='<div class="detail">Candidate action: '+esc(d.candidate_action)+'</div>';}
				html+='<div class="meta">Channel: '+(d.channel?esc(d.channel):'none')+(d.priority!=null?' &middot; Priority: '+esc(String(d.priority)):'')+'</div>';
				if((d.evidence||[]).length>0){
					html+='<div class="meta">Evidence: '+d.evidence.map(function(e){return esc(e.kind)+' '+esc(e.reference);}).join('; ')+'</div>';
				}
				if((d.missing_decision_input||[]).length>0){
					html+='<div class="meta">Missing decision input: '+d.missing_decision_input.map(esc).join('; ')+'</div>';
				}
				if(d.channel_intent_id){html+='<div class="meta">Channel intent: '+esc(d.channel_intent_id)+'</div>';}
				if(d.downstream){html+='<div class="meta">Downstream ('+esc(d.downstream.consumer)+'): '+esc(d.downstream.state)+'</div>';}
				if(d.execution_mode){html+='<div class="meta">Execution mode: '+esc(d.execution_mode)+'</div>';}
				html+='<div class="detail">'+esc(d.factual_reason)+'</div></div>';
			}
			html+='<h3>MACHINE PROPOSALS</h3><p class="meta">What the machine proposes to create. Campaign creation is disabled; the owner reviews every proposal before anything is created.</p>';
			for(const p of (data.machine_proposals||[])){
				const st=p.state==='PROPOSED'?'<span class="badge-ok">'+esc(p.state)+'</span>':'<span class="badge-warn">'+esc(p.state)+'</span>';
				html+='<div class="item"><strong>'+esc(p.name||'(unnamed proposal)')+' '+st+'</strong>'
					+'<div class="meta">Proposal ID: '+esc(p.proposal_id)+'</div>'
					+'<div class="meta">Budget: $'+(p.daily_budget!=null?Number(p.daily_budget).toFixed(2):'?')+'/day &middot; Target: '+esc(p.target_url||'none')+'</div>';
				html+='<div class="meta">Origin: '+(p.origin?esc(p.origin):'unknown')+' &middot; Source: '+esc(p.source_kind)+' / '+esc(p.source_identity)+'</div>';
				if(p.source_object){
					var label='Source object: '+esc(p.source_object.object_id);
					if(p.source_object.object_type){label+=' ('+esc(p.source_object.object_type)+')';}
					if(p.source_object.title){label+=' - '+esc(p.source_object.title);}
					html+='<div class="meta">'+label+'</div>';
				}
				else{html+='<div class="meta">Source object: not yet linked</div>';}
				html+='<div class="meta">Purpose: '+esc(p.purpose)+'</div>';
				html+='<div class="meta">Distribution rule: '+(p.distribution.rule_id?esc(p.distribution.rule_id):'none')+'</div>';
				html+='<div class="meta">Distribution action: '+(p.distribution.action_id?esc(p.distribution.action_id):'none')+'</div>';
				html+='<div class="meta">Channel: '+(p.distribution.channel?esc(p.distribution.channel):'none')+'</div>';
				html+='<div class="meta">Creation eligibility: '+(p.creation_eligible?'eligible':'not eligible')+'</div>';
				if(p.conflict){
					html+='<div class="meta">Live conflict: '+esc(p.conflict.live_campaign_name)+' ('+(p.conflict.via==='VERIFIED_MAPPING'?'verified mapping':'exact name')+')</div>';
				}
				if((p.missing_fields||[]).length>0){
					html+='<div class="meta">Missing fields: '+p.missing_fields.map(esc).join(', ')+'</div>';
				}
				for(const g of (p.ad_groups||[])){
					const kws=(g.keywords||[]).map(function(k){return esc(k.text)+' ('+esc(k.match_type)+')';}).join(', ');
					html+='<div class="detail"><b>'+esc(g.name)+':</b> max CPC $'+Number(g.default_cpc).toFixed(2)+', '+g.ads_count+' ads<br>Keywords: '+kws+'</div>';
				}
				if((p.policy_violations||[]).length===0){
					html+='<div class="detail">Ad Grants policy: PASS</div>';
				}else{
					html+='<div class="detail">Ad Grants policy violations: '+p.policy_violations.map(esc).join('; ')+'</div>';
				}
				html+='<div class="detail">Next action: '+esc(p.next_action)+'</div></div>';
			}
			html+='<h3>What this screen shows today</h3><div class="detail">'+(data.capabilities||[]).map(w=>'&bull; '+esc(w)).join('<br>')+'</div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

export function renderAdsHtml(): string {
	return ocScreenShell({
		page: "ads",
		title: "Google Ads + Analytics",
		subtitle: "Paid and organic traffic in one place. Google Ads shows its real connection state below; Google Analytics is not attached yet. The machine already holds the planned campaign spec.",
		panelsHtml: `<section class="panel">
			<h2>Advertising and analytics</h2>
			<div id="ads-list">Loading…</div>
		</section>`,
		script: ADS_SCRIPT,
		reportId: "ads",
	});
}

// ---------------------------------------------------------------------------
// 6. Fundraising (the Fund object; full pipeline lives on the Funds page)
// ---------------------------------------------------------------------------

export async function getFundraisingOverview(db: D1Database) {
	const view = await getFundView(db);
	const fund = view.funds[0] ?? null;
	return {
		ok: true as const,
		generated_at: view.generated_at,
		fund: fund
			? {
					name: fund.fund.name,
					description: fund.fund.description,
					goal_amount: fund.fund.goal_amount,
					raised_amount: fund.fund.raised_amount,
					currency: fund.fund.currency,
					status: fund.fund.status,
					stage_counts: fund.stage_counts,
					follow_ups_due_now: fund.follow_ups_due_now,
					prospect_count: fund.prospects.length,
					tiers: tierCounts(fund.prospects.map((p) => p.ask_tier)),
					follow_up_calendar: {
						due: "2026-10-06",
						overdue: "2026-10-13",
						note: "Follow-ups for the 15 letters sent 2026-09-22.",
					},
					prospects: fund.prospects.map((p) => ({
						name: p.name,
						ask_tier: p.ask_tier,
						ask_amount: p.ask_amount,
						stage: p.stage,
						sent_at: p.sent_at,
						subject: p.subject,
						follow_up_due_at: p.follow_up_due_at,
						follow_up_status: p.follow_up_status,
						next_action: p.next_action,
					})),
				}
			: null,
	};
}

function tierCounts(tiers: string[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const t of tiers) out[t] = (out[t] ?? 0) + 1;
	return out;
}

const FUNDRAISING_SCRIPT = `
	async function boot(){
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
			html+='<p class="meta">The full prospect pipeline with stage advancement lives on the <a href="/operating-center/funds">Funds</a> page.</p>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

export function renderFundraisingHtml(): string {
	return ocScreenShell({
		page: "fundraising",
		title: "Fundraising",
		subtitle: "The Fund object: the $50K Founding Circle bridge sprint, its pipeline, and the follow-up calendar.",
		panelsHtml: `<section class="panel">
			<h2>Founding Circle bridge sprint</h2>
			<div id="fundraising-list">Loading…</div>
		</section>`,
		script: FUNDRAISING_SCRIPT,
		reportId: "fundraising",
	});
}

// ---------------------------------------------------------------------------
// 7. NW Groups
// ---------------------------------------------------------------------------

export interface GroupsOverview {
	ok: true;
	generated_at: string;
	ladder: Array<{ step: string; description: string }>;
	funnel: { member_org: string; register: string };
	stats: { connected: false; note: string };
}

export function getGroupsOverview(): GroupsOverview {
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		ladder: [
			{ step: "Individual license", description: "A walker takes an individual license." },
			{ step: "Free group creation", description: "NWANA creates the group and issues the initial Group License free, with a group page." },
			{ step: "RECOGNIZED Group — $200/year", description: "A voluntary later application. Deliberately manual: human evaluation and live contact." },
		],
		funnel: {
			member_org: "https://runsignup.com/MemberOrg/NWANANWGroups",
			register: "https://runsignup.com/MemberOrg/NWANANWGroups/Register",
		},
		stats: {
			connected: false,
			note: "Group and member counts are not tracked yet. The funnel above is the public entry point; counts will appear here once the machine reads them from RunSignup.",
		},
	};
}

const GROUPS_SCRIPT = `
	async function boot(){
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

export function renderGroupsHtml(): string {
	return ocScreenShell({
		page: "groups",
		title: "NW Groups",
		subtitle: "The scaling mechanism from one person to the continent: licenses, free group creation, and RECOGNIZED status.",
		panelsHtml: `<section class="panel">
			<h2>Group network</h2>
			<div id="groups-list">Loading…</div>
		</section>`,
		script: GROUPS_SCRIPT,
		reportId: "groups",
	});
}

// ---------------------------------------------------------------------------
// 2. Social
// ---------------------------------------------------------------------------

export interface SocialAccount {
	platform: string;
	handle: string;
	url: string | null;
	status: string;
	// Only verified numbers go here. Unverified stays null and renders as
	// "not recorded", never as zero.
	stats: Array<{ label: string; value: string }> | null;
	note: string;
}

export const SOCIAL_ACCOUNTS: SocialAccount[] = [
	{
		platform: "Instagram",
		handle: "@nwana.official",
		url: "https://www.instagram.com/nwana.official/",
		status: "Connected",
		stats: [
			{ label: "Reels on account", value: "17 (counted 2026-09-22)" },
		],
		note: "Daily race-promotion posting is automated (one post per day for the next Series 2026 race). Follower count is not recorded by the machine.",
	},
	{
		platform: "Instagram",
		handle: "@n_w_sport",
		url: "https://www.instagram.com/n_w_sport/",
		status: "Connected",
		stats: [{ label: "Reels on account", value: "11 (counted 2026-09-22)" }],
		note: "Connected professional account; not used for NWANA posting.",
	},
	{
		platform: "Instagram",
		handle: "@albertfatikhov70",
		url: "https://www.instagram.com/albertfatikhov70/",
		status: "Connected",
		stats: [{ label: "Reels on account", value: "40 (counted 2026-09-22)" }],
		note: "President's personal account; not used for NWANA posting.",
	},
	{
		platform: "YouTube",
		handle: "NWANA (Nordic Walking Association of North America)",
		url: null,
		status: "Channel access pending verification",
		stats: null,
		note: "Channel rights are held by a NWANA Google account. 12 instructional Shorts were prepared from Instagram reels; their publication is not confirmed. Channel URL is not recorded.",
	},
	{
		platform: "Facebook",
		handle: "NWANA (page id 595301193675669)",
		url: null,
		status: "Page known, publishing not verified",
		stats: null,
		note: "Page id comes from the owner's own publishing script. Managed-page publishing was never verified in this runtime. Race events are shared to four Nordic walking groups.",
	},
	{
		platform: "Facebook",
		handle: "Nordic Walking Sport (page id 103190499173992)",
		url: null,
		status: "Page known, publishing not verified",
		stats: null,
		note: "Second page id from the owner's own publishing script. Same unverified publishing status as the NWANA page.",
	},
	{
		platform: "LinkedIn",
		handle: "NWANA company page",
		url: "https://www.linkedin.com/company/nwana/",
		status: "Observed 2026-09-22",
		stats: [
			{ label: "Followers", value: "8" },
			{ label: "Posts", value: "0" },
		],
		note: "Dormant. Positioned as the B2B channel: sponsors, insurers, cities, partners. Instagram and YouTube stay athlete-facing.",
	},
];

export interface SocialOverview {
	ok: true;
	generated_at: string;
	accounts: SocialAccount[];
}

export function getSocialOverview(): SocialOverview {
	return { ok: true, generated_at: new Date().toISOString(), accounts: SOCIAL_ACCOUNTS };
}

const SOCIAL_SCRIPT = `
	async function boot(){
		const box=document.querySelector('#social-list');
		try{
			const data=await api('/api/operating-center/social/overview');
			let html='';
			for(const a of (data.accounts||[])){
				html+='<div class="item"><strong>'+esc(a.platform)+' — '+esc(a.handle)+'<span class="badge">'+esc(a.status)+'</span></strong>';
				if(a.url)html+='<div class="detail"><a href="'+esc(a.url)+'" target="_blank" rel="noopener">'+esc(a.url)+'</a></div>';
				if(a.stats&&a.stats.length){
					html+='<table class="data"><tbody>'+a.stats.map(s=>'<tr><th>'+esc(s.label)+'</th><td>'+esc(s.value)+'</td></tr>').join('')+'</tbody></table>';
				}else{
					html+='<div class="detail unavailable">No verified statistics recorded for this account.</div>';
				}
				html+='<div class="detail">'+esc(a.note)+'</div></div>';
			}
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

export function renderSocialHtml(): string {
	return ocScreenShell({
		page: "social",
		title: "Social",
		subtitle: "Every NWANA account, page, and group the machine knows, with the statistics it can actually verify.",
		panelsHtml: `<section class="panel">
			<h2>Accounts</h2>
			<div id="social-list">Loading…</div>
		</section>`,
		script: SOCIAL_SCRIPT,
		reportId: "social",
	});
}

// ---------------------------------------------------------------------------
// 4. Sellers (exclusive-seller pipeline; factual records only)
// ---------------------------------------------------------------------------

export interface SellerRecord {
	company: string;
	contact: string;
	role: string;
	stage: string;
	last_event: string;
	last_event_date: string;
	next_step: string;
	next_date: string | null;
}

export const SELLERS: SellerRecord[] = [
	{
		company: "Integrity 9",
		contact: "David Hayob",
		role: "Chief Revenue Officer",
		stage: "Meeting confirmed",
		last_event: "Owner confirmed Fri 2026-09-25 2:00-3:00pm CT (3:00pm ET, 10:00pm Riga). Awaiting the Teams link from David.",
		last_event_date: "2026-09-21",
		next_step: "Join the call with the Latvian board members; decide on exclusivity terms (minimum commitments, milestones, termination rights) if they ask.",
		next_date: "2026-09-25",
	},
	{
		company: "Zubie Five",
		contact: "Adam Zubiate",
		role: "Founder",
		stage: "Reply received — numbers requested",
		last_event: "Adam replied 2026-09-22 asking for group-network size, virtual Series reach and registrations, and any brand relationships before a first call. Proposed call Tue-Thu, week of Sep 28.",
		last_event_date: "2026-09-22",
		next_step: "Send the requested numbers (this report answers them) and book the call at zubiefive.com/meet.",
		next_date: null,
	},
	{
		company: "Sea Theory",
		contact: "Brianna Appel",
		role: "Founder",
		stage: "Evaluating",
		last_event: "Reply 2026-09-16: submit property and inventory via their portal for review by their sponsorship operators. Inventory document prepared 2026-09-17.",
		last_event_date: "2026-09-17",
		next_step: "Owner decides whether to register on the Sea Theory portal (one opportunity at a time).",
		next_date: null,
	},
	{
		company: "Elevate",
		contact: "newbiz@oneelevate.com",
		role: "Sponsorship sales agency",
		stage: "Contacted — no reply",
		last_event: "Sent 2026-09-03; follow-up sent 2026-09-16. Only an autoresponder received.",
		last_event_date: "2026-09-16",
		next_step: "None scheduled.",
		next_date: null,
	},
	{
		company: "Playfly",
		contact: "Contact@playfly.com",
		role: "Sponsorship sales agency",
		stage: "Contacted — no reply",
		last_event: "Sent 2026-09-03; follow-up sent 2026-09-16. No reply.",
		last_event_date: "2026-09-16",
		next_step: "None scheduled.",
		next_date: null,
	},
	{
		company: "Arco Global Media",
		contact: "ben@arcoglobalmedia.com",
		role: "Sponsorship sales agency",
		stage: "Contacted — no reply",
		last_event: "Sent 2026-09-03; follow-up sent 2026-09-16. No reply.",
		last_event_date: "2026-09-16",
		next_step: "None scheduled.",
		next_date: null,
	},
	{
		company: "The Sho Agency",
		contact: "hello@theshoagency.com",
		role: "Sponsorship sales agency",
		stage: "Contacted — no reply",
		last_event: "Sent 2026-09-03; follow-up sent 2026-09-16. No reply.",
		last_event_date: "2026-09-16",
		next_step: "None scheduled.",
		next_date: null,
	},
	{
		company: "Sportsman Solutions",
		contact: "info@sportsmansolutions.com",
		role: "Commission seller",
		stage: "Contacted — no reply",
		last_event: "Sent 2026-09-03; follow-up sent 2026-09-16. No reply.",
		last_event_date: "2026-09-16",
		next_step: "None scheduled.",
		next_date: null,
	},
	{
		company: "NXS Management",
		contact: "nick@nxs.management",
		role: "Sponsorship sales agency",
		stage: "Contacted — no reply",
		last_event: "Sent 2026-09-03; follow-up sent 2026-09-16. No reply. A further follow-up draft is staged, awaiting the owner's Send.",
		last_event_date: "2026-09-16",
		next_step: "Owner decides whether to send the staged follow-up.",
		next_date: null,
	},
	{
		company: "SSEC",
		contact: "info@gosponsorship.com",
		role: "Commission seller",
		stage: "Contacted — no reply",
		last_event: "Sent 2026-09-16 by the owner from the Gmail app.",
		last_event_date: "2026-09-16",
		next_step: "None scheduled.",
		next_date: null,
	},
];

export interface SellersOverview {
	ok: true;
	generated_at: string;
	sellers: SellerRecord[];
	// Direct, honest answers to what Zubie Five asked on 2026-09-22.
	zubie_five_answers: Array<{ question: string; answer: string }>;
}

export function getSellersOverview(): SellersOverview {
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		sellers: SELLERS,
		zubie_five_answers: [
			{
				question: "How many groups and participants are in the community network?",
				answer: "Not yet tracked. The public group funnel is https://runsignup.com/MemberOrg/NWANANWGroups. Group and member counts will be reported here once the machine reads them from RunSignup.",
			},
			{
				question: "What is the reach and registration volume of the virtual competition series?",
				answer: "Series 2026 runs weekly virtual races (1K, 3K, 5K, 10K, 15K, 20K) through December 2026, hub at https://series.nwaofna.org. Registration counts are taken on RunSignup and are not tracked by the machine yet; verified results are published per event with season standings across five performance levels.",
			},
			{
				question: "Are there existing or informal brand or category relationships?",
				answer: "No signed brand relationships. Prize-sponsor outreach is in progress: letters sent to Urban Poling, Komperdell, AllTrails, Ibotta, The Krazy Coupon Lady, and PayPal Honey; a product request submitted to Skratch Labs; LMNT declined (program on pause); Gruppo Nutrition gave a soft no. No exclusivity has been offered to any seller.",
			},
		],
	};
}

const SELLERS_SCRIPT = `
	async function boot(){
		const box=document.querySelector('#sellers-list');
		try{
			const data=await api('/api/operating-center/sellers/overview');
			let html='<h3>Seller pipeline</h3>';
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
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

export function renderSellersHtml(): string {
	return ocScreenShell({
		page: "sellers",
		title: "Sellers",
		subtitle: "The exclusive-seller pipeline: who is talking, at what stage, and what happens next. Factual records only.",
		panelsHtml: `<section class="panel">
			<h2>Exclusive-seller conversations</h2>
			<div id="sellers-list">Loading…</div>
		</section>`,
		script: SELLERS_SCRIPT,
		reportId: "sellers",
	});
}

// ---------------------------------------------------------------------------
// 5. Partners (from the outreach registry; real entries only)
// ---------------------------------------------------------------------------

export interface PartnerRecord {
	name: string;
	subject: string;
	stage: string;
	last_event: string;
	last_event_date: string;
}

export const PARTNERS: PartnerRecord[] = [
	{
		name: "AARP",
		subject: "National member-benefit partnership: Series + instructor course discount",
		stage: "Draft — no recipient yet",
		last_event: "Draft staged in Gmail 2026-09-17 from the owner's mailbox. The proposed discount figure is not confirmed and no verified public AARP partnerships address was found, so the draft has no recipient.",
		last_event_date: "2026-09-17",
	},
];

export interface PartnersOverview {
	ok: true;
	generated_at: string;
	partners: PartnerRecord[];
	note: string;
}

export function getPartnersOverview(): PartnersOverview {
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		partners: PARTNERS,
		note: "The partner pipeline is thin: one drafted partnership, no signed partners. New entries appear here as the registry grows.",
	};
}

const PARTNERS_SCRIPT = `
	async function boot(){
		const box=document.querySelector('#partners-list');
		try{
			const data=await api('/api/operating-center/partners/overview');
			let html='';
			for(const p of (data.partners||[])){
				html+='<div class="item"><strong>'+esc(p.name)+'<span class="badge">'+esc(p.stage)+'</span></strong>'+
					'<div class="detail"><b>Proposal:</b> '+esc(p.subject)+'</div>'+
					'<div class="detail">'+esc(p.last_event)+' <span class="meta">('+esc(p.last_event_date)+')</span></div></div>';
			}
			html+='<p class="meta">'+esc(data.note)+'</p>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

export function renderPartnersHtml(): string {
	return ocScreenShell({
		page: "partners",
		title: "Partners",
		subtitle: "The partner pipeline, read straight from the outreach registry. Real entries only.",
		panelsHtml: `<section class="panel">
			<h2>Partnerships</h2>
			<div id="partners-list">Loading…</div>
		</section>`,
		script: PARTNERS_SCRIPT,
		reportId: "partners",
	});
}

// ---------------------------------------------------------------------------
// 8. Meetings (ADR-0028)
//
// Two sources, both real:
//   - External meetings: curated code data from the outreach registry and
//     the owner's confirmed correspondence. Join links, meeting IDs, and
//     passcodes are shown on the owner-gated SCREEN only; they never go
//     into the downloadable report.
//   - Board meetings: read-only SELECT over the D1 board_meetings table.
//     No side effects, no meeting creation.
// ---------------------------------------------------------------------------

export interface ExternalMeetingRecord {
	id: string;
	title: string;
	counterparty: string;
	// Human-readable date/time, e.g. "Fri 2026-09-25, 2:00-3:00pm CT (3:00-4:00pm ET)".
	display_when: string;
	location: string;
	purpose: string;
	// "confirmed" | "awaiting scheduling" | "done"
	status: string;
	next_step: string | null;
	// SCREEN ONLY: never rendered by buildMeetingsReport (external-safe).
	join_url: string | null;
	join_access: string | null;
}

export const EXTERNAL_MEETINGS: ExternalMeetingRecord[] = [
	{
		id: "integrity9-2026-09-25",
		title: "Integrity 9 — exclusive sponsorship seller discussion",
		counterparty: "Integrity 9 · David Hayob, Chief Revenue Officer",
		display_when: "Fri 2026-09-25, 2:00-3:00pm CT (3:00-4:00pm ET, 10:00-11:00pm Riga)",
		location: "Microsoft Teams",
		purpose: "Discuss an exclusive sponsorship seller partnership for NWANA's commercial rights.",
		status: "confirmed",
		next_step: "Join the call with the Latvian board members. Exclusivity terms (minimum commitments, milestones, termination rights) are decided only if they ask.",
		join_url: "https://teams.microsoft.com/meet/214553368452049?p=YT6qRnvYGwa2tq3PU9",
		join_access: "Meeting ID 214 553 368 452 049 · Passcode LC7pm2C9",
	},
	{
		id: "zubie-five-intro",
		title: "Zubie Five — sponsorship partnership intro call",
		counterparty: "Zubie Five · Adam Zubiate, Founder",
		display_when: "Proposed: Tue-Thu, week of Sep 28, 2026",
		location: "Online — booking page",
		purpose: "First call to talk through NWANA's sponsorship assets and outline a commission-based partnership.",
		status: "awaiting scheduling",
		next_step: "Send the numbers Adam asked for (the sellers report answers them) and book the call.",
		join_url: "https://zubiefive.com/meet",
		join_access: null,
	},
];

export interface BoardMeetingSummary {
	meeting_id: string;
	title: string;
	scheduled_for: string | null;
	status: string;
	opened_at: string | null;
	closed_at: string | null;
	// Minutes content never leaves the board workspace; the screen and the
	// report only say whether minutes were recorded.
	minutes_present: boolean;
	attendees: string | null;
	agenda_count: number;
	decision_count: number;
	created_at: string;
}

function parseMeetingAttendees(metadata: string | null): string | null {
	if (!metadata) return null;
	try {
		const parsed = JSON.parse(metadata) as { attendees?: unknown };
		return typeof parsed.attendees === "string" && parsed.attendees.trim()
			? parsed.attendees
			: null;
	} catch {
		return null;
	}
}

export interface MeetingsOverview {
	ok: true;
	generated_at: string;
	external_meetings: ExternalMeetingRecord[];
	// DRAFT/OPEN meetings: date/time, title, agenda count.
	board_upcoming: BoardMeetingSummary[];
	// CLOSED meetings: date, minutes recorded/absent, decision count.
	board_past: BoardMeetingSummary[];
}

export async function getMeetingsOverview(db: D1Database): Promise<MeetingsOverview> {
	// Read-only SELECT. Mirrors listBoardMeetings() in board.ts but stays a
	// plain data getter: no meeting creation, no side effects.
	const result = await db
		.prepare(
			`SELECT m.meeting_id, m.title, m.scheduled_for, m.status,
			        m.opened_at, m.closed_at, m.minutes, m.metadata, m.created_at,
			        (SELECT COUNT(*) FROM board_submissions s WHERE s.meeting_id = m.meeting_id AND s.status = 'AGENDA') AS agenda_count,
			        (SELECT COUNT(*) FROM board_decisions d WHERE d.meeting_id = m.meeting_id) AS decision_count
			 FROM board_meetings m
			 ORDER BY COALESCE(m.scheduled_for, '9999-12-31') DESC, m.created_at DESC
			 LIMIT 100`,
		)
		.all<{
			meeting_id: string;
			title: string;
			scheduled_for: string | null;
			status: string;
			opened_at: string | null;
			closed_at: string | null;
			minutes: string | null;
			metadata: string | null;
			created_at: string;
			agenda_count: number;
			decision_count: number;
		}>();
	const meetings: BoardMeetingSummary[] = result.results.map((m) => ({
		meeting_id: m.meeting_id,
		title: m.title,
		scheduled_for: m.scheduled_for,
		status: m.status,
		opened_at: m.opened_at,
		closed_at: m.closed_at,
		minutes_present: typeof m.minutes === "string" && m.minutes.trim().length > 0,
		attendees: parseMeetingAttendees(m.metadata),
		agenda_count: Number(m.agenda_count ?? 0),
		decision_count: Number(m.decision_count ?? 0),
		created_at: m.created_at,
	}));
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		external_meetings: EXTERNAL_MEETINGS,
		board_upcoming: meetings.filter((m) => m.status === "DRAFT" || m.status === "OPEN"),
		board_past: meetings.filter((m) => m.status === "CLOSED"),
	};
}

function boardStatusLabel(status: string): string {
	if (status === "DRAFT") return "draft";
	if (status === "OPEN") return "open";
	if (status === "CLOSED") return "done";
	return status.toLowerCase();
}

const MEETINGS_SCRIPT = `
	async function boot(){
		const ext=document.querySelector('#meetings-external-list');
		const bup=document.querySelector('#meetings-board-upcoming');
		const bpast=document.querySelector('#meetings-board-past');
		try{
			const data=await api('/api/operating-center/meetings/overview');
			let html='';
			for(const m of (data.external_meetings||[])){
				const badge=m.status==='confirmed'?'<span class="badge">'+esc(m.status)+'</span>':'<span class="badge-warn">'+esc(m.status)+'</span>';
				html+='<div class="item"><strong>'+esc(m.title)+badge+'</strong>'+
					'<div class="meta">'+esc(m.counterparty)+'</div>'+
					'<div class="detail"><b>When:</b> '+esc(m.display_when)+'</div>'+
					'<div class="detail"><b>Where:</b> '+esc(m.location)+'</div>'+
					'<div class="detail">'+esc(m.purpose)+'</div>'+
					(m.join_url?'<div class="detail"><b>Join:</b> <a href="'+esc(m.join_url)+'" target="_blank" rel="noopener">Open meeting link</a>'+(m.join_access?' · '+esc(m.join_access):'')+'</div>':'')+
					(m.next_step?'<div class="detail"><b>Next:</b> '+esc(m.next_step)+'</div>':'')+'</div>';
			}
			ext.innerHTML=html||'<div class="unavailable">No external meetings tracked.</div>';
			const up=data.board_upcoming||[];
			let upHtml='';
			for(const m of up){
				const label=m.status==='DRAFT'?'draft':(m.status==='OPEN'?'open':m.status.toLowerCase());
				upHtml+='<div class="item"><strong>'+esc(m.title)+'<span class="badge">'+esc(label)+'</span></strong>'+
					'<div class="detail"><b>When:</b> '+esc(m.scheduled_for||'Not scheduled')+'</div>'+
					'<div class="detail"><b>Agenda items:</b> '+esc(m.agenda_count)+'</div></div>';
			}
			bup.innerHTML=up.length?upHtml:'<div class="unavailable">No upcoming board meetings (draft or open).</div>';
			const past=data.board_past||[];
			let pastHtml='';
			for(const m of past){
				const minutes=m.minutes_present?'recorded':'not recorded';
				pastHtml+='<div class="item"><strong>'+esc(m.title)+'<span class="badge">done</span></strong>'+
					'<div class="detail"><b>Date:</b> '+esc(m.scheduled_for||String(m.closed_at||'').slice(0,10)||'Unknown')+'</div>'+
					'<div class="detail"><b>Minutes:</b> '+esc(minutes)+'</div>'+
					'<div class="detail"><b>Decisions:</b> '+esc(m.decision_count)+'</div></div>';
			}
			bpast.innerHTML=past.length?pastHtml:'<div class="unavailable">No board meetings recorded yet.</div>';
		}catch(err){
			ext.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
			bup.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
			bpast.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
		}
	}
`;

export function renderMeetingsHtml(): string {
	return ocScreenShell({
		page: "meetings",
		title: "Meetings",
		subtitle: "External meetings on the calendar and the board meeting log: what is confirmed, what is upcoming, what was decided.",
		panelsHtml: `<section class="panel">
			<h2>External meetings</h2>
			<div id="meetings-external-list">Loading…</div>
		</section>
		<section class="panel">
			<h2>Board meetings</h2>
			<h3>Upcoming</h3>
			<div id="meetings-board-upcoming">Loading…</div>
			<h3>Past</h3>
			<div id="meetings-board-past">Loading…</div>
		</section>`,
		script: MEETINGS_SCRIPT,
		reportId: "meetings",
	});
}

// ---------------------------------------------------------------------------
// Downloadable reports: self-contained, print-friendly HTML documents with
// the screen's current real data, the report date, and nothing internal
// (no owner keys, no internal notes, no email addresses).
// ---------------------------------------------------------------------------

function reportDoc(title: string, date: string, body: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)} — NWANA report ${escHtml(date)}</title>
<style>
	:root{color-scheme:light}
	*{box-sizing:border-box}
	body{margin:0;color:#17221d;font:15px/1.55 Georgia,serif;background:#fff}
	.cover{background:#183d2d;color:#fff;padding:40px clamp(24px,6vw,80px)}
	.cover h1{margin:0;font-size:30px}
	.cover p{margin:10px 0 0;color:#dce9e2;font-family:system-ui,sans-serif;font-size:14px}
	main{max-width:900px;margin:0 auto;padding:32px clamp(24px,6vw,80px) 60px}
	h2{font-size:20px;margin:28px 0 10px;border-bottom:2px solid #183d2d;padding-bottom:6px}
	h3{font-size:16px;margin:20px 0 8px}
	p{margin:8px 0}
	table{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}
	th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #dce4df;vertical-align:top}
	th{color:#66736d;font-family:system-ui,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
	.note{color:#66736d;font-size:13px;font-family:system-ui,sans-serif}
	.tag{display:inline-block;background:#e5efe9;color:#183d2d;border-radius:6px;padding:1px 8px;font-size:12px;font-family:system-ui,sans-serif;font-weight:700;margin-left:8px}
	.tag-warn{display:inline-block;background:#fbeedf;color:#b35400;border-radius:6px;padding:1px 8px;font-size:12px;font-family:system-ui,sans-serif;font-weight:700;margin-left:8px}
	.footer{margin-top:40px;padding-top:16px;border-top:1px solid #dce4df;color:#66736d;font-size:12px;font-family:system-ui,sans-serif}
	@media print{
		.cover{padding:28px 0}
		main{padding:24px 0 40px}
		a{color:#17221d;text-decoration:none}
	}
</style>
</head>
<body>
<div class="cover">
	<h1>${escHtml(title)}</h1>
	<p>Nordic Walking Association of North America (NWANA) — a 501(c)(3) nonprofit federation</p>
	<p>Report date: ${escHtml(date)} &nbsp;·&nbsp; Source: NWANA Operating Center</p>
</div>
<main>
${body}
<div class="footer">
	Generated by the NWANA machine. Figures are shown only where a source is connected or a fact is verified; everything else is marked as not connected or not yet tracked.
</div>
</main>
</body>
</html>`;
}

function reportDate(iso: string): string {
	return iso.slice(0, 10);
}

export function buildSitesReport(data: SitesOverview): string {
	const rows = data.sites
		.map((s) => `<tr><td><strong>${escHtml(s.name)}</strong><br><span class="note">${escHtml(s.url)}</span></td><td>${escHtml(s.description)}</td></tr>`)
		.join("");
	const body =
		`<h2>Web properties</h2>` +
		`<table><thead><tr><th>Property</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>` +
		`<h2>Traffic statistics</h2>` +
		`<p><span class="tag-warn">Analytics not connected</span></p><p>${escHtml(data.analytics.note)}</p>`;
	return reportDoc("NWANA web properties", reportDate(data.generated_at), body);
}

export function buildSocialReport(data: SocialOverview): string {
	let body = `<h2>Accounts</h2>`;
	for (const a of data.accounts) {
		body += `<h3>${escHtml(a.platform)} — ${escHtml(a.handle)}</h3>`;
		body += `<p><span class="tag">${escHtml(a.status)}</span></p>`;
		if (a.url) body += `<p class="note">${escHtml(a.url)}</p>`;
		if (a.stats && a.stats.length) {
			body += `<table><tbody>${a.stats.map((s) => `<tr><th>${escHtml(s.label)}</th><td>${escHtml(s.value)}</td></tr>`).join("")}</tbody></table>`;
		} else {
			body += `<p class="note">No verified statistics recorded for this account.</p>`;
		}
		body += `<p>${escHtml(a.note)}</p>`;
	}
	return reportDoc("NWANA social accounts", reportDate(data.generated_at), body);
}

export function buildAdsReport(data: AdsOverview): string {
	const ads = data.google_ads;
	const live = data.live_account;
	let body = `<h2>Connection status</h2>`;
	if (ads.connected) {
		body += `<p><strong>Google Ads</strong> <span class="tag">Connected</span></p><p>${escHtml(ads.note)}</p>`;
	} else {
		body += `<p><strong>Google Ads</strong> <span class="tag-warn">Not connected</span></p><p>${escHtml(ads.note)}</p>`;
	}
	body += `<p>Access level: ${escHtml(ads.access_level)}${ads.customers.length ? `; accounts: ${escHtml(ads.customers.join(", "))}` : ""}</p>`;
	body += `<p>Campaign creation/mutation: ${ads.execution_allowed ? "enabled" : "disabled"}</p>`;
	if (ads.error) {
		body += `<p>Error: ${escHtml(ads.error)}</p>`;
	}
	if (live.available) {
		body += `<h2>LIVE GOOGLE ADS ACCOUNT</h2>`;
		body += `<p class="note">Real data from account ${escHtml(live.customer_id)}, ${escHtml(live.date_range)}. Read-only; the machine never changes campaigns.</p>`;
		if (live.error) {
			body += `<p><strong>Account data</strong> <span class="tag-warn">Read error</span></p><p>Could not read account data: ${escHtml(live.error)}</p>`;
		} else if (live.campaigns.length === 0) {
			body += `<p>No campaigns found in the connected Google Ads account.</p>`;
		} else {
			body += `<table><thead><tr><th>Campaign</th><th>Status</th><th>Budget/day</th><th>Impr.</th><th>Clicks</th><th>Conv.</th><th>Spend</th></tr></thead><tbody>`;
			for (const c of live.campaigns) {
				body += `<tr><td><strong>${escHtml(c.name)}</strong></td>` +
					`<td><span class="${c.status === "ENABLED" ? "tag" : "tag-warn"}">${escHtml(c.status)}</span></td>` +
					`<td>$${c.daily_budget_usd.toFixed(2)}</td>` +
					`<td>${escHtml(c.impressions)}</td>` +
					`<td>${escHtml(c.clicks)}</td>` +
					`<td>${escHtml(c.conversions)}</td>` +
					`<td>$${c.cost_usd.toFixed(2)}</td></tr>`;
			}
			body += `</tbody></table>`;
		}
	}
	body += `<p><strong>Google Analytics</strong> <span class="tag-warn">Not set up</span></p><p>${escHtml(data.google_analytics.note)}</p>`;
	body += `<h2>ORCHESTRATION DECISIONS</h2>`;
	body += `<p class="note">What the machine decided for every known source: required result, candidate action, channel. Sources with no evidence stay undecided; incomplete evidence is reported, never guessed. Read-only.</p>`;
	for (const d of data.orchestration) {
		body += `<h3>${escHtml(d.source_identity)} <span class="${d.state === "DECIDED" ? "tag" : "tag-warn"}">${escHtml(d.state)}</span></h3>`;
		body += `<p>Decision ID: ${escHtml(d.decision_id)}</p>`;
		body += `<p>Source: ${escHtml(d.source_kind)}${d.purpose ? `; purpose: ${escHtml(d.purpose)}` : ""}</p>`;
		if (d.required_result) {
			body += `<p>Required result: ${escHtml(d.required_result)}</p>`;
		}
		if (d.candidate_action) {
			body += `<p>Candidate action: ${escHtml(d.candidate_action)}</p>`;
		}
		body += `<p>Channel: ${d.channel ? escHtml(d.channel) : "none"}${d.priority != null ? `; priority: ${d.priority}` : ""}</p>`;
		if (d.evidence.length > 0) {
			body += `<p>Evidence: ${d.evidence.map((e: { kind: string; reference: string }) => `${escHtml(e.kind)} ${escHtml(e.reference)}`).join("; ")}</p>`;
		}
		if (d.missing_decision_input.length > 0) {
			body += `<p>Missing decision input: ${d.missing_decision_input.map(escHtml).join("; ")}</p>`;
		}
		if (d.channel_intent_id) {
			body += `<p>Channel intent: ${escHtml(d.channel_intent_id)}</p>`;
		}
		if (d.downstream) {
			body += `<p>Downstream (${escHtml(d.downstream.consumer)}): ${escHtml(d.downstream.state)}</p>`;
		}
		if (d.execution_mode) {
			body += `<p>Execution mode: ${escHtml(d.execution_mode)}</p>`;
		}
		body += `<p>${escHtml(d.factual_reason)}</p>`;
	}
	body += `<h2>MACHINE PROPOSALS</h2>`;
	body += `<p class="note">What the machine proposes to create. Campaign creation is disabled; the owner reviews every proposal before anything is created.</p>`;
	for (const p of data.machine_proposals) {
		body += `<h3>${escHtml(p.name ?? "(unnamed proposal)")} <span class="${p.state === "PROPOSED" ? "tag" : "tag-warn"}">${escHtml(p.state)}</span></h3>`;
		body += `<p>Proposal ID: ${escHtml(p.proposal_id)}</p>`;
		body += `<p>Daily budget: ${p.daily_budget != null ? "$" + p.daily_budget.toFixed(2) : "n/a"}; target URL: ${p.target_url ? escHtml(p.target_url) : "none"}</p>`;
		body += `<p>Origin: ${p.origin ? escHtml(p.origin) : "unknown"}; source: ${escHtml(p.source_kind)} / ${escHtml(p.source_identity)}</p>`;
		if (p.source_object) {
			let label = `Source object: ${escHtml(p.source_object.object_id)}`;
			if (p.source_object.object_type) {
				label += ` (${escHtml(p.source_object.object_type)})`;
			}
			if (p.source_object.title) {
				label += ` - ${escHtml(p.source_object.title)}`;
			}
			body += `<p>${label}</p>`;
		} else {
			body += `<p>Source object: not yet linked</p>`;
		}
		body += `<p>Purpose: ${escHtml(p.purpose)}</p>`;
		body += `<p>Distribution rule: ${p.distribution.rule_id ? escHtml(p.distribution.rule_id) : "none"}</p>`;
		body += `<p>Distribution action: ${p.distribution.action_id ? escHtml(p.distribution.action_id) : "none"}</p>`;
		body += `<p>Channel: ${p.distribution.channel ? escHtml(p.distribution.channel) : "none"}</p>`;
		body += `<p>Creation eligibility: ${p.creation_eligible ? "eligible" : "not eligible"}</p>`;
		if (p.conflict) {
			body += `<p>Live conflict: ${escHtml(p.conflict.live_campaign_name)} (${p.conflict.via === "VERIFIED_MAPPING" ? "verified mapping" : "exact name"})</p>`;
		}
		if (p.missing_fields.length > 0) {
			body += `<p>Missing fields: ${p.missing_fields.map(escHtml).join(", ")}</p>`;
		}
		for (const g of p.ad_groups) {
			const kws = g.keywords.map((k) => `${escHtml(k.text)} (${escHtml(k.match_type)})`).join(", ");
			body += `<p><strong>${escHtml(g.name)}:</strong> max CPC $${g.default_cpc.toFixed(2)}, ${g.ads_count} ads<br>Keywords: ${kws}</p>`;
		}
		if (p.policy_violations.length === 0) {
			body += `<p>Ad Grants policy: PASS</p>`;
		} else {
			body += `<p>Ad Grants policy violations: ${p.policy_violations.map(escHtml).join("; ")}</p>`;
		}
		body += `<p>Next action: ${escHtml(p.next_action)}</p>`;
	}
	body += `<h2>What this report shows today</h2><ul>${data.capabilities.map((w) => `<li>${escHtml(w)}</li>`).join("")}</ul>`;
	return reportDoc("NWANA advertising and analytics", reportDate(data.generated_at), body);
}

export function buildSellersReport(data: SellersOverview): string {
	let body = `<h2>Seller pipeline</h2>`;
	body += `<table><thead><tr><th>Company</th><th>Contact</th><th>Stage</th><th>Next step</th></tr></thead><tbody>`;
	for (const s of data.sellers) {
		// External-safe: email addresses never leave the building.
		const contact = s.contact.includes("@") ? s.role : `${s.contact} (${s.role})`;
		body += `<tr><td><strong>${escHtml(s.company)}</strong></td><td>${escHtml(contact)}</td><td>${escHtml(s.stage)}<br><span class="note">${escHtml(s.last_event_date)}</span></td><td>${escHtml(s.next_step)}${s.next_date ? `<br><span class="note">${escHtml(s.next_date)}</span>` : ""}</td></tr>`;
	}
	body += `</tbody></table>`;
	body += `<h2>Answers for an incoming seller (asked 2026-09-22)</h2>`;
	for (const a of data.zubie_five_answers) {
		body += `<h3>${escHtml(a.question)}</h3><p>${escHtml(a.answer)}</p>`;
	}
	return reportDoc("NWANA seller pipeline", reportDate(data.generated_at), body);
}

export function buildPartnersReport(data: PartnersOverview): string {
	let body = `<h2>Partnerships</h2>`;
	if (data.partners.length) {
		body += `<table><thead><tr><th>Partner</th><th>Proposal</th><th>Stage</th></tr></thead><tbody>`;
		for (const p of data.partners) {
			body += `<tr><td><strong>${escHtml(p.name)}</strong><br><span class="note">${escHtml(p.last_event_date)}</span></td><td>${escHtml(p.subject)}<br><span class="note">${escHtml(p.last_event)}</span></td><td>${escHtml(p.stage)}</td></tr>`;
		}
		body += `</tbody></table>`;
	} else {
		body += `<p class="note">No partner records yet.</p>`;
	}
	body += `<p class="note">${escHtml(data.note)}</p>`;
	return reportDoc("NWANA partnerships", reportDate(data.generated_at), body);
}

export function buildFundraisingReport(data: { generated_at: string; fund: null | {
	name: string; description: string | null; goal_amount: number; raised_amount: number;
	currency: string; status: string; stage_counts: Record<string, number>;
	follow_ups_due_now: number; prospect_count: number; tiers: Record<string, number>;
	follow_up_calendar: { due: string; overdue: string; note: string };
	prospects: Array<{ name: string; ask_tier: string; ask_amount: number; stage: string; sent_at: string | null; subject: string; follow_up_due_at: string | null; follow_up_status: string }>;
} }): string {
	const f = data.fund;
	let body: string;
	if (!f) {
		body = `<p class="note">No fund objects yet.</p>`;
	} else {
		body = `<h2>${escHtml(f.name)}</h2>`;
		body += `<p>${escHtml(f.description ?? "")}</p>`;
		body += `<table><tbody>`;
		body += `<tr><th>Goal</th><td>$${escHtml(f.goal_amount)} ${escHtml(f.currency)}</td></tr>`;
		body += `<tr><th>Raised</th><td>$${escHtml(f.raised_amount)} ${escHtml(f.currency)}</td></tr>`;
		body += `<tr><th>Status</th><td>${escHtml(f.status)}</td></tr>`;
		body += `<tr><th>Prospects</th><td>${escHtml(f.prospect_count)}</td></tr>`;
		body += `<tr><th>Follow-ups due now</th><td>${escHtml(f.follow_ups_due_now)}</td></tr>`;
		body += `<tr><th>Follow-up window</th><td>Due ${escHtml(f.follow_up_calendar.due)}, overdue ${escHtml(f.follow_up_calendar.overdue)}</td></tr>`;
		body += `</tbody></table>`;
		body += `<h2>Pipeline by stage</h2>`;
		body += `<table><thead><tr><th>Stage</th><th>Count</th></tr></thead><tbody>`;
		for (const [stage, n] of Object.entries(f.stage_counts)) {
			if (n > 0) body += `<tr><td>${escHtml(stage)}</td><td>${escHtml(n)}</td></tr>`;
		}
		body += `</tbody></table>`;
		body += `<h2>Founding tiers</h2><ul>${Object.entries(f.tiers).map(([t, n]) => `<li>${escHtml(t)} — ${escHtml(n)} prospects</li>`).join("")}</ul>`;
		body += `<h2>Prospects</h2>`;
		body += `<table><thead><tr><th>Name</th><th>Tier</th><th>Asked</th><th>Stage</th><th>Sent</th></tr></thead><tbody>`;
		for (const p of f.prospects) {
			body += `<tr><td>${escHtml(p.name)}</td><td>${escHtml(p.ask_tier)}</td><td>$${escHtml(p.ask_amount)}</td><td>${escHtml(p.stage)}</td><td>${p.sent_at ? escHtml(p.sent_at.slice(0, 10)) : "—"}</td></tr>`;
		}
		body += `</tbody></table>`;
	}
	return reportDoc("NWANA fundraising", reportDate(data.generated_at), body);
}

export function buildGroupsReport(data: GroupsOverview): string {
	let body = `<h2>How groups scale the federation</h2>`;
	for (const s of data.ladder) {
		body += `<h3>${escHtml(s.step)}</h3><p>${escHtml(s.description)}</p>`;
	}
	body += `<h2>Public funnel</h2>`;
	body += `<p>${escHtml(data.funnel.member_org)}<br>${escHtml(data.funnel.register)}</p>`;
	body += `<h2>Group statistics</h2>`;
	body += `<p><span class="tag-warn">Not yet tracked</span></p><p>${escHtml(data.stats.note)}</p>`;
	return reportDoc("NWANA group network", reportDate(data.generated_at), body);
}

export function buildMeetingsReport(data: MeetingsOverview): string {
	// External-safe by construction: join_url and join_access are never
	// rendered here (they stay on the owner-gated screen only). Meeting
	// minutes content stays in the board workspace; only recorded/absent
	// is reported.
	let body = `<h2>External meetings</h2>`;
	body += `<table><thead><tr><th>Meeting</th><th>When</th><th>Where</th><th>Status</th></tr></thead><tbody>`;
	for (const m of data.external_meetings) {
		body += `<tr><td><strong>${escHtml(m.title)}</strong><br><span class="note">${escHtml(m.counterparty)}</span></td>` +
			`<td>${escHtml(m.display_when)}</td>` +
			`<td>${escHtml(m.location)}</td>` +
			`<td><span class="${m.status === "confirmed" ? "tag" : "tag-warn"}">${escHtml(m.status)}</span><br><span class="note">${escHtml(m.purpose)}</span>` +
			(m.next_step ? `<br><span class="note">Next: ${escHtml(m.next_step)}</span>` : "") + `</td></tr>`;
	}
	body += `</tbody></table>`;
	body += `<p class="note">Meeting links, IDs, and passcodes never leave the operating center; they are shown on the owner-gated screen only.</p>`;
	body += `<h2>Board meetings</h2>`;
	if (!data.board_upcoming.length && !data.board_past.length) {
		body += `<p class="note">No board meetings recorded yet.</p>`;
	} else {
		if (data.board_upcoming.length) {
			body += `<h3>Upcoming (draft or open)</h3>`;
			body += `<table><thead><tr><th>Meeting</th><th>When</th><th>Status</th><th>Agenda items</th></tr></thead><tbody>`;
			for (const m of data.board_upcoming) {
				body += `<tr><td><strong>${escHtml(m.title)}</strong></td>` +
					`<td>${m.scheduled_for ? escHtml(m.scheduled_for) : "Not scheduled"}</td>` +
					`<td>${escHtml(boardStatusLabel(m.status))}</td>` +
					`<td>${escHtml(m.agenda_count)}</td></tr>`;
			}
			body += `</tbody></table>`;
		}
		if (data.board_past.length) {
			body += `<h3>Past (closed)</h3>`;
			body += `<table><thead><tr><th>Meeting</th><th>Date</th><th>Minutes</th><th>Decisions</th></tr></thead><tbody>`;
			for (const m of data.board_past) {
				const date = m.scheduled_for ?? (m.closed_at ? m.closed_at.slice(0, 10) : "Unknown");
				body += `<tr><td><strong>${escHtml(m.title)}</strong></td>` +
					`<td>${escHtml(date)}</td>` +
					`<td>${m.minutes_present ? "recorded" : "not recorded"}</td>` +
					`<td>${escHtml(m.decision_count)}</td></tr>`;
			}
			body += `</tbody></table>`;
		}
	}
	return reportDoc("NWANA meetings", reportDate(data.generated_at), body);
}
