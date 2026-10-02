// Platform Admin — Organizations (multi-tenant entry) (2026-10-02).
//
// Moved from the NWANA Operating Center to Platform Admin (/admin).
// Three levels, one reusable path:
//   /admin/organizations                      -> tenant list
//   /admin/organizations/<tenant_id>          -> tenant + units
//   /admin/organizations/<tenant_id>/<unit>   -> business-unit screen
//
// Investor/demo preview controls (ADR-0048 "Preview Portal" / "Preview as
// client") were removed from this UI per owner decision: demos live in the
// dedicated demo workspace, not inside platform administration.
//
// Every level is a thin shell: the server renders identity + containers,
// the client loads data from the tenant-scoped API. Unknown values render
// as UNKNOWN / NOT CONNECTED / NOT OPERATING — never simulated.
//
// Cost rule: UI only — no new services, no new runtime cost ($0).

import { platformAdminMenu } from "./oc-admin";
import { ocSectionShell } from "./oc-shell";
import { UNIT_BODY_SCRIPT } from "./oc-unit-body";

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
	function getKey(){try{return sessionStorage.getItem('nwana_engine_session')||''}catch(e){return ''}}
	function signOut(){try{sessionStorage.removeItem('nwana_engine_session')}catch(e){}window.location.href='/login'}
	async function api(path){
		if(!getKey())signOut();
		var r=await fetch(path,{headers:{authorization:'Bearer '+getKey()}});
		var d=null;try{d=await r.json()}catch(e){}
		if(r.status===401){signOut();throw new Error('Unauthorized — signed out.')}
		if(!r.ok)throw new Error((d&&d.error)||('Request failed: '+r.status));
		return d;
	}
	function esc(v){return String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
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
				'<p><a class="oc-menu-btn" href="/admin/organizations/'+esc(t.tenant_id)+'">Open '+esc(t.display_name)+'</a></p></div>';
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
			'<p class="meta"><a href="/admin/organizations">← All organizations</a></p></section>';
		var cards=(t.business_units||[]).map(function(u){
			return '<div class="panel"><h2>'+esc(u.name)+'</h2>'+
				'<p>'+statusBadge(u.operating_status)+
				' <span class="badge">'+esc(u.unit_type)+'</span>'+
				' <span class="badge">'+esc(u.legal_entity_status)+'</span></p>'+
				'<p class="detail"><b>Revenue model:</b> '+esc(u.revenue_model||'UNKNOWN')+'</p>'+
				'<p class="detail"><b>Connected assets:</b> '+(u.connected_assets&&u.connected_assets.length?esc(u.connected_assets.length)+' linked object(s)':'none')+'</p>'+
				'<p><a class="oc-menu-btn" href="/admin/organizations/'+esc(t.tenant_id)+'/'+esc(u.business_unit_id)+'">Open unit</a></p></div>';
		}).join('');
		setHtml(head+'<div class="grid">'+cards+'</div>');
	}

	async function bootUnit(){
		var d=await api('/api/operating-center/tenants/'+encodeURIComponent(tenantId)+'/units/'+encodeURIComponent(unitId));
		var u=d.unit;
		var R=window.__unitRender;
		var links=(window.__ORG_DEEP_LINKS&&window.__ORG_DEEP_LINKS[u.business_unit_id])||[];
		setHtml(
		R.body(u,{
			links:links,
			backHtml:'<p class="meta"><a href="/admin/organizations/'+R.esc(u.tenant_id)+'">← '+R.esc(u.tenant_id)+'</a></p>',
			tenantLine:'<p class="detail"><b>Unit ID:</b> '+R.esc(u.business_unit_id)+' · <b>Tenant:</b> '+R.esc(u.tenant_id)+'</p>',
			engineEmpty:true
		}));
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
	// Preview-as-tenant controls (ADR-0048) were removed from this UI
	// (2026-10-02): investor/demo presentation lives in the dedicated demo
	// workspace, not inside platform administration.
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
		`<script>${UNIT_BODY_SCRIPT}</script>` +
		`<script>window.__ORG_DEEP_LINKS=${JSON.stringify(BU_DEEP_LINKS)};</script>` +
		`<script>${ORG_SCRIPT}</script>`;
	// The shell renders #app hidden until the owner key gate passes; the
	// script above boots on #app visibility via MutationObserver, reading
	// data-org-level / data-tenant / data-unit from #app itself (attributes
	// are injected by the render* functions below via string replace on the
	// shell's exact `<div id="app" hidden>` markup).
	return ocSectionShell({
		section: "organizations",
		menuHtml: platformAdminMenu("organizations"),
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
