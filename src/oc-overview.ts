// Operating Center — Overview section.
//
// Four functions: state, money, work, blockers. Every function has:
//   - a 1-2 line human description,
//   - three navigation buttons [ Summary ] [ Actions ] [ Details ],
//   - three SEPARATE views (one visible at a time), deep-linkable as
//     /operating-center/overview?tab=<function>&view=<summary|actions|details>.
//
// Content rules: Summary = management summary only (no tech tables).
// Actions = only real manual owner actions — Overview is read-mostly, so
// its Actions are triage jump links to the owning sections' Actions views,
// labeled honestly as navigation. Details = deep per-section breakdowns.
// Every datum is live or an honest empty state; nothing is hardcoded.
// Cross-section links use the canonical ?tab=<fn>&view=<view> form.

import { ocFunction, ocSectionShell, ocViewScript } from "./oc-shell";

// ---------------------------------------------------------------------------
// 1. state — executive state of the whole system
// ---------------------------------------------------------------------------

const STATE_SUMMARY_HTML = `<section class="stats" id="state-stats"><div class="stat"><strong>…</strong><span>Loading verified state</span></div></section>
	<section class="panel" style="margin-top:20px"><h2>Board and meeting state</h2><div id="state-board">Loading…</div><p class="meta"><a href="/operating-center/board?tab=board&view=summary">Open board workspace →</a></p></section>
	<section class="panel"><h2>Latest activity</h2><div id="state-activity">Loading…</div><p class="meta"><a href="/operating-center/operations?tab=activity&view=summary">Open activity →</a></p></section>
	<section class="panel"><h2>Needs attention</h2><div id="state-attention">Loading…</div><p class="meta"><a href="#" onclick="__ovwSetView('blockers','summary',true);return false">Open blockers →</a></p></section>`;

const STATE_ACTIONS_HTML = `<section class="panel"><h2>Triage</h2>
	<p class="meta">Overview is read-mostly: it summarizes, the real owner actions live in the owning sections. The two manual triage points are below.</p>
	<div id="state-act">Loading…</div></section>`;

const STATE_DETAILS_HTML = `<section class="panel"><h2>Series 2026 race lifecycle</h2>
	<p class="meta">One row per distance lives on the results page now.</p>
	<div id="state-det-lifecycle">Loading…</div>
	<p class="meta"><a href="/operating-center/sport?tab=results&view=summary">Open results →</a></p></section>
	<section class="panel"><h2>Media plan</h2>
	<p class="meta">You set the topics; the machine runs the plan and article lifecycle and drafts the articles.</p>
	<div id="state-det-media">Loading…</div>
	<p class="meta"><a href="/operating-center/marketing?tab=media&view=summary">Open media workspace →</a></p></section>
	<section class="panel"><h2>Activity</h2>
	<p class="meta">What is happening, what is new, and what requires the owner's eyes. The full feed lives in Operations.</p>
	<div id="state-det-activity">Loading…</div>
	<p class="meta"><a href="/operating-center/operations?tab=activity&view=summary">Open activity →</a></p></section>
	<section class="panel"><h2>What board members can do</h2>
	<p class="meta">The operating center is the board's cockpit. Every member can:</p>
	<ul>
	<li><strong>Submit to the board:</strong> open the <a href="/operating-center/board?tab=board&view=summary">Board workspace</a> to add questions, initiatives, or wishes. Submissions are collected into the weekly Sunday protocol.</li>
	<li><strong>Upload files:</strong> open the <a href="/operating-center/board?tab=uploads&view=summary">Uploads</a> tab to share contact lists, task lists, meeting material, or media drafts. The machine classifies and routes each file automatically.</li>
	<li><strong>Review activity:</strong> open the <a href="/operating-center/operations?tab=activity&view=summary">Activity</a> tab for new submissions, decisions, and uploads. Items under "Requires reading" need attention; mark them read when done.</li>
	<li><strong>Track the media plan:</strong> open the <a href="/operating-center/marketing?tab=media&view=summary">Media plan</a> tab to see article drafts, approvals, site publication, and press distribution.</li>
	<li><strong>Track funds:</strong> open the <a href="/operating-center/growth?tab=funds&view=summary">Funds</a> tab for the full fundraising pipeline.</li>
	</ul>
	<p class="meta">Consequential actions (sends, publications, spending, agreements) always require explicit owner confirmation. The machine prepares; the owner decides.</p></section>
	<section class="panel"><h2>Board uploads</h2>
	<div id="state-det-uploads">Loading…</div>
	<p class="meta"><a href="/operating-center/board?tab=uploads&view=summary">Open uploads →</a></p></section>
	<section class="panel"><h2>Sponsorship assets</h2>
	<p class="meta">Machine-generated seller packages, one per object. Stages: draft → packaged → offered → negotiating → committed → fulfilled → renewal. The full list and stage advancement live in the Growth section.</p>
	<div id="state-det-sponsorship">Loading…</div>
	<p class="meta"><a href="/operating-center/growth?tab=sponsorship&view=summary">Open sponsorship →</a></p></section>
	<section class="panel"><h2>Sites</h2>
	<p class="meta">Every NWANA web property with a short description and traffic stats once analytics is connected. Each screen has a downloadable report.</p>
	<div id="state-det-sites">Loading…</div>
	<p class="meta"><a href="/operating-center/marketing?tab=sites&view=summary">Open sites →</a></p></section>
	<section class="panel"><h2>Social</h2>
	<p class="meta">Accounts, pages, and groups with verified statistics. Each screen has a downloadable report.</p>
	<div id="state-det-social">Loading…</div>
	<p class="meta"><a href="/operating-center/marketing?tab=social&view=summary">Open social →</a></p></section>
	<section class="panel"><h2>Google Ads + Analytics</h2>
	<p class="meta">Campaigns, spend, keywords, and site analytics once the accounts are connected. Each screen has a downloadable report.</p>
	<div id="state-det-ads">Loading…</div>
	<p class="meta"><a href="/operating-center/marketing?tab=ads&view=summary">Open ads →</a></p></section>
	<section class="panel"><h2>Sellers</h2>
	<p class="meta">The exclusive-seller pipeline: stages, next steps, and the answers an incoming seller asked for. Each screen has a downloadable report.</p>
	<div id="state-det-sellers">Loading…</div>
	<p class="meta"><a href="/operating-center/growth?tab=sellers&view=summary">Open sellers →</a></p></section>
	<section class="panel"><h2>Partners</h2>
	<p class="meta">The partner pipeline from the outreach registry. Each screen has a downloadable report.</p>
	<div id="state-det-partners">Loading…</div>
	<p class="meta"><a href="/operating-center/growth?tab=partners&view=summary">Open partners →</a></p></section>
	<section class="panel"><h2>Fundraising</h2>
	<p class="meta">The Fund object: the Founding Circle bridge sprint, pipeline, and follow-up calendar. Each screen has a downloadable report.</p>
	<div id="state-det-fundraising">Loading…</div>
	<p class="meta"><a href="/operating-center/growth?tab=fundraising&view=summary">Open fundraising →</a></p></section>
	<section class="panel"><h2>NW Groups</h2>
	<p class="meta">The group license ladder and the public funnel, with network statistics once tracked. Each screen has a downloadable report.</p>
	<div id="state-det-groups">Loading…</div>
	<p class="meta"><a href="/operating-center/sport?tab=groups&view=summary">Open groups →</a></p></section>
	<section class="panel"><h2>Meetings</h2>
	<p class="meta">External meetings on the calendar and the board meeting log, each with a downloadable report.</p>
	<div id="state-det-meetings">Loading…</div>
	<p class="meta"><a href="/operating-center/board?tab=meetings&view=summary">Open meetings →</a></p></section>
	<section class="panel"><h2>Operations</h2>
	<p class="meta">The operational queue: every current source, its required result, action, channel, status, and exact next step.</p>
	<div id="state-det-operations">Loading…</div>
	<p class="meta"><a href="/operating-center/operations?tab=system&view=summary">Open operations →</a></p></section>
	<section class="panel"><h2>Board workspace</h2>
	<div id="state-det-board">Loading…</div>
	<p class="meta"><a href="/operating-center/board?tab=board&view=summary">Open board workspace →</a></p></section>
	<section class="grid"><div class="panel"><h2>Board queue</h2><div id="state-det-boardqueue">Loading…</div><p class="meta">Submissions join the nearest upcoming meeting protocol automatically. Open the <a href="/operating-center/board?tab=board&view=summary">Board workspace</a> to triage.</p></div></section>`;

const STATE_SCRIPT = `
	let state_pendingSubmissionsCache=[];
	function state_pickNextMeeting(meetings){
		const today=new Date().toISOString().slice(0,10);
		const open=(meetings||[]).filter(m=>m.status==='DRAFT'||m.status==='OPEN');
		const dated=open.filter(m=>m.scheduled_for&&String(m.scheduled_for).slice(0,10)>=today).sort((a,b)=>String(a.scheduled_for).localeCompare(String(b.scheduled_for)));
		if(dated.length)return dated[0];
		const undated=open.filter(m=>!m.scheduled_for);
		if(undated.length)return undated[0];
		return null;
	}
	function state_socialBadge(s){
		const v=String(s||'').toLowerCase();
		if(v.indexOf('connect')>=0&&v.indexOf('not')<0&&v.indexOf('dis')<0)return '<span class="badge-ok">'+esc(s)+'</span>';
		if(v.indexOf('not')>=0||v.indexOf('dis')>=0||v.indexOf('error')>=0)return '<span class="badge-warn">'+esc(s)+'</span>';
		return '<span class="badge">'+esc(s)+'</span>';
	}
	async function boot_state_summary(){
		const [o,b]=await Promise.all([api('/api/operating-center/overview'),api('/api/board/submissions')]);
		state_pendingSubmissionsCache=b.submissions||[];
		const labels={pending_board_submissions:'Board items',pending_decisions:'Decisions needed',active_work_items:'Active work',connected_objects:'Connected objects',published_results:'Published results'};
		document.querySelector('#state-stats').innerHTML=Object.entries(o.counts).map(([k,v])=>'<div class="stat"><strong>'+esc(v)+'</strong><span>'+esc(labels[k]||k)+'</span></div>').join('');
		await Promise.all([state_summaryBoard(),state_summaryActivity(),state_summaryAttention()]);
	}
	async function state_summaryBoard(){
		const box=document.querySelector('#state-board');
		try{
			const [m,w,c]=await Promise.all([api('/api/board/meetings'),api('/api/board/work-items'),api('/api/board/cadence').catch(()=>null)]);
			const meetings=m.meetings||[];
			const next=state_pickNextMeeting(meetings);
			const items=w.work_items||[];
			const active=items.filter(x=>x.status!=='DONE').length;
			const overdue=items.filter(x=>x.due_date && new Date(x.due_date)<new Date() && x.status!=='DONE').length;
			const pend=(state_pendingSubmissionsCache||[]).filter(s=>s.status==='PENDING').length;
			let html='';
			if(next){
				const dstr=next.scheduled_for?String(next.scheduled_for).slice(0,10):'date TBD';
				let when='';
				if(c&&c.cadence){const tz=String(c.cadence.timezone||'').replace('America/','');when=' · '+esc(c.cadence.weekday)+'s '+esc(c.cadence.time)+(tz?' '+esc(tz)+' time':'')}
				const agenda=Number(next.agenda_count||0);
				html+='<div style="font-size:18px;font-weight:700;margin-bottom:6px">Next Board meeting: '+esc(dstr)+when+'</div>';
				html+='<div class="meta">Protocol: '+agenda+' item'+(agenda===1?'':'s')+(pend?' · '+pend+' waiting in the queue':'')+' · '+esc(next.status==='DRAFT'?'Draft':next.status==='OPEN'?'Open':'Closed')+'</div>';
			}else{
				html+='<div class="unavailable">No upcoming meeting.</div>';
			}
			html+='<div class="meta" style="margin-top:6px">'+active+' active work item'+(active===1?'':'s')+(overdue?' · <span style="color:#a00">'+overdue+' overdue</span>':'')+'</div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_summaryActivity(){
		const box=document.querySelector('#state-activity');
		try{
			const data=await api('/api/operating-center/activity');
			const items=data.items||[];
			const req=items.filter(i=>i.requires_reading);
			const fresh=items.filter(i=>!i.requires_reading).slice(0,3);
			box.innerHTML='<div class="meta'+(req.length?' followup-due':'')+'">'+req.length+' item'+(req.length===1?'':'s')+' require'+(req.length===1?'s':'')+' reading</div>'+
			(fresh.length?fresh.map(i=>'<div class="meta">· '+esc(i.label)+'</div>').join(''):'<div class="unavailable">No recent activity.</div>');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_summaryAttention(){
		const box=document.querySelector('#state-attention');
		try{
			const [w,ops,fund,lc,ads,soc]=await Promise.all([
				api('/api/board/work-items'),
				api('/api/operating-center/operations/overview'),
				api('/api/operating-center/fund'),
				api('/api/operating-center/race-lifecycle'),
				api('/api/operating-center/ads/overview').catch(()=>null),
				api('/api/operating-center/social/overview').catch(()=>null)
			]);
			const items=w.work_items||[];
			const overdue=items.filter(x=>x.due_date && new Date(x.due_date)<new Date() && x.status!=='DONE');
			const rows=((ops.queue&&ops.queue.rows)||[]).filter(r=>r.status==='NEEDS_OWNER_INPUT'||r.status==='BLOCKED_EXTERNAL');
			const due=(fund.funds||[]).reduce((s,f)=>s+Number(f.follow_ups_due_now||0),0);
			const prep=(lc.distances||[]).filter(d=>d.stage==='next_race_prep');
			const attn=[];
			if(overdue.length)attn.push('<strong>'+overdue.length+'</strong> overdue work item'+(overdue.length===1?'':'s'));
			if(rows.length)attn.push('<strong>'+rows.length+'</strong> item'+(rows.length===1?'':'s')+' needing owner input or blocked externally');
			if(due)attn.push('<strong>'+due+'</strong> fund follow-up'+(due===1?'':'s')+' due now');
			if(prep.length)attn.push('<strong>'+prep.length+'</strong> race prep'+(prep.length===1?'':'s')+' awaiting review ('+prep.map(d=>esc(d.distance)).join(', ')+')');
			if(ads&&ads.google_ads&&!ads.google_ads.connected)attn.push('Google Ads is not connected');
			if(soc){
				const disc=(soc.accounts||[]).filter(a=>{const v=String(a.status||'').toLowerCase();return v.indexOf('not')>=0||v.indexOf('dis')>=0||v.indexOf('error')>=0;});
				if(disc.length)attn.push('<strong>'+disc.length+'</strong> social account'+(disc.length===1?'':'s')+' need'+(disc.length===1?'s':'')+' attention: '+disc.map(a=>esc(a.platform)).join(', '));
			}
			box.innerHTML=attn.length?'<div class="meta">&bull; '+attn.join('<br>&bull; ')+'</div>':'<div class="unavailable">Nothing needs attention right now.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_state_actions(){
		const box=document.querySelector('#state-act');
		try{
			const b=await api('/api/board/submissions');
			const pend=(b.submissions||[]).filter(s=>s.status==='PENDING').length;
			const ops=await api('/api/operating-center/operations/overview');
			const exc=((ops.queue&&ops.queue.rows)||[]).filter(r=>r.status==='NEEDS_OWNER_INPUT'||r.status==='BLOCKED_EXTERNAL').length;
			let html='<div class="item"><strong>Review board queue</strong><div class="detail">'+pend+' pending submission'+(pend===1?'':'s')+' awaiting triage. Questions, initiatives, and wishes are collected into the weekly Sunday protocol.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/board?tab=board&view=actions">Open Board → Actions</a></div></div>';
			html+='<div class="item"><strong>Review exceptions</strong><div class="detail">'+exc+' item'+(exc===1?'':'s')+' needing owner input or blocked externally. Each is resolved in Operations.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/operations?tab=exceptions&view=actions">Open Operations → Actions</a></div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_state_details(){
		state_detBoardQueue();
		state_detBoard();state_detUploads();state_detLifecycle();state_detMedia();state_detActivity();
		state_detSponsorship();state_detSites();state_detSocial();state_detAds();state_detSellers();
		state_detPartners();state_detFundraising();state_detGroups();state_detMeetings();state_detOperations();
	}
	async function state_detBoardQueue(){
		const box=document.querySelector('#state-det-boardqueue');
		try{
			const b=await api('/api/board/submissions');
			const pend=(b.submissions||[]).filter(s=>s.status==='PENDING');
			box.innerHTML=pend.length?'<div class="meta">'+pend.length+' pending submission'+(pend.length===1?'':'s')+' awaiting triage. The next meeting protocol forms automatically on Sunday.</div>':'<div class="unavailable">No pending Board items.</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detBoard(){
		const box=document.querySelector('#state-det-board');
		try{
			const [m,w]=await Promise.all([api('/api/board/meetings'),api('/api/board/work-items')]);
			const meetings=(m.meetings||[]).slice(0,5);
			const byStatus={};(w.work_items||[]).forEach(x=>{byStatus[x.status]=(byStatus[x.status]||0)+1});
			let html='<div class="meta">Work items by status: '+(Object.entries(byStatus).map(([s,c])=>esc(s)+': <strong>'+c+'</strong>').join(' · ')||'<span class="unavailable">none</span>')+'</div>';
			html+=meetings.length?meetings.map(x=>'<div class="meta">· '+esc(String(x.scheduled_for||'date TBD').slice(0,10))+' — '+esc(x.status)+(x.agenda_count?' · '+x.agenda_count+' agenda items':'')+'</div>').join(''):'<div class="unavailable">No meetings logged.</div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detUploads(){
		const box=document.querySelector('#state-det-uploads');
		try{
			const data=await api('/api/operating-center/uploads');
			const uploads=data.uploads||[];
			if(!uploads.length){box.innerHTML='<div class="unavailable">No uploads yet.</div>';return}
			const latest=uploads[0];
			box.innerHTML='<div class="meta">'+uploads.length+' upload'+(uploads.length===1?'':'s')+' routed · latest: '+esc(latest.filename)+' ('+esc(latest.route_label)+')</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detLifecycle(){
		const box=document.querySelector('#state-det-lifecycle');
		try{
			const data=await api('/api/operating-center/race-lifecycle');
			if(!data.distances.length){box.innerHTML='<div class="unavailable">No lifecycle state yet. Open <a href="/operating-center/sport?tab=results&view=summary">Race results</a>; opening the page runs the first sync automatically.</div>';return}
			const order=['registration_open','awaiting_results','verifying','levels_computed','published','next_race_prep'];
			const counts={};data.distances.forEach(d=>{counts[d.stage]=(counts[d.stage]||0)+1});
			const prep=data.distances.filter(d=>d.stage==='next_race_prep').length;
			box.innerHTML='<div class="meta">'+order.filter(s=>counts[s]).map(s=>counts[s]+' × '+esc(s)).join(' · ')+'</div>'+
			(prep?'<div class="meta followup-due">'+prep+' prep'+(prep>1?'s':'')+' need'+(prep>1?'':'s')+' review</div>':'<div class="meta">No prep awaiting review.</div>');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detMedia(){
		const box=document.querySelector('#state-det-media');
		try{
			const data=await api('/api/operating-center/media/overview');
			if(!data.plans.length){box.innerHTML='<div class="unavailable">No media plans yet. Create one in the media workspace.</div>';return}
			box.innerHTML=data.plans.map(p=>'<div class="item"><strong>'+esc(p.title)+'</strong><div class="meta">'+esc(p.status)+' · '+p.article_count+' article'+(p.article_count===1?'':'s')+' ('+p.ready_count+' ready, '+p.published_count+' published)</div></div>').join('');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detActivity(){
		const box=document.querySelector('#state-det-activity');
		try{
			const data=await api('/api/operating-center/activity');
			const items=data.items||[];
			const req=items.filter(i=>i.requires_reading);
			const fresh=items.filter(i=>!i.requires_reading).slice(0,5);
			box.innerHTML='<div class="meta'+(req.length?' followup-due':'')+'">'+req.length+' item'+(req.length===1?'':'s')+' require'+(req.length===1?'s':'')+' reading</div>'+
			(fresh.length?fresh.map(i=>'<div class="meta">· '+esc(i.label)+'</div>').join(''):'<div class="unavailable">No recent activity.</div>');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detSponsorship(){
		const box=document.querySelector('#state-det-sponsorship');
		const label={draft:'Draft',packaged:'Packaged',offered:'Offered',negotiating:'Negotiating',committed:'Committed',fulfilled:'Fulfilled',renewal:'Renewal'};
		try{
			const data=await api('/api/operating-center/sponsorship-assets');
			const assets=data.assets||[];
			if(!assets.length){box.innerHTML='<div class="unavailable">No sponsorship assets yet. Generate one on the sponsorship tab.</div>';return}
			const byStage={};
			assets.forEach(a=>{byStage[a.stage]=(byStage[a.stage]||0)+1});
			box.innerHTML='<div class="meta">'+Object.entries(byStage).map(([s,c])=>esc(label[s]||s)+': <strong>'+c+'</strong>').join(' · ')+'</div>'+
			'<div class="meta">'+assets.length+' total asset'+(assets.length===1?'':'s')+'</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detSites(){
		const box=document.querySelector('#state-det-sites');
		try{
			const data=await api('/api/operating-center/sites/overview');
			const sites=data.sites||[];
			let analyticsLine='<div class="meta">Analytics: <span class="unavailable">not connected</span></div>';
			try{
				const t=await api('/api/operating-center/analytics/traffic');
				if(t.ok){analyticsLine='<div class="meta">Analytics: connected · '+Number(t.totals.sessions||0).toLocaleString('en-US')+' sessions / 28 days across '+t.hosts.length+' host'+(t.hosts.length===1?'':'s')+'</div>'}
			}catch(te){}
			box.innerHTML='<div class="meta">'+sites.length+' web propert'+(sites.length===1?'y':'ies')+'</div>'+analyticsLine;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detSocial(){
		const box=document.querySelector('#state-det-social');
		try{
			const data=await api('/api/operating-center/social/overview');
			const accounts=data.accounts||[];
			if(!accounts.length){box.innerHTML='<div class="unavailable">No social accounts tracked yet.</div>';return}
			box.innerHTML=accounts.map(a=>'<div class="item"><strong>'+esc(a.platform)+' — '+esc(a.handle)+' '+state_socialBadge(a.status)+'</strong><div class="detail">'+esc(a.note)+'</div></div>').join('');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detAds(){
		const box=document.querySelector('#state-det-ads');
		try{
			const data=await api('/api/operating-center/ads/overview');
			const ga=data.google_ads;
			const planned=(data.planned_campaigns||[]).length;
			const badge=ga.connected?'<span class="badge-ok">Connected</span>':'<span class="badge-warn">Not connected</span>';
			let analyticsBit='Analytics: <span class="unavailable">not connected</span>';
			try{
				const t=await api('/api/operating-center/analytics/traffic');
				if(t.ok){analyticsBit='Analytics: connected ('+Number(t.totals.sessions||0).toLocaleString('en-US')+' sessions / 28 days)'}
			}catch(te){}
			box.innerHTML='<div class="item"><strong>Google Ads '+badge+'</strong><div class="detail">'+esc(ga.note)+'</div></div>'+
			'<div class="meta">'+analyticsBit+'</div>'+
			'<div class="meta">'+planned+' planned campaigns (machine spec, not live)</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detSellers(){
		const box=document.querySelector('#state-det-sellers');
		try{
			const data=await api('/api/operating-center/sellers/overview');
			const sellers=data.sellers||[];
			const dated=sellers.filter(s=>s.next_date).sort((a,b)=>String(a.next_date).localeCompare(String(b.next_date)));
			box.innerHTML='<div class="meta">'+sellers.length+' seller records</div>'+
			(dated.length?'<div class="meta">Next: '+esc(dated[0].company)+' — '+esc(dated[0].next_date)+'</div>':'<div class="unavailable">No dated next steps.</div>');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detPartners(){
		const box=document.querySelector('#state-det-partners');
		try{
			const data=await api('/api/operating-center/partners/overview');
			const partners=data.partners||[];
			box.innerHTML='<div class="meta">'+partners.length+' partner record'+(partners.length===1?'':'s')+'</div>'+
			(partners.length?'<div class="meta">'+esc(partners[0].name)+' — '+esc(partners[0].stage)+'</div>':'<div class="unavailable">No partners yet.</div>');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detFundraising(){
		const box=document.querySelector('#state-det-fundraising');
		const money=n=>'$'+Number(n||0).toLocaleString('en-US');
		try{
			const data=await api('/api/operating-center/fundraising/overview');
			const f=data.fund;
			if(!f){box.innerHTML='<div class="unavailable">No fund objects yet.</div>';return}
			box.innerHTML='<div class="meta">'+money(f.goal_amount)+' goal · '+money(f.raised_amount)+' raised</div>'+
			'<div class="meta">'+esc(f.prospect_count)+' prospects'+(f.follow_ups_due_now?' · <span class="followup-due">'+f.follow_ups_due_now+' follow-up'+(f.follow_ups_due_now===1?'':'s')+' due</span>':'')+'</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detGroups(){
		const box=document.querySelector('#state-det-groups');
		try{
			const data=await api('/api/operating-center/groups/overview');
			const ladder=data.ladder||[];
			box.innerHTML='<div class="meta">'+ladder.length+'-step license ladder</div>'+
			'<div class="meta">Group counts: <span class="unavailable">not yet tracked</span></div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detOperations(){
		const box=document.querySelector('#state-det-operations');
		try{
			const data=await api('/api/operating-center/operations/overview');
			const rows=(data.queue&&data.queue.rows)||[];
			const counts={};rows.forEach(r=>{counts[r.status]=(counts[r.status]||0)+1});
			let html='<div class="meta">'+rows.length+' operational rows</div>';
			for(const st of ['READY_TO_ACT','NEEDS_OWNER_INPUT','BLOCKED_EXTERNAL']){
				if(counts[st])html+='<div class="meta">'+st+': '+counts[st]+'</div>';
			}
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function state_detMeetings(){
		const box=document.querySelector('#state-det-meetings');
		try{
			const data=await api('/api/operating-center/meetings/overview');
			const ext=data.external_meetings||[];
			const actionable=ext.filter(m=>m.status==='confirmed'||m.status==='awaiting scheduling');
			const boardCount=(data.board_upcoming||[]).length+(data.board_past||[]).length;
			let html='<div class="meta">'+ext.length+' external meeting'+(ext.length===1?'':'s')+' tracked ('+actionable.length+' upcoming)</div>';
			if(actionable.length)html+='<div class="meta">Next: '+esc(actionable[0].title)+' · '+esc(actionable[0].display_when)+'</div>';
			html+='<div class="meta">Board meetings in the log: '+boardCount+'</div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}`;

const STATE_PANELS = ocFunction(
	"state",
	"The executive state of the whole system: key counts, the next board meeting, the latest activity, and what needs attention. Every number below is loaded live.",
	STATE_SUMMARY_HTML,
	STATE_ACTIONS_HTML,
	STATE_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 2. money — executive money view (visibility only)
// ---------------------------------------------------------------------------

const MONEY_SUMMARY_HTML = `<section class="panel"><h2>Executive money view — totals</h2>
	<p class="meta">Fundraising, donations, sponsorship revenue, commitments, and pipeline totals side by side. Fundraising and sponsorship stay separate processes with separate lifecycles; this is visibility only.</p>
	<div id="money-sum">Loading…</div></section>`;

const MONEY_ACTIONS_HTML = `<section class="panel"><h2>Act on money</h2>
	<p class="meta">Money does not move from this page. Fundraising and sponsorship each have their own Actions view in the Growth section — this page only shows the totals. Pick where to act:</p>
	<div id="money-act">Loading…</div></section>`;

const MONEY_DETAILS_HTML = `<section class="panel"><h2>Executive money view — breakdown</h2>
	<div id="money-det">Loading…</div>
	<p class="meta"><a href="/operating-center/growth?tab=funds&view=summary">Open funds →</a> · <a href="/operating-center/growth?tab=sponsorship&view=summary">Open sponsorship →</a></p></section>`;

const MONEY_SCRIPT = `
	function money_fmt(n){return '$'+Number(n||0).toLocaleString('en-US');}
	async function money_fetchMoney(){
		return await api('/api/operating-center/money/overview');
	}
	async function boot_money_summary(){
		const box=document.querySelector('#money-sum');
		try{
			const data=await money_fetchMoney();
			const f=data.fundraising, s=data.sponsorship, d=data.donations, t=data.total_verified_revenue;
			let html='';
			if(t){
				const cents=n=>Math.round(Number(n||0)/100);
				html+='<div class="item"><strong>Total verified revenue</strong><div class="detail">'+money_fmt(cents(t.total_gross_cents))+' across '+t.donations.event_count+' donations, '+t.registrations.event_count+' registrations, '+t.licenses.event_count+' licenses</div></div>';
				html+='<div class="item"><strong>Donations</strong><div class="detail">'+money_fmt(cents(t.donations.total_gross_cents))+' · '+t.donations.event_count+' transactions'+(t.donations.total_refunds_cents?' · refunds '+money_fmt(cents(t.donations.total_refunds_cents)):'')+'</div></div>';
				html+='<div class="item"><strong>Paid registrations</strong><div class="detail">'+money_fmt(cents(t.registrations.total_gross_cents))+' · '+t.registrations.event_count+' transactions'+(t.registrations.total_refunds_cents?' · refunds '+money_fmt(cents(t.registrations.total_refunds_cents)):'')+'</div></div>';
				html+='<div class="item"><strong>Licenses / memberships</strong><div class="detail">'+money_fmt(cents(t.licenses.total_gross_cents))+' · '+t.licenses.event_count+' licenses</div></div>';
			}
			html+='<div class="item"><strong>Fundraising</strong><div class="detail">Raised '+money_fmt(f.totals.raised_amount)+' of '+money_fmt(f.totals.goal_amount)+' goal · committed asks '+money_fmt(f.totals.committed_ask_total)+'</div></div>';
			html+='<div class="item"><strong>Donation feed</strong><div class="detail">'+(d.available?'<span class="badge-ok">Connected</span>':'<span class="badge-warn">Not connected</span>'+(d.reason?' — '+esc(d.reason):''))+'</div></div>';
			const stageLine=Object.entries(s.stage_counts).map(([st,c])=>esc(st)+': <strong>'+c+'</strong>').join(' · ');
			html+='<div class="item"><strong>Sponsorship revenue</strong><div class="detail">'+(stageLine||'<span class="unavailable">No sponsorship assets yet.</span>')+'</div></div>';
			html+='<div class="item"><strong>Commitments</strong><div class="detail">Fundraising committed asks: '+money_fmt(f.totals.committed_ask_total)+' · Sponsorship committed assets: <strong>'+s.committed_count+'</strong> (values not recorded)</div></div>';
			const pipeStages={};
			for(const x of f.funds){for(const [st,amt] of Object.entries(x.ask_by_stage||{})){pipeStages[st]=(pipeStages[st]||0)+Number(amt||0)}}
			const pipeLine=Object.entries(pipeStages).map(([st,amt])=>esc(st)+': <strong>'+money_fmt(amt)+'</strong>').join(' · ');
			html+='<div class="item"><strong>Pipeline totals</strong><div class="detail">'+(pipeLine||'<span class="unavailable">No asks in pipeline yet.</span>')+'</div><div class="meta">'+esc(data.disclaimer)+'</div></div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_money_actions(){
		const box=document.querySelector('#money-act');
		box.innerHTML=
		'<div class="item"><strong>Act on fundraising</strong><div class="detail">Fund pipeline, follow-ups, and asks live in the Growth section.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/growth?tab=funds&view=actions">Open Growth → Funds actions</a></div></div>'+
		'<div class="item"><strong>Act on sponsorship</strong><div class="detail">Sponsorship assets and stage advancement live in the Growth section.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/growth?tab=sponsorship&view=actions">Open Growth → Sponsorship actions</a></div></div>';
	}
	async function boot_money_details(){
		const box=document.querySelector('#money-det');
		try{
			const data=await money_fetchMoney();
			const f=data.fundraising, s=data.sponsorship, d=data.donations, t=data.total_verified_revenue;
			const cents=n=>Math.round(Number(n||0)/100);
			const fundRows=f.funds.map(x=>'<div class="meta">'+esc(x.name)+': raised '+money_fmt(x.raised_amount)+' of '+money_fmt(x.goal_amount)+' goal · committed asks '+money_fmt(x.committed_ask_total)+'</div>').join('');
			const stageLine=Object.entries(s.stage_counts).map(([st,c])=>esc(st)+': <strong>'+c+'</strong>').join(' · ');
			const pipeStages={};
			for(const x of f.funds){for(const [st,amt] of Object.entries(x.ask_by_stage||{})){pipeStages[st]=(pipeStages[st]||0)+Number(amt||0)}}
			const pipeLine=Object.entries(pipeStages).map(([st,amt])=>esc(st)+': <strong>'+money_fmt(amt)+'</strong>').join(' · ');
			let html='<h4>Fundraising</h4><div class="meta">Total raised '+money_fmt(f.totals.raised_amount)+' of '+money_fmt(f.totals.goal_amount)+' goal · committed asks '+money_fmt(f.totals.committed_ask_total)+'</div>'+fundRows;
			if(t){
				html+='<h4>Verified revenue by type</h4>';
				html+='<div class="meta">Donations: <strong>'+money_fmt(cents(t.donations.total_gross_cents))+'</strong> · '+t.donations.event_count+' events / '+t.donations.transaction_count+' transactions'+(t.donations.total_refunds_cents?' · refunds '+money_fmt(cents(t.donations.total_refunds_cents)):'')+(t.donations.latest_occurred_at?' · latest '+esc(String(t.donations.latest_occurred_at).slice(0,10)):'')+'</div>';
				html+='<div class="meta">Paid registrations: <strong>'+money_fmt(cents(t.registrations.total_gross_cents))+'</strong> · '+t.registrations.event_count+' events / '+t.registrations.transaction_count+' transactions'+(t.registrations.total_refunds_cents?' · refunds '+money_fmt(cents(t.registrations.total_refunds_cents)):'')+(t.registrations.latest_occurred_at?' · latest '+esc(String(t.registrations.latest_occurred_at).slice(0,10)):'')+'</div>';
				html+='<div class="meta">Licenses / memberships: <strong>'+money_fmt(cents(t.licenses.total_gross_cents))+'</strong> · '+t.licenses.event_count+' licenses'+(t.licenses.total_refunds_cents?' · refunds '+money_fmt(cents(t.licenses.total_refunds_cents)):'')+(t.licenses.latest_occurred_at?' · latest '+esc(String(t.licenses.latest_occurred_at).slice(0,10)):'')+'</div>';
				html+='<div class="meta"><strong>Total verified: '+money_fmt(cents(t.total_gross_cents))+'</strong>'+(t.total_refunds_cents?' · total refunds '+money_fmt(cents(t.total_refunds_cents)):'')+'</div>';
			}
			html+='<h4>Donation feed</h4><div class="meta">'+(d.available?'Connected':'<span class="unavailable">'+esc(d.reason)+'</span>')+'</div>';
			if(data.sources && data.sources.length){
				html+='<h4>Revenue by source</h4>';
				html+=data.sources.map(x=>'<div class="meta">'+esc(x.source_label)+': <strong>'+money_fmt(cents(x.total_gross_cents))+'</strong> · '+x.event_count+' events'+(x.total_refunds_cents?' · refunds '+money_fmt(cents(x.total_refunds_cents)):'')+(x.latest_occurred_at?' · latest '+esc(String(x.latest_occurred_at).slice(0,10)):'')+(x.last_sync_at?' · synced '+esc(String(x.last_sync_at).slice(0,10)):'')+'</div>').join('');
			}
			if(data.memberorgs && data.memberorgs.length){
				html+='<h4>MemberOrg sources</h4>';
				html+=data.memberorgs.map(m=>'<div class="meta"><strong>'+esc(m.name)+'</strong> (club '+esc(m.club_id)+'): '+m.membership_count+' memberships ('+m.paid_membership_count+' paid / '+m.free_membership_count+' free) · <strong>'+money_fmt(cents(m.gross_revenue_cents))+'</strong>'+(m.latest_membership_at?' · latest '+esc(String(m.latest_membership_at).slice(0,10)):'')+' · '+esc(m.sync_state)+'</div>').join('');
			}
			html+='<h4>Sponsorship revenue</h4><div class="meta">'+(stageLine||'<span class="unavailable">No sponsorship assets yet.</span>')+'</div><div class="meta">'+esc(s.note)+'</div>';
			html+='<h4>Commitments</h4><div class="meta">Fundraising committed asks: '+money_fmt(f.totals.committed_ask_total)+' · Sponsorship committed assets: <strong>'+s.committed_count+'</strong> (values not recorded)</div>';
			html+='<h4>Pipeline totals</h4><div class="meta">'+(pipeLine||'<span class="unavailable">No asks in pipeline yet.</span>')+'</div><div class="meta">'+esc(data.disclaimer)+'</div>';
			const fd=await api('/api/operating-center/fund');
			html+='<h4>Fund objects</h4>';
			if(!fd.funds.length){html+='<div class="unavailable">No funds yet.</div>'}
			else{
				html+=fd.funds.map(x=>'<div class="item"><strong>'+esc(x.fund.name)+'</strong><div class="detail">Raised '+money_fmt(x.fund.raised_amount)+' of '+money_fmt(x.fund.goal_amount)+' goal · '+Number(x.follow_ups_due_now||0)+' follow-up'+(Number(x.follow_ups_due_now||0)===1?'':'s')+' due now</div></div>').join('');
			}
			const fr=await api('/api/operating-center/fundraising/overview');
			html+='<h4>Fundraising pipeline</h4>';
			if(!fr.fund){html+='<div class="unavailable">No fund objects yet.</div>'}
			else{
				html+='<div class="meta">'+money_fmt(fr.fund.goal_amount)+' goal · '+money_fmt(fr.fund.raised_amount)+' raised · '+esc(fr.fund.prospect_count)+' prospects'+(fr.fund.follow_ups_due_now?' · <span class="followup-due">'+fr.fund.follow_ups_due_now+' follow-up'+(fr.fund.follow_ups_due_now===1?'':'s')+' due</span>':'')+'</div>';
			}
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}`;

const MONEY_PANELS = ocFunction(
	"money",
	"Executive money view: fundraising, donations, sponsorship revenue, commitments, and pipeline totals side by side. Visibility only — fundraising and sponsorship stay separate processes with separate lifecycles.",
	MONEY_SUMMARY_HTML,
	MONEY_ACTIONS_HTML,
	MONEY_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 3. work — operational output: publications, results, board work
// ---------------------------------------------------------------------------

const WORK_SUMMARY_HTML = `<section class="panel"><h2>Publications</h2>
	<div id="work-pubs">Loading…</div>
	<p class="meta"><a href="/operating-center/marketing?tab=media&view=summary">Open media workspace →</a></p></section>
	<section class="panel"><h2>Results</h2>
	<div id="work-results">Loading…</div>
	<p class="meta"><a href="/operating-center/sport?tab=results&view=summary">Open results →</a></p></section>
	<section class="panel"><h2>Board work</h2>
	<div id="work-board">Loading…</div>
	<p class="meta"><a href="/operating-center/board?tab=workitems&view=summary">Open work items →</a></p></section>`;

const WORK_ACTIONS_HTML = `<section class="panel"><h2>Where the work is done</h2>
	<p class="meta">Work is produced in the owning sections — the links below take you to where it is done.</p>
	<div id="work-act">Loading…</div></section>`;

const WORK_DETAILS_HTML = `<section class="panel"><h2>Media plans — detail</h2>
	<div id="work-det-media">Loading…</div>
	<p class="meta"><a href="/operating-center/marketing?tab=media&view=details">Open media details →</a></p></section>
	<section class="panel"><h2>Race lifecycle — detail</h2>
	<div id="work-det-lifecycle">Loading…</div>
	<p class="meta"><a href="/operating-center/sport?tab=results&view=details">Open results details →</a></p></section>
	<section class="panel"><h2>Board work items — detail</h2>
	<div id="work-det-workitems">Loading…</div>
	<p class="meta"><a href="/operating-center/board?tab=workitems&view=details">Open work items details →</a></p></section>`;

const WORK_SCRIPT = `
	async function work_pubs(){
		const box=document.querySelector('#work-pubs');
		try{
			const data=await api('/api/operating-center/media/overview');
			const plans=data.plans||[];
			let articles=0,published=0,ready=0;
			for(const p of plans){articles+=Number(p.article_count||0);published+=Number(p.published_count||0);ready+=Number(p.ready_count||0);}
			box.innerHTML='<div class="meta">'+plans.length+' plan'+(plans.length===1?'':'s')+' · '+articles+' articles · '+published+' published'+(ready?' · '+ready+' ready for review':'')+'</div>'+
			(plans.length?plans.slice(0,3).map(p=>'<div class="meta">· '+esc(p.title)+' ('+esc(p.status)+', '+p.published_count+' published)</div>').join(''):'<div class="unavailable">No media plans yet.</div>');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function work_results(){
		const box=document.querySelector('#work-results');
		try{
			const [lc,o]=await Promise.all([api('/api/operating-center/race-lifecycle'),api('/api/operating-center/overview')]);
			const counts={};(lc.distances||[]).forEach(d=>{counts[d.stage]=(counts[d.stage]||0)+1});
			const order=['registration_open','awaiting_results','verifying','levels_computed','published','next_race_prep'];
			const pub=o.counts&&o.counts.published_results!=null?o.counts.published_results:null;
			const stageLine=order.filter(s=>counts[s]).map(s=>counts[s]+' × '+esc(s)).join(' · ');
			box.innerHTML=(pub!=null?'<div class="meta">'+pub+' published results</div>':'')+
			(stageLine?'<div class="meta">'+stageLine+'</div>':'<div class="unavailable">No lifecycle state yet.</div>');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function work_board(){
		const box=document.querySelector('#work-board');
		try{
			const w=await api('/api/board/work-items');
			const items=w.work_items||[];
			const active=items.filter(x=>x.status!=='DONE').length;
			const overdue=items.filter(x=>x.due_date && new Date(x.due_date)<new Date() && x.status!=='DONE').length;
			const b=await api('/api/board/submissions');
			const pend=(b.submissions||[]).filter(s=>s.status==='PENDING').length;
			box.innerHTML='<div class="meta">'+active+' active work item'+(active===1?'':'s')+(overdue?' · <span style="color:#a00">'+overdue+' overdue</span>':'')+' · '+pend+' pending submission'+(pend===1?'':'s')+'</div>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_work_summary(){
		await Promise.all([work_pubs(),work_results(),work_board()]);
	}
	async function boot_work_actions(){
		const box=document.querySelector('#work-act');
		box.innerHTML=
		'<div class="item"><strong>Publish and distribute content</strong><div class="detail">Articles, site news, and press distribution are produced in Media.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/marketing?tab=media&view=actions">Open Marketing → Media actions</a></div></div>'+
		'<div class="item"><strong>Work on race results</strong><div class="detail">Result sync, verification, and publication are worked in Sport.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/sport?tab=results&view=actions">Open Sport → Results actions</a></div></div>'+
		'<div class="item"><strong>Work on board items</strong><div class="detail">Submissions, meetings, and work items are worked in the Board section.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/board?tab=workitems&view=actions">Open Board → Work items actions</a></div></div>';
	}
	async function work_detMedia(){
		const box=document.querySelector('#work-det-media');
		try{
			const data=await api('/api/operating-center/media/overview');
			const plans=data.plans||[];
			if(!plans.length){box.innerHTML='<div class="unavailable">No media plans yet. Create one in the media workspace.</div>';return}
			box.innerHTML='<table class="data"><thead><tr><th>Plan</th><th>Status</th><th>Articles</th><th>Ready</th><th>Published</th></tr></thead><tbody>'+
			plans.map(p=>'<tr><td>'+esc(p.title)+'</td><td>'+esc(p.status)+'</td><td>'+esc(p.article_count)+'</td><td>'+esc(p.ready_count)+'</td><td>'+esc(p.published_count)+'</td></tr>').join('')+'</tbody></table>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function work_detLifecycle(){
		const box=document.querySelector('#work-det-lifecycle');
		try{
			const data=await api('/api/operating-center/race-lifecycle');
			const ds=data.distances||[];
			if(!ds.length){box.innerHTML='<div class="unavailable">No lifecycle state yet.</div>';return}
			box.innerHTML='<table class="data"><thead><tr><th>Distance</th><th>Stage</th><th>Active event</th><th>Synced</th></tr></thead><tbody>'+
			ds.map(d=>{
				const ev=d.active_event?(esc(d.active_event.event_name||'')+' · '+esc(d.active_event.event_date||'')):'—';
				return '<tr><td>'+esc(d.distance)+'</td><td>'+esc(d.stage)+'</td><td>'+ev+'</td><td>'+esc(d.synced_at||'never')+'</td></tr>';
			}).join('')+'</tbody></table>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function work_detWorkItems(){
		const box=document.querySelector('#work-det-workitems');
		try{
			const data=await api('/api/board/work-items');
			const items=(data.work_items||[]).filter(x=>x.status!=='DONE');
			if(!items.length){box.innerHTML='<div class="unavailable">No active work items.</div>';return}
			box.innerHTML='<table class="data"><thead><tr><th>Item</th><th>Status</th><th>Due</th><th>Assigned</th></tr></thead><tbody>'+
			items.map(x=>'<tr><td>'+esc(x.title)+'</td><td>'+esc(x.status)+'</td><td>'+esc(x.due_date||'—')+'</td><td>'+esc(x.assigned_to||'—')+'</td></tr>').join('')+'</tbody></table>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_work_details(){
		await Promise.all([work_detMedia(),work_detLifecycle(),work_detWorkItems()]);
	}`;

const WORK_PANELS = ocFunction(
	"work",
	"Operational output across the system: media publications, sport results, and board work — what the Machine produced and what is in flight.",
	WORK_SUMMARY_HTML,
	WORK_ACTIONS_HTML,
	WORK_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// 4. blockers — everything needing owner input or blocked
// ---------------------------------------------------------------------------

const BLOCKERS_SUMMARY_HTML = `<section class="panel"><h2>Blockers needing the owner</h2>
	<p class="meta">Exception queue items, overdue work items, fund follow-ups due now, and race prep awaiting review — with counts.</p>
	<div id="blk-sum">Loading…</div></section>`;

const BLOCKERS_ACTIONS_HTML = `<section class="panel"><h2>Resolve blockers</h2>
	<p class="meta">Each blocker is resolved in its owning section — the links below take you to the right Actions view.</p>
	<div id="blk-act">Loading…</div></section>`;

const BLOCKERS_DETAILS_HTML = `<section class="panel"><h2>Blockers — full list with exact next steps</h2>
	<div id="blk-det">Loading…</div></section>`;

const BLOCKERS_SCRIPT = `
	function blk_renderItem(r){
		const badge=r.status==='NEEDS_OWNER_INPUT'?'badge-warn':(r.status==='READY_TO_ACT'?'badge-ok':'badge');
		let html='<div class="item"><strong>'+esc(r.action||'(no action)')+'<span class="'+badge+'">'+esc(r.status)+'</span></strong>';
		html+='<div class="detail"><b>Required result:</b> '+esc(r.required_result||'not assigned')+'</div>';
		html+='<div class="detail"><b>Channel:</b> '+esc(r.channel||'not assigned')+' <b>Outcome:</b> '+esc(r.business_outcome)+'</div>';
		if(r.owner_input){html+='<div class="detail"><b>Owner input needed:</b> '+esc(r.owner_input)+'</div>'}
		if(r.external_blocker){html+='<div class="detail"><b>External blocker:</b> '+esc(r.external_blocker)+'</div>'}
		html+='<div class="detail"><b>Next step:</b> '+esc(r.exact_next_step)+'</div>';
		if(r.downstream_state){html+='<div class="meta">Proposal state: '+esc(r.downstream_state)+'</div>'}
		html+='</div>';
		return html;
	}
	async function boot_blk_summary(){
		const box=document.querySelector('#blk-sum');
		try{
			const [ops,w,fund,lc]=await Promise.all([
				api('/api/operating-center/operations/overview'),
				api('/api/board/work-items'),
				api('/api/operating-center/fund'),
				api('/api/operating-center/race-lifecycle')
			]);
			const exc=((ops.queue&&ops.queue.rows)||[]).filter(r=>r.status==='NEEDS_OWNER_INPUT'||r.status==='BLOCKED_EXTERNAL');
			const ownerInput=exc.filter(r=>r.status==='NEEDS_OWNER_INPUT');
			const blocked=exc.filter(r=>r.status==='BLOCKED_EXTERNAL');
			const overdue=(w.work_items||[]).filter(x=>x.due_date && new Date(x.due_date)<new Date() && x.status!=='DONE');
			const due=(fund.funds||[]).reduce((s,f)=>s+Number(f.follow_ups_due_now||0),0);
			const prep=(lc.distances||[]).filter(d=>d.stage==='next_race_prep');
			const total=exc.length+overdue.length+due+prep.length;
			let html='<div class="meta">'+total+' open blocker'+(total===1?'':'s')+' right now</div>';
			html+='<div class="meta">'+ownerInput.length+' need owner input · '+blocked.length+' blocked externally · '+overdue.length+' overdue work items · '+due+' fund follow-ups due · '+prep.length+' race preps awaiting review</div>';
			if(exc.length){
				html+=exc.slice(0,5).map(r=>'<div class="meta">· '+esc(r.action||'(no action)')+' — '+esc(r.exact_next_step)+'</div>').join('');
				if(exc.length>5)html+='<div class="meta">…and '+(exc.length-5)+' more in Details.</div>';
			}
			if(overdue.length){
				html+=overdue.slice(0,5).map(x=>'<div class="meta">· <span class="followup-overdue">overdue</span> '+esc(x.title)+' — due '+esc(x.due_date)+'</div>').join('');
				if(overdue.length>5)html+='<div class="meta">…and '+(overdue.length-5)+' more in Details.</div>';
			}
			if(!total)html+='<div class="unavailable">No blockers. Nothing needs owner input.</div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function boot_blk_actions(){
		const box=document.querySelector('#blk-act');
		box.innerHTML=
		'<div class="item"><strong>Resolve exceptions</strong><div class="detail">Exception queue items — each with its exact next step — are resolved in Operations.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/operations?tab=exceptions&view=actions">Open Operations → Exceptions actions</a></div></div>'+
		'<div class="item"><strong>Triaging board work</strong><div class="detail">Overdue work items and pending submissions are worked in the Board section.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/board?tab=board&view=actions">Open Board → Actions</a></div></div>'+
		'<div class="item"><strong>Act on money blockers</strong><div class="detail">Fund follow-ups and sponsorship stage advancement live in the Growth section.</div><div style="margin-top:8px"><a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/growth?tab=funds&view=actions">Open Growth → Funds actions</a></div></div>';
	}
	async function boot_blk_details(){
		const box=document.querySelector('#blk-det');
		try{
			const [ops,w,fund,lc]=await Promise.all([
				api('/api/operating-center/operations/overview'),
				api('/api/board/work-items'),
				api('/api/operating-center/fund'),
				api('/api/operating-center/race-lifecycle')
			]);
			const exc=((ops.queue&&ops.queue.rows)||[]).filter(r=>r.status==='NEEDS_OWNER_INPUT'||r.status==='BLOCKED_EXTERNAL');
			const overdue=(w.work_items||[]).filter(x=>x.due_date && new Date(x.due_date)<new Date() && x.status!=='DONE');
			const dueFunds=(fund.funds||[]).filter(f=>Number(f.follow_ups_due_now||0)>0);
			const prep=(lc.distances||[]).filter(d=>d.stage==='next_race_prep');
			let html='';
			html+='<h3>Exception queue ('+exc.length+')</h3>';
			if(!exc.length){html+='<div class="unavailable">No items need owner input or are blocked externally.</div>'}
			else{
				const groups={};const order=[];
				for(const r of exc){if(!groups[r.source_title]){groups[r.source_title]=[];order.push(r.source_title)}groups[r.source_title].push(r)}
				for(const title of order){
					html+='<h3>'+esc(title)+'</h3>';
					for(const r of groups[title]){html+=blk_renderItem(r)}
				}
			}
			html+='<h3>Overdue work items ('+overdue.length+')</h3>';
			if(!overdue.length){html+='<div class="unavailable">No overdue work items.</div>'}
			else{html+=overdue.map(x=>'<div class="item"><strong>'+esc(x.title)+' <span class="followup-overdue">overdue</span></strong><div class="meta">'+esc(x.status)+' · due '+esc(x.due_date)+(x.assigned_to?' · '+esc(x.assigned_to):'')+'</div><div class="detail"><b>Next step:</b> decide or reassign in the <a href="/operating-center/board?tab=workitems&view=actions">Board work items</a> actions view.</div></div>').join('')}
			html+='<h3>Fund follow-ups due now ('+dueFunds.length+' funds)</h3>';
			if(!dueFunds.length){html+='<div class="unavailable">No fund follow-ups due.</div>'}
			else{html+=dueFunds.map(f=>'<div class="item"><strong>'+esc(f.fund.name)+'</strong><div class="meta"><span class="followup-due">'+f.follow_ups_due_now+' follow-up'+(Number(f.follow_ups_due_now)===1?'':'s')+' due</span></div><div class="detail"><b>Next step:</b> work the follow-ups in <a href="/operating-center/growth?tab=funds&view=actions">Growth → Funds actions</a>.</div></div>').join('')}
			html+='<h3>Race prep awaiting review ('+prep.length+')</h3>';
			if(!prep.length){html+='<div class="unavailable">No prep awaiting review.</div>'}
			else{html+=prep.map(d=>'<div class="item"><strong>'+esc(d.distance)+'</strong><div class="meta">'+esc(d.owner_action||'Prep needs review')+'</div><div class="detail"><b>Next step:</b> confirm the prep in <a href="/operating-center/sport?tab=results&view=actions">Sport → Results actions</a>.</div></div>').join('')}
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}`;

const BLOCKERS_PANELS = ocFunction(
	"blockers",
	"Everything that needs the owner's input or is blocked externally, each with its exact next step. This is the only function with things to act on.",
	BLOCKERS_SUMMARY_HTML,
	BLOCKERS_ACTIONS_HTML,
	BLOCKERS_DETAILS_HTML,
);

// ---------------------------------------------------------------------------
// Quick bar + view routing
// ---------------------------------------------------------------------------

const OVERVIEW_QUICK =
	`<span>Main action:</span>` +
	`<button type="button" onclick="location.href='/operating-center/board?tab=board&view=actions'">Review board queue</button>` +
	`<span class="meta">The Machine keeps every summary below up to date automatically; this button takes you to the manual triage point.</span>`;

const OVERVIEW_VIEW_SCRIPT = ocViewScript("ovw", ["state", "money", "work", "blockers"]);

export function renderOverviewSectionHtml(): string {
	return ocSectionShell({
		section: "overview",
		title: "Overview",
		subtitle: "What is happening, what needs a decision, and what happens next.",
		queryTabs: true,
		appTopHtml: OVERVIEW_QUICK,
		tabs: [
			{ id: "state", label: "State", panelsHtml: STATE_PANELS, script: STATE_SCRIPT + OVERVIEW_VIEW_SCRIPT },
			{ id: "money", label: "Money", panelsHtml: MONEY_PANELS, script: MONEY_SCRIPT },
			{ id: "work", label: "Work", panelsHtml: WORK_PANELS, script: WORK_SCRIPT },
			{ id: "blockers", label: "Blockers", panelsHtml: BLOCKERS_PANELS, script: BLOCKERS_SCRIPT },
		],
	});
}
