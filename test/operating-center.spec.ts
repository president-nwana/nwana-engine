import { describe, expect, it } from "vitest";
import {
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

describe("operating center page", () => {
	it("contains initiative and Board entry points", () => {
		const html = renderOperatingCenterHtml();
		expect(html).toContain("Submit an initiative");
		expect(html).toContain("Add a Board item");
		expect(html).toContain("REQUEST_TO_SPEAK");
		expect(html).toContain("/api/operating-center/overview");
	});
});
