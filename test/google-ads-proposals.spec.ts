import { describe, expect, it } from "vitest";
import {
	adaptFund,
	adaptOwnerDirective,
	adaptRegistryObject,
	adaptSponsorshipAsset,
	proposalIdentity,
	type NormalizedCampaignIntent,
} from "../src/google-ads-intent";
import {
	buildCampaignSpecFromIntent,
	buildProposal,
	buildProposals,
	findLiveConflict,
	VERIFIED_CONFLICT_MAPPINGS,
} from "../src/google-ads-proposals";
import { isCreationEligible } from "../src/google-ads-state";
import { currentProposalIntents } from "../src/google-ads-current";
import type { GoogleAdsLiveCampaign } from "../src/operating-center-screens";

const LIVE_SERIES = {
	id: "999",
	name: "2026 NWANA Open Nordic Walking Series",
	status: "ENABLED",
	daily_budget_usd: 10.97,
	impressions: 500,
	clicks: 40,
	conversions: 2,
	cost_usd: 400.0,
} as GoogleAdsLiveCampaign;

const SERIES_PROPOSAL_ID = "OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES";
const FC_PROPOSAL_ID = "OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE";

describe("adapters", () => {
	it("adapts the Series registry object to a normalized intent", () => {
		const intents = currentProposalIntents();
		const series = intents[0];
		expect(series.source_kind).toBe("REGISTRY_OBJECT");
		expect(series.origin).toBe("OBJECT_DERIVED");
		expect(series.source_identity).toBe("NWANA-RACE-000001");
		expect(series.source_object).toEqual({
			object_id: "NWANA-RACE-000001",
			object_type: null,
			title: null,
		});
		expect(series.distribution).toEqual({
			action_id: "ACT-SERIES-HUB-GOOGLE-ADS",
			rule_id: "RULE-OPEN-SERIES-HUB",
			channel: "GOOGLE_ADS_GRANT",
		});
		expect(proposalIdentity(series)).toBe(SERIES_PROPOSAL_ID);
	});

	it("adapts the Founding Circle owner directive to a normalized intent", () => {
		const intents = currentProposalIntents();
		const fc = intents[1];
		expect(fc.source_kind).toBe("OWNER_DIRECTIVE");
		expect(fc.origin).toBe("OWNER_DIRECTIVE");
		expect(fc.source_identity).toBe("DIR-FOUNDING-CIRCLE-2026");
		expect(fc.source_object).toBeNull();
		expect(fc.distribution).toEqual({ action_id: null, rule_id: null, channel: null });
		expect(proposalIdentity(fc)).toBe(FC_PROPOSAL_ID);
	});

	it("normalizes a Fund without campaign data: factual normalization, no invention", () => {
		const r = adaptFund({
			fund_id: "fund-50k-bridge-sprint",
			name: "$50K Manhattan HQ Bridge Sprint",
			purpose: "FUNDRAISING",
		});
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error(r.error);
		// The fund name is factual metadata, not a campaign name.
		expect(r.intent.name).toBeNull();
		expect(r.intent.target_url).toBeNull();
		expect(r.intent.cta).toBeNull();
		expect(r.intent.ad_groups).toEqual([]);
		expect(r.intent.sitelinks).toEqual([]);
		expect(r.intent.daily_budget).toBeNull();
		expect(r.intent.geo_target_id).toBeNull();
	});

	it("carries real Fund facts into source_facts without inventing campaign content", () => {
		const r = adaptFund({
			fund_id: "fund-50k-bridge-sprint",
			name: "$50K Manhattan HQ Bridge Sprint",
			description: "Founding capital to build the federation machine.",
			goal_amount: 50000,
			currency: "USD",
			purpose: "FUNDRAISING",
		});
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error(r.error);
		expect(r.intent.source_facts).toContain("Founding capital to build the federation machine.");
		expect(r.intent.source_facts).toContain("goal 50000 USD");
		// Still no invented campaign inputs.
		expect(r.intent.target_url).toBeNull();
		expect(r.intent.ad_groups).toEqual([]);
	});

	it("normalizes a Sponsorship Asset without campaign data: factual normalization, no invention", () => {
		const r = adaptSponsorshipAsset({
			asset_id: "asset-prize-pool-series-2026",
			name: "Series 2026 Prize Pool",
			purpose: "SPONSORSHIP",
		});
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error(r.error);
		expect(r.intent.name).toBeNull();
		expect(r.intent.ad_groups).toEqual([]);
		expect(r.intent.sitelinks).toEqual([]);
		expect(r.intent.target_url).toBeNull();
		expect(r.intent.cta).toBeNull();
	});

	it("rejects empty stable identity instead of inventing one", () => {
		const r = adaptFund({ fund_id: "   ", name: "X", purpose: "FUNDRAISING" });
		expect(r.ok).toBe(false);
	});

	it("rejects empty purpose instead of inventing one", () => {
		const r = adaptSponsorshipAsset({ asset_id: "a", name: "X", purpose: "" });
		expect(r.ok).toBe(false);
	});

	it("owner directive without a campaign name normalizes with null name, never invented", () => {
		const r = adaptOwnerDirective({
			directive_id: "dir-x",
			purpose: "VIRTUAL_RACES",
			source_facts: [],
		});
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error(r.error);
		expect(r.intent.name).toBeNull();
		// The pipeline then reports the exact missing field.
		const built = buildCampaignSpecFromIntent(r.intent);
		expect(built.ok).toBe(false);
		if (built.ok) throw new Error("unexpected");
		expect(built.missing_fields).toContain("name");
	});
});

describe("deterministic proposal identity", () => {
	it("is origin:source_identity:purpose with no timestamps or randomness", () => {
		const intents = currentProposalIntents();
		const a = proposalIdentity(intents[0]);
		const b = proposalIdentity(intents[0]);
		expect(a).toBe(b);
		expect(a).not.toMatch(/[0-9]{4}-[0-9]{2}-[0-9]{2}/);
		expect(a).toBe("OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES");
		expect(proposalIdentity(intents[1])).toBe("OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE");
	});
});

describe("generic campaign builder", () => {
	it("builds the Series spec byte-identical to the former hardcoded builder", async () => {
		const { buildDesiredState } = await import("../src/google-ads-current");
		const intents = currentProposalIntents();
		const built = buildCampaignSpecFromIntent(intents[0]);
		expect(built.ok).toBe(true);
		if (!built.ok) throw new Error(built.missing_fields.join(","));
		const state = buildDesiredState();
		expect(built.spec).toEqual(state.campaigns[0]);
	});

	it("builds the Founding Circle spec byte-identical to the former hardcoded builder", async () => {
		const { buildDesiredState } = await import("../src/google-ads-current");
		const intents = currentProposalIntents();
		const built = buildCampaignSpecFromIntent(intents[1]);
		expect(built.ok).toBe(true);
		if (!built.ok) throw new Error(built.missing_fields.join(","));
		const state = buildDesiredState();
		expect(built.spec).toEqual(state.campaigns[1]);
	});

	it("returns exact missing fields for a Fund without campaign data", () => {
		const r = adaptFund({ fund_id: "fund-50k-bridge-sprint", name: "X", purpose: "FUNDRAISING" });
		if (!r.ok) throw new Error(r.error);
		const built = buildCampaignSpecFromIntent(r.intent);
		expect(built.ok).toBe(false);
		if (built.ok) throw new Error("unexpected");
		expect(built.missing_fields).toEqual([
			"name",
			"target_url",
			"cta",
			"daily_budget",
			"geo_target_id",
			"ad_groups (at least 2)",
			"sitelinks (at least 2)",
		]);
	});

	it("the Series and Founding Circle hardcoded builders are gone", async () => {
		const stateModule = await import("../src/google-ads-state");
		expect("series2026Campaign" in stateModule).toBe(false);
		expect("foundingCircleCampaign" in stateModule).toBe(false);
	});
});

describe("state precedence", () => {
	it("missing input beats everything: INSUFFICIENT_INPUT", () => {
		const r = adaptFund({ fund_id: "f1", name: "X", purpose: "FUNDRAISING" });
		if (!r.ok) throw new Error(r.error);
		const p = buildProposal(r.intent, []);
		expect(p.state).toBe("INSUFFICIENT_INPUT");
		expect(p.creation_eligible).toBe(false);
		expect(p.missing_fields.length).toBeGreaterThan(0);
		expect(p.next_action).toContain("Supply the missing factual input");
	});

	it("policy violations beat conflict and proposed: POLICY_REVIEW", () => {
		const intents = currentProposalIntents();
		const broken: NormalizedCampaignIntent = {
			...intents[1],
			campaign_name_hint: "Generic Campaign Without Namespace",
		};
		const p = buildProposal(broken, [LIVE_SERIES]);
		expect(p.state).toBe("POLICY_REVIEW");
		expect(p.policy_violations.length).toBeGreaterThan(0);
		expect(p.next_action).toContain("policy");
	});

	it("a confirmed live conflict beats proposed: POSSIBLE DUPLICATE / REVIEW", () => {
		const intents = currentProposalIntents();
		const p = buildProposal(intents[0], [LIVE_SERIES]);
		expect(p.state).toBe("POSSIBLE DUPLICATE / REVIEW");
		expect(p.conflict).not.toBeNull();
		expect(p.conflict!.live_campaign_name).toBe("2026 NWANA Open Nordic Walking Series");
		expect(p.conflict!.via).toBe("VERIFIED_MAPPING");
	});

	it("a clean proposal is PROPOSED", () => {
		const intents = currentProposalIntents();
		const p = buildProposal(intents[1], []);
		expect(p.state).toBe("PROPOSED");
		expect(p.creation_eligible).toBe(true);
		expect(p.next_action).toBe("Needs owner review before creation");
	});
});

describe("generic duplicate check", () => {
	it("flags an exact campaign-name match without any mapping", () => {
		const intents = currentProposalIntents();
		const live: GoogleAdsLiveCampaign = {
			...LIVE_SERIES,
			name: "NWANA \u00b7 Founding Circle \u00b7 Donate",
		};
		const conflict = findLiveConflict(
			proposalIdentity(intents[1]),
			"NWANA \u00b7 Founding Circle \u00b7 Donate",
			[live],
			VERIFIED_CONFLICT_MAPPINGS,
		);
		expect(conflict).not.toBeNull();
		expect(conflict!.via).toBe("EXACT_NAME");
	});

	it("does not invent conflicts from similar names: no false duplicates", () => {
		const intents = currentProposalIntents();
		const live: GoogleAdsLiveCampaign = { ...LIVE_SERIES, name: "2026 NWANA Nordic Walking Series" };
		const conflict = findLiveConflict(
			proposalIdentity(intents[0]),
			"NWANA \u00b7 Series 2026 \u00b7 Virtual Races",
			[live],
			VERIFIED_CONFLICT_MAPPINGS,
		);
		// The similar live name is ignored; the verified mapping still
		// applies because it is explicit data, not name similarity.
		expect(conflict).not.toBeNull();
		expect(conflict!.via).toBe("VERIFIED_MAPPING");
	});

	it("no false duplicates for a proposal with no mapping and no exact match", () => {
		const r = adaptSponsorshipAsset({
			asset_id: "asset-x",
			name: "X",
			purpose: "SPONSORSHIP",
			campaign_name: "NWANA \u00b7 Asset X \u00b7 Sponsor",
		});
		if (!r.ok) throw new Error(r.error);
		const live: GoogleAdsLiveCampaign = { ...LIVE_SERIES, name: "NWANA Asset X Sponsor" };
		const conflict = findLiveConflict(
			proposalIdentity(r.intent),
			"NWANA \u00b7 Asset X \u00b7 Sponsor",
			[live],
			VERIFIED_CONFLICT_MAPPINGS,
		);
		expect(conflict).toBeNull();
	});

	it("the Series verified mapping is data, not code", () => {
		const mapping = VERIFIED_CONFLICT_MAPPINGS.find((m) => m.proposal_id === SERIES_PROPOSAL_ID);
		expect(mapping).toBeDefined();
		expect(mapping!.live_campaign_name).toBe("2026 NWANA Open Nordic Walking Series");
	});

	it("the verified mapping flags the proposal even when the snapshot does not include the campaign", () => {
		const intents = currentProposalIntents();
		const p = buildProposal(intents[0], []);
		expect(p.state).toBe("POSSIBLE DUPLICATE / REVIEW");
		expect(p.conflict).not.toBeNull();
		expect(p.conflict!.live_present_in_snapshot).toBe(false);
	});
});

describe("production pipeline", () => {
	it("both production proposals go through the same pipeline", async () => {
		const { buildDesiredState } = await import("../src/google-ads-current");
		const state = buildDesiredState();
		const proposals = buildProposals(currentProposalIntents(), []);
		expect(proposals).toHaveLength(2);
		const series = proposals[0];
		const fc = proposals[1];
		expect(series.proposal_id).toBe(SERIES_PROPOSAL_ID);
		expect(series.origin).toBe("OBJECT_DERIVED");
		expect(series.source_identity).toBe("NWANA-RACE-000001");
		expect(series.creation_eligible).toBe(true);
		expect(series.state).toBe("POSSIBLE DUPLICATE / REVIEW");
		expect(fc.proposal_id).toBe(FC_PROPOSAL_ID);
		expect(fc.origin).toBe("OWNER_DIRECTIVE");
		expect(fc.source_identity).toBe("DIR-FOUNDING-CIRCLE-2026");
		expect(fc.creation_eligible).toBe(true);
		expect(fc.state).toBe("PROPOSED");
		// Both proposal campaigns satisfy the existing eligibility rule.
		expect(isCreationEligible(state.campaigns[0])).toBe(true);
		expect(isCreationEligible(state.campaigns[1])).toBe(true);
		expect(series.creation_eligible).toBe(isCreationEligible(state.campaigns[0]));
		expect(fc.creation_eligible).toBe(isCreationEligible(state.campaigns[1]));
	});

	it("zero Google Ads mutations: the pipeline is pure data in, data out", async () => {
		const proposalsModule = await import("../src/google-ads-proposals");
		const intentModule = await import("../src/google-ads-intent");
		// No mutation-shaped exports anywhere in the pipeline modules.
		for (const [label, mod] of [
			["proposals", proposalsModule],
			["intent", intentModule],
		] as const) {
			for (const key of Object.keys(mod)) {
				expect(key.toLowerCase()).not.toContain("mutat");
				expect(key.toLowerCase()).not.toContain("create_campaign");
			}
			expect(label).toBeTruthy();
		}
		// Pure: same inputs always yield the same proposals, with no
		// network or side effects (the functions are synchronous and
		// take only intents plus a live snapshot).
		const intents = currentProposalIntents();
		const first = buildProposals(intents, [LIVE_SERIES]);
		const second = buildProposals(intents, [LIVE_SERIES]);
		expect(second).toEqual(first);
	});
});
