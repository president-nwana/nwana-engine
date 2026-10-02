// Platform Admin (2026-10-02): platform/SaaS administration workspace.
//
// Split from the NWANA Operating Center per owner decision: the NWANA
// Workspace (/operating-center/*) is the real NWANA operations environment;
// Platform Admin (/admin/*) is platform-level administration ONLY:
// Organizations/tenants, tenant users/access, enabled modules, licensing
// metadata, tenant configuration, platform-wide settings, system health.
//
// Tenant isolation is unchanged: admin routes keep the existing
// platform_admin gate; no tenant data crosses tenants.

import { type PlatformAdminPageId } from "./operating-center";

/**
 * Platform Admin menu: Organizations, Users, Modules, Licensing, Settings,
 * Health. Rendered on every /admin/* page. Pages not yet implemented link
 * to their canonical future routes.
 */
export function platformAdminMenu(active: PlatformAdminPageId | string): string {
	const items: Array<{ id: PlatformAdminPageId; label: string; href: string }> = [
		{ id: "organizations", label: "Organizations", href: "/admin/organizations" },
		{ id: "users", label: "Users", href: "/admin/users" },
		{ id: "modules", label: "Modules", href: "/admin/modules" },
		{ id: "licensing", label: "Licensing", href: "/admin/licensing" },
		{ id: "settings", label: "Settings", href: "/admin/settings" },
		{ id: "health", label: "Health", href: "/admin/health" },
	];
	return (
		'<nav class="oc-menu" aria-label="Platform administration">' +
		items
			.map((i) =>
				i.id === active
					? '<a class="oc-menu-btn oc-menu-active" href="' + i.href + '" aria-current="page">' + i.label + "</a>"
					: '<a class="oc-menu-btn" href="' + i.href + '">' + i.label + "</a>",
			)
			.join("") +
		"</nav>"
	);
}

const ADMIN_STYLE = `<style>
	:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#4a2d6b;--accent:#ece5f5}
	*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
	header{background:var(--brand);color:white;padding:28px clamp(20px,5vw,72px)}header h1{margin:0;font-size:clamp(28px,4vw,44px)}header p{margin:8px 0 0;color:#e6dcf2}
	.oc-menu{background:var(--brand);padding:0 clamp(20px,5vw,72px) 18px;display:flex;flex-wrap:wrap;gap:10px}
	.oc-menu-btn{display:inline-block;background:#6b4a94;color:#fff;font-weight:700;padding:10px 20px;border-radius:9px;text-decoration:none}
	.oc-menu-btn:hover{background:#7d5ba8}.oc-menu-active{background:#fff;color:var(--brand)}
	main{max-width:1240px;margin:auto;padding:28px 20px 60px}
	.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px}
	.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:20px}
	.meta{color:var(--muted);font-size:14px}.unavailable{color:var(--muted)}
</style>`;

/**
 * GET /admin — Platform Admin landing. Lists the admin areas; Organizations
 * is the only one implemented in this step.
 */
export function renderAdminLandingHtml(): string {
	const cards = [
		{
			id: "organizations",
			title: "Organizations",
			desc: "Tenants of the NWANA Engine platform — NWANA is the first live tenant.",
			href: "/admin/organizations",
			ready: true,
		},
		{
			id: "users",
			title: "Users",
			desc: "Tenant users and access — who can sign in, per tenant and business unit.",
			href: "/admin/users",
			ready: true,
		},
		{
			id: "modules",
			title: "Modules",
			desc: "Enabled business-unit modules per tenant.",
			href: "/admin/modules",
			ready: false,
		},
		{
			id: "licensing",
			title: "Licensing",
			desc: "Licensing metadata — plan, status, billing model per tenant.",
			href: "/admin/licensing",
			ready: false,
		},
		{
			id: "settings",
			title: "Settings",
			desc: "Platform-wide settings.",
			href: "/admin/settings",
			ready: false,
		},
		{
			id: "health",
			title: "Health",
			desc: "System health — services, data freshness, incidents.",
			href: "/admin/health",
			ready: false,
		},
	];
	const cardsHtml = cards
		.map(
			(c) =>
				'<div class="panel"><h2>' +
				c.title +
				"</h2><p>" +
				c.desc +
				"</p>" +
				(c.ready
					? '<p><a class="oc-menu-btn" href="' + c.href + '">Open</a></p>'
					: '<p class="unavailable">Not yet implemented</p>') +
				"</div>",
		)
		.join("");
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Platform Admin — NWANA Engine</title>
${ADMIN_STYLE}
</head>
<body>
<header><h1>Platform Admin</h1><p>Platform / SaaS administration for NWANA Engine. Not the NWANA operations workspace.</p></header>
${platformAdminMenu("")}
<main>
<section class="panel"><h2>Administration areas</h2>
<p class="meta">Manage tenants, users, modules, and licensing.</p><p><a class="oc-menu-btn" href="/operating-center" style="text-decoration:none;display:inline-block">Open NWANA Workspace →</a></p>
</section>
<div class="grid">${cardsHtml}</div>
</main>
</body>
</html>`;
}

const USERS_STYLE = `<style>
	.user-table{width:100%;border-collapse:collapse;margin-top:12px}
	.user-table th,.user-table td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-size:14px;vertical-align:top}
	.user-table th{color:var(--muted);font-weight:600}
	.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px}
	.form-grid label{display:block;font-size:13px;color:var(--muted);margin-bottom:4px}
	.form-grid input,.form-grid select{width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;font:inherit}
	.btn{display:inline-block;background:var(--brand);color:#fff;font-weight:700;padding:9px 18px;border-radius:8px;border:0;cursor:pointer;font:inherit}
	.btn:hover{background:#5c3a86}.btn.secondary{background:#e8e2f1;color:var(--brand)}
	.btn.danger{background:#a33;color:#fff}.btn.small{padding:5px 10px;font-size:13px}
	.message{min-height:20px;font-size:14px;margin-top:8px}
	.message.error{color:#a33}.message.ok{color:#2a7a3a}
	.pw-form{display:none;margin-top:8px;padding:10px;background:var(--paper);border-radius:8px}
	.pw-form.open{display:block}
</style>`;

/**
 * GET /admin/users — Platform Admin user management (2026-10-02).
 * List, create, revoke/reactivate users, and reset passwords — all from
 * the UI, no curl. Session-only: without a session the page redirects
 * to /login. Passwords are entered in browser forms and hashed
 * server-side; they are never displayed or logged.
 */
export function renderUsersSectionHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Users — Platform Admin</title>
${ADMIN_STYLE}
${USERS_STYLE}
</head>
<body>
<header><h1>Users</h1><p>Tenant users and access — who can sign in, per tenant and role.</p></header>
${platformAdminMenu("users")}
<main>
<section class="panel" id="gate" hidden>
	<h2>Sign-in required</h2>
	<p class="unavailable">Your session has expired or you are not signed in.</p>
	<p><a class="oc-menu-btn" href="/login">Sign in</a></p>
</section>
<div id="app" hidden>
<section class="panel">
	<h2>Create user</h2>
	<p class="meta">Passwords are hashed server-side and never displayed. The new user signs in at <b>/login</b> with email + password.</p>
	<form id="create-form">
		<div class="form-grid">
			<div><label for="cu-tenant">Tenant</label><select id="cu-tenant" required></select></div>
			<div><label for="cu-email">Email</label><input id="cu-email" type="email" required autocomplete="off"></div>
			<div><label for="cu-password">Password (min 12 characters)</label><input id="cu-password" type="password" required minlength="12" autocomplete="new-password"></div>
			<div><label for="cu-name">Display name</label><input id="cu-name" type="text" required autocomplete="off"></div>
			<div><label for="cu-role">Role</label><select id="cu-role" required>
				<option value="business_unit_user">business_unit_user</option>
				<option value="tenant_admin">tenant_admin</option>
				<option value="tenant_owner">tenant_owner</option>
				<option value="demo_user">demo_user</option>
				<option value="platform_admin">platform_admin</option>
			</select></div>
			<div><label for="cu-units">Business unit IDs (comma-separated, optional)</label><input id="cu-units" type="text" placeholder="e.g. nwana-academy" autocomplete="off"></div>
		</div>
		<p style="margin-top:12px"><button class="btn" type="submit" id="cu-submit">Create user</button></p>
		<div class="message" id="cu-message" role="alert"></div>
	</form>
</section>
<section class="panel" style="margin-top:18px">
	<h2>All users</h2>
	<div id="users-table"><p class="unavailable">Loading…</p></div>
	<div class="message" id="users-message" role="alert"></div>
</section>
</div>
</main>
<script>
(function(){
	var SESSION_KEY='nwana_engine_session';
	function getKey(){try{return sessionStorage.getItem(SESSION_KEY)||''}catch(e){return ''}}
	function signOut(){try{sessionStorage.removeItem(SESSION_KEY)}catch(e){}window.location.href='/login'}
	function authz(){return {'Authorization':'Bearer '+getKey(),'Content-Type':'application/json'}}
	function esc(v){return String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
	var app=document.querySelector('#app'),gate=document.querySelector('#gate');
	if(!getKey()){signOut();return}
	gate.hidden=true;app.hidden=false;

	async function api(path,opts){
		var r=await fetch(path,Object.assign({headers:authz()},opts||{}));
		var d=null;try{d=await r.json()}catch(e){}
		if(r.status===401){signOut();throw new Error('Unauthorized')}
		if(r.status===403){throw new Error((d&&d.error)||'Not allowed')}
		return {status:r.status,d:d};
	}

	async function loadTenants(){
		var res=await api('/api/admin/tenants');
		var sel=document.getElementById('cu-tenant');
		sel.innerHTML=(res.d.tenants||[]).map(function(t){
			return '<option value="'+esc(t.tenant_id)+'">'+esc(t.display_name)+' ('+esc(t.tenant_id)+')</option>';
		}).join('');
	}

	async function loadUsers(){
		var res=await api('/api/admin/users');
		var users=res.d.users||[];
		if(!users.length){document.getElementById('users-table').innerHTML='<p class="unavailable">No users.</p>';return}
		var html='<table class="user-table"><thead><tr><th>Email</th><th>Name</th><th>Tenant</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
		html+=users.map(function(u){
			var uid=esc(u.user_id);
			var actions = u.status==='active'
				? '<button class="btn small secondary" data-act="pw" data-uid="'+uid+'">Set password</button> '+
				  '<button class="btn small danger" data-act="revoke" data-uid="'+uid+'">Revoke</button>'
				: '<button class="btn small secondary" data-act="reactivate" data-uid="'+uid+'">Reactivate</button>';
			return '<tr><td>'+esc(u.email||'—')+'</td><td>'+esc(u.display_name)+'</td><td>'+esc(u.tenant_id)+'</td>'+
				'<td>'+esc(u.role)+'</td><td>'+esc(u.status)+'</td><td>'+actions+
				'<div class="pw-form" id="pw-'+uid+'">'+
					'<label style="font-size:13px;color:var(--muted)">New password (min 12 characters)</label><br>'+
					'<input type="password" id="pw-input-'+uid+'" minlength="12" autocomplete="new-password" style="padding:8px;border:1px solid var(--line);border-radius:8px;width:220px"> '+
					'<button class="btn small" data-act="pw-save" data-uid="'+uid+'">Save</button>'+
				'</div></td></tr>';
		}).join('');
		document.getElementById('users-table').innerHTML=html+'</tbody></table>';
	}

	function msg(el,text,ok){var m=document.getElementById(el);m.textContent=text;m.className='message '+(ok?'ok':'error')}

	document.getElementById('create-form').addEventListener('submit',async function(e){
		e.preventDefault();
		var btn=document.getElementById('cu-submit');btn.disabled=true;msg('cu-message','',true);
		var units=document.getElementById('cu-units').value.split(',').map(function(x){return x.trim()}).filter(Boolean);
		try{
			var res=await api('/api/admin/users',{method:'POST',body:JSON.stringify({
				tenant_id:document.getElementById('cu-tenant').value,
				email:document.getElementById('cu-email').value,
				password:document.getElementById('cu-password').value,
				display_name:document.getElementById('cu-name').value,
				role:document.getElementById('cu-role').value,
				unit_ids:units
			})});
			if(!res.d.ok){msg('cu-message',res.d.error||'Failed',false);btn.disabled=false;return}
			document.getElementById('cu-password').value='';
			msg('cu-message','User created: '+(res.d.user.email||''),true);
			loadUsers();
		}catch(err){msg('cu-message',err.message,false)}
		btn.disabled=false;
	});

	document.getElementById('users-table').addEventListener('click',async function(e){
		var b=e.target.closest('[data-act]');if(!b)return;
		var uid=b.getAttribute('data-uid'),act=b.getAttribute('data-act');
		msg('users-message','',true);
		try{
			if(act==='pw'){document.getElementById('pw-'+uid).classList.toggle('open');return}
			if(act==='pw-save'){
				var pw=document.getElementById('pw-input-'+uid).value;
				var res=await api('/api/admin/users/'+encodeURIComponent(uid)+'/password',{method:'POST',body:JSON.stringify({password:pw})});
				if(!res.d.ok){msg('users-message',res.d.error||'Failed',false);return}
				document.getElementById('pw-input-'+uid).value='';
				document.getElementById('pw-'+uid).classList.remove('open');
				msg('users-message','Password updated.',true);return;
			}
			if(act==='revoke'||act==='reactivate'){
				if(act==='revoke'&&!confirm('Revoke this user? They will no longer be able to sign in.'))return;
				var res2=await api('/api/admin/users/'+encodeURIComponent(uid)+'/'+act,{method:'POST'});
				if(!res2.d.ok){msg('users-message',res2.d.error||'Failed',false);return}
				loadUsers();return;
			}
		}catch(err){msg('users-message',err.message,false)}
	});

	loadTenants().then(loadUsers).catch(function(e){msg('users-message',e.message,false)});
})();
</script>
</body>
</html>`;
}
