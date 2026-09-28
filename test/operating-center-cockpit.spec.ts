import { describe, expect, it } from "vitest";
import { renderOverviewSectionHtml } from "../src/oc-overview";

// Executive contract: /operating-center is the executive summary of the whole
// system. The old cockpit dashboard of 15 cards was retired when Overview
// became a 4-function section (State / Money / Work / Blockers) with the
// approved Summary / Actions / Details pattern. Every number is read from a
// live API; none is hardcoded into the page.

const OVERVIEW_FUNCTIONS: Array<[string, string]> = [
	["state", "State"],
	["money", "Money"],
	["work", "Work"],
	["blockers", "Blockers"],
];

const LIVE_ENDPOINTS = [
	"/api/operating-center/overview",
	"/api/operating-center/fund",
	"/api/operating-center/fundraising/overview",
	"/api/operating-center/social/overview",
	"/api/operating-center/ads/overview",
	"/api/operating-center/media/overview",
	"/api/operating-center/race-lifecycle",
	"/api/operating-center/operations/overview",
	"/api/operating-center/activity",
	"/api/operating-center/analytics/traffic",
	"/api/board/submissions",
	"/api/board/meetings",
	"/api/board/work-items",
];

function extractScripts(html: string): string[] {
	return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

describe("operating center overview (executive summary contract)", () => {
	const html = renderOverviewSectionHtml();
	const scripts = extractScripts(html).join("\n");

	it("renders the four executive functions", () => {
		for (const [id, label] of OVERVIEW_FUNCTIONS) {
			expect(html).toContain(`data-tab="${id}"`);
			expect(html).toContain(`>${label}<`);
		}
	});

	it("gives every function the Summary / Actions / Details views", () => {
		for (const [id] of OVERVIEW_FUNCTIONS) {
			for (const view of ["summary", "actions", "details"]) {
				expect(html).toContain(
					`data-viewpanel="${view}" data-func="${id}"`,
				);
			}
		}
	});

	it("reads every executive number from a live API, not from the markup", () => {
		for (const endpoint of LIVE_ENDPOINTS) {
			expect(scripts).toContain(`'${endpoint}'`);
		}
	});

	it("routes cross-section action links to canonical tab views, not hashes", () => {
		expect(html).toContain("/operating-center/board?tab=board&view=actions");
		expect(html).toContain(
			"/operating-center/growth?tab=funds&view=actions",
		);
		expect(scripts).not.toContain("/operating-center/sport#results");
		expect(scripts).not.toContain("/operating-center/growth#funds");
	});

	it("carries no hardcoded connection or follower claims", () => {
		// These were once hardcoded into the page instead of read from the APIs.
		// The "Analytics: not connected" string still exists as a live-gated
		// fallback that the /api/operating-center/analytics/traffic fetch
		// replaces when the endpoint answers — that is honest, not hardcoded.
		expect(html).not.toContain(
			"Google Ads: <span class=\"unavailable\">not connected</span>",
		);
		expect(html).not.toContain("LinkedIn: 8 followers (observed 2026-09-22)");
	});

	it("embeds syntactically valid JavaScript", () => {
		const bodies = extractScripts(html);
		expect(bodies.length).toBeGreaterThan(0);
		for (const body of bodies) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
