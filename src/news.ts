// NWANA Engine — canonical news API.
//
// ONE news store (D1 `news_articles`) feeds both public sites:
//   nwaofna.org (nwana-site worker, reads D1 directly via its binding)
//   challenges.nwaofna.org (charity worker, reads via this public API)
//
// Visibility model: audience = 'nwana' | 'charity' | 'both'.
// One article, flags decide where it renders. No manual copy-paste between
// sites, no two copies, no copy loops.
//
// NEWS POLICY (see migrations/0082-news-articles.sql):
//   Publish: notable sport results, new participant (real human story only),
//   new team, fundraising milestone, new instructor/organization, partnership,
//   competition update, Challenge milestone, recognition.
//   NEVER: internal kitchen (who sent whom a file, internal research,
//   internal work messages, Engine/RunSignup technical actions).
//   NEVER auto-create news per registration.

export type NewsAudience = "nwana" | "charity";

const ARTICLE_FIELDS = `id, slug, title, excerpt, body_html, category, audience, published_at`;

function isAudience(v: string | null): v is NewsAudience {
	return v === "nwana" || v === "charity";
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"access-control-allow-origin": "*",
			"cache-control": "public, max-age=300",
		},
	});
}

interface Env {
	nwana_engine_db: D1Database;
}

/**
 * GET /api/news?audience=nwana|charity[&limit=][&category=]
 * Public read-only list. 'both' articles are included for either audience.
 */
export async function handleNewsList(url: URL, env: Env): Promise<Response> {
	const audience = url.searchParams.get("audience");
	if (!isAudience(audience)) {
		return json({ ok: false, error: "audience must be nwana|charity" }, 400);
	}
	const rawLimit = parseInt(url.searchParams.get("limit") || "30", 10);
	const limit = Math.min(Math.max(rawLimit || 30, 1), 100);
	const category = (url.searchParams.get("category") || "").trim();

	let sql = `SELECT ${ARTICLE_FIELDS} FROM news_articles
		WHERE status = 'published' AND (audience = ? OR audience = 'both')`;
	const binds: (string | number)[] = [audience];
	if (category) {
		sql += ` AND category = ?`;
		binds.push(category);
	}
	sql += ` ORDER BY published_at DESC LIMIT ?`;
	binds.push(limit);

	try {
		const { results } = await env.nwana_engine_db
			.prepare(sql)
			.bind(...binds)
			.all();
		return json({ ok: true, audience, articles: results ?? [] });
	} catch (e) {
		return json({ ok: false, error: "news_unavailable" }, 500);
	}
}

/**
 * GET /api/news/<slug>?audience=nwana|charity
 * Public read-only single article. Audience filter enforced: an nwana-only
 * article is NOT visible to the charity audience and vice versa.
 */
export async function handleNewsItem(slug: string, url: URL, env: Env): Promise<Response> {
	const audience = url.searchParams.get("audience");
	if (!isAudience(audience)) {
		return json({ ok: false, error: "audience must be nwana|charity" }, 400);
	}
	if (!slug || slug.length > 120 || !/^[a-z0-9-]+$/.test(slug)) {
		return json({ ok: false, error: "not_found" }, 404);
	}
	try {
		const row = await env.nwana_engine_db
			.prepare(
				`SELECT ${ARTICLE_FIELDS} FROM news_articles
				 WHERE slug = ? AND status = 'published'
				   AND (audience = ? OR audience = 'both')
				 LIMIT 1`,
			)
			.bind(slug, audience)
			.first();
		if (!row) return json({ ok: false, error: "not_found" }, 404);
		return json({ ok: true, audience, article: row });
	} catch (e) {
		return json({ ok: false, error: "news_unavailable" }, 500);
	}
}
