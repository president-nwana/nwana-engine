import { describe, expect, it } from "vitest";
import { applySeries2026PublicationHistory, buildSeries2026PublicationDraft } from "../src/series-2026-results";

const source = {
	distance: "5K",
	raceId: 209477,
	raceSeriesId: 1439,
	raceSeriesYearId: 2102,
};

describe("Series 2026 result publication handoff", () => {
	it("creates a review-only draft from finalized RunSignup results", () => {
		const draft = buildSeries2026PublicationDraft({
			source,
			eventId: 123,
			eventName: "September 5K",
			resultSetId: 456,
			resultsPageUrl: "https://runsignup.com/Race/NWANAOpen5K/Results",
			resultSet: {
				results_headers: {
					"custom-field-10": "Performance Level",
					"custom-field-11": "Level Place",
				},
				results: [{
					result_id: 99,
					first_name: "Alex",
					last_name: "Walker",
					gender: "M",
					chip_time: "00:32:00",
					"custom-field-10": "Elite (< 33:00)",
					"custom-field-11": "1",
				}],
			},
		});

		expect(draft).toMatchObject({
			publication_key: "runsignup:series-2026:209477:123:456",
			status: "DRAFT",
			mode: "PLAN_ONLY",
			execution_allowed: false,
			requires_review: true,
			ready_for_editorial_review: true,
			verification: {
				result_count: 1,
				all_results_finalized: true,
			},
		});
		expect(draft.content.results[0]).toMatchObject({
			athlete: "Alex Walker",
			performance_level: "Elite (< 33:00)",
			level_place: "1",
		});
		expect(draft.editorial_draft).toMatchObject({
			status: "DRAFT",
			link_url: "https://runsignup.com/Race/NWANAOpen5K/Results",
			winner_count: 1,
			ready_for_approval: true,
			blocking_reasons: [],
		});
		expect(draft.editorial_draft.post_text).toContain(
			"Elite (< 33:00) — Men: Alex Walker — 00:32:00",
		);
	});

	it("does not mark unprocessed results ready", () => {
		const draft = buildSeries2026PublicationDraft({
			source,
			eventId: 123,
			eventName: null,
			resultSetId: 456,
			resultSet: {
				results_headers: {},
				results: [{ first_name: "Alex", last_name: "Walker", chip_time: "00:32:00" }],
			},
		});

		expect(draft.ready_for_editorial_review).toBe(false);
		expect(draft.execution_allowed).toBe(false);
		expect(draft.editorial_draft).toMatchObject({
			ready_for_approval: false,
			blocking_reasons: ["RESULTS_NOT_FINALIZED", "RESULTS_URL_REQUIRED"],
		});
		expect(draft.verification).toMatchObject({
			performance_level_field_found: false,
			level_place_field_found: false,
			all_results_finalized: false,
		});
	});
	it("excludes the accepted legacy baseline from future publication", () => {
		const draft = buildSeries2026PublicationDraft({
			source,
			eventId: 123,
			eventName: "September 5K",
			resultSetId: 456,
			resultSet: {
				results_headers: {
					"custom-field-10": "Performance Level",
					"custom-field-11": "Level Place",
				},
				results: [{
					first_name: "Alex",
					last_name: "Walker",
					"custom-field-10": "Elite (< 33:00)",
					"custom-field-11": "1",
				}],
			},
		});
		const [historical] = applySeries2026PublicationHistory(
			[draft],
			new Set([draft.publication_key]),
		);

		expect(historical).toMatchObject({
			publication_status: "LEGACY_BASELINE",
			publication_required: false,
			execution_allowed: false,
		});
	});
});
