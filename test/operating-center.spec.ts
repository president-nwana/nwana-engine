import { describe, expect, it } from "vitest";
import {
	extractOperatingCenterKey,
	findNextBoardMeetingId,
	isOperatingCenterAuthorized,
	operatingCenterMenu,
	renderOperatingCenterHtml,
	renderRaceResultsHtml,
	validateBoardSubmissionInput,
	validateInitiativeInput,
} from "../src/operating-center";
import { renderBoardHtml } from "../src/operating-center-board";
import { renderUploadsHtml } from "../src/operating-center-uploads";

describe("operating center initiative intake", () => {
	it("normalizes a source-material initiative without inventing an outcome", () => {
		expect(validateInitiativeInput({
			input_type: "source_material",
			title: " DMV Programs ",
			description: "Analyze the dormant regional plan.",
			submitted_by: "Albert",
			source_filename: "DMV Programs.docx",
		})).toEqual({
			input_type: "SOURCE_MATERIAL",
			title: "DMV Programs",
			description: "Analyze the dormant regional plan.",
			desired_result: null,
			submitted_by: "Albert",
			source_filename: "DMV Programs.docx",
		});
	});

	it("rejects an empty initiative", () => {
		expect(() => validateInitiativeInput({ input_type: "THOUGHT" })).toThrow(
			"Initiative title is required",
		);
	});
});

describe("Board submission intake", () => {
	it("accepts a Board member request to speak without a meeting date", () => {
		expect(validateBoardSubmissionInput({
			submission_type: "request_to_speak",
			title: "Academy proposal",
			description: "I want to present an Academy proposal.",
			submitted_by: "Board Member",
		})).toMatchObject({
			submission_type: "REQUEST_TO_SPEAK",
			requested_meeting_date: null,
		});
	});

	it("requires an exact meeting date when one is supplied", () => {
		expect(() => validateBoardSubmissionInput({
			submission_type: "QUESTION",
			title: "Question",
			description: "Discuss this question.",
			submitted_by: "Board Member",
			requested_meeting_date: "next week",
		})).toThrow("YYYY-MM-DD");
	});

	it("accepts the merged intake types: initiative and the initiative-style inputs", () => {
		for (const submission_type of ["INITIATIVE", "THOUGHT", "PROBLEM", "OPPORTUNITY", "TASK", "SOURCE_MATERIAL"]) {
			expect(validateBoardSubmissionInput({
				submission_type,
				title: "Something for the Board",
				description: "Details here.",
				submitted_by: "Board Member",
			})).toMatchObject({ submission_type });
		}
	});
});

describe("next Board meeting lookup", () => {
	function stubDb(firstResult: { meeting_id: string } | null) {
		return {
			prepare(_sql: string) {
				return { first: async () => firstResult };
			},
		} as unknown as D1Database;
	}

	it("returns the nearest upcoming meeting id", async () => {
		expect(await findNextBoardMeetingId(stubDb({ meeting_id: "MEET-1" }))).toBe("MEET-1");
	});

	it("returns null when no Draft/Open meeting exists", async () => {
		expect(await findNextBoardMeetingId(stubDb(null))).toBeNull();
	});
});

describe("unified Board intake page", () => {
	// The full board workspace lives on /operating-center/board; the main
	// overview shows only a compact summary with a link.
	const boardHtml = renderBoardHtml();
	const mainHtml = renderOperatingCenterHtml();

	it("renders one Board intake form and no separate initiative form on the board page", () => {
		expect(boardHtml).toContain('id="board-form"');
		expect(boardHtml).not.toContain('id="initiative-form"');
		expect(boardHtml).not.toContain('id="initiatives"');
	});

	it("offers INITIATIVE as one of the item types", () => {
		expect(boardHtml).toContain("<option>INITIATIVE</option>");
	});

	it("shows the next-meeting card above the meetings list on the board page", () => {
		const nextPos = boardHtml.indexOf('id="next-meeting"');
		const listPos = boardHtml.indexOf('id="meetings"');
		expect(nextPos).toBeGreaterThan(-1);
		expect(listPos).toBeGreaterThan(-1);
		expect(nextPos).toBeLessThan(listPos);
	});

	it("places the create-meeting form below the meetings list on the board page", () => {
		const listPos = boardHtml.indexOf('id="meetings"');
		const formPos = boardHtml.indexOf('id="meeting-create-form"');
		expect(formPos).toBeGreaterThan(-1);
		expect(formPos).toBeGreaterThan(listPos);
	});

	it("keeps only a compact board summary on the main page, with a link to the workspace", () => {
		expect(mainHtml).toContain('id="board-summary"');
		expect(mainHtml).toContain('href="/operating-center/board"');
		expect(mainHtml).not.toContain('id="board-form"');
		expect(mainHtml).not.toContain('id="meeting-create-form"');
	});

	it("keeps only a compact uploads summary on the main page, with a link to the uploads page", () => {
		expect(mainHtml).toContain('id="uploads-summary"');
		expect(mainHtml).toContain('href="/operating-center/uploads"');
		expect(mainHtml).not.toContain('id="upload-form"');
	});

	it("embeds syntactically valid JavaScript on the board page", () => {
		const scripts = [...boardHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});

	it("embeds syntactically valid JavaScript on the uploads page", () => {
		const html = renderUploadsHtml();
		const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});

describe("operating center access protection", () => {
	const key = "owner-key-123";

	it("accepts the key from the Authorization header", () => {
		const request = new Request("https://example.com/api/initiatives", {
			headers: { authorization: "Bearer owner-key-123" },
		});
		expect(isOperatingCenterAuthorized(request, key)).toBe(true);
	});

	it("accepts the key from the query parameter", () => {
		const request = new Request("https://example.com/api/initiatives?key=owner-key-123");
		expect(extractOperatingCenterKey(request)).toBe("owner-key-123");
		expect(isOperatingCenterAuthorized(request, key)).toBe(true);
	});

	it("rejects a wrong key, a missing key, and a missing configured key", () => {
		const wrong = new Request("https://example.com/api/initiatives", {
			headers: { authorization: "Bearer wrong-key" },
		});
		const missing = new Request("https://example.com/api/initiatives");
		expect(isOperatingCenterAuthorized(wrong, key)).toBe(false);
		expect(isOperatingCenterAuthorized(missing, key)).toBe(false);
		expect(isOperatingCenterAuthorized(missing, undefined)).toBe(false);
	});

	it("serves a key entry gate on the page", () => {
		const html = renderOperatingCenterHtml();
		expect(html).toContain("Operating center key");
		expect(html).toContain("nwana_operating_center_key");
	});
});

describe("operating center main page client script", () => {
	it("embeds syntactically valid JavaScript so the page can boot (regression: ADR-0022 stray brace blanked the page)", () => {
		const html = renderOperatingCenterHtml();
		const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});

function extractScripts(html: string): string[] {
	return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

describe("operating center button menu (ADR-0023)", () => {
	it("renders the same three-button menu under the header on all pages", () => {
		for (const html of [renderOperatingCenterHtml(), renderRaceResultsHtml()]) {
			expect(html).toContain('class="oc-menu"');
			expect(html).toContain('href="/operating-center"');
			expect(html).toContain('href="/operating-center/results"');
			expect(html).toContain('href="/operating-center/funds"');
			expect(html).toContain(">Overview<");
			expect(html).toContain(">Results<");
			expect(html).toContain(">Funds<");
		}
	});

	it("marks the current page on the menu", () => {
		expect(operatingCenterMenu("overview")).toContain('href="/operating-center" aria-current="page"');
		expect(operatingCenterMenu("results")).toContain('href="/operating-center/results" aria-current="page"');
		expect(operatingCenterMenu("funds")).toContain('href="/operating-center/funds" aria-current="page"');
	});

	it("sits directly under the header", () => {
		const html = renderOperatingCenterHtml();
		expect(html).toMatch(/<\/header>\s*<nav class="oc-menu"/);
	});
});

describe("operating center main page lifecycle summary card (ADR-0023)", () => {
	it("shows a compact summary card linking to the results page instead of inline rows", () => {
		const html = renderOperatingCenterHtml();
		expect(html).toContain('id="lifecycle-panel"');
		expect(html).toContain('id="lifecycle-summary"');
		expect(html).toContain('href="/operating-center/results"');
		expect(html).not.toContain('id="lifecycle"');
		expect(html).not.toContain("Confirm prep");
	});
});

describe("operating center results page lifecycle (ADR-0023)", () => {
	it("carries the full per-distance lifecycle rows with working action buttons", () => {
		const html = renderRaceResultsHtml();
		expect(html).toContain('id="lifecycle"');
		expect(html).toContain('id="lifecycle-message"');
		expect(html).toContain("Series 2026 race lifecycle");
		expect(html).toContain("Confirm prep");
		expect(html).toContain("/api/operating-center/race-lifecycle/prep-confirm");
		expect(html).toContain("/api/operating-center/race-lifecycle");
	});

	it("embeds syntactically valid JavaScript (regression convention: inline JS in template literals)", () => {
		const scripts = extractScripts(renderRaceResultsHtml());
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
