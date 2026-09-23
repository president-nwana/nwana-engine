// ADR-0026: sponsorship assets live on their own page. The main
// overview keeps only a compact summary card. The machine generates the
// package and tracks its pipeline; seller conversations stay human.
// Full functionality: generate form, asset list, and stage advancement
// against /api/operating-center/sponsorship-assets/advance.

import { operatingCenterMenu } from "./operating-center";

export function renderSponsorshipHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Sponsorship assets — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
		.oc-menu-btn{display:inline-block;background:#2f6247;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
		.oc-menu-btn:hover{background:#3a7455}.oc-menu-active{background:#fff;color:var(--brand)}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		h2{margin:0 0 14px;font-size:22px}h3{margin:18px 0 8px;font-size:18px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,select,button{font:inherit}input,select{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white;width:100%}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;margin-top:14px}
		button.secondary{background:white;color:var(--brand);border:1px solid var(--brand);width:auto;margin:8px 8px 0 0}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:14px 0}.item:first-of-type{border-top:0}.item strong{display:block}
		.badge{display:inline-block;background:var(--accent);border-radius:6px;padding:2px 8px;font-size:13px;color:var(--brand);font-weight:650;margin-left:8px}
		.detail{margin:6px 0;font-size:15px}.detail b{color:var(--muted);font-weight:650}
	</style>
</head>
<body>
	<header><h1>Sponsorship assets</h1><p>Machine-generated seller packages, one per object. Stages: draft → packaged → offered → negotiating → committed → fulfilled → renewal. The machine generates and tracks; seller conversations stay human.</p></header>
	${operatingCenterMenu("sponsorship")}
	<main>
		<section class="panel" id="gate" hidden>
			<h2>Owner access</h2>
			<p class="unavailable">This page is private. Enter the operating center key to continue.</p>
			<form id="key-form">
				<label for="owner-key">Operating center key</label>
				<input id="owner-key" name="owner_key" type="password" autocomplete="current-password" required>
				<button type="submit">Open sponsorship</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
			<section class="panel">
				<h2>Generate a package</h2>
				<form id="sponsorship-generate-form">
					<label for="sponsorship-object-type">Object type</label>
					<select id="sponsorship-object-type" name="object_type"><option value="series">series</option><option value="fund">fund</option></select>
					<label for="sponsorship-object-id">Object id</label>
					<input id="sponsorship-object-id" name="object_id" required maxlength="120" placeholder="SERIES_2026 or a fund id">
					<button type="submit">Generate package</button>
					<div class="message" id="sponsorship-generate-message" aria-live="polite"></div>
				</form>
			</section>
			<section class="panel">
				<h2>Assets</h2>
				<div class="message" id="sponsorship-message" aria-live="polite"></div>
				<div id="sponsorship-assets">Loading…</div>
			</section>
		</div>
	</main>
	<script>
		const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
		const KEY_STORAGE='nwana_operating_center_key';
		const gate=document.querySelector('#gate');
		const app=document.querySelector('#app');
		const LABEL={draft:'Draft',packaged:'Packaged',offered:'Offered',negotiating:'Negotiating',committed:'Committed',fulfilled:'Fulfilled',renewal:'Renewal'};
		const TRANSITIONS={draft:['packaged'],packaged:['draft','offered'],offered:['packaged','negotiating'],negotiating:['offered','committed'],committed:['negotiating','fulfilled'],fulfilled:['committed','renewal'],renewal:[]};
		function getKey(){try{return localStorage.getItem(KEY_STORAGE)||''}catch(e){return ''}}
		function setKey(k){try{localStorage.setItem(KEY_STORAGE,k)}catch(e){}}
		function clearKey(){try{localStorage.removeItem(KEY_STORAGE)}catch(e){}}
		function showGate(message){app.hidden=true;gate.hidden=false;if(message)document.querySelector('#key-message').textContent=message}
		function showApp(){gate.hidden=true;app.hidden=false}
		async function api(path,options){const r=await fetch(path,Object.assign({},options||{},{headers:Object.assign({},(options&&options.headers)||{},{authorization:'Bearer '+getKey()})}));let d=null;try{d=await r.json()}catch(e){}if(r.status===401){clearKey();showGate('The key was rejected. Enter the owner key again.');throw new Error('Unauthorized')}if(!r.ok)throw new Error((d&&d.error)||'Request failed');return d}
		function formJson(form){return Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,String(v)]))}
		async function advanceAsset(assetId,toStage,msg){
			msg.textContent='Moving…';
			try{
				await api('/api/operating-center/sponsorship-assets/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({asset_id:assetId,to_stage:toStage})});
				msg.textContent='Moved to '+toStage+'.';
				await loadAssets();
			}catch(err){msg.textContent=err.message}
		}
		async function loadAssets(){
			const box=document.querySelector('#sponsorship-assets');
			const msg=document.querySelector('#sponsorship-message');
			try{
				const data=await api('/api/operating-center/sponsorship-assets');
				const assets=data.assets||[];
				if(!assets.length){box.innerHTML='<div class="unavailable">No sponsorship assets yet. Generate one above.</div>';return}
				box.innerHTML=assets.map(a=>{
					const moves=(TRANSITIONS[a.stage]||[]);
					const buttons=moves.map(s=>'<button class="secondary" data-advance="'+esc(a.id)+'" data-to="'+esc(s)+'" type="button">Move to '+esc(LABEL[s]||s)+'</button>').join('');
					return '<div class="item"><strong>'+esc(a.title)+'<span class="badge">'+esc(LABEL[a.stage]||a.stage)+'</span></strong>'+
						'<div class="meta">'+esc(a.object_type)+' · '+esc(a.object_id)+(a.stage_updated_at?' · stage updated '+esc(String(a.stage_updated_at).slice(0,10)):'')+'</div>'+
						(a.description?'<div class="detail"><b>Package:</b> '+esc(a.description)+'</div>':'')+
						(a.audience?'<div class="detail"><b>Audience:</b> '+esc(a.audience)+'</div>':'')+
						(a.delivers?'<div class="detail"><b>Delivers:</b> '+esc(a.delivers)+'</div>':'')+
						(a.reference_pricing?'<div class="detail"><b>Reference pricing:</b> '+esc(a.reference_pricing)+'</div>':'')+
						(a.next_action?'<div class="detail"><b>Next action:</b> '+esc(a.next_action)+'</div>':'')+
						(buttons?'<div>'+buttons+'</div>':'<div class="meta">Terminal stage.</div>')+
						'</div>';
				}).join('');
				box.querySelectorAll('[data-advance]').forEach(b=>b.addEventListener('click',()=>advanceAsset(b.dataset.advance,b.dataset.to,msg)));
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		document.querySelector('#sponsorship-generate-form').addEventListener('submit',async(e)=>{
			e.preventDefault();
			const m=document.querySelector('#sponsorship-generate-message');m.textContent='Generating…';
			try{
				const fd=formJson(e.target);
				const data=await api('/api/operating-center/sponsorship-assets/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({object_type:fd.object_type,object_id:fd.object_id})});
				m.textContent=data.generated?'Package generated.':'Package already exists.';
				await loadAssets();
			}catch(err){m.textContent=err.message}
		});
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();loadAssets()});
		if(getKey()){showApp();loadAssets()}else{showGate('')}
	</script>
</body></html>`;
}
