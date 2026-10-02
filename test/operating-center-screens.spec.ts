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
	renderMeetingsHtml,
	renderOperationsHtml,
	buildMachineProposals,
	getSitesOverview,
	getSocialOverview,
	getAdsOverview,
	getSellersOverview,
	getPartnersOverview,
	updateSellerStage,
	updatePartnerStage,
	buildGrantsCompliance,
	getFundraisingOverview,
	getGroupsOverview,
	getMeetingsOverview,
	buildSitesReport,
	buildSocialReport,
	buildAdsReport,
	buildSellersReport,
	buildPartnersReport,
	buildFundraisingReport,
	buildGroupsReport,
	buildMeetingsReport,
	REPORT_SCREENS,
} from "../src/operating-center-screens";
import { renderOverviewSectionHtml } from "../src/oc-overview";
import { renderMarketingSectionHtml } from "../src/oc-marketing";
import { renderGrowthSectionHtml } from "../src/oc-growth";
import { renderSportSectionHtml } from "../src/oc-sport";
import { renderAcademySectionHtml } from "../src/oc-academy";
import { renderBoardSectionHtml } from "../src/oc-board";
import { renderOperationsSectionHtml } from "../src/oc-operations";
import type { GoogleAdsEnv } from "../src/google-ads";
import { buildLiveCampaignsQuery } from "../src/google-ads";


// Fake D1 for the sellers/partners pipeline (mirrors migration 0033 seed shape).
function makePipelineDb(sellers: Array<Record<string, unknown>>, partners: Array<Record<string, unknown>>) {
	return {
		prepare: (sql: string) => ({
			bind: function () { return this; },
			all: async () => ({ results: /FROM sellers/.test(sql) ? sellers : partners }),
			first: async () => null,
			run: async () => ({}),
		}),
	} as never;
}

const SELLER_SEED = [
	{ id: "integrity-9", company: "Integrity 9", contact: "David Hayob", role: "Chief Revenue Officer", stage: "Meeting confirmed", stage_updated_at: "2026-09-21T00:00:00.000Z", last_event: "Owner confirmed Fri 2026-09-25 2:00-3:00pm CT.", last_event_date: "2026-09-21", next_step: "Join the call.", next_date: "2026-09-25", source_of_relationship: null, sort_order: 1 },
	{ id: "zubie-five", company: "Zubie Five", contact: "Adam Zubiate", role: "Founder", stage: "Reply received — numbers requested", stage_updated_at: null, last_event: "Adam replied 2026-09-22.", last_event_date: "2026-09-22", next_step: "Send the numbers.", next_date: null, source_of_relationship: null, sort_order: 2 },
];
const PARTNER_SEED = [
	{ id: "aarp", name: "AARP", subject: "National member-benefit partnership", stage: "Draft — no recipient yet", stage_updated_at: null, last_event: "Draft staged 2026-09-17.", last_event_date: "2026-09-17", sort_order: 1 },
];

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
	["meetings", "Meetings", "/operating-center/meetings", renderMeetingsHtml],
	["operations", "Operations", "/operating-center/operations", renderOperationsHtml],
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

const SEVEN_SECTIONS: Array<[string, string, string, () => string]> = [
	["overview", "Overview", "/operating-center", renderOverviewSectionHtml],
	["marketing", "Marketing", "/operating-center/marketing", renderMarketingSectionHtml],
	["growth", "Growth", "/operating-center/growth", renderGrowthSectionHtml],
	["sport", "Sport", "/operating-center/sport", renderSportSectionHtml],
	["academy", "Academy", "/operating-center/academy", renderAcademySectionHtml],
	["board", "Board", "/operating-center/board", renderBoardSectionHtml],
	["operations", "Operations", "/operating-center/operations", renderOperationsSectionHtml],
];

describe("operating center menu (rebuild 2026-09-28): 7 buttons", () => {
	it("lists a button for every section", () => {
		const menu = operatingCenterMenu("overview");
		for (const [, label, href] of SEVEN_SECTIONS) {
			expect(menu).toContain(`href="${href}"`);
			expect(menu).toContain(`>${label}<`);
		}
	});

	it("marks the current section with aria-current on every section page", () => {
		for (const [id, , href] of SEVEN_SECTIONS) {
			expect(operatingCenterMenu(id)).toContain(
				`href="${href}" aria-current="page"`,
			);
		}
	});

	it("renders the menu directly under the header on every section page", () => {
		for (const [, , , render] of SEVEN_SECTIONS) {
			expect(render()).toMatch(/<\/header>\s*<nav class="oc-menu"/);
		}
	});

	it("keeps the menu a wrapping flex row (mobile-friendly)", () => {
		const html = renderMarketingSectionHtml();
		expect(html).toContain("flex-wrap:wrap");
	});
});

describe("new screens (ADR-0027/0028): valid inline scripts", () => {
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
		expect(html).not.toContain('id="meetings-external-list"');
		expect(html).not.toContain('id="meetings-board-upcoming"');
		expect(html).not.toContain('id="operations-queue"');
		const scripts = extractScripts(html);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});

describe("new screens (ADR-0027/0028): honest data, no fabrication", () => {
	// ADR-0030: stub Google Ads account readers. The account reader is
	// injectable so these tests never touch Google or D1.
	const liveCampaignsReader = async () => ({
		ok: true,
		customer_id: "6758500147",
		date_range: "2026-08-26 to 2026-09-23",
		campaigns: [
			{ id: "111", name: "NWANA 5K race, September 27", status: "ENABLED", daily_budget_usd: 10.97, impressions: 120, clicks: 9, conversions: 0, cost_usd: 122.89 },
			{ id: "222", name: "NWANA 2026 Series", status: "PAUSED", daily_budget_usd: 10.97, impressions: 200, clicks: 13, conversions: 1, cost_usd: 126.08 },
		],
	});
	const emptyAccountReader = async () => ({
		ok: true,
		customer_id: "6758500147",
		date_range: "2026-08-26 to 2026-09-23",
		campaigns: [] as Array<{
			id: string; name: string; status: string; daily_budget_usd: number;
			impressions: number; clicks: number; conversions: number; cost_usd: number;
		}>,
	});
	const failingAccountReader = async () => ({
		ok: false,
		customer_id: "6758500147",
		date_range: "2026-08-26 to 2026-09-23",
		campaigns: [] as Array<{
			id: string; name: string; status: string; daily_budget_usd: number;
			impressions: number; clicks: number; conversions: number; cost_usd: number;
		}>,
		error: "REQUEST_ERROR: Unrecognized field in the query.",
	});
	const connectedStatusReader = async () => ({
		ok: true,
		connected: true,
		configured: true,
		access_level: "EXPLORER" as const,
		customers: ["customers/6758500147"],
		execution_allowed: false as const,
	});
	it("sites: lists all 9 verified properties, analytics honestly not connected", () => {
		const data = getSitesOverview();
		expect(data.sites).toHaveLength(9);
		const names = data.sites.map((s) => s.name);
		expect(names).toContain("groups.nwaofna.org");
		expect(names).toContain("pathways.nwaofna.org");
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

	it("ads: reads the real Google Ads status, never a hardcoded flag", async () => {
		// ADR-0029 regression: the ADR-0027 screen hardcoded "Not connected"
		// even though the live integration was connected. The status reader
		// is injectable so the test never touches Google.
		// ADR-0030: the account reader is injectable too; stubbed below.
		const connectedReader = async () => ({
			ok: true,
			connected: true,
			configured: true,
			access_level: "EXPLORER" as const,
			customers: ["customers/6758500147"],
			execution_allowed: false as const,
		});
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedReader, emptyAccountReader);
		expect(data.google_ads.connected).toBe(true);
		expect(data.google_ads.configured).toBe(true);
		expect(data.google_ads.access_level).toBe("EXPLORER");
		expect(data.google_ads.customers).toContain("customers/6758500147");
		expect(data.google_ads.execution_allowed).toBe(false);
		// A connected integration must never render "Not connected".
		expect(JSON.stringify(data.google_ads)).not.toContain("Not connected");
		expect(data.google_ads.note).toContain("customers/6758500147");
		const report = buildAdsReport(data);
		expect(report).toContain("Connected");
		expect(report).not.toMatch(/Google Ads<\/strong> <span class="tag-warn">Not connected/);
		expect(report).toContain("customers/6758500147");
		expect(report).not.toContain("owner login");
		// Planned campaigns stay a separate section, clearly not created.
		expect(data.google_analytics.connected).toBe(false);
		expect(data.planned_campaigns).toHaveLength(2);
		for (const c of data.planned_campaigns) {
			expect(c.status_in_account).toContain("Not created");
			expect(c.daily_budget).toBeGreaterThan(0);
		}
		expect(data.capabilities.length).toBeGreaterThan(0);
	});

	it("ads: a real connection error surfaces the real error", async () => {
		const errorReader = async () => ({
			ok: false,
			connected: false,
			configured: true,
			access_level: "EXPLORER" as const,
			customers: [] as string[],
			execution_allowed: false as const,
			error: "invalid_grant: Token has been expired or revoked.",
		});
		const data = await getAdsOverview({} as GoogleAdsEnv, errorReader, emptyAccountReader);
		expect(data.google_ads.connected).toBe(false);
		expect(data.google_ads.error).toContain("invalid_grant");
		expect(data.google_ads.note).toContain("invalid_grant");
		const report = buildAdsReport(data);
		expect(report).toContain("invalid_grant");
	});

	it("ads: missing configuration renders an honest not-connected state", async () => {
		const missingReader = async () => ({
			ok: false,
			connected: false,
			configured: false,
			access_level: "EXPLORER" as const,
			customers: [] as string[],
			execution_allowed: false as const,
			missing_configuration: ["GOOGLE_ADS_CLIENT_ID"],
		});
		const data = await getAdsOverview({} as GoogleAdsEnv, missingReader, emptyAccountReader);
		expect(data.google_ads.connected).toBe(false);
		expect(data.google_ads.note).toContain("GOOGLE_ADS_CLIENT_ID");
		const report = buildAdsReport(data);
		expect(report).toContain("GOOGLE_ADS_CLIENT_ID");
	});

	it("ads: live account block shows real campaigns, planned stays separate", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, liveCampaignsReader);
		expect(data.live_account.available).toBe(true);
		expect(data.live_account.customer_id).toBe("6758500147");
		expect(data.live_account.date_range).toBe("2026-08-26 to 2026-09-23");
		expect(data.live_account.campaigns).toHaveLength(2);
		const five = data.live_account.campaigns[0];
		expect(five.name).toBe("NWANA 5K race, September 27");
		expect(five.status).toBe("ENABLED");
		expect(five.daily_budget_usd).toBeCloseTo(10.97);
		expect(five.impressions).toBe(120);
		expect(five.clicks).toBe(9);
		expect(five.conversions).toBe(0);
		expect(five.cost_usd).toBeCloseTo(122.89);
		// Live campaigns are never mixed with the planned spec.
		const plannedNames = data.planned_campaigns.map((c) => c.name);
		for (const c of data.live_account.campaigns) {
			expect(plannedNames).not.toContain(c.name);
		}
		const report = buildAdsReport(data);
		expect(report).toContain("LIVE GOOGLE ADS ACCOUNT");
		expect(report).toContain("NWANA 5K race, September 27");
		expect(report).toContain("MACHINE PROPOSALS");
		// The screen renders the same live block client-side.
		expect(renderAdsHtml()).toContain("LIVE GOOGLE ADS ACCOUNT");
		expect(renderAdsHtml()).toContain("No campaigns found in the connected Google Ads account.");
	});

	it("ads: empty account renders the honest empty state", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		expect(data.live_account.available).toBe(true);
		expect(data.live_account.campaigns).toHaveLength(0);
		expect(data.live_account.error).toBeUndefined();
		const report = buildAdsReport(data);
		expect(report).toContain("No campaigns found in the connected Google Ads account.");
	});

	it("ads: account-read error is shown separately from connection state", async () => {		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, failingAccountReader);
		// The connection stays connected: the failure is in the account read.
		expect(data.google_ads.connected).toBe(true);
		expect(data.live_account.available).toBe(true);
		expect(data.live_account.error).toContain("Unrecognized field");
		// No invented zeros: the campaign list stays empty, not zero-filled.
		expect(data.live_account.campaigns).toHaveLength(0);
		const report = buildAdsReport(data);
		expect(report).toContain("Read error");
		expect(report).toContain("Unrecognized field");
	});

	it("ads: Series proposal shows POSSIBLE DUPLICATE / REVIEW", async () => {
		// The live account already contains "2026 NWANA Open Nordic Walking
		// Series": the Series proposal is a confirmed conflict via the
		// verified mapping, never shown as a fresh proposal.
		const accountWithSeries = async () => ({
			ok: true,
			customer_id: "6758500147",
			date_range: "2026-08-26 to 2026-09-23",
			campaigns: [
				{ id: "999", name: "2026 NWANA Open Nordic Walking Series", status: "ENABLED", daily_budget_usd: 10.97, impressions: 500, clicks: 40, conversions: 2, cost_usd: 400.0 },
			],
		});
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, accountWithSeries);
		const series = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Series 2026 \u00b7 Virtual Races");
		expect(series).toBeDefined();
		expect(series!.state).toBe("POSSIBLE DUPLICATE / REVIEW");
		expect(series!.next_action).toContain("2026 NWANA Open Nordic Walking Series");
		expect(series!.next_action).toContain("Review against");
		// The verified mapping holds even when the live read is empty:
		// no automatic equivalence detection is built at this step.
		const empty = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const seriesEmpty = empty.machine_proposals.find((p) => p.name === "NWANA \u00b7 Series 2026 \u00b7 Virtual Races");
		expect(seriesEmpty!.state).toBe("POSSIBLE DUPLICATE / REVIEW");
		const report = buildAdsReport(data);
		expect(report).toContain("POSSIBLE DUPLICATE / REVIEW");
		expect(report).toContain("2026 NWANA Open Nordic Walking Series");
	});

	it("ads: Founding Circle proposal is PROPOSED when the name is not live", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const fc = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Founding Circle \u00b7 Donate");
		expect(fc).toBeDefined();
		expect(fc!.state).toBe("PROPOSED");
		expect(fc!.next_action).toBe("Needs owner review before creation");
		const report = buildAdsReport(data);
		expect(report).toContain("NWANA \u00b7 Founding Circle \u00b7 Donate");
	});

	it("ads: live campaigns and machine proposals stay separate layers", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, liveCampaignsReader);
		const liveNames = data.live_account.campaigns.map((c) => c.name);
		const proposalNames = data.machine_proposals.map((p) => p.name);
		for (const name of proposalNames) {
			expect(liveNames).not.toContain(name);
		}
		const report = buildAdsReport(data);
		expect(report).toContain("LIVE GOOGLE ADS ACCOUNT");
		expect(report).toContain("MACHINE PROPOSALS");
		expect(report).not.toContain("PLANNED / NOT CREATED");
		expect(renderAdsHtml()).toContain("MACHINE PROPOSALS");
		expect(renderAdsHtml()).not.toContain("PLANNED / NOT CREATED");
	});

	it("ads: Series proposal resolves to the real Series object", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const series = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Series 2026 \u00b7 Virtual Races");
		expect(series).toBeDefined();
		// Only the real object_id from registry/objects.yaml. The record
		// has no formal object_type or title fields, so those stay null.
		expect(series!.source_object).toEqual({
			object_id: "NWANA-RACE-000001",
			object_type: null,
			title: null,
		});
	});

	it("ads: inferred registry purpose is not silently promoted to object_type", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const series = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Series 2026 \u00b7 Virtual Races");
		expect(series!.source_object!.object_id).toBe("NWANA-RACE-000001");
		expect(series!.source_object!.object_type).not.toBe("SERIES_PUBLIC_HUB");
		expect(series!.source_object!.object_type).toBeNull();
	});

	it("ads: missing title/type remains absent, never invented", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const series = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Series 2026 \u00b7 Virtual Races");
		expect(series!.source_object!.title).toBeNull();
		const report = buildAdsReport(data);
		expect(report).toContain("Source object: NWANA-RACE-000001");
		expect(report).not.toContain("SERIES_PUBLIC_HUB");
	});

	it("ads: Founding Circle stays unlinked without an explicit relationship", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const fc = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Founding Circle \u00b7 Donate");
		expect(fc).toBeDefined();
		// No explicit confirmed relationship exists between the Founding
		// Circle proposal and fund-50k-bridge-sprint (relationships table
		// empty, fund metadata silent, ADR-0015 silent), so no linkage.
		expect(fc!.source_object).toBeNull();
		const report = buildAdsReport(data);
		expect(report).toContain("Source object: not yet linked");
		expect(report).not.toContain("fund-50k-bridge-sprint");
	});

	it("ads: Series = OBJECT_DERIVED, eligible true", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const series = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Series 2026 \u00b7 Virtual Races");
		expect(series!.origin).toBe("OBJECT_DERIVED");
		expect(series!.creation_eligible).toBe(true);
		// Duplicate review unchanged: the live account holds a Series campaign.
		expect(series!.state).toBe("POSSIBLE DUPLICATE / REVIEW");
		expect(series!.next_action).toContain("2026 NWANA Open Nordic Walking Series");
		expect(series!.next_action).toContain("Review against");
	});

	it("ads: Series channel = GOOGLE_ADS_GRANT", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const series = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Series 2026 \u00b7 Virtual Races");
		expect(series!.distribution.channel).toBe("GOOGLE_ADS_GRANT");
	});

	it("ads: Founding Circle = OWNER_DIRECTIVE, eligible true", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const fc = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Founding Circle \u00b7 Donate");
		expect(fc!.origin).toBe("OWNER_DIRECTIVE");
		expect(fc!.creation_eligible).toBe(true);
		expect(fc!.state).toBe("PROPOSED");
		expect(fc!.next_action).toBe("Needs owner review before creation");
	});

	it("ads: missing distribution rule does not affect eligibility", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const fc = data.machine_proposals.find((p) => p.name === "NWANA \u00b7 Founding Circle \u00b7 Donate");
		expect(fc!.distribution).toEqual({ action_id: null, rule_id: null, channel: null });
		expect(fc!.creation_eligible).toBe(true);
	});

	it("ads: invalid HTTPS target URL makes a proposal ineligible", async () => {
		const { buildDesiredState } = await import("../src/google-ads-current");
		const { isCreationEligible } = await import("../src/google-ads-state");
		const spec = await buildDesiredState(null);
		const broken = {
			...spec.campaigns[1],
			ad_groups: spec.campaigns[1].ad_groups.map((g) => ({
				...g,
				ads: g.ads.map((a) => ({ ...a, final_url: a.final_url.replace("https://", "http://") })),
			})),
		};
		expect(isCreationEligible(broken)).toBe(false);
	});

	it("ads: policy violations make a proposal ineligible", async () => {
		const { buildDesiredState } = await import("../src/google-ads-current");
		const { isCreationEligible } = await import("../src/google-ads-state");
		const spec = await buildDesiredState(null);
		const broken = { ...spec.campaigns[1], name: "Generic Donate Campaign" };
		expect(isCreationEligible(broken)).toBe(false);
	});

	it("ads: unknown origin makes a proposal ineligible", async () => {
		const { buildDesiredState } = await import("../src/google-ads-current");
		const { isCreationEligible } = await import("../src/google-ads-state");
		const spec = await buildDesiredState(null);
		expect(isCreationEligible({ ...spec.campaigns[0], origin: null })).toBe(false);
		expect(isCreationEligible({ ...spec.campaigns[1], origin: null })).toBe(false);
	});

	it("ads: OBJECT_DERIVED without a source object is ineligible", async () => {
		const { buildDesiredState } = await import("../src/google-ads-current");
		const { isCreationEligible } = await import("../src/google-ads-state");
		const spec = await buildDesiredState(null);
		expect(isCreationEligible({ ...spec.campaigns[0], source_object: null })).toBe(false);
	});

	it("ads: missing source object stays null instead of being fabricated", async () => {
		const { currentProposalIntents } = await import("../src/google-ads-current");
		const { adaptRegistryObject } = await import("../src/google-ads-intent");
		const intents = await currentProposalIntents(null);
		const orphan = adaptRegistryObject({
			object_id: "NWANA-RACE-000001",
			object_type: null,
			title: null,
			distribution: null,
			purpose: "VIRTUAL_RACES",
			name: "NWANA \u00b7 Orphan \u00b7 Test",
			target_url: "https://series.nwaofna.org",
			cta: "Visit",
			audience: null,
			source_facts: [],
			daily_budget: 100,
			geo_target_id: 2840,
			ad_groups: intents[0].ad_groups,
			sitelinks: intents[0].sitelinks,
		});
		if (!orphan.ok) throw new Error(orphan.error);
		const proposals = buildMachineProposals([{ ...orphan.intent, source_object: null }], []);
		expect(proposals).toHaveLength(1);
		expect(proposals[0].source_object).toBeNull();
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		const honest = { ...data, machine_proposals: proposals };
		const report = buildAdsReport(honest);
		expect(report).toContain("Source object: not yet linked");
	});

	it("ads: proposal policy result comes from the existing validator", async () => {
		const { validateCampaignSpec } = await import("../src/google-ads-state");
		const { buildDesiredState } = await import("../src/google-ads-current");
		const spec = await buildDesiredState(null);
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, emptyAccountReader);
		expect(data.machine_proposals).toHaveLength(spec.campaigns.length);
		for (let i = 0; i < spec.campaigns.length; i++) {
			expect(data.machine_proposals[i].policy_violations).toEqual(
				validateCampaignSpec(spec.campaigns[i]),
			);
		}
		const report = buildAdsReport(data);
		expect(report).toContain("Ad Grants policy: PASS");
	});

	it("ads: the screen performs zero Google Ads mutations", async () => {
		const data = await getAdsOverview({} as GoogleAdsEnv, connectedStatusReader, liveCampaignsReader);
		expect(data.google_ads.execution_allowed).toBe(false);
		// No mutation endpoints, method calls, or creation CTAs anywhere
		// in the screen script or the downloadable report.
		const html = renderAdsHtml();
		expect(html).not.toContain("googleAds:mutate");
		expect(html).not.toContain("mutate");
		expect(html).not.toContain("Create campaign");
		const report = buildAdsReport(data);
		expect(report).not.toContain("googleAds:mutate");
		expect(report).not.toContain("Create campaign");
	});

	it("ads: live GAQL query uses the exact UI date range", () => {
		// The query must match the owner's Google Ads UI window exactly
		// (Aug 26 - Sep 23, 2026); no predefined relative range.
		const q = buildLiveCampaignsQuery();
		expect(q).toContain("segments.date BETWEEN '2026-08-26' AND '2026-09-23'");
		expect(q).not.toContain("LAST_30_DAYS");
		expect(q).toContain("FROM campaign");
		expect(q).toContain("WHERE campaign.status != 'REMOVED'");
		for (const field of [
			"campaign.id",
			"campaign.name",
			"campaign.status",
			"campaign_budget.amount_micros",
			"metrics.impressions",
			"metrics.clicks",
			"metrics.conversions",
			"metrics.cost_micros",
		]) {
			expect(q).toContain(field);
		}
	});

	it("sellers: real pipeline, Integrity 9 call dated, Zubie Five answers honest", async () => {
		const data = await getSellersOverview(makePipelineDb(SELLER_SEED, PARTNER_SEED));
		const i9 = data.sellers.find((s) => s.company === "Integrity 9");
		expect(i9?.next_date).toBe("2026-09-25");
		expect(i9?.stage).toBe("Meeting confirmed");
		expect(data.zubie_five_answers).toHaveLength(3);
		const groups = data.zubie_five_answers[0];
		expect(groups.answer).toMatch(/not yet tracked/i);
		const brands = data.zubie_five_answers[2];
		expect(brands.answer).toMatch(/no signed brand relationships/i);
	});


// Fake D1 with working bind/first/run for stage-update tests.
function makeStageDb(rows: Array<Record<string, unknown>>) {
	const api: Record<string, unknown> = {};
	let args: unknown[] = [];
	api.bind = (...a: unknown[]) => { args = a; return api; };
	api.all = async () => ({ results: rows });
	api.first = async () => {
		const id = args[0] as string;
		return rows.find((r) => r.id === id) ?? null;
	};
	api.run = async () => {
		const [stage, , , id] = args as string[];
		const row = rows.find((r) => r.id === id);
		if (row) row.stage = stage;
		return {};
	};
	return { prepare: (_sql: string) => api } as never;
}

	it("grants compliance: snapshot math is honest", () => {
		const base = { available: true, date_range: "2026-09-20 to 2026-09-27", campaigns: [] };
		const empty = buildGrantsCompliance(base);
		expect(empty.status).toBe("unavailable");
		const ok = buildGrantsCompliance({ ...base, campaigns: [
			{ id: "1", name: "A", impressions: 1000, clicks: 60 },
			{ id: "2", name: "B", impressions: 1000, clicks: 40 },
		] });
		expect(ok.status).toBe("ok");
		expect(ok.account_ctr).toBeCloseTo(0.05, 5);
		expect(ok.campaigns[1].below_threshold).toBe(true);
		const risk = buildGrantsCompliance({ ...base, campaigns: [
			{ id: "1", name: "A", impressions: 1000, clicks: 20 },
		] });
		expect(risk.status).toBe("at_risk");
		const notAvail = buildGrantsCompliance({ ...base, available: false });
		expect(notAvail.status).toBe("unavailable");
		expect(notAvail.note).toMatch(/no live campaign data/i);
	});

	it("sellers: stage update writes through to D1", async () => {
		const rows = SELLER_SEED.map((r) => ({ ...r }));
		const db = makeStageDb(rows);
		const okRes = await updateSellerStage(db, "zubie-five", "Call booked");
		expect(okRes.ok).toBe(true);
		expect(rows.find((r) => r.id === "zubie-five")?.stage).toBe("Call booked");
		const missing = await updateSellerStage(db, "nope", "X");
		expect(missing.ok).toBe(false);
		const empty = await updateSellerStage(db, "zubie-five", "  ");
		expect(empty.ok).toBe(false);
	});

	it("partners: stage update writes through to D1", async () => {
		const rows = PARTNER_SEED.map((r) => ({ ...r }));
		const db = makeStageDb(rows);
		const okRes = await updatePartnerStage(db, "aarp", "Recipient identified");
		expect(okRes.ok).toBe(true);
		expect(rows.find((r) => r.id === "aarp")?.stage).toBe("Recipient identified");
		const missing = await updatePartnerStage(db, "nope", "X");
		expect(missing.ok).toBe(false);
	});

	it("partners: real registry entries only (AARP draft)", async () => {
		const data = await getPartnersOverview(makePipelineDb(SELLER_SEED, PARTNER_SEED));
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

	it("meetings: two real external entries, Integrity 9 done (date passed) with owner-gated join data", async () => {
		const fakeDb = {
			prepare: () => ({
				all: async () => ({ results: [] }),
			}),
		};
		const data = await getMeetingsOverview(fakeDb as never);
		expect(data.ok).toBe(true);
		expect(data.external_meetings).toHaveLength(2);
		const i9 = data.external_meetings.find((m) => m.id === "integrity9-2026-09-25");
		expect(i9?.status).toBe("done");
		expect(i9?.display_when).toContain("2026-09-25");
		expect(i9?.join_url).toContain("teams.microsoft.com");
		expect(i9?.join_access).toContain("LC7pm2C9");
		const zubie = data.external_meetings.find((m) => m.id === "zubie-five-intro");
		expect(zubie?.status).toBe("awaiting scheduling");
		// Board log empty in tests: honest empty states, no fabrication.
		expect(data.board_upcoming).toHaveLength(0);
		expect(data.board_past).toHaveLength(0);
	});
});

describe("reports (ADR-0027/0028): external-safe HTML documents", () => {
	// ADR-0029: the ads report is built from the real Google Ads state via
	// an injected reader, so report tests never call Google.
	const connectedAdsReader = async () => ({
		ok: true,
		connected: true,
		configured: true,
		access_level: "EXPLORER" as const,
		customers: ["customers/6758500147"],
		execution_allowed: false as const,
	});
	const cases: Array<[string, () => string | Promise<string>]> = [
		["sites", () => buildSitesReport(getSitesOverview())],
		["social", () => buildSocialReport(getSocialOverview())],
		["ads", async () => buildAdsReport(await getAdsOverview({} as GoogleAdsEnv, connectedAdsReader, async () => ({
			ok: true,
			customer_id: "6758500147",
			date_range: "2026-08-26 to 2026-09-23",
			campaigns: [
				{ id: "111", name: "NWANA 5K race, September 27", status: "ENABLED", daily_budget_usd: 10.97, impressions: 120, clicks: 9, conversions: 0, cost_usd: 122.89 },
			],
		})))],
		["sellers", async () => buildSellersReport(await getSellersOverview(makePipelineDb(SELLER_SEED, PARTNER_SEED)))],
		["partners", async () => buildPartnersReport(await getPartnersOverview(makePipelineDb(SELLER_SEED, PARTNER_SEED)))],
		["groups", () => buildGroupsReport(getGroupsOverview())],
		[
			"meetings",
			() =>
				buildMeetingsReport({
					ok: true,
					generated_at: new Date().toISOString(),
					external_meetings: [
						{
							id: "integrity9-2026-09-25",
							title: "Integrity 9 — exclusive sponsorship seller discussion",
							counterparty: "Integrity 9 · David Hayob, Chief Revenue Officer",
							display_when: "Fri 2026-09-25, 2:00-3:00pm CT (3:00-4:00pm ET, 10:00-11:00pm Riga)",
							location: "Microsoft Teams",
							purpose: "Discuss an exclusive sponsorship seller partnership.",
							status: "confirmed",
							next_step: null,
							join_url: "https://teams.microsoft.com/meet/214553368452049?p=YT6qRnvYGwa2tq3PU9",
							join_access: "Meeting ID 214 553 368 452 049 · Passcode LC7pm2C9",
						},
					],
					board_upcoming: [],
					board_past: [],
				}),
		],
	];

	it("REPORT_SCREENS covers all 9 screens with page and report paths", () => {
		expect(REPORT_SCREENS).toHaveLength(9);
		for (const s of REPORT_SCREENS) {
			expect(s.reportPath).toBe(`/api/operating-center/report/${s.id}`);
			expect(s.path).toBe(`/operating-center/${s.id}`);
		}
	});

	for (const [id, build] of cases) {
		it(`${id} report: dated, styled, print-friendly, external-safe`, async () => {
			const html = await build();
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

	it("sellers report answers what Zubie Five asked", async () => {
		const html = buildSellersReport(await getSellersOverview(makePipelineDb(SELLER_SEED, PARTNER_SEED)));
		expect(html).toContain("Integrity 9");
		expect(html).toContain("2026-09-25");
		expect(html).toMatch(/not yet tracked/i);
	});

	it("meetings report: dated, print-friendly, excludes join links/IDs/passcodes", async () => {
		const fakeDb = {
			prepare: () => ({
				all: async () => ({ results: [] }),
			}),
		};
		const data = await getMeetingsOverview(fakeDb as never);
		const html = buildMeetingsReport(data);
		expect(html).toContain("<!doctype html>");
		expect(html).toContain("Report date:");
		expect(html).toContain("@media print");
		expect(html).toContain("Integrity 9");
		expect(html).toContain("Zubie Five");
		expect(html).toContain("No board meetings recorded yet");
		// Join data stays on the owner-gated screen only.
		expect(html).not.toContain("teams.microsoft.com");
		expect(html).not.toContain("LC7pm2C9");
		expect(html).not.toContain("214 553 368 452 049");
		expect(html).not.toContain("zubiefive.com/meet");
		expect(html).not.toContain("owner_key");
		expect(html).not.toContain("Bearer");
		expect(html).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
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
