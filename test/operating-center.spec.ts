import { describe, expect, it } from "vitest";
import {
	extractOperatingCenterKey,
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
