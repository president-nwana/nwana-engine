// Overview section of the NWANA Operating Center.
// Ported from renderOperatingCenterHtml() (src/operating-center.ts) onto the
// shared 7-section shell. Links updated to the new canonical routes.

import { ocSectionShell } from "./oc-shell";

const OVERVIEW_PANELS = `<style>#tabpanel-summary h4{margin:14px 0 4px;font-size:16px}</style>
<section class="stats" id="stats"><div class="stat"><strong>…</strong><span>Loading verified state</span></div></section>
<section class="panel" id="lifecycle-panel" style="margin-top:20px"><h2>Series 2026 race lifecycle</h2>
<p class="meta">One row per distance lives on the results page now.</p>
<div id="lifecycle-summary">Loading…</div>
<p class="meta"><a href="/operating-center/sport#results">Open results →</a></p></section>
<section class="panel" id="fund-card" style="margin-top:20px"><h2>Funds</h2>
<p class="meta">Fund objects and prospect pipelines live in the Growth section now, like race results.</p>
<div id="fund-summary">Loading…</div>
<p class="meta"><a href="/operating-center/growth#funds">Open funds →</a></p></section>
<section class="panel" id="money-card" style="margin-top:20px"><h2>Executive money view</h2>
<p class="meta">Fundraising, donations, sponsorship revenue, commitments, and pipeline totals side by side. Fundraising and sponsorship stay separate processes with separate lifecycles; this is visibility only.</p>
<div id="money-summary">Loading…</div>
<p class="meta"><a href="/operating-center/growth#funds">Open funds →</a> · <a href="/operating-center/growth#sponsorship">Open sponsorship →</a></p></section>
<section class="panel" id="media-card" style="margin-top:20px"><h2>Media plan</h2>
<p class="meta">You set the topics; the machine runs the plan and article lifecycle and drafts the articles.</p>
<div id="media-summary">Loading…</div>
<p class="meta"><a href="/operating-center/marketing#media">Open media workspace →</a></p></section>
<section class="panel" id="activity-card" style="margin-top:20px"><h2>Activity</h2>
<p class="meta">What is happening, what is new, and what requires the owner's eyes. The full feed lives in Operations.</p>
<div id="activity-summary">Loading…</div>
<p class="meta"><a href="/operating-center/operations#activity">Open activity →</a></p></section>
<section class="panel" id="member-actions-panel" style="margin-top:20px"><h2>What board members can do</h2>
<p class="meta">The operating center is the board's cockpit. Every member can:</p>
<ul>
<li><strong>Submit to the board:</strong> open the <a href="/operating-center/board">Board workspace</a> to add questions, initiatives, or wishes. Submissions are collected into the weekly Sunday protocol.</li>
<li><strong>Upload files:</strong> open the <a href="/operating-center/board#uploads">Uploads</a> tab to share contact lists, task lists, meeting material, or media drafts. The machine classifies and routes each file automatically.</li>
<li><strong>Review activity:</strong> open the <a href="/operating-center/operations#activity">Activity</a> tab for new submissions, decisions, and uploads. Items under "Requires reading" need attention; mark them read when done.</li>
<li><strong>Track the media plan:</strong> open the <a href="/operating-center/marketing#media">Media plan</a> tab to see article drafts, approvals, site publication, and press distribution.</li>
<li><strong>Track funds:</strong> open the <a href="/operating-center/growth#funds">Funds</a> tab for the full fundraising pipeline.</li>
</ul>
<p class="meta">Consequential actions (sends, publications, spending, agreements) always require explicit owner confirmation. The machine prepares; the owner decides.</p></section>
<section class="panel" id="uploads-summary-panel" style="margin-top:20px"><h2>Board uploads</h2>
<div id="uploads-summary">Loading…</div>
<p class="meta"><a href="/operating-center/board#uploads">Open uploads →</a></p></section>
<section class="panel" id="sponsorship-card" style="margin-top:20px"><h2>Sponsorship assets</h2>
<p class="meta">Machine-generated seller packages, one per object. Stages: draft → packaged → offered → negotiating → committed → fulfilled → renewal. The full list and stage advancement live in the Growth section.</p>
<div id="sponsorship-summary">Loading…</div>
<p class="meta"><a href="/operating-center/growth#sponsorship">Open sponsorship →</a></p></section>
<section class="panel" id="sites-card" style="margin-top:20px"><h2>Sites</h2>
<p class="meta">Every NWANA web property with a short description and traffic stats once analytics is connected. Each screen has a downloadable report.</p>
<div id="sites-summary">Loading…</div>
<p class="meta"><a href="/operating-center/marketing#sites">Open sites →</a></p></section>
<section class="panel" id="social-card" style="margin-top:20px"><h2>Social</h2>
<p class="meta">Accounts, pages, and groups with verified statistics. Each screen has a downloadable report.</p>
<div id="social-summary">Loading…</div>
<p class="meta"><a href="/operating-center/marketing#social">Open social →</a></p></section>
<section class="panel" id="ads-card" style="margin-top:20px"><h2>Google Ads + Analytics</h2>
<p class="meta">Campaigns, spend, keywords, and site analytics once the accounts are connected. Each screen has a downloadable report.</p>
<div id="ads-summary">Loading…</div>
<p class="meta"><a href="/operating-center/marketing#ads">Open ads →</a></p></section>
<section class="panel" id="sellers-card" style="margin-top:20px"><h2>Sellers</h2>
<p class="meta">The exclusive-seller pipeline: stages, next steps, and the answers an incoming seller asked for. Each screen has a downloadable report.</p>
<div id="sellers-summary">Loading…</div>
<p class="meta"><a href="/operating-center/growth#sellers">Open sellers →</a></p></section>
<section class="panel" id="partners-card" style="margin-top:20px"><h2>Partners</h2>
<p class="meta">The partner pipeline from the outreach registry. Each screen has a downloadable report.</p>
<div id="partners-summary">Loading…</div>
<p class="meta"><a href="/operating-center/growth#partners">Open partners →</a></p></section>
<section class="panel" id="fundraising-card" style="margin-top:20px"><h2>Fundraising</h2>
<p class="meta">The Fund object: the $50K Founding Circle bridge sprint, pipeline, and follow-up calendar. Each screen has a downloadable report.</p>
<div id="fundraising-summary">Loading…</div>
<p class="meta"><a href="/operating-center/growth#fundraising">Open fundraising →</a></p></section>
<section class="panel" id="groups-card" style="margin-top:20px"><h2>NW Groups</h2>
<p class="meta">The group license ladder and the public funnel, with network statistics once tracked. Each screen has a downloadable report.</p>
<div id="groups-summary">Loading…</div>
<p class="meta"><a href="/operating-center/sport#groups">Open groups →</a></p></section>
<section class="panel" id="meetings-card" style="margin-top:20px"><h2>Meetings</h2>
<p class="meta">External meetings on the calendar and the board meeting log, each with a downloadable report.</p>
<div id="meetings-summary">Loading…</div>
<p class="meta"><a href="/operating-center/board#meetings">Open meetings →</a></p></section>
<section class="panel" id="operations-card" style="margin-top:20px"><h2>Operations</h2>
<p class="meta">The operational queue: every current source, its required result, action, channel, status, and exact next step.</p>
<div id="operations-summary">Loading…</div>
<p class="meta"><a href="/operating-center/operations">Open operations →</a></p></section>
<section class="panel" id="board-summary-panel" style="margin-top:20px"><h2>Board workspace</h2>
<div id="board-summary">Loading…</div>
<p class="meta"><a href="/operating-center/board">Open board workspace →</a></p></section>
<section class="grid queue"><div class="panel"><h2>Board queue</h2><div id="board-items">Loading…</div><p class="meta">Submissions join the nearest upcoming meeting protocol automatically. Open the <a href="/operating-center/board">Board workspace</a> to triage.</p></div></section>`;

const OVERVIEW_SCRIPT = `
let pendingSubmissionsCache=[];
async function boot_summary(){
const [o,b]=await Promise.all([api('/api/operating-center/overview'),api('/api/board/submissions')]);
pendingSubmissionsCache=b.submissions||[];
const labels={pending_board_submissions:'Board items',pending_decisions:'Decisions needed',active_work_items:'Active work',connected_objects:'Connected objects',published_results:'Published results'};
document.querySelector('#stats').innerHTML=Object.entries(o.counts).map(([k,v])=>'<div class="stat"><strong>'+esc(v)+'</strong><span>'+esc(labels[k]||k)+'</span></div>').join('');
document.querySelector('#board-items').innerHTML=b.submissions.length?'<div class="meta">'+b.submissions.length+' pending submissions awaiting triage. The next meeting protocol forms automatically on Sunday.</div>':'<div class="unavailable">No pending Board items.</div>';
loadLifecycleSummary();loadFundSummary();loadMoneySummary();loadMediaSummary();loadActivitySummary();loadBoardSummary();loadUploadsSummary();loadSponsorshipSummary();loadSitesSummary();loadSocialSummary();loadAdsSummary();loadSellersSummary();loadPartnersSummary();loadFundraisingSummary();loadGroupsSummary();loadMeetingsSummary();loadOperationsSummary();
}
async function pickNextMeetingLocal(meetings){
const today=new Date().toISOString().slice(0,10);
const open=(meetings||[]).filter(m=>m.status==='DRAFT'||m.status==='OPEN');
const dated=open.filter(m=>m.scheduled_for&&String(m.scheduled_for).slice(0,10)>=today).sort((a,b)=>String(a.scheduled_for).localeCompare(String(b.scheduled_for)));
if(dated.length)return dated[0];
const undated=open.filter(m=>!m.scheduled_for);
if(undated.length)return undated[0];
return null;
}
async function loadBoardSummary(){
const box=document.querySelector('#board-summary');
try{
const [m,w,c]=await Promise.all([api('/api/board/meetings'),api('/api/board/work-items'),api('/api/board/cadence').catch(()=>null)]);
const meetings=m.meetings||[];
const next=pickNextMeetingLocal(meetings);
const items=w.work_items||[];
const active=items.filter(x=>x.status!=='DONE').length;
const overdue=items.filter(x=>x.due_date && new Date(x.due_date)<new Date() && x.status!=='DONE').length;
const pend=(pendingSubmissionsCache||[]).filter(s=>s.status==='PENDING').length;
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
async function loadUploadsSummary(){
const box=document.querySelector('#uploads-summary');
try{
const data=await api('/api/operating-center/uploads');
const uploads=data.uploads||[];
if(!uploads.length){box.innerHTML='<div class="unavailable">No uploads yet.</div>';return}
const latest=uploads[0];
box.innerHTML='<div class="meta">'+uploads.length+' upload'+(uploads.length===1?'':'s')+' routed · latest: '+esc(latest.filename)+' ('+esc(latest.route_label)+')</div>';
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadFundSummary(){
const box=document.querySelector('#fund-summary');
const money=n=>'$'+Number(n||0).toLocaleString('en-US');
try{
const data=await api('/api/operating-center/fund');
if(!data.funds.length){box.innerHTML='<div class="unavailable">No funds yet.</div>';return}
const raised=data.funds.reduce((s,f)=>s+Number(f.fund.raised_amount||0),0);
const goal=data.funds.reduce((s,f)=>s+Number(f.fund.goal_amount||0),0);
const due=data.funds.reduce((s,f)=>s+Number(f.follow_ups_due_now||0),0);
box.innerHTML='<div class="meta">'+data.funds.length+' fund'+(data.funds.length>1?'s':'')+' · raised '+money(raised)+' of '+money(goal)+' goal</div>'+
'<div class="meta'+(due?' followup-due':'')+'">'+due+' follow-up'+(due===1?'':'s')+' due now</div>'+
'<div class="meta">'+data.funds.map(f=>esc(f.fund.name)).join(' · ')+'</div>';
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadMoneySummary(){
const box=document.querySelector('#money-summary');
const money=n=>'$'+Number(n||0).toLocaleString('en-US');
try{
const data=await api('/api/operating-center/money/overview');
const f=data.fundraising, s=data.sponsorship, d=data.donations;
const fundRows=f.funds.map(x=>'<div class="meta">'+esc(x.name)+': raised '+money(x.raised_amount)+' of '+money(x.goal_amount)+' goal · committed asks '+money(x.committed_ask_total)+'</div>').join('');
const stageLine=Object.entries(s.stage_counts).map(([st,c])=>esc(st)+': <strong>'+c+'</strong>').join(' · ');
const pipeStages={};
for(const x of f.funds){for(const [st,amt] of Object.entries(x.ask_by_stage||{})){pipeStages[st]=(pipeStages[st]||0)+Number(amt||0)}}
const pipeLine=Object.entries(pipeStages).map(([st,amt])=>esc(st)+': <strong>'+money(amt)+'</strong>').join(' · ');
box.innerHTML=
'<h4>Fundraising</h4><div class="meta">Total raised '+money(f.totals.raised_amount)+' of '+money(f.totals.goal_amount)+' goal · committed asks '+money(f.totals.committed_ask_total)+'</div>'+fundRows+
'<h4>Donations</h4><div class="meta">'+(d.available?'Connected':'<span class="unavailable">'+esc(d.reason)+'</span>')+'</div>'+
'<h4>Sponsorship revenue</h4><div class="meta">'+(stageLine||'<span class="unavailable">No sponsorship assets yet.</span>')+'</div><div class="meta">'+esc(s.note)+'</div>'+
'<h4>Commitments</h4><div class="meta">Fundraising committed asks: '+money(f.totals.committed_ask_total)+' · Sponsorship committed assets: <strong>'+s.committed_count+'</strong> (values not recorded)</div>'+
'<h4>Pipeline totals</h4><div class="meta">'+(pipeLine||'<span class="unavailable">No asks in pipeline yet.</span>')+'</div><div class="meta">'+esc(data.disclaimer)+'</div>';
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadMediaSummary(){
const box=document.querySelector('#media-summary');
try{
const data=await api('/api/operating-center/media/overview');
if(!data.plans.length){box.innerHTML='<div class="unavailable">No media plans yet. Create one in the media workspace.</div>';return}
box.innerHTML=data.plans.map(p=>'<div class="item"><strong>'+esc(p.title)+'</strong><div class="meta">'+esc(p.status)+' · '+p.article_count+' article'+(p.article_count===1?'':'s')+' ('+p.ready_count+' ready, '+p.published_count+' published)</div></div>').join('');
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadActivitySummary(){
const box=document.querySelector('#activity-summary');
try{
const data=await api('/api/operating-center/activity');
const items=data.items||[];
const req=items.filter(i=>i.requires_reading);
const fresh=items.filter(i=>!i.requires_reading).slice(0,3);
box.innerHTML='<div class="meta'+(req.length?' followup-due':'')+'">'+req.length+' item'+(req.length===1?'':'s')+' require'+(req.length===1?'s':'')+' reading</div>'+
(fresh.length?fresh.map(i=>'<div class="meta">· '+esc(i.label)+'</div>').join(''):'<div class="unavailable">No recent activity.</div>');
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadSponsorshipSummary(){
const box=document.querySelector('#sponsorship-summary');
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
async function loadSitesSummary(){
const box=document.querySelector('#sites-summary');
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
async function loadSocialSummary(){
const box=document.querySelector('#social-summary');
try{
const data=await api('/api/operating-center/social/overview');
const accounts=data.accounts||[];
const connected=accounts.filter(a=>a.status==='Connected').length;
box.innerHTML='<div class="meta">'+accounts.length+' accounts known · '+connected+' connected</div>'+
'<div class="meta">LinkedIn: 8 followers (observed 2026-09-22)</div>';
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadAdsSummary(){
const box=document.querySelector('#ads-summary');
try{
const data=await api('/api/operating-center/ads/overview');
const planned=(data.planned_campaigns||[]).length;
let analyticsBit='Analytics: <span class="unavailable">not connected</span>';
try{
const t=await api('/api/operating-center/analytics/traffic');
if(t.ok){analyticsBit='Analytics: connected ('+Number(t.totals.sessions||0).toLocaleString('en-US')+' sessions / 28 days)'}
}catch(te){}
box.innerHTML='<div class="meta">Google Ads: <span class="unavailable">not connected</span> · '+analyticsBit+'</div>'+
'<div class="meta">'+planned+' planned campaigns (machine spec, not live)</div>';
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadSellersSummary(){
const box=document.querySelector('#sellers-summary');
try{
const data=await api('/api/operating-center/sellers/overview');
const sellers=data.sellers||[];
const dated=sellers.filter(s=>s.next_date).sort((a,b)=>String(a.next_date).localeCompare(String(b.next_date)));
box.innerHTML='<div class="meta">'+sellers.length+' seller records</div>'+
(dated.length?'<div class="meta">Next: '+esc(dated[0].company)+' — '+esc(dated[0].next_date)+'</div>':'<div class="unavailable">No dated next steps.</div>');
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadPartnersSummary(){
const box=document.querySelector('#partners-summary');
try{
const data=await api('/api/operating-center/partners/overview');
const partners=data.partners||[];
box.innerHTML='<div class="meta">'+partners.length+' partner record'+(partners.length===1?'':'s')+'</div>'+
(partners.length?'<div class="meta">'+esc(partners[0].name)+' — '+esc(partners[0].stage)+'</div>':'<div class="unavailable">No partners yet.</div>');
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadFundraisingSummary(){
const box=document.querySelector('#fundraising-summary');
try{
const data=await api('/api/operating-center/fundraising/overview');
const f=data.fund;
if(!f){box.innerHTML='<div class="unavailable">No fund objects yet.</div>';return}
box.innerHTML='<div class="meta">$'+esc(f.goal_amount)+' goal · $'+esc(f.raised_amount)+' raised</div>'+
'<div class="meta">'+esc(f.prospect_count)+' prospects'+(f.follow_ups_due_now?' · <span class="followup-due">'+f.follow_ups_due_now+' follow-up'+(f.follow_ups_due_now===1?'':'s')+' due</span>':'')+'</div>';
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadGroupsSummary(){
const box=document.querySelector('#groups-summary');
try{
const data=await api('/api/operating-center/groups/overview');
const ladder=data.ladder||[];
box.innerHTML='<div class="meta">'+ladder.length+'-step license ladder</div>'+
'<div class="meta">Group counts: <span class="unavailable">not yet tracked</span></div>';
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}
async function loadOperationsSummary(){
const box=document.querySelector('#operations-summary');
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
async function loadMeetingsSummary(){
const box=document.querySelector('#meetings-summary');
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
}
async function loadLifecycleSummary(){
const box=document.querySelector('#lifecycle-summary');
try{
const data=await api('/api/operating-center/race-lifecycle');
if(!data.distances.length){box.innerHTML='<div class="unavailable">No lifecycle state yet. Open <a href="/operating-center/sport#results">Race results</a>; opening the page runs the first sync automatically.</div>';return}
const order=['registration_open','awaiting_results','verifying','levels_computed','published','next_race_prep'];
const counts={};data.distances.forEach(d=>{counts[d.stage]=(counts[d.stage]||0)+1});
const prep=data.distances.filter(d=>d.stage==='next_race_prep').length;
box.innerHTML='<div class="meta">'+order.filter(s=>counts[s]).map(s=>counts[s]+' × '+esc(s)).join(' · ')+'</div>'+
(prep?'<div class="meta followup-due">'+prep+' prep'+(prep>1?'s':'')+' need'+(prep>1?'':'s')+' review</div>':'<div class="meta">No prep awaiting review.</div>');
}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
}`;

export function renderOverviewSectionHtml(): string {
	return ocSectionShell({
		section: "overview",
		title: "Overview",
		subtitle: "What is happening, what needs a decision, and what happens next.",
		appTopHtml: `<span>Main action:</span>
<button type="button" onclick="location.href='/operating-center/board#decisions'">Review board queue</button>
<span class="meta">The Machine keeps every summary below up to date automatically; this button takes you to the manual triage point.</span>`,
		tabs: [
			{
				id: "summary",
				label: "Summary",
				panelsHtml: OVERVIEW_PANELS,
				script: OVERVIEW_SCRIPT,
			},
		],
	});
}
