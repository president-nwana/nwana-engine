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
			ready: false,
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
<p class="meta">Manage tenants, users, modules, and licensing. Operational NWANA work lives in the <a href="/operating-center">NWANA Workspace</a>.</p>
</section>
<div class="grid">${cardsHtml}</div>
</main>
</body>
</html>`;
}
