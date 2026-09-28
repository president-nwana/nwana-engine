// Canonical metrics layer tests: upsert idempotency, stale detection,
// failed-attempt preservation, per-source thresholds, sync state handling.

import { describe, expect, it } from "vitest";
import {
	getCachedMetrics,
	getMetricsWithFreshness,
	getMetricSyncState,
	markSourceAttempt,
	qualityLabel,
	recordMetrics,
	STALE_THRESHOLDS,
	type CanonicalMetric,
} from "../src/canonical-metrics";

// Stateful D1 stub emulating the audience_metrics / metric_sync_state
// statements issued by src/canonical-metrics.ts.

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

function makeMetricsDb() {
	const metrics: MetricRow[] = [];
	const sync = new Map<string, SyncRow>();
	const norm = (rawSql: string) => rawSql.replace(/\s+/g, " ").trim();
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
				async all<T>() {
					if (sql.startsWith("SELECT metric_name, source, source_account, value, unit, scope,")) {
						// Filters are bound in this order: source, metric_name, geography, period_start, period_end.
						const clauses: Array<[string, string]> = [
							["source = ?", "source"],
							["metric_name = ?", "metric_name"],
							["geography = ?", "geography"],
							["period_start = ?", "period_start"],
							["period_end = ?", "period_end"],
						];
						let ai = 0;
						let rows = [...metrics];
						for (const [clause, col] of clauses) {
							if (sql.includes(clause)) {
								const want = args[ai++] as string;
								rows = rows.filter((r) => (r as unknown as Record<string, string>)[col] === want);
							}
						}
						rows.sort((a, b) =>
							(a.source + a.metric_name + a.period_start).localeCompare(b.source + b.metric_name + b.period_start),
						);
						return { results: rows } as { results: T[] };
					}
					if (sql.startsWith("SELECT source, last_success_at, last_attempt_at,")) {
						const rows =
							args.length > 0 ? [...sync.values()].filter((s) => s.source === args[0]) : [...sync.values()];
						return { results: rows } as { results: T[] };
					}
					throw new Error(`unexpected all(): ${sql}`);
				},
				async first<T>() {
					throw new Error(`unexpected first(): ${sql}`);
				},
				async run() {
					if (sql.startsWith("INSERT INTO audience_metrics")) {
						const row: MetricRow = {
							metric_name: args[0] as string,
							source: args[1] as string,
							source_account: args[2] as string | null,
							value: args[3] as number,
							unit: args[4] as string,
							scope: args[5] as string,
							geography: args[6] as string,
							period_start: args[7] as string,
							period_end: args[8] as string,
							fetched_at: args[9] as string,
							source_updated_at: args[10] as string | null,
							data_quality: args[11] as string,
							quality_note: args[12] as string | null,
							source_reference: args[13] as string | null,
						};
						const key = metricKey(row);
						const existing = metrics.find((r) => metricKey(r) === key);
						if (existing) {
							existing.source_account = row.source_account;
							existing.value = row.value;
							existing.unit = row.unit;
							existing.fetched_at = row.fetched_at;
							existing.source_updated_at = row.source_updated_at;
							existing.data_quality = row.data_quality;
							existing.quality_note = row.quality_note;
							existing.source_reference = row.source_reference;
						} else {
							metrics.push(row);
						}
						return { success: true };
					}
					if (sql.startsWith("INSERT INTO metric_sync_state")) {
						const source = args[0] as string;
						const existing = sync.get(source);
						const isFailureUpsert = sql.includes("VALUES (?, NULL, ?, ?, ?, ?)");
						const isRecordMetricsCall = sql.includes("COALESCE(excluded.last_success_at");
						if (existing) {
							if (isRecordMetricsCall) {
								// recordMetrics upsert: last_success_at coalesced, last_error cleared.
								existing.last_attempt_at = args[2] as string;
								if ((args[1] as string | null) !== null) existing.last_success_at = args[1] as string;
								existing.last_error = null;
								existing.next_refresh_at = args[3] as string;
							} else if (isFailureUpsert) {
								// markSourceAttempt failure upsert: args = [source, now, error, nextRefresh, threshold].
								existing.last_attempt_at = args[1] as string;
								existing.last_error = args[2] as string;
								existing.next_refresh_at = args[3] as string;
							} else {
								// markSourceAttempt success upsert: args = [source, now, now, nextRefresh, threshold].
								existing.last_success_at = args[1] as string;
								existing.last_attempt_at = args[2] as string;
								existing.last_error = null;
								existing.next_refresh_at = args[3] as string;
							}
						} else if (isFailureUpsert) {
							sync.set(source, {
								source,
								last_success_at: null,
								last_attempt_at: args[1] as string,
								last_error: args[2] as string,
								next_refresh_at: args[3] as string,
								stale_after_seconds: args[4] as number,
							});
						} else {
							sync.set(source, {
								source,
								last_success_at: args[1] as string | null,
								last_attempt_at: args[2] as string,
								last_error: null,
								next_refresh_at: args[3] as string,
								stale_after_seconds: args[4] as number,
							});
						}
						return { success: true };
					}
					if (sql.startsWith("UPDATE audience_metrics")) {
						const note = args[0] as string;
						const source = args[1] as string;
						for (const r of metrics) {
							if (r.source === source && (r.data_quality === "LIVE_VERIFIED" || r.data_quality === "LIVE_PARTIAL")) {
								r.data_quality = "STALE";
								r.quality_note = note;
							}
						}
						return { success: true };
					}
					throw new Error(`unexpected run(): ${sql}`);
				},
			};
			return stmt;
		},
	};
	return { db: db as unknown as D1Database, metrics, sync };
}

function metric(overrides: Partial<CanonicalMetric> = {}): CanonicalMetric {
	return {
		metric_name: "ga4.sessions",
		source: "ga4",
		value: 416,
		unit: "count",
		period_start: "2026-09-21",
		period_end: "2026-09-27",
		fetched_at: new Date().toISOString(),
		data_quality: "LIVE_VERIFIED",
		...overrides,
	};
}

describe("recordMetrics", () => {
	it("is idempotent: same unique key updates the row instead of duplicating", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [metric({ value: 416 })]);
		await recordMetrics(db, [metric({ value: 500 })]);
		const rows = await getCachedMetrics(db);
		expect(rows).toHaveLength(1);
		expect(rows[0].value).toBe(500);
	});

	it("keeps distinct periods and geographies as separate rows", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [
			metric({ period_start: "2026-09-21", period_end: "2026-09-27" }),
			metric({ period_start: "2026-09-14", period_end: "2026-09-20" }),
			metric({ metric_name: "ga4.users", geography: "US", value: 300 }),
		]);
		expect(await getCachedMetrics(db)).toHaveLength(3);
	});

	it("treats undefined and empty scope/geography as the same key", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [metric()]);
		await recordMetrics(db, [metric({ geography: undefined, value: 600 })]);
		const rows = await getCachedMetrics(db);
		expect(rows).toHaveLength(1);
		expect(rows[0].value).toBe(600);
		expect(rows[0].geography).toBeUndefined();
	});

	it("marks last_success_at when live metrics are recorded", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [metric()]);
		const [state] = await getMetricSyncState(db, "ga4");
		expect(state.last_success_at).not.toBeNull();
		expect(state.last_attempt_at).not.toBeNull();
		expect(state.last_error).toBeNull();
	});

	it("records the attempt but not success when no live metric is present", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [metric({ data_quality: "OWNER_ACTION_REQUIRED", quality_note: "needs consent" })]);
		const [state] = await getMetricSyncState(db, "ga4");
		expect(state.last_success_at).toBeNull();
		expect(state.last_attempt_at).not.toBeNull();
	});

	it("filters by source, geography, and period", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [
			metric({ source: "ga4" }),
			metric({ source: "instagram", metric_name: "instagram.followers", value: 810 }),
			metric({ source: "ga4", geography: "US", metric_name: "ga4.users", value: 200 }),
		]);
		expect(await getCachedMetrics(db, { source: "ga4" })).toHaveLength(2);
		expect(await getCachedMetrics(db, { source: "ga4", geography: "US" })).toHaveLength(1);
		expect(await getCachedMetrics(db, { period_end: "2026-09-27", source: "instagram" })).toHaveLength(1);
	});
});

describe("getMetricsWithFreshness", () => {
	const nowMs = Date.parse("2026-09-28T19:00:00.000Z");

	it("flags metrics older than the per-source threshold as stale", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [
			metric({ fetched_at: new Date(nowMs - 7 * 3600 * 1000).toISOString() }),
		]);
		const { metrics } = await getMetricsWithFreshness(db, {}, nowMs);
		expect(metrics).toHaveLength(1);
		expect(metrics[0].is_stale).toBe(true); // ga4 threshold is 6h
		expect(metrics[0].stale_after_seconds).toBe(STALE_THRESHOLDS.ga4);
	});

	it("keeps recent metrics fresh", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [metric({ fetched_at: new Date(nowMs - 60 * 1000).toISOString() })]);
		const { metrics } = await getMetricsWithFreshness(db, {}, nowMs);
		expect(metrics[0].is_stale).toBe(false);
	});

	it("applies per-source thresholds: same age is stale for runsignup but fresh for linkedin", async () => {
		const { db } = makeMetricsDb();
		const fetched = new Date(nowMs - 2 * 3600 * 1000).toISOString(); // 2h old
		await recordMetrics(db, [
			metric({ source: "runsignup", metric_name: "runsignup.verified_finishes", value: 54, fetched_at: fetched }),
			metric({ source: "linkedin", metric_name: "linkedin.followers", value: 8, fetched_at: fetched }),
		]);
		const { metrics } = await getMetricsWithFreshness(db, {}, nowMs);
		const rs = metrics.find((m) => m.source === "runsignup")!;
		const li = metrics.find((m) => m.source === "linkedin")!;
		expect(rs.is_stale).toBe(true); // 1h threshold
		expect(li.is_stale).toBe(false); // 7d threshold
	});

	it("attaches the sync state per source", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [metric()]);
		const { metrics, sync_state } = await getMetricsWithFreshness(db, {}, nowMs);
		expect(sync_state).toHaveLength(1);
		expect(metrics[0].sync).not.toBeNull();
		expect(metrics[0].sync!.source).toBe("ga4");
	});
});

describe("markSourceAttempt", () => {
	it("failed attempt keeps last known good values and marks them STALE", async () => {
		const { db } = makeMetricsDb();
		await recordMetrics(db, [metric({ value: 416 })]);
		await markSourceAttempt(db, "ga4", false, "timeout");

		const rows = await getCachedMetrics(db);
		expect(rows).toHaveLength(1); // not deleted
		expect(rows[0].value).toBe(416); // value preserved
		expect(rows[0].data_quality).toBe("STALE");
		expect(rows[0].quality_note).toContain("timeout");

		const [state] = await getMetricSyncState(db, "ga4");
		expect(state.last_error).toBe("timeout");
		expect(state.last_attempt_at).not.toBeNull();
		expect(state.last_success_at).not.toBeNull(); // earlier success retained
	});

	it("failed attempt on a source with no metrics still records the error", async () => {
		const { db } = makeMetricsDb();
		await markSourceAttempt(db, "facebook", false, "403 forbidden");
		const [state] = await getMetricSyncState(db, "facebook");
		expect(state.last_error).toBe("403 forbidden");
		expect(state.last_success_at).toBeNull();
		expect(await getCachedMetrics(db)).toHaveLength(0);
	});

	it("successful attempt clears last_error", async () => {
		const { db } = makeMetricsDb();
		await markSourceAttempt(db, "ga4", false, "timeout");
		await markSourceAttempt(db, "ga4", true);
		const [state] = await getMetricSyncState(db, "ga4");
		expect(state.last_error).toBeNull();
		expect(state.last_success_at).not.toBeNull();
	});
});

describe("qualityLabel", () => {
	it("explains every quality state in human terms", () => {
		const qualities = [
			"LIVE_VERIFIED",
			"LIVE_PARTIAL",
			"STALE",
			"UNAVAILABLE",
			"SOURCE_AUTH_ERROR",
			"SOURCE_API_ERROR",
			"OWNER_ACTION_REQUIRED",
			"NO_SUPPORTED_ACCESS_PATH",
		] as const;
		for (const q of qualities) {
			const label = qualityLabel(q);
			expect(label.length).toBeGreaterThan(10);
		}
		expect(qualityLabel("STALE")).toContain("Stale");
		expect(qualityLabel("OWNER_ACTION_REQUIRED")).toContain("Owner action");
	});
});
