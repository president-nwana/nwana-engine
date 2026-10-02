// Sven / news item distribution review screen for the Operating Center.
// One page: the news item, its content variants, the prepared distribution
// actions with the exact text for each channel, media targets, per-action
// status, owner approval, and manual-last-mile "mark as sent" controls.

import { nwanaWorkspaceMenu } from "./operating-center";

export function renderNewsReviewHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>News distribution review — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9;--warn:#8a5a00;--warnbg:#fdf3e0}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		.nav{margin-bottom:18px}.nav a{color:var(--brand);font-weight:650}
		h2{margin:0 0 14px;font-size:22px}h3{margin:18px 0 8px;font-size:18px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,select,textarea,button{font:inherit;width:100%}
		input,select,textarea{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white}textarea{min-height:120px;resize:vertical}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;margin-top:14px}
		button.secondary{background:white;color:var(--brand);border:1px solid var(--brand);width:auto;margin-right:8px}
		button.approve{background:#1d6b3c;font-size:17px;padding:14px 26px}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:14px 0}.item:first-of-type{border-top:0}.item strong{display:block;font-size:17px}
		.badge{display:inline-block;background:var(--accent);border-radius:6px;padding:2px 8px;font-size:13px;color:var(--brand);font-weight:650;margin-left:8px}
		.badge.warn{background:var(--warnbg);color:var(--warn)}
		.badge.sent{background:#dcefe4;color:#1d6b3c}
		.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}.row button{width:auto;margin-top:0}
		.post-text{background:#fbfdfb;border:1px solid var(--line);border-radius:9px;padding:12px;white-space:pre-wrap;font-size:15px;margin:8px 0;max-height:340px;overflow:auto}
		.post-title{font-weight:700;margin:8px 0 0}
		.notes{background:#fffdf6;border:1px dashed #d8c98f;border-radius:9px;padding:10px 12px;font-size:14px;margin:8px 0;white-space:pre-wrap}
		.source{color:var(--muted);font-size:13px}
		a{color:var(--brand)}
	</style>
</head>
<body>
	<header><h1>News distribution review</h1><p>The prepared news item, its content variants, and every distribution action with the exact text for each channel. Nothing is sent automatically — every channel stays manual last mile.</p></header>
	${nwanaWorkspaceMenu("media")}
	<main>
		<div class="nav"><a href="/operating-center/media">← Back to Media</a></div>
		<section class="panel" id="gate" hidden>
			<h2>Sign-in required</h2>
			<p class="unavailable">Your session has expired or you are not signed in.</p>
			<p><a class="oc-menu-btn" href="/login">Sign in</a></p>
		</section>
		<div id="app" hidden>
			<div class="message" id="app-message" aria-live="polite"></div>
			<section class="panel" id="article-panel"><h2>News item</h2><div id="article">Loading…</div></section>
			<section class="panel"><h2>Content variants</h2><div id="variants">Loading…</div></section>
			<section class="panel">
				<h2>Distribution actions</h2>
				<div class="meta" style="margin-bottom:10px">Each action shows its destination, the exact text to post, and its status. After you post manually on a channel, press “Mark as sent”.</div>
				<div id="distributions">Loading…</div>
			</section>
			<section class="panel" id="approve-panel">
				<h2>Approve</h2>
				<p>Approval marks the draft variants as approved and records your decision in the audit log. It does <strong>not</strong> send or publish anything — every channel stays manual last mile.</p>
				<div class="row"><button id="approve-btn" class="approve" type="button">Approve distribution</button></div>
				<div class="message" id="approve-message" aria-live="polite"></div>
			</section>
		</div>
	</main>
	<script>
		const KEY_STORAGE='nwana-oc-key';
		const app=document.querySelector('#app'),gate=document.querySelector('#gate');
		const params=new URLSearchParams(location.search);
		const ARTICLE_ID=params.get('article_id')||'';
		function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
		function getKey(){try{return sessionStorage.getItem(SESSION_KEY)||''}catch(e){return ''}}
		function signOut(){try{sessionStorage.removeItem(SESSION_KEY)}catch(e){}window.location.href='/login'}
		function showGate(message){signOut()}
		function showApp(){gate.hidden=true;app.hidden=false}
		async function api(path,options){const r=await fetch(path,Object.assign({},options||{},{headers:Object.assign({},(options&&options.headers)||{},{authorization:'Bearer '+getKey()})}));let d=null;try{d=await r.json()}catch(e){}if(r.status===401){signOut();throw new Error('Unauthorized')}if(!r.ok)throw new Error((d&&d.error)||'Request failed');return d}
		const STATUS_BADGE={prepared:'<span class="badge warn">prepared</span>',sent:'<span class="badge sent">sent</span>',DRAFT:'<span class="badge warn">draft</span>',READY:'<span class="badge">ready</span>',APPROVED:'<span class="badge sent">approved</span>',PUBLISHED:'<span class="badge sent">published</span>'};
		function badge(s){return STATUS_BADGE[s]||'<span class="badge">'+esc(s)+'</span>'}
		function copyText(btnId,textId){const b=document.getElementById(btnId);if(!b)return;b.addEventListener('click',async()=>{const t=document.getElementById(textId).textContent;try{await navigator.clipboard.writeText(t);b.textContent='Copied ✓';setTimeout(()=>b.textContent='Copy text',1500)}catch(e){b.textContent='Copy failed'}})}
		async function load(){
			if(!ARTICLE_ID){document.querySelector('#app-message').textContent='Missing article_id in the URL.';return}
			try{
				const d=await api('/api/operating-center/news/review?article_id='+encodeURIComponent(ARTICLE_ID));
				const r=d.review;
				const a=r.article;
				document.querySelector('#article').innerHTML=
					'<div class="item"><strong>'+esc(a.title)+' '+badge(a.status)+'</strong>'+
					'<div class="meta">article_id: '+esc(a.article_id)+' · published: '+esc(a.published_at||'—')+' · kind: '+esc(a.angle||'—')+'</div>'+
					'<div class="post-text">'+esc(a.body_html)+'</div></div>';
				document.querySelector('#variants').innerHTML=r.variants.length?r.variants.map((v,i)=>
					'<div class="item"><strong>'+esc(v.title)+' '+badge(v.status)+'</strong>'+
					'<div class="meta">'+esc(v.variant_type)+' · '+esc(v.variant_id)+'</div>'+
					'<div class="post-text" id="variant-text-'+i+'">'+esc(v.body)+'</div>'+
					'<div class="row"><button class="secondary" type="button" id="copy-variant-'+i+'">Copy text</button></div></div>'
				).join(''):'<div class="unavailable">No variants.</div>';
				r.variants.forEach((v,i)=>copyText('copy-variant-'+i,'variant-text-'+i));
				const allApproved=r.variants.length>0&&r.variants.every(v=>v.status==='APPROVED');
				document.querySelector('#distributions').innerHTML=r.distributions.length?r.distributions.map((x,i)=>{
					const sent=x.status==='sent';
					return '<div class="item" data-dist="'+esc(x.distribution_id)+'"><strong>'+esc(x.outlet_name||x.channel)+' '+badge(x.status)+'</strong>'+
					'<div class="meta">channel: '+esc(x.channel)+' · prepared: '+esc(x.created_at||'—')+(x.sent_at?' · sent: '+esc(x.sent_at):'')+'</div>'+
					(x.post_title?'<div class="post-title">Title: '+esc(x.post_title)+'</div>':'')+
					'<div class="post-text" id="dist-text-'+i+'">'+esc(x.post_text||'(no text)')+'</div>'+
					'<div class="source">Text source: '+esc(x.text_source)+'</div>'+
					(x.notes?'<div class="notes">'+esc(x.notes)+'</div>':'')+
					'<div class="row"><button class="secondary" type="button" id="copy-dist-'+i+'">Copy text</button>'+
					(sent?'':'<button class="secondary" type="button" data-mark-sent="'+esc(x.distribution_id)+'"'+(allApproved?'':' disabled title="Approve the distribution first"')+'>Mark as sent</button>')+'</div>'+
					'<div class="message" data-dist-msg></div></div>';
				}).join(''):'<div class="unavailable">No distribution actions.</div>';
				r.distributions.forEach((x,i)=>copyText('copy-dist-'+i,'dist-text-'+i));
				document.querySelectorAll('[data-mark-sent]').forEach(b=>b.addEventListener('click',async()=>{
					const item=b.closest('.item');const msg=item.querySelector('[data-dist-msg]');msg.textContent='Recording…';
					try{await api('/api/operating-center/news/review/mark-sent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distribution_id:b.dataset.markSent})});msg.textContent='Marked as sent.';await load()}catch(err){msg.textContent=err.message}
				}));
				const ap=document.querySelector('#approve-panel');
				if(allApproved){ap.querySelector('p').innerHTML='Distribution approved. Post each channel manually, then mark it as sent above.';document.querySelector('#approve-btn').disabled=true;document.querySelector('#approve-btn').textContent='Approved ✓'}
			}catch(err){document.querySelector('#app-message').textContent=err.message}
		}
		document.querySelector('#approve-btn').addEventListener('click',async()=>{
			const m=document.querySelector('#approve-message');m.textContent='Approving…';
			try{const r=await api('/api/operating-center/news/review/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({article_id:ARTICLE_ID})});m.textContent='Approved: '+r.variants_approved+' variants, '+r.distributions_prepared+' prepared actions. Nothing was sent.';await load()}catch(err){m.textContent=err.message}
		});
		if(!getKey()){window.location.href='/login'}else{showApp();load()}
	</script>
</body></html>`;
}
