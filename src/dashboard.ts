// Personal Dashboard (2026-10-02): user's own admin — like Platform Admin looks,
// but user-scoped. SEPARATE from /admin (platform) and /operating-center (tenant).
// Uses the same ocSectionShell design, with a user menu (not the NWANA workspace menu).

import { ocSectionShell } from "./oc-shell";

const USER_MENU = `<nav class="oc-menu" aria-label="My Dashboard">
	<a class="oc-menu-btn oc-menu-active" href="/dashboard">My Dashboard</a>
	<a class="oc-menu-btn" href="/operating-center">Tenant Workspace</a>
	<a class="oc-menu-btn" href="/admin">Platform Admin</a>
</nav>`;

const ORGS_PANELS = `<div id="dash-orgs"><div class="panel"><p class="meta">Loading…</p></div></div>`;

const ORGS_SCRIPT = `<script>(function(){
	function getTok(){try{var t=sessionStorage.getItem('nwana_engine_session');if(t)return t;}catch(e){}try{var t2=localStorage.getItem('nwana_operating_center_key');if(t2)return t2;}catch(e){}return '';}
	var k=getTok();if(!k)return;
	function H(){return {authorization:'Bearer '+k,'content-type':'application/json'};}
	function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
	fetch('/api/my/tenants',{headers:H()}).then(function(r){return r.json()}).then(function(d){
		var box=document.getElementById('dash-orgs');
		var list=d.tenants||[];
		if(!list.length){box.innerHTML='<div class="panel"><p class="meta">No organizations yet. Promote a venture to create one.</p></div>';return;}
		box.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">'+list.map(function(t){
			return '<div class="panel" style="margin:0"><h3 style="margin:0 0 6px;font-size:16px">'+esc(t.display_name)+'</h3>'+
				'<p class="meta" style="margin:0 0 10px">'+esc(t.organization_type||'')+'</p>'+
				'<div style="display:flex;gap:8px"><a class="oc-menu-btn" style="padding:6px 14px;font-size:13px" href="/operating-center">Open</a>'+
				'<a class="oc-menu-btn" style="padding:6px 14px;font-size:13px;background:#fff;color:#2f6247;border:1px solid #2f6247" href="#" onclick="alert(\\'Team management\\');return false;">Team</a></div></div>';
		}).join('')+'</div>';
	}).catch(function(){});
})();</script>`;

const VENTURES_PANELS = `<div class="panel" style="margin-bottom:14px"><h3 style="font-size:15px;margin:0 0 8px">New venture</h3>
	<input id="dash-v-name" placeholder="Venture name" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px">
	<textarea id="dash-v-summary" placeholder="What is it?" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--line);border-radius:8px;min-height:60px;margin-bottom:8px"></textarea>
	<button class="oc-menu-btn" onclick="dashAddVenture()">Add venture</button></div>
<div id="dash-ventures"><div class="panel"><p class="meta">Loading…</p></div></div>`;

const VENTURES_SCRIPT = `<script>(function(){
	function getTok(){try{var t=sessionStorage.getItem('nwana_engine_session');if(t)return t;}catch(e){}try{var t2=localStorage.getItem('nwana_operating_center_key');if(t2)return t2;}catch(e){}return '';}
	var k=getTok();if(!k)return;
	function H(){return {authorization:'Bearer '+k,'content-type':'application/json'};}
	function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
	function load(){
		fetch('/api/my/ideas',{headers:H()}).then(function(r){return r.json()}).then(function(d){
			var box=document.getElementById('dash-ventures');
			var list=d.ideas||[];
			if(!list.length){box.innerHTML='<div class="panel"><p class="meta">No ventures yet. Jot down the first one above.</p></div>';return;}
			box.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">'+list.map(function(v){
				var desc=v.summary&&v.summary.length>160?v.summary.slice(0,160)+'…':(v.summary||'');
				var btn=v.tenant_id
					?'<span class="badge" style="background:#d1fae5;color:#065f46">became an organization</span>'
					:'<button class="oc-menu-btn" style="padding:6px 14px;font-size:13px" onclick="dashPromote(\\''+String(v.idea_id).replace(/'/g,"")+'\\')">Make it an organization</button>';
				return '<div class="panel" style="margin:0;cursor:pointer" onclick="dashOpenVenture(\\''+String(v.idea_id).replace(/'/g,"")+'\\')">'+
					'<h3 style="margin:0 0 6px;font-size:16px">'+esc(v.name)+'</h3>'+
					'<p class="meta" style="margin:0 0 10px">'+esc(desc)+'</p><div onclick="event.stopPropagation()">'+btn+'</div></div>';
			}).join('')+'</div>';
		}).catch(function(){});
	}
	window.dashAddVenture=function(){
		var n=document.getElementById('dash-v-name').value.trim();if(!n){alert('Name?');return;}
		var s=document.getElementById('dash-v-summary').value.trim();
		fetch('/api/my/ideas',{method:'POST',headers:H(),body:JSON.stringify({name:n,summary:s})})
			.then(function(r){return r.json()}).then(function(){
				document.getElementById('dash-v-name').value='';document.getElementById('dash-v-summary').value='';load();
			});
	};
	window.dashPromote=function(id){
		if(!confirm('Make this venture an organization?'))return;
		fetch('/api/my/ideas/'+encodeURIComponent(id)+'/promote',{method:'POST',headers:H()})
			.then(function(r){return r.json()}).then(function(){load();});
	};
	window.dashOpenVenture=function(id){/* detail view later */};
	load();
})();</script>`;

export function renderDashboardHtml(): string {
	return ocSectionShell({
		section: "overview" as any,
		menuHtml: USER_MENU,
		title: "My Dashboard",
		subtitle: "Your organizations and your ventures. Jot it down, let it mature, make it real.",
		tabs: [
			{ id: "orgs", label: "Organizations", panelsHtml: ORGS_PANELS, script: ORGS_SCRIPT },
			{ id: "ventures", label: "Ventures", panelsHtml: VENTURES_PANELS, script: VENTURES_SCRIPT },
		],
	});
}
