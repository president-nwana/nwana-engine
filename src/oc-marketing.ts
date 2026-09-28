// Operating Center — Marketing section (7-section rebuild).
//
// Thin shell around ocSectionShell with five tabs:
//  1. ads — Google Ads + Analytics. Was renderAdsHtml
//     (src/operating-center-screens.ts), report id "ads" reused unchanged.
//  2. analytics — NEW: GA4 traffic statistics + Google Analytics connection
//     state, from /api/operating-center/analytics/traffic and
//     /api/operating-center/ads/overview (google_analytics block).
//  3. social — accounts, YouTube, distribution packs. Was renderSocialHtml
//     (src/operating-center-screens.ts), report id "social" reused unchanged.
//  4. media — media plan workspace (was renderMediaHtml,
//     src/operating-center-media.ts) with the news-item distribution review
//     (was renderNewsReviewHtml, src/operating-center-news-review.ts) merged
//     in: the review block shows only when ?article_id= is present.
//  5. sites — web properties list only (traffic block moved to the
//     Analytics tab). Was renderSitesHtml (src/operating-center-screens.ts),
//     report id "sites" reused unchanged.
//
// Tab scripts reuse the shell's global esc()/api(); the owner-key gate lives
// in the shell, so no tab script touches the gate.

import { ocSectionShell } from "./oc-shell";

// ---------------------------------------------------------------------------
// 1. Ads
// ---------------------------------------------------------------------------

const ADS_PANELS = `<section class="panel">
			<h2>Advertising and analytics</h2>
			<div id="ads-list">Loading…</div>
		</section>`;

const ADS_SCRIPT = `
	async function boot_ads(){
		const box=document.querySelector('#ads-list');
		try{
			const data=await api('/api/operating-center/ads/overview');
			const ads=data.google_ads;
			const badge=ads.connected?'<span class="badge-ok">Connected</span>':'<span class="badge-warn">Not connected</span>';
			let html='<div class="item"><strong>Google Ads '+badge+'</strong><div class="detail">'+esc(ads.note)+'</div>';
			html+='<div class="meta">Access level: '+esc(ads.access_level)+'</div>';
			if((ads.customers||[]).length){html+='<div class="meta">Accounts: '+ads.customers.map(esc).join(', ')+'</div>';}
			html+='<div class="meta">Campaign creation/mutation: '+(ads.execution_allowed?'enabled':'disabled')+'</div>';
			if(ads.error){html+='<div class="detail">Error: '+esc(ads.error)+'</div>';}
			html+='</div>';
			const live=data.live_account;
			if(live&&live.available){
				html+='<h3>LIVE GOOGLE ADS ACCOUNT</h3><p class="meta">Real data from account '+esc(live.customer_id)+', '+esc(live.date_range)+'. Read-only; the machine never changes campaigns.</p>';
				if(live.error){
					html+='<div class="item"><strong>Account data<span class="badge-warn">Read error</span></strong><div class="detail">Could not read account data: '+esc(live.error)+'</div></div>';
				}else if((live.campaigns||[]).length===0){
					html+='<div class="item"><div class="detail">No campaigns found in the connected Google Ads account.</div></div>';
				}else{
					for(const c of live.campaigns){
						const st=c.status==='ENABLED'?'<span class="badge-ok">'+esc(c.status)+'</span>':'<span class="badge-warn">'+esc(c.status)+'</span>';
						html+='<div class="item"><strong>'+esc(c.name)+' '+st+'</strong>'
							+'<div class="meta">Budget: $'+Number(c.daily_budget_usd).toFixed(2)+'/day</div>'
							+'<div class="detail">Impressions: '+esc(c.impressions)+' &middot; Clicks: '+esc(c.clicks)+' &middot; Conversions: '+esc(c.conversions)+' &middot; Spend: $'+Number(c.cost_usd).toFixed(2)+'</div>'
							+'</div>';
					}
				}
			}
			const gc=data.grants_compliance;
			if(gc&&gc.available){
				const gcBadge=gc.status==='ok'?'<span class="badge-ok">OK</span>':gc.status==='watch'?'<span class="badge-warn">WATCH</span>':'<span class="badge-warn">AT RISK</span>';
				html+='<h3>AD GRANTS COMPLIANCE</h3><p class="meta">Snapshot over '+esc(gc.date_range)+'. Grants requires &ge;5% account CTR; two consecutive months below risks deactivation. Snapshot only, not month-over-month history.</p>';
				html+='<div class="item"><strong>Account CTR '+(gc.account_ctr!=null?(gc.account_ctr*100).toFixed(2)+'%':'n/a')+' '+gcBadge+'</strong><div class="detail">'+esc(gc.note)+'</div>';
				for(const c of (gc.campaigns||[])){
					const cb=c.below_threshold?'<span class="badge-warn">below 5%</span>':'<span class="badge-ok">ok</span>';
					html+='<div class="meta">'+esc(c.name)+': '+(c.ctr!=null?(c.ctr*100).toFixed(2)+'%':'n/a')+' CTR '+cb+'</div>';
				}
				html+='</div>';
			}
			const ga=data.google_analytics;const gaBadge=ga.connected?'<span class="badge-ok">Connected</span>':'<span class="badge-warn">Not connected</span>';html+='<div class="item"><strong>Google Analytics '+gaBadge+'</strong><div class="detail">'+esc(ga.note)+'</div></div>';
			html+='<h3>ORCHESTRATION DECISIONS</h3><p class="meta">What the machine decided for every known source: required result, candidate action, channel. Sources with no evidence stay undecided; incomplete evidence is reported, never guessed. Read-only.</p>';
			for(const d of (data.orchestration||[])){
				const dBadge=d.state==='DECIDED'?'<span class="badge-ok">'+esc(d.state)+'</span>':'<span class="badge-warn">'+esc(d.state)+'</span>';
				html+='<div class="item"><strong>'+esc(d.source_identity)+' '+dBadge+'</strong>'
					+'<div class="meta">Decision ID: '+esc(d.decision_id)+'</div>'
					+'<div class="meta">Source: '+esc(d.source_kind)+(d.purpose?' &middot; Purpose: '+esc(d.purpose):'')+'</div>';
				if(d.required_result){html+='<div class="detail">Required result: '+esc(d.required_result)+'</div>';}
				if(d.candidate_action){html+='<div class="detail">Candidate action: '+esc(d.candidate_action)+'</div>';}
				html+='<div class="meta">Channel: '+(d.channel?esc(d.channel):'none')+(d.priority!=null?' &middot; Priority: '+esc(String(d.priority)):'')+'</div>';
				if((d.evidence||[]).length>0){
					html+='<div class="meta">Evidence: '+d.evidence.map(function(e){return esc(e.kind)+' '+esc(e.reference);}).join('; ')+'</div>';
				}
				if((d.missing_decision_input||[]).length>0){
					html+='<div class="meta">Missing decision input: '+d.missing_decision_input.map(esc).join('; ')+'</div>';
				}
				if(d.channel_intent_id){html+='<div class="meta">Channel intent: '+esc(d.channel_intent_id)+'</div>';}
				if(d.downstream){html+='<div class="meta">Downstream ('+esc(d.downstream.consumer)+'): '+esc(d.downstream.state)+'</div>';}
				if(d.execution_mode){html+='<div class="meta">Execution mode: '+esc(d.execution_mode)+'</div>';}
				html+='<div class="detail">'+esc(d.factual_reason)+'</div></div>';
			}
			html+='<h3>MACHINE PROPOSALS</h3><p class="meta">What the machine proposes to create. Campaign creation is disabled; the owner reviews every proposal before anything is created.</p>';
			for(const p of (data.machine_proposals||[])){
				const st=p.state==='PROPOSED'?'<span class="badge-ok">'+esc(p.state)+'</span>':'<span class="badge-warn">'+esc(p.state)+'</span>';
				html+='<div class="item"><strong>'+esc(p.name||'(unnamed proposal)')+' '+st+'</strong>'
					+'<div class="meta">Proposal ID: '+esc(p.proposal_id)+'</div>'
					+'<div class="meta">Budget: $'+(p.daily_budget!=null?Number(p.daily_budget).toFixed(2):'?')+'/day &middot; Target: '+esc(p.target_url||'none')+'</div>';
				html+='<div class="meta">Origin: '+(p.origin?esc(p.origin):'unknown')+' &middot; Source: '+esc(p.source_kind)+' / '+esc(p.source_identity)+'</div>';
				if(p.source_object){
					var label='Source object: '+esc(p.source_object.object_id);
					if(p.source_object.object_type){label+=' ('+esc(p.source_object.object_type)+')';}
					if(p.source_object.title){label+=' - '+esc(p.source_object.title);}
					html+='<div class="meta">'+label+'</div>';
				}
				else{html+='<div class="meta">Source object: not yet linked</div>';}
				html+='<div class="meta">Purpose: '+esc(p.purpose)+'</div>';
				html+='<div class="meta">Distribution rule: '+(p.distribution.rule_id?esc(p.distribution.rule_id):'none')+'</div>';
				html+='<div class="meta">Distribution action: '+(p.distribution.action_id?esc(p.distribution.action_id):'none')+'</div>';
				html+='<div class="meta">Channel: '+(p.distribution.channel?esc(p.distribution.channel):'none')+'</div>';
				html+='<div class="meta">Creation eligibility: '+(p.creation_eligible?'eligible':'not eligible')+'</div>';
				if(p.conflict){
					html+='<div class="meta">Live conflict: '+esc(p.conflict.live_campaign_name)+' ('+(p.conflict.via==='VERIFIED_MAPPING'?'verified mapping':'exact name')+')</div>';
				}
				if((p.missing_fields||[]).length>0){
					html+='<div class="meta">Missing fields: '+p.missing_fields.map(esc).join(', ')+'</div>';
				}
				for(const g of (p.ad_groups||[])){
					const kws=(g.keywords||[]).map(function(k){return esc(k.text)+' ('+esc(k.match_type)+')';}).join(', ');
					html+='<div class="detail"><b>'+esc(g.name)+':</b> max CPC $'+Number(g.default_cpc).toFixed(2)+', '+g.ads_count+' ads<br>Keywords: '+kws+'</div>';
				}
				if((p.policy_violations||[]).length===0){
					html+='<div class="detail">Ad Grants policy: PASS</div>';
				}else{
					html+='<div class="detail">Ad Grants policy violations: '+p.policy_violations.map(esc).join('; ')+'</div>';
				}
				html+='<div class="detail">Next action: '+esc(p.next_action)+'</div></div>';
			}
			html+='<h3>What this screen shows today</h3><div class="detail">'+(data.capabilities||[]).map(w=>'&bull; '+esc(w)).join('<br>')+'</div>';
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------
// 2. Analytics (new tab)
// ---------------------------------------------------------------------------

const ANALYTICS_PANELS = `<section class="panel">
			<h2>Traffic statistics</h2>
			<div class="message" id="analytics-message" aria-live="polite"></div>
			<div id="analytics-traffic">Loading…</div>
		</section>
		<section class="panel">
			<h2>Google Analytics connection</h2>
			<div id="analytics-ga4">Loading…</div>
		</section>`;

const ANALYTICS_SCRIPT = `
	async function boot_analytics(){
		const tbox=document.querySelector('#analytics-traffic');
		const gbox=document.querySelector('#analytics-ga4');
		try{
			const t=await api('/api/operating-center/analytics/traffic');
			if(t.ok){
				const rows=(t.hosts||[]).map(function(h){return '<div class="meta">'+esc(h.hostname||'(unknown host)')+': '+Number(h.sessions||0).toLocaleString('en-US')+' sessions · '+Number(h.total_users||0).toLocaleString('en-US')+' users</div>'}).join('');
				tbox.innerHTML='<div class="item"><strong>Traffic statistics</strong><div class="detail">GA4 property '+esc(t.property_id)+' · '+esc(t.date_range)+'</div><div class="detail">Total: '+Number(t.totals.sessions||0).toLocaleString('en-US')+' sessions · '+Number(t.totals.total_users||0).toLocaleString('en-US')+' users</div>'+(rows||'<div class="detail">No traffic recorded in this period.</div>')+'</div>';
			}else if(t.error){
				tbox.innerHTML='<div class="item"><strong>Traffic statistics<span class="badge-warn">Analytics not connected</span></strong><div class="detail">'+esc(t.error)+'</div></div>';
			}else{
				tbox.innerHTML='<div class="item"><strong>Traffic statistics<span class="badge-warn">Analytics not connected</span></strong><div class="detail">No traffic data returned.</div></div>';
			}
		}catch(err){
			tbox.innerHTML='<div class="item"><strong>Traffic statistics<span class="badge-warn">Analytics not connected</span></strong><div class="detail">Analytics not connected: '+esc(err.message)+'</div></div>';
		}
		try{
			const data=await api('/api/operating-center/ads/overview');
			const ga=data.google_analytics||{};
			const gaBadge=ga.connected?'<span class="badge-ok">Connected</span>':'<span class="badge-warn">Not connected</span>';
			gbox.innerHTML='<div class="item"><strong>Google Analytics '+gaBadge+'</strong><div class="detail">'+esc(ga.note||'No connection information available.')+'</div>'+(ga.property_id?'<div class="meta">Property ID: '+esc(ga.property_id)+'</div>':'')+'</div>';
		}catch(err){
			gbox.innerHTML='<div class="unavailable">Analytics not connected: '+esc(err.message)+'</div>';
		}
	}
`;

// ---------------------------------------------------------------------------
// 3. Social
// ---------------------------------------------------------------------------

const SOCIAL_PANELS = `<section class="panel">
			<h2>Accounts</h2>
			<div id="social-list">Loading…</div>
		</section>
		<section class="panel">
			<h2>YouTube</h2>
			<p class="meta">Uploads to the official NWANA channel are created as <strong>unlisted drafts</strong>. A video goes <strong>public only</strong> through the separate Publish step below with your explicit confirmation — never automatically.</p>
			<div id="yt-status">Loading…</div>
			<h3>Upload (unlisted draft)</h3>
			<label for="yt-source">Source video URL</label>
			<input id="yt-source" placeholder="https://…" autocomplete="off">
			<label for="yt-title">Title (max 100 characters)</label>
			<input id="yt-title" maxlength="100" autocomplete="off">
			<label for="yt-description">Description</label>
			<textarea id="yt-description" rows="3" style="font:inherit;border:1px solid #bfcac4;border-radius:9px;padding:10px;width:100%"></textarea>
			<label for="yt-tags">Tags (comma separated)</label>
			<input id="yt-tags" placeholder="NordicWalking, NWANA" autocomplete="off">
			<button type="button" id="yt-upload">Upload as unlisted</button>
			<div class="message" id="yt-upload-message" aria-live="polite"></div>
			<div id="yt-upload-result"></div>
			<h3>Publish to public</h3>
			<p class="meta">Explicit owner confirmation required. This is the only action that makes a video public.</p>
			<label for="yt-video-id">Video ID</label>
			<input id="yt-video-id" placeholder="e.g. dQw4w9WgXcQ" autocomplete="off">
			<button type="button" id="yt-publish">Publish to public</button>
			<div class="message" id="yt-publish-message" aria-live="polite"></div>
		</section>
		<section class="panel">
			<h2>Distribution packs (manual last mile)</h2>
			<p class="meta">Copy-ready text per channel for one creation packet. The machine prepares; you post manually. Data the packet does not carry shows as [NEEDS: …] — never invented.</p>
			<label for="pack-id">Creation packet id</label>
			<input id="pack-id" placeholder="e.g. pkt_… (for NWANA news: paste the canonical news URL)" autocomplete="off">
			<label for="pack-type">Object type</label>
			<select id="pack-type" style="font:inherit;border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white;width:100%">
				<option value="">Auto (from packet kind)</option>
				<option value="series_results">Series results</option>
				<option value="competition_event">Competition event</option>
				<option value="championship">Championship</option>
				<option value="challenge">Challenge</option>
				<option value="news_item">NWANA news</option>
			</select>
			<label for="pack-channel">Channel</label>
			<select id="pack-channel" style="font:inherit;border:1px solid #bfcac4;border-radius:9px;padding:10px;background:white;width:100%">
				<option value="all">All channels</option>
				<option value="threads">Threads</option>
				<option value="linkedin">LinkedIn</option>
				<option value="youtube">YouTube</option>
				<option value="eventbrite">Eventbrite</option>
				<option value="generic">Generic</option>
			</select>
			<button type="button" id="pack-build">Build packs</button>
			<div class="message" id="pack-message" aria-live="polite"></div>
			<div id="pack-list"></div>
		</section>`;

const SOCIAL_SCRIPT = `
	async function social_buildPacks(){
		const idEl=document.querySelector('#pack-id');
		const typeEl=document.querySelector('#pack-type');
		const chEl=document.querySelector('#pack-channel');
		const box=document.querySelector('#pack-list');
		const msg=document.querySelector('#pack-message');
		if(!idEl||!box)return;
		const id=idEl.value.trim();
		const typeVal=typeEl&&typeEl.value?typeEl.value:'';
		const isNews=typeVal==='news_item';
		// A news item is identified by its canonical URL, not a packet id.
		// Fields the URL alone cannot supply show as [NEEDS: …] — never invented.
		if(!id&&!isNews){box.innerHTML='<div class="unavailable">Enter a creation packet id.</div>';return;}
		if(msg)msg.textContent='Building packs…';
		box.innerHTML='';
		try{
			const params=new URLSearchParams({channel:chEl?chEl.value:'all'});
			if(typeVal)params.set('type',typeVal);
			if(isNews){params.set('canonical_url',id);}
			else{params.set('id',id);}
			const data=await api('/api/operating-center/distribution/packs?'+params.toString());
			let html='<div class="detail"><strong>Packet:</strong> '+esc(data.packet.title)+'<span class="badge">'+esc(data.objectTypeLabel)+'</span></div>';
			const order=['threads','linkedin','youtube','eventbrite','generic'];
			for(const ch of order){
				const pk=(data.packs||{})[ch];
				if(!pk)continue;
				html+='<div class="item"><strong>'+esc(ch.toUpperCase())+'</strong>';
				if(pk.title)html+='<div class="detail"><strong>Title:</strong> '+esc(pk.title)+'</div>';
				html+='<div class="detail"><button type="button" class="secondary" data-copy="'+esc(ch)+'">Copy text</button>'
					+(pk.truncated?'<span class="badge-warn">truncated to channel limit</span>':'')
					+'</div>';
				html+='<pre id="pack-text-'+esc(ch)+'" style="white-space:pre-wrap;background:#f5f7f5;border:1px solid #dce4df;border-radius:9px;padding:12px;font:14px/1.5 system-ui,sans-serif">'+esc(pk.text)+'</pre>';
				html+='<div class="meta">Target: '+(pk.targetUrl?'<a href="'+esc(pk.targetUrl)+'" target="_blank" rel="noopener">'+esc(pk.targetUrl)+'</a>':'none')+'</div>';
				html+='<div class="meta">Image: '+esc(pk.imageSpec.kind)+' — '+esc(pk.imageSpec.headline)+' / '+esc(pk.imageSpec.subline)+'</div>';
				if((pk.missingFields||[]).length)html+='<div class="detail unavailable">Missing data (fill in the packet, then rebuild): '+pk.missingFields.map(esc).join(', ')+'</div>';
				html+='</div>';
			}
			box.innerHTML=html;
			box.querySelectorAll('button[data-copy]').forEach(function(btn){
				btn.addEventListener('click',function(){
					const t=document.querySelector('#pack-text-'+btn.getAttribute('data-copy'));
					if(t&&navigator.clipboard){navigator.clipboard.writeText(t.textContent).catch(function(){});}
				});
			});
			if(msg)msg.textContent='Packs ready. Copy the text and post manually on each channel.';
		}catch(err){
			if(msg)msg.textContent='';
			box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';
		}
	}

	async function social_loadYouTubeStatus(){
		const box=document.querySelector('#yt-status');
		if(!box)return;
		try{
			const st=await api('/integrations/youtube/status');
			if(st.connected){
				box.innerHTML='<div class="item"><strong>YouTube <span class="badge-ok">connected</span></strong><div class="detail">Channel: '+esc(st.channel_title||st.channel_id||'')+'</div></div>';
			}else{
				box.innerHTML='<div class="item"><strong>YouTube <span class="badge-warn">not connected</span></strong><div class="detail">'+esc(st.error||'No OAuth credential stored yet.')+'</div><div class="detail"><a href="/integrations/youtube/connect" target="_blank" rel="noopener">Connect the NWANA channel (owner Google consent)</a></div></div>';
			}
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}

	async function social_youTubeUpload(){
		const srcEl=document.querySelector('#yt-source');
		const titleEl=document.querySelector('#yt-title');
		const descEl=document.querySelector('#yt-description');
		const tagsEl=document.querySelector('#yt-tags');
		const msg=document.querySelector('#yt-upload-message');
		const box=document.querySelector('#yt-upload-result');
		if(!srcEl||!titleEl||!box)return;
		const sourceUrl=srcEl.value.trim();
		const title=titleEl.value.trim();
		if(!sourceUrl||!title){if(msg)msg.textContent='Source URL and title are required.';return;}
		const tags=(tagsEl&&tagsEl.value||'').split(',').map(function(t){return t.trim()}).filter(Boolean);
		if(msg)msg.textContent='Uploading as unlisted draft…';
		box.innerHTML='';
		try{
			const r=await api('/api/operating-center/youtube/upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceUrl:sourceUrl,title:title,description:descEl?descEl.value:'',tags:tags})});
			box.innerHTML='<div class="item"><strong>Uploaded <span class="badge">unlisted</span></strong><div class="detail">Video ID: '+esc(r.video_id)+'</div><div class="detail"><a href="'+esc(r.url)+'" target="_blank" rel="noopener">'+esc(r.url)+'</a></div><div class="meta">Nothing was published to public. Use Publish below for an explicit public release.</div></div>';
			const vidEl=document.querySelector('#yt-video-id');
			if(vidEl)vidEl.value=r.video_id;
			if(msg)msg.textContent='Upload complete.';
		}catch(err){if(msg)msg.textContent='';box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}

	async function social_youTubePublish(){
		const vidEl=document.querySelector('#yt-video-id');
		const msg=document.querySelector('#yt-publish-message');
		if(!vidEl)return;
		const videoId=vidEl.value.trim();
		if(!videoId){if(msg)msg.textContent='Enter a video ID.';return;}
		if(!confirm('Publish video '+videoId+' to PUBLIC on the NWANA YouTube channel?'))return;
		if(msg)msg.textContent='Publishing…';
		try{
			const r=await api('/api/operating-center/youtube/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({videoId:videoId,confirmation:'PUBLISH'})});
			if(msg)msg.textContent='Video '+r.video_id+' is now '+r.privacy_status+'.';
		}catch(err){if(msg)msg.textContent='';else{alert(err.message)}}
	}

	async function boot_social(){
		const box=document.querySelector('#social-list');
		try{
			const data=await api('/api/operating-center/social/overview');
			let html='';
			for(const a of (data.accounts||[])){
				html+='<div class="item"><strong>'+esc(a.platform)+' — '+esc(a.handle)+'<span class="badge">'+esc(a.status)+'</span></strong>';
				if(a.url)html+='<div class="detail"><a href="'+esc(a.url)+'" target="_blank" rel="noopener">'+esc(a.url)+'</a></div>';
				if(a.stats&&a.stats.length){
					html+='<table class="data"><tbody>'+a.stats.map(function(s){return '<tr><th>'+esc(s.label)+'</th><td>'+esc(s.value)+'</td>'}).join('')+'</tbody></table>';
				}else{
					html+='<div class="detail unavailable">No verified statistics recorded for this account.</div>';
				}
				html+='<div class="detail">'+esc(a.note)+'</div></div>';
			}
			box.innerHTML=html;
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
		const packBtn=document.querySelector('#pack-build');
		if(packBtn)packBtn.addEventListener('click',social_buildPacks);
		const ytUploadBtn=document.querySelector('#yt-upload');
		if(ytUploadBtn)ytUploadBtn.addEventListener('click',social_youTubeUpload);
		const ytPublishBtn=document.querySelector('#yt-publish');
		if(ytPublishBtn)ytPublishBtn.addEventListener('click',social_youTubePublish);
		social_loadYouTubeStatus();
	}
`;

// ---------------------------------------------------------------------------
// 4. Media — media plan workspace + news-item distribution review
// ---------------------------------------------------------------------------

const MEDIA_PANELS = `<style>
			.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}.row button{width:auto;margin-top:0}
			.angle{font-style:italic;color:#66736d;font-size:14px;margin:4px 0}
			.post-text{background:#fbfdfb;border:1px solid #dce4df;border-radius:9px;padding:12px;white-space:pre-wrap;font-size:15px;margin:8px 0;max-height:340px;overflow:auto}
			.post-title{font-weight:700;margin:8px 0 0}
			.notes{background:#fffdf6;border:1px dashed #d8c98f;border-radius:9px;padding:10px 12px;font-size:14px;margin:8px 0;white-space:pre-wrap}
			.source{color:#66736d;font-size:13px}
			.badge.warn{background:#fdf3e0;color:#8a5a00}
			.badge.sent{background:#dcefe4;color:#1d6b3c}
			button.approve{background:#1d6b3c;font-size:17px;padding:14px 26px}
		</style>
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
		<div id="media-review-hint" class="message">Open an article's Review link to see its distribution checklist here.</div>
		<div id="media-review-block" hidden>
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
		</div>`;

const MEDIA_SCRIPT = `
	let media_selectedPlan=null;
	const media_PLAN_LABEL={DRAFT:'Draft',APPROVED:'Approved',IN_PROGRESS:'In progress',DONE:'Done'};
	const media_ART_LABEL={DRAFT:'Draft',READY:'Ready for review',APPROVED:'Approved',PUBLISHED:'Published'};
	async function media_loadPlans(){
		const box=document.querySelector('#plans');
		try{
			const data=await api('/api/operating-center/media/plans');
			if(!data.plans.length){box.innerHTML='<div class="unavailable">No media plans yet. Create one below: the machine provides the plan and article lifecycle, you provide the topics.</div>';return}
			box.innerHTML=data.plans.map(function(p){return '<div class="item"><strong>'+esc(p.title)+'<span class="badge">'+esc(media_PLAN_LABEL[p.status]||p.status)+'</span></strong>'+
				'<div class="meta">'+(p.period?esc(p.period)+' · ':'')+p.article_count+' articles · '+p.published_count+' published</div>'+
				'<div class="row"><button data-plan="'+esc(p.plan_id)+'" class="secondary" type="button">Open plan</button></div></div>'}).join('');
			box.querySelectorAll('[data-plan]').forEach(function(b){b.addEventListener('click',function(){media_openPlan(b.dataset.plan)})});
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
	async function media_openPlan(planId){
		media_selectedPlan=planId;
		const panel=document.querySelector('#plan-detail-panel');
		panel.hidden=false;
		try{
			const d=await api('/api/operating-center/media/plans/'+encodeURIComponent(planId));
			const p=d.plan;
			document.querySelector('#plan-detail-title').textContent=p.title;
			document.querySelector('#plan-detail-meta').textContent=(p.period?p.period+' · ':'')+media_PLAN_LABEL[p.status]+(p.notes?' · '+p.notes:'');
			const actions=document.querySelector('#plan-actions');
			actions.innerHTML=p.status==='DRAFT'?'<button id="approve-plan" class="secondary" type="button">Approve plan</button>':'';
			const ab=document.querySelector('#approve-plan');
			if(ab)ab.addEventListener('click',async()=>{
				const m=document.querySelector('#plan-detail-message');m.textContent='Approving…';
				try{await api('/api/operating-center/media/plans/'+encodeURIComponent(planId)+'/approve',{method:'POST'});m.textContent='Plan approved.';await media_loadPlans();await media_openPlan(planId)}catch(err){m.textContent=err.message}
			});
			const box=document.querySelector('#articles');
			const arts=d.articles||[];
			box.innerHTML=arts.length?arts.map(function(a){
				let row='<div class="item"><strong>'+esc(a.title)+'<span class="badge">'+esc(media_ART_LABEL[a.status]||a.status)+'</span></strong>';
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
			box.querySelectorAll('[data-edit]').forEach(function(b){b.addEventListener('click',function(){
				const ed=box.querySelector('[data-editor="'+b.dataset.edit+'"]');
				ed.hidden=!ed.hidden;
			})});
			box.querySelectorAll('[data-save-body]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Saving…';
				const body=box.querySelector('[data-editor="'+b.dataset.saveBody+'"] [data-body]').value;
				try{await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.saveBody)+'/body',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body_html:body})});msg.textContent='Draft saved: ready for review.';await media_openPlan(media_selectedPlan)}catch(err){msg.textContent=err.message}
			})});
			box.querySelectorAll('[data-approve-article]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Approving…';
				try{await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.approveArticle)+'/approve',{method:'POST'});msg.textContent='Approved.';await media_loadPlans();await media_openPlan(media_selectedPlan)}catch(err){msg.textContent=err.message}
			})});
			box.querySelectorAll('[data-publish]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Publishing…';
				try{const r=await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.publish)+'/publish',{method:'POST'});msg.textContent='Published to site news.';await media_loadPlans();await media_openPlan(media_selectedPlan)}catch(err){msg.textContent=err.message}
			})});
			async function loadDistributions(articleId){
				const box2=box.querySelector('[data-distributions="'+articleId+'"]');
				if(!box2)return;
				try{
					const d=await api('/api/operating-center/media/articles/'+encodeURIComponent(articleId)+'/distributions');
					const ds=d.distributions||[];
					box2.innerHTML='<div class="meta" style="margin-top:8px">External distribution:</div>'+
						(ds.length?ds.map(function(x){return '<div class="item"><strong>'+esc(x.channel)+'</strong>'+(x.outlet_name?'<div class="meta">'+esc(x.outlet_name)+'</div>':'')+'<div class="meta">Recorded '+esc(String(x.sent_at).slice(0,10))+(x.notes?' · '+esc(x.notes):'')+'</div></div>'}).join(''):'<div class="unavailable">Not distributed externally yet.</div>');
				}catch(err){box2.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
			}
			box.querySelectorAll('[data-distributions]').forEach(function(el){loadDistributions(el.dataset.distributions)});
			box.querySelectorAll('[data-show-distform]').forEach(function(b){b.addEventListener('click',function(){
				const f=box.querySelector('[data-distribute-form="'+b.dataset.showDistform+'"]');
				if(f)f.hidden=false;
			})});
			box.querySelectorAll('[data-toggle-distform]').forEach(function(b){b.addEventListener('click',function(){
				const f=box.querySelector('[data-distribute-form="'+b.dataset.toggleDistform+'"]');
				if(f)f.hidden=true;
			})});
			box.querySelectorAll('[data-record-dist]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('.message');msg.textContent='Recording…';
				const f=box.querySelector('[data-distribute-form="'+b.dataset.recordDist+'"]');
				try{
					await api('/api/operating-center/media/articles/'+encodeURIComponent(b.dataset.recordDist)+'/distribute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel:f.querySelector('[data-channel]').value,outlet_name:f.querySelector('[data-outlet]').value,notes:f.querySelector('[data-notes]').value})});
					msg.textContent='Distribution recorded.';f.hidden=true;await loadDistributions(b.dataset.recordDist);
				}catch(err){msg.textContent=err.message}
			})});
			panel.scrollIntoView();
		}catch(err){document.querySelector('#plan-detail-message').textContent=err.message}
	}

	const media_review_STATUS_BADGE={prepared:'<span class="badge warn">prepared</span>',sent:'<span class="badge sent">sent</span>',DRAFT:'<span class="badge warn">draft</span>',READY:'<span class="badge">ready</span>',APPROVED:'<span class="badge sent">approved</span>',PUBLISHED:'<span class="badge sent">published</span>'};
	function media_review_badge(s){return media_review_STATUS_BADGE[s]||'<span class="badge">'+esc(s)+'</span>'}
	function media_review_copyText(btnId,textId){const b=document.getElementById(btnId);if(!b)return;b.addEventListener('click',async()=>{const t=document.getElementById(textId).textContent;try{await navigator.clipboard.writeText(t);b.textContent='Copied ✓';setTimeout(()=>b.textContent='Copy text',1500)}catch(e){b.textContent='Copy failed'}})}
	async function media_review_load(articleId){
		if(!articleId){document.querySelector('#app-message').textContent='Missing article_id in the URL.';return}
		try{
			const d=await api('/api/operating-center/news/review?article_id='+encodeURIComponent(articleId));
			const r=d.review;
			const a=r.article;
			document.querySelector('#article').innerHTML=
				'<div class="item"><strong>'+esc(a.title)+' '+media_review_badge(a.status)+'</strong>'+
				'<div class="meta">article_id: '+esc(a.article_id)+' · published: '+esc(a.published_at||'—')+' · kind: '+esc(a.angle||'—')+'</div>'+
				'<div class="post-text">'+esc(a.body_html)+'</div></div>';
			document.querySelector('#variants').innerHTML=r.variants.length?r.variants.map(function(v,i){
				return '<div class="item"><strong>'+esc(v.title)+' '+media_review_badge(v.status)+'</strong>'+
				'<div class="meta">'+esc(v.variant_type)+' · '+esc(v.variant_id)+'</div>'+
				'<div class="post-text" id="variant-text-'+i+'">'+esc(v.body)+'</div>'+
				'<div class="row"><button class="secondary" type="button" id="copy-variant-'+i+'">Copy text</button></div></div>'
			}).join(''):'<div class="unavailable">No variants.</div>';
			r.variants.forEach(function(v,i){media_review_copyText('copy-variant-'+i,'variant-text-'+i)});
			const allApproved=r.variants.length>0&&r.variants.every(function(v){return v.status==='APPROVED'});
			document.querySelector('#distributions').innerHTML=r.distributions.length?r.distributions.map(function(x,i){
				const sent=x.status==='sent';
				return '<div class="item" data-dist="'+esc(x.distribution_id)+'"><strong>'+esc(x.outlet_name||x.channel)+' '+media_review_badge(x.status)+'</strong>'+
				'<div class="meta">channel: '+esc(x.channel)+' · prepared: '+esc(x.created_at||'—')+(x.sent_at?' · sent: '+esc(x.sent_at):'')+'</div>'+
				(x.post_title?'<div class="post-title">Title: '+esc(x.post_title)+'</div>':'')+
				'<div class="post-text" id="dist-text-'+i+'">'+esc(x.post_text||'(no text)')+'</div>'+
				'<div class="source">Text source: '+esc(x.text_source)+'</div>'+
				(x.notes?'<div class="notes">'+esc(x.notes)+'</div>':'')+
				'<div class="row"><button class="secondary" type="button" id="copy-dist-'+i+'">Copy text</button>'+
				(sent?'':'<button class="secondary" type="button" data-mark-sent="'+esc(x.distribution_id)+'"'+(allApproved?'':' disabled title="Approve the distribution first"')+'>Mark as sent</button>')+'</div>'+
				'<div class="message" data-dist-msg></div></div>';
			}).join(''):'<div class="unavailable">No distribution actions.</div>';
			r.distributions.forEach(function(x,i){media_review_copyText('copy-dist-'+i,'dist-text-'+i)});
			document.querySelectorAll('[data-mark-sent]').forEach(function(b){b.addEventListener('click',async()=>{
				const item=b.closest('.item');const msg=item.querySelector('[data-dist-msg]');msg.textContent='Recording…';
				try{await api('/api/operating-center/news/review/mark-sent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({distribution_id:b.dataset.markSent})});msg.textContent='Marked as sent.';await media_review_load(articleId)}catch(err){msg.textContent=err.message}
			})});
			const ap=document.querySelector('#approve-panel');
			if(allApproved){ap.querySelector('p').innerHTML='Distribution approved. Post each channel manually, then mark it as sent above.';document.querySelector('#approve-btn').disabled=true;document.querySelector('#approve-btn').textContent='Approved ✓'}
		}catch(err){document.querySelector('#app-message').textContent=err.message}
	}
	function media_review_maybe(){
		const hint=document.querySelector('#media-review-hint');
		const block=document.querySelector('#media-review-block');
		const aid=new URLSearchParams(location.search).get('article_id')||'';
		if(!aid){if(block)block.hidden=true;if(hint)hint.hidden=false;return;}
		if(hint)hint.hidden=true;if(block)block.hidden=false;
		const ab=document.querySelector('#approve-btn');
		if(ab)ab.addEventListener('click',async()=>{
			const m=document.querySelector('#approve-message');m.textContent='Approving…';
			try{const r=await api('/api/operating-center/news/review/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({article_id:aid})});m.textContent='Approved: '+r.variants_approved+' variants, '+r.distributions_prepared+' prepared actions. Nothing was sent.';await media_review_load(aid)}catch(err){m.textContent=err.message}
		});
		media_review_load(aid);
	}

	async function boot_media(){
		document.querySelector('#compose-plan').addEventListener('click',async()=>{
			const m=document.querySelector('#plans-message');m.textContent='Composing plan from verified sources…';
			try{
				const r=await api('/api/operating-center/media/plans/compose',{method:'POST'});
				m.textContent='Composed: '+r.article_count+' article slots, all with cited sources.';
				await media_loadPlans();await media_openPlan(r.plan_id);
			}catch(err){m.textContent=err.message}
		});
		document.querySelector('#plan-form').addEventListener('submit',async e=>{
			e.preventDefault();const m=e.target.querySelector('.message');m.textContent='Creating…';
			try{
				const fd=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,String(v)]));
				const r=await api('/api/operating-center/media/plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fd)});
				e.target.reset();m.textContent='Created.';await media_loadPlans();await media_openPlan(r.plan_id);
			}catch(err){m.textContent=err.message}
		});
		document.querySelector('#article-form').addEventListener('submit',async e=>{
			e.preventDefault();const m=e.target.querySelector('.message');m.textContent='Adding…';
			try{
				const fd=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,String(v)]));
				await api('/api/operating-center/media/plans/'+encodeURIComponent(media_selectedPlan)+'/articles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fd)});
				e.target.reset();m.textContent='Added.';await media_loadPlans();await media_openPlan(media_selectedPlan);
			}catch(err){m.textContent=err.message}
		});
		await media_loadPlans();
		media_review_maybe();
	}
`;

// ---------------------------------------------------------------------------
// 5. Sites (traffic statistics block moved to the Analytics tab)
// ---------------------------------------------------------------------------

const SITES_PANELS = `<section class="panel">
			<h2>Web properties</h2>
			<div class="message" id="sites-message" aria-live="polite"></div>
			<div id="sites-list">Loading…</div>
		</section>`;

const SITES_SCRIPT = `
	async function boot_sites(){
		const box=document.querySelector('#sites-list');
		try{
			const data=await api('/api/operating-center/sites/overview');
			const sites=data.sites||[];
			box.innerHTML=sites.map(function(s){return '<div class="item"><strong><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.name)+'</a></strong><div class="detail">'+esc(s.description)+'</div></div>'}).join('');
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

// ---------------------------------------------------------------------------
// Quick actions (top of #app, after the gate unlocks)
// ---------------------------------------------------------------------------

const MKT_QUICK_ACTIONS = `<span>Quick actions:</span>` +
	`<button type="button" onclick="__mktGo('social','#pack-build','#tabpanel-social')">Создать пост</button>` +
	`<button type="button" onclick="__mktGo('media','#article-form','#tabpanel-media')">Новость на сайт</button>` +
	`<button type="button" onclick="__mktPress()">Press release</button>` +
	`<button type="button" onclick="__mktGo('ads','#ads-list','#tabpanel-ads')">Подготовить Ads campaign</button>` +
	`<button type="button" onclick="__mktGo('analytics','#tabpanel-analytics')">Открыть analytics</button>` +
	`<script>
		window.__mktGo=function(tab,sel,fb){
			if(location.hash!=='#'+tab){location.hash=tab;}
			setTimeout(function(){
				let el=document.querySelector(sel);
				if(el&&el.offsetParent===null)el=null;
				if(!el&&fb)el=document.querySelector(fb);
				if(el)el.scrollIntoView();
			},400);
		};
		window.__mktPress=function(){
			window.__mktGo('media','#article-form','#tabpanel-media');
			setTimeout(function(){
				const q=document.querySelector('#article-form select[name="kind"],#article-form select[name="type"]');
				if(!q)return;
				for(let i=0;i<q.options.length;i++){
					if(q.options[i].value.toLowerCase().indexOf('press')>=0){q.value=q.options[i].value;break;}
				}
			},450);
		};
	<\/script>`;

export function renderMarketingSectionHtml(): string {
	return ocSectionShell({
		section: "marketing",
		title: "Marketing",
		subtitle: "Channels, content and campaigns — the Machine prepares, the owner publishes.",
		appTopHtml: MKT_QUICK_ACTIONS,
		tabs: [
			{ id: "ads", label: "Ads", panelsHtml: ADS_PANELS, script: ADS_SCRIPT, reportId: "ads" },
			{ id: "analytics", label: "Analytics", panelsHtml: ANALYTICS_PANELS, script: ANALYTICS_SCRIPT },
			{ id: "social", label: "Social", panelsHtml: SOCIAL_PANELS, script: SOCIAL_SCRIPT, reportId: "social" },
			{ id: "media", label: "Media", panelsHtml: MEDIA_PANELS, script: MEDIA_SCRIPT },
			{ id: "sites", label: "Sites", panelsHtml: SITES_PANELS, script: SITES_SCRIPT, reportId: "sites" },
		],
	});
}
