import { describe, expect, it } from "vitest";
import { renderFundsHtml } from "../src/operating-center-funds";
import { renderOperatingCenterHtml } from "../src/operating-center";
import { renderGrowthSectionHtml } from "../src/oc-growth";

describe("funds dedicated page (ADR-0022)", () => {
	it("renders a standalone English funds page with the full pipeline UI", () => {
		const html = renderFundsHtml();
		expect(html).toContain("<title>Funds — NWANA Operating Center</title>");
		expect(html).toContain('id="funds"');
		expect(html).not.toContain('id="key-form"');
		expect(html).toContain('href="/login"');
		expect(html).toContain('href="/operating-center"');
		expect(html).toContain("Move to ");
		expect(html).toContain("/api/operating-center/fund/prospect/advance");
		expect(html).toContain("/api/operating-center/fund");
		expect(html).not.toContain("Открыть");
	});

	it("carries the same session storage as the main operating center (no owner-key gate)", () => {
		const funds = renderFundsHtml();
		const main = renderOperatingCenterHtml();
		expect(funds).toContain("nwana_engine_session");
		expect(main).toContain("nwana_engine_session");
		expect(funds).not.toContain("nwana_operating_center_key");
		expect(main).not.toContain("nwana_operating_center_key");
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

describe("funds in the Growth section (rebuild 2026-09-28)", () => {
	it("renders the shared seven-button menu under the header", () => {
		const html = renderGrowthSectionHtml();
		expect(html).toMatch(/<\/header>\s*<nav class="oc-menu"/);
		expect(html).toContain('href="/operating-center"');
		expect(html).toContain('href="/operating-center/growth" aria-current="page"');
	});

	it("keeps the funds prospect pipeline and Instructor Growth Fund tabs (money detail loads from the fund API)", () => {
		const html = renderGrowthSectionHtml();
		expect(html).toContain('data-tab="funds"');
		expect(html).toContain('data-tab="igf"');
		expect(html).toContain("/api/operating-center/fund");
		expect(html).toContain("/api/operating-center/fund/prospect/advance");
	});

	it("embeds syntactically valid JavaScript (regression convention: inline JS in template literals)", () => {
		const html = renderGrowthSectionHtml();
		const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
