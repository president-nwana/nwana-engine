import { describe, expect, it } from "vitest";
import { renderGrowthSectionHtml } from "../src/oc-growth";

// Growth contract: 6 functions, each with a short description and three
// separate Summary / Actions / Details views (one visible at a time),
// deep-linkable via ?tab=<function>&view=<summary|actions|details>.

const FUNCTIONS = [
	"sponsorship",
	"fundraising",
	"sellers",
	"partners",
	"funds",
	"igf",
];

describe("operating center growth: Summary/Actions/Details", () => {
	const html = renderGrowthSectionHtml();

	it("renders six function tabs", () => {
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
			for (const view of ["summary", "actions", "details"]) {
				expect(html).toContain(`data-viewpanel="${view}" data-func="${f}"`);
			}
		}
		// Exactly 3 buttons per function (data-view="…"), nothing else reuses
		// that attribute.
		const buttons = html.match(/data-view="/g) || [];
		expect(buttons.length).toBe(FUNCTIONS.length * 3);
		for (const view of ["summary", "actions", "details"]) {
			expect(html).toContain(`data-view="${view}"`);
		}
	});

	it("shows only one view at a time (actions+details panels start hidden)", () => {
		const hiddenActions = html.match(/data-viewpanel="actions"[^>]*hidden/g) || [];
		const hiddenDetails = html.match(/data-viewpanel="details"[^>]*hidden/g) || [];
		expect(hiddenActions.length).toBe(FUNCTIONS.length);
		expect(hiddenDetails.length).toBe(FUNCTIONS.length);
	});

	it("addresses tabs and views by the tab and view query parameters", () => {
		expect(html).toContain("new URLSearchParams(location.search).get('tab')");
		expect(html).toContain("new URLSearchParams(location.search).get('view')");
	});

	it("contains no Cyrillic text", () => {
		expect(html).not.toMatch(/[А-Яа-яЁё]/);
	});

	it("keeps fundraising and sponsorship separate", () => {
		// Sponsorship description never mentions fundraising as its own process,
		// and the funds description states the separation explicitly.
		expect(html).toContain("Separate from fundraising");
		expect(html).toContain("never merged");
	});
});
