// Personal Dashboard (2026-10-02): user's own admin, like a regular user sees.
// SEPARATE from Platform Admin (/admin) and from tenant workspace (/operating-center).
// Shows: my organizations + my ventures. User-scoped, no platform functions.

export function renderDashboardHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>My Dashboard — NWANA Engine</title>
	<style>
		:root{--line:#e5e7eb;--ink:#1f2937;--mut:#6b7280;--green:#2f6247}
		body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f9fafb;color:var(--ink)}
		.top{background:var(--green);color:#fff;padding:18px 24px}
		.top h1{margin:0;font-size:22px}
		.top p{margin:4px 0 0;opacity:.85;font-size:14px}
		.top .row{display:flex;justify-content:space-between;align-items:center}
		.top a{color:#fff;font-size:13px}
		.tabs{display:flex;gap:8px;padding:16px 24px 0}
		.tabs button{padding:8px 18px;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;font-size:14px}
		.tabs button.on{background:var(--green);color:#fff;border-color:var(--green)}
		.main{padding:16px 24px 40px;max-width:1100px}
		.panel{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px}
		.meta{color:var(--mut);font-size:13px}
		.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;background:#f3f4f6}
		.btn{display:inline-block;padding:8px 18px;background:var(--green);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;text-decoration:none}
		.btn2{display:inline-block;padding:8px 18px;background:#fff;color:var(--green);border:1px solid var(--green);border-radius:8px;cursor:pointer;font-size:14px;text-decoration:none}
		.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
		input,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;font-size:14px}
	</style>
</head>
<body>
	<div class="top">
		<div class="row">
			<div>
				<h1>My Dashboard</h1>
				<p>Your organizations and your ventures. Jot it down, let it mature, make it real.</p>
			</div>
			<div style="text-align:right">
				<div id="who" class="meta" style="color:#fff;opacity:.85"></div>
				<a href="#" onclick="doSignOut();return false;">Sign out</a>
			</div>
		</div>
	</div>
	<div class="tabs">
		<button id="tab-orgs" class="on" onclick="showTab('orgs')">Organizations</button>
		<button id="tab-ventures" onclick="showTab('ventures')">Ventures</button>
	</div>
	<div class="main">
		<div id="pane-orgs">
			<div id="orgs"><div class="panel"><p class="meta">Loading…</p></div></div>
		</div>
		<div id="pane-ventures" style="display:none">
			<div class="panel" style="margin-bottom:14px">
				<h3 style="font-size:15px;margin:0 0 8px">New venture</h3>
				<input id="v-name" placeholder="Venture name">
				<textarea id="v-summary" placeholder="What is it?" style="min-height:60px"></textarea>
				<button class="btn" onclick="addVenture()">Add venture</button>
			</div>
			<div id="ventures"><div class="panel"><p class="meta">Loading…</p></div></div>
		</div>
	</div>
<script>
function getTok(){try{var t=sessionStorage.getItem('nwana_engine_session');if(t)return t;}catch(e){}try{var t2=localStorage.getItem('nwana_operating_center_key');if(t2)return t2;}catch(e){}return '';}
var K=getTok();
function H(){return {authorization:'Bearer '+K,'content-type':'application/json'};}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function doSignOut(){try{sessionStorage.removeItem('nwana_engine_session');localStorage.removeItem('nwana_operating_center_key');}catch(e){}window.location.href='/operating-center/login';}
function showTab(w){
	document.getElementById('tab-orgs').className=w==='orgs'?'on':'';
	document.getElementById('tab-ventures').className=w==='ventures'?'on':'';
	document.getElementById('pane-orgs').style.display=w==='orgs'?'':'none';
	document.getElementById('pane-ventures').style.display=w==='ventures'?'':'none';
}
// who am i
fetch('/api/oc/session',{headers:H()}).then(function(r){return r.json()}).then(function(s){
	var u=s.user||{};document.getElementById('who').textContent=(u.email||'')+' · '+(u.role||'');
}).catch(function(){});
// organizations
fetch('/api/my/tenants',{headers:H()}).then(function(r){return r.json()}).then(function(d){
	var box=document.getElementById('orgs');var list=d.tenants||[];
	if(!list.length){box.innerHTML='<div class="panel"><p class="meta">No organizations yet. Promote a venture to create one.</p></div>';return;}
	box.innerHTML='<div class="cards">'+list.map(function(t){
		return '<div class="panel" style="margin:0"><h3 style="margin:0 0 6px;font-size:16px">'+esc(t.display_name)+'</h3>'+
			'<p class="meta" style="margin:0 0 10px">'+esc(t.organization_type||'')+'</p>'+
			'<div style="display:flex;gap:8px"><a class="btn" style="padding:6px 14px;font-size:13px" href="/operating-center">Open</a>'+
			'<a class="btn2" style="padding:6px 14px;font-size:13px" href="#" onclick="alert(\\'Team for '+esc(t.display_name)+'\\');return false;">Team</a></div></div>';
	}).join('')+'</div>';
}).catch(function(){box=document.getElementById('orgs');box.innerHTML='<div class="panel"><p class="meta">Could not load.</p></div>';});
// ventures
function loadVentures(){
	fetch('/api/my/ideas',{headers:H()}).then(function(r){return r.json()}).then(function(d){
		var box=document.getElementById('ventures');var list=d.ideas||[];
		if(!list.length){box.innerHTML='<div class="panel"><p class="meta">No ventures yet. Jot down the first one above.</p></div>';return;}
		box.innerHTML='<div class="cards">'+list.map(function(v){
			var desc=v.summary&&v.summary.length>160?v.summary.slice(0,160)+'…':(v.summary||'');
			var btn=v.tenant_id
				?'<span class="badge" style="background:#d1fae5;color:#065f46">became an organization</span>'
				:'<button class="btn" style="padding:6px 14px;font-size:13px" onclick="promote(\\''+String(v.idea_id).replace(/'/g,"")+'\\')">Make it an organization</button>';
			return '<div class="panel" style="margin:0;cursor:pointer" onclick="openVenture(\\''+String(v.idea_id).replace(/'/g,"")+'\\')">'+
				'<h3 style="margin:0 0 6px;font-size:16px">'+esc(v.name)+'</h3>'+
				'<p class="meta" style="margin:0 0 10px">'+esc(desc)+'</p><div>'+btn+'</div></div>';
		}).join('')+'</div>';
	}).catch(function(){});
}
function addVenture(){
	var n=document.getElementById('v-name').value.trim();if(!n){alert('Name?');return;}
	var s=document.getElementById('v-summary').value.trim();
	fetch('/api/my/ideas',{method:'POST',headers:H(),body:JSON.stringify({name:n,summary:s})})
		.then(function(r){return r.json()}).then(function(){
			document.getElementById('v-name').value='';document.getElementById('v-summary').value='';loadVentures();
		});
}
function promote(id){
	if(!confirm('Make this venture an organization?'))return;
	fetch('/api/my/ideas/'+encodeURIComponent(id)+'/promote',{method:'POST',headers:H()})
		.then(function(r){return r.json()}).then(function(){loadVentures();});
}
function openVenture(id){/* detail view later */}
loadVentures();
</script>
</body>
</html>`;
}
