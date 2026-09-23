/**
 * Orchestration layer tests (ADR-0032).
 *
 * Covers: normalized source descriptors and adapters, the channel-neutral
 * decision core, deterministic decision/intent identities, the generic
 * consumer contract, the Google Ads consumer, the Operating Center
 * orchestration view/report, and the factual fundraising audit.
 */
import { describe, expect, it } from "vitest";
import {
	adaptFundSources,
	adaptOwnerDirectiveSources,
	adaptRegistrySources,
	adaptRuleDerivedSources,
	adaptSponsorshipAssetSources,
	collectSources,
	collectStaticSources,
	OWNER_DIRECTIVES,
	type NormalizedSource,
} from "../src/orchestration-sources";
import { DISTRIBUTION_ACTIONS } from "../src/distribution-evidence";
import {
	CHANNEL_MAP,
	orchestrate,
	stableHash,
	type OrchestrationDecision,
	type OrchestrationEvidence,
} from "../src/orchestration";
import {
	buildGoogleAdsIntent,
	getOrchestrationDecisions,
	GOOGLE_ADS_CHANNEL_INPUTS,
	orchestrationGoogleAdsIntents,
} from "../src/orchestration-google-ads";
import { proposalIdentity } from "../src/google-ads-intent";
import {
	buildAdsReport,
	getAdsOverview,
	renderAdsHtml,
} from "../src/operating-center-screens";
import type { GoogleAdsEnv } from "../src/google-ads";

const REQUIRED_CHANNELS = [
	"GOOGLE_ADS",
	"META",
	"RUNSIGNUP_EMAIL",
	"LINKEDIN",
	"PRESS_MEDIA",
	"SELLER_SPONSORSHIP",
	"PARTNER_OUTREACH",
] as const;

function staticEvidence(): OrchestrationEvidence {
	return { actions: DISTRIBUTION_ACTIONS, directives: OWNER_DIRECTIVES };
}

function runStatic(): OrchestrationDecision[] {
	return orchestrate(collectStaticSources(), staticEvidence());
}

describe("orchestration channels", () => {
	it("supports every required channel identifier", () => {
		const mapped = new Set(Object.values(CHANNEL_MAP));
		for (const channel of REQUIRED_CHANNELS) {
			expect(mapped.has(channel)).toBe(true);
		}
	});

	it("maps every distribution-config channel to a machine channel or reports it", () => {
		const rawChannels = new Set(DISTRIBUTION_ACTIONS.map((a) => a.channel));
		const unmapped: string[] = [];
		for (const raw of rawChannels) {
			if (!CHANNEL_MAP[raw]) unmapped.push(raw);
		}
		// Exactly one raw channel has no mapping in this step; the core
		// must surface it as MISSING_DECISION_INPUT, never guess it.
		expect(unmapped).toEqual(["EMPLOYER_MATCHING"]);
	});
});

describe("source adapters", () => {
	it("enumerates real sources through adapters, never invented", () => {
		const sources = collectStaticSources();
		const identities = sources.map((s) => s.source_identity);
		expect(identities).toContain("NWANA-RACE-000001");
		expect(identities).toContain("RUNSIGNUP_ASSET_ALBERT_FATIKHOV");
		expect(identities).toContain("RUNSIGNUP_ASSET_NWANA_SPORT");
		expect(identities).toContain("RUNSIGNUP_ASSET_PARTNER_NETWORK");
		expect(identities).toContain("instructor-growth-fund");
		expect(identities).toContain("DIR-FOUNDING-CIRCLE-2026");
		expect(sources).toHaveLength(6);
	});

	it("never duplicates the same logical source", () => {
		const sources = collectStaticSources();
		const identities = sources.map((s) => s.source_identity);
		expect(new Set(identities).size).toBe(identities.length);
	});

	it("registry adapter carries only verified facts, unknown stays unknown", () => {
		const series = adaptRegistrySources().find(
			(s) => s.source_identity === "NWANA-RACE-000001",
		)!;
		expect(series.source_kind).toBe("REGISTRY_OBJECT");
		expect(series.canonical_object_id).toBe("NWANA-RACE-000001");
		expect(series.factual_title).toBeNull();
		expect(series.capabilities).toEqual(["PUBLIC_WEBSITE"]);
		expect(series.conversion_capabilities).toEqual([]);
		expect(series.public_destinations).toEqual(["https://series.nwaofna.org/"]);
		// All ten Series hub actions are explicit evidence.
		expect(series.distribution_actions).toHaveLength(10);
		expect(
			series.distribution_actions.some((a) => a.action_id === "ACT-SERIES-HUB-GOOGLE-ADS"),
		).toBe(true);

		const asset = adaptRegistrySources().find(
			(s) => s.source_identity === "RUNSIGNUP_ASSET_ALBERT_FATIKHOV",
		)!;
		expect(asset.capabilities).toEqual([]);
		expect(asset.public_destinations).toEqual([]);
		expect(asset.distribution_actions).toEqual([]);
		expect(
			asset.source_facts.some((f) => f.includes("UNKNOWN")),
		).toBe(true);
	});

	it("rule-derived adapter names the Instructor Growth Fund from its rule", () => {
		const [igf] = adaptRuleDerivedSources();
		expect(igf.source_kind).toBe("RULE_DERIVED_ASSET");
		expect(igf.purpose).toBe("FUNDRAISING");
		expect(igf.distribution_actions).toHaveLength(8);
		expect(igf.distribution_actions[0].rule_id).toBe("RULE-INSTRUCTOR-GROWTH-FUND");
	});

	it("owner-directive adapter needs no source object and no rule", () => {
		const [fc] = adaptOwnerDirectiveSources();
		expect(fc.source_kind).toBe("OWNER_DIRECTIVE");
		expect(fc.canonical_object_id).toBeNull();
		expect(fc.distribution_actions).toEqual([]);
		expect(fc.owner_directive?.directive_id).toBe("DIR-FOUNDING-CIRCLE-2026");
		expect(fc.owner_directive?.ordered_channel).toBe("GOOGLE_ADS_GRANT");
	});

	it("fund adapter reads D1 rows without inventing evidence", () => {
		const [fund] = adaptFundSources([
			{
				id: "fund-50k-bridge-sprint",
				name: "$50K Manhattan HQ Bridge Sprint",
				goal_amount: 50000,
				currency: "USD",
				status: "active",
				description: null,
			},
		]);
		expect(fund.source_kind).toBe("FUND");
		expect(fund.purpose).toBe("FUNDRAISING");
		expect(fund.distribution_actions).toEqual([]);
		expect(fund.owner_directive).toBeNull();
		expect(fund.conversion_capabilities).toEqual(["DONATION"]);
	});

	it("sponsorship-asset adapter reads D1 rows", () => {
		const [asset] = adaptSponsorshipAssetSources([
			{
				id: "asset-1",
				title: "Test Asset",
				stage: "draft",
				parent_object_type: "SERIES",
				parent_object_id: "NWANA-RACE-000001",
			},
		]);
		expect(asset.source_kind).toBe("SPONSORSHIP_ASSET");
		expect(asset.relationships).toEqual([
			{ type: "PARENT_OBJECT", target_identity: "NWANA-RACE-000001" },
		]);
	});

	it("collectSources with null db yields static sources only, no fabrication", async () => {
		const sources = await collectSources(null);
		expect(sources).toHaveLength(6);
	});
});

describe("orchestration core", () => {
	it("gives every positive decision an exact evidence reference", () => {
		for (const d of runStatic()) {
			if (d.state !== "DECIDED") continue;
			expect(d.required_result).toBeTruthy();
			expect(d.candidate_action).toBeTruthy();
			expect(d.channel).toBeTruthy();
			expect(d.evidence.length).toBeGreaterThan(0);
			for (const e of d.evidence) {
				expect(e.reference).toBeTruthy();
			}
		}
	});

	it("decides the Series Google Ads channel from the recorded action", () => {
		const decision = runStatic().find(
			(d) =>
				d.source_identity === "NWANA-RACE-000001" &&
				d.channel === "GOOGLE_ADS" &&
				d.state === "DECIDED",
		)!;
		expect(decision).toBeDefined();
		expect(decision.required_result).toBe(
			"Attract people searching for Nordic walking competitions to Series 2026",
		);
		expect(decision.candidate_action).toBe("Google Ad Grant campaign draft");
		expect(decision.evidence[0]).toMatchObject({
			kind: "DISTRIBUTION_ACTION",
			reference: "ACT-SERIES-HUB-GOOGLE-ADS",
		});
		expect(decision.execution_mode).toBe("APPROVAL_REQUIRED");
	});

	it("decides the Founding Circle from the owner directive", () => {
		const decision = runStatic().find(
			(d) => d.source_identity === "DIR-FOUNDING-CIRCLE-2026",
		)!;
		expect(decision.state).toBe("DECIDED");
		expect(decision.channel).toBe("GOOGLE_ADS");
		expect(decision.required_result).toBe("Raise founding capital donations");
		expect(decision.evidence[0]).toMatchObject({
			kind: "OWNER_DIRECTIVE",
			reference: "DIR-FOUNDING-CIRCLE-2026",
		});
	});

	it("reports NO_DECISION when a source carries no evidence", () => {
		const source: NormalizedSource = {
			source_identity: "RUNSIGNUP_ASSET_NWANA_SPORT",
			source_kind: "REGISTRY_OBJECT",
			canonical_object_id: null,
			factual_title: "NWANA Nordic Walking SPORT",
			status: null,
			purpose: "SPORT_ASSET",
			capabilities: [],
			relationships: [],
			public_destinations: [],
			conversion_capabilities: [],
			distribution_actions: [],
			source_facts: [],
			owner_directive: null,
			provenance: { store: "test", reader: "test", adapter: "test" },
		};
		const [decision] = orchestrate([source], staticEvidence());
		expect(decision.state).toBe("NO_DECISION");
		expect(decision.channel).toBeNull();
		expect(decision.factual_reason).toContain("RUNSIGNUP_ASSET_NWANA_SPORT");
	});

	it("reports MISSING_DECISION_INPUT instead of guessing a channel", () => {
		const source: NormalizedSource = {
			source_identity: "test-unmapped",
			source_kind: "RULE_DERIVED_ASSET",
			canonical_object_id: null,
			factual_title: "Test",
			status: "active",
			purpose: "FUNDRAISING",
			capabilities: [],
			relationships: [],
			public_destinations: [],
			conversion_capabilities: [],
			distribution_actions: [
				{ action_id: "ACT-FUND-EMPLOYER-MATCH", rule_id: "RULE-INSTRUCTOR-GROWTH-FUND", channel: "EMPLOYER_MATCHING" },
			],
			source_facts: [],
			owner_directive: null,
			provenance: { store: "test", reader: "test", adapter: "test" },
		};
		const [decision] = orchestrate([source], staticEvidence());
		expect(decision.state).toBe("MISSING_DECISION_INPUT");
		expect(decision.channel).toBeNull();
		expect(
			decision.missing_decision_input.some((m) => m.includes("EMPLOYER_MATCHING")),
		).toBe(true);
	});

	it("reports MISSING_DECISION_INPUT when purpose/deliverable are not recorded", () => {
		const decisions = runStatic().filter(
			(d) => d.source_identity === "instructor-growth-fund",
		);
		expect(decisions).toHaveLength(8);
		for (const d of decisions) {
			expect(d.state).toBe("MISSING_DECISION_INPUT");
			expect(d.missing_decision_input.length).toBeGreaterThan(0);
		}
		// The employer-matching action additionally has no channel mapping.
		const employerMatch = decisions.find(
			(d) => d.evidence[0]?.reference === "ACT-FUND-EMPLOYER-MATCH",
		)!;
		expect(employerMatch.channel).toBeNull();
		expect(
			employerMatch.missing_decision_input.some((m) => m.includes("EMPLOYER_MATCHING")),
		).toBe(true);
		// All other fund actions map to real channels but stay incomplete.
		for (const d of decisions.filter(
			(x) => x.evidence[0]?.reference !== "ACT-FUND-EMPLOYER-MATCH",
		)) {
			expect(d.channel).not.toBeNull();
		}
	});

	it("produces deterministic decision ids independent of render order", () => {
		const first = runStatic().map((d) => d.decision_id);
		const second = runStatic().map((d) => d.decision_id);
		expect(second).toEqual(first);
		const reversed = orchestrate(
			[...collectStaticSources()].reverse(),
			staticEvidence(),
		).map((d) => d.decision_id);
		expect(reversed).toEqual(first);
	});

	it("gives each logical decision its own stable identity", () => {
		const decisions = runStatic();
		const ids = decisions.map((d) => d.decision_id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.every((id) => id.startsWith("ORCH-"))).toBe(true);
	});

	it("stableHash is deterministic", () => {
		expect(stableHash("abc")).toBe(stableHash("abc"));
		expect(stableHash("abc")).not.toBe(stableHash("abd"));
	});
});

describe("Google Ads consumer", () => {
	it("produces the two production intents through orchestration", () => {
		const intents = orchestrationGoogleAdsIntents();
		expect(intents).toHaveLength(2);
		const ids = intents.map(proposalIdentity);
		expect(ids).toContain("OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES");
		expect(ids).toContain("OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE");
	});

	it("carries the recorded Google Ads action provenance on the Series intent", () => {
		const intents = orchestrationGoogleAdsIntents();
		const series = intents.find(
			(i) => proposalIdentity(i) === "OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES",
		)!;
		expect(series.distribution.action_id).toBe("ACT-SERIES-HUB-GOOGLE-ADS");
		expect(series.distribution.rule_id).toBe("RULE-OPEN-SERIES-HUB");
		expect(series.distribution.channel).toBe("GOOGLE_ADS_GRANT");
	});

	it("keeps the Founding Circle intent free of invented provenance", () => {
		const intents = orchestrationGoogleAdsIntents();
		const fc = intents.find(
			(i) => proposalIdentity(i) === "OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE",
		)!;
		expect(fc.source_object).toBeNull();
		expect(fc.distribution.action_id).toBeNull();
		expect(fc.distribution.rule_id).toBeNull();
	});

	it("resolves Google Ads decisions to stable channel_intent_ids with downstream states", async () => {
		const downstream = new Map([
			["OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES", "POSSIBLE DUPLICATE / REVIEW"],
			["OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE", "PROPOSED"],
		]);
		const decisions = await getOrchestrationDecisions(null, downstream);
		const googleAds = decisions.filter(
			(d) => d.state === "DECIDED" && d.channel === "GOOGLE_ADS",
		);
		expect(googleAds).toHaveLength(2);
		for (const d of googleAds) {
			expect(d.channel_intent_id).toBeTruthy();
			expect(d.downstream).toEqual({
				consumer: "GOOGLE_ADS",
				state: downstream.get(d.channel_intent_id!),
			});
			// Orchestration states stay separate from Google Ads
			// downstream states.
			expect(["DECIDED", "NO_DECISION", "MISSING_DECISION_INPUT"]).toContain(d.state);
			expect(d.downstream!.state).not.toBe(d.state);
		}
	});

	it("refuses to invent campaign content for a source without channel inputs", () => {
		const sources = collectStaticSources();
		const igf = sources.find((s) => s.source_identity === "instructor-growth-fund")!;
		expect(GOOGLE_ADS_CHANNEL_INPUTS[igf.source_identity]).toBeUndefined();
		const decision: OrchestrationDecision = {
			decision_id: "ORCH-test",
			source_identity: igf.source_identity,
			source_kind: igf.source_kind,
			purpose: igf.purpose,
			required_result: "x",
			candidate_action: "y",
			channel: "GOOGLE_ADS",
			priority: null,
			factual_reason: "test",
			evidence: [],
			execution_mode: null,
			state: "DECIDED",
			channel_intent_id: null,
			missing_decision_input: [],
			downstream: null,
		};
		const built = buildGoogleAdsIntent(igf, decision);
		expect(built.ok).toBe(false);
	});
});

describe("fundraising audit", () => {
	it("audits every fundraising/donation source factually", async () => {
		const fundSources = adaptFundSources([
			{
				id: "fund-50k-bridge-sprint",
				name: "$50K Manhattan HQ Bridge Sprint",
				goal_amount: 50000,
				currency: "USD",
				status: "active",
				description: null,
			},
		]);
		const decisions = orchestrate(
			[...collectStaticSources(), ...fundSources],
			staticEvidence(),
		);
		const fundraising = decisions.filter(
			(d) => d.purpose === "FUNDRAISING" || d.purpose === "FOUNDING_CIRCLE",
		);
		const bySource = new Map(fundraising.map((d) => [d.source_identity, d]));
		// $50K bridge sprint: no distribution evidence, no invented channel.
		expect(bySource.get("fund-50k-bridge-sprint")?.state).toBe("NO_DECISION");
		// Instructor Growth Fund: evidence exists but purpose/deliverable
		// are not recorded, so every decision is incomplete, never guessed.
		for (const d of fundraising.filter((x) => x.source_identity === "instructor-growth-fund")) {
			expect(d.state).toBe("MISSING_DECISION_INPUT");
		}
		// Founding Circle: explicit owner directive, decided.
		expect(bySource.get("DIR-FOUNDING-CIRCLE-2026")?.state).toBe("DECIDED");
	});
});

describe("Operating Center orchestration view", () => {
	const disconnectedStatus = async () => ({
		connected: false,
		configured: false,
		access_level: "NONE",
		customers: [],
		execution_allowed: false,
		missing_configuration: ["GOOGLE_ADS_CLIENT_ID"],
	});
	const emptyAccount = async () => ({
		customer_id: "6758500147",
		date_range: "2026-08-26 to 2026-09-23",
		campaigns: [],
	});

	it("keeps live account, orchestration decisions, and proposals as separate lists", async () => {
		const data = await getAdsOverview(
			{} as GoogleAdsEnv,
			disconnectedStatus as never,
			emptyAccount as never,
		);
		expect(Array.isArray(data.live_account.campaigns)).toBe(true);
		expect(Array.isArray(data.orchestration)).toBe(true);
		expect(Array.isArray(data.machine_proposals)).toBe(true);
		expect(data.orchestration.length).toBeGreaterThan(0);
		// The two layers never share an item.
		const proposalIds = new Set(data.machine_proposals.map((p) => p.proposal_id));
		for (const d of data.orchestration) {
			if (d.channel_intent_id) {
				expect(proposalIds.has(d.channel_intent_id)).toBe(true);
			}
		}
	});

	it("renders the orchestration section on the ads screen and in the report", async () => {
		const data = await getAdsOverview(
			{} as GoogleAdsEnv,
			disconnectedStatus as never,
			emptyAccount as never,
		);
		const html = renderAdsHtml();
		expect(html).toContain("ORCHESTRATION DECISIONS");
		const report = buildAdsReport(data);
		expect(report).toContain("ORCHESTRATION DECISIONS");
		expect(report).toContain("ACT-SERIES-HUB-GOOGLE-ADS");
		expect(report).toContain("DIR-FOUNDING-CIRCLE-2026");
	});

	it("ads screen inline scripts still parse", () => {
		const html = renderAdsHtml();
		const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
