// My Projects — founder's personal dashboard (2026-10-02)
// Lists tenants the current user can access. Not platform admin.
export function renderMyProjectsSectionHtml(): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My Projects — NWANA Engine</title><style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d}
		body{font-family:system-ui,sans-serif;margin:0;background:var(--paper);color:var(--ink)}
		header{background:var(--brand);color:#fff;padding:28px 24px}
		header h1{margin:0;font-size:28px}header p{margin:6px 0 0;opacity:.85}
		header a{color:#fff}
		main{max-width:1000px;margin:0 auto;padding:20px}
		.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
		.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
		.panel h3{margin:0 0 6px;font-size:17px}
		.meta{color:var(--muted);font-size:13px;margin:0 0 10px}
		.btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px}
		.badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#e5efe9;color:#183d2d}
	</style></head><body>
	<header><div style="display:flex;justify-content:space-between;align-items:start"><div><h1>My Projects</h1><p>Your organizations and startups growing in the Engine.</p></div><div style="text-align:right"><a href="/login" onclick="try{sessionStorage.removeItem('nwana_engine_session')}catch(e){}try{localStorage.removeItem('nwana_operating_center_key')}catch(e){}" style="font-size:13px;color:#fff">Sign out</a></div></div></header>
	<main><div id="app"><div class="panel"><p class="meta">Loading…</p></div></div></main>
	<script>(function(){
		function getTok(){try{var t=sessionStorage.getItem('nwana_engine_session');if(t)return t;}catch(e){}try{var t2=localStorage.getItem('nwana_operating_center_key');if(t2)return t2;}catch(e){}return '';}
		var k=getTok();
		if(!k){document.getElementById('app').innerHTML='<div class="panel"><p>Please <a href="/login">sign in</a>.</p></div>';return;}
		fetch('/api/my/tenants',{headers:{authorization:'Bearer '+k}}).then(function(r){return r.json()}).then(function(d){
			var app=document.getElementById('app');
			var list=d.tenants||[];
			if(!list.length){app.innerHTML='<div class="panel"><p class="meta">No projects yet. Ideas become projects when you are ready.</p></div>';return;}
			app.innerHTML='<div class="grid">'+list.map(function(t){
				return '<div class="panel"><h3>'+t.display_name+'</h3>'+
					'<p class="meta">'+(t.tenant_id||'')+' <span class="badge">'+(t.status||'')+'</span></p>'+
					'<p><a class="btn" href="#" onclick="try{sessionStorage.setItem(\'nwana_preview_tenant\',\''+t.tenant_id+'\')}catch(e){}window.location.href=\'/operating-center\';return false;">Open workspace →</a></p></div>';
			}).join('')+'</div>';
		}).catch(function(){document.getElementById('app').innerHTML='<div class="panel"><p class="meta">Could not load projects.</p></div>';});
	})();</script></body></html>`;
}
