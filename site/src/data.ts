// Data layer for the NWANA public site. Read-only access to the engine D1.

export const DISTANCES = ["1K", "3K", "5K", "10K", "15K", "20K"] as const;
export type Distance = (typeof DISTANCES)[number];

export const LEVEL_NAMES = [
	"Elite",
	"High Performance",
	"Performance",
	"Competitive",
	"Open",
] as const;

// Per-distance time thresholds, copied from the engine's canonical
// Series 2026 level definitions (src/series-2026-results.ts).
const THRESHOLDS: Record<Distance, [string, string, string, string]> = {
	"1K": ["6:00", "6:30", "7:00", "7:30"],
	"3K": ["20:00", "21:00", "22:00", "23:00"],
	"5K": ["33:00", "35:00", "37:00", "40:00"],
	"10K": ["1:05:00", "1:10:00", "1:15:00", "1:20:00"],
	"15K": ["1:40:00", "1:50:00", "2:00:00", "2:10:00"],
	"20K": ["2:20:00", "2:30:00", "2:40:00", "2:50:00"],
};

export function levelThresholdLabels(distance: Distance): { name: string; label: string }[] {
	const t = THRESHOLDS[distance];
	return [
		{ name: "Elite", label: `under ${t[0]}` },
		{ name: "High Performance", label: `under ${t[1]}` },
		{ name: "Performance", label: `under ${t[2]}` },
		{ name: "Competitive", label: `under ${t[3]}` },
		{ name: "Open", label: `${t[3]} and above` },
	];
}

export interface ResultRow {
	result_id: string | null;
	athlete: string;
	gender: string | null;
	time: string | null;
	performance_level: string | null;
	level_place: string | null;
	series_record: boolean;
}

export interface RaceEvent {
	series: string;
	distance: string;
	event_id: number;
	event_name: string | null;
	event_date: string | null;
	result_count: number;
	finalized: number;
	results_url: string | null;
	publication_status: string;
	results: ResultRow[];
}

export interface NewsItem {
	id: number;
	slug: string;
	title: string;
	body_html: string;
	published_at: string;
	kind: string;
}

export function levelNameOf(row: ResultRow): string {
	const raw = row.performance_level ?? "";
	for (const name of LEVEL_NAMES) {
		if (raw.startsWith(name)) return name;
	}
	return "Open";
}

export function genderLabel(gender: string | null): string {
	switch (gender?.toUpperCase()) {
		case "M": return "Men";
		case "F": return "Women";
		case "X": return "Non-binary";
		default: return "Open division";
	}
}

export function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

function parseResults(json: string | null): ResultRow[] {
	if (!json) return [];
	try {
		const rows = JSON.parse(json) as ResultRow[];
		return Array.isArray(rows) ? rows : [];
	} catch {
		return [];
	}
}

interface RaceEventRow {
	series: string;
	distance: string;
	event_id: number;
	event_name: string | null;
	event_date: string | null;
	result_count: number;
	finalized: number;
	results_url: string | null;
	publication_status: string;
	results_json: string | null;
}

async function fetchEvents(db: D1Database, where: string, order: string, params: unknown[], limit = 200): Promise<RaceEvent[]> {
	const { results } = await db
		.prepare(
			`SELECT series, distance, event_id, event_name, event_date, result_count,
			        finalized, results_url, publication_status, results_json
			 FROM race_event_results
			 WHERE ${where}
			 ORDER BY ${order}
			 LIMIT ?`,
		)
		.bind(...params, limit)
		.all<RaceEventRow>();
	return results.map((row) => ({ ...row, results: parseResults(row.results_json) }));
}

/** Past events with verified results, newest first. */
export function getPastResults(db: D1Database, distance?: string, limit = 60): Promise<RaceEvent[]> {
	if (distance) {
		return fetchEvents(db, "finalized = 1 AND event_date < ? AND distance = ?", "event_date DESC", [todayISO(), distance], limit);
	}
	return fetchEvents(db, "finalized = 1 AND event_date < ?", "event_date DESC", [todayISO()], limit);
}

/** Upcoming events (no results yet), soonest first. Used by the calendar. */
export function getUpcoming(db: D1Database, limit = 60): Promise<RaceEvent[]> {
	return fetchEvents(db, "event_date >= ?", "event_date ASC", [todayISO()], limit);
}

/** Registration page URL derived from the RunSignup results URL. */
export function registrationUrl(event: RaceEvent): string | null {
	if (!event.results_url) return null;
	return event.results_url.replace(/\/Results\/?$/, "");
}

/** Latest finalized events across distances, for the winners page and home spotlight. */
export function getLatestFinalized(db: D1Database, limit = 8): Promise<RaceEvent[]> {
	return getPastResults(db, undefined, limit);
}

export function winnersOf(event: RaceEvent): ResultRow[] {
	return event.results.filter((row) => row.level_place === "1");
}

export async function getNews(db: D1Database, limit = 20): Promise<NewsItem[]> {
	try {
		const { results } = await db
			.prepare(
				`SELECT id, slug, title, body_html, published_at, kind
				 FROM site_news
				 ORDER BY published_at DESC
				 LIMIT ?`,
			)
			.bind(limit)
			.all<NewsItem>();
		return results;
	} catch {
		return [];
	}
}

export async function getNewsItem(db: D1Database, slug: string): Promise<NewsItem | null> {
	try {
		return await db
			.prepare(
				`SELECT id, slug, title, body_html, published_at, kind
				 FROM site_news
				 WHERE slug = ?
				 LIMIT 1`,
			)
			.bind(slug)
			.first<NewsItem>();
	} catch {
		return null;
	}
}

/** Season totals for the home page stats band. */
export async function getSeasonStats(db: D1Database): Promise<{
	finishes: number;
	events: number;
	athletes: number;
}> {
	const { results } = await db
		.prepare(
			`SELECT results_json FROM race_event_results WHERE finalized = 1`,
		)
		.all<{ results_json: string | null }>();
	const athletes = new Set<string>();
	let finishes = 0;
	for (const row of results) {
		for (const result of parseResults(row.results_json)) {
			finishes += 1;
			if (result.athlete) athletes.add(result.athlete.toLowerCase());
		}
	}
	return { finishes, events: results.length, athletes: athletes.size };
}

/** A season standings row: one athlete inside one distance, level, and division. */
export interface StandingRow {
	athlete: string;
	gender: string | null;
	level: string;
	distance: string;
	points: number;
	races: number;
	bestTime: string | null;
	bestTimeSecs: number;
}

function timeToSecs(t: string | null): number {
	if (!t) return Number.MAX_SAFE_INTEGER;
	const parts = t.trim().split(":").map(Number);
	if (parts.length < 2 || parts.some((p) => Number.isNaN(p) || p < 0)) return Number.MAX_SAFE_INTEGER;
	let s = 0;
	for (const p of parts) s = s * 60 + p;
	return s;
}

/**
 * Season standings for one distance, computed the same way the engine scores:
 * points = 1001 - level_place (so 1000 for 1st in level), accumulated within the
 * performance level and gender division. Ties break on the faster approved result.
 */
export async function getStandings(db: D1Database, distance: Distance): Promise<StandingRow[]> {
	const events = await getPastResults(db, distance, 200);
	const map = new Map<string, StandingRow>();
	for (const event of events) {
		for (const r of event.results) {
			const place = Number(r.level_place);
			if (!r.athlete || Number.isNaN(place) || place < 1) continue;
			const key = `${levelNameOf(r)}|${(r.gender ?? "").toUpperCase()}|${r.athlete.toLowerCase()}`;
			const secs = timeToSecs(r.time);
			let row = map.get(key);
			if (!row) {
				row = {
					athlete: r.athlete,
					gender: r.gender,
					level: levelNameOf(r),
					distance,
					points: 0,
					races: 0,
					bestTime: null,
					bestTimeSecs: Number.MAX_SAFE_INTEGER,
				};
				map.set(key, row);
			}
			row.points += 1001 - place;
			row.races += 1;
			if (secs < row.bestTimeSecs) {
				row.bestTimeSecs = secs;
				row.bestTime = r.time;
			}
		}
	}
	const levelOrder = (l: string) => LEVEL_NAMES.indexOf(l as (typeof LEVEL_NAMES)[number]);
	return [...map.values()].sort(
		(a, b) =>
			levelOrder(a.level) - levelOrder(b.level) ||
			(a.gender ?? "").localeCompare(b.gender ?? "") ||
			b.points - a.points ||
			a.bestTimeSecs - b.bestTimeSecs,
	);
}
