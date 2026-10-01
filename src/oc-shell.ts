// Operating Center — shared section shell.
//
// Every section page is a thin shell: header (app icon) -> 7-button menu ->
// tab bar -> per-tab panels. Each tab reuses one former screen's panels and
// client-side logic; the tab script must define `async function boot_<tabid>()`
// (renamed from the old per-screen `boot()`/`loadX()`), called lazily on first
// tab activation. The shell owns the owner-key gate (single gate per page);
// tab scripts must NOT contain their own key-form handlers.
//
// ADR-0047: ocBareShell is the generic primitive (styles + parameterized
// key gate + #app). ocSectionShell keeps the full OC menu behavior.
// The tenant portal (oc-portal.ts) reuses ocBareShell with its own slim
// header (no OC menu) and its own access-key gate.

import { operatingCenterMenu, type OperatingCenterPageId } from "./operating-center";

function escHtml(v: unknown): string {
	return String(v ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Shared stylesheet for OC sections and the tenant portal. */
export const OC_BASE_CSS = `
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9;--warn:#b35400}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:24px clamp(20px,5vw,72px);display:flex;align-items:center;gap:18px}
		header img{width:64px;height:64px;border-radius:14px;flex:none}
		header h1{margin:0;font-size:clamp(26px,3.6vw,40px)}header p{margin:6px 0 0;color:#dce9e2}
		.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
		.oc-menu-btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
		.oc-menu-btn:hover{background:#3a7455}.oc-menu-active{background:#fff;color:var(--brand)}
		.oc-tabs{background:#10261c;padding:14px clamp(20px,5vw,72px);display:flex;flex-wrap:wrap;gap:8px;position:sticky;top:0;z-index:5}
		.oc-tab{border:1px solid #2f6247;background:transparent;color:#dce9e2;font-weight:650;padding:8px 16px;border-radius:8px;cursor:pointer;width:auto;margin:0}
		.oc-tab:hover{background:#1c3a2a}.oc-tab-active{background:#fff;color:var(--brand);border-color:#fff}
		.oc-func-desc{color:var(--muted);font-size:15px;margin:0 0 14px;max-width:70ch}
		.oc-views{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
		.oc-view-btn{border:1px solid var(--brand);background:white;color:var(--brand);font-weight:700;padding:10px 22px;border-radius:9px;cursor:pointer;width:auto;margin:0}
		.oc-view-btn:hover{background:var(--accent)}
		.oc-view-btn.oc-view-active{background:var(--brand);color:white}
		.oc-quick{background:white;border-bottom:1px solid var(--line);padding:16px clamp(20px,5vw,72px);display:flex;flex-wrap:wrap;gap:10px;align-items:center}
		.oc-quick span{font-weight:700;color:var(--brand);margin-right:6px}
		.oc-quick button{width:auto;margin:0;background:#2f6247}
		.oc-quick button:hover{background:#3a7455}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		h2{margin:0 0 14px;font-size:22px}h3{margin:18px 0 8px;font-size:18px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,select,textarea,button{font:inherit}
		input,select,textarea{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white;width:100%}textarea{min-height:105px;resize:vertical}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;margin-top:14px}
		button.secondary{background:white;color:var(--brand);border:1px solid var(--brand);width:auto;margin:8px 8px 0 0}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:14px 0}.item:first-of-type{border-top:0}.item strong{display:block}
		.badge{display:inline-block;background:var(--accent);border-radius:6px;padding:2px 8px;font-size:13px;color:var(--brand);font-weight:650;margin-left:8px}
		.badge-warn{display:inline-block;background:#fbeedf;border-radius:6px;padding:2px 8px;font-size:13px;color:var(--warn);font-weight:650;margin-left:8px}
		.badge-ok{display:inline-block;background:#e5efe9;border-radius:6px;padding:2px 8px;font-size:13px;color:#183d2d;font-weight:650;margin-left:8px}
		.detail{margin:6px 0;font-size:15px}.detail b{color:var(--muted);font-weight:650}
		.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.stat{background:white;border:1px solid var(--line);border-radius:14px;padding:18px}.stat strong{display:block;font-size:30px}.stat span{color:var(--muted)}
		.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:20px}
		.followup-due{color:#b35400;font-weight:700}.followup-overdue{color:#b00020;font-weight:700}
		table.data{width:100%;border-collapse:collapse;margin-top:8px}table.data th,table.data td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-size:15px}table.data th{color:var(--muted);font-weight:650}
		.pipeline{display:flex;flex-wrap:wrap;align-items:stretch;gap:0;margin:14px 0}
		.pipeline .pstep{background:white;border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-width:150px;flex:1}
		.pipeline .pstep strong{display:block;font-size:24px;color:var(--brand)}
		.pipeline .parrow{align-self:center;padding:0 8px;color:var(--muted);font-size:22px;font-weight:700}
	`;

export interface BareShellGate {
	/** localStorage key for the credential. */
	storageKey: string;
	heading: string;
	intro: string;
	keyLabel: string;
	keyId: string;
	keyName: string;
	buttonLabel: string;
	/** Message shown when the server rejects the stored credential (401). */
	rejectedMessage: string;
}

export interface BareShellOpts {
	title: string;
	/** Tab-title suffix. Defaults to "NWANA Operating Center". */
	titleSuffix?: string;
	/** Everything above the gate: header, menu, tab bar. */
	headerHtml: string;
	gate: BareShellGate;
	/** Rendered at the top of #app, after the gate unlocks. */
	appTopHtml?: string;
	/** Panels / single body rendered inside #app. */
	bodyHtml: string;
	/**
	 * Extra client script. Runs inside the same <script> as the gate logic
	 * and must define `__activateInitialTab()` (called on unlock and on
	 * load when a credential is stored).
	 */
	script: string;
}

/**
 * Generic shell: styles + parameterized key gate + #app. No OC menu —
 * callers supply their own headerHtml (the OC menu for sections, a slim
 * tenant header for the portal).
 */
export function ocBareShell(opts: BareShellOpts): string {
	const g = opts.gate;
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>${escHtml(opts.title)} — ${escHtml(opts.titleSuffix ?? "NWANA Operating Center")}</title>
	<link rel="icon" type="image/png" href="/operating-center/icon-180.v2.png">
	<link rel="apple-touch-icon" href="/operating-center/icon-180.v2.png">
	<style>${OC_BASE_CSS}</style>
</head>
<body>
	${opts.headerHtml}
	<main>
		<section class="panel" id="gate" hidden>
			<h2>${escHtml(g.heading)}</h2>
			<p class="unavailable">${escHtml(g.intro)}</p>
			<form id="key-form">
				<label for="${escHtml(g.keyId)}">${escHtml(g.keyLabel)}</label>
				<input id="${escHtml(g.keyId)}" name="${escHtml(g.keyName)}" type="password" autocomplete="current-password" required>
				<button type="submit">${escHtml(g.buttonLabel)}</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
			${opts.appTopHtml ? `<div class="oc-quick">${opts.appTopHtml}</div>` : ""}
			${opts.bodyHtml}
		</div>
	</main>
	<script>
		const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
		const KEY_STORAGE='${g.storageKey}';
		const gate=document.querySelector('#gate');
		const app=document.querySelector('#app');
		function getKey(){try{return localStorage.getItem(KEY_STORAGE)||''}catch(e){return ''}}
		function setKey(k){try{localStorage.setItem(KEY_STORAGE,k)}catch(e){}}
		function clearKey(){try{localStorage.removeItem(KEY_STORAGE)}catch(e){}}
		function showGate(message){app.hidden=true;gate.hidden=false;if(message)document.querySelector('#key-message').textContent=message}
		function showApp(){gate.hidden=true;app.hidden=false}
		async function api(path,options){const r=await fetch(path,Object.assign({},options||{},{headers:Object.assign({},(options&&options.headers)||{},{authorization:'Bearer '+getKey()})}));let d=null;try{d=await r.json()}catch(e){}if(r.status===401){clearKey();showGate('${g.rejectedMessage}');throw new Error('Unauthorized')}if(!r.ok)throw new Error((d&&d.error)||'Request failed');return d}
		function downloadReport(screen,filename,msgEl){
			if(msgEl)msgEl.textContent='Preparing report…';
			fetch('/api/operating-center/report/'+screen,{headers:{authorization:'Bearer '+getKey()}}).then(r=>{if(r.status===401){clearKey();showGate('${g.rejectedMessage}');throw new Error('Unauthorized')}if(!r.ok)throw new Error('Report request failed');return r.text()}).then(html=>{const blob=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename+'.html';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);if(msgEl)msgEl.textContent='Report downloaded.'}).catch(err=>{if(msgEl)msgEl.textContent=err.message});
		}
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('${g.keyName}')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();__activateInitialTab()});
		document.querySelector('#app').addEventListener('click',e=>{const b=e.target.closest('.oc-report-btn');if(!b)return;const panel=b.closest('.oc-tabpanel')||document;const m=panel.querySelector('.oc-report-message');downloadReport(b.dataset.screen,b.dataset.filename,m)});
		${opts.script}
		if(getKey()){showApp();__activateInitialTab()}else{showGate('')}
	</script>
</body></html>`;
}

export interface OcTab {
	/** URL-hash id, e.g. "ads". Lowercase alnum + dash. */
	id: string;
	/** Tab bar label. */
	label: string;
	/** The former screen's static panels HTML, verbatim. */
	panelsHtml: string;
	/**
	 * The former screen's client-side JS, adapted: gate lines removed, main
	 * loader renamed to `async function boot_<id>()`. All other top-level
	 * names must be unique across the section page.
	 */
	script: string;
	/** If set, a "Download report (.html)" panel is rendered inside this tab. */
	reportId?: string;
}

/**
 * One function block: a 1-2 line human description, three visible
 * [ Summary ] [ Actions ] [ Details ] navigation buttons, and three
 * SEPARATE views — only one visible at a time, never stacked.
 * View loaders are `async function boot_<func>_<view>()` defined by the
 * section (view = summary|actions|details); the view-routing script below
 * calls them lazily on first activation.
 */
export function ocFunction(
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

/**
 * View-routing script for sections that address tabs by the `tab` query
 * parameter (queryTabs: true), deep-linking every function view as
 * ?tab=<function>&view=<summary|actions|details>.
 *
 * Defines, all prefixed to avoid collisions:
 *   - `__<prefix>SetView(tab, view, push)` — navigate to a view, updating
 *     the URL (pushState when push is true). Call it from any tab script
 *     for cross-tab links.
 *   - `__<prefix>BootTab(tab)` — activate the view from the URL.
 *   - `async function boot_<tabid>()` for every tab id — required by the
 *     shell's tab activation.
 *
 * Overrides `window.__onTabNavigate` so tab-bar switches land on the
 * Summary view. Also converts legacy `#tab` hashes to the query form and
 * wires `[data-qa="tab|view|selector"]` quick-action buttons.
 */
export function ocViewScript(prefix: string, tabIds: string[]): string {
	const setView = `__${prefix}SetView`;
	const bootTab = `__${prefix}BootTab`;
	const bootFns = tabIds
		.map((t) => `async function boot_${t}(){${bootTab}('${t}');}`)
		.join("\n");
	const tabList = JSON.stringify(tabIds);
	return `
	var __${prefix}BootedViews={};
	function __${prefix}ViewParam(){
		try{var v=new URLSearchParams(location.search).get('view');return (v==='actions'||v==='details')?v:'summary';}
		catch(e){return 'summary';}
	}
	function __${prefix}ActivateView(tab,view){
		var panel=document.querySelector('#tabpanel-'+tab);
		if(!panel)return;
		var btns=panel.querySelectorAll('[data-views] .oc-view-btn');
		for(var i=0;i<btns.length;i++){btns[i].classList.toggle('oc-view-active',btns[i].getAttribute('data-view')===view);}
		var panels=panel.querySelectorAll('[data-viewpanel]');
		for(var j=0;j<panels.length;j++){panels[j].hidden=panels[j].getAttribute('data-viewpanel')!==view;}
		var key=tab+':'+view;
		if(!__${prefix}BootedViews[key]){
			__${prefix}BootedViews[key]=1;
			var f=window['boot_'+tab+'_'+view];
			if(typeof f==='function'){f().catch(function(e){var m=panel.querySelector('.oc-tab-error');if(m)m.textContent='Error: '+(e&&e.message||e);});}
		}
	}
	function ${setView}(tab,view,push){
		var u;try{u=new URL(location.href);}catch(e){return;}
		u.searchParams.set('tab',tab);u.searchParams.set('view',view);
		if(push){history.pushState({},'',u);}else{history.replaceState({},'',u);}
		__activateTab(tab);
		__${prefix}ActivateView(tab,view);
	}
	function ${bootTab}(tab){__${prefix}ActivateView(tab,__${prefix}ViewParam());}
	${bootFns}
	window.__onTabNavigate=function(id){${setView}(id,'summary',true);};
	window.addEventListener('popstate',function(){
		__activateInitialTab();
		var active=document.querySelector('.oc-tab.oc-tab-active');
		var tab=active?active.getAttribute('data-tab'):'${tabIds[0]}';
		__${prefix}ActivateView(tab,__${prefix}ViewParam());
	});
	document.querySelector('#app').addEventListener('click',function(e){
		var q=e.target.closest('[data-qa]');
		if(q){
			var parts=String(q.getAttribute('data-qa')).split('|');
			var qtab=parts[0],qview=parts[1]||'summary',qsel=parts[2]||'';
			${setView}(qtab,qview,true);
			if(qsel){setTimeout(function(){var el=document.querySelector(qsel);if(el&&!el.hidden)el.scrollIntoView();},600);}
			return;
		}
		var b=e.target.closest('.oc-views .oc-view-btn');
		if(b){
			var panel=b.closest('.oc-tabpanel');
			var btab=panel?panel.getAttribute('data-tab'):'';
			if(btab)${setView}(btab,b.getAttribute('data-view'),true);
		}
	});
	(function(){
		try{
			var h=(location.hash||'').replace(/^#/,'').split('?')[0];
			var tabs=${tabList};
			var sp=new URLSearchParams(location.search);
			if(!sp.get('tab')&&tabs.indexOf(h)>=0){
				sp.set('tab',h);
				if(!sp.get('view'))sp.set('view','summary');
				history.replaceState({},'',location.pathname+'?'+sp.toString());
			}
		}catch(e){}
	})();
`;
}

export function ocSectionShell(opts: {
	section: OperatingCenterPageId;
	title: string;
	subtitle: string;
	/** Tabs; empty array = single body view (Overview). */
	tabs: OcTab[];
	/** Section body when there are no tabs (Overview). */
	bodyHtml?: string;
	/**
	 * When true, tabs are addressed by the `tab` query parameter
	 * (?tab=ads) with the History API instead of the URL hash (#ads).
	 * Used by Marketing for deep-linkable tab+view URLs. Other sections
	 * keep the default hash behavior.
	 */
	queryTabs?: boolean;
	/** Rendered above the tab bar, outside the gate (rarely used). */
	aboveTabsHtml?: string;
	/** Rendered at the top of #app, after the gate unlocks (Marketing quick actions). */
	appTopHtml?: string;
}): string {
	const tabs = opts.tabs ?? [];
	const hasTabs = tabs.length > 0;

	const tabBar = hasTabs
		? `<nav class="oc-tabs" aria-label="Section">
				${tabs.map((t, i) => `<button type="button" class="oc-tab${i === 0 ? " oc-tab-active" : ""}" data-tab="${escHtml(t.id)}">${escHtml(t.label)}</button>`).join("")}
			</nav>`
		: "";

	const reportPanel = (reportId: string, filename: string) => `
		<section class="panel">
			<h2>Download report</h2>
			<p class="meta">A self-contained, external-ready snapshot of this tab as it is right now: current data, report date, no internal fields. Open it in a browser and print to PDF to hand to an outside party.</p>
			<button type="button" class="oc-report-btn" data-screen="${escHtml(reportId)}" data-filename="${escHtml(filename)}">Download report (.html)</button>
			<div class="message oc-report-message" aria-live="polite"></div>
		</section>`;

	const panels = hasTabs
		? tabs.map((t, i) => `
			<div class="oc-tabpanel" id="tabpanel-${escHtml(t.id)}" data-tab="${escHtml(t.id)}"${i === 0 ? "" : " hidden"}>
				<div class="message oc-tab-error" aria-live="polite"></div>
				${t.panelsHtml}
				${t.reportId ? reportPanel(t.reportId, "nwana-" + t.reportId + "-report") : ""}
			</div>`).join("")
		: `<div id="section-body">${opts.bodyHtml ?? ""}</div>`;

	const tabScripts = tabs.map((t) => t.script).join("\n");

	const headerHtml =
		`<header><img src="/operating-center/icon-180.v2.png" alt="NWANA Operating Center icon" width="64" height="64"><div><h1>${escHtml(opts.title)}</h1><p>${escHtml(opts.subtitle)}</p></div></header>` +
		`\n\t${operatingCenterMenu(opts.section)}` +
		`\n\t${opts.aboveTabsHtml ? `<div class="oc-quick">${opts.aboveTabsHtml}</div>` : ""}` +
		`\n\t${tabBar}`;

	const sectionScript = hasTabs
		? `
		const __QUERY_TABS=${opts.queryTabs ? "true" : "false"};
		const __booted={};
		function __activateTab(id){
			let found=false;
			document.querySelectorAll('.oc-tab').forEach(b=>{const on=b.dataset.tab===id;b.classList.toggle('oc-tab-active',on);if(on)found=true});
			if(!found)return false;
			document.querySelectorAll('.oc-tabpanel').forEach(p=>{p.hidden=p.dataset.tab!==id});
			if(!__booted[id]){__booted[id]=1;const f=window['boot_'+id];if(typeof f==='function'){f().catch(e=>{const m=document.querySelector('#tabpanel-'+id+' .oc-tab-error');if(m)m.textContent='Error: '+(e&&e.message||e)})}}
			return true;
		}
		function __tabFromUrl(){
			if(__QUERY_TABS){try{return new URLSearchParams(location.search).get('tab')||''}catch(e){return ''}}
			return (location.hash||'').replace(/^#/,'').split('?')[0]||'';
		}
		function __navigateTab(id){
			if(typeof window.__onTabNavigate==='function'){window.__onTabNavigate(id);return}
			if(__QUERY_TABS){
				const u=new URL(location.href);u.searchParams.set('tab',id);history.pushState({},'',u);__activateTab(id);
			}else if(location.hash==='#'+id){__activateTab(id)}else{location.hash=id}
		}
		function __activateInitialTab(){if(!__activateTab(__tabFromUrl())){const first=document.querySelector('.oc-tab');if(first)__activateTab(first.dataset.tab)}}
		document.querySelectorAll('.oc-tab').forEach(b=>b.addEventListener('click',()=>__navigateTab(b.dataset.tab)));
		if(__QUERY_TABS){window.addEventListener('popstate',()=>__activateInitialTab())}else{window.addEventListener('hashchange',()=>__activateInitialTab())}
		`
		: `
		function __activateInitialTab(){}
		`;

	return ocBareShell({
		title: opts.title,
		headerHtml,
		gate: {
			storageKey: "nwana_operating_center_key",
			heading: "Owner access",
			intro: "This page is private. Enter the operating center key to continue.",
			keyLabel: "Operating center key",
			keyId: "owner-key",
			keyName: "owner_key",
			buttonLabel: `Open ${opts.title.toLowerCase()}`,
			rejectedMessage: "The key was rejected. Enter the owner key again.",
		},
		appTopHtml: opts.appTopHtml,
		bodyHtml: panels,
		script: sectionScript + "\n\t\t" + tabScripts,
	});
}
