import { describe, expect, it } from "vitest";
import { renderAcademySectionHtml } from "../src/oc-academy";

// Academy contract: 8 functions, each with a short description and three
// separate Summary / Actions / Details views (one visible at a time),
// deep-linkable via ?tab=<function>&view=<summary|actions|details>.
// Honest empty states everywhere: Moodle is not connected, no academy API
// routes exist — nothing is invented.

const FUNCTIONS = [
	"courses",
	"students",
	"certifications",
	"licenses",
	"edpartners",
	"academyops",
	"performance",
	"promotion",
];

describe("operating center academy: Summary/Actions/Details", () => {
	const html = renderAcademySectionHtml();

	it("renders eight function tabs", () => {
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
		for (const view of ["summary", "actions", "details"]) {
			expect(html).toContain(`data-view="${view}"`);
			expect(html).toContain(`data-viewpanel="${view}"`);
		}
	});

	it("shows only one view at a time (others hidden)", () => {
		// Every actions/details panel starts hidden; summaries are visible.
		const hiddenActions = html.match(/data-viewpanel="actions"[^>]*hidden/g) || [];
		const hiddenDetails = html.match(/data-viewpanel="details"[^>]*hidden/g) || [];
		expect(hiddenActions.length).toBe(FUNCTIONS.length);
		expect(hiddenDetails.length).toBe(FUNCTIONS.length);
	});

	it("addresses tabs by the tab query parameter", () => {
		expect(html).toContain("new URLSearchParams(location.search).get('tab')");
		expect(html).toContain("new URLSearchParams(location.search).get('view')");
	});

	it("links promotion to Marketing with canonical deep links", () => {
		for (const f of ["ads", "social", "media", "sites"]) {
			expect(html).toContain(`/operating-center/marketing?tab=${f}&view=summary`);
		}
	});

	it("shows the performance pipeline as operational outcome only (no money)", () => {
		const perfStart = html.indexOf('id="tabpanel-performance"');
		const perfEnd = html.indexOf('id="tabpanel-promotion"');
		const perf = html.slice(perfStart, perfEnd);
		expect(perf).toContain("no data yet");
		expect(perf).toContain("never money");
		expect(perf).toContain("Instructor Growth Fund");
	});

	it("contains no Russian text", () => {
		expect(html).not.toMatch(/[А-Яа-яЁё]/);
	});

	it("mentions Moodle as the honest empty-state marker", () => {
		expect(html).toContain("Moodle");
	});
});
