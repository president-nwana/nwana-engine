// My Workspace — founder's personal admin (2026-10-02)
// Each person has: My Ideas (jot, mature, promote) + My Projects (tenants).
// Not platform admin. The user's own kitchen.
export function renderMyProjectsSectionHtml(): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My Workspace — NWANA Engine</title><style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d}
		body{font-family:system-ui,sans-serif;margin:0;background:var(--paper);color:var(--ink)}
		header{background:var(--brand);color:#fff;padding:28px 24px}
		header h1{margin:0;font-size:28px}header p{margin:6px 0 0;opacity:.85}
		header a{color:#fff}
		main{max-width:1000px;margin:0 auto;padding:20px}
		h2{font-size:20px;margin:24px 0 12px}h2:first-child{margin-top:0}
		.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
		.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
		.panel h3{margin:0 0 6px;font-size:17px}
		.meta{color:var(--muted);font-size:13px;margin:0 0 10px}
		.btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px;border:none;cursor:pointer}
		.btn2{display:inline-block;background:#fff;color:#2f6247;border:1px solid #2f6247;font-weight:600;padding:6px 12px;border-radius:8px;font-size:13px;cursor:pointer;margin-right:6px}
		.badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#e5efe9;color:#183d2d}
		input,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:14px;margin:0 0 8px}
		textarea{min-height:60px;resize:vertical}
	</style></head><body>
	<header><div style="display:flex;justify-content:space-between;align-items:start"><div><h1>My Workspace</h1><p>Your ideas and your projects. Jot it down, let it mature, make it real.</p></div><div style="text-align:right"><div id="who" style="font-size:13px;opacity:.85;margin-bottom:4px"></div><a href="/login" onclick="try{sessionStorage.removeItem('nwana_engine_session')}catch(e){}try{localStorage.removeItem('nwana_operating_center_key')}catch(e){}try{sessionStorage.removeItem('nwana_preview_tenant')}catch(e){}" style="font-size:13px;color:#fff">Sign out</a></div></div></header>
	<main>
		<h2>My Ideas</h2>
		<div class="panel" style="margin-bottom:14px"><h3 style="font-size:15px">New idea</h3>
			<input id="idea-name" placeholder="Idea name">
			<textarea id="idea-summary" placeholder="What is it, in a few words?"></textarea>
			<button class="btn" onclick="addIdea()">Add idea</button>
		</div>
		<div id="ideas"><div class="panel"><p class="meta">Loading…</p></div></div>
		<h2>My Projects</h2>
		<div id="projects"><div class="panel"><p class="meta">Loading…</p></div></div>
	</main>
	<script>(function(){
		function getTok(){try{var t=sessionStorage.getItem('nwana_engine_session');if(t)return t;}catch(e){}try{var t2=localStorage.getItem('nwana_operating_center_key');if(t2)return t2;}catch(e){}return '';}
		var k=getTok();
		if(!k){document.querySelector('main').innerHTML='<div class="panel"><p>Please <a href="/login">sign in</a>.</p></div>';return;}
		function authH(){return {authorization:'Bearer '+k,'content-type':'application/json'};}
		fetch('/api/auth/session',{headers:authH()}).then(function(r){return r.json()}).then(function(s){
			if(s&&s.user){var w=document.getElementById('who');if(w)w.textContent='Signed in as '+(s.user.display_name||s.user.email);}
		}).catch(function(){});
		function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
		function loadIdeas(){
			fetch('/api/my/ideas',{headers:authH()}).then(function(r){return r.json()}).then(function(d){
				var box=document.getElementById('ideas');
				var list=d.ideas||[];
				if(!list.length){box.innerHTML='<div class="panel"><p class="meta">No ideas yet. Jot down the first one above.</p></div>';return;}
				box.innerHTML='<div class="grid">'+list.map(function(t){
					var desc=t.summary&&t.summary.length>140?t.summary.slice(0,140)+'…':(t.summary||'');
					var action=t.tenant_id
						?'<span class="badge">became a project</span>'
						:'<button class="btn2" onclick="promoteIdea(\''+String(t.idea_id).replace(/'/g,"")+'\')">Make it a project</button>';
					return '<div class="panel"><h3>'+esc(t.name)+'</h3>'+
						'<p class="meta"><span class="badge">'+esc(t.stage)+'</span></p>'+
						(desc?'<p class="meta">'+esc(desc)+'</p>':'')+
						'<p style="margin:8px 0 0">'+action+'</p></div>';
				}).join('')+'</div>';
			}).catch(function(){});
		}
		function loadProjects(){
			fetch('/api/my/tenants',{headers:authH()}).then(function(r){return r.json()}).then(function(d){
				var box=document.getElementById('projects');
				var list=d.tenants||[];
				if(!list.length){box.innerHTML='<div class="panel"><p class="meta">No projects yet. Promote an idea above.</p></div>';return;}
				box.innerHTML='<div class="grid">'+list.map(function(t){
					return '<div class="panel"><h3>'+esc(t.display_name)+'</h3>'+
						'<p class="meta">'+esc(t.tenant_id||'')+' <span class="badge">'+esc(t.status||'')+'</span></p>'+
						'<p style="margin:8px 0 0"><a class="btn" href="#" onclick="openProject(\''+String(t.tenant_id).replace(/'/g,"")+'\');return false;">Open workspace</a></p></div>';
				}).join('')+'</div>';
			}).catch(function(){});
		}
		window.addIdea=function(){
			var name=document.getElementById('idea-name').value.trim();
			var summary=document.getElementById('idea-summary').value.trim();
			if(!name){alert('Give the idea a name.');return;}
			fetch('/api/my/ideas',{headers:authH(),method:'POST',body:JSON.stringify({name:name,summary:summary})}).then(function(r){return r.json()}).then(function(d){
				if(d.ok){document.getElementById('idea-name').value='';document.getElementById('idea-summary').value='';loadIdeas();}
				else{alert(d.error||'Could not save.');}
			});
		};
		window.promoteIdea=function(idea_id){
			if(!confirm('Make this idea a project? It will get its own workspace.'))return;
			fetch('/api/my/ideas/'+encodeURIComponent(idea_id)+'/promote',{headers:authH(),method:'POST'}).then(function(r){return r.json()}).then(function(d){
				if(d.ok){loadIdeas();loadProjects();}
				else{alert(d.error||'Could not promote.');}
			});
		};
		window.openProject=function(tenant_id){
			try{sessionStorage.setItem('nwana_preview_tenant',tenant_id);}catch(e){}
			window.location.href='/operating-center';
		};
		loadIdeas();loadProjects();
	})();</script></body></html>`;
}
