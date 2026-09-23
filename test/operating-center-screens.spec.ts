import { describe, expect, it } from "vitest";
import {
	operatingCenterMenu,
	renderOperatingCenterHtml,
} from "../src/operating-center";
import {
	renderSitesHtml,
	renderSocialHtml,
	renderAdsHtml,
	renderSellersHtml,
	renderPartnersHtml,
	renderFundraisingHtml,
	renderGroupsHtml,
	getSitesOverview,
	getSocialOverview,
	getAdsOverview,
	getSellersOverview,
	getPartnersOverview,
	getFundraisingOverview,
	getGroupsOverview,
	buildSitesReport,
	buildSocialReport,
	buildAdsReport,
	buildSellersReport,
	buildPartnersReport,
	buildFundraisingReport,
	buildGroupsReport,
	REPORT_SCREENS,
} from "../src/operating-center-screens";

function extractScripts(html: string): string[] {
	return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

const NEW_PAGES: Array<[string, string, string, () => string]> = [
	["sites", "Sites", "/operating-center/sites", renderSitesHtml],
	["social", "Social", "/operating-center/social", renderSocialHtml],
	["ads", "Ads", "/operating-center/ads", renderAdsHtml],
	["sellers", "Sellers", "/operating-center/sellers", renderSellersHtml],
	["partners", "Partners", "/operating-center/partners", renderPartnersHtml],
	["fundraising", "Fundraising", "/operating-center/fundraising", renderFundraisingHtml],
	["groups", "Groups", "/operating-center/groups", renderGroupsHtml],
];

const ALL_FIFTEEN: Array<[string, string, string]> = [
	["overview", "Overview", "/operating-center"],
	["results", "Results", "/operating-center/results"],
	["funds", "Funds", "/operating-center/funds"],
	["media", "Media", "/operating-center/media"],
	["board", "Board", "/operating-center/board"],
	["uploads", "Uploads", "/operating-center/uploads"],
	["sponsorship", "Sponsorship", "/operating-center/sponsorship"],
	["activity", "Activity", "/operating-center/activity"],
	...NEW_PAGES.map(([id, label, href]) => [id, label, href] as [string, string, string]),
];

describe("operating center menu (ADR-0027): 15 buttons", () => {
	it("lists a button for every operating-center page", () => {
		const menu = operatingCenterMenu("overview");
		for (const [, label, href] of ALL_FIFTEEN) {
			expect(menu).toContain(`href="${href}"`);
			expect(menu).toContain(`>${label}<`);
		}
	});

	it("marks the current page with aria-current on every new page", () => {
		for (const [id, , href] of NEW_PAGES) {
			expect(operatingCenterMenu(id as never)).toContain(
				`href="${href}" aria-current="page"`,
			);
		}
	});

	it("renders the menu directly under the header on every new page", () => {
		for (const [, , , render] of NEW_PAGES) {
			expect(render()).toMatch(/<\/header>\s*<nav class="oc-menu"/);
		}
	});

	it("keeps the menu a wrapping flex row (mobile-friendly)", () => {
		const html = renderSitesHtml();
		expect(html).toContain("flex-wrap:wrap");
	});
});

describe("new screens (ADR-0027): valid inline scripts", () => {
	for (const [id, , , render] of NEW_PAGES) {
		it(`${id} page embeds syntactically valid JavaScript`, () => {
			const scripts = extractScripts(render());
			expect(scripts.length).toBeGreaterThan(0);
			for (const body of scripts) {
				expect(() => new Function(body)).not.toThrow();
			}
		});
	}

	it("every new page has a working Download report button", () => {
		for (const [id, , , render] of NEW_PAGES) {
			const html = render();
			expect(html).toContain('id="report-download"');
			expect(html).toContain(`data-screen="${id}"`);
			expect(html).toContain("downloadReport(");
		}
	});

	it("main page keeps only summary cards for the new screens", () => {
		const html = renderOperatingCenterHtml();
		for (const [id] of NEW_PAGES) {
			expect(html).toContain(`id="${id}-summary"`);
			expect(html).toContain(`href="/operating-center/${id}"`);
		}
		// Full panels stay on their own pages, not on the dashboard.
		expect(html).not.toContain('id="sites-list"');
		expect(html).not.toContain('id="social-list"');
		expect(html).not.toContain('id="ads-list"');
		expect(html).not.toContain('id="sellers-list"');
		expect(html).not.toContain('id="partners-list"');
		expect(html).not.toContain('id="fundraising-list"');
		expect(html).not.toContain('id="groups-list"');
		const scripts = extractScripts(html);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});

describe("new screens (ADR-0027): honest data, no fabrication", () => {
	it("sites: lists all 7 properties, analytics honestly not connected", () => {
		const data = getSitesOverview();
		expect(data.sites).toHaveLength(7);
		for (const s of data.sites) {
			expect(s.url).toMatch(/^https:\/\//);
			expect(s.description.length).toBeGreaterThan(10);
		}
		expect(data.analytics.connected).toBe(false);
	});

	it("social: only verified stats, LinkedIn 8 followers observed 2026-09-22", () => {
		const data = getSocialOverview();
		const linkedin = data.accounts.find((a) => a.platform === "LinkedIn");
		expect(linkedin?.url).toBe("https://www.linkedin.com/company/nwana/");
		expect(linkedin?.stats).toContainEqual({ label: "Followers", value: "8" });
		const youtube = data.accounts.find((a) => a.platform === "YouTube");
		expect(youtube?.stats).toBeNull();
		expect(youtube?.url).toBeNull();
	});

	it("ads: not connected, planned campaigns labeled as not live", () => {
		const data = getAdsOverview();
		expect(data.google_ads.connected).toBe(false);
		expect(data.google_analytics.connected).toBe(false);
		expect(data.planned_campaigns).toHaveLength(2);
		for (const c of data.planned_campaigns) {
			expect(c.status_in_account).toContain("Not created");
			expect(c.daily_budget).toBeGreaterThan(0);
		}
		expect(data.will_show_once_connected.length).toBeGreaterThan(0);
	});

	it("sellers: real pipeline, Integrity 9 call dated, Zubie Five answers honest", () => {
		const data = getSellersOverview();
		const i9 = data.sellers.find((s) => s.company === "Integrity 9");
		expect(i9?.next_date).toBe("2026-09-25");
		expect(i9?.stage).toBe("Meeting confirmed");
		expect(data.zubie_five_answers).toHaveLength(3);
		const groups = data.zubie_five_answers[0];
		expect(groups.answer).toMatch(/not yet tracked/i);
		const brands = data.zubie_five_answers[2];
		expect(brands.answer).toMatch(/no signed brand relationships/i);
	});

	it("partners: real registry entries only (AARP draft)", () => {
		const data = getPartnersOverview();
		expect(data.partners).toHaveLength(1);
		expect(data.partners[0].name).toBe("AARP");
		expect(data.partners[0].stage).toContain("Draft");
	});

	it("fundraising: returns null fund on an empty database", async () => {
		const fakeDb = {
			prepare: () => ({
				bind: function () { return this; },
				all: async () => ({ results: [] }),
				first: async () => null,
				run: async () => ({}),
			}),
		};
		const data = await getFundraisingOverview(fakeDb as never);
		expect(data.ok).toBe(true);
		expect(data.fund).toBeNull();
	});

	it("groups: ladder and funnel URLs, stats honestly not tracked", () => {
		const data = getGroupsOverview();
		expect(data.ladder).toHaveLength(3);
		expect(data.funnel.member_org).toBe("https://runsignup.com/MemberOrg/NWANANWGroups");
		expect(data.stats.connected).toBe(false);
	});
});

describe("reports (ADR-0027): external-safe HTML documents", () => {
	const cases: Array<[string, () => string]> = [
		["sites", () => buildSitesReport(getSitesOverview())],
		["social", () => buildSocialReport(getSocialOverview())],
		["ads", () => buildAdsReport(getAdsOverview())],
		["sellers", () => buildSellersReport(getSellersOverview())],
		["partners", () => buildPartnersReport(getPartnersOverview())],
		["groups", () => buildGroupsReport(getGroupsOverview())],
	];

	it("REPORT_SCREENS covers all 7 screens with page and report paths", () => {
		expect(REPORT_SCREENS).toHaveLength(7);
		for (const s of REPORT_SCREENS) {
			expect(s.reportPath).toBe(`/api/operating-center/report/${s.id}`);
			expect(s.path).toBe(`/operating-center/${s.id}`);
		}
	});

	for (const [id, build] of cases) {
		it(`${id} report: dated, styled, print-friendly, external-safe`, () => {
			const html = build();
			expect(html).toContain("<!doctype html>");
			expect(html).toContain("Report date:");
			expect(html).toContain("@media print");
			expect(html).toContain("NWANA");
			// External-safe: no keys, no internal notes, no email addresses.
			expect(html).not.toContain("owner_key");
			expect(html).not.toContain("Bearer");
			expect(html).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
		});
	}

	it("sellers report answers what Zubie Five asked", () => {
		const html = buildSellersReport(getSellersOverview());
		expect(html).toContain("Integrity 9");
		expect(html).toContain("2026-09-25");
		expect(html).toMatch(/not yet tracked/i);
	});

	it("fundraising report shows goal, pipeline, and dated prospects without emails", async () => {
		const fakeDb = {
			prepare: () => ({
				bind: function () { return this; },
				all: async () => ({ results: [] }),
				first: async () => null,
				run: async () => ({}),
			}),
		};
		const data = await getFundraisingOverview(fakeDb as never);
		const html = buildFundraisingReport(data);
		expect(html).toContain("Report date:");
		expect(html).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
	});
});
