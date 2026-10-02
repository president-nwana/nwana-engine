import { describe, expect, it } from "vitest";
import { renderMarketingSectionHtml } from "../src/oc-marketing";
import { renderOverviewSectionHtml } from "../src/oc-overview";
import { renderGrowthSectionHtml } from "../src/oc-growth";
import { renderSportSectionHtml } from "../src/oc-sport";
import { renderAcademySectionHtml } from "../src/oc-academy";
import { renderBoardSectionHtml } from "../src/oc-board";
import { renderOperationsSectionHtml } from "../src/oc-operations";

// Marketing contract: 5 functions, each with a short description and three
// separate Summary / Actions / Details views (one visible at a time),
// deep-linkable via ?tab=<function>&view=<summary|actions|details>.

const FUNCTIONS = ["ads", "analytics", "social", "media", "sites"];

describe("operating center marketing: Summary/Actions/Details", () => {
	const html = renderMarketingSectionHtml();

	it("renders five function tabs", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-tab="${f}"`);
		}
	});

	it("gives every function a short human description", () => {
		const descs = html.match(/class="oc-func-desc"/g) || [];
		expect(descs.length).toBe(FUNCTIONS.length);
	});

	it("gives every function three visible view buttons", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-views="${f}"`);
		}
		const buttons = html.match(/class="oc-view-btn(?! oc-refresh-btn)/g) || [];
		// 3 per function + quick-action links styled as oc-view-btn
		expect(buttons.length).toBeGreaterThanOrEqual(FUNCTIONS.length * 3);
		for (const view of ["summary", "actions", "details"]) {
			expect(html).toContain(`data-view="${view}"`);
			expect(html).toContain(`data-viewpanel="${view}"`);
		}
	});

	it("shows only one view at a time (others hidden)", () => {
		// Every actions/details panel starts hidden; summaries are visible.
		const hiddenActions = html.match(/data-viewpanel="actions"[^>]*hidden/g) || [];
		const hiddenDetails = html.match(/data-viewpanel="details"[^>]*hidden/g) || [];
		expect(hiddenActions.length).toBe(FUNCTIONS.length);
		expect(hiddenDetails.length).toBe(FUNCTIONS.length);
	});

	it("addresses tabs by the tab query parameter", () => {
		expect(html).toContain("new URLSearchParams(location.search).get('tab')");
		expect(html).toContain("new URLSearchParams(location.search).get('view')");
	});

	it("keeps quick actions in English", () => {
		expect(html).toContain(">Create post<");
		expect(html).toContain(">Site news<");
		expect(html).toContain(">Press release<");
		expect(html).toContain(">Review Ads proposals<");
		expect(html).toContain(">Open analytics<");
	});

	it("keeps GA4 traffic in Analytics only (no GA4 card in Ads)", () => {
		// The Ads summary loader must not render the Google Analytics card.
		const adsSummaryStart = html.indexOf("async function boot_ads_summary");
		const adsSummaryEnd = html.indexOf("async function boot_ads_actions");
		const adsSummary = html.slice(adsSummaryStart, adsSummaryEnd);
		expect(adsSummary).not.toContain("Google Analytics");
	});
});

describe("operating center shell: favicon and English UI", () => {
	const sections = [
		renderOverviewSectionHtml(),
		renderMarketingSectionHtml(),
		renderGrowthSectionHtml(),
		renderSportSectionHtml(),
		renderAcademySectionHtml(),
		renderBoardSectionHtml(),
		renderOperationsSectionHtml(),
	];

	it("links the NWANA icon as favicon and apple-touch-icon on every section", () => {
		for (const html of sections) {
			expect(html).toContain(
				'<link rel="icon" type="image/png" href="/operating-center/icon-180.v2.png">',
			);
			expect(html).toContain(
				'<link rel="apple-touch-icon" href="/operating-center/icon-180.v2.png">',
			);
		}
	});

	it("uses the served icon file for the header logo (no data URI)", () => {
		for (const html of sections) {
			expect(html).toContain('src="/operating-center/icon-180.v2.png"');
			expect(html).not.toContain("data:image/png;base64");
		}
	});

	it("contains no Russian text in any section shell", () => {
		const cyrillic = /[А-Яа-яЁё]/;
		for (const html of sections) {
			expect(html).not.toMatch(cyrillic);
		}
	});
});
