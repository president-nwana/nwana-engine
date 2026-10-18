// nwana-site: the public NWANA federation website.
// Server-rendered pages, read-only access to the engine D1.

import { aboutPage, calendarPage, challengesPage, homePage, newsArticlePage, newsPage, resultsPage, sellersPage, seriesPage, winnersPage } from "./pages";
import {
	albertTazetdinovPage,
	antiDopingPage,
	becomePartnerPage,
	brandPage,
	chooseYourPathPage,
	codeOfConductPage,
	contactPage,
	documentsPage,
	elitePage,
	eventsPage,
	faqPage,
	formsPage,
	governancePage,
	groupsPage,
	leonidsReinholdsPage,
	lieneVisockaPage,
	marisVainovskisPage,
	mediaContactPage,
	partnerNetworkPage,
	partnersPage,
	pressPage,
	privacyPage,
	safesportPage,
	safetyPage,
	sponsorsPage,
	supportPage,
	svenThorslundPage,
	termsConditionsPage,
	termsPage,
	tommyAunanPage,
	waysToGivePage,
} from "./pages-migration";
import { esc, layout } from "./views";
import { getNews } from "./data";
import { dlInjectForms, dlInjectLibrary, dlServe, sfDef, sfFormPage, sfHandlePost } from "./forms-downloads";

interface Env {
	nwana_site_db: D1Database;
}

function notFound(): Response {
	const content = `
  <div class="page-head"><div class="wrap">
    <h1>Page not found</h1>
    <p>The page you are looking for does not exist or has moved.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <p><a class="card-link" href="/">← Back to the home page</a></p>
  </div></div>`;
	return new Response(layout("Page Not Found", "", content), {
		status: 404,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

let CANONICAL_PATH = "/";

function html(body: string, status = 200): Response {
	if (status === 200 && typeof body === "string" && body.includes("</head>")) {
		body = body.replace("</head>", `<link rel="canonical" href="https://nwaofna.org${CANONICAL_PATH === "/" ? "/" : CANONICAL_PATH}"></head>`);
	}
	return new Response(body, {
		status,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "public, max-age=60",
		},
	});
}

function errorPage(error: unknown): Response {
	console.error(error);
	const content = `
  <div class="page-head"><div class="wrap">
    <h1>Something went wrong</h1>
    <p>Please try again in a moment. If the problem persists, contact the federation.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <p><a class="card-link" href="/">← Back to the home page</a></p>
  </div></div>`;
	return new Response(layout("Error", "", content), {
		status: 500,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

import { LOGO_JPG_BASE64, FAVICON_PNG_BASE64, ALBERT_FATIKHOV_PNG_BASE64, LIENE_VISOCKA_SQ_JPG_BASE64, ALBERT_TAZETDINOV_SQ_JPG_BASE64, SVEN_THORSLUND_379_JPG_BASE64, SVEN_THORSLUND_SILVER_JPG_BASE64 } from "./assets-embedded";

function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.hostname === "www.nwaofna.org") {
			return new Response(null, {
				status: 301,
				headers: { location: "https://nwaofna.org" + url.pathname + url.search },
			});
		}
		const path = url.pathname.replace(/\/+$/, "") || "/";
		CANONICAL_PATH = path;

		try {
			// Serve embedded static assets (logo, favicon) directly from the
			// Worker bundle. This ensures they work even if the assets/
			// directory was not included in the deploy. The source files live
			// in public/ (local to nwana-site, not external URLs).
			if (request.method === "GET" && (path === "/logo.jpg" || path === "/logo.jpeg")) {
				return new Response(base64ToBytes(LOGO_JPG_BASE64), {
					headers: {
						"content-type": "image/jpeg",
						"cache-control": "public, max-age=86400",
					},
				});
			}
			if (request.method === "GET" && (path === "/favicon.png" || path === "/favicon.ico" || path === "/apple-touch-icon.png")) {
				return new Response(base64ToBytes(FAVICON_PNG_BASE64), {
					headers: {
						"content-type": "image/png",
						"cache-control": "public, max-age=86400",
					},
				});
			}
			// Albert Fatikhov photo (homepage strip). Local asset, not external URL.
			// Source: downloaded from the working CloudFront URL from commit ac4323be,
			// stored in public/albert-fatikhov.png and embedded here for reliability.
			if (request.method === "GET" && path === "/albert-fatikhov.png") {
				return new Response(base64ToBytes(ALBERT_FATIKHOV_PNG_BASE64), {
					headers: {
						"content-type": "image/png",
						"cache-control": "public, max-age=86400",
					},
				});
			}
			// Photos whose files exist in public/ but are not reliably served
			// by the assets binding: served embedded, like the logo (see the
			// comment on the logo route above). The two Sven photos are
			// web-optimized copies (max 1000px wide) of the public/ originals.
			if (request.method === "GET" && (path === "/board/liene-visocka-sq.jpg" || path === "/board/albert-tazetdinov-sq.jpg" || path === "/elite/sven-thorslund-379.jpg" || path === "/elite/sven-thorslund-silver.jpg")) {
				const b64img = path === "/board/liene-visocka-sq.jpg"
					? LIENE_VISOCKA_SQ_JPG_BASE64
					: path === "/board/albert-tazetdinov-sq.jpg"
						? ALBERT_TAZETDINOV_SQ_JPG_BASE64
						: path === "/elite/sven-thorslund-379.jpg"
							? SVEN_THORSLUND_379_JPG_BASE64
							: SVEN_THORSLUND_SILVER_JPG_BASE64;
				return new Response(base64ToBytes(b64img), {
					headers: {
						"content-type": "image/jpeg",
						"cache-control": "public, max-age=86400",
					},
				});
			}
			if (request.method === "GET" && path === "/health") {
				return Response.json({ ok: true, service: "nwana-site" });
			}
			if (request.method === "GET" && path === "/") {
				return html(await homePage(env.nwana_site_db));
			}
			if (request.method === "GET" && path === "/results") {
				const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
				return html(await resultsPage(
					env.nwana_site_db,
					url.searchParams.get("distance"),
					url.searchParams.get("view"),
					url.searchParams.get("search"),
					page,
				));
			}
			if (request.method === "GET" && path === "/about") {
				return html(await aboutPage());
			}
			if (request.method === "GET" && path === "/calendar") {
				return html(await calendarPage(env.nwana_site_db));
			}
			if (request.method === "GET" && path === "/challenges") {
				return html(await challengesPage(env.nwana_site_db));
			}
			if (request.method === "GET" && path === "/series") {
				return html(await seriesPage(env.nwana_site_db));
			}
			if (request.method === "GET" && path === "/winners") {
				return html(await winnersPage(env.nwana_site_db));
			}
			if (request.method === "GET" && path === "/news") {
				return html(await newsPage(env.nwana_site_db));
			}
			if (request.method === "GET" && path === "/sellers") {
				return html(await sellersPage());
			}
			if (request.method === "GET" && path === "/sponsors") {
				return html(await sponsorsPage());
			}
			if (request.method === "GET" && path === "/umbrella-groups") {
				return html(await groupsPage());
			}
			if (request.method === "GET" && path === "/groups") {
				return new Response(null, {
					status: 301,
					headers: { location: "https://groups.nwaofna.org/" },
				});
			}
			if (request.method === "GET" && path === "/press") {
				return html(await pressPage());
			}
			if (request.method === "GET" && path === "/media-contact") {
				return html(await mediaContactPage());
			}
			if (request.method === "GET" && path === "/brand") {
				return html(await brandPage());
			}
			if (request.method === "GET" && path === "/governance") {
				return html(await governancePage());
			}
			if (request.method === "GET" && path === "/privacy") {
				return html(await privacyPage());
			}
			if (request.method === "GET" && path === "/terms") {
				return html(await termsPage());
			}
			if (request.method === "GET" && path === "/terms-conditions") {
				return html(await termsConditionsPage());
			}
			if (request.method === "GET" && path === "/code-of-conduct") {
				return html(await codeOfConductPage());
			}
			if (request.method === "GET" && path === "/safesport") {
				return html(await safesportPage());
			}
			if (request.method === "GET" && path === "/anti-doping") {
				return html(await antiDopingPage());
			}
			if (request.method === "GET" && path === "/safety") {
				return html(await safetyPage());
			}
			if (request.method === "GET" && path === "/documents") {
				return html(dlInjectLibrary(await documentsPage()));
			}
			if (request.method === "GET" && path === "/forms") {
				return html(dlInjectForms(await formsPage()));
			}
			if (request.method === "GET" && path === "/choose-your-path") {
				return html(await chooseYourPathPage());
			}
			if (request.method === "GET" && path === "/faq") {
				return html(await faqPage());
			}
			if (request.method === "GET" && path === "/events") {
				return html(await eventsPage());
			}
			if (request.method === "GET" && path === "/elite") {
				return html(await elitePage(env.nwana_site_db));
			}
			if (request.method === "GET" && path === "/elite/tommy-aunan") {
				return html(await tommyAunanPage());
			}
			if (request.method === "GET" && path === "/elite/sven-thorslund") {
				return html(await svenThorslundPage());
			}
			if (request.method === "GET" && path === "/board/liene-visocka") {
				return html(await lieneVisockaPage());
			}
			if (request.method === "GET" && path === "/board/maris-vainovskis") {
				return html(await marisVainovskisPage());
			}
			if (request.method === "GET" && path === "/board/leonids-reinholds") {
				return html(await leonidsReinholdsPage());
			}
			if (request.method === "GET" && path === "/board/albert-tazetdinov") {
				return html(await albertTazetdinovPage());
			}
			if (request.method === "GET" && path === "/support") {
				return html(await supportPage());
			}
			if (request.method === "GET" && path === "/ways-to-give") {
				return html(await waysToGivePage());
			}
			if (request.method === "GET" && path === "/contact") {
				return html(await contactPage());
			}
			if (request.method === "GET" && path === "/partners") {
				return html(await partnersPage());
			}
			if (request.method === "GET" && path === "/partner-network") {
				return html(await partnerNetworkPage());
			}
			if (request.method === "GET" && path === "/partners/become-a-partner") {
				return html(await becomePartnerPage());
			}
			if (request.method === "GET" && path === "/sitemap.xml") {
				let slugs: string[] = [];
				try {
					slugs = (await getNews(env.nwana_site_db, 100)).map((n) => n.slug);
				} catch {}
				const staticPaths = ["/", "/about", "/results", "/calendar", "/challenges", "/series", "/winners", "/news", "/elite", "/elite/tommy-aunan", "/elite/sven-thorslund", "/board/liene-visocka", "/board/maris-vainovskis", "/board/leonids-reinholds", "/board/albert-tazetdinov", "/choose-your-path", "/events", "/faq", "/governance", "/privacy", "/terms", "/terms-conditions", "/code-of-conduct", "/safesport", "/anti-doping", "/safety", "/documents", "/forms", "/forms/general-inquiry", "/forms/instructor-coach-inquiry", "/forms/event-program-proposal", "/forms/sponsor-partner-inquiry", "/forms/volunteer-interest", "/forms/safety-incident-report", "/forms/media-request", "/forms/document-brand-asset-request", "/forms/correction-request", "/brand", "/press", "/media-contact", "/sponsors", "/partners", "/partner-network", "/partners/become-a-partner", "/sellers", "/umbrella-groups", "/support", "/ways-to-give", "/contact"];
				const urls = staticPaths.concat(slugs.map((s) => "/news/" + s));
				const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map((u) => "<url><loc>https://nwaofna.org" + u + "</loc></url>").join("\n") + "\n</urlset>";
				return new Response(xml, {
					headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
				});
			}
			const article = /^\/news\/([a-z0-9-]+)$/.exec(path);
			if (request.method === "GET" && article) {
				const page = await newsArticlePage(env.nwana_site_db, article[1]);
				return page ? html(page) : notFound();
			}
			const sfMatch = /^\/forms\/([a-z0-9-]+)$/.exec(path);
			if (sfMatch && (request.method === "GET" || request.method === "POST")) {
				const def = sfDef(sfMatch[1]);
				if (!def) return notFound();
				if (request.method === "GET") return html(sfFormPage(def, {}, []));
				const r = await sfHandlePost(request, env.nwana_site_db, def);
				return html(r.body, r.status);
			}
			const dlMatch = /^\/downloads\/([a-z0-9._-]+)$/.exec(path);
			if (request.method === "GET" && dlMatch) {
				const resp = await dlServe(dlMatch[1], env.nwana_site_db);
				if (resp) return resp;
				return notFound();
			}
			return notFound();
		} catch (error) {
			return errorPage(error);
		}
	},
};
