import { describe, expect, it } from "vitest";
import { renderOperatingCenterHtml } from "../src/operating-center";

// Cockpit contract: /operating-center is a compact live summary. Every card
// reads the same API endpoint its detail page uses, one section failure never
// breaks the rest, and no number is hardcoded into the page.

const COCKPIT_CARDS: Array<[string, string]> = [
	["lifecycle-summary", "/operating-center/results"],
	["fund-summary", "/operating-center/funds"],
	["sponsorship-summary", "/operating-center/sponsorship"],
	["ads-summary", "/operating-center/ads"],
	["social-summary", "/operating-center/social"],
	["media-summary", "/operating-center/media"],
	["partners-summary", "/operating-center/partners"],
	["sellers-summary", "/operating-center/sellers"],
	["fundraising-summary", "/operating-center/fundraising"],
	["groups-summary", "/operating-center/groups"],
	["sites-summary", "/operating-center/sites"],
	["board-summary", "/operating-center/board"],
	["meetings-summary", "/operating-center/meetings"],
	["activity-summary", "/operating-center/activity"],
	["operations-summary", "/operating-center/operations"],
];

const SECTION_ENDPOINTS = [
	"/api/operating-center/race-lifecycle",
	"/api/operating-center/fund",
	"/api/operating-center/sponsorship-assets",
	"/api/operating-center/ads/overview",
	"/api/operating-center/social/overview",
	"/api/operating-center/media/overview",
	"/api/operating-center/partners/overview",
	"/api/operating-center/sellers/overview",
	"/api/operating-center/fundraising/overview",
	"/api/operating-center/groups/overview",
	"/api/operating-center/sites/overview",
	"/api/operating-center/meetings/overview",
	"/api/board/meetings",
	"/api/board/submissions",
	"/api/board/work-items",
	"/api/operating-center/activity",
	"/api/operating-center/operations/overview",
];

function extractScripts(html: string): string[] {
	return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

describe("operating center cockpit", () => {
	const html = renderOperatingCenterHtml();
	const scripts = extractScripts(html).join("\n");

	it("renders a top owner summary strip", () => {
		expect(html).toContain('id="owner-summary"');
	});

	it("renders one compact card per section with a link to the detail page", () => {
		for (const [id, href] of COCKPIT_CARDS) {
			expect(html).toContain(`id="${id}"`);
			expect(html).toContain(`href="${href}"`);
		}
	});

	it("fetches every section from the same API its detail page uses", () => {
		for (const endpoint of SECTION_ENDPOINTS) {
			expect(scripts).toContain(`'${endpoint}'`);
		}
	});

	it("isolates section failures: one bad section cannot block the rest", () => {
		// Per-section try/catch around a single shared fetch loop.
		expect(scripts).toContain("Promise.all(SECTIONS.map");
		expect(scripts).toContain("try{D[s[0]]=await api(s[1])}catch");
		// No load path awaits one endpoint before the others start.
		expect(scripts).not.toContain("await api('/api/operating-center/overview'),api('/api/board/submissions')");
	});

	it("keeps the event-driven board protocol reconciliation trigger", () => {
		expect(scripts).toContain("api('/api/operating-center/overview').catch");
	});

	it("carries no hardcoded connection or follower claims", () => {
		// These were once hardcoded into the page instead of read from the APIs.
		expect(html).not.toContain("Google Ads: <span class=\"unavailable\">not connected</span>");
		expect(html).not.toContain("LinkedIn: 8 followers (observed 2026-09-22)");
		expect(html).not.toContain("Analytics: <span class=\"unavailable\">not connected</span>");
	});

	it("shows the real operations queue state from the operations reader", () => {
		expect(scripts).toContain("READY_TO_ACT");
		expect(scripts).toContain("NEEDS_OWNER_INPUT");
		expect(scripts).toContain("BLOCKED_EXTERNAL");
		expect(scripts).toContain("'/api/operating-center/operations/overview'");
	});

	it("embeds syntactically valid JavaScript", () => {
		const bodies = extractScripts(html);
		expect(bodies.length).toBeGreaterThan(0);
		for (const body of bodies) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
