// NWANA Engine — news item distribution review.
//
// Owner-facing review of a prepared news distribution: the article, its
// content variants, the prepared distribution actions, the exact text for
// each channel, and the approve / mark-sent controls.
//
// Read model: everything comes from production D1 (media_articles,
// media_content_variants, media_distributions). Social channel texts are
// regenerated deterministically with the pure pack builder from the
// verified news fields; media channel texts are the stored variant bodies
// referenced by each prepared distribution row. Nothing is invented.
//
// Write model (owner-key gated): approve flips DRAFT variants to APPROVED
// and writes an audit event; mark-sent records a completed manual last
// mile (status 'sent', sent_at = now). Approval does NOT send anything —
// every channel stays manual last mile.

import { buildPack, type PackChannel, type PackObjectData } from "./manual-distribution-packs";

export interface NewsReviewArticle {
	article_id: string;
	title: string;
	status: string;
	published_at: string | null;
	angle: string;
	body_html: string;
}

export interface NewsReviewVariant {
	variant_id: string;
	variant_type: string;
	title: string;
	body: string;
	status: string;
}

export interface NewsReviewDistribution {
	distribution_id: string;
	channel: string;
	outlet_name: string | null;
	status: string;
	sent_at: string | null;
	notes: string | null;
	created_at: string;
	/** Exact text the owner posts on this channel (copy-ready). */
	post_text: string;
	/** Optional title field (YouTube). Null on other channels. */
	post_title: string | null;
	/** Where the post_text came from: generated pack or stored variant. */
	text_source: string;
}

export interface NewsReview {
	article: NewsReviewArticle;
	variants: NewsReviewVariant[];
	distributions: NewsReviewDistribution[];
}

// Verified pack fields for prepared news items. Values were verified when
// the distribution was prepared (production D1 + the pack regression
// tests); the review screen regenerates the deterministic pack text from
// them so the owner sees exactly what was prepared.
const NEWS_PACK_DATA: Record<string, PackObjectData> = {
	"news-sven-thorslund-elite-2026-09-26": {
		title: "Sven Thorslund joins the NWANA Elite Athletes Club",
		canonicalUrl: "https://www.nwaofna.org/news/sven-thorslund-joins-elite-athletes-club",
		newsKind: "elite_athlete_joined",
		personName: "Sven Thorslund",
		personProfileUrl: "https://www.nwaofna.org/elite/sven-thorslund",
		achievement:
			"Silver medal, M55 10K, Nordic Walking World Championships, Lahti 2026 · 7th, 5K · selected for the U.S. 5K Relay Team",
		newsDate: "September 26, 2026",
	},
};

// Prepared distribution channel -> pack channel used for its text.
// meta-fb-ig and meta-sport reuse the generic pack text (same congratulatory
// copy as the pack prepared 2026-09-27).
const SOCIAL_PACK_CHANNEL: Record<string, PackChannel> = {
	threads: "threads",
	linkedin: "linkedin",
	youtube: "youtube",
	"meta-fb-ig": "generic",
	"meta-sport": "generic",
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}

export async function getNewsReview(db: D1Database, articleId: string): Promise<Response> {
	const id = (articleId ?? "").trim();
	if (!id) return jsonResponse({ ok: false, error: "article_id is required" }, 400);

	const articleRow = await db
		.prepare(
			`SELECT article_id, title, status, published_at, angle, body_html
			 FROM media_articles WHERE article_id = ?`,
		)
		.bind(id)
		.first<NewsReviewArticle>();
	if (!articleRow) return jsonResponse({ ok: false, error: `News article not found: ${id}` }, 404);

	const variantsRes = await db
		.prepare(
			`SELECT variant_id, variant_type, title, body, status
			 FROM media_content_variants WHERE article_id = ? ORDER BY variant_type`,
		)
		.bind(id)
		.all<NewsReviewVariant>();
	const variants = variantsRes.results ?? [];
	const variantById = new Map(variants.map((v) => [v.variant_id, v]));

	const distsRes = await db
		.prepare(
			`SELECT distribution_id, channel, outlet_name, status, sent_at, notes, created_at
			 FROM media_distributions WHERE article_id = ? ORDER BY channel`,
		)
		.bind(id)
		.all<{
			distribution_id: string;
			channel: string;
			outlet_name: string | null;
			status: string;
			sent_at: string | null;
			notes: string | null;
			created_at: string;
		}>();

	const packData = NEWS_PACK_DATA[id] ?? null;
	const distributions: NewsReviewDistribution[] = (distsRes.results ?? []).map((d) => {
		const packChannel = SOCIAL_PACK_CHANNEL[d.channel];
		if (packChannel && packData) {
			const pack = buildPack("news_item", packData, packChannel);
			return {
				...d,
				post_text: pack.text,
				post_title: pack.title,
				text_source: `generated ${packChannel} pack (deterministic, verified fields)`,
			};
		}
		// Media channel: the prepared row references its variant in notes
		// ("Variant: var-...").
		const m = /variant:\s*([a-z0-9-]+)/i.exec(d.notes ?? "");
		const variant = m ? variantById.get(m[1]) : undefined;
		if (variant) {
			return {
				...d,
				post_text: variant.body,
				post_title: variant.title,
				text_source: `stored variant ${variant.variant_id} (${variant.variant_type}, ${variant.status})`,
			};
		}
		return {
			...d,
			post_text: "",
			post_title: null,
			text_source: "no prepared text found — variant reference missing",
		};
	});

	return jsonResponse({
		ok: true,
		review: { article: articleRow, variants, distributions } satisfies NewsReview,
	});
}

async function audit(db: D1Database, objectId: string, action: string, details: unknown): Promise<void> {
	await db
		.prepare(
			`INSERT INTO audit_events (audit_id, object_id, action, module, status, details)
			 VALUES (?, ?, ?, 'NEWS_REVIEW', 'SUCCESS', ?)`,
		)
		.bind(`AUDIT-${crypto.randomUUID()}`, objectId, action, JSON.stringify(details ?? {}))
		.run();
}

/**
 * Owner approves the prepared distribution: DRAFT variants become
 * APPROVED, the decision is written to the audit log. Nothing is sent —
 * every channel remains manual last mile.
 */
export async function approveNewsReview(
	db: D1Database,
	articleId: string,
): Promise<Response> {
	const id = (articleId ?? "").trim();
	if (!id) return jsonResponse({ ok: false, error: "article_id is required" }, 400);

	const articleRow = await db
		.prepare(`SELECT article_id, title FROM media_articles WHERE article_id = ?`)
		.bind(id)
		.first<{ article_id: string; title: string }>();
	if (!articleRow) return jsonResponse({ ok: false, error: `News article not found: ${id}` }, 404);

	const upd = await db
		.prepare(
			`UPDATE media_content_variants SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
			 WHERE article_id = ? AND status = 'DRAFT'`,
		)
		.bind(id)
		.run();

	const dists = await db
		.prepare(`SELECT COUNT(*) AS n FROM media_distributions WHERE article_id = ? AND status = 'prepared'`)
		.bind(id)
		.first<{ n: number }>();

	await audit(db, id, "NEWS_DISTRIBUTION_APPROVED", {
		title: articleRow.title,
		variants_approved: upd.meta?.changes ?? 0,
		distributions_prepared: dists?.n ?? 0,
		note: "Owner approved the prepared news distribution. Nothing sent automatically; every channel stays manual last mile.",
	});

	return jsonResponse({
		ok: true,
		article_id: id,
		variants_approved: upd.meta?.changes ?? 0,
		distributions_prepared: dists?.n ?? 0,
	});
}

/**
 * Owner records a completed manual last mile for one distribution action:
 * status -> 'sent', sent_at = now. Called by the owner after posting
 * manually on the channel.
 */
export async function markDistributionSent(
	db: D1Database,
	distributionId: string,
): Promise<Response> {
	const distId = (distributionId ?? "").trim();
	if (!distId) return jsonResponse({ ok: false, error: "distribution_id is required" }, 400);

	const row = await db
		.prepare(
			`SELECT distribution_id, article_id, channel, outlet_name, status
			 FROM media_distributions WHERE distribution_id = ?`,
		)
		.bind(distId)
		.first<{
			distribution_id: string;
			article_id: string;
			channel: string;
			outlet_name: string | null;
			status: string;
		}>();
	if (!row) return jsonResponse({ ok: false, error: `Distribution not found: ${distId}` }, 404);
	if (row.status === "sent")
		return jsonResponse({ ok: true, distribution_id: distId, already_sent: true });

	await db
		.prepare(
			`UPDATE media_distributions SET status = 'sent', sent_at = CURRENT_TIMESTAMP
			 WHERE distribution_id = ?`,
		)
		.bind(distId)
		.run();
	await audit(db, distId, "NEWS_DISTRIBUTION_SENT", {
		article_id: row.article_id,
		channel: row.channel,
		outlet_name: row.outlet_name,
		note: "Owner confirmed the manual last mile for this channel.",
	});

	return jsonResponse({ ok: true, distribution_id: distId, status: "sent" });
}
