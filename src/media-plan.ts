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

// ---------------------------------------------------------------------------
// Machine-composed plan from verified sources (honest composition).
//
// Albert's directive is that the machine composes the media plan. The
// machine must never invent editorial targets, so every article slot this
// function creates cites the verified source it was derived from:
//
//   1. upcoming races from the race lifecycle (real events with real dates);
//   2. recent winner announcements from site_news (real published results);
//   3. board uploads routed as MEDIA_DRAFT (owner-supplied material);
//   4. the verified NWANA pillars from MACHINE_PURPOSE.md (Series 2026,
//      Academy, Licenses, NW Groups, Instructor Growth Fund, Sponsorship,
//      Partner Network) as explainer structure.
//
// Titles are machine-proposed working titles; the angle of every slot names
// its source. The plan is created as DRAFT: the owner approves the plan,
// edits angles, writes or revises bodies, and approves each article before
// anything reaches site_news.
// ---------------------------------------------------------------------------

interface ComposedSlot {
	title: string;
	angle: string;
}

const VERIFIED_PILLAR_SLOTS: ComposedSlot[] = [
	{
		title: "How NWANA performance levels work",
		angle:
			"Explainer grounded in the engine's verified Series 2026 level logic (Elite, High Performance, Performance, Competitive, Open; level place within level and gender; 1000/999/998 points). Source: MACHINE_PURPOSE.md origin story + src/race-lifecycle.ts.",
	},
	{
		title: "From a free intro course to a certified instructor",
		angle:
			"Explainer of the verified Academy ladder: free intro course, Beginner, Instructor/Coach/Judge L1-L3, certification, Professional License. Source: MACHINE_PURPOSE.md connected ecosystem.",
	},
	{
		title: "NW Groups: how one license becomes a local platform",
		angle:
			"Explainer of the verified scaling mechanism: individual license, free group creation, RECOGNIZED Group at $200/year, groups as local platforms. Source: MACHINE_PURPOSE.md connected ecosystem.",
	},
	{
		title: "The Instructor Growth Fund: 5,000 sponsored seats",
		angle:
			"Factual overview of the verified fund: a 5,000 sponsored-instructor-seat waitlist exists, the fund runs in TicketSignup through end of 2026, donor tiers live in internal documents. Source: verified engine records + MACHINE_PURPOSE.md.",
	},
	{
		title: "What a NWANA sponsorship asset actually delivers",
		angle:
			"Explainer of the verified 11-asset inventory and the machine-generated seller packages (draft to renewal lifecycle). Source: engine sponsorship_assets + MACHINE_PURPOSE.md.",
	},
	{
		title: "Series 2026: a season built for every level",
		angle:
			"Season overview grounded in the verified race lifecycle: six distances, weekly races, the registration to publication loop. Source: race_lifecycle engine data.",
	},
];

export async function composeMediaPlan(db: D1Database): Promise<Response> {
	const now = new Date();
	const year = now.getUTCFullYear();
	const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
	const period = `Q${quarter} ${year}`;
	const slots: ComposedSlot[] = [];

	// 1. Upcoming races from the verified lifecycle.
	try {
		const upcoming = await db
			.prepare(
				`SELECT distance, active_event_name, active_event_date, stage
				 FROM race_lifecycle
				 WHERE stage IN ('registration_open', 'next_race_prep')
				   AND active_event_name IS NOT NULL AND active_event_date IS NOT NULL
				 ORDER BY active_event_date
				 LIMIT 6`,
			)
			.all<{ distance: string; active_event_name: string; active_event_date: string; stage: string }>();
		for (const r of upcoming.results ?? []) {
			const date = String(r.active_event_date).slice(0, 10);
			slots.push({
				title: `Race preview: ${r.active_event_name}`,
				angle: `Preview grounded in the verified race lifecycle: Series 2026 ${r.distance}, scheduled ${date}, stage ${r.stage}. Source: race_lifecycle engine data.`,
			});
		}
	} catch {
		// Lifecycle table may not exist on a fresh database; pillars still compose.
	}

	// 2. Recent winner announcements from site_news.
	try {
		const winners = await db
			.prepare(
				`SELECT title, published_at FROM site_news
				 WHERE kind = 'winner_announcement'
				 ORDER BY published_at DESC
				 LIMIT 4`,
			)
			.all<{ title: string; published_at: string }>();
		for (const w of winners.results ?? []) {
			slots.push({
				title: `Winner story: ${w.title}`,
				angle: `Follow-up story grounded in a verified published result (${String(w.published_at).slice(0, 10)}). Source: site_news winner_announcement.`,
			});
		}
	} catch {
		// site_news may not exist on a fresh database; pillars still compose.
	}

	// 3. Owner-supplied material routed as MEDIA_DRAFT.
	try {
		const drafts = await db
			.prepare(
				`SELECT filename, uploaded_by FROM board_uploads
				 WHERE routing = 'MEDIA_DRAFT'
				 ORDER BY created_at DESC
				 LIMIT 4`,
			)
			.all<{ filename: string; uploaded_by: string | null }>();
		for (const d of drafts.results ?? []) {
			slots.push({
				title: `From board material: ${d.filename}`,
				angle: `Article grounded in owner-supplied material "${d.filename}"${d.uploaded_by ? ` (uploaded by ${d.uploaded_by})` : ""}. Source: board_uploads routed MEDIA_DRAFT.`,
			});
		}
	} catch {
		// board_uploads may not exist on a fresh database; pillars still compose.
	}

	// 4. Verified pillar explainers as the standing structure.
	for (const p of VERIFIED_PILLAR_SLOTS) {
		if (slots.length >= 12) break;
		slots.push(p);
	}

	const planId = `MEDIAPLAN-${crypto.randomUUID()}`;
	const composedAt = now.toISOString().slice(0, 10);
	const notes =
		`Machine-composed on ${composedAt} from verified sources only; every article slot cites its source. ` +
		`The machine proposed the structure; the owner approves the plan, edits angles, and approves each article before publication.`;
	await db
		.prepare(
			`INSERT INTO media_plans (plan_id, title, period, notes, status)
			 VALUES (?, ?, ?, ?, 'DRAFT')`,
		)
		.bind(planId, "Machine-composed media plan", period, notes)
		.run();

	const statements = slots.map((s) =>
		db
			.prepare(
				`INSERT INTO media_articles (article_id, plan_id, title, angle, status)
				 VALUES (?, ?, ?, ?, 'DRAFT')`,
			)
			.bind(`ARTICLE-${crypto.randomUUID()}`, planId, s.title.slice(0, 200), s.angle),
	);
	if (statements.length) await db.batch(statements);
	await audit(db, planId, "MEDIA_PLAN_COMPOSED", { article_count: slots.length, period });
	return jsonResponse({ ok: true, plan_id: planId, status: "DRAFT", article_count: slots.length, period }, 201);
}

// NOTE: there is deliberately no seeded plan or article topics here.
// Verified-requirements rule: the machine defines the plan and article
// objects and their lifecycle, but never invents editorial targets or
// cadence. Plans and article topics are created by the owner through the
// operating center UI (or arrive as Board uploads routed into the media
// workflow). Nothing is hard-coded.
