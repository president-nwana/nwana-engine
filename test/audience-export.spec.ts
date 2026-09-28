// Audience export tests: failure isolation, sponsor-safe scrubbing,
// geography filtering, stale fallback, and D1 participation counts.
// Adapters are mocked; D1 is a stateful in-memory stub covering the
// statements issued by src/canonical-metrics.ts and the participation
// snapshot queries.

import { describe, expect, it } from "vitest";
import {
	buildAudienceExport,
	scrubSponsorText,
	type AudienceAdapters,
	type AudienceExportEnv,
	type AudienceExportOptions,
} from "../src/audience-export";
import {
	recordMetrics,
	type CanonicalMetric,
} from "../src/canonical-metrics";
import type {
	Ga4AudienceReport,
} from "../src/google-analytics";
import type { GoogleAdsMetricsResult } from "../src/google-ads";
import type { MetaSocialOverview } from "../src/meta-reads";
import type { YouTubeChannelMetricsResult } from "../src/youtube";

// ---------------------------------------------------------------------------
// D1 stub
// ---------------------------------------------------------------------------

interface MetricRow {
	metric_name: string;
	source: string;
	source_account: string | null;
	value: number;
	unit: string;
	scope: string;
	geography: string;
	period_start: string;
	period_end: string;
	fetched_at: string;
	source_updated_at: string | null;
	data_quality: string;
	quality_note: string | null;
	source_reference: string | null;
}

interface SyncRow {
	source: string;
	last_success_at: string | null;
	last_attempt_at: string | null;
	last_error: string | null;
	next_refresh_at: string | null;
	stale_after_seconds: number;
}

interface StubSeed {
	eventRows?: Array<Record<string, unknown>>;
	registrationTotal?: number;
	registrationUsers?: number;
	registrationLog?: Record<string, unknown> | null;
}

function makeDb(seed: StubSeed = {}) {
	const metrics: MetricRow[] = [];
	const sync = new Map<string, SyncRow>();
	const norm = (raw: string) => raw.replace(/\s+/g, " ").trim();

	const metricKey = (r: Pick<MetricRow, "metric_name" | "source" | "scope" | "geography" | "period_start" | "period_end">) =>
		[r.metric_name, r.source, r.scope, r.geography, r.period_start, r.period_end].join("|");

	const db = {
		prepare(rawSql: string) {
			const sql = norm(rawSql);
			let args: unknown[] = [];
			const stmt = {
				bind(...params: unknown[]) {
					args = params;
					return stmt;
				},
				async run() {
					if (sql.startsWith("INSERT INTO audience_metrics")) {
						const [
							metric_name, source, source_account, value, unit, scope,
							geography, period_start, period_end, fetched_at,
							source_updated_at, data_quality, quality_note, source_reference,
						] = args as Array<string | number | null>;
						const row: MetricRow = {
							metric_name: String(metric_name),
							source: String(source),
							source_account: (source_account as string) ?? null,
							value: Number(value),
							unit: String(unit),
							scope: String(scope),
							geography: String(geography),
							period_start: String(period_start),
							period_end: String(period_end),
							fetched_at: String(fetched_at),
							source_updated_at: (source_updated_at as string) ?? null,
							data_quality: String(data_quality),
							quality_note: (quality_note as string) ?? null,
							source_reference: (source_reference as string) ?? null,
						};
						const key = metricKey(row);
						const idx = metrics.findIndex((r) => metricKey(r) === key);
						if (idx >= 0) metrics[idx] = row;
						else metrics.push(row);
						return {};
					}
					if (sql.startsWith("INSERT INTO metric_sync_state")) {
						const [source, last_success_at, last_attempt_at, last_error, next_refresh_at] =
							args as Array<string | null>;
						const key = String(source);
						const existing = sync.get(key);
						if (existing) {
							existing.last_attempt_at = (last_attempt_at as string) ?? existing.last_attempt_at;
							existing.last_success_at =
								(last_success_at as string) ?? existing.last_success_at;
							existing.last_error = null;
							existing.next_refresh_at =
								(next_refresh_at as string) ?? existing.next_refresh_at;
						} else {
							sync.set(key, {
								source: key,
								last_success_at: (last_success_at as string) ?? null,
								last_attempt_at: (last_attempt_at as string) ?? null,
								last_error: null,
								next_refresh_at: (next_refresh_at as string) ?? null,
								stale_after_seconds: 86400,
							});
						}
						return {};
					}
					if (sql.startsWith("UPDATE audience_metrics")) {
						const [note, source] = args as [string, string];
						for (const r of metrics) {
							if (
								r.source === source &&
								(r.data_quality === "LIVE_VERIFIED" || r.data_quality === "LIVE_PARTIAL")
							) {
								r.data_quality = "STALE";
								r.quality_note = note;
							}
						}
						// markSourceAttempt's failure path writes last_error separately
						// via its own INSERT; emulate the error recording here too.
						if (sql.includes("metric_sync_state")) {
							const row = sync.get(source);
							if (row) row.last_error = note;
						}
						return {};
					}
					return {};
				},
				async all<T>() {
					if (sql.includes("FROM audience_metrics")) {
						let rows = metrics.slice();
						let i = 0;
						if (sql.includes("source = ?")) {
							const v = String(args[i++]);
							rows = rows.filter((r) => r.source === v);
						}
						if (sql.includes("metric_name = ?")) {
							const v = String(args[i++]);
							rows = rows.filter((r) => r.metric_name === v);
						}
						if (sql.includes("geography = ?")) {
							const v = String(args[i++]);
							rows = rows.filter((r) => r.geography === v);
						}
						if (sql.includes("period_start = ?")) {
							const v = String(args[i++]);
							rows = rows.filter((r) => r.period_start === v);
						}
						if (sql.includes("period_end = ?")) {
							const v = String(args[i++]);
							rows = rows.filter((r) => r.period_end === v);
						}
						return { results: rows as unknown as T[] };
					}
					if (sql.includes("FROM metric_sync_state")) {
						let rows = [...sync.values()];
						if (sql.includes("WHERE source = ?")) {
							rows = rows.filter((r) => r.source === String(args[0]));
						}
						return { results: rows as unknown as T[] };
					}
					if (sql.includes("FROM race_event_results")) {
						return { results: (seed.eventRows ?? []) as unknown as T[] };
					}
					return { results: [] as T[] };
				},
				async first<T>(): Promise<T | null> {
					if (sql.includes("FROM series_registrations") && sql.includes("COUNT(DISTINCT")) {
						return { users: seed.registrationUsers ?? 0 } as unknown as T;
					}
					if (sql.includes("FROM series_registrations") && sql.includes("COUNT(*)")) {
						return { total: seed.registrationTotal ?? 0 } as unknown as T;
					}
					if (sql.includes("FROM series_registration_sync_log")) {
						return (seed.registrationLog ?? null) as unknown as T | null;
					}
					return null;
				},
			};
			return stmt;
		},
		__metrics: metrics,
		__sync: sync,
	};
	return db;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PERIOD = { start: "2026-08-29", end: "2026-09-27" };
const FETCHED_AT = "2026-09-28T19:00:00.000Z";

function cm(
	metric_name: string,
	value: number,
	unit: CanonicalMetric["unit"],
	overrides: Partial<CanonicalMetric> = {},
): CanonicalMetric {
	return {
		metric_name,
		source: "ga4",
		source_account: "534556675",
		value,
		unit,
		period_start: PERIOD.start,
		period_end: PERIOD.end,
		fetched_at: FETCHED_AT,
		data_quality: "LIVE_VERIFIED",
		...overrides,
	};
}

function ga4Report(): Ga4AudienceReport {
	return {
		ok: true,
		source: "ga4",
		source_account: "534556675",
		preset: null,
		period_start: PERIOD.start,
		period_end: PERIOD.end,
		compare: true,
		compare_period_start: "2026-07-30",
		compare_period_end: "2026-08-28",
		fetched_at: FETCHED_AT,
		data_quality: "LIVE_VERIFIED",
		totals: {
			sessions: {
				current: cm("ga4.sessions", 416, "count", { geography: "global" }),
				prior: cm("ga4.sessions", 259, "count", {
					period_start: "2026-07-30",
					period_end: "2026-08-28",
				}),
				percent_change: 60.62,
				percent_change_metric: cm("ga4.sessions.delta_percent", 60.62, "percent", {
					geography: "global",
				}),
			},
			screenPageViews: {
				current: cm("ga4.screenPageViews", 956, "count", { geography: "global" }),
				prior: null,
				percent_change: 101.69,
				percent_change_metric: cm("ga4.screenPageViews.delta_percent", 101.69, "percent", {
					geography: "global",
				}),
			},
		},
		breakdowns: {
			session_source_medium: [],
			landing_page: [],
			country: [
				{
					dimension: "country",
					dimension_value: "United States",
					metrics: {
						activeUsers: cm("ga4.activeUsers", 300, "count", {
							scope: "country=United States",
							geography: "US",
						}),
					},
				},
			],
			us_region: [
				{
					dimension: "region",
					dimension_value: "Florida",
					metrics: {
						activeUsers: cm("ga4.activeUsers", 120, "count", {
							scope: "region=Florida",
							geography: "US",
						}),
					},
				},
			],
		},
	};
}

function adsResult(): GoogleAdsMetricsResult {
	return {
		ok: true,
		customer_id: "1234567890",
		period: { start: PERIOD.start, end: PERIOD.end },
		account_totals: {
			impressions: 1200,
			clicks: 88,
			ctr: 7.33,
			cost_usd: 895.6,
			conversions: 2,
			conversion_rate: 2.27,
		},
		campaigns: [
			{
				id: "c1",
				name: "NWANA Brand",
				status: "ENABLED",
				impressions: 1200,
				clicks: 88,
				ctr: 7.33,
				cost_usd: 895.6,
				conversions: 2,
				conversions_value: 0,
				conversion_rate: 2.27,
			},
		],
		ad_groups: [],
		geo: [],
		conversion_actions: [],
		metrics: [
			{
				metric_name: "ads.clicks",
				source: "google_ads",
				value: 88,
				unit: "count",
				scope: "account",
				period_start: PERIOD.start,
				period_end: PERIOD.end,
				fetched_at: FETCHED_AT,
				data_quality: "LIVE_VERIFIED",
			},
		],
		data_quality: "LIVE_VERIFIED",
	};
}

function metaOverview(): MetaSocialOverview {
	const dest = (
		id: string,
		name: string,
		platform: "facebook" | "instagram",
		metric_name: string,
		value: number,
	) => ({
		id,
		name,
		platform,
		metrics: [
			{
				metric_name,
				source: platform,
				source_account: id,
				value,
				unit: "count" as const,
				period_start: PERIOD.start,
				period_end: PERIOD.end,
				fetched_at: FETCHED_AT,
				data_quality: "LIVE_VERIFIED" as const,
			},
		],
		data_quality: "LIVE_VERIFIED" as const,
	});
	return {
		ok: true,
		period: { start: PERIOD.start, end: PERIOD.end },
		generated_at: FETCHED_AT,
		destinations: [
			dest("ig1", "NWANA Official", "instagram", "instagram.followers", 810),
			dest("fb1", "NWANA", "facebook", "facebook.followers", 1500),
		],
	};
}

function youtubeResult(): YouTubeChannelMetricsResult {
	return {
		ok: true,
		channel_id: "UC2f_TSMW1BWKThUy6XV1onw",
		channel_title: "NORDIC WALKING ASSOCIATION OF NORTH AMERICA NWANA",
		metrics: [
			{
				metric_name: "youtube.subscribers",
				source: "youtube",
				source_account: "UC2f_TSMW1BWKThUy6XV1onw",
				unit: "count",
				value: 20,
				fetched_at: FETCHED_AT,
				data_quality: "LIVE_VERIFIED",
			},
		],
		data_quality: "LIVE_VERIFIED",
	};
}

function adapters(overrides: Partial<AudienceAdapters> = {}): AudienceAdapters {
	return {
		ga4: async () => ga4Report(),
		googleAds: async () => adsResult(),
		meta: async () => metaOverview(),
		youtube: async () => youtubeResult(),
		...overrides,
	};
}

function eventRows() {
	return [
		{
			series: "SERIES_2026",
			distance: "5K",
			race_id: 209477,
			event_id: 1173956,
			event_name: "5K",
			event_date: "2026-09-27",
			result_count: 3,
			results_json: JSON.stringify([
				{ athlete: "ALBERT FATIKHOV", time: "30:38" },
				{ athlete: "Susan Otto", time: "36:35" },
				{ athlete: "Michael Blanchard", time: "39:11" },
			]),
			finalized: 1,
			synced_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
		},
		{
			series: "SERIES_2026",
			distance: "3K",
			race_id: 210000,
			event_id: 1177636,
			event_name: "3K",
			event_date: "2026-09-26",
			result_count: 1,
			results_json: JSON.stringify([{ athlete: "ALBERT FATIKHOV", time: "18:54" }]),
			finalized: 1,
			synced_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
		},
	];
}

function envFor(db: ReturnType<typeof makeDb>): AudienceExportEnv {
	return { nwana_engine_db: db } as unknown as AudienceExportEnv;
}

const OPTS: AudienceExportOptions = {
	startDate: PERIOD.start,
	endDate: PERIOD.end,
	geography: null,
	source: null,
};

function allStringValues(value: unknown, out: string[] = []): string[] {
	if (typeof value === "string") out.push(value);
	else if (Array.isArray(value)) value.forEach((v) => allStringValues(v, out));
	else if (value !== null && typeof value === "object")
		Object.values(value).forEach((v) => allStringValues(v, out));
	return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildAudienceExport", () => {
	it("exports all sections live from the adapters", async () => {
		const db = makeDb({ eventRows: eventRows() });
		const out = await buildAudienceExport(envFor(db), OPTS, adapters(), Date.parse(FETCHED_AT));

		expect(out.sections.website).not.toBeNull();
		expect(out.sections.website!.data_quality).toBe("LIVE_VERIFIED");
		const sessions = out.sections.website!.metrics.find((m) => m.name === "ga4.sessions");
		expect(sessions?.value).toBe(416);
		expect(sessions?.change_percent).toBeCloseTo(60.62, 2);
		expect(sessions?.geography).toBe("global");

		expect(out.sections.advertising!.account?.clicks).toBe(88);
		expect(out.sections.advertising!.account?.cost_usd).toBe(895.6);

		expect(out.sections.social!.destinations).toHaveLength(3);
		const ig = out.sections.social!.destinations.find((d) => d.platform === "instagram");
		expect(ig?.metrics[0].value).toBe(810);
		const yt = out.sections.social!.destinations.find((d) => d.platform === "youtube");
		expect(yt?.metrics[0].value).toBe(20);

		expect(out.sections.participation!.unique_athletes).toBe(3);
		expect(out.sections.participation!.verified_finishes).toBe(4);
		expect(out.sections.participation!.registrations).toBeNull();

		expect(out.data_quality_summary.LIVE_VERIFIED).toBeGreaterThan(0);
		expect(out.reporting_period).toEqual({ start: PERIOD.start, end: PERIOD.end });
	});

	it("isolates failures: one throwing source does not break the others", async () => {
		const db = makeDb({ eventRows: eventRows() });
		// Seed a cached ads value so the fallback has something to show.
		await recordMetrics(db as unknown as D1Database, [
			{
				metric_name: "ads.clicks",
				source: "google_ads",
				value: 80,
				unit: "count",
				scope: "account",
				geography: "global",
				period_start: PERIOD.start,
				period_end: PERIOD.end,
				fetched_at: new Date(Date.now() - 60_000).toISOString(),
				data_quality: "LIVE_VERIFIED",
			},
		]);
		const failing = adapters({
			googleAds: async () => {
				throw new Error("googleads.googleapis.com exploded");
			},
		});
		const out = await buildAudienceExport(envFor(db), OPTS, failing, Date.parse(FETCHED_AT));

		// Advertising fell back to the cached value, marked STALE.
		expect(out.sections.advertising!.data_quality).toBe("STALE");
		expect(out.sections.advertising!.metrics.find((m) => m.name === "ads.clicks")?.value).toBe(80);
		expect(out.sections.advertising!.quality_note).toContain("Live fetch failed");

		// Everything else still rendered live.
		expect(out.sections.website!.data_quality).toBe("LIVE_VERIFIED");
		expect(out.sections.social!.data_quality).toBe("LIVE_VERIFIED");
		expect(out.sections.participation!.data_quality).toBe("LIVE_VERIFIED");
	});

	it("reports OWNER_ACTION_REQUIRED when meta has no configured access path", async () => {
		const db = makeDb({ eventRows: eventRows() });
		const failing = adapters({
			meta: async () => ({
				ok: false,
				period: { start: PERIOD.start, end: PERIOD.end },
				generated_at: FETCHED_AT,
				destinations: [],
				error:
					"NWANA_META_TOKEN is not configured. Store the 60-day Meta user token as the Worker secret NWANA_META_TOKEN, then retry.",
			}),
		});
		const out = await buildAudienceExport(
			envFor(db),
			{ ...OPTS, source: "facebook" },
			failing,
			Date.parse(FETCHED_AT),
		);
		expect(out.sections.social!.data_quality).toBe("OWNER_ACTION_REQUIRED");
		expect(out.data_quality_summary.OWNER_ACTION_REQUIRED).toHaveLength(1);
		expect(out.data_quality_summary.OWNER_ACTION_REQUIRED[0].source).toBe("meta+youtube");
	});

	it("scrubs credential references from every string value", async () => {
		const db = makeDb({ eventRows: eventRows() });
		const failing = adapters({
			meta: async () => ({
				ok: false,
				period: { start: PERIOD.start, end: PERIOD.end },
				generated_at: FETCHED_AT,
				destinations: [],
				error:
					"NWANA_META_TOKEN is not configured. Store the 60-day Meta user token as the Worker secret NWANA_META_TOKEN, then retry.",
			}),
		});
		const out = await buildAudienceExport(
			envFor(db),
			{ ...OPTS, source: "facebook" },
			failing,
			Date.parse(FETCHED_AT),
		);
		const values = allStringValues(JSON.parse(JSON.stringify(out)));
		for (const v of values) {
			expect(v).not.toMatch(/token/i);
			expect(v).not.toMatch(/secret/i);
			expect(v).not.toMatch(/\bkeys?\b/i);
		}
		expect(out.sections.social!.quality_note).toContain("[credential]");
	});

	it("filters GA4 metrics by US geography without mixing unlabeled numbers", async () => {
		const db = makeDb({ eventRows: eventRows() });
		const out = await buildAudienceExport(
			envFor(db),
			{ ...OPTS, geography: "US" },
			adapters(),
			Date.parse(FETCHED_AT),
		);
		const website = out.sections.website!;
		expect(website.metrics.length).toBeGreaterThan(0);
		for (const m of website.metrics) {
			expect(m.geography).toBe("US");
		}
		// Global totals are excluded under the US filter.
		expect(website.metrics.find((m) => m.name === "ga4.sessions")).toBeUndefined();
		// US country row + state row remain, both explicitly labelled.
		const names = website.metrics.map((m) => m.name);
		expect(names).toContain("ga4.activeUsers");
		expect(website.breakdowns.us_by_state).toHaveLength(1);
		expect(website.breakdowns.us_by_state[0].label).toBe("Florida");
		expect(out.geography_filter).toBe("US");
	});

	it("keeps registrations null when the sync never returned data", async () => {
		const db = makeDb({
			eventRows: eventRows(),
			registrationTotal: 0,
			registrationUsers: 0,
			registrationLog: {
				status: "error",
				registrations_fetched: 0,
				error: "Too many subrequests",
				finished_at: FETCHED_AT,
			},
		});
		const out = await buildAudienceExport(
			envFor(db),
			{ ...OPTS, source: "runsignup" },
			adapters(),
			Date.parse(FETCHED_AT),
		);
		const p = out.sections.participation!;
		expect(p.registrations).toBeNull();
		expect(p.registered_participants).toBeNull();
		expect(p.unique_athletes).toBe(3);
		// Results are not mislabelled as registrations.
		expect(p.quality_note).toContain("actual registration source");
		expect(out.sections.website).toBeNull();
	});

	it("source filter limits the export to one section", async () => {
		const db = makeDb({ eventRows: eventRows() });
		const out = await buildAudienceExport(
			envFor(db),
			{ ...OPTS, source: "youtube" },
			adapters(),
			Date.parse(FETCHED_AT),
		);
		expect(out.sections.social).not.toBeNull();
		expect(out.sections.social!.destinations).toHaveLength(1);
		expect(out.sections.social!.destinations[0].platform).toBe("youtube");
		expect(out.sections.website).toBeNull();
		expect(out.sections.advertising).toBeNull();
		expect(out.sections.participation).toBeNull();
	});
});

describe("scrubSponsorText", () => {
	it("replaces identifiers and credential words", () => {
		expect(
			scrubSponsorText(
				"Missing token NWANA_META_TOKEN; check the owner key and the secret value.",
			),
		).toBe(
			"Missing [credential] [credential]; check the owner [credential] and the [credential] value.",
		);
	});
});
