import { describe, expect, it } from "vitest";
import { renderMarketingSectionHtml } from "../src/oc-marketing";

// Operating Center Marketing UI contract for the canonical audience layer:
// each section reads its live adapter endpoint and degrades honestly when
// the live read fails. The screens are client-rendered template scripts, so
// the contract is asserted on the embedded loader logic.

const html = renderMarketingSectionHtml();

describe("oc marketing social: live-first follower counts", () => {
	it("reads the live Meta overview endpoint (not just the static list)", () => {
		expect(html).toContain("/api/operating-center/social/overview?live=1");
	});

	it("renders live follower counts per destination from adapter metrics", () => {
		expect(html).toContain("social_findMetric(dest.metrics,'followers')");
		expect(html).toContain("Followers:");
	});

	it("shows last refresh and data quality per destination", () => {
		expect(html).toContain("Last refresh:");
		expect(html).toContain("data quality:");
	});

	it("falls back to the static list ONLY as 'last known' when the live read fails", () => {
		expect(html).toContain("social_staticSummaryHtml");
		expect(html).toContain("last known");
		expect(html).toContain("these are <strong>not</strong> live");
	});

	it("keeps the observed dates on the fallback values", () => {
		expect(html).toContain("observed 2026-09-22");
	});

	it("renders live destination details with a per-metric table", () => {
		expect(html).toContain("Live Meta destinations");
		expect(html).toContain("<th>Metric</th>");
		expect(html).toContain("<th>Refreshed</th>");
	});

	it("never throws out of the live social read (fallback always reachable)", () => {
		const start = html.indexOf("async function social_fetchLiveOverview");
		const end = html.indexOf("function social_findMetric");
		const fn = html.slice(start, end);
		expect(fn).toContain("try{");
		expect(fn).toContain("}catch(err){");
	});
});

describe("oc marketing ads: parameterized live metrics", () => {
	it("fetches the last-30-days parameterized metrics endpoint", () => {
		expect(html).toContain("/api/operating-center/ads/metrics?preset=last30");
	});

	it("renders live account totals from the metrics read", () => {
		expect(html).toContain("account_totals");
		expect(html).toContain("Last 30 days");
	});

	it("notes the full breakdown endpoint for the owner", () => {
		expect(html).toContain("Full breakdown");
		expect(html).toContain("conversion actions");
	});

	it("shows the exact owner action text on OWNER_ACTION_REQUIRED", () => {
		// The badge and the adapter-provided note (error / quality_note),
		// not a generic message.
		expect(html).toContain("dq==='OWNER_ACTION_REQUIRED'");
		expect(html).toContain("owner action required</span>");
		const dqIdx = html.indexOf("dq==='OWNER_ACTION_REQUIRED'");
		const win = html.slice(Math.max(0, dqIdx - 300), dqIdx + 900);
		expect(win).toContain("m30.data.error||m30.data.quality_note");
	});

	it("keeps GA4 traffic out of the Ads summary", () => {
		const adsSummaryStart = html.indexOf("async function boot_ads_summary");
		const adsSummaryEnd = html.indexOf("async function boot_ads_actions");
		const adsSummary = html.slice(adsSummaryStart, adsSummaryEnd);
		expect(adsSummary).not.toContain("Google Analytics");
		expect(adsSummary).not.toContain("GA4 audience");
	});
});

describe("oc marketing analytics: GA4 audience last7 vs prior7", () => {
	it("fetches the canonical audience report with compare enabled", () => {
		expect(html).toContain("/api/operating-center/analytics/audience?preset=last7&compare=1");
	});

	it("shows sessions, views and users with percent changes", () => {
		expect(html).toContain("ga4_audienceHtml");
		expect(html).toContain("screenPageViews");
		expect(html).toContain("totalUsers");
		expect(html).toContain("ga4_fmtPct");
	});

	it("shows the reporting periods and freshness of the audience block", () => {
		expect(html).toContain("compare_period_start");
		expect(html).toContain("fetched");
	});

	it("links the full audience report endpoint", () => {
		expect(html).toContain("Full audience report");
	});

	it("never throws out of the audience read (traffic card still renders)", () => {
		const start = html.indexOf("async function analytics_fetchAudience");
		const end = html.indexOf("function ga4_fmtPct");
		const fn = html.slice(start, end);
		expect(fn).toContain("try{");
		expect(fn).toContain("}catch(err){");
	});
});

describe("oc marketing audience: failure isolation", () => {
	it("the metrics helper never throws (ads overview survives its failure)", () => {
		const start = html.indexOf("async function ads_fetchMetricsLast30");
		const end = html.indexOf("function ads_connBadge");
		const fn = html.slice(start, end);
		expect(fn).toContain("try{");
		expect(fn).toContain("}catch(err){");
	});

	it("social and analytics still render when one of the reads fails", () => {
		// Each boot_* function keeps rendering its base content regardless of
		// the optional live-read result.
		expect(html).toContain("boot_social_summary");
		expect(html).toContain("boot_analytics_summary");
		expect(html).toContain("boot_ads_summary");
	});
});
