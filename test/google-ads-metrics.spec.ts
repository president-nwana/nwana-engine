// Parameterized Google Ads live metrics read path.
// Verifies: developer-token header is always sent, GAQL carries the date
// window, metric math (CTR, conversion rate, micros -> USD), daily-row
// aggregation, and OWNER_ACTION_REQUIRED when the token is missing.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildCampaignsQuery,
	buildConversionActionQuery,
	buildGeoQuery,
	encryptRefreshToken,
	getGoogleAdsMetrics,
	GOOGLE_ADS_LIVE_CUSTOMER_ID,
	type GoogleAdsEnv,
} from "../src/google-ads";

const TOKEN_KEY = "test-token-key";
const DEVELOPER_TOKEN = "dev-token-123";
const CUSTOMER_ID = GOOGLE_ADS_LIVE_CUSTOMER_ID;

interface RecordedCall {
	url: string;
	headers: Record<string, string>;
	body: string;
}

async function makeEnv(recorded: RecordedCall[], withDeveloperToken: boolean): Promise<GoogleAdsEnv> {
	const protectedToken = await encryptRefreshToken("refresh-token", TOKEN_KEY);
	// D1 row shape the production query selects: encrypted_refresh_token + iv.
	const credential = {
		encrypted_refresh_token: protectedToken.encrypted,
		iv: protectedToken.iv,
	};
	return {
		nwana_engine_db: {
			prepare(_sql: string) {
				return {
					bind(..._args: unknown[]) {
						return {
							async first() {
								return credential;
							},
						};
					},
				};
			},
		} as unknown as D1Database,
		GOOGLE_ADS_CLIENT_ID: "client-id",
		GOOGLE_ADS_CLIENT_SECRET: "client-x1",
		GOOGLE_ADS_TOKEN_KEY: TOKEN_KEY,
		...(withDeveloperToken ? { GOOGLE_ADS_DEVELOPER_TOKEN: DEVELOPER_TOKEN } : {}),
	};
}

function stubGoogleAdsFetch(recorded: RecordedCall[], failPrimary = false): void {
	const campaignRows = [
		// Same campaign, two days -> must aggregate into one record.
		{
			campaign: { id: "camp1", name: "NWANA Search", status: "ENABLED" },
			metrics: { impressions: "1000", clicks: "50", costMicros: "500000000", conversions: "5", conversionsValue: "0" },
		},
		{
			campaign: { id: "camp1", name: "NWANA Search", status: "ENABLED" },
			metrics: { impressions: "1000", clicks: "38", costMicros: "395600000", conversions: "3", conversionsValue: "0" },
		},
	];
	vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
		if (url.includes("oauth2.googleapis.com/token")) {
			return Response.json({ access_token: "test-access-token" });
		}
		if (!url.includes("googleads.googleapis.com")) {
			throw new Error(`unexpected fetch: ${url}`);
		}
		const body = (init?.body as string) ?? "";
		recorded.push({
			url,
			headers: { ...(init?.headers as Record<string, string> ?? {}) },
			body,
		});
		const query = (JSON.parse(body) as { query: string }).query;
		if (failPrimary && query.includes("FROM campaign")) {
			return Response.json({ error: { message: "boom" } }, { status: 500 });
		}
		let results: unknown[] = campaignRows;
		if (query.includes("FROM ad_group")) {
			results = [{
				adGroup: { id: "ag1", name: "AG1", status: "ENABLED" },
				campaign: { id: "camp1", name: "NWANA Search" },
				metrics: { impressions: "500", clicks: "20", costMicros: "200000000", conversions: "2", conversionsValue: "0" },
			}];
		} else if (query.includes("FROM geographic_view")) {
			results = [{
				segments: { geoTargetCountry: "geoTargetConstants/2840" },
				metrics: { impressions: "1500", clicks: "60", costMicros: "600000000", conversions: "6" },
			}];
		} else if (query.includes("FROM customer")) {
			results = [{
				segments: { conversionAction: `customers/${CUSTOMER_ID}/conversionActions/111` },
				metrics: { conversions: "8", conversionsValue: "0" },
			}];
		}
		return Response.json({ results });
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("buildCampaignsQuery", () => {
	it("embeds the date window and uses FROM campaign at campaign level", () => {
		const query = buildCampaignsQuery({ startDate: "2026-08-26", endDate: "2026-09-23", level: "campaign" });
		expect(query).toContain("FROM campaign");
		expect(query).toContain("segments.date BETWEEN '2026-08-26' AND '2026-09-23'");
		expect(query).toContain("metrics.impressions");
		expect(query).toContain("metrics.clicks");
		expect(query).toContain("metrics.cost_micros");
		expect(query).toContain("metrics.conversions");
	});
	it("uses FROM ad_group at ad group level", () => {
		const query = buildCampaignsQuery({ startDate: "2026-08-26", endDate: "2026-09-23", level: "ad_group" });
		expect(query).toContain("FROM ad_group");
		expect(query).toContain("ad_group.id");
		expect(query).toContain("segments.date BETWEEN '2026-08-26' AND '2026-09-23'");
	});
});

describe("buildGeoQuery", () => {
	it("targets geographic_view with the date window", () => {
		const query = buildGeoQuery({ startDate: "2026-08-26", endDate: "2026-09-23" });
		expect(query).toContain("FROM geographic_view");
		expect(query).toContain("segments.geo_target_country");
		expect(query).toContain("segments.date BETWEEN '2026-08-26' AND '2026-09-23'");
	});
});

describe("buildConversionActionQuery", () => {
	it("segments conversions by conversion action over the date window", () => {
		const query = buildConversionActionQuery({ startDate: "2026-08-26", endDate: "2026-09-23" });
		expect(query).toContain("segments.conversion_action");
		expect(query).toContain("metrics.conversions");
		expect(query).toContain("segments.date BETWEEN '2026-08-26' AND '2026-09-23'");
	});
});

describe("getGoogleAdsMetrics", () => {
	it("returns OWNER_ACTION_REQUIRED and never calls the API when the developer token is missing", async () => {
		const fetchMock = vi.fn(async () => {
			throw new Error("must not be called");
		});
		vi.stubGlobal("fetch", fetchMock);
		const recorded: RecordedCall[] = [];
		const env = await makeEnv(recorded, false);
		const result = await getGoogleAdsMetrics(env, { startDate: "2026-08-26", endDate: "2026-09-23" });
		expect(result.ok).toBe(false);
		expect(result.data_quality).toBe("OWNER_ACTION_REQUIRED");
		expect(result.quality_note).toContain("GOOGLE_ADS_DEVELOPER_TOKEN");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends the developer-token header on every googleads.googleapis.com call", async () => {
		const recorded: RecordedCall[] = [];
		stubGoogleAdsFetch(recorded);
		const env = await makeEnv(recorded, true);
		await getGoogleAdsMetrics(env, { startDate: "2026-08-26", endDate: "2026-09-23" });
		const apiCalls = recorded.filter((call) => call.url.includes("googleads.googleapis.com"));
		expect(apiCalls.length).toBe(4); // campaigns + ad_groups + geo + conversion actions
		for (const call of apiCalls) {
			expect(call.headers["developer-token"]).toBe(DEVELOPER_TOKEN);
			expect(call.headers["Authorization"]).toBe("Bearer test-access-token");
		}
	});

	it("passes the date window through to GAQL and computes metrics correctly", async () => {
		const recorded: RecordedCall[] = [];
		stubGoogleAdsFetch(recorded);
		const env = await makeEnv(recorded, true);
		const result = await getGoogleAdsMetrics(env, {
			customerId: CUSTOMER_ID,
			startDate: "2026-08-26",
			endDate: "2026-09-23",
		});
		expect(result.ok).toBe(true);
		expect(result.data_quality).toBe("LIVE_VERIFIED");
		expect(result.customer_id).toBe(CUSTOMER_ID);
		expect(result.period).toEqual({ start: "2026-08-26", end: "2026-09-23" });

		// GAQL carries the requested window on the primary query.
		const campaignCall = recorded.find((call) => call.body.includes("FROM campaign"));
		expect(campaignCall?.body).toContain("segments.date BETWEEN '2026-08-26' AND '2026-09-23'");

		// Two daily rows aggregate into one campaign: 2000 impressions,
		// 88 clicks, $895.60 cost, 8 conversions.
		expect(result.campaigns).toHaveLength(1);
		const campaign = result.campaigns[0]!;
		expect(campaign.id).toBe("camp1");
		expect(campaign.impressions).toBe(2000);
		expect(campaign.clicks).toBe(88);
		expect(campaign.cost_usd).toBe(895.6);
		expect(campaign.conversions).toBe(8);
		expect(campaign.ctr).toBeCloseTo(4.4, 4); // 88/2000*100
		expect(campaign.conversion_rate).toBeCloseTo(9.0909, 3); // 8/88*100

		// Account totals match the aggregated campaigns.
		expect(result.account_totals.impressions).toBe(2000);
		expect(result.account_totals.clicks).toBe(88);
		expect(result.account_totals.cost_usd).toBe(895.6);
		expect(result.account_totals.conversions).toBe(8);
		expect(result.account_totals.ctr).toBeCloseTo(4.4, 4);
		expect(result.account_totals.conversion_rate).toBeCloseTo(9.0909, 3);

		// Breakdowns.
		expect(result.ad_groups).toHaveLength(1);
		expect(result.ad_groups[0]!.campaign_id).toBe("camp1");
		expect(result.geo).toHaveLength(1);
		expect(result.geo[0]!.country).toBe("geoTargetConstants/2840");
		expect(result.geo[0]!.cost_usd).toBe(600);
		expect(result.conversion_actions).toHaveLength(1);
		expect(result.conversion_actions[0]!.action_id).toBe("111");
		expect(result.conversion_actions[0]!.conversions).toBe(8);

		// Canonical metrics carry the normalized schema fields.
		const clicks = result.metrics.find((metric) => metric.metric_name === "ads.clicks" && metric.scope === "account");
		expect(clicks).toMatchObject({
			source: "google_ads",
			source_account: CUSTOMER_ID,
			value: 88,
			unit: "count",
			period_start: "2026-08-26",
			period_end: "2026-09-23",
			data_quality: "LIVE_VERIFIED",
		});
		expect(clicks!.fetched_at).toBeTruthy();
		const ctrMetric = result.metrics.find((metric) => metric.metric_name === "ads.ctr" && metric.scope === "account");
		expect(ctrMetric!.unit).toBe("percent");
		expect(ctrMetric!.value).toBeCloseTo(4.4, 4);
		const geoClicks = result.metrics.find((metric) => metric.metric_name === "ads.clicks" && metric.geography === "geoTargetConstants/2840");
		expect(geoClicks!.value).toBe(60);
		const campaignCost = result.metrics.find((metric) => metric.metric_name === "ads.cost_usd" && metric.scope === "campaign:camp1");
		expect(campaignCost).toMatchObject({ value: 895.6, unit: "usd" });
	});

	it("rejects an invalid date range without calling the API", async () => {
		const fetchMock = vi.fn(async () => {
			throw new Error("must not be called");
		});
		vi.stubGlobal("fetch", fetchMock);
		const recorded: RecordedCall[] = [];
		const env = await makeEnv(recorded, true);
		const result = await getGoogleAdsMetrics(env, { startDate: "2026-09-23", endDate: "2026-08-26" });
		expect(result.ok).toBe(false);
		expect(result.data_quality).toBe("SOURCE_API_ERROR");
		expect(result.quality_note).toContain("Invalid date range");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns SOURCE_API_ERROR when the primary campaign query fails", async () => {
		const recorded: RecordedCall[] = [];
		stubGoogleAdsFetch(recorded, true);
		const env = await makeEnv(recorded, true);
		const result = await getGoogleAdsMetrics(env, { startDate: "2026-08-26", endDate: "2026-09-23" });
		expect(result.ok).toBe(false);
		expect(result.data_quality).toBe("SOURCE_API_ERROR");
		expect(result.error).toBe("boom");
	});

	it("marks LIVE_PARTIAL when a secondary breakdown fails", async () => {
		const recorded: RecordedCall[] = [];
		vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
			if (url.includes("oauth2.googleapis.com/token")) {
				return Response.json({ access_token: "test-access-token" });
			}
			const body = (init?.body as string) ?? "";
			const query = (JSON.parse(body) as { query: string }).query;
			if (query.includes("FROM geographic_view")) {
				return Response.json({ error: { message: "geo failed" } }, { status: 500 });
			}
			return Response.json({ results: [] });
		});
		const env = await makeEnv(recorded, true);
		const result = await getGoogleAdsMetrics(env, { startDate: "2026-08-26", endDate: "2026-09-23" });
		expect(result.ok).toBe(true);
		expect(result.data_quality).toBe("LIVE_PARTIAL");
		expect(result.quality_note).toContain("geographic breakdown unavailable");
		expect(result.geo).toHaveLength(0);
	});
});
