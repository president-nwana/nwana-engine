// ADR-0021: the media plan workspace. The machine composes the plan,
// drafts the articles, and publishes them to site_news after owner
// approval. RunSignup is not involved anywhere in this workflow.

import { operatingCenterMenu } from "./operating-center";

export function renderMediaHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Media plan — NWANA Operating Center</title>
	<style>
		:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d;--accent:#e5efe9}
		*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
		header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#dce9e2}
		main{max-width:1240px;margin:auto;padding:28px 20px 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
		.nav{margin-bottom:18px}.nav a{color:var(--brand);font-weight:650}
		h2{margin:0 0 14px;font-size:22px}h3{margin:18px 0 8px;font-size:18px}
		label{display:block;margin:12px 0 5px;font-weight:650}input,select,textarea,button{font:inherit;width:100%}
		input,select,textarea{border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white}textarea{min-height:120px;resize:vertical}
		button{border:0;border-radius:9px;padding:11px 14px;background:var(--brand);color:white;font-weight:700;cursor:pointer;margin-top:14px}
		button.secondary{background:white;color:var(--brand);border:1px solid var(--brand);width:auto;margin-right:8px}
		.message{min-height:24px;color:var(--muted);margin-top:9px}.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
		.item{border-top:1px solid var(--line);padding:12px 0}.item:first-of-type{border-top:0}.item strong{display:block}
		.badge{display:inline-block;background:var(--accent);border-radius:6px;padding:2px 8px;font-size:13px;color:var(--brand);font-weight:650;margin-left:8px}
		.angle{font-style:italic;color:var(--muted);font-size:14px;margin:4px 0}
		.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.row button{width:auto;margin-top:0}
	</style>
</head>
<body>
	<header><h1>Media plan</h1><p>Nordic Walking articles beyond event news. The machine composes the plan from verified sources and drafts the articles; nothing publishes without owner approval. Publication goes to the site news feed; external press distribution is recorded separately.</p></header>
	${operatingCenterMenu("media")}
	<main>
		<div class="nav"><a href="/operating-center">← Back to Operating Center</a></div>
		<section class="panel" id="gate" hidden>
			<h2>Owner access</h2>
			<p class="unavailable">This page is private. Enter the operating center key to continue.</p>
			<form id="key-form">
				<label for="owner-key">Operating center key</label>
				<input id="owner-key" name="owner_key" type="password" autocomplete="current-password" required>
				<button type="submit">Open media plan</button>
				<div class="message" id="key-message" aria-live="polite"></div>
			</form>
		</section>
		<div id="app" hidden>
			<section class="panel">
				<h2>Plans</h2>
				<div id="plans">Loading…</div>
				<div class="message" id="plans-message" aria-live="polite"></div>
				<div class="row" style="margin-top:8px"><button id="compose-plan" class="secondary" type="button">Compose plan from verified sources</button></div>
				<div class="meta">The machine builds a draft plan from verified sources only: upcoming races, published winner announcements, board material routed to media, and the verified NWANA pillars. Every article slot cites its source; the machine never invents topics.</div>
				<form id="plan-form">
					<h3>New plan</h3>
					<label for="plan-title">Title</label><input id="plan-title" name="title" required maxlength="200">
					<label for="plan-period">Period</label><input id="plan-period" name="period" maxlength="60" placeholder="Q4 2026">
					<label for="plan-notes">Notes</label><textarea id="plan-notes" name="notes"></textarea>
					<button type="submit" class="secondary">Create plan</button>
					<div class="message" aria-live="polite"></div>
				</form>
			</section>
			<section class="panel" id="plan-detail-panel" hidden>
				<h2 id="plan-detail-title">Plan</h2>
				<div class="meta" id="plan-detail-meta"></div>
				<div class="row" id="plan-actions"></div>
				<div class="message" id="plan-detail-message" aria-live="polite"></div>
				<h3>Articles</h3>
				<div id="articles">Loading…</div>
				<form id="article-form">
					<h3>Add article</h3>
					<label for="article-title">Title</label><input id="article-title" name="title" required maxlength="200">
					<label for="article-angle">Angle</label><textarea id="article-angle" name="angle" style="min-height:60px"></textarea>
					<button type="submit" class="secondary">Add article</button>
					<div class="message" aria-live="polite"></div>
				</form>
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
		let selectedPlan=null;
		const PLAN_LABEL={DRAFT:'Draft',APPROVED:'Approved',IN_PROGRESS:'In progress',DONE:'Done'};
		const ART_LABEL={DRAFT:'Draft',READY:'Ready for review',APPROVED:'Approved',PUBLISHED:'Published'};
		async function loadPlans(){
			const box=document.querySelector('#plans');
			try{
				const data=await api('/api/operating-center/media/plans');
				if(!data.plans.length){box.innerHTML='<div class="unavailable">No media plans yet. Create one below: the machine provides the plan and article lifecycle, you provide the topics.</div>';return}
				box.innerHTML=data.plans.map(p=>'<div class="item"><strong>'+esc(p.title)+'<span class="badge">'+esc(PLAN_LABEL[p.status]||p.status)+'</span></strong>'+
					'<div class="meta">'+(p.period?esc(p.period)+' · ':'')+p.article_count+' articles · '+p.published_count+' published</div>'+
					'<div class="row"><button data-plan="'+esc(p.plan_id)+'" class="secondary" type="button">Open plan</button></div></div>').join('');
				box.querySelectorAll('[data-plan]').forEach(b=>b.addEventListener('click',()=>openPlan(b.dataset.plan)));
			}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		}
		async function openPlan(planId){
			selectedPlan=planId;
			const panel=document.querySelector('#plan-detail-panel');
			panel.hidden=false;
			try{
				const d=await api('/api/operating-center/media/plans/'+encodeURIComponent(planId));
				const p=d.plan;
				document.querySelector('#plan-detail-title').textContent=p.title;
				document.querySelector('#plan-detail-meta').textContent=(p.period?p.period+' · ':'')+PLAN_LABEL[p.status]+(p.notes?' · '+p.notes:'');
				const actions=document.querySelector('#plan-actions');
				actions.innerHTML=p.status==='DRAFT'?'<button id="approve-plan" class="secondary" type="button">Approve plan</button>':'';
				const ab=document.querySelector('#approve-plan');
				if(ab)ab.addEventListener('click',async()=>{
					const m=document.querySelector('#plan-detail-message');m.textContent='Approving…';
					try{await api('/api/operating-center/media/plans/'+encodeURIComponent(planId)+'/approve',{method:'POST'});m.textContent='Plan approved.';await loadPlans();await openPlan(planId)}catch(err){m.textContent=err.message}
				});
				const box=document.querySelector('#articles');
				const arts=d.articles||[];
				box.innerHTML=arts.length?arts.map(a=>{
					let row='<div class="item"><strong>'+esc(a.title)+'<span class="badge">'+esc(ART_LABEL[a.status]||a.status)+'</span></strong>';
					if(a.angle)row+='<div class="angle">'+esc(a.angle)+'</div>';
					if(a.published_at)row+='<div class="meta">Published '+esc(String(a.published_at).slice(0,10))+'</div>';
					row+='<div class="row">';
					if(a.status==='DRAFT'||a.status==='READY')row+='<button data-edit="'+esc(a.article_id)+'" class="secondary" type="button">Write / edit draft</button>';
					if(a.status==='READY')row+='<button data-approve-article="'+esc(a.article_id)+'" class="secondary" type="button">Approve article</button>';
					if(a.status==='APPROVED')row+='<button data-publish="'+esc(a.article_id)+'" class="secondary" type="button">Publish to site news</button>';
					row+='</div><div class="message" aria-live="polite"></div>';
					if(a.status==='PUBLISHED'){
						row+='<div data-distributions="'+esc(a.article_id)+'"><div class="meta">Loading distributions…</div></div>';
						row+='<div data-distribute-form="'+esc(a.article_id)+'" hidden><h3 style="font-size:16px;margin:12px 0 4px">Record external distribution</h3>'+
							'<div class="meta">The send itself happens outside this system by the owner. Recording it here keeps the press trail in one place.</div>'+
							'<label>Channel</label><select data-channel><option>PRESS_RELEASE</option><option>EMAIL_PITCH</option><option>WIRE</option><option>MEDIA_KIT</option><option>OTHER</option></select>'+
							'<label>Outlet (optional)</label><input data-outlet maxlength="200" placeholder="Outlet or journalist name">'+
							'<label>Notes (optional)</label><textarea data-notes style="min-height:60px" placeholder="What was sent, to whom, follow-up"></textarea>'+
							'<div class="row"><button data-record-dist="'+esc(a.article_id)+'" class="secondary" type="button">Record distribution</button>'+
							'<button data-toggle-distform="'+esc(a.article_id)+'" class="secondary" type="button">Cancel</button></div></div>';
						row+='<div class="row"><button data-show-distform="'+esc(a.article_id)+'" class="secondary" type="button">Record external distribution</button></div>';
					}
					row+='<div data-editor="'+esc(a.article_id)+'" hidden><label>Article body (HTML)</label><textarea data-body style="min-height:220px"></textarea><div class="row"><button data-save-body="'+esc(a.article_id)+'" class="secondary" type="button">Save draft</button></div></div>';
					return row+'</div>';
				}).join(''):'<div class="unavailable">No articles yet.</div>';
				box.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{
					const ed=box.querySelector('[data-editor="'+b.dataset.edit+'"]');
					ed.hidden=!ed.hidden;
				}));
				box.querySelectorAll('[data-save-body]').forEach(b=>b.addEventListener('click',async()=>{
					const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Saving…';
					const body=box.querySelector('[data-editor="'+b.dataset.saveBody+'"] [data-body]').value;
					try{await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.saveBody)+'/body',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body_html:body})});msg.textContent='Draft saved: ready for review.';await openPlan(selectedPlan)}catch(err){msg.textContent=err.message}
				}));
				box.querySelectorAll('[data-approve-article]').forEach(b=>b.addEventListener('click',async()=>{
					const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Approving…';
					try{await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.approveArticle)+'/approve',{method:'POST'});msg.textContent='Approved.';await loadPlans();await openPlan(selectedPlan)}catch(err){msg.textContent=err.message}
				}));
				box.querySelectorAll('[data-publish]').forEach(b=>b.addEventListener('click',async()=>{
					const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Publishing…';
					try{const r=await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.publish)+'/publish',{method:'POST'});msg.textContent='Published to site news.';await loadPlans();await openPlan(selectedPlan)}catch(err){msg.textContent=err.message}
				}));
				async function loadDistributions(articleId){
					const box2=box.querySelector('[data-distributions="'+articleId+'"]');
					if(!box2)return;
					try{
						const d=await api('/api/operating-center/media/articles/'+encodeURIComponent(articleId)+'/distributions');
						const ds=d.distributions||[];
						box2.innerHTML='<div class="meta" style="margin-top:8px">External distribution:</div>'+
							(ds.length?ds.map(x=>'<div class="item"><strong>'+esc(x.channel)+'</strong>'+(x.outlet_name?'<div class="meta">'+esc(x.outlet_name)+'</div>':'')+'<div class="meta">Recorded '+esc(String(x.sent_at).slice(0,10))+(x.notes?' · '+esc(x.notes):'')+'</div></div>').join(''):'<div class="unavailable">Not distributed externally yet.</div>');
					}catch(err){box2.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
				}
				box.querySelectorAll('[data-distributions]').forEach(el=>loadDistributions(el.dataset.distributions));
				box.querySelectorAll('[data-show-distform]').forEach(b=>b.addEventListener('click',()=>{
					const f=box.querySelector('[data-distribute-form="'+b.dataset.showDistform+'"]');
					if(f)f.hidden=false;
				}));
				box.querySelectorAll('[data-toggle-distform]').forEach(b=>b.addEventListener('click',()=>{
					const f=box.querySelector('[data-distribute-form="'+b.dataset.toggleDistform+'"]');
					if(f)f.hidden=true;
				}));
				box.querySelectorAll('[data-record-dist]').forEach(b=>b.addEventListener('click',async()=>{
					const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Recording…';
					const f=box.querySelector('[data-distribute-form="'+b.dataset.recordDist+'"]');
					try{
						await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.recordDist)+'/distribute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel:f.querySelector('[data-channel]').value,outlet_name:f.querySelector('[data-outlet]').value,notes:f.querySelector('[data-notes]').value})});
						msg.textContent='Distribution recorded.';f.hidden=true;await loadDistributions(b.dataset.recordDist);
					}catch(err){msg.textContent=err.message}
				}));
				panel.scrollIntoView();
			}catch(err){document.querySelector('#plan-detail-message').textContent=err.message}
		}
		document.querySelector('#compose-plan').addEventListener('click',async()=>{
			const m=document.querySelector('#plans-message');m.textContent='Composing plan from verified sources…';
			try{
				const r=await api('/api/operating-center/media/plans/compose',{method:'POST'});
				m.textContent='Composed: '+r.article_count+' article slots, all with cited sources.';
				await loadPlans();await openPlan(r.plan_id);
			}catch(err){m.textContent=err.message}
		});
		document.querySelector('#plan-form').addEventListener('submit',async e=>{
			e.preventDefault();const m=e.target.querySelector('.message');m.textContent='Creating…';
			try{
				const fd=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,String(v)]));
				const r=await api('/api/operating-center/media/plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fd)});
				e.target.reset();m.textContent='Created.';await loadPlans();await openPlan(r.plan_id);
			}catch(err){m.textContent=err.message}
		});
		document.querySelector('#article-form').addEventListener('submit',async e=>{
			e.preventDefault();const m=e.target.querySelector('.message');m.textContent='Adding…';
			try{
				const fd=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,String(v)]));
				await api('/api/operating-center/media/plans/'+encodeURIComponent(selectedPlan)+'/articles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fd)});
				e.target.reset();m.textContent='Added.';await loadPlans();await openPlan(selectedPlan);
			}catch(err){m.textContent=err.message}
		});
		document.querySelector('#key-form').addEventListener('submit',e=>{e.preventDefault();const k=String(new FormData(e.currentTarget).get('owner_key')||'').trim();const m=document.querySelector('#key-message');if(!k){m.textContent='Enter the key.';return}m.textContent='';setKey(k);showApp();loadPlans()});
		if(getKey()){showApp();loadPlans()}else{showGate('')}
	</script>
</body></html>`;
}
