// Tenant portal (ADR-0047: role-based tenant navigation).
//
// Tenant users sign in with a scoped access token — never the owner key.
// The portal has NO Operating Center menu and NO Organizations directory:
// after sign-in a tenant user lands directly inside their permitted
// business unit(s):
//   /portal                -> one unit: redirect straight into it;
//                             several: picker showing only their units;
//                             none: honest empty state
//   /portal/unit/<unit_id> -> the business-unit screen (shared renderer
//                             with the OC Organizations section, minus
//                             admin-only parts: no tenant ids, no
//                             Organizations back link, no Engine deep links)
//
// Tenant IDs and other internal terms never appear in portal markup or
// API responses — the tenant is resolved server-side from the token.

import { ocBareShell } from "./oc-shell";
import { UNIT_BODY_SCRIPT } from "./oc-unit-body";

const PORTAL_SCRIPT = `
(function(){
	var app=document.querySelector('#app');
	var mode=app.getAttribute('data-portal')||'landing';
	var unitId=app.getAttribute('data-unit')||'';
	var booted=false;
	function getKey(){try{return localStorage.getItem('nwana_portal_key')||''}catch(e){return ''}}
	function clearKey(){try{localStorage.removeItem('nwana_portal_key')}catch(e){}}
	async function papi(path){
		var r=await fetch(path,{headers:{authorization:'Bearer '+getKey()}});
		var d=null;try{d=await r.json()}catch(e){}
		if(r.status===401)throw new Error('__unauthorized__');
		if(!r.ok)throw new Error((d&&d.error)||('Request failed: '+r.status));
		return d;
	}
	var R=window.__unitRender;
	function setHtml(html){document.querySelector('#portal-body').innerHTML=html}
	function errHtml(e){return '<section class="panel"><h2>Could not load</h2><p class="unavailable">'+R.esc(e&&e.message||e)+'</p></section>'}
	function setHeader(sess){
		document.querySelector('#portal-org').textContent=sess.tenant_name||'Business portal';
		document.querySelector('#portal-sub').textContent='Signed in as '+(sess.display_name||'tenant user');
		var so=document.querySelector('#portal-signout');
		so.hidden=false;
		so.onclick=function(){clearKey();location.href='/portal'};
		var pw=document.querySelector('#portal-powered');
		if(pw&&sess.white_label)pw.hidden=true;
		if(sess.units&&sess.units.length>1){
			var nav=document.querySelector('#portal-units');
			nav.hidden=false;
			nav.innerHTML=sess.units.map(function(u){
				var active=(mode==='unit'&&u.unit_id===unitId);
				return '<a class="oc-menu-btn'+(active?' oc-menu-active':'')+'" href="/portal/unit/'+encodeURIComponent(u.unit_id)+'">'+R.esc(u.name)+'</a>';
			}).join('');
		}
	}
	async function bootLanding(){
		var s=await papi('/api/portal/session');
		var sess=s.session;
		setHeader(sess);
		var units=sess.units||[];
		if(units.length===1){location.replace('/portal/unit/'+encodeURIComponent(units[0].unit_id));return}
		if(units.length===0){
			setHtml('<section class="panel"><h2>No business units</h2><p class="unavailable">No business units are assigned to this access key. Ask your organization administrator to assign one.</p></section>');
			return;
		}
		setHtml('<div class="grid">'+units.map(function(u){
			return '<div class="panel"><h2>'+R.esc(u.name)+'</h2>'+
				'<p>'+R.statusBadge(u.operating_status)+' <span class="badge">'+R.esc(u.unit_type)+'</span></p>'+
				'<p><a class="oc-menu-btn" href="/portal/unit/'+encodeURIComponent(u.unit_id)+'">Open</a></p></div>';
		}).join('')+'</div>');
	}
	async function bootUnit(){
		var s=await papi('/api/portal/session');
		var sess=s.session;
		setHeader(sess);
		var ok=(sess.units||[]).some(function(u){return u.unit_id===unitId});
		if(!ok){setHtml(errHtml(new Error('This business unit is not assigned to your access key.')));return}
		var d=await papi('/api/portal/units/'+encodeURIComponent(unitId));
		setHtml(R.body(d.unit,{links:[],backHtml:'',tenantLine:'',engineEmpty:false}));
	}
	async function boot(){
		if(booted)return;booted=true;
		if(!getKey())return;
		try{
			if(mode==='landing')await bootLanding();else await bootUnit();
		}catch(e){
			if(e&&e.message==='__unauthorized__'){clearKey();location.reload();return}
			setHtml(errHtml(e));
		}
	}
	window.__activateInitialTab=function(){boot()};
})();
`;

function portalShell(opts: {
	title: string;
	subtitle: string;
	mode: "landing" | "unit";
	unitId?: string;
}): string {
	const headerHtml =
		`<header><img src="/operating-center/icon-180.v2.png" alt="" width="64" height="64">` +
		`<div><h1 id="portal-org">Business portal</h1><p id="portal-sub">${opts.subtitle}</p></div>` +
		`<div style="margin-left:auto"><button type="button" id="portal-signout" class="secondary" hidden>Sign out</button></div></header>` +
		`\n\t<nav id="portal-units" class="oc-menu" aria-label="Business units" hidden></nav>` +
		`\n\t<p id="portal-powered" class="meta" style="padding:10px clamp(20px,5vw,72px);margin:0;background:var(--brand);color:#dce9e2">Powered by NWANA Engine</p>`;
	const bodyHtml =
		`<div id="portal-body"><section class="panel"><p class="unavailable">Loading…</p></section></div>` +
		`<script>${UNIT_BODY_SCRIPT}</script>` +
		`<script>${PORTAL_SCRIPT}</script>`;
	const html = ocBareShell({
		title: opts.title,
		titleSuffix: "Tenant Portal",
		headerHtml,
		gate: {
			storageKey: "nwana_portal_key",
			heading: "Tenant access",
			intro: "This portal is private. Enter the access key your organization gave you.",
			keyLabel: "Access key",
			keyId: "access-key",
			keyName: "access_key",
			buttonLabel: "Sign in",
			rejectedMessage: "The access key was rejected. Enter the access key again.",
		},
		bodyHtml,
		// Empty: PORTAL_SCRIPT (emitted above, inside bodyHtml) assigns
		// window.__activateInitialTab itself. A no-op declaration here
		// would hoist over that assignment and the portal would never boot.
		script: "",
	});
	// The shell calls the global __activateInitialTab() on unlock and on
	// load when a key is stored; the assignment below runs before the
	// shell's own script tag (document order), so boot is wired in time.
	// data-portal / data-unit drive landing vs unit boot.
	const attrs =
		opts.mode === "landing"
			? '<div id="app" hidden data-portal="landing">'
			: `<div id="app" hidden data-portal="unit" data-unit="${(opts.unitId ?? "").replace(/["']/g, "")}">`;
	return html.replace('<div id="app" hidden>', attrs);
}

export function renderPortalLandingHtml(): string {
	return portalShell({
		title: "Business Portal",
		subtitle: "Private tenant workspace",
		mode: "landing",
	});
}

export function renderPortalUnitHtml(unitId: string): string {
	return portalShell({
		title: "Business Unit",
		subtitle: "Unit overview",
		mode: "unit",
		unitId,
	});
}
