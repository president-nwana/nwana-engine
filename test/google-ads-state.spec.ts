import { describe, expect, it } from "vitest";
import {
	AD_GRANTS_POLICY,
	validateCampaignSpec,
	validateDesiredState,
	type CampaignSpec,
} from "../src/google-ads-state";
import { buildDesiredState } from "../src/google-ads-current";

function validCampaign(): CampaignSpec {
	return {
		name: "NWANA \u00b7 Test \u00b7 Campaign",
		daily_budget: 100,
		geo_target_id: 2840,
		ad_groups: [
			{
				name: "Group One",
				default_cpc: 1.5,
				keywords: [{ text: "nordic walking test", match_type: "PHRASE" }],
				ads: [
					{ headlines: ["One", "Two", "Three"], descriptions: ["Desc one.", "Desc two."], final_url: "https://example.org" },
					{ headlines: ["Four", "Five", "Six"], descriptions: ["Desc three.", "Desc four."], final_url: "https://example.org" },
				],
			},
			{
				name: "Group Two",
				default_cpc: 2.0,
				keywords: [{ text: "walking race test", match_type: "EXACT" }],
				ads: [
					{ headlines: ["Seven", "Eight", "Nine"], descriptions: ["Desc five.", "Desc six."], final_url: "https://example.org" },
					{ headlines: ["Ten", "Eleven", "Twelve"], descriptions: ["Desc seven.", "Desc eight."], final_url: "https://example.org" },
				],
			},
		],
		sitelinks: [
			{ text: "Link One", final_url: "https://example.org/one" },
			{ text: "Link Two", final_url: "https://example.org/two" },
		],
	};
}

describe("Ad Grants policy guardrails", () => {
	it("accepts a fully compliant campaign", () => {
		expect(validateCampaignSpec(validCampaign())).toEqual([]);
	});

	it("rejects single-word keywords", () => {
		const spec = validCampaign();
		spec.ad_groups[0].keywords = [{ text: "walking", match_type: "PHRASE" }];
		expect(validateCampaignSpec(spec).join(" ")).toContain("single-word");
	});

	it("rejects CPC above the $2.00 grant cap", () => {
		const spec = validCampaign();
		spec.ad_groups[0].default_cpc = 2.01;
		const violations = validateCampaignSpec(spec).join(" ");
		expect(violations).toContain("default_cpc");
		expect(violations).toContain(String(AD_GRANTS_POLICY.max_manual_cpc));
	});

	it("requires at least two ad groups per campaign", () => {
		const spec = validCampaign();
		spec.ad_groups = spec.ad_groups.slice(0, 1);
		expect(validateCampaignSpec(spec).join(" ")).toContain("ad groups");
	});

	it("requires at least two ads per ad group", () => {
		const spec = validCampaign();
		spec.ad_groups[0].ads = spec.ad_groups[0].ads.slice(0, 1);
		expect(validateCampaignSpec(spec).join(" ")).toContain("ads");
	});

	it("requires at least two sitelinks per campaign", () => {
		const spec = validCampaign();
		spec.sitelinks = spec.sitelinks.slice(0, 1);
		expect(validateCampaignSpec(spec).join(" ")).toContain("sitelinks");
	});

	it("keeps machine campaigns namespaced so the script never touches foreign campaigns", () => {
		const spec = validCampaign();
		spec.name = "Someone Else Campaign";
		expect(validateCampaignSpec(spec).join(" ")).toContain("NWANA");
	});

	it("rejects a desired state whose budgets exceed the shared grant cap", () => {
		const state = {
			version: "test",
			generated_at: new Date().toISOString(),
			campaigns: [validCampaign(), { ...validCampaign(), name: "NWANA \u00b7 Test \u00b7 Second" }],
		};
		state.campaigns[0].daily_budget = 200;
		state.campaigns[1].daily_budget = 200;
		const violations = validateDesiredState(state).join(" ");
		expect(violations).toContain(String(AD_GRANTS_POLICY.max_total_daily_budget));
	});

	it("rejects duplicate campaign names", () => {
		const state = {
			version: "test",
			generated_at: new Date().toISOString(),
			campaigns: [validCampaign(), validCampaign()],
		};
		expect(validateDesiredState(state).join(" ")).toContain("duplicate");
	});
});

describe("machine desired state", () => {
	it("builds a policy-compliant state with one campaign per object", async () => {
		const state = await buildDesiredState(null);
		expect(state.campaigns.length).toBe(2);
		expect(validateDesiredState(state)).toEqual([]);
		const names = state.campaigns.map((campaign) => campaign.name);
		expect(names.some((name) => name.includes("Series 2026"))).toBe(true);
		expect(names.some((name) => name.includes("Founding Circle"))).toBe(true);
		const total = state.campaigns.reduce((sum, campaign) => sum + campaign.daily_budget, 0);
		expect(total).toBeLessThanOrEqual(AD_GRANTS_POLICY.max_total_daily_budget);
	});
});
