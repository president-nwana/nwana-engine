import { afterEach, describe, expect, it, vi } from "vitest";
import {
	resolveDatePreset,
	priorComparablePeriod,
	runGa4Report,
	getGa4AudienceReport,
	GA4_PROPERTY_ID,
	GA4_DATE_PRESETS,
} from "../src/google-analytics";

const TOKEN_KEY = "test-ga4-encryption-key";

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

// Mirrors the module's AES-GCM encryption so the fake D1 credential can be
// decrypted by the code under test.
async function encryptToken(token: string, secret: string) {
	const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
	const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(token),
	);
	return {
		encrypted: base64Url(new Uint8Array(encrypted)),
		iv: base64Url(iv),
	};
}

function makeEnv(credential: { encrypted: string; iv: string } | null) {
	return {
		nwana_engine_db: {
			prepare: () => ({
				bind: () => ({
					first: async () => credential
						? {
							encrypted_refresh_token: credential.encrypted,
							iv: credential.iv,
						}
						: null,
				}),
			}),
		} as unknown as D1Database,
		GOOGLE_ANALYTICS_CLIENT_ID: "client-id",
		GOOGLE_ANALYTICS_CLIENT_SECRET: "client-secret",
		GOOGLE_ANALYTICS_TOKEN_KEY: TOKEN_KEY,
	};
}

function jsonResponse(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json" },
	});
}

interface FetchCall {
	url: string;
	body: Record<string, unknown>;
}

function stubFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
	const calls: FetchCall[] = [];
	vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		let body: Record<string, unknown> = {};
		if (typeof init?.body === "string") {
			try {
				body = JSON.parse(init.body) as Record<string, unknown>;
			} catch {
				body = {};
			}
		}
		const call = { url, body };
		calls.push(call);
		return handler(call);
	});
	return calls;
}

async function envWithCredential() {
	return makeEnv(await encryptToken("refresh-token-value", TOKEN_KEY));
}

function totalsRow(values: string[]) {
	return { dimensionValues: [], metricValues: values.map((value) => ({ value })) };
}

const CURRENT_VALUES = ["500", "450", "120", "416", "300", "956", "0.65", "95.5", "12"];
const PRIOR_VALUES = ["450", "400", "100", "259", "200", "474", "0.60", "88.0", "8"];

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("resolveDatePreset", () => {
	const today = "2026-09-28";

	it("resolves last7 as the 7 most recent complete days", () => {
		expect(resolveDatePreset("last7", today)).toEqual({
			startDate: "2026-09-21",
			endDate: "2026-09-27",
		});
	});

	it("resolves prior7 as the 7 days before last7", () => {
		expect(resolveDatePreset("prior7", today)).toEqual({
			startDate: "2026-09-14",
			endDate: "2026-09-20",
		});
	});

	it("resolves last30 and prior30 without overlap", () => {
		expect(resolveDatePreset("last30", today)).toEqual({
			startDate: "2026-08-29",
			endDate: "2026-09-27",
		});
		expect(resolveDatePreset("prior30", today)).toEqual({
			startDate: "2026-07-30",
			endDate: "2026-08-28",
		});
	});

	it("resolves mtd from the first of the month to yesterday", () => {
		expect(resolveDatePreset("mtd", today)).toEqual({
			startDate: "2026-09-01",
			endDate: "2026-09-27",
		});
	});

	it("lists all supported presets", () => {
		expect(GA4_DATE_PRESETS).toEqual(["last7", "prior7", "last30", "prior30", "mtd"]);
	});
});

describe("priorComparablePeriod", () => {
	it("returns the same-length period immediately before the range", () => {
		expect(priorComparablePeriod("2026-09-21", "2026-09-27")).toEqual({
			startDate: "2026-09-14",
			endDate: "2026-09-20",
		});
	});
});

describe("runGa4Report", () => {
	it("posts a parameterized runReport with metrics, dimensions and dates", async () => {
		const env = await envWithCredential();
		const calls = stubFetch((call) => {
			if (call.url.includes("oauth2.googleapis.com/token")) {
				return jsonResponse({ access_token: "access-1" });
			}
			return jsonResponse({ rows: [totalsRow(CURRENT_VALUES)], rowCount: 1 });
		});

		const result = await runGa4Report(env, {
			metrics: ["sessions", "activeUsers"],
			dimensions: ["sessionSourceMedium"],
			startDate: "2026-09-21",
			endDate: "2026-09-27",
			limit: 25,
		});

		expect(result.ok).toBe(true);
		const reportCall = calls.find((call) => call.url.includes("analyticsdata.googleapis.com"));
		expect(reportCall).toBeDefined();
		expect(reportCall!.url).toContain(`properties/${GA4_PROPERTY_ID}:runReport`);
		const body = reportCall!.body;
		expect(body.dateRanges).toEqual([{ startDate: "2026-09-21", endDate: "2026-09-27" }]);
		expect(body.metrics).toEqual([{ name: "sessions" }, { name: "activeUsers" }]);
		expect(body.dimensions).toEqual([{ name: "sessionSourceMedium" }]);
		expect(body.limit).toBe(25);
		expect(result.rows).toHaveLength(1);
		expect(result.rows![0].metrics).toEqual(CURRENT_VALUES);
	});

	it("returns ok:false with the API error message instead of throwing", async () => {
		const env = await envWithCredential();
		stubFetch((call) => {
			if (call.url.includes("oauth2.googleapis.com/token")) {
				return jsonResponse({ access_token: "access-1" });
			}
			return jsonResponse(
				{ error: { message: "Field bogusMetric is not a valid metric" } },
				400,
			);
		});

		const result = await runGa4Report(env, {
			metrics: ["bogusMetric"],
			startDate: "2026-09-21",
			endDate: "2026-09-27",
		});

		expect(result.ok).toBe(false);
		expect(result.error_kind).toBe("api");
		expect(result.error).toContain("bogusMetric");
	});

	it("classifies a rejected refresh token as an auth error", async () => {
		const env = await envWithCredential();
		stubFetch((call) => {
			if (call.url.includes("oauth2.googleapis.com/token")) {
				return jsonResponse(
					{ error: "invalid_grant", error_description: "Token has been expired or revoked." },
					400,
				);
			}
			throw new Error("unexpected GA4 call");
		});

		const result = await runGa4Report(env, {
			metrics: ["sessions"],
			startDate: "2026-09-21",
			endDate: "2026-09-27",
		});

		expect(result.ok).toBe(false);
		expect(result.error_kind).toBe("auth");
		expect(result.error).toContain("expired or revoked");
	});
});

describe("getGa4AudienceReport", () => {
	function stubGa4Api(options: { rejectConversions?: boolean } = {}) {
		return stubFetch((call) => {
			if (call.url.includes("oauth2.googleapis.com/token")) {
				return jsonResponse({ access_token: "access-1" });
			}
			const body = call.body;
			const metrics = (body.metrics as Array<{ name: string }>).map((m) => m.name);
			if (options.rejectConversions && metrics.includes("conversions")) {
				return jsonResponse(
					{ error: { message: "Field conversions is not a valid metric for this property" } },
					400,
				);
			}
			const startDate = (body.dateRanges as Array<{ startDate: string }>)[0].startDate;
			const isPrior = startDate < "2026-09-21";
			const values = isPrior ? PRIOR_VALUES : CURRENT_VALUES;
			const dimensions = body.dimensions as Array<{ name: string }> | undefined;
			if (!dimensions) {
				return jsonResponse({ rows: [totalsRow(values)], rowCount: 1 });
			}
			const dimension = dimensions[0].name;
			if (dimension === "sessionSourceMedium") {
				return jsonResponse({
					rows: [
						{
							dimensionValues: [{ value: "google / organic" }],
							metricValues: [{ value: "300" }, { value: "9" }],
						},
						{
							dimensionValues: [{ value: "direct / (none)" }],
							metricValues: [{ value: "60" }, { value: "2" }],
						},
					],
					rowCount: 2,
				});
			}
			if (dimension === "landingPage") {
				return jsonResponse({
					rows: [
						{
							dimensionValues: [{ value: "/" }],
							metricValues: [{ value: "250" }],
						},
					],
					rowCount: 1,
				});
			}
			if (dimension === "country") {
				return jsonResponse({
					rows: [
						{
							dimensionValues: [{ value: "United States" }],
							metricValues: [{ value: "420" }],
						},
						{
							dimensionValues: [{ value: "Canada" }],
							metricValues: [{ value: "40" }],
						},
					],
					rowCount: 2,
				});
			}
			if (dimension === "region") {
				const filter = (body.dimensionFilter as {
					filter: { fieldName: string; stringFilter: { value: string } };
				}).filter;
				expect(filter.fieldName).toBe("country");
				expect(filter.stringFilter.value).toBe("United States");
				return jsonResponse({
					rows: [
						{
							dimensionValues: [{ value: "Florida" }],
							metricValues: [{ value: "150" }],
						},
					],
					rowCount: 1,
				});
			}
			throw new Error(`unexpected dimension ${dimension}`);
		});
	}

	it("returns canonical totals with prior-period deltas", async () => {
		const env = await envWithCredential();
		stubGa4Api();

		const report = await getGa4AudienceReport(env, {
			startDate: "2026-09-21",
			endDate: "2026-09-27",
			comparePrior: true,
		});

		expect(report.ok).toBe(true);
		expect(report.data_quality).toBe("LIVE_VERIFIED");
		expect(report.period_start).toBe("2026-09-21");
		expect(report.period_end).toBe("2026-09-27");
		expect(report.compare_period_start).toBe("2026-09-14");
		expect(report.compare_period_end).toBe("2026-09-20");
		expect(report.source).toBe("ga4");
		expect(report.source_account).toBe(GA4_PROPERTY_ID);

		const sessions = report.totals["sessions"];
		expect(sessions.current.metric_name).toBe("ga4.sessions");
		expect(sessions.current.value).toBe(416);
		expect(sessions.current.unit).toBe("count");
		expect(sessions.current.source).toBe("ga4");
		expect(sessions.current.source_account).toBe(GA4_PROPERTY_ID);
		expect(sessions.current.period_start).toBe("2026-09-21");
		expect(sessions.current.period_end).toBe("2026-09-27");
		expect(sessions.current.data_quality).toBe("LIVE_VERIFIED");
		expect(typeof sessions.current.fetched_at).toBe("string");
		expect(sessions.prior?.value).toBe(259);
		expect(sessions.percent_change).toBeCloseTo(60.62, 1);
		expect(sessions.percent_change_metric?.unit).toBe("percent");

		const views = report.totals["screenPageViews"];
		expect(views.current.value).toBe(956);
		expect(views.percent_change).toBeCloseTo(101.69, 1);

		const engagementRate = report.totals["engagementRate"];
		expect(engagementRate.current.unit).toBe("percent");
		expect(engagementRate.current.value).toBeCloseTo(65, 5);

		const avgDuration = report.totals["averageSessionDuration"];
		expect(avgDuration.current.unit).toBe("seconds");
		expect(avgDuration.current.value).toBeCloseTo(95.5, 5);

		expect(report.totals["conversions"].current.metric_name).toBe("ga4.conversions");
	});

	it("returns breakdowns by source/medium, landing page, country and US region", async () => {
		const env = await envWithCredential();
		const calls = stubGa4Api();

		const report = await getGa4AudienceReport(env, {
			startDate: "2026-09-21",
			endDate: "2026-09-27",
		});

		expect(report.ok).toBe(true);
		expect(report.compare).toBe(false);
		expect(report.compare_period_start).toBeNull();

		const sourceMedium = report.breakdowns.session_source_medium;
		expect(sourceMedium).toHaveLength(2);
		expect(sourceMedium[0].dimension).toBe("sessionSourceMedium");
		expect(sourceMedium[0].dimension_value).toBe("google / organic");
		expect(sourceMedium[0].metrics["sessions"].value).toBe(300);
		expect(sourceMedium[0].metrics["sessions"].scope).toBe("sessionSourceMedium=google / organic");
		expect(sourceMedium[0].metrics["sessions"].geography).toBe("global");

		expect(report.breakdowns.landing_page[0].dimension_value).toBe("/");
		expect(report.breakdowns.landing_page[0].metrics["sessions"].value).toBe(250);

		const country = report.breakdowns.country;
		expect(country[0].dimension_value).toBe("United States");
		expect(country[0].metrics["activeUsers"].geography).toBe("US");
		expect(country[1].metrics["activeUsers"].geography).toBe("global");

		const usRegion = report.breakdowns.us_region;
		expect(usRegion[0].dimension_value).toBe("Florida");
		expect(usRegion[0].metrics["activeUsers"].value).toBe(150);
		expect(usRegion[0].metrics["activeUsers"].geography).toBe("US");
		// The US-only breakdown call must carry the country dimension filter.
		const regionCall = calls.find((call) =>
			(call.body.dimensions as Array<{ name: string }> | undefined)?.[0]?.name === "region",
		);
		expect(regionCall).toBeDefined();
		expect(regionCall!.body.limit).toBe(25);

		// One totals call + four breakdown calls + one token refresh.
		expect(calls.filter((call) => call.url.includes("runReport"))).toHaveLength(5);
	});

	it("falls back from conversions to keyEvents when the API rejects it", async () => {
		const env = await envWithCredential();
		stubGa4Api({ rejectConversions: true });

		const report = await getGa4AudienceReport(env, {
			startDate: "2026-09-21",
			endDate: "2026-09-27",
		});

		expect(report.ok).toBe(true);
		expect(report.data_quality).toBe("LIVE_VERIFIED");
		expect(report.totals["keyEvents"].current.metric_name).toBe("ga4.keyEvents");
		expect(report.totals["keyEvents"].current.value).toBe(12);
		expect(report.totals["conversions"]).toBeUndefined();
		expect(report.quality_note).toContain("keyEvents");
	});

	it("surfaces a Data API failure with quality status instead of throwing", async () => {
		const env = await envWithCredential();
		stubFetch((call) => {
			if (call.url.includes("oauth2.googleapis.com/token")) {
				return jsonResponse({ access_token: "access-1" });
			}
			return jsonResponse(
				{ error: { message: "Request had invalid authentication credentials." } },
				401,
			);
		});

		const report = await getGa4AudienceReport(env, {
			startDate: "2026-09-21",
			endDate: "2026-09-27",
		});

		expect(report.ok).toBe(false);
		expect(report.data_quality).toBe("SOURCE_AUTH_ERROR");
		expect(report.error).toContain("invalid authentication credentials");
		expect(report.totals).toEqual({});
	});

	it("resolves the last7 preset from today when no dates are given", async () => {
		const env = await envWithCredential();
		const calls = stubGa4Api();

		const report = await getGa4AudienceReport(env, {});
		expect(report.ok).toBe(true);
		expect(report.preset).toBe("last7");
		const today = new Date().toISOString().slice(0, 10);
		const anchor = Date.parse(`${today}T00:00:00Z`);
		const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
		const reportCall = calls.find((call) =>
			call.url.includes("runReport") &&
			!(call.body.dimensions as Array<{ name: string }> | undefined),
		);
		expect(reportCall!.body.dateRanges).toEqual([
			{ startDate: fmt(anchor - 7 * 86_400_000), endDate: fmt(anchor - 86_400_000) },
		]);
	});
});
