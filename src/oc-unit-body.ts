// Shared business-unit screen renderer (client-side JS, no DOM needed).
//
// Used by both:
//   - the OC Organizations section (platform admin): full detail incl.
//     tenant-id line, back link to the Organizations directory, and deep
//     links into Engine functions;
//   - the tenant portal (tenant users): the same unit body, but tenant
//     IDs, the Organizations back link, and Engine-function deep links are
//     omitted via options.
//
// Exposes window.__unitRender = { esc, body, statusBadge }.

export const UNIT_BODY_SCRIPT = `
(function(){
	function esc(v){return String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
	function moneyCents(n){
		if(n===null||n===undefined)return '<span class="unavailable">UNKNOWN</span>';
		return '$'+(Number(n)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
	}
	function badge(text,kind){
		var cls=kind==='ok'?'badge-ok':(kind==='warn'?'badge-warn':'badge');
		return '<span class="'+cls+'">'+esc(text)+'</span>';
	}
	function statusBadge(s){
		if(s==='operating')return badge('OPERATING','ok');
		if(s==='pilot')return badge('PILOT','warn');
		if(s==='not_operating')return badge('NOT OPERATING','');
		return badge('UNKNOWN','');
	}
	function assetRow(a){
		var m=a.money;
		return '<div class="item"><strong>'+esc(a.name)+'</strong>'+
			'<span class="badge">'+esc(a.object_type)+'</span> '+badge(String(a.active_status||'unknown').toUpperCase(), a.active_status==='active'?'ok':'')+
			'<div class="detail"><b>Money:</b> '+(m?('gross '+moneyCents(m.gross_cents)+' · '+esc(m.transaction_count)+' transaction(s) · net '+moneyCents(m.net_cents)):'<span class="unavailable">UNKNOWN — no money truth linked</span>')+'</div>'+
			(a.next_revenue_action?'<div class="detail"><b>Next action:</b> '+esc(a.next_revenue_action)+' ('+esc(a.action_status)+')</div>':'')+
			'</div>';
	}
	/**
	 * u: business-unit detail object (same shape for OC and portal APIs).
	 * o: { links:[{label,href}], backHtml, tenantLine, engineEmpty }
	 *   - links: deep links into Engine functions (admin only; portal: []).
	 *   - backHtml: back-link HTML above the title (admin: Organizations
	 *     directory link; portal: '').
	 *   - tenantLine: admin metadata line incl. tenant id (portal: '').
	 *   - engineEmpty: render the "no Engine functions" panel when links
	 *     is empty (admin: true; portal: false — panel omitted entirely).
	 */
	function unitBodyHtml(u,o){
		o=o||{};
		var links=o.links||[];
		var money=u.money;
		var moneyHtml='<div class="stats">'+
			'<div class="stat"><strong>'+moneyCents(money&&money.gross_cents)+'</strong><span>Gross (verified)</span></div>'+
			'<div class="stat"><strong>'+(money?esc(money.transaction_count):'<span class="unavailable">?</span>')+'</strong><span>Transactions</span></div>'+
			'<div class="stat"><strong>'+moneyCents(money&&money.revenue_30d_cents)+'</strong><span>Last 30 days</span></div>'+
			'<div class="stat"><strong>'+moneyCents(money&&money.revenue_90d_cents)+'</strong><span>Last 90 days</span></div></div>'+
			'<p class="meta">Net: '+(money&&money.net_cents!==null&&money.net_cents!==undefined?moneyCents(money.net_cents):'UNKNOWN — no settlement truth in the source (never zero-filled)')+'. '+
			'Derived at read time from canonical money truth; nothing is stored per business unit.</p>';
		if(!money)moneyHtml='<section class="panel"><h2>Money / revenue</h2><p class="unavailable">UNKNOWN — no linked assets carry money truth. No synthetic revenue is shown.</p></section>';
		else moneyHtml='<section class="panel"><h2>Money / revenue</h2>'+moneyHtml+'</section>';

		var audienceHtml=u.audience
			?'<section class="panel"><h2>Audience</h2><p><strong>'+esc(u.audience.label)+':</strong> '+esc(u.audience.value)+'</p><p class="meta">Source: '+esc(u.audience.source)+'</p></section>'
			:'<section class="panel"><h2>Audience</h2><p class="unavailable">UNKNOWN — no connected audience source for this unit.</p></section>';

		var integ=(u.connected_integrations||[]).map(function(x){
			return '<div class="item"><strong>'+esc(x.integration)+'</strong> '+badge(String(x.status).toUpperCase(), x.status==='connected'?'ok':'warn')+(x.note?'<div class="meta">'+esc(x.note)+'</div>':'')+'</div>';
		}).join('');
		var integHtml='<section class="panel"><h2>Integrations</h2>'+(integ||'<p class="unavailable">NOT CONNECTED — no integrations linked to this unit.</p>')+'</section>';

		var actions=(u.next_actions||[]).map(function(a){return '<div class="item">'+esc(a)+'</div>'}).join('');
		var actionsHtml='<section class="panel"><h2>Next actions</h2>'+(actions||'<p class="unavailable">No recorded next actions.</p>')+'</section>';

		var linksHtml='';
		if(links.length){
			linksHtml='<section class="panel"><h2>Engine functions</h2>'+links.map(function(l){return '<p><a class="oc-menu-btn" href="'+esc(l.href)+'">'+esc(l.label)+'</a></p>'}).join('')+'</section>';
		}else if(o.engineEmpty){
			linksHtml='<section class="panel"><h2>Engine functions</h2><p class="unavailable">No Engine functions linked yet — this unit is not operating.</p></section>';
		}

		return '<section class="panel">'+(o.backHtml||'')+
			'<h2>'+esc(u.name)+'</h2>'+
			'<p>'+statusBadge(u.operating_status)+' <span class="badge">'+esc(u.unit_type)+'</span> <span class="badge">'+esc(u.legal_entity_status)+'</span></p>'+
			(o.tenantLine||'')+
			'<p class="detail"><b>Revenue model:</b> '+esc(u.revenue_model||'UNKNOWN')+'</p>'+
			(u.owner_legal_ref?'<p class="detail"><b>Legal entity:</b> '+esc(u.owner_legal_ref)+'</p>':'')+
			'</section>'+
			'<section class="panel"><h2>Assets</h2>'+((u.assets||[]).map(assetRow).join('')||'<p class="unavailable">No connected assets — nothing linked to this unit yet.</p>')+'</section>'+
			moneyHtml+audienceHtml+integHtml+actionsHtml+linksHtml;
	}
	window.__unitRender={esc:esc,body:unitBodyHtml,statusBadge:statusBadge};
})();
`;
