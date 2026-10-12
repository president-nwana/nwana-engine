// Form-type allowlist tests. Guards the silent-drop bug class:
// POST /api/challenge/v1/forms/<type> must accept every type the
// charity worker can submit (2026-10-08: umbrella intent-forms were
// 400-rejected while the worker showed ok:true).

import { describe, expect, it } from "vitest";
import { VALID_FORM_TYPES } from "../src/form-types";

describe("VALID_FORM_TYPES", () => {
	it("includes the original four types", () => {
		for (const t of ["contact", "organization", "sponsor", "partner"]) {
			expect(VALID_FORM_TYPES).toContain(t);
		}
	});
	it("includes the umbrella intent-form types", () => {
		for (const t of ["umbrella", "miles-campaign", "sponsor-miles"]) {
			expect(VALID_FORM_TYPES).toContain(t);
		}
	});
	it("has no duplicates", () => {
		const set = new Set(VALID_FORM_TYPES);
		expect(set.size).toBe(VALID_FORM_TYPES.length);
	});
});
