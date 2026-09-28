import { describe, expect, it } from "vitest";
import { renderOverviewSectionHtml } from "../src/oc-overview";

// Overview contract: 4 functions (state, money, work, blockers), each with
// a short description and three separate Summary / Actions / Details views
// (one visible at a time), deep-linkable via
// ?tab=<function>&view=<summary|actions|details>.

const FUNCTIONS = ["state", "money", "work", "blockers"];

describe("operating center overview: Summary/Actions/Details", () => {
	const html = renderOverviewSectionHtml();

	it("renders four function tabs", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-tab="${f}"`);
		}
	});

	it("gives every function a short human description", () => {
		const descs = html.match(/class="oc-func-desc"/g) || [];
		expect(descs.length).toBe(FUNCTIONS.length);
	});

	it("gives every function three visible view buttons and three view panels", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-views="${f}"`);
		}
		for (const view of ["summary", "actions", "details"]) {
			expect(html).toContain(`data-view="${view}"`);
			expect(html).toContain(`data-viewpanel="${view}"`);
		}
		const panels = html.match(/data-viewpanel="(summary|actions|details)"/g) || [];
		expect(panels.length).toBe(FUNCTIONS.length * 3);
	});

	it("shows only one view at a time (actions and details start hidden)", () => {
		const hiddenActions = html.match(/data-viewpanel="actions"[^>]*hidden/g) || [];
		const hiddenDetails = html.match(/data-viewpanel="details"[^>]*hidden/g) || [];
		expect(hiddenActions.length).toBe(FUNCTIONS.length);
		expect(hiddenDetails.length).toBe(FUNCTIONS.length);
	});

	it("addresses tabs and views by query parameters", () => {
		expect(html).toContain("new URLSearchParams(location.search).get('tab')");
		expect(html).toContain("new URLSearchParams(location.search).get('view')");
	});

	it("keeps the main action quick bar in English", () => {
		expect(html).toContain(">Review board queue<");
		expect(html).toContain("/operating-center/board?tab=board&view=actions");
		expect(html).toContain("The Machine keeps every summary below up to date automatically");
	});

	it("uses canonical ?tab=&view= links, not the old hash form", () => {
		expect(html).not.toContain("/operating-center/sport#");
		expect(html).not.toContain("/operating-center/growth#");
		expect(html).not.toContain("/operating-center/marketing#");
		expect(html).not.toContain("/operating-center/operations#");
		expect(html).not.toContain("/operating-center/board#");
		expect(html).toContain("/operating-center/sport?tab=results&view=summary");
		expect(html).toContain("/operating-center/growth?tab=funds&view=actions");
	});

	it("contains no Russian text", () => {
		expect(html).not.toMatch(/[А-Яа-яЁё]/);
	});

	it("replaces the hardcoded social followers claim with live account data", () => {
		expect(html).not.toContain("8 followers");
		// The social loader renders each account's live platform/handle/status.
		expect(html).toContain("/api/operating-center/social/overview");
		expect(html).toContain("a.platform");
	});

	it("replaces the hardcoded Google Ads claim with the live connection badge", () => {
		expect(html).not.toContain("Google Ads: <span class=\"unavailable\">not connected</span>");
		// The ads loader reads the live connection flag, like the Marketing
		// Ads summary does.
		expect(html).toContain("/api/operating-center/ads/overview");
		expect(html).toContain("google_ads.connected");
	});
});
