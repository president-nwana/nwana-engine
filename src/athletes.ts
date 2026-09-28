// Canonical athlete profiles: one data model for personal athlete pages,
// Elite Athletes page, sponsor-safe exports, Operating Center, news/athlete
// cards, and future results/registry interfaces.
//
// Static credentials (World Championships, national championships, bests) are
// persistent verified records stored in athlete_profiles.credentials_json.
// Dynamic stats are DERIVED from official finalized competition results in
// race_event_results and materialized into computed_stats_json by the Engine
// (the single writer). Readers never compute their own copies.
//
// VICTORY RULE (single definition, used everywhere):
//   win = level_place exactly "1" in a finalized official result record.
//   Excluded: DSQ/DNS/DNF/blank times, non-finalized records,
//   owner-disqualified results (series_result_disqualifications).
//   Source of truth = official finalized competition results.

export interface AthleteCredential {
	type:
		| "world_championship"
		| "national_championship"
		| "competition_best"
		| "club"
		| "focus"
		| "other";
	title: string;
	detail: string;
	source: string;
	source_url: string;
	verified_at: string; // YYYY-MM-DD
}

export interface DistanceStats {
	starts: number;
	finishes: number;
	wins: number;
	podiums: number;
}

export interface AthleteComputedStats {
	starts: number;
	finishes: number;
	wins: number; // lifetime NWANA wins (level_place 1, finalized)
	podiums: number; // level_place 1-3, finalized
	season_wins: Record<string, number>; // {"2026": 24}
	season: Record<string, DistanceStats>;
	by_distance: Record<string, DistanceStats>;
	best_times: Record<string, string>; // {"5K": "30:38"} official finalized only
	last_event_date: string | null;
	finalized_events: number;
	computed_at: string; // ISO
	source: "race_event_results";
}

export interface AthleteProfile {
	slug: string;
	full_name: string;
	results_name: string;
	org_role: string | null;
	athlete_role: string | null;
	country_code: string | null;
	public_property_url: string | null;
	photo_url: string | null;
	credentials: AthleteCredential[];
	stats: AthleteComputedStats | null;
	stats_computed_at: string | null;
	updated_at: string;
}

const NON_FINISH = new Set(["", "DNS", "DNF", "DSQ", "DQ", "NS"]);

function timeToSeconds(t: string): number | null {
	const m = t.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
	if (!m) return null;
	const h = m[1] ? Number(m[1]) : 0;
	const min = Number(m[2]);
	const sec = Number(m[3]);
	if (min >= 60 && !m[1]) return null;
	return h * 3600 + min * 60 + sec;
}

function secondsToTime(s: number): string {
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
	return (h > 0 ? `${h}:` : "") + `${mm}:${String(sec).padStart(2, "0")}`;
}

interface ResultRow {
	event_date: string | null;
	distance: string | null;
	results_json: string;
	finalized: number;
}

interface ResultEntry {
	athlete?: string;
	time?: string;
	level_place?: string | null;
	result_id?: string | number | null;
}

/**
 * Compute dynamic stats for one athlete from official finalized results.
 * Pure function of D1 state: no side effects, no external calls.
 */
export async function computeAthleteStats(
	db: D1Database,
	resultsName: string,
): Promise<AthleteComputedStats> {
	const target = resultsName.trim().toLowerCase();
	const rows = await db
		.prepare(
			`SELECT event_date, distance, results_json, finalized
			 FROM race_event_results WHERE finalized = 1`,
		)
		.all<ResultRow>();

	// Owner-disqualified result_ids are excluded even if they still carry a place.
	const dsq = await db
		.prepare(`SELECT result_id FROM series_result_disqualifications`)
		.all<{ result_id: string }>();
	const dsqIds = new Set((dsq.results ?? []).map((r) => String(r.result_id)));

	const total: DistanceStats = { starts: 0, finishes: 0, wins: 0, podiums: 0 };
	const season: Record<string, DistanceStats> = {};
	const byDistance: Record<string, DistanceStats> = {};
	const seasonWins: Record<string, number> = {};
	const bestSec: Record<string, number> = {};
	let lastEventDate: string | null = null;
	let finalizedEvents = 0;
	const seenEvents = new Set<string>();

	for (const row of rows.results ?? []) {
		let entries: ResultEntry[];
		try {
			entries = JSON.parse(row.results_json || "[]");
		} catch {
			continue;
		}
		const dist = (row.distance || "unknown").trim();
		const seasonKey = (row.event_date || "").slice(0, 4) || "unknown";
		for (const e of entries) {
			if ((e.athlete || "").trim().toLowerCase() !== target) continue;
			if (e.result_id != null && dsqIds.has(String(e.result_id))) continue;
			const time = (e.time || "").trim();
			const isFinish = !NON_FINISH.has(time.toUpperCase()) && timeToSeconds(time) !== null;
			const place = (e.level_place ?? "").toString().trim();
			const isWin = place === "1" && isFinish;
			const isPodium = (place === "1" || place === "2" || place === "3") && isFinish;

			seenEvents.add(`${row.event_date}|${dist}`);
			total.starts += 1;
			const d = (byDistance[dist] ??= { starts: 0, finishes: 0, wins: 0, podiums: 0 });
			const s = (season[seasonKey] ??= { starts: 0, finishes: 0, wins: 0, podiums: 0 });
			d.starts += 1;
			s.starts += 1;
			if (isFinish) {
				total.finishes += 1;
				d.finishes += 1;
				s.finishes += 1;
				const sec = timeToSeconds(time)!;
				if (!(dist in bestSec) || sec < bestSec[dist]) bestSec[dist] = sec;
			}
			if (isWin) {
				total.wins += 1;
				d.wins += 1;
				s.wins += 1;
				seasonWins[seasonKey] = (seasonWins[seasonKey] ?? 0) + 1;
			}
			if (isPodium) {
				total.podiums += 1;
				d.podiums += 1;
				s.podiums += 1;
			}
			if (row.event_date && (!lastEventDate || row.event_date > lastEventDate)) {
				lastEventDate = row.event_date;
			}
		}
	}
	finalizedEvents = seenEvents.size;

	const best_times: Record<string, string> = {};
	for (const [dist, sec] of Object.entries(bestSec)) best_times[dist] = secondsToTime(sec);

	return {
		starts: total.starts,
		finishes: total.finishes,
		wins: total.wins,
		podiums: total.podiums,
		season_wins: seasonWins,
		season,
		by_distance: byDistance,
		best_times,
		last_event_date: lastEventDate,
		finalized_events: finalizedEvents,
		computed_at: new Date().toISOString(),
		source: "race_event_results",
	};
}

/** Read the canonical profile (static credentials + materialized stats). */
export async function getAthleteProfile(
	db: D1Database,
	slug: string,
): Promise<AthleteProfile | null> {
	const row = await db
		.prepare(`SELECT * FROM athlete_profiles WHERE slug = ?`)
		.bind(slug)
		.first<{
			slug: string;
			full_name: string;
			results_name: string;
			org_role: string | null;
			athlete_role: string | null;
			country_code: string | null;
			public_property_url: string | null;
			photo_url: string | null;
			credentials_json: string;
			computed_stats_json: string | null;
			stats_computed_at: string | null;
			updated_at: string;
		}>();
	if (!row) return null;
	let credentials: AthleteCredential[] = [];
	try {
		credentials = JSON.parse(row.credentials_json || "[]");
	} catch {
		credentials = [];
	}
	let stats: AthleteComputedStats | null = null;
	try {
		stats = row.computed_stats_json ? JSON.parse(row.computed_stats_json) : null;
	} catch {
		stats = null;
	}
	return {
		slug: row.slug,
		full_name: row.full_name,
		results_name: row.results_name,
		org_role: row.org_role,
		athlete_role: row.athlete_role,
		country_code: row.country_code,
		public_property_url: row.public_property_url,
		photo_url: row.photo_url,
		credentials,
		stats,
		stats_computed_at: row.stats_computed_at,
		updated_at: row.updated_at,
	};
}

/** List all canonical athlete profiles (slugs + names only). */
export async function listAthleteProfiles(
	db: D1Database,
): Promise<Array<{ slug: string; full_name: string; stats_computed_at: string | null }>> {
	const rows = await db
		.prepare(`SELECT slug, full_name, stats_computed_at FROM athlete_profiles ORDER BY full_name`)
		.all<{ slug: string; full_name: string; stats_computed_at: string | null }>();
	return rows.results ?? [];
}

/**
 * Refresh materialized stats for one athlete (Engine is the single writer).
 * Called automatically after every result apply and by the daily cron.
 */
export async function refreshAthleteStats(
	db: D1Database,
	slug: string,
): Promise<AthleteComputedStats | null> {
	const profile = await getAthleteProfile(db, slug);
	if (!profile) return null;
	const stats = await computeAthleteStats(db, profile.results_name);
	await db
		.prepare(
			`UPDATE athlete_profiles
			 SET computed_stats_json = ?, stats_computed_at = ?, updated_at = ?
			 WHERE slug = ?`,
		)
		.bind(JSON.stringify(stats), stats.computed_at, stats.computed_at, slug)
		.run();
	return stats;
}

/** Refresh materialized stats for every canonical athlete profile. */
export async function refreshAllAthleteStats(
	db: D1Database,
): Promise<Record<string, AthleteComputedStats>> {
	const out: Record<string, AthleteComputedStats> = {};
	for (const p of await listAthleteProfiles(db)) {
		const s = await refreshAthleteStats(db, p.slug);
		if (s) out[p.slug] = s;
	}
	return out;
}
