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
