import { describe, expect, it } from "vitest";
import {
	googleAnalyticsAuthorizationUrl,
	GOOGLE_ANALYTICS_REDIRECT_URI,
	buildTrafficReportRequest,
	getGoogleAnalyticsStatus,
	getGa4TrafficOverview,
	GA4_PROPERTY_ID,
} from "../src/google-analytics";

const env = {
	nwana_engine_db: {} as D1Database,
	GOOGLE_ANALYTICS_CLIENT_ID: "client-id",
	GOOGLE_ANALYTICS_CLIENT_SECRET: "test-secret",
	GOOGLE_ANALYTICS_TOKEN_KEY: "test-encryption-key",
};

describe("Google Analytics OAuth", () => {
	it("builds a one-time owner authorization request with the read-only scope", async () => {
		const url = new URL(await googleAnalyticsAuthorizationUrl(env));
		expect(url.origin).toBe("https://accounts.google.com");
		expect(url.searchParams.get("scope")).toBe(
			"https://www.googleapis.com/auth/analytics.readonly",
		);
		expect(url.searchParams.get("access_type")).toBe("offline");
		expect(url.searchParams.get("prompt")).toBe("consent");
		expect(url.searchParams.get("redirect_uri")).toBe(GOOGLE_ANALYTICS_REDIRECT_URI);
		expect(url.searchParams.get("state")).toContain(".");
	});

	it("refuses to start when any required secret is absent", async () => {
		await expect(
			googleAnalyticsAuthorizationUrl({
				nwana_engine_db: {} as D1Database,
				GOOGLE_ANALYTICS_CLIENT_ID: "client-id",
			}),
		).rejects.toThrow("GOOGLE_ANALYTICS_CLIENT_SECRET");
	});

	it("targets the owner-verified NWANA property, never an invented one", () => {
		expect(GA4_PROPERTY_ID).toBe("534556675");
	});
});

describe("GA4 status", () => {
	it("reports unconfigured when secrets are missing", async () => {
		const status = await getGoogleAnalyticsStatus({
			nwana_engine_db: {} as D1Database,
		});
		expect(status.ok).toBe(false);
		expect(status.connected).toBe(false);
		expect(status.configured).toBe(false);
		expect(status.execution_allowed).toBe(false);
		expect(status.missing_configuration).toContain("GOOGLE_ANALYTICS_CLIENT_ID");
	});

	it("reports configured-but-not-connected when no credential is stored", async () => {
		const status = await getGoogleAnalyticsStatus({
			...env,
			nwana_engine_db: {
				prepare: () => ({
					bind: () => ({
						first: async () => null,
					}),
				}),
			} as unknown as D1Database,
		});
		expect(status.ok).toBe(true);
		expect(status.connected).toBe(false);
		expect(status.configured).toBe(true);
		expect(status.property_id).toBe("534556675");
		expect(status.execution_allowed).toBe(false);
	});
});

describe("GA4 traffic report request", () => {
	it("is a single bounded read-only runReport grouped by hostname", () => {
		const request = buildTrafficReportRequest();
		expect(request.limit).toBe(50);
		const dimensions = request.dimensions as Array<{ name: string }>;
		expect(dimensions.map((d) => d.name)).toEqual(["hostName"]);
		const metrics = request.metrics as Array<{ name: string }>;
		expect(metrics.map((m) => m.name)).toEqual(["sessions", "totalUsers"]);
		const ranges = request.dateRanges as Array<{ startDate: string; endDate: string }>;
		expect(ranges).toEqual([{ startDate: "28daysAgo", endDate: "yesterday" }]);
	});
});

describe("GA4 traffic overview", () => {
	it("returns a clear not-connected error instead of invented zeros", async () => {
		const overview = await getGa4TrafficOverview({
			...env,
			nwana_engine_db: {
				prepare: () => ({
					bind: () => ({
						first: async () => null,
					}),
				}),
			} as unknown as D1Database,
		});
		expect(overview.ok).toBe(false);
		expect(overview.hosts).toEqual([]);
		expect(overview.totals).toEqual({ sessions: 0, total_users: 0 });
		expect(overview.error).toContain("Not connected");
	});

	it("reports unconfigured when secrets are missing", async () => {
		const overview = await getGa4TrafficOverview({
			nwana_engine_db: {} as D1Database,
		});
		expect(overview.ok).toBe(false);
		expect(overview.error).toContain("GOOGLE_ANALYTICS_CLIENT_ID");
	});
});
