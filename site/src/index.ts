// nwana-site: the public NWANA federation website.
// Server-rendered pages, read-only access to the engine D1.

import { aboutPage, calendarPage, homePage, newsArticlePage, newsPage, resultsPage, sellersPage, winnersPage } from "./pages";
import {
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
	mediaContactPage,
	partnersPage,
	pressPage,
	privacyPage,
	safesportPage,
	safetyPage,
	sponsorsPage,
	supportPage,
	termsConditionsPage,
	termsPage,
	waysToGivePage,
} from "./pages-migration";
import { esc, layout } from "./views";

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

function html(body: string, status = 200): Response {
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname.replace(/\/+$/, "") || "/";

		try {
			if (request.method === "GET" && path === "/health") {
				return Response.json({ ok: true, service: "nwana-site" });
			}
			if (request.method === "GET" && path === "/") {
				return html(await homePage(env.nwana_site_db));
			}
			if (request.method === "GET" && path === "/results") {
				return html(await resultsPage(env.nwana_site_db, url.searchParams.get("distance"), url.searchParams.get("view")));
			}
			if (request.method === "GET" && path === "/about") {
				return html(await aboutPage());
			}
			if (request.method === "GET" && path === "/calendar") {
				return html(await calendarPage(env.nwana_site_db));
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
			if (request.method === "GET" && path === "/groups") {
				return html(await groupsPage());
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
				return html(await documentsPage());
			}
			if (request.method === "GET" && path === "/forms") {
				return html(await formsPage());
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
				return html(await elitePage());
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
			if (request.method === "GET" && path === "/partners/become-a-partner") {
				return html(await becomePartnerPage());
			}
			const article = /^\/news\/([a-z0-9-]+)$/.exec(path);
			if (request.method === "GET" && article) {
				const page = await newsArticlePage(env.nwana_site_db, article[1]);
				return page ? html(page) : notFound();
			}
			return notFound();
		} catch (error) {
			return errorPage(error);
		}
	},
};
