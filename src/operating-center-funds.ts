// ADR-0022: Funds live on their own page, like race results.
// The main operating center keeps only a compact summary card so the
// screen stays informational instead of becoming a warehouse of lists.

export function renderFundsHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Funds — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		.nav{margin-bottom:18px}.nav a{color:var(--brand);font-weight:650}
		h2{margin:0 0 14px;font-size:22px}label{display:block;margin:12px 0 5px;font-weight:650}input,select,textarea,button{font:inherit}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:12px 0}.item:first-child{border-top:0}.item strong{display:block}
		.followup-due{color:#b35400;font-weight:700}.followup-overdue{color:#b00020;font-weight:700}
	</style>
</head>
<body>
	<header><h1>Funds</h1><p>Fund objects and their prospect pipelines. Stages: prospect → verified → drafted → sent → follow-up → committed → stewardship → public recognition. The owner still presses Send and signs; the machine tracks state and routes what comes next.</p></header>
	<main>
		<div class="nav"><a href="/operating-center">← Back to Operating Center</a></div>
		<section class="panel" id="gate" hidden>
			<h2>Owner access</h2>
			<p class="unavailable">This page is private. Enter the operating center key to continue.</p>
			<form id="key-form">
				<label for="owner-key">Operating center key</label>
				<input id="owner-key" name="owner_key" type="password" autocomplete="current-password" required style="width:100%;border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white">
				<button type="submit">Open funds</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
			<section class="panel">
				<div><span class="message" id="fund-message" aria-live="polite"></span></div>
				<div id="funds">Loading…</div>
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
		async function loadFund(){
			const box=document.querySelector('#funds');
			const order=['prospect','verified','drafted','sent','follow_up','committed','stewardship','recognition'];
			const label={prospect:'Prospect',verified:'Verified',drafted:'Drafted',sent:'Sent',follow_up:'Follow-up',committed:'Committed',stewardship:'Stewardship',recognition:'Public recognition'};
			const money=n=>'$'+Number(n||0).toLocaleString('en-US');
			try{
				const data=await api('/api/operating-center/fund');
				if(!data.funds.length){box.innerHTML='<div class="unavailable">No funds yet.</div>';return}
				box.innerHTML=data.funds.map(f=>{
					const counts=order.map(s=>esc(label[s])+': '+f.stage_counts[s]).join(' · ');
					const pct=f.fund.goal_amount?Math.round(100*f.fund.raised_amount/f.fund.goal_amount):0;
					const dueNow=Number(f.follow_ups_due_now||0);
					const dueLine='<div class="meta'+(dueNow?' followup-due':'')+'">Follow-ups due now: '+dueNow+'. The owner presses Send; the machine never sends.</div>';
					const rows=f.prospects.map(p=>{
						const next=order[order.indexOf(p.stage)+1];
						const btn=next?'<button data-advance="'+esc(p.id)+'" data-to="'+esc(next)+'" style="width:auto">Move to '+esc(label[next])+'</button>':'<span class="meta">Terminal stage</span>';
						const fu=p.follow_up_status;
						const fuDate=p.follow_up_due_at?esc(String(p.follow_up_due_at).slice(0,10)):'';
						const fuLine=fu==='none'?'':'<div class="meta '+(fu==='overdue'?'followup-overdue':fu==='due'?'followup-due':'')+'">Follow-up '+(fu==='upcoming'?'due '+fuDate:fu==='due'?'due now ('+fuDate+')':'overdue (was due '+fuDate+')')+'.</div>';
						return '<div class="item"><strong>'+esc(p.name)+'</strong>'+
							'<div class="meta">'+esc(label[p.stage]||p.stage)+' · ask '+esc(p.ask_tier||'')+' · '+(p.sent_at?'sent '+esc(p.sent_at.slice(0,10)):'not sent')+'</div>'+
							fuLine+
							'<div class="meta">Next: '+esc(p.next_action)+'</div>'+
							'<div>'+btn+'</div></div>';
					}).join('');
					return '<div class="item"><strong>'+esc(f.fund.name)+'</strong>'+
						'<div class="meta">Goal '+money(f.fund.goal_amount)+' · Raised '+money(f.fund.raised_amount)+' ('+pct+'%) · '+esc(f.fund.status)+'</div>'+
						dueLine+
						'<div class="meta">'+esc(counts)+'</div>'+rows+'</div>';
				}).join('');
				box.querySelectorAll('[data-advance]').forEach(btn=>btn.addEventListener('click',async()=>{
					const m=document.querySelector('#fund-message');m.textContent='Moving…';
					try{await api('/api/operating-center/fund/prospect/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prospect_id:btn.dataset.advance,to_stage:btn.dataset.to})});m.textContent='Moved.';await loadFund()}catch(err){m.textContent=err.message}
				}));
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();loadFund().catch(err=>{document.querySelector('#funds').innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'})});
		if(getKey()){showApp();loadFund().catch(err=>{document.querySelector('#funds').innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'})}else{showGate('')}
	</script>
</body></html>`;
}
