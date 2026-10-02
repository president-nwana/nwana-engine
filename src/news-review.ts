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
import { getFacebookPageToken } from "./meta-result-publisher";

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
	// 2026-10-02: president-directive catch-up posts (5K results, 1K/10K announcements).
	"news-0919a589": {
		title: "Congratulations: two series records at the NWANA Open 5K — September 27",
		canonicalUrl: "https://www.nwaofna.org/news/congratulations-two-series-records-at-the-nwana-open-5k-sept-news-091",
		newsKind: "race_results",
		description:
			"Albert Fatikhov won Elite in 30:38 (new series record), Susan Otto won Performance in 36:35 (new series record), Michael Blanchard won Competitive in 39:11.",
		newsDate: "September 27, 2026",
	},
	"news-6187c236": {
		title: "Tomorrow: NWANA Open 1K Virtual Nordic Walking Race — October 3",
		canonicalUrl: "https://www.nwaofna.org/news/tomorrow-nwana-open-1k-nordic-walking-series-october-3-news-618",
		newsKind: "race_announcement",
		description:
			"The 1K virtual race is tomorrow, October 3. Registration is still open — walk anywhere.",
		newsDate: "October 3, 2026",
	},
	"news-b8df178f": {
		title: "Sunday: NWANA Open 10K Virtual Nordic Walking Race — October 4",
		canonicalUrl: "https://www.nwaofna.org/news/sunday-nwana-open-10k-nordic-walking-series-october-4-news-b8d",
		newsKind: "race_announcement",
		description:
			"The 10K virtual race is Sunday, October 4. Registration is open — walk anywhere.",
		newsDate: "October 4, 2026",
	},
};

/** Register pack data for a manually composed article so it can be distributed. */
export function registerManualPack(articleId: string, title: string, text: string): void {
	NEWS_PACK_DATA[articleId] = {
		title,
		canonicalUrl: "https://www.nwaofna.org/news",
		newsKind: "manual",
		description: text.slice(0, 500),
	};
}

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

/**
 * Owner publishes a prepared news item to the connected Facebook Pages.
 * Unlike approve/mark-sent, this endpoint performs the actual publish via
 * the Meta Graph API using the Worker's NWANA_META_TOKEN (page tokens are
 * derived per page).
 *
 * With an image URL: photo post via /{page-id}/photos (image + caption).
 * Without: text-only post via /{page-id}/feed.
 *
 * Duplicate-safe: a distribution already marked 'sent' is skipped.
 */
export async function publishNewsToFacebook(
	db: D1Database,
	metaToken: string,
	articleId: string,
	imageUrl?: string,
): Promise<Response> {
	const id = (articleId ?? "").trim();
	if (!id) return jsonResponse({ ok: false, error: "article_id is required" }, 400);

	const articleRow = await db
		.prepare(`SELECT article_id, title FROM media_articles WHERE article_id = ?`)
		.bind(id)
		.first<{ article_id: string; title: string }>();
	if (!articleRow) return jsonResponse({ ok: false, error: `News article not found: ${id}` }, 404);

	const packData = NEWS_PACK_DATA[id];
	if (!packData) return jsonResponse({ ok: false, error: `No verified pack data for article: ${id}` }, 409);
	const pack = buildPack("news_item", packData, "generic");
	if (pack.missingFields.length > 0) {
		return jsonResponse({ ok: false, error: `Pack missing fields: ${pack.missingFields.join(", ")}` }, 409);
	}

	if (!metaToken) return jsonResponse({ ok: false, error: "NWANA_META_TOKEN is not configured" }, 503);

	const targets = [
		{ pageId: "595301193675669", name: "NWANA", channel: "meta-fb-ig" },
		{ pageId: "103190499173992", name: "Nordic Walking Sport", channel: "meta-sport" },
	] as const;

	const results: Record<string, unknown> = {};
	for (const target of targets) {
		const distRow = await db
			.prepare(
				`SELECT distribution_id, status FROM media_distributions
				 WHERE article_id = ? AND channel = ? ORDER BY created_at DESC LIMIT 1`,
			)
			.bind(id, target.channel)
			.first<{ distribution_id: string; status: string }>();
		if (distRow?.status === "sent") {
			results[target.channel] = { skipped_duplicate: true, distribution_id: distRow.distribution_id };
			continue;
		}
		try {
			const pageToken = await getFacebookPageToken(metaToken, target.pageId);
			// Photo post when we have an image; text-only feed post otherwise.
			const endpoint = imageUrl
				? `https://graph.facebook.com/v23.0/${target.pageId}/photos`
				: `https://graph.facebook.com/v23.0/${target.pageId}/feed`;
			const body = imageUrl
				? new URLSearchParams({ url: imageUrl, caption: pack.text, access_token: pageToken })
				: new URLSearchParams({ message: pack.text, access_token: pageToken });
			const resp = await fetch(endpoint, {
				method: "POST",
				body,
			});
			const data = (await resp.json()) as Record<string, unknown>;
			if (!resp.ok || typeof data.id !== "string") {
				throw new Error(`Meta publish failed (${resp.status}): ${JSON.stringify(data).slice(0, 200)}`);
			}
			const postId = data.id as string;
			if (distRow) {
				await db
					.prepare(
						`UPDATE media_distributions
						 SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
						     external_url = ?, notes = COALESCE(notes, '') || ?
						 WHERE distribution_id = ?`,
					)
					.bind(
						`https://www.facebook.com/${postId}`,
						` | Published by Machine via Graph API, post ${postId}`,
						distRow.distribution_id,
					)
					.run();
			}
			await audit(db, distRow?.distribution_id ?? id, "NEWS_DISTRIBUTION_SENT", {
				article_id: id,
				channel: target.channel,
				page: target.name,
				external_id: postId,
				published_by: "machine",
				note: "Machine published the prepared news text to the Facebook Page via Graph API.",
			});
			results[target.channel] = { ok: true, external_id: postId, distribution_id: distRow?.distribution_id ?? null };
		} catch (error) {
			results[target.channel] = {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
				distribution_id: distRow?.distribution_id ?? null,
			};
		}
	}

	return jsonResponse({ ok: true, article_id: id, results });
}

// Instagram publishing (2026-10-02): posts an article's image + caption to
// the NWANA Instagram business accounts via the Meta Graph API. Requires a
// public HTTPS image URL (use /api/public/social-image/<slug>).
export async function publishNewsToInstagram(
	db: D1Database,
	metaToken: string,
	articleId: string,
	imageSlug: string,
): Promise<Response> {
	const id = (articleId ?? "").trim();
	const slug = (imageSlug ?? "").trim();
	if (!id) return jsonResponse({ ok: false, error: "article_id is required" }, 400);
	if (!slug) return jsonResponse({ ok: false, error: "image_slug is required" }, 400);

	const articleRow = await db
		.prepare(`SELECT article_id, title FROM media_articles WHERE article_id = ?`)
		.bind(id)
		.first<{ article_id: string; title: string }>();
	if (!articleRow) return jsonResponse({ ok: false, error: `News article not found: ${id}` }, 404);

	const packData = NEWS_PACK_DATA[id];
	if (!packData) return jsonResponse({ ok: false, error: `No verified pack data for article: ${id}` }, 409);
	const pack = buildPack("news_item", packData, "generic");
	if (pack.missingFields.length > 0) {
		return jsonResponse({ ok: false, error: `Pack missing fields: ${pack.missingFields.join(", ")}` }, 409);
	}

	if (!metaToken) return jsonResponse({ ok: false, error: "NWANA_META_TOKEN is not configured" }, 503);

	const imgRow = await db
		.prepare(`SELECT slug FROM social_images WHERE slug = ? LIMIT 1`)
		.bind(slug)
		.first<{ slug: string }>();
	if (!imgRow) return jsonResponse({ ok: false, error: `Social image not found: ${slug}` }, 404);
	const imageUrl = `https://nwana-engine.nwana-engine.workers.dev/api/public/social-image/${slug}`;

	const targets = [
		{ pageId: "595301193675669", igAccountId: "17841474409019986", name: "nwana.official" },
		{ pageId: "103190499173992", igAccountId: "17841455094791338", name: "n_w_sport" },
	] as const;

	const caption = pack.text.length > 2200 ? pack.text.slice(0, 2197) + "…" : pack.text;
	const results: Record<string, unknown> = {};
	for (const target of targets) {
		try {
			const pageToken = await getFacebookPageToken(metaToken, target.pageId);
			// Step 1: create the media container.
			const createParams = new URLSearchParams({
				image_url: imageUrl,
				caption,
				access_token: pageToken,
			});
			const createResp = await fetch(`https://graph.facebook.com/v23.0/${target.igAccountId}/media`, {
				method: "POST",
				body: createParams,
			});
			const createData = (await createResp.json()) as Record<string, unknown>;
			const creationId = createData.id;
			if (!createResp.ok || typeof creationId !== "string") {
				throw new Error(`IG container failed (${createResp.status}): ${JSON.stringify(createData).slice(0, 200)}`);
			}
			// Step 2: publish the container.
			const pubParams = new URLSearchParams({ creation_id: creationId, access_token: pageToken });
			const pubResp = await fetch(`https://graph.facebook.com/v23.0/${target.igAccountId}/media_publish`, {
				method: "POST",
				body: pubParams,
			});
			const pubData = (await pubResp.json()) as Record<string, unknown>;
			if (!pubResp.ok || typeof pubData.id !== "string") {
				throw new Error(`IG publish failed (${pubResp.status}): ${JSON.stringify(pubData).slice(0, 200)}`);
			}
			await audit(db, id, "NEWS_INSTAGRAM_PUBLISHED", {
				article_id: id,
				account: target.name,
				external_id: pubData.id,
				published_by: "machine",
			});
			results[target.name] = { ok: true, external_id: pubData.id };
		} catch (error) {
			results[target.name] = { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	}
	return jsonResponse({ ok: true, article_id: id, results });
}
