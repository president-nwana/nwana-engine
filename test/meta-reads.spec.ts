import { describe, expect, it, vi } from "vitest";
import { getInstagramInsights, getMetaPageInsights, getMetaSocialOverview } from "../src/meta-reads";

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

type Route = [RegExp, unknown, number?];

/** URL-routed fetch mock: first matching route wins. */
function makeFetcher(routes: Route[]) {
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		for (const [pattern, data, status] of routes) {
			if (pattern.test(url)) return jsonResponse(data, status ?? 200);
		}
		return jsonResponse({ error: { message: "unmocked request", code: -1 } }, 500);
	});
}

const RANGE = { startDate: "2026-09-21", endDate: "2026-09-27" };
const NWANA_PAGE = "595301193675669";
const NWS_PAGE = "103190499173992";
const IG_NWANA = "17841474409019986";
const IG_NWSPORT = "17841455094791338";

function accountsRoute(pages: Array<{ id: string; access_token: string }>): Route {
	return [/\/me\/accounts/, { data: pages.map((p) => ({ id: p.id, name: p.id, access_token: p.access_token })) }];
}

describe("meta-reads", () => {
	it("derives the page token and parses page metrics", async () => {
		const fetcher = makeFetcher([
			accountsRoute([{ id: NWANA_PAGE, access_token: "page-token-1" }]),
			[new RegExp(`/${NWANA_PAGE}\\?fields=`), { name: "NWANA", followers_count: 123, fan_count: 120 }],
			[new RegExp(`/${NWANA_PAGE}/insights`), {
				data: [
					{ name: "page_total_media_view_unique", values: [{ value: 5 }] },
					{ name: "page_media_view", values: [{ value: 10 }, { value: 20 }] },
					{ name: "page_post_engagements", values: [{ value: 3 }] },
					{ name: "page_total_actions", values: [{ value: 7 }] },
					{ name: "page_fan_adds_by_paid_non_paid_unique", values: [{ value: 4 }] },
				],
			}],
		]);
		const result = await getMetaPageInsights({ NWANA_META_TOKEN: "user-token" }, NWANA_PAGE, RANGE, fetcher as typeof fetch);

		// Page-token derivation happened against the user token first.
		const firstCall = String(fetcher.mock.calls[0]?.[0]);
		expect(firstCall).toContain("/me/accounts");
		expect(firstCall).toContain("access_token=user-token");

		expect(result.data_quality).toBe("LIVE_VERIFIED");
		const byName = Object.fromEntries(result.metrics.map((m) => [m.metric_name, m]));
		expect(byName.followers.value).toBe(123);
		expect(byName.page_likes.value).toBe(120);
		expect(byName.views.value).toBe(30);
		expect(byName.reach.value).toBe(5);
		expect(byName.post_engagements.value).toBe(3);
		expect(byName.new_followers.value).toBe(4);
		expect(byName.views.period_start).toBe("2026-09-21");
		expect(byName.views.period_end).toBe("2026-09-27");
		expect(byName.views.source).toBe("facebook");
	});

	it("maps a Meta permission error to OWNER_ACTION_REQUIRED naming the missing permission", async () => {
		const fetcher = makeFetcher([
			[/\/me\/accounts/, { error: { message: "(#10) This action requires read_insights permission", code: 10, type: "OAuthException" } }, 403],
		]);
		const result = await getMetaPageInsights({ NWANA_META_TOKEN: "user-token" }, NWANA_PAGE, RANGE, fetcher as typeof fetch);
		expect(result.data_quality).toBe("OWNER_ACTION_REQUIRED");
		expect(result.metrics).toEqual([]);
		expect(result.error).toContain("read_insights");
		expect(result.error).toContain("pages_read_engagement");
	});

	it("maps an expired token (code 190) to SOURCE_AUTH_ERROR", async () => {
		const fetcher = makeFetcher([
			[/\/me\/accounts/, { error: { message: "Invalid OAuth access token", code: 190, type: "OAuthException" } }, 401],
		]);
		const result = await getMetaPageInsights({ NWANA_META_TOKEN: "stale-token" }, NWANA_PAGE, RANGE, fetcher as typeof fetch);
		expect(result.data_quality).toBe("SOURCE_AUTH_ERROR");
		expect(result.metrics).toEqual([]);
	});

	it("isolates a failing destination in the overview without breaking the others", async () => {
		const fetcher = makeFetcher([
			accountsRoute([
				{ id: NWANA_PAGE, access_token: "page-token-1" },
				{ id: NWS_PAGE, access_token: "page-token-2" },
			]),
			// NWANA page succeeds fully.
			[new RegExp(`/${NWANA_PAGE}\\?fields=`), { name: "NWANA", followers_count: 100, fan_count: 99 }],
			[new RegExp(`/${NWANA_PAGE}/insights`), { data: [
				{ name: "page_total_media_view_unique", values: [{ value: 40 }] },
				{ name: "page_media_view", values: [{ value: 42 }] },
				{ name: "page_post_engagements", values: [{ value: 5 }] },
				{ name: "page_total_actions", values: [{ value: 6 }] },
				{ name: "page_fan_adds_by_paid_non_paid_unique", values: [{ value: 7 }] },
				
			] }],
			// Nordic Walking Sport page fields call fails with an auth error.
			[new RegExp(`/${NWS_PAGE}\\?fields=`), { error: { message: "Invalid OAuth access token", code: 190 } }, 401],
			// Both Instagram accounts succeed.
			[new RegExp(`/${IG_NWANA}\\?fields=`), { username: "nwana.official", followers_count: 810, media_count: 73 }],
			[new RegExp(`/${IG_NWANA}/insights`), { data: [{ name: "reach", values: [{ value: 900 }] }] }],
			[new RegExp(`/${IG_NWSPORT}\\?fields=`), { username: "n_w_sport", followers_count: 679, media_count: 58 }],
			[new RegExp(`/${IG_NWSPORT}/insights`), { data: [{ name: "reach", values: [{ value: 700 }] }] }],
		]);
		const overview = await getMetaSocialOverview({ NWANA_META_TOKEN: "user-token" }, RANGE, fetcher as typeof fetch);

		expect(overview.destinations).toHaveLength(4);
		expect(overview.ok).toBe(true);
		const byId = Object.fromEntries(overview.destinations.map((d) => [d.id, d]));
		expect(byId[NWANA_PAGE].data_quality).toBe("LIVE_VERIFIED");
		expect(byId[NWANA_PAGE].metrics.length).toBeGreaterThan(0);
		expect(byId[NWS_PAGE].data_quality).toBe("SOURCE_AUTH_ERROR");
		expect(byId[NWS_PAGE].metrics).toEqual([]);
		expect(byId[IG_NWANA].metrics.find((m) => m.metric_name === "followers")?.value).toBe(810);
		expect(byId[IG_NWSPORT].metrics.find((m) => m.metric_name === "posts")?.value).toBe(58);
	});

	it("degrades Instagram Insights to LIVE_PARTIAL when one metric is unavailable", async () => {
		const fetcher = makeFetcher([
			[new RegExp(`/${IG_NWANA}\\?fields=`), { username: "nwana.official", followers_count: 810, media_count: 73 }],
			// Batched call fails on an unknown metric; per-metric fallback then succeeds for two.
			[/insights\?metric=reach%2Cviews%2C/, { error: { message: "(#100) Unknown metric views", code: 100 } }, 400],
			[/insights\?metric=reach&/, { data: [{ name: "reach", values: [{ value: 900 }, { value: 100 }] }] }],
			[/insights\?metric=views&/, { error: { message: "(#100) Unknown metric views", code: 100 } }, 400],
			[/insights\?metric=accounts_engaged&/, { data: [{ name: "accounts_engaged", values: [{ value: 50 }] }] }],
			[/insights\?metric=total_interactions&/, { data: [{ name: "total_interactions", values: [{ value: 25 }] }] }],
			[/insights\?metric=follows_and_unfollows&/, { data: [{ name: "follows_and_unfollows", values: [{ value: 5 }] }] }],
			[/insights\?metric=profile_links_taps&/, { data: [{ name: "profile_links_taps", values: [{ value: 3 }] }] }],
		]);
		const result = await getInstagramInsights({ NWANA_META_TOKEN: "user-token" }, IG_NWANA, RANGE, fetcher as typeof fetch);

		expect(result.data_quality).toBe("LIVE_PARTIAL");
		const byName = Object.fromEntries(result.metrics.map((m) => [m.metric_name, m]));
		expect(byName.followers.value).toBe(810);
		expect(byName.reach.value).toBe(1000);
		expect(byName.accounts_engaged.value).toBe(50);
		expect(byName.total_interactions.value).toBe(25);
		expect(byName.views).toBeUndefined();
		expect(result.error).toContain("views");
	});

	it("returns ok:false when NWANA_META_TOKEN is not configured", async () => {
		const fetcher = makeFetcher([]);
		const overview = await getMetaSocialOverview({}, RANGE, fetcher as typeof fetch);
		expect(overview.ok).toBe(false);
		expect(overview.destinations).toEqual([]);
		expect(overview.error).toContain("NWANA_META_TOKEN");
	});
});
