// My Workspace — founder's personal admin (2026-10-02)
// Each person has: My Ideas (jot, mature, promote) + My Projects (tenants + team).
// Looks like Ventures cards, but user-facing: no platform admin functions.
// Not platform admin. The user's own kitchen.
export function renderMyProjectsSectionHtml(): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My Workspace — NWANA Engine</title><style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d}
		body{font-family:system-ui,sans-serif;margin:0;background:var(--paper);color:var(--ink)}
		header{background:var(--brand);color:#fff;padding:28px 24px}
		header h1{margin:0;font-size:28px}header p{margin:6px 0 0;opacity:.85}
		header a{color:#fff}
		main{max-width:1100px;margin:0 auto;padding:20px}
		h2{font-size:22px;margin:28px 0 4px}h2:first-child{margin-top:0}
		.sub{color:var(--muted);font-size:14px;margin:0 0 14px}
		.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
		.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px;display:flex;flex-direction:column}
		.card h3{margin:0 0 4px;font-size:18px}
		.kind{color:var(--muted);font-size:13px;margin:0 0 8px}
		.desc{font-size:14px;color:#333;margin:0 0 12px;flex:1}
		.badge{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:#fef3c7;color:#92400e;margin-bottom:10px}
		.badge.op{background:#d1fae5;color:#065f46}
		.actions{margin-top:auto;padding-top:8px;display:flex;gap:8px;flex-wrap:wrap}
		.btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px;border:none;cursor:pointer}
		.btn2{display:inline-block;background:#fff;color:#2f6247;border:1px solid #2f6247;font-weight:600;padding:7px 14px;border-radius:8px;font-size:13px;cursor:pointer;text-decoration:none}
		.add-card{border:2px dashed var(--line);background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:180px;cursor:pointer;color:var(--muted)}
		.add-card:hover{border-color:#2f6247;color:#2f6247}
		.add-card .plus{font-size:36px;margin-bottom:8px}
		.modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:100;align-items:center;justify-content:center}
		.modal.open{display:flex}
		.modal-box{background:#fff;border-radius:12px;padding:24px;max-width:440px;width:90%;max-height:80vh;overflow:auto}
		.modal-box h3{margin:0 0 12px}
		input,textarea,select{width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--line);border-radius:8px;font-size:14px;margin:0 0 10px}
		textarea{min-height:80px;resize:vertical}
		.user-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}
		.user-row:last-child{border-bottom:none}
	</style></head><body>
	<header><div style="display:flex;justify-content:space-between;align-items:start"><div><h1>My Workspace</h1><p>Your ideas and your projects. Jot it down, let it mature, make it real.</p></div><div style="text-align:right"><div id="who" style="font-size:13px;opacity:.85;margin-bottom:4px"></div><a href="/login" onclick="try{sessionStorage.removeItem('nwana_engine_session')}catch(e){}try{localStorage.removeItem('nwana_operating_center_key')}catch(e){}try{sessionStorage.removeItem('nwana_preview_tenant')}catch(e){}" style="font-size:13px;color:#fff">Sign out</a></div></div></header>
	<main>
		<h2>My Ideas</h2>
		<p class="sub">Jot it down. Let it sit. If you haven't cooled off — make it a project.</p>
		<div id="ideas" class="grid"><div class="card"><p class="kind">Loading…</p></div></div>

		<h2>My Projects</h2>
		<p class="sub">Ideas that became real. Each has its own workspace and team.</p>
		<div id="projects" class="grid"><div class="card"><p class="kind">Loading…</p></div></div>
	</main>

	<div class="modal" id="idea-modal"><div class="modal-box">
		<h3>New idea</h3>
		<input id="idea-name" placeholder="Idea name">
		<textarea id="idea-summary" placeholder="What is it? A few sentences."></textarea>
		<div><button class="btn" onclick="saveIdea()">Add idea</button>
		<button class="btn2" onclick="closeModal('idea-modal')">Cancel</button></div>
	</div></div>

	<div class="modal" id="team-modal"><div class="modal-box">
		<h3 id="team-title">Team</h3>
		<div id="team-list"></div>
		<h3 style="margin-top:16px;font-size:15px">Add person</h3>
		<input id="team-email" placeholder="Email">
		<select id="team-role"><option value="business_unit_user">Member</option><option value="tenant_admin">Admin</option></select>
		<div><button class="btn" onclick="addTeamMember()">Add</button>
		<button class="btn2" onclick="closeModal('team-modal')">Close</button></div>
	</div></div>

	<script>(function(){
		function getTok(){try{var t=sessionStorage.getItem('nwana_engine_session');if(t)return t;}catch(e){}try{var t2=localStorage.getItem('nwana_operating_center_key');if(t2)return t2;}catch(e){}return '';}
		var k=getTok();
		if(!k){document.querySelector('main').innerHTML='<div class="card"><p>Please <a href="/login">sign in</a>.</p></div>';return;}
		function H(){return {authorization:'Bearer '+k,'content-type':'application/json'};}
		function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
		var curTeamTenant=null;
		fetch('/api/auth/session',{headers:H()}).then(function(r){return r.json()}).then(function(s){
			if(s&&s.user){var w=document.getElementById('who');if(w)w.textContent='Signed in as '+(s.user.display_name||s.user.email);}
		}).catch(function(){});

		function loadIdeas(){
			fetch('/api/my/ideas',{headers:H()}).then(function(r){return r.json()}).then(function(d){
				var box=document.getElementById('ideas');
				var list=d.ideas||[];
				var cards=list.map(function(t){
					var desc=t.summary&&t.summary.length>160?t.summary.slice(0,160)+'…':(t.summary||'');
					var btn=t.tenant_id
						?'<span class="badge op">now a project</span>'
						:'<button class="btn" onclick="promoteIdea(\''+String(t.idea_id).replace(/'/g,"")+'\')">Make it a project</button>';
					return '<div class="card"><span class="badge">'+esc(t.stage)+'</span>'+
						'<h3>'+esc(t.name)+'</h3>'+
						(desc?'<p class="desc">'+esc(desc)+'</p>':'<p class="desc"></p>')+
						'<div class="actions">'+btn+'</div></div>';
				}).join('');
				cards+='<div class="card add-card" onclick="openModal(\'idea-modal\')"><div class="plus">+</div><div>New idea</div></div>';
				box.innerHTML=cards;
			}).catch(function(){});
		}
		function loadProjects(){
			fetch('/api/my/tenants',{headers:H()}).then(function(r){return r.json()}).then(function(d){
				var box=document.getElementById('projects');
				var list=d.tenants||[];
				if(!list.length){box.innerHTML='<div class="card"><p class="kind">No projects yet. Promote an idea above.</p></div>';return;}
				box.innerHTML=list.map(function(t){
					var st=t.status==='active'?'<span class="badge op">active</span>':'<span class="badge">'+esc(t.status||'')+'</span>';
					return '<div class="card">'+st+
						'<h3>'+esc(t.display_name)+'</h3>'+
						'<p class="kind">'+esc(t.tenant_id||'')+'</p>'+
						'<div class="actions"><a class="btn" href="#" onclick="openProject(\''+String(t.tenant_id).replace(/'/g,"")+'\');return false;">Open workspace</a>'+
						'<button class="btn2" onclick="openTeam(\''+String(t.tenant_id).replace(/'/g,"")+'\',\''+esc(t.display_name).replace(/'/g,"")+'\')">Team</button></div></div>';
				}).join('');
			}).catch(function(){});
		}
		window.openModal=function(id){document.getElementById(id).classList.add('open');};
		window.closeModal=function(id){document.getElementById(id).classList.remove('open');};
		window.saveIdea=function(){
			var name=document.getElementById('idea-name').value.trim();
			var summary=document.getElementById('idea-summary').value.trim();
			if(!name){alert('Give the idea a name.');return;}
			fetch('/api/my/ideas',{headers:H(),method:'POST',body:JSON.stringify({name:name,summary:summary})}).then(function(r){return r.json()}).then(function(d){
				if(d.ok){document.getElementById('idea-name').value='';document.getElementById('idea-summary').value='';closeModal('idea-modal');loadIdeas();}
				else{alert(d.error||'Could not save.');}
			});
		};
		window.promoteIdea=function(idea_id){
			if(!confirm('Make this idea a project? It will get its own workspace.'))return;
			fetch('/api/my/ideas/'+encodeURIComponent(idea_id)+'/promote',{headers:H(),method:'POST'}).then(function(r){return r.json()}).then(function(d){
				if(d.ok){loadIdeas();loadProjects();}
				else{alert(d.error||'Could not promote.');}
			});
		};
		window.openProject=function(tenant_id){
			try{sessionStorage.setItem('nwana_preview_tenant',tenant_id);}catch(e){}
			window.location.href='/operating-center';
		};
		window.openTeam=function(tenant_id,name){
			curTeamTenant=tenant_id;
			document.getElementById('team-title').textContent='Team — '+name;
			loadTeam();
			openModal('team-modal');
		};
		function loadTeam(){
			if(!curTeamTenant)return;
			fetch('/api/my/tenants/'+encodeURIComponent(curTeamTenant)+'/users',{headers:H()}).then(function(r){return r.json()}).then(function(d){
				var box=document.getElementById('team-list');
				var list=d.users||[];
				box.innerHTML=list.length?list.map(function(u){
					return '<div class="user-row"><span>'+esc(u.display_name||u.email)+'<br><span style="color:var(--muted);font-size:12px">'+esc(u.email||'')+'</span></span><span class="badge">'+esc(u.role)+'</span></div>';
				}).join(''):'<p class="kind">No team members yet.</p>';
			}).catch(function(){});
		}
		window.addTeamMember=function(){
			var email=document.getElementById('team-email').value.trim();
			var role=document.getElementById('team-role').value;
			if(!email||!curTeamTenant){alert('Enter an email.');return;}
			fetch('/api/my/tenants/'+encodeURIComponent(curTeamTenant)+'/users',{headers:H(),method:'POST',body:JSON.stringify({email:email,role:role})}).then(function(r){return r.json()}).then(function(d){
				if(d.ok){document.getElementById('team-email').value='';loadTeam();}
				else{alert(d.error||'Could not add.');}
			});
		};
		loadIdeas();loadProjects();
	})();</script></body></html>`;
}
