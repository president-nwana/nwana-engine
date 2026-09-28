import { describe, expect, it } from "vitest";
import { renderOperationsSectionHtml } from "../src/oc-operations";

// Operations contract: 3 functions (Activity / System state / Exceptions),
// each with a short description and three separate Summary / Actions /
// Details views (one visible at a time), deep-linkable via
// ?tab=<function>&view=<summary|actions|details>.

const FUNCTIONS = ["activity", "system", "exceptions"];

describe("operating center operations: Summary/Actions/Details", () => {
	const html = renderOperationsSectionHtml();

	it("renders three function tabs", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-tab="${f}"`);
		}
	});

	it("gives every function a short human description", () => {
		const descs = html.match(/class="oc-func-desc"/g) || [];
		expect(descs.length).toBe(FUNCTIONS.length);
	});

	it("gives every function three view buttons and three separate view panels", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-views="${f}"`);
			for (const view of ["summary", "actions", "details"]) {
				expect(html).toContain(`data-view="${view}"`);
				expect(html).toContain(`data-viewpanel="${view}"`);
			}
		}
		const buttons = html.match(/class="oc-view-btn/g) || [];
		// 3 per function (+ any oc-view-btn-styled links)
		expect(buttons.length).toBeGreaterThanOrEqual(FUNCTIONS.length * 3);
	});

	it("shows only one view at a time (actions and details start hidden)", () => {
		const hiddenActions = html.match(/data-viewpanel="actions"[^>]*hidden/g) || [];
		const hiddenDetails = html.match(/data-viewpanel="details"[^>]*hidden/g) || [];
		expect(hiddenActions.length).toBe(FUNCTIONS.length);
		expect(hiddenDetails.length).toBe(FUNCTIONS.length);
		// Summaries are visible.
		const summaryPanels = html.match(/data-viewpanel="summary"/g) || [];
		expect(summaryPanels.length).toBe(FUNCTIONS.length);
	});

	it("addresses tabs and views by query parameters", () => {
		expect(html).toContain("new URLSearchParams(location.search).get('tab')");
		expect(html).toContain("new URLSearchParams(location.search).get('view')");
	});

	it("keeps the report id on the system tab", () => {
		expect(html).toContain('data-screen="operations"');
	});

	it("wires the mark-as-read action to the acknowledge endpoint", () => {
		expect(html).toContain("/api/operating-center/activity/acknowledge");
	});

	it("renders the English Operations UI with no Cyrillic", () => {
		expect(html).not.toMatch(/[А-Яа-яЁё]/);
	});
});
