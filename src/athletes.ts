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
//
// ARCHITECTURAL RULE — CANONICAL ATHLETE STATUS vs RACE PERFORMANCE LEVEL
// (Albert, 2026-09-29):
//   NWANA Elite Athlete / Elite Athletes Club member = canonical athlete
//   status. Source of truth = athlete_profiles.athlete_role +
//   athlete_profiles.credentials_json (type="club", e.g. "NWANA Elite Athletes
//   Club member"). This is a verified persistent record, NOT derived from
//   race results.
//
//   Elite / High Performance / Performance / Competitive / Open = performance
//   level of a SPECIFIC RESULT in a SPECIFIC RACE. This is per-race sports
//   data, stored in race_event_results.results_json[].performance_level.
//
//   These two concepts MUST NEVER be mixed:
//   - Sponsor/report/export views MUST take athlete status ONLY from the
//     canonical athlete profile (athlete_role + verified club credential).
//   - NEVER output or "prove" athlete status via percentage/count of
//     Elite-level results.
//   - Performance-level statistics (e.g. "16 victories at Elite performance
//     level") are sports statistics ONLY. They may be displayed separately
//     as athletic achievements, but NEVER as the source of athlete status.
//   - Example: Sven Thorslund is Elite Athletes Club member via verified
//     international credentials, even with zero Elite-level results in the
//     current NWANA Series. His status comes from the profile, not from
//     race data.

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
	// Sports statistics ONLY — NEVER use as athlete status.
	// Canonical athlete status comes from athlete_profiles.athlete_role +
	// verified club credential, not from performance levels.
	// Example: "16 victories at Elite performance level" is an athletic
	// achievement stat, not proof of Elite Athlete status.
	wins_by_performance_level: Record<string, number>; // {"Elite (< 33:00)": 18}
	// Performance profile across ALL finalized finishes, all distances.
	// Sports statistics ONLY — NEVER use as athlete status. Canonical status
	// comes from athlete_profiles.athlete_role + verified club credential.
	// performance_distribution: share of finalized finishes per canonical level.
	// {"Elite": 64, "High Performance": 8, "Performance": 4, "Competitive": 20, "Open": 4}
	performance_distribution: Record<string, number>;
	// dominant_performance_level: the level with an absolute majority (>50%)
	// of finalized finishes. NULL when no level has >50% — the Machine shows
	// the distribution and does NOT invent a single level (unless a separately
	// approved NWANA tie/mixed rule applies).
	dominant_performance_level: string | null;
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

// The five canonical performance level categories. Raw D1 values look like
// "Elite (< 6:00)" — the base name before the parenthesis is the category.
const CANONICAL_PERFORMANCE_LEVELS = [
	"Elite",
	"High Performance",
	"Performance",
	"Competitive",
	"Open",
] as const;

/**
 * Normalize a raw performance_level value ("Elite (< 33:00)") to its canonical
 * category ("Elite"). Returns null for unrecognized values.
 */
export function normalizePerformanceLevel(raw: string | null | undefined): string | null {
	const base = (raw || "").trim().split("(")[0].trim();
	return (CANONICAL_PERFORMANCE_LEVELS as readonly string[]).includes(base) ? base : null;
}

/**
 * Compute the dominant performance level from a distribution.
 * Returns the level only when it holds an absolute majority (>50%).
 * Otherwise returns null — the Machine must show the distribution and NOT
 * invent a single level (unless a separately approved NWANA tie/mixed rule
 * applies). NEVER use the result as athlete status.
 */
export function computeDominantPerformanceLevel(
	distribution: Record<string, number>,
): string | null {
	for (const [level, share] of Object.entries(distribution)) {
		if (share > 50) return level;
	}
	return null;
}

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
	performance_level?: string | null;
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
	// Sports statistics ONLY — wins broken down by performance level.
	// NEVER use as athlete status. Canonical status comes from
	// athlete_profiles.athlete_role + verified club credential.
	const winsByLevel: Record<string, number> = {};
	// Performance distribution across ALL finalized finishes, all distances.
	// Sports statistics ONLY — NEVER use as athlete status.
	const finishesByLevel: Record<string, number> = {};
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
				// Performance distribution: every finalized finish counts,
				// across all distances. Normalized to canonical categories.
				const normLevel = normalizePerformanceLevel(e.performance_level);
				if (normLevel) {
					finishesByLevel[normLevel] = (finishesByLevel[normLevel] ?? 0) + 1;
				}
			}
			if (isWin) {
				total.wins += 1;
				d.wins += 1;
				s.wins += 1;
				seasonWins[seasonKey] = (seasonWins[seasonKey] ?? 0) + 1;
				// Track wins by performance level as sports statistics ONLY.
				// NEVER use to derive athlete status.
				const level = (e.performance_level || "unknown").trim();
				winsByLevel[level] = (winsByLevel[level] ?? 0) + 1;
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

	// Build the performance distribution (percentages) and the dominant level.
	// Denominator: finalized finishes with a recognized performance level.
	const distTotal = Object.values(finishesByLevel).reduce((a, b) => a + b, 0);
	const performance_distribution: Record<string, number> = {};
	if (distTotal > 0) {
		for (const level of CANONICAL_PERFORMANCE_LEVELS) {
			const count = finishesByLevel[level] ?? 0;
			if (count > 0) {
				performance_distribution[level] = Math.round((count / distTotal) * 1000) / 10;
			}
		}
	}
	const dominant_performance_level = computeDominantPerformanceLevel(performance_distribution);

	return {
		starts: total.starts,
		finishes: total.finishes,
		wins: total.wins,
		podiums: total.podiums,
		season_wins: seasonWins,
		season,
		by_distance: byDistance,
		best_times,
		wins_by_performance_level: winsByLevel,
		performance_distribution,
		dominant_performance_level,
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

/**
 * Get the canonical athlete status from the athlete profile.
 *
 * ARCHITECTURAL RULE (Albert, 2026-09-29): canonical athlete status
 * (e.g. "NWANA Elite Athletes Club member") comes ONLY from
 * athlete_profiles.athlete_role + verified credentials (type="club").
 * It is NEVER derived from race performance levels.
 *
 * Use this function in all sponsor/report/export views that need to display
 * athlete status. Do NOT infer status from wins_by_performance_level or any
 * other performance statistics.
 */
export function getCanonicalAthleteStatus(profile: AthleteProfile | null): {
	athlete_role: string | null;
	is_elite_club_member: boolean;
	club_credentials: AthleteCredential[];
} {
	if (!profile) {
		return { athlete_role: null, is_elite_club_member: false, club_credentials: [] };
	}
	const clubCredentials = (profile.credentials ?? []).filter(
		(c) => c.type === "club"
	);
	// Check for Elite Athletes Club membership in verified credentials
	// or in the athlete_role string (both are canonical sources)
	const hasClubCredential = clubCredentials.some(
		(c) => c.title.toLowerCase().includes("elite athletes club")
	);
	const hasRoleMention = (profile.athlete_role ?? "")
		.toLowerCase()
		.includes("elite athletes club");
	return {
		athlete_role: profile.athlete_role,
		is_elite_club_member: hasClubCredential || hasRoleMention,
		club_credentials: clubCredentials,
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
