import { describe, expect, it } from "vitest";
import {
	extractOperatingCenterKey,
	findNextBoardMeetingId,
	isOperatingCenterAuthorized,
	renderOperatingCenterHtml,
	validateBoardSubmissionInput,
	validateInitiativeInput,
} from "../src/operating-center";

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
	const html = renderOperatingCenterHtml();

	it("renders one Board intake form and no separate initiative form", () => {
		expect(html).toContain('id="board-form"');
		expect(html).not.toContain('id="initiative-form"');
		expect(html).not.toContain('id="initiatives"');
	});

	it("offers INITIATIVE as one of the item types", () => {
		expect(html).toContain("<option>INITIATIVE</option>");
	});

	it("shows the next-meeting card above the meetings list", () => {
		const nextPos = html.indexOf('id="next-meeting"');
		const listPos = html.indexOf('id="meetings"');
		expect(nextPos).toBeGreaterThan(-1);
		expect(listPos).toBeGreaterThan(-1);
		expect(nextPos).toBeLessThan(listPos);
	});

	it("places the create-meeting form below the meetings list", () => {
		const listPos = html.indexOf('id="meetings"');
		const formPos = html.indexOf('id="meeting-create-form"');
		expect(formPos).toBeGreaterThan(-1);
		expect(formPos).toBeGreaterThan(listPos);
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
