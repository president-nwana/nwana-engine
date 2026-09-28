import { describe, expect, it } from "vitest";
import { renderBoardSectionHtml } from "../src/oc-board";

// Board contract: 5 functions, each with a short description and three
// separate Summary / Actions / Details views (one visible at a time),
// deep-linkable via ?tab=<function>&view=<summary|actions|details>.

const FUNCTIONS = ["board", "meetings", "uploads", "decisions", "workitems"];
const VIEWS = ["summary", "actions", "details"];

describe("operating center board: Summary/Actions/Details", () => {
	const html = renderBoardSectionHtml();

	it("renders five function tabs", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-tab="${f}"`);
		}
	});

	it("gives every function a short human description", () => {
		const descs = html.match(/class="oc-func-desc"/g) || [];
		expect(descs.length).toBe(FUNCTIONS.length);
	});

	it("gives every function three view buttons and three view panels", () => {
		for (const f of FUNCTIONS) {
			expect(html).toContain(`data-views="${f}"`);
		}
		const buttons = html.match(/class="oc-view-btn/g) || [];
		// 3 per function (action links use other classes)
		expect(buttons.length).toBe(FUNCTIONS.length * 3);
		for (const view of VIEWS) {
			expect(html).toContain(`data-view="${view}"`);
			expect(html).toContain(`data-viewpanel="${view}"`);
		}
		const panels = html.match(/data-viewpanel="(summary|actions|details)"/g) || [];
		expect(panels.length).toBe(FUNCTIONS.length * VIEWS.length);
	});

	it("shows only one view at a time (actions/details panels start hidden)", () => {
		const hiddenActions = html.match(/data-viewpanel="actions"[^>]*hidden/g) || [];
		const hiddenDetails = html.match(/data-viewpanel="details"[^>]*hidden/g) || [];
		expect(hiddenActions.length).toBe(FUNCTIONS.length);
		expect(hiddenDetails.length).toBe(FUNCTIONS.length);
	});

	it("addresses tabs and views by query parameters", () => {
		expect(html).toContain("new URLSearchParams(location.search).get('tab')");
		expect(html).toContain("new URLSearchParams(location.search).get('view')");
	});

	it("defines a lazy boot loader for every function and view", () => {
		for (const f of FUNCTIONS) {
			for (const v of VIEWS) {
				expect(html).toContain(`async function boot_${f}_${v}`);
			}
		}
		expect(html).toContain("function __boaSetView");
	});

	it("wires the meetings board-action link to the board function's Actions view", () => {
		expect(html).toContain("__boaSetView('board','actions',true)");
	});

	it("keeps the meetings download-report tab", () => {
		expect(html).toContain('data-screen="meetings"');
	});

	it("keeps every view loader in English (no Cyrillic)", () => {
		expect(html).not.toMatch(/[А-Яа-яЁё]/);
	});
});
