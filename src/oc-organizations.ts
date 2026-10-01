// Operating Center — Organizations (multi-tenant entry).
//
// Three levels, one reusable path:
//   /operating-center/organizations                      -> tenant list
//   /operating-center/organizations/<tenant_id>          -> tenant + units
//   /operating-center/organizations/<tenant_id>/<unit>   -> business-unit screen
//
// Every level is a thin shell: the server renders identity + containers,
// the client loads data from the tenant-scoped API. Unknown values render
// as UNKNOWN / NOT CONNECTED / NOT OPERATING — never simulated.
//
// Cost rule: UI only — no new services, no new runtime cost ($0).

import { ocSectionShell } from "./oc-shell";

/** Deep links from a NWANA business unit into existing Engine functions. */
const BU_DEEP_LINKS: Record<string, Array<{ label: string; href: string }>> = {
	"nwana-governing": [
		{ label: "Executive money view (Funds)", href: "/operating-center/growth?tab=funds&view=summary" },
		{ label: "Revenue inventory", href: "/operating-center/growth?tab=fundraising&view=summary" },
		{ label: "Google Ads — Founding Circle", href: "/operating-center/marketing?tab=ads&view=summary" },
	],
	"nwana-academy": [{ label: "Academy section", href: "/operating-center/academy" }],
	"nwana-engine-tech": [{ label: "Operations — system", href: "/operating-center/operations" }],
	"nwana-league": [
		{ label: "Sport — results & series", href: "/operating-center/sport" },
		{ label: "Groups", href: "/operating-center/sport#groups" },
	],
	"nwana-sales": [
		{ label: "Growth — sponsorship", href: "/operating-center/growth?tab=sponsorship&view=summary" },
		{ label: "Growth — partners", href: "/operating-center/growth?tab=partners&view=summary" },
	],
	"nwana-marketplace": [],
};

const ORG_SCRIPT = `
(function(){
	var app=document.querySelector('#app');
	var level=app.getAttribute('data-org-level')||'tenants';
	var tenantId=app.getAttribute('data-tenant')||'';
	var unitId=app.getAttribute('data-unit')||'';
	var booted=false;
	function getKey(){try{return localStorage.getItem('nwana_operating_center_key')||''}catch(e){return ''}}
	async function api(path){
		var r=await fetch(path,{headers:{authorization:'Bearer '+getKey()}});
		var d=null;try{d=await r.json()}catch(e){}
		if(r.status===401)throw new Error('Unauthorized — enter the owner key.');
		if(!r.ok)throw new Error((d&&d.error)||('Request failed: '+r.status));
		return d;
	}
	function esc(v){return String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
	function moneyCents(n){
		if(n===null||n===undefined)return '<span class="unavailable">UNKNOWN</span>';
		return '$'+(Number(n)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
	}
	function badge(text,kind){
		var cls=kind==='ok'?'badge-ok':(kind==='warn'?'badge-warn':'badge');
		return '<span class="'+cls+'">'+esc(text)+'</span>';
	}
	function statusBadge(s){
		if(s==='operating')return badge('OPERATING','ok');
		if(s==='pilot')return badge('PILOT','warn');
		if(s==='not_operating')return badge('NOT OPERATING','');
		return badge('UNKNOWN','');
	}
	function errHtml(e){
		return '<section class="panel"><h2>Could not load</h2><p class="unavailable">'+esc(e&&e.message||e)+'</p></section>';
	}
	function setHtml(html){document.querySelector('#org-body').innerHTML=html}

	async function bootTenants(){
		var d=await api('/api/operating-center/tenants');
		var cards=(d.tenants||[]).map(function(t){
			var demo=t.status==='demo';
			return '<div class="panel"><h2>'+esc(t.display_name)+'</h2>'+
				'<p class="meta">'+esc(t.legal_name)+'</p>'+
				'<p><span class="detail"><b>Sport / domain:</b> '+esc(t.sport_domain||'UNKNOWN')+'</span> '+
				(statusBadge(t.status==='active'?'operating':(t.status==='demo'?'pilot':'not_operating')))+
				(demo?' '+badge('DEMO TENANT','warn'):'')+'</p>'+
				'<p class="detail"><b>Business units:</b> '+esc(t.business_unit_count)+
				' · <b>License:</b> '+esc(t.plan_license_status)+
				(demo?' · configuration proof only — not a production customer':'')+'</p>'+
				'<p><a class="oc-menu-btn" href="/operating-center/organizations/'+esc(t.tenant_id)+'">Open '+esc(t.display_name)+'</a></p></div>';
		}).join('');
		setHtml(cards||'<section class="panel"><p class="unavailable">No tenants.</p></section>');
	}

	async function bootTenant(){
		var d=await api('/api/operating-center/tenants/'+encodeURIComponent(tenantId));
		var t=d.tenant;
		var demo=t.status==='demo';
		var head='<section class="panel"><h2>'+esc(t.display_name)+'</h2>'+
			'<p class="meta">'+esc(t.legal_name)+' · '+esc(t.organization_type)+'</p>'+
			'<p><span class="detail"><b>Sport / domain:</b> '+esc(t.sport_domain||'UNKNOWN')+'</span> '+
			(demo?badge('DEMO TENANT','warn'):badge(t.status.toUpperCase(),'ok'))+'</p>'+
			'<p class="detail"><b>License:</b> '+esc(t.plan_license_status)+
			(t.license_start?' · from '+esc(t.license_start):'')+(t.license_end?' to '+esc(t.license_end):'')+
			' · <b>Billing:</b> '+esc(t.billing_model||'none')+
			' · <b>White-label:</b> '+(t.white_label?'yes':'no')+'</p>'+
			'<p class="detail"><b>Enabled modules:</b> '+((t.enabled_modules||[]).map(esc).join(', ')||'UNKNOWN')+'</p>'+
			'<p class="detail"><b>External systems:</b> '+((t.external_systems||[]).map(function(x){return esc(x.integration)+' ('+esc(x.status)+')'}).join(', ')||'NOT CONNECTED')+'</p>'+
			'<p class="meta"><a href="/operating-center/organizations">← All organizations</a></p></section>';
		var cards=(t.business_units||[]).map(function(u){
			return '<div class="panel"><h2>'+esc(u.name)+'</h2>'+
				'<p>'+statusBadge(u.operating_status)+
				' <span class="badge">'+esc(u.unit_type)+'</span>'+
				' <span class="badge">'+esc(u.legal_entity_status)+'</span></p>'+
				'<p class="detail"><b>Revenue model:</b> '+esc(u.revenue_model||'UNKNOWN')+'</p>'+
				'<p class="detail"><b>Connected assets:</b> '+(u.connected_assets&&u.connected_assets.length?esc(u.connected_assets.length)+' linked object(s)':'none')+'</p>'+
				'<p><a class="oc-menu-btn" href="/operating-center/organizations/'+esc(t.tenant_id)+'/'+esc(u.business_unit_id)+'">Open unit</a></p></div>';
		}).join('');
		setHtml(head+'<div class="grid">'+cards+'</div>');
	}

	function assetRow(a){
		var m=a.money;
		return '<div class="item"><strong>'+esc(a.name)+'</strong>'+
			'<span class="badge">'+esc(a.object_type)+'</span> '+badge(String(a.active_status||'unknown').toUpperCase(), a.active_status==='active'?'ok':'')+
			'<div class="detail"><b>Money:</b> '+(m?('gross '+moneyCents(m.gross_cents)+' · '+esc(m.transaction_count)+' transaction(s) · net '+moneyCents(m.net_cents)):'<span class="unavailable">UNKNOWN — no money truth linked</span>')+'</div>'+
			(a.next_revenue_action?'<div class="detail"><b>Next action:</b> '+esc(a.next_revenue_action)+' ('+esc(a.action_status)+')</div>':'')+
			'</div>';
	}

	async function bootUnit(){
		var d=await api('/api/operating-center/tenants/'+encodeURIComponent(tenantId)+'/units/'+encodeURIComponent(unitId));
		var u=d.unit;
		var links=(window.__ORG_DEEP_LINKS&&window.__ORG_DEEP_LINKS[u.business_unit_id])||[];
		var money=u.money;
		var moneyHtml='<div class="stats">'+
			'<div class="stat"><strong>'+moneyCents(money&&money.gross_cents)+'</strong><span>Gross (verified)</span></div>'+
			'<div class="stat"><strong>'+(money?esc(money.transaction_count):'<span class="unavailable">?</span>')+'</strong><span>Transactions</span></div>'+
			'<div class="stat"><strong>'+moneyCents(money&&money.revenue_30d_cents)+'</strong><span>Last 30 days</span></div>'+
			'<div class="stat"><strong>'+moneyCents(money&&money.revenue_90d_cents)+'</strong><span>Last 90 days</span></div></div>'+
			'<p class="meta">Net: '+(money&&money.net_cents!==null&&money.net_cents!==undefined?moneyCents(money.net_cents):'UNKNOWN — no settlement truth in the source (never zero-filled)')+'. '+
			'Derived at read time from canonical money truth; nothing is stored per business unit.</p>';
		if(!money)moneyHtml='<section class="panel"><h2>Money / revenue</h2><p class="unavailable">UNKNOWN — no linked assets carry money truth. No synthetic revenue is shown.</p></section>';
		else moneyHtml='<section class="panel"><h2>Money / revenue</h2>'+moneyHtml+'</section>';

		var audienceHtml=u.audience
			?'<section class="panel"><h2>Audience</h2><p><strong>'+esc(u.audience.label)+':</strong> '+esc(u.audience.value)+'</p><p class="meta">Source: '+esc(u.audience.source)+'</p></section>'
			:'<section class="panel"><h2>Audience</h2><p class="unavailable">UNKNOWN — no connected audience source for this unit.</p></section>';

		var integ=(u.connected_integrations||[]).map(function(x){
			return '<div class="item"><strong>'+esc(x.integration)+'</strong> '+badge(String(x.status).toUpperCase(), x.status==='connected'?'ok':'warn')+(x.note?'<div class="meta">'+esc(x.note)+'</div>':'')+'</div>';
		}).join('');
		var integHtml='<section class="panel"><h2>Integrations</h2>'+(integ||'<p class="unavailable">NOT CONNECTED — no integrations linked to this unit.</p>')+'</section>';

		var actions=(u.next_actions||[]).map(function(a){return '<div class="item">'+esc(a)+'</div>'}).join('');
		var actionsHtml='<section class="panel"><h2>Next actions</h2>'+(actions||'<p class="unavailable">No recorded next actions.</p>')+'</section>';

		var linksHtml=links.length
			?'<section class="panel"><h2>Engine functions</h2>'+links.map(function(l){return '<p><a class="oc-menu-btn" href="'+esc(l.href)+'">'+esc(l.label)+'</a></p>'}).join('')+'</section>'
			:'<section class="panel"><h2>Engine functions</h2><p class="unavailable">No Engine functions linked yet — this unit is not operating.</p></section>';

		setHtml(
			'<section class="panel"><p class="meta"><a href="/operating-center/organizations/'+esc(u.tenant_id)+'">← '+esc(u.tenant_id)+'</a></p>'+
			'<h2>'+esc(u.name)+'</h2>'+
			'<p>'+statusBadge(u.operating_status)+' <span class="badge">'+esc(u.unit_type)+'</span> <span class="badge">'+esc(u.legal_entity_status)+'</span></p>'+
			'<p class="detail"><b>Unit ID:</b> '+esc(u.business_unit_id)+' · <b>Tenant:</b> '+esc(u.tenant_id)+'</p>'+
			'<p class="detail"><b>Revenue model:</b> '+esc(u.revenue_model||'UNKNOWN')+'</p>'+
			(u.owner_legal_ref?'<p class="detail"><b>Legal entity:</b> '+esc(u.owner_legal_ref)+'</p>':'')+
			'</section>'+
			'<section class="panel"><h2>Assets</h2>'+((u.assets||[]).map(assetRow).join('')||'<p class="unavailable">No connected assets — nothing linked to this unit yet.</p>')+'</section>'+
			moneyHtml+audienceHtml+integHtml+actionsHtml+linksHtml
		);
	}

	async function boot(){
		if(booted)return;booted=true;
		if(!getKey())return;
		try{
			if(level==='tenants')await bootTenants();
			else if(level==='tenant')await bootTenant();
			else if(level==='unit')await bootUnit();
		}catch(e){setHtml(errHtml(e))}
	}
	function visible(){return app&&!app.hidden}
	if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){if(visible())boot()});
	else if(visible())boot();
	try{new MutationObserver(function(){if(visible())boot()}).observe(app,{attributes:true,attributeFilter:['hidden']})}catch(e){}
})();
`;

function orgShell(opts: {
	level: "tenants" | "tenant" | "unit";
	title: string;
	subtitle: string;
	tenantId?: string;
	unitId?: string;
}): string {
	const bodyHtml =
		`<div id="org-body"><section class="panel"><p class="unavailable">Loading…</p></section></div>` +
		`<script>window.__ORG_DEEP_LINKS=${JSON.stringify(BU_DEEP_LINKS)};</script>` +
		`<script>${ORG_SCRIPT}</script>`;
	// The shell renders #app hidden until the owner key gate passes; the
	// script above boots on #app visibility via MutationObserver, reading
	// data-org-level / data-tenant / data-unit from #app itself (attributes
	// are injected by the render* functions below via string replace on the
	// shell's exact `<div id="app" hidden>` markup).
	return ocSectionShell({
		section: "organizations",
		title: opts.title,
		subtitle: opts.subtitle,
		tabs: [],
		bodyHtml,
	});
}

/**
 * The shell's exact `#app` markup is `<div id="app" hidden>`; the three
 * renderers below inject the data attributes the client script needs.
 */
export function renderOrganizationsSectionHtml(): string {
	return orgShell({
		level: "tenants",
		title: "Organizations",
		subtitle: "Tenants of the NWANA Engine platform — NWANA is the first live tenant.",
	}).replace(
		'<div id="app" hidden>',
		'<div id="app" hidden data-org-level="tenants">',
	);
}

export function renderTenantSectionHtml(tenantId: string): string {
	return orgShell({
		level: "tenant",
		title: "Organization",
		subtitle: "Tenant detail and its business units.",
		tenantId,
	}).replace(
		'<div id="app" hidden>',
		`<div id="app" hidden data-org-level="tenant" data-tenant="${tenantId.replace(/["']/g, "")}">`,
	);
}

export function renderBusinessUnitSectionHtml(tenantId: string, unitId: string): string {
	return orgShell({
		level: "unit",
		title: "Business Unit",
		subtitle: "Unit identity, status, assets, money, audience, integrations, next actions.",
		tenantId,
		unitId,
	}).replace(
		'<div id="app" hidden>',
		`<div id="app" hidden data-org-level="unit" data-tenant="${tenantId.replace(/["']/g, "")}" data-unit="${unitId.replace(/["']/g, "")}">`,
	);
}
