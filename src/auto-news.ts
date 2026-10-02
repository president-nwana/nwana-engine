// NWANA Engine — automatic news draft generation.
//
// The Machine watches verified sources (race results, race calendar) and
// drafts news articles automatically. Drafts wait for owner review unless
// auto-publish is enabled for that news type.
//
// News types:
//   race_results        — finalized race results → congratulations article
//   race_announcement_7d — race in 7 days, registration open → announcement
//   race_announcement_1d — race tomorrow → final call announcement
//
// Auto-publish toggles live in the `auto_news_settings` table (one row per
// type). Default: review required (auto_publish = 0).

export interface AutoNewsSettings {
	news_type: string;
	auto_publish: number;
	updated_at: string;
}

export const AUTO_NEWS_TYPES = [
	"race_results",
	"race_announcement_7d",
	"race_announcement_1d",
] as const;

export type AutoNewsType = (typeof AUTO_NEWS_TYPES)[number];

export function autoNewsTypeLabel(type: string): string {
	switch (type) {
		case "race_results":
			return "Race results → congratulations";
		case "race_announcement_7d":
			return "Race in 7 days → announcement";
		case "race_announcement_1d":
			return "Race tomorrow → final call";
		default:
			return type;
	}
}

interface RaceResultRow {
	race_id: number;
	event_id: number;
	event_name: string;
	event_date: string;
	distance: string;
	result_count: number;
	results_json: string;
	results_url: string | null;
	registration_url: string | null;
}

interface RaceEventInfo {
	distance: string;
	race_id: number;
	event_id: number;
	event_name: string;
	event_date: string;
	registration_url: string | null;
}

function esc(s: string): string {
	return s
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function articleId(): string {
	const hex = "0123456789abcdef";
	let s = "";
	for (let i = 0; i < 8; i++) s += hex[Math.floor(Math.random() * 16)];
	return `auto-news-${s}`;
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

function addDaysIso(baseIso: string, days: number): string {
	const d = new Date(baseIso + "T12:00:00Z");
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Results that are finalized but have no news article yet. Only recent
 *  results (last 14 days) — no congratulations for two-month-old races. */
async function findUncoveredResults(db: D1Database): Promise<RaceResultRow[]> {
	const cutoff = addDaysIso(todayIso(), -14);
	const rows = await db
		.prepare(
			`SELECT r.race_id, r.event_id, r.event_name, r.event_date, r.distance,
			        r.result_count, r.results_json, r.results_url, r.registration_url
			 FROM race_event_results r
			 WHERE r.finalized = 1
			   AND r.event_date >= ?
			   AND NOT EXISTS (
			         SELECT 1 FROM media_articles a
			         WHERE a.auto_news_type = 'race_results'
			           AND a.auto_news_ref = r.race_id || ':' || r.event_id
			       )
			 ORDER BY r.event_date DESC
			 LIMIT 10`,
		)
		.bind(cutoff)
		.all<RaceResultRow>();
	return rows.results ?? [];
}

/** Upcoming registration-open events without an announcement article. */
async function findUpcomingRaces(db: D1Database): Promise<Array<{ type: AutoNewsType; event: RaceEventInfo }>> {
	const today = todayIso();
	const in7 = addDaysIso(today, 7);
	const tomorrow = addDaysIso(today, 1);
	const rows = await db
		.prepare(`SELECT distance, race_id, events_json FROM race_lifecycle`)
		.all<{ distance: string; race_id: number; events_json: string | null }>();
	const out: Array<{ type: AutoNewsType; event: RaceEventInfo }> = [];
	for (const row of rows.results ?? []) {
		let events: Array<{ event_id: number; event_name: string; event_date: string; stage: string }> = [];
		try {
			events = row.events_json ? JSON.parse(row.events_json) : [];
		} catch {
			continue;
		}
		for (const ev of events) {
			if (ev.stage !== "registration_open") continue;
			if (!ev.event_date) continue;
			let type: AutoNewsType | null = null;
			if (ev.event_date === tomorrow) type = "race_announcement_1d";
			else if (ev.event_date > today && ev.event_date <= in7) type = "race_announcement_7d";
			if (!type) continue;
			// Skip if an announcement of this type already exists for this event.
			const ref = `${row.race_id}:${ev.event_id}`;
			const existing = await db
				.prepare(
					`SELECT 1 FROM media_articles WHERE auto_news_type = ? AND auto_news_ref = ? LIMIT 1`,
				)
				.bind(type, ref)
				.first();
			if (existing) continue;
			out.push({
				type,
				event: {
					distance: row.distance,
					race_id: row.race_id,
					event_id: ev.event_id,
					event_name: ev.event_name,
					event_date: ev.event_date,
					registration_url: null,
				},
			});
		}
	}
	// Fill registration URLs from race_event_results.
	for (const item of out) {
		const reg = await db
			.prepare(`SELECT registration_url FROM race_event_results WHERE race_id = ? LIMIT 1`)
			.bind(item.event.race_id)
			.first<{ registration_url: string | null }>();
		item.event.registration_url = reg?.registration_url ?? null;
	}
	return out;
}

interface DraftResult {
	news_type: AutoNewsType;
	title: string;
	article_id: string;
	auto_published: boolean;
}

function buildResultsArticle(r: RaceResultRow): { title: string; angle: string; body: string } {
	let results: Array<{ athlete?: string; time?: string; performance_level?: string; series_record?: boolean }> = [];
	try {
		results = JSON.parse(r.results_json ?? "[]");
	} catch {
		results = [];
	}
	const lines = results
		.filter((x) => x.athlete)
		.map(
			(x) =>
				`<p><strong>${esc(x.athlete ?? "")}</strong> — ${esc(x.time ?? "")}${x.performance_level ? ` (${esc(x.performance_level)})` : ""}${x.series_record ? " — <strong>new series record</strong>" : ""}.</p>`,
		)
		.join("\n");
	const records = results.filter((x) => x.series_record).length;
	const title = `Congratulations: ${r.distance} results are in — ${r.event_date}`;
	const angle =
		records > 0
			? `${results.length} finishers and ${records} new series record${records === 1 ? "" : "s"} at the ${r.event_date} ${r.distance} round.`
			: `${results.length} finishers at the ${r.event_date} ${r.distance} round.`;
	const body =
		`<p><em>${esc(angle)}</em></p>\n` +
		`<p>The ${esc(r.event_date)} round of the ${esc(r.event_name)} delivered strong performances.</p>\n` +
		lines +
		(r.results_url ? `<p>Full results: <a href="${esc(r.results_url)}">RunSignup results</a>.</p>\n` : "") +
		(r.registration_url ? `<p><a href="${esc(r.registration_url)}">Register for the next ${esc(r.distance)} round</a>.</p>\n` : "");
	return { title, angle, body };
}

function buildAnnouncementArticle(
	type: AutoNewsType,
	ev: RaceEventInfo,
): { title: string; angle: string; body: string } {
	const when = type === "race_announcement_1d" ? "Tomorrow" : "Coming up";
	const dateLabel = ev.event_date;
	const title =
		type === "race_announcement_1d"
			? `Tomorrow: NWANA Open ${ev.distance} Virtual Nordic Walking Race — ${dateLabel}`
			: `NWANA Open ${ev.distance} Virtual Nordic Walking Race — ${dateLabel}`;
	const angle =
		type === "race_announcement_1d"
			? `The ${ev.distance} virtual race is tomorrow. Registration is still open — walk anywhere.`
			: `The ${ev.distance} virtual race is ${dateLabel}. Registration is open — walk anywhere.`;
	const body =
		`<p><em>${esc(angle)}</em></p>\n` +
		`<p>The 2026 NWANA Open ${esc(ev.distance)} Virtual Nordic Walking Race continues <strong>${type === "race_announcement_1d" ? "tomorrow, " : ""}${esc(dateLabel)}</strong>.</p>\n` +
		`<p>All NWANA series races are virtual — walk your distance anywhere and submit your result.</p>\n` +
		(ev.registration_url ? `<p><a href="${esc(ev.registration_url)}">Register for the ${esc(dateLabel)} ${esc(ev.distance)}</a></p>\n` : "");
	return { title: `${when === "Tomorrow" ? "Tomorrow" : "Save the date"}: ${title}`, angle, body };
}

async function isAutoPublish(db: D1Database, type: string): Promise<boolean> {
	const row = await db
		.prepare(`SELECT auto_publish FROM auto_news_settings WHERE news_type = ? LIMIT 1`)
		.bind(type)
		.first<{ auto_publish: number }>();
	return (row?.auto_publish ?? 0) === 1;
}

function slugify(title: string, aid: string): string {
	const base = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
	return `${base}-${aid.slice(-8)}`;
}

/**
 * Scan verified sources and draft news articles. Returns what was created.
 * If auto-publish is enabled for a type, the article is published to
 * site_news immediately; otherwise it stays DRAFT for owner review.
 */
export async function generateAutoNews(db: D1Database): Promise<{ drafts: DraftResult[] }> {
	const drafts: DraftResult[] = [];
	const now = new Date().toISOString();

	// 1. Race results → congratulations.
	for (const r of await findUncoveredResults(db)) {
		const { title, angle, body } = buildResultsArticle(r);
		const aid = articleId();
		const ref = `${r.race_id}:${r.event_id}`;
		await db
			.prepare(
				`INSERT INTO media_articles
				 (article_id, plan_id, title, angle, status, body_html, auto_news_type, auto_news_ref, created_at, updated_at)
				 VALUES (?, 'AUTO-NEWS', ?, ?, 'DRAFT', ?, 'race_results', ?, ?, ?)`,
			)
			.bind(aid, title, angle, body, ref, now, now)
			.run();
		let autoPublished = false;
		if (await isAutoPublish(db, "race_results")) {
			autoPublished = await publishDraftToSite(db, aid, title, body, now);
		}
		drafts.push({ news_type: "race_results", title, article_id: aid, auto_published: autoPublished });
	}

	// 2. Upcoming races → announcements.
	for (const { type, event } of await findUpcomingRaces(db)) {
		const { title, angle, body } = buildAnnouncementArticle(type, event);
		const aid = articleId();
		const ref = `${event.race_id}:${event.event_id}`;
		await db
			.prepare(
				`INSERT INTO media_articles
				 (article_id, plan_id, title, angle, status, body_html, auto_news_type, auto_news_ref, created_at, updated_at)
				 VALUES (?, 'AUTO-NEWS', ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
			)
			.bind(aid, title, angle, body, type, ref, now, now)
			.run();
		let autoPublished = false;
		if (await isAutoPublish(db, type)) {
			autoPublished = await publishDraftToSite(db, aid, title, body, now);
		}
		drafts.push({ news_type: type, title, article_id: aid, auto_published: autoPublished });
	}

	return { drafts };
}

async function publishDraftToSite(
	db: D1Database,
	articleId: string,
	title: string,
	body: string,
	now: string,
): Promise<boolean> {
	try {
		const slug = slugify(title, articleId);
		const ins = await db
			.prepare(
				`INSERT INTO site_news (slug, title, body_html, published_at, kind, created_by)
				 VALUES (?, ?, ?, ?, 'news', 'AUTO_NEWS')`,
			)
			.bind(slug, title, body, now)
			.run();
		const siteNewsId = Number(ins.meta?.last_row_id ?? 0) || null;
		await db
			.prepare(
				`UPDATE media_articles SET status = 'PUBLISHED', site_news_id = ?, published_at = ?, updated_at = ? WHERE article_id = ?`,
			)
			.bind(siteNewsId, now, now, articleId)
			.run();
		return true;
	} catch {
		return false;
	}
}

/** Owner review queue: auto-generated drafts waiting for a decision. */
export async function listAutoNewsQueue(db: D1Database): Promise<
	Array<{ article_id: string; news_type: string; title: string; angle: string; created_at: string }>
> {
	const rows = await db
		.prepare(
			`SELECT article_id, auto_news_type AS news_type, title, angle, created_at
			 FROM media_articles
			 WHERE plan_id = 'AUTO-NEWS' AND status = 'DRAFT'
			 ORDER BY created_at DESC
			 LIMIT 50`,
		)
		.all<{ article_id: string; news_type: string; title: string; angle: string; created_at: string }>();
	return rows.results ?? [];
}
