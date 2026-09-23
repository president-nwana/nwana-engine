// Board uploads page: the upload form and the routed uploads list with the
// staged contacts CSV download. The main overview shows only a compact
// summary; the full workspace lives here.

import { operatingCenterMenu } from "./operating-center";

export function renderUploadsHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Board uploads — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
		.oc-menu-btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
		.oc-menu-btn:hover{background:#3a7455}.oc-menu-active{background:#fff;color:var(--brand)}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		.nav{margin-bottom:18px}.nav a{color:var(--brand);font-weight:650}
		h2{margin:0 0 14px;font-size:22px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,button{font:inherit}input{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white;width:100%}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;margin-top:14px}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:12px 0}.item:first-of-type{border-top:0}.item strong{display:block}
	</style>
</head>
<body>
	<header><h1>Board uploads</h1><p>Drop a file and the machine routes it: contacts to RunSignup staging, tasks to tracked work, discussion material to the meeting agenda, news material to media drafts. Accepted: CSV, TXT, MD, TSV, JSON. Max 512 KB.</p></header>
	${operatingCenterMenu("uploads")}
	<main>
		<div class="nav"><a href="/operating-center">← Back to Operating Center</a></div>
		<section class="panel" id="gate" hidden>
			<h2>Owner access</h2>
			<p class="unavailable">This page is private. Enter the operating center key to continue.</p>
			<form id="key-form">
				<label for="owner-key">Operating center key</label>
				<input id="owner-key" name="owner_key" type="password" autocomplete="current-password" required>
				<button type="submit">Open uploads</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
			<section class="panel">
				<h2>Upload a file</h2>
				<form id="upload-form" enctype="multipart/form-data" style="margin-bottom:12px">
					<label for="upload-name">Your name</label>
					<input id="upload-name" name="uploaded_by" required maxlength="120" placeholder="Who is uploading">
					<label for="upload-file">File</label>
					<input id="upload-file" name="file" type="file" required accept=".csv,.txt,.md,.tsv,.json">
					<button type="submit">Upload and route</button>
					<div class="message" id="upload-message" aria-live="polite"></div>
				</form>
			</section>
			<section class="panel">
				<h2>Routed uploads</h2>
				<div id="uploads-list">Loading…</div>
			</section>
		</div>
	</main>
	<script>
		const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
		const KEY_STORAGE='nwana_operating_center_key';
		const gate=document.querySelector('#gate');
		const app=document.querySelector('#app');
		function getKey(){try{return localStorage.getItem(KEY_STORAGE)||''}catch(e){return ''}}
		function setKey(k){try{localStorage.setItem(KEY_STORAGE,k)}catch(e){}}
		function clearKey(){try{localStorage.removeItem(KEY_STORAGE)}catch(e){}}
		function showGate(message){app.hidden=true;gate.hidden=false;if(message)document.querySelector('#key-message').textContent=message}
		function showApp(){gate.hidden=true;app.hidden=false}
		async function api(path,options){const r=await fetch(path,Object.assign({},options||{},{headers:Object.assign({},(options&&options.headers)||{},{authorization:'Bearer '+getKey()})}));let d=null;try{d=await r.json()}catch(e){}if(r.status===401){clearKey();showGate('The key was rejected. Enter the owner key again.');throw new Error('Unauthorized')}if(!r.ok)throw new Error((d&&d.error)||'Request failed');return d}
		async function loadUploads(){
			const box=document.querySelector('#uploads-list');
			try{
				const data=await api('/api/operating-center/uploads');
				if(!data.uploads.length){box.innerHTML='<div class="unavailable">No uploads yet.</div>';return}
				box.innerHTML=data.uploads.map(u=>'<div class="item"><strong>'+esc(u.filename)+'</strong><div class="meta">'+esc(u.route_label)+' · '+esc(u.classification)+' · '+esc(u.uploaded_by||'unknown')+' · '+esc(u.created_at)+'</div>'+(u.staged_csv_url?'<div class="meta"><a href="'+esc(u.staged_csv_url)+'">Download staged contacts CSV</a> (import by hand in RunSignup Email Marketing)</div>':'')+'</div>').join('');
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		document.querySelector('#upload-form').addEventListener('submit',async(e)=>{
			e.preventDefault();
			const m=document.querySelector('#upload-message');m.textContent='Uploading and routing…';
			try{
				const fd=new FormData(e.target);
				const file=fd.get('file');
				if(file&&file.size>512*1024){m.textContent='File is too large. Maximum 512 KB.';return}
				const res=await fetch('/api/operating-center/uploads',{method:'POST',headers:{authorization:'Bearer '+getKey()},body:fd});
				const data=await res.json();
				if(!res.ok)throw new Error(data.error||'Upload failed');
				m.textContent='Uploaded and routed: '+data.route_label+'.';
				e.target.reset();
				await loadUploads();
			}catch(err){m.textContent=err.message}
		});
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();loadUploads()});
		if(getKey()){showApp();loadUploads()}else{showGate('')}
	</script>
</body></html>`;
}
