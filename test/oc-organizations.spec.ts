// Organizations OC pages: the three levels render the shared shell with
// the Organizations menu active and the data attributes the client script
// needs. Pure-function render tests — no D1, no network.

import { describe, expect, it } from "vitest";

import {
	renderBusinessUnitSectionHtml,
	renderOrganizationsSectionHtml,
	renderTenantSectionHtml,
} from "../src/oc-organizations";
import { operatingCenterMenu } from "../src/operating-center";

describe("organizations menu", () => {
	it("adds the Organizations entry to the shared menu", () => {
		const html = operatingCenterMenu("organizations");
		expect(html).toContain("/operating-center/organizations");
		expect(html).toContain("oc-menu-active");
	});
});

describe("organizations pages", () => {
	it("tenant list renders the shell with level=tenants", () => {
		const html = renderOrganizationsSectionHtml();
		expect(html).toContain('data-org-level="tenants"');
		expect(html).toContain("Organizations");
		expect(html).toContain("/api/operating-center/tenants");
		// Owner key gate present (shell).
		expect(html).toContain('id="gate"');
	});

	it("tenant page carries the tenant id", () => {
		const html = renderTenantSectionHtml("nwana");
		expect(html).toContain('data-org-level="tenant"');
		expect(html).toContain('data-tenant="nwana"');
	});

	it("business-unit page carries tenant and unit ids", () => {
		const html = renderBusinessUnitSectionHtml("nwana", "nwana-governing");
		expect(html).toContain('data-org-level="unit"');
		expect(html).toContain('data-tenant="nwana"');
		expect(html).toContain('data-unit="nwana-governing"');
		// Deep links into existing Engine functions for this NWANA unit.
		expect(html).toContain("/operating-center/growth?tab=funds");
	});

	it("never interpolates raw ids into attributes", () => {
		const html = renderBusinessUnitSectionHtml('a"b', "c'd");
		expect(html).not.toContain('data-tenant="a"b"');
		expect(html).not.toContain("data-unit=\"c'd\"");
	});
});
