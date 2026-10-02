// My Workspace section (2026-10-02): user's personal admin.
// Organizations (my tenants) + Ideas (my ventures).
// Same card layout as Platform Admin, but user-scoped, no platform functions.
import { ocSectionShell } from "./oc-shell";

const ORGS_PANELS = `<div id="ws-orgs"><div class="panel"><p class="meta">Loading…</p></div></div>`;

const ORGS_SCRIPT = `<script>(function(){
	function getTok(){try{var t=sessionStorage.getItem('nwana_engine_session');if(t)return t;}catch(e){}try{var t2=localStorage.getItem('nwana_operating_center_key');if(t2)return t2;}catch(e){}return '';}
	var k=getTok();if(!k)return;
	function H(){return {authorization:'Bearer '+k,'content-type':'application/json'};}
	function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
	fetch('/api/my/tenants',{headers:H()}).then(function(r){return r.json()}).then(function(d){
		var box=document.getElementById('ws-orgs');
		var list=d.tenants||[];
		if(!list.length){box.innerHTML='<div class="panel"><p class="meta">No organizations yet. Promote an idea to create one.</p></div>';return;}
		box.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">'+list.map(function(t){
			var st=t.status==='active'?'<span class="badge" style="background:#d1fae5;color:#065f46">active</span>':'<span class="badge">'+esc(t.status||'')+'</span>';
			return '<div class="panel" style="margin:0"><h3 style="margin:0 0 6px;font-size:16px">'+esc(t.display_name)+'</h3>'+
				'<p class="meta" style="margin:0 0 8px">'+esc(t.tenant_id||'')+' '+st+'</p>'+
				'<div style="display:flex;gap:8px;margin-top:10px"><a class="oc-menu-btn" style="padding:6px 14px;font-size:13px" href="#" onclick="wsOpen(\''+String(t.tenant_id).replace(/'/g,"")+'\');return false;">Open</a>'+
				'<a class="oc-menu-btn" style="padding:6px 14px;font-size:13px;background:#fff;color:#2f6247;border:1px solid #2f6247" href="#" onclick="wsTeam(\''+String(t.tenant_id).replace(/'/g,"")+'\');return false;">Team</a></div></div>';
		}).join('')+'</div>';
	}).catch(function(){});
	window.wsOpen=function(tid){try{sessionStorage.setItem('nwana_preview_tenant',tid);}catch(e){}window.location.href='/operating-center';};
	window.wsTeam=function(tid){window.location.href='/my-projects?team='+encodeURIComponent(tid);};
})();</script>`;

const IDEAS_PANELS = `<div class="panel" style="margin-bottom:14px"><h3 style="font-size:15px;margin:0 0 8px">New idea</h3>
	<input id="ws-idea-name" placeholder="Idea name" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px">
	<textarea id="ws-idea-summary" placeholder="What is it?" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--line);border-radius:8px;min-height:60px;margin-bottom:8px"></textarea>
	<button class="oc-menu-btn" onclick="wsAddIdea()">Add idea</button></div>
<div id="ws-ideas"><div class="panel"><p class="meta">Loading…</p></div></div>`;

const IDEAS_SCRIPT = `<script>(function(){
	function getTok(){try{var t=sessionStorage.getItem('nwana_engine_session');if(t)return t;}catch(e){}try{var t2=localStorage.getItem('nwana_operating_center_key');if(t2)return t2;}catch(e){}return '';}
	var k=getTok();if(!k)return;
	function H(){return {authorization:'Bearer '+k,'content-type':'application/json'};}
	function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
	function load(){
		fetch('/api/my/ideas',{headers:H()}).then(function(r){return r.json()}).then(function(d){
			var box=document.getElementById('ws-ideas');
			var list=d.ideas||[];
			if(!list.length){box.innerHTML='<div class="panel"><p class="meta">No ideas yet. Jot down the first one above.</p></div>';return;}
			box.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">'+list.map(function(t){
				var desc=t.summary&&t.summary.length>160?t.summary.slice(0,160)+'…':(t.summary||'');
				var btn=t.tenant_id
					?'<span class="badge" style="background:#d1fae5;color:#065f46">became an organization</span>'
					:'<button class="oc-menu-btn" style="padding:6px 14px;font-size:13px" onclick="wsPromote(\''+String(t.idea_id).replace(/'/g,"")+'\')">Make it an organization</button>';
				return '<div class="panel" style="margin:0"><span class="badge" style="background:#fef3c7;color:#92400e">'+esc(t.stage)+'</span>'+
					'<h3 style="margin:8px 0 6px;font-size:16px">'+esc(t.name)+'</h3>'+
					(desc?'<p class="meta" style="margin:0 0 10px">'+esc(desc)+'</p>':'')+
					'<div>'+btn+'</div></div>';
			}).join('')+'</div>';
		}).catch(function(){});
	}
	window.wsAddIdea=function(){
		var name=document.getElementById('ws-idea-name').value.trim();
		var summary=document.getElementById('ws-idea-summary').value.trim();
		if(!name){alert('Give the idea a name.');return;}
		fetch('/api/my/ideas',{headers:H(),method:'POST',body:JSON.stringify({name:name,summary:summary})}).then(function(r){return r.json()}).then(function(d){
			if(d.ok){document.getElementById('ws-idea-name').value='';document.getElementById('ws-idea-summary').value='';load();}
			else{alert(d.error||'Could not save.');}
		});
	};
	window.wsPromote=function(idea_id){
		if(!confirm('Make this idea an organization? It will get its own workspace.'))return;
		fetch('/api/my/ideas/'+encodeURIComponent(idea_id)+'/promote',{headers:H(),method:'POST'}).then(function(r){return r.json()}).then(function(d){
			if(d.ok){load();}
			else{alert(d.error||'Could not promote.');}
		});
	};
	load();
})();</script>`;

export function renderWorkspaceSectionHtml(): string {
	return ocSectionShell({
		section: "workspace",
		title: "My Workspace",
		subtitle: "Your organizations and your ideas. Jot it down, let it mature, make it real.",
		queryTabs: true,
		tabs: [
			{ id: "organizations", label: "Organizations", panelsHtml: ORGS_PANELS, script: ORGS_SCRIPT },
			{ id: "ideas", label: "Ideas", panelsHtml: IDEAS_PANELS, script: IDEAS_SCRIPT },
		],
	});
}
