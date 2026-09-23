// ADR-0021: Media plan - the machine's editorial pipeline.
//
// Albert's directive 2026-09-22: the machine composes a media plan for him
// (Nordic Walking articles beyond event news), drafts the articles, and
// after his approval sends them for publication. RunSignup is not involved
// anywhere in this workflow. The publication channel is the new site's news
// feed (site_news), which the public nwana-site Worker reads.
//
// Lifecycle:
//   plan:    DRAFT -> APPROVED -> IN_PROGRESS -> DONE
//   article: DRAFT -> READY -> APPROVED -> PUBLISHED
//
// The machine prepares; the owner approves. Nothing reaches site_news
// without an explicit owner approval of the article.

export const MEDIA_PLAN_STATUSES = ["DRAFT", "APPROVED", "IN_PROGRESS", "DONE"] as const;
export type MediaPlanStatus = (typeof MEDIA_PLAN_STATUSES)[number];

const MEDIA_PLAN_TRANSITIONS: Record<MediaPlanStatus, MediaPlanStatus[]> = {
	DRAFT: ["APPROVED"],
	APPROVED: ["IN_PROGRESS", "DONE"],
	IN_PROGRESS: ["DONE"],
	DONE: [],
};

export function isMediaPlanStatus(value: string): value is MediaPlanStatus {
	return (MEDIA_PLAN_STATUSES as readonly string[]).includes(value);
}

export const MEDIA_ARTICLE_STATUSES = ["DRAFT", "READY", "APPROVED", "PUBLISHED"] as const;
export type MediaArticleStatus = (typeof MEDIA_ARTICLE_STATUSES)[number];

const MEDIA_ARTICLE_TRANSITIONS: Record<MediaArticleStatus, MediaArticleStatus[]> = {
	DRAFT: ["READY"],
	READY: ["APPROVED", "DRAFT"],
	APPROVED: ["PUBLISHED", "READY"],
	PUBLISHED: [],
};

export function isMediaArticleStatus(value: string): value is MediaArticleStatus {
	return (MEDIA_ARTICLE_STATUSES as readonly string[]).includes(value);
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"access-control-allow-origin": "*",
		},
	});
}

async function readJsonBody<T>(request: Request): Promise<T> {
	try {
		return (await request.json()) as T;
	} catch {
		throw new Error("Request body must be valid JSON");
	}
}

async function audit(db: D1Database, objectId: string, action: string, details: unknown): Promise<void> {
	await db
		.prepare(
			`INSERT INTO audit_events (audit_id, object_id, action, module, status, details)
			 VALUES (?, ?, ?, 'MEDIA_PLAN', 'SUCCESS', ?)`,
		)
		.bind(`AUDIT-${crypto.randomUUID()}`, objectId, action, JSON.stringify(details ?? {}))
		.run();
}

export interface MediaPlanInput {
	title: string;
	period?: string;
	notes?: string;
}

export async function createMediaPlan(request: Request, db: D1Database): Promise<Response> {
	const input = await readJsonBody<MediaPlanInput>(request);
	const title = (input.title ?? "").trim();
	if (!title) throw new Error("title is required");
	const planId = `MEDIAPLAN-${crypto.randomUUID()}`;
	await db
		.prepare(
			`INSERT INTO media_plans (plan_id, title, period, notes, status)
			 VALUES (?, ?, ?, ?, 'DRAFT')`,
		)
		.bind(planId, title, (input.period ?? "").trim() || null, (input.notes ?? "").trim() || null)
		.run();
	await audit(db, planId, "MEDIA_PLAN_CREATED", { title });
	return jsonResponse({ ok: true, plan_id: planId, status: "DRAFT" }, 201);
}

export async function listMediaPlans(db: D1Database): Promise<Response> {
	const result = await db
		.prepare(
			`SELECT p.plan_id, p.title, p.period, p.status, p.notes, p.created_at, p.approved_at,
			        (SELECT COUNT(*) FROM media_articles a WHERE a.plan_id = p.plan_id) AS article_count,
			        (SELECT COUNT(*) FROM media_articles a WHERE a.plan_id = p.plan_id AND a.status = 'PUBLISHED') AS published_count
			 FROM media_plans p
			 ORDER BY p.created_at DESC
			 LIMIT 50`,
		)
		.all();
	return jsonResponse({ ok: true, plans: result.results });
}

// Compact overview for the operating-center main page: one row per plan
// with article counts. No bodies, no full lists.
export async function getMediaOverview(db: D1Database): Promise<Response> {
	const result = await db
		.prepare(
			`SELECT p.plan_id, p.title, p.period, p.status,
			        (SELECT COUNT(*) FROM media_articles a WHERE a.plan_id = p.plan_id) AS article_count,
			        (SELECT COUNT(*) FROM media_articles a WHERE a.plan_id = p.plan_id AND a.status = 'READY') AS ready_count,
			        (SELECT COUNT(*) FROM media_articles a WHERE a.plan_id = p.plan_id AND a.status = 'PUBLISHED') AS published_count
			 FROM media_plans p
			 ORDER BY p.created_at DESC
			 LIMIT 10`,
		)
		.all();
	return jsonResponse({ ok: true, plans: result.results });
}

export async function getMediaPlan(db: D1Database, planId: string): Promise<Response> {
	const plan = await db
		.prepare(`SELECT * FROM media_plans WHERE plan_id = ?`)
		.bind(planId)
		.first<Record<string, unknown>>();
	if (!plan) return jsonResponse({ ok: false, error: `Plan "${planId}" not found` }, 404);
	const articles = await db
		.prepare(
			`SELECT article_id, title, angle, status, site_news_id, scheduled_for, published_at, created_at, updated_at
			 FROM media_articles WHERE plan_id = ? ORDER BY created_at`,
		)
		.bind(planId)
		.all();
	return jsonResponse({ ok: true, plan, articles: articles.results });
}

export async function approveMediaPlan(db: D1Database, planId: string): Promise<Response> {
	const plan = await db
		.prepare(`SELECT status FROM media_plans WHERE plan_id = ?`)
		.bind(planId)
		.first<{ status: string }>();
	if (!plan) return jsonResponse({ ok: false, error: `Plan "${planId}" not found` }, 404);
	if (plan.status !== "DRAFT") {
		return jsonResponse({ ok: false, error: `Only a DRAFT plan can be approved (this one is ${plan.status})` }, 400);
	}
	const now = new Date().toISOString();
	await db
		.prepare(`UPDATE media_plans SET status = 'APPROVED', approved_at = ? WHERE plan_id = ?`)
		.bind(now, planId)
		.run();
	await audit(db, planId, "MEDIA_PLAN_APPROVED", {});
	return jsonResponse({ ok: true, plan_id: planId, status: "APPROVED" });
}

export interface MediaArticleInput {
	title: string;
	angle?: string;
}

export async function addMediaArticle(request: Request, db: D1Database, planId: string): Promise<Response> {
	const plan = await db
		.prepare(`SELECT status FROM media_plans WHERE plan_id = ?`)
		.bind(planId)
		.first<{ status: string }>();
	if (!plan) return jsonResponse({ ok: false, error: `Plan "${planId}" not found` }, 404);
	if (plan.status === "DONE") {
		return jsonResponse({ ok: false, error: "Cannot add articles to a DONE plan" }, 400);
	}
	const input = await readJsonBody<MediaArticleInput>(request);
	const title = (input.title ?? "").trim();
	if (!title) throw new Error("title is required");
	const articleId = `ARTICLE-${crypto.randomUUID()}`;
	await db
		.prepare(
			`INSERT INTO media_articles (article_id, plan_id, title, angle, status)
			 VALUES (?, ?, ?, ?, 'DRAFT')`,
		)
		.bind(articleId, planId, title, (input.angle ?? "").trim())
		.run();
	await audit(db, articleId, "MEDIA_ARTICLE_ADDED", { plan_id: planId, title });
	return jsonResponse({ ok: true, article_id: articleId, status: "DRAFT" }, 201);
}

// Save the article body: DRAFT -> READY. The body is the machine-prepared
// draft (written by the assistant as the machine's editorial desk); the
// owner reviews it before approving.
export async function saveArticleBody(request: Request, db: D1Database, articleId: string): Promise<Response> {
	const body = await readJsonBody<{ body_html?: string }>(request);
	const bodyHtml = (body.body_html ?? "").trim();
	if (!bodyHtml) throw new Error("body_html is required");
	const article = await db
		.prepare(`SELECT status FROM media_articles WHERE article_id = ?`)
		.bind(articleId)
		.first<{ status: string }>();
	if (!article) return jsonResponse({ ok: false, error: `Article "${articleId}" not found` }, 404);
	if (article.status !== "DRAFT" && article.status !== "READY") {
		return jsonResponse({ ok: false, error: `Body can only be saved on a DRAFT or READY article (this one is ${article.status})` }, 400);
	}
	const now = new Date().toISOString();
	await db
		.prepare(`UPDATE media_articles SET body_html = ?, status = 'READY', updated_at = ? WHERE article_id = ?`)
		.bind(bodyHtml, now, articleId)
		.run();
	await audit(db, articleId, "MEDIA_ARTICLE_READY", {});
	return jsonResponse({ ok: true, article_id: articleId, status: "READY" });
}

export async function approveArticle(db: D1Database, articleId: string): Promise<Response> {
	const article = await db
		.prepare(`SELECT status FROM media_articles WHERE article_id = ?`)
		.bind(articleId)
		.first<{ status: string }>();
	if (!article) return jsonResponse({ ok: false, error: `Article "${articleId}" not found` }, 404);
	if (article.status !== "READY") {
		return jsonResponse({ ok: false, error: `Only a READY article can be approved (this one is ${article.status})` }, 400);
	}
	const now = new Date().toISOString();
	await db
		.prepare(`UPDATE media_articles SET status = 'APPROVED', updated_at = ? WHERE article_id = ?`)
		.bind(now, articleId)
		.run();
	await audit(db, articleId, "MEDIA_ARTICLE_APPROVED", {});
	return jsonResponse({ ok: true, article_id: articleId, status: "APPROVED" });
}

function slugify(title: string, articleId: string): string {
	const base =
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "article";
	return `${base}-${articleId.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(-8)}`;
}

// Publish an approved article to site_news, the new site's news feed.
// This is the only write path from the media plan to the public site.
export async function publishArticle(db: D1Database, articleId: string): Promise<Response> {
	const article = await db
		.prepare(`SELECT article_id, plan_id, title, angle, status, body_html FROM media_articles WHERE article_id = ?`)
		.bind(articleId)
		.first<{
			article_id: string;
			plan_id: string;
			title: string;
			angle: string;
			status: string;
			body_html: string;
		}>();
	if (!article) return jsonResponse({ ok: false, error: `Article "${articleId}" not found` }, 404);
	if (article.status !== "APPROVED") {
		return jsonResponse({ ok: false, error: `Only an APPROVED article can be published (this one is ${article.status})` }, 400);
	}
	if (!article.body_html.trim()) {
		return jsonResponse({ ok: false, error: "Article body is empty" }, 400);
	}
	const now = new Date().toISOString();
	const slug = slugify(article.title, article.article_id);
	const bodyHtml = article.angle
		? `<p><em>${escapeHtml(article.angle)}</em></p>\n${article.body_html}`
		: article.body_html;
	const news = await db
		.prepare(
			`INSERT INTO site_news (slug, title, body_html, published_at, kind, created_by)
			 VALUES (?, ?, ?, ?, 'news', 'MEDIA_PLAN')`,
		)
		.bind(slug, article.title, bodyHtml, now)
		.run();
	const siteNewsId = Number(news.meta?.last_row_id ?? 0) || null;
	await db
		.prepare(
			`UPDATE media_articles SET status = 'PUBLISHED', site_news_id = ?, published_at = ?, updated_at = ? WHERE article_id = ?`,
		)
		.bind(siteNewsId, now, now, articleId)
		.run();
	await db
		.prepare(`UPDATE media_plans SET status = 'IN_PROGRESS' WHERE plan_id = ? AND status = 'APPROVED'`)
		.bind(article.plan_id)
		.run();
	await audit(db, articleId, "MEDIA_ARTICLE_PUBLISHED", { slug, site_news_id: siteNewsId });
	return jsonResponse({ ok: true, article_id: articleId, status: "PUBLISHED", slug, site_news_id: siteNewsId }, 200);
}

// External press distribution: a separate owner-confirmed action after
// site publication. The machine records where the article was sent; the
// actual send happens outside the system by the owner.
export async function distributeArticle(request: Request, db: D1Database, articleId: string): Promise<Response> {
	const article = await db
		.prepare(`SELECT status FROM media_articles WHERE article_id = ?`)
		.bind(articleId)
		.first<{ status: string }>();
	if (!article) return jsonResponse({ ok: false, error: `Article "${articleId}" not found` }, 404);
	if (article.status !== "PUBLISHED") {
		return jsonResponse({ ok: false, error: `Only a PUBLISHED article can be distributed (this one is ${article.status})` }, 400);
	}
	const body = await readJsonBody<{ channel?: string; outlet_name?: string; notes?: string }>(request);
	const channel = (body.channel ?? "").trim();
	if (!channel) {
		return jsonResponse({ ok: false, error: "channel is required (e.g. PRESS_RELEASE, EMAIL_PITCH, WIRE)" }, 400);
	}
	const outletName = (body.outlet_name ?? "").trim() || null;
	const notes = (body.notes ?? "").trim() || null;
	const distributionId = `DIST-${crypto.randomUUID()}`;
	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO media_distributions (distribution_id, article_id, channel, outlet_name, sent_at, notes)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.bind(distributionId, articleId, channel.toUpperCase(), outletName, now, notes)
		.run();
	await audit(db, articleId, "MEDIA_ARTICLE_DISTRIBUTED", { distribution_id: distributionId, channel: channel.toUpperCase(), outlet_name: outletName });
	return jsonResponse({ ok: true, distribution_id: distributionId, article_id: articleId, channel: channel.toUpperCase() }, 201);
}

export async function listArticleDistributions(db: D1Database, articleId: string): Promise<Response> {
	const rows = await db
		.prepare(
			`SELECT distribution_id, channel, outlet_name, sent_at, notes, created_at
			 FROM media_distributions WHERE article_id = ? ORDER BY sent_at DESC`,
		)
		.bind(articleId)
		.all<{
			distribution_id: string;
			channel: string;
			outlet_name: string | null;
			sent_at: string;
			notes: string | null;
			created_at: string;
		}>();
	return jsonResponse({ ok: true, article_id: articleId, distributions: rows.results ?? [] });
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

// NOTE: there is deliberately no seeded plan or article topics here.
// Verified-requirements rule: the machine defines the plan and article
// objects and their lifecycle, but never invents editorial targets or
// cadence. Plans and article topics are created by the owner through the
// operating center UI (or arrive as Board uploads routed into the media
// workflow). Nothing is hard-coded.
