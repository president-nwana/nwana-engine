import { describe, expect, it } from "vitest";
import { renderFundsHtml } from "../src/operating-center-funds";
import { renderOperatingCenterHtml } from "../src/operating-center";

describe("funds dedicated page (ADR-0022)", () => {
	it("renders a standalone English funds page with the full pipeline UI", () => {
		const html = renderFundsHtml();
		expect(html).toContain("<title>Funds — NWANA Operating Center</title>");
		expect(html).toContain('id="funds"');
		expect(html).toContain('id="key-form"');
		expect(html).toContain('href="/operating-center"');
		expect(html).toContain("Move to ");
		expect(html).toContain("/api/operating-center/fund/prospect/advance");
		expect(html).toContain("/api/operating-center/fund");
		expect(html).not.toContain("Открыть");
	});

	it("carries the same owner-key storage as the main operating center", () => {
		const funds = renderFundsHtml();
		const main = renderOperatingCenterHtml();
		expect(funds).toContain("nwana_operating_center_key");
		expect(main).toContain("nwana_operating_center_key");
	});
});

describe("operating center main page funds card (ADR-0022)", () => {
	it("shows a compact summary card linking to the funds page", () => {
		const html = renderOperatingCenterHtml();
		expect(html).toContain('id="fund-summary"');
		expect(html).toContain('href="/operating-center/funds"');
	});

	it("no longer renders the inline funds list on the main page", () => {
		const html = renderOperatingCenterHtml();
		expect(html).not.toContain('id="fund-panel"');
		expect(html).not.toContain('id="funds"');
		expect(html).not.toContain("fund-message");
	});
});

describe("funds page button menu and script (ADR-0023)", () => {
	it("renders the shared three-button menu under the header", () => {
		const html = renderFundsHtml();
		expect(html).toMatch(/<\/header>\s*<nav class="oc-menu"/);
		expect(html).toContain('href="/operating-center"');
		expect(html).toContain('href="/operating-center/results"');
		expect(html).toContain('href="/operating-center/funds" aria-current="page"');
	});

	it("embeds syntactically valid JavaScript (regression convention: inline JS in template literals)", () => {
		const html = renderFundsHtml();
		const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
