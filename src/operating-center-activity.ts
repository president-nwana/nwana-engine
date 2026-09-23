// ADR-0026: the activity feed lives on its own page. The main
// overview keeps only a compact summary card. Full functionality:
// what is happening (audit events), what is new, what requires
// reading, and owner-wide read acknowledgment.

import { operatingCenterMenu } from "./operating-center";

export function renderActivityHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Activity — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
		.oc-menu-btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
		.oc-menu-btn:hover{background:#3a7455}.oc-menu-active{background:#fff;color:var(--brand)}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		h2{margin:0 0 14px;font-size:22px}h3{margin:18px 0 8px;font-size:18px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,button{font:inherit}input{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white;width:100%}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;margin-top:14px}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:12px 0}.item:first-of-type{border-top:0}.item strong{display:block}
	</style>
</head>
<body>
	<header><h1>Activity</h1><p>What is happening, what is new, and what requires the owner's eyes. Newest first.</p></header>
	${operatingCenterMenu("activity")}
	<main>
		<section class="panel" id="gate" hidden>
			<h2>Owner access</h2>
			<p class="unavailable">This page is private. Enter the operating center key to continue.</p>
			<form id="key-form">
				<label for="owner-key">Operating center key</label>
				<input id="owner-key" name="owner_key" type="password" autocomplete="current-password" required>
				<button type="submit">Open activity</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
			<section class="panel">
				<h2>Requires reading</h2>
				<div id="activity-reading">Loading…</div>
			</section>
			<section class="panel">
				<h2>What is new</h2>
				<div id="activity-new">Loading…</div>
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
		async function loadActivity(){
			const reading=document.querySelector('#activity-reading');
			const fresh=document.querySelector('#activity-new');
			try{
				const data=await api('/api/operating-center/activity');
				const req=data.items.filter(i=>i.requires_reading);
				const rest=data.items.filter(i=>!i.requires_reading);
				reading.innerHTML=req.length?req.map(i=>'<div class="item"><strong>'+esc(i.label)+'</strong>'+(i.detail?'<div class="meta">'+esc(i.detail)+'</div>':'')+'<div class="meta">'+esc(i.ts)+'</div><button data-ack="'+esc(i.id)+'" style="width:auto">Mark as read</button></div>').join(''):'<div class="unavailable">Nothing requires reading.</div>';
				fresh.innerHTML=rest.length?rest.slice(0,30).map(i=>'<div class="item">'+esc(i.label)+'<div class="meta">'+esc(i.ts)+'</div></div>').join(''):'<div class="unavailable">No recent activity.</div>';
				reading.querySelectorAll('[data-ack]').forEach(btn=>btn.addEventListener('click',()=>ackRead(btn.dataset.ack)));
			}catch(err){reading.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';fresh.innerHTML=''}
		}
		async function ackRead(itemId){
			try{
				await api('/api/operating-center/activity/acknowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({item_id:itemId})});
				loadActivity();
			}catch(err){alert('Failed: '+err.message)}
		}
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();loadActivity()});
		if(getKey()){showApp();loadActivity()}else{showGate('')}
	</script>
</body></html>`;
}
