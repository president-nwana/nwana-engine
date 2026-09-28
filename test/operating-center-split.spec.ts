import { describe, expect, it } from "vitest";
import {
	operatingCenterMenu,
	renderOperatingCenterHtml,
} from "../src/operating-center";
import { renderOverviewSectionHtml } from "../src/oc-overview";
import { renderGrowthSectionHtml } from "../src/oc-growth";
import { renderOperationsSectionHtml } from "../src/oc-operations";

function extractScripts(html: string): string[] {
	return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

const SEVEN_SECTIONS: Array<[string, string, string]> = [
	["overview", "Overview", "/operating-center"],
	["marketing", "Marketing", "/operating-center/marketing"],
	["growth", "Growth", "/operating-center/growth"],
	["sport", "Sport", "/operating-center/sport"],
	["academy", "Academy", "/operating-center/academy"],
	["board", "Board", "/operating-center/board"],
	["operations", "Operations", "/operating-center/operations"],
];

describe("operating center button menu (rebuild 2026-09-28): 7 sections", () => {
	it("lists a button for every section", () => {
		const menu = operatingCenterMenu("overview");
		for (const [, label, href] of SEVEN_SECTIONS) {
			expect(menu).toContain(`href="${href}"`);
			expect(menu).toContain(`>${label}<`);
		}
	});

	it("marks the current section with aria-current on every section", () => {
		for (const [id, , href] of SEVEN_SECTIONS) {
			expect(operatingCenterMenu(id)).toContain(
				`href="${href}" aria-current="page"`,
			);
		}
	});

	it("renders the menu directly under the header on every section page", () => {
		for (const html of [
			renderOverviewSectionHtml(),
			renderGrowthSectionHtml(),
			renderOperationsSectionHtml(),
		]) {
			expect(html).toMatch(/<\/header>\s*<nav class="oc-menu"/);
		}
	});
});

describe("operating center main page (ADR-0026): dashboard of summary cards", () => {
	const html = renderOperatingCenterHtml();

	it("keeps only a compact activity summary card linking to the activity page", () => {
		expect(html).toContain('id="activity-summary"');
		expect(html).toContain('href="/operating-center/activity"');
		expect(html).not.toContain('id="activity-reading"');
		expect(html).not.toContain('id="activity-new"');
		expect(html).not.toContain("Mark as read");
	});

	it("keeps only a compact sponsorship summary card linking to the sponsorship page", () => {
		expect(html).toContain('id="sponsorship-summary"');
		expect(html).toContain('href="/operating-center/sponsorship"');
		expect(html).not.toContain('id="sponsorship-generate-form"');
		expect(html).not.toContain('id="sponsorship-assets"');
	});

	it("embeds syntactically valid JavaScript (regression convention)", () => {
		const scripts = extractScripts(html);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});

describe("operating center sponsorship in the Growth section (rebuild 2026-09-28)", () => {
	const html = renderGrowthSectionHtml();

	it("carries the sponsorship tab with the generate form and asset list with stage advancement", () => {
		expect(html).toContain('data-tab="sponsorship"');
		expect(html).toContain('id="sponsorship-generate-form"');
		expect(html).toContain('id="sponsorship-det"');
		expect(html).toContain('data-viewpanel="actions" data-func="sponsorship"');
		expect(html).toContain("/api/operating-center/sponsorship-assets/generate");
		expect(html).toContain("/api/operating-center/sponsorship-assets/advance");
		expect(html).toContain("Move to ");
	});

	it("marks Growth current in the menu", () => {
		expect(html).toContain('href="/operating-center/growth" aria-current="page"');
	});

	it("embeds syntactically valid JavaScript (regression convention)", () => {
		const scripts = extractScripts(html);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});

describe("operating center activity in the Operations section (rebuild 2026-09-28)", () => {
	const html = renderOperationsSectionHtml();

	it("carries the activity tab with the full feed with requires-reading and mark-as-read", () => {
		expect(html).toContain('data-tab="activity"');
		expect(html).toContain('id="ops-act-reading"');
		expect(html).toContain('id="ops-act-new"');
		expect(html).toContain("Mark as read");
		expect(html).toContain("/api/operating-center/activity");
		expect(html).toContain("/api/operating-center/activity/acknowledge");
	});

	it("marks Operations current in the menu", () => {
		expect(html).toContain('href="/operating-center/operations" aria-current="page"');
	});

	it("embeds syntactically valid JavaScript (regression convention)", () => {
		const scripts = extractScripts(html);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
