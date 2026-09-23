import { describe, expect, it } from "vitest";
import {
	operatingCenterMenu,
	renderOperatingCenterHtml,
	renderRaceResultsHtml,
} from "../src/operating-center";
import { renderSponsorshipHtml } from "../src/operating-center-sponsorship";
import { renderActivityHtml } from "../src/operating-center-activity";

function extractScripts(html: string): string[] {
	return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

const ALL_PAGES: Array<[string, string, string]> = [
	["overview", "Overview", "/operating-center"],
	["results", "Results", "/operating-center/results"],
	["funds", "Funds", "/operating-center/funds"],
	["media", "Media", "/operating-center/media"],
	["board", "Board", "/operating-center/board"],
	["uploads", "Uploads", "/operating-center/uploads"],
	["sponsorship", "Sponsorship", "/operating-center/sponsorship"],
	["activity", "Activity", "/operating-center/activity"],
];

describe("operating center button menu (ADR-0026): one screen per panel", () => {
	it("lists a button for every operating-center page", () => {
		const menu = operatingCenterMenu("overview");
		for (const [, label, href] of ALL_PAGES) {
			expect(menu).toContain(`href="${href}"`);
			expect(menu).toContain(`>${label}<`);
		}
	});

	it("marks the current page with aria-current on every page", () => {
		for (const [id, , href] of ALL_PAGES) {
			expect(operatingCenterMenu(id as never)).toContain(
				`href="${href}" aria-current="page"`,
			);
		}
	});

	it("renders the menu directly under the header on every page", () => {
		for (const html of [
			renderOperatingCenterHtml(),
			renderRaceResultsHtml(),
			renderSponsorshipHtml(),
			renderActivityHtml(),
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

describe("operating center sponsorship page (ADR-0026)", () => {
	const html = renderSponsorshipHtml();

	it("carries the full generate form and asset list with stage advancement", () => {
		expect(html).toContain('id="sponsorship-generate-form"');
		expect(html).toContain('id="sponsorship-assets"');
		expect(html).toContain("/api/operating-center/sponsorship-assets/generate");
		expect(html).toContain("/api/operating-center/sponsorship-assets/advance");
		expect(html).toContain("Move to ");
		expect(html).toContain("<h1>Sponsorship assets</h1>");
	});

	it("marks itself current in the menu", () => {
		expect(html).toContain('href="/operating-center/sponsorship" aria-current="page"');
	});

	it("embeds syntactically valid JavaScript (regression convention)", () => {
		const scripts = extractScripts(html);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});

describe("operating center activity page (ADR-0026)", () => {
	const html = renderActivityHtml();

	it("carries the full feed with requires-reading and mark-as-read", () => {
		expect(html).toContain('id="activity-reading"');
		expect(html).toContain('id="activity-new"');
		expect(html).toContain("Mark as read");
		expect(html).toContain("/api/operating-center/activity");
		expect(html).toContain("/api/operating-center/activity/acknowledge");
	});

	it("marks itself current in the menu", () => {
		expect(html).toContain('href="/operating-center/activity" aria-current="page"');
	});

	it("embeds syntactically valid JavaScript (regression convention)", () => {
		const scripts = extractScripts(html);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
