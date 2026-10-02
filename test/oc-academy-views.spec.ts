import { describe, expect, it } from "vitest";
import { renderAcademySectionHtml } from "../src/oc-academy";

// Academy contract (2026-10-02 cleanup): a single honest Overview tab — the
// Academy (Moodle) is not connected, so eight empty "not connected" tabs
// were collapsed into one parked panel. No academy API routes exist and
// nothing is invented.

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

	it("lists what will live here once connected", () => {
		for (const word of ["Courses", "Students", "Certifications", "Instructor licenses", "Education partners"]) {
			expect(html).toContain(word);
		}
	});

	it("states the section is parked, not broken", () => {
		expect(html).toContain("not connected");
		expect(html).toContain("parked");
	});

	it("contains no Russian text", () => {
		expect(html).not.toMatch(/[А-Яа-яЁё]/);
	});

	it("mentions Moodle as the honest empty-state marker", () => {
		expect(html).toContain("Moodle");
	});
});
