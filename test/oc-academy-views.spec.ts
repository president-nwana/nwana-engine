import { describe, expect, it } from "vitest";
import { renderAcademySectionHtml } from "../src/oc-academy";

// Academy contract: a single Overview tab. Phase 3 (TZ 5.12) replaced the
// old "not connected / parked" state: the Engine holds an Academy sync
// snapshot (academy_instructor_snapshot, fed by the Moodle read-only sync)
// and the tab renders its aggregates via
// /api/operating-center/education/overview. Aggregates only - individual
// records and names are never shown, and nothing is invented.

describe("operating center academy: Summary/Actions/Details", () => {
	const html = renderAcademySectionHtml();

	it("renders a single overview tab", () => {
		expect(html).toContain(`data-tab="overview"`);
		expect(html).not.toContain(`data-tab="courses"`);
		expect(html).not.toContain(`data-tab="promotion"`);
	});

	it("gives the overview a short human description", () => {
		const descs = html.match(/class="oc-func-desc"/g) || [];
		expect(descs.length).toBe(1);
	});

	it("gives the overview three visible view buttons", () => {
		expect(html).toContain(`data-views="overview"`);
		for (const view of ["summary", "actions", "details"]) {
			expect(html).toContain(`data-view="${view}"`);
			expect(html).toContain(`data-viewpanel="${view}"`);
		}
	});

	it("shows only one view at a time (others hidden)", () => {
		// Actions/details panels start hidden; summary is visible.
		const hiddenActions = html.match(/data-viewpanel="actions"[^>]*hidden/g) || [];
		const hiddenDetails = html.match(/data-viewpanel="details"[^>]*hidden/g) || [];
		expect(hiddenActions.length).toBe(1);
		expect(hiddenDetails.length).toBe(1);
	});

	it("addresses tabs by the tab query parameter", () => {
		expect(html).toContain("new URLSearchParams(location.search).get('tab')");
		expect(html).toContain("new URLSearchParams(location.search).get('view')");
	});

	it("shows live Academy aggregates from the sync snapshot", () => {
		for (const word of ["Students enrolled", "Certified instructors", "Last sync", "Students and certifications by course"]) {
			expect(html).toContain(word);
		}
		expect(html).toContain("/api/operating-center/education/overview");
	});

	it("states aggregates only, never individual records", () => {
		expect(html).toContain("Aggregates only");
		expect(html).toContain("never shown");
		expect(html).not.toContain("parked");
	});

	it("contains no Russian text", () => {
		expect(html).not.toMatch(/[А-Яа-яЁё]/);
	});

	it("mentions Moodle as the honest empty-state marker", () => {
		expect(html).toContain("Moodle");
	});
});
