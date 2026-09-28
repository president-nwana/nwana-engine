import { describe, expect, it } from "vitest";
import { renderSportSectionHtml } from "../src/oc-sport";

// Sport contract: 5 functions, each with a short description and three
// separate Summary / Actions / Details views (one visible at a time),
// deep-linkable via ?tab=<function>&view=<summary|actions|details>.

const FUNCTIONS = ["results", "series", "challenges", "groups", "creation"];
const VIEWS = ["summary", "actions", "details"];

describe("operating center sport: Summary/Actions/Details", () => {
	const html = renderSportSectionHtml();

	it("renders five function tabs", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-tab="${f}"`);
		}
	});

	it("gives every function a short human description", () => {
		const descs = html.match(/class="oc-func-desc"/g) || [];
		expect(descs.length).toBe(FUNCTIONS.length);
	});

	it("gives every function three visible view buttons", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-views="${f}"`);
		}
		for (const view of VIEWS) {
			expect(html).toContain(`data-view="${view}"`);
			expect(html).toContain(`data-viewpanel="${view}"`);
		}
		const buttons = html.match(/class="oc-view-btn/g) || [];
		expect(buttons.length).toBeGreaterThanOrEqual(FUNCTIONS.length * 3);
	});

	it("gives every function three view panels (one per view)", () => {
		for (const f of FUNCTIONS) {
			for (const view of VIEWS) {
				expect(html).toContain(`data-viewpanel="${view}" data-func="${f}"`);
			}
		}
	});

	it("shows only one view at a time (actions and details start hidden)", () => {
		// Every actions/details panel starts hidden; summaries are visible.
		const hiddenActions = html.match(/data-viewpanel="actions"[^>]*hidden/g) || [];
		const hiddenDetails = html.match(/data-viewpanel="details"[^>]*hidden/g) || [];
		expect(hiddenActions.length).toBe(FUNCTIONS.length);
		expect(hiddenDetails.length).toBe(FUNCTIONS.length);
	});

	it("addresses tabs and views by the tab and view query parameters", () => {
		expect(html).toContain("new URLSearchParams(location.search).get('tab')");
		expect(html).toContain("new URLSearchParams(location.search).get('view')");
	});

	it("defines lazy view loaders for every function and view", () => {
		for (const f of FUNCTIONS) {
			for (const view of VIEWS) {
				expect(html).toContain(`function boot_${f}_${view}(`);
			}
		}
	});

	it("links packet details to the canonical creation actions URL", () => {
		expect(html).toContain("?tab=creation&view=actions&packet_id=");
		expect(html).not.toContain("/operating-center/sport?packet_id=");
	});

	it("wires the result-approval endpoint as the only standard owner action (ADR-0042)", () => {
		// Approval is the single owner decision per event; the Machine runs
		// levels, standings, publication, winner news, social, and next-race
		// promo by itself. No manual publish button remains in Actions.
		expect(html).toContain("/api/operating-center/series-2026/results/approve");
		expect(html).toContain("/api/operating-center/series-2026/results/pending");
		expect(html).toContain("confirm('Approve ");
		expect(html).not.toContain("race-lifecycle/apply-levels");
	});

	it("contains no Cyrillic", () => {
		const cyrillic = /[А-Яа-яЁё]/;
		expect(html).not.toMatch(cyrillic);
	});
});
