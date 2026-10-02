/**
 * Unified login screen (2026-10-02).
 *
 * One public Engine entry: email + password. Authentication determines
 * identity, role, tenant, and allowed business units. Post-login routing:
 *   NWANA user      → NWANA Workspace (/operating-center)
 *   external tenant → own tenant workspace (/portal)
 *   demo user       → Demo Workspace (/portal, demo tenant)
 *   platform admin  → Platform Admin (/admin)
 *
 * No tenant selector for ordinary users. No owner-key gate in normal UX.
 */

export function renderLoginHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in — NWANA Engine</title>
<style>
:root{color-scheme:light;--ink:#17221d;--muted:#66736d;--line:#dce4df;--paper:#f5f7f5;--brand:#183d2d}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:white;border:1px solid var(--line);border-radius:16px;padding:36px;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(24,61,45,.08)}
h1{margin:0 0 6px;font-size:26px;color:var(--brand)}
.sub{color:var(--muted);margin:0 0 24px;font-size:14px}
label{display:block;margin:14px 0 6px;font-weight:600;font-size:14px}
input{width:100%;font:inherit;border:1px solid var(--line);border-radius:9px;padding:12px;background:white}
input:focus{outline:2px solid var(--brand);outline-offset:1px;border-color:var(--brand)}
button{width:100%;margin-top:22px;border:0;border-radius:9px;padding:13px;background:var(--brand);color:white;font-weight:700;font-size:16px;cursor:pointer}
button:hover{background:#234f3a}
button:disabled{opacity:.6;cursor:wait}
.message{min-height:22px;color:#b00020;margin-top:12px;font-size:14px}
.hint{margin-top:20px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
</style>
</head>
<body>
<main class="card">
<h1>NWANA Engine</h1>
<p class="sub">Sign in with your organization account.</p>
<form id="login-form">
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="username" required autofocus>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit" id="submit">Sign in</button>
<div class="message" id="message" role="alert"></div>
</form>
<div class="hint">Your workspace opens automatically after sign-in based on your role.</div>
</main>
<script>
const SESSION_KEY = 'nwana_engine_session';
const form = document.getElementById('login-form');
const msg = document.getElementById('message');
const submit = document.getElementById('submit');

function routeFor(session) {
	const role = session.user.role;
	const tid = session.user.tenant_id;
	if (role === 'platform_admin') return '/admin';
	if (role === 'demo_user') return '/portal';
	if (tid === 'nwana') return '/operating-center';
	return '/portal';
}

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	msg.textContent = '';
	submit.disabled = true;
	const email = document.getElementById('email').value;
	const password = document.getElementById('password').value;
	try {
		const res = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password }),
		});
		const data = await res.json();
		if (!data.ok) {
			msg.textContent = data.error || 'Sign-in failed.';
			submit.disabled = false;
			return;
		}
		try { sessionStorage.setItem(SESSION_KEY, data.token); } catch (err) {}
		// Resolve the session to get routing info, then redirect.
		const sres = await fetch('/api/auth/session', {
			headers: { 'Authorization': 'Bearer ' + data.token },
		});
		const sdata = await sres.json();
		if (!sdata.ok) {
			msg.textContent = 'Signed in, but session could not be verified.';
			submit.disabled = false;
			return;
		}
		window.location.href = routeFor(sdata);
	} catch (err) {
		msg.textContent = 'Network error. Please try again.';
		submit.disabled = false;
	}
});
</script>
</body>
</html>`;
}
