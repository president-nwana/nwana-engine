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
	collectD1Sources,
	collectSources,
	collectStaticSources,
	NWANA_RUNSIGNUP_DONATION_URL,
	OWNER_DIRECTIVES,
	type DonationDestination,
	type NormalizedSource,
} from "../src/orchestration-sources";
import { DISTRIBUTION_ACTIONS } from "../src/distribution-evidence";
import {
	CHANNEL_MAP,
	GENERIC_RULE_MISSING_DESTINATION,
	GENERIC_RULES,
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
import { buildDesiredState } from "../src/google-ads-current";
import { proposalIdentity } from "../src/google-ads-intent";
import { buildProposal } from "../src/google-ads-proposals";
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
	return {
		actions: DISTRIBUTION_ACTIONS,
		directives: OWNER_DIRECTIVES,
		genericRules: GENERIC_RULES,
	};
}

function runStatic(): OrchestrationDecision[] {
	return orchestrate(collectStaticSources(), staticEvidence());
}

/** Synthetic normalized source for generic-rule tests. Facts only, no guessing. */
function syntheticSource(
	overrides: Partial<NormalizedSource> & { source_identity: string },
): NormalizedSource {
	return {
		source_kind: "RULE_DERIVED_ASSET",
		canonical_object_id: null,
		factual_title: "Synthetic",
		status: "active",
		purpose: null,
		capabilities: [],
		relationships: [],
		public_destinations: [],
		donation_destinations: [],
		conversion_capabilities: [],
		distribution_actions: [],
		source_facts: [],
		owner_directive: null,
		provenance: { store: "test", reader: "test", adapter: "test" },
		...overrides,
	};
}

function confirmedDestination(url: string): DonationDestination {
	return {
		url,
		provenance: { store: "test-store", reader: "test-reader", adapter: "test-adapter" },
	};
}

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
		// No per-fund special cases: the funds table has no destination
		// column, so no fund carries a confirmed donation destination or
		// an invented DONATION conversion capability, not even the
		// $50K bridge sprint.
		expect(fund.donation_destinations).toEqual([]);
		expect(fund.conversion_capabilities).toEqual([]);
		expect(fund.capabilities).toEqual(["FUNDRAISING"]);
		expect(
			fund.source_facts.some((f) => f.includes("No confirmed public donation destination")),
		).toBe(true);
	});

	it("sponsorship-asset adapter reads D1 rows", () => {
		const [asset] = adaptSponsorshipAssetSources([
			{
				id: "asset-1",
				title: "Test Asset",
				stage: "draft",
				object_type: "SERIES",
				object_id: "NWANA-RACE-000001",
			},
		]);
		expect(asset.source_kind).toBe("SPONSORSHIP_ASSET");
		expect(asset.relationships).toEqual([
			{ type: "PARENT_OBJECT", target_identity: "NWANA-RACE-000001" },
		]);
		expect(asset.donation_destinations).toEqual([]);
	});

	it("collectSources with null db yields static sources only, no fabrication", async () => {
		const sources = await collectSources(null);
		expect(sources).toHaveLength(6);
	});

	it("collectD1Sources queries the real production D1 column names", async () => {
		// Regression: production D1 sponsorship_assets has object_type /
		// object_id (migration 0026), not parent_object_type /
		// parent_object_id. A mock db that rejects unknown columns proves
		// the query cannot 500 on the production schema.
		const realColumns: Record<string, Set<string>> = {
			funds: new Set(["id", "name", "goal_amount", "currency", "status", "description"]),
			sponsorship_assets: new Set(["id", "title", "stage", "object_type", "object_id"]),
		};
		const mockDb = {
			prepare(sql: string) {
				return {
					all: async () => {
						const m = sql.match(/FROM\s+(\w+)/i);
						const table = m?.[1] ?? "";
						const cols = sql
							.slice("SELECT ".length, sql.indexOf(" FROM"))
							.split(",")
							.map((c) => c.trim());
						for (const c of cols) {
							if (!realColumns[table]?.has(c)) {
								throw new Error(`no such column: ${c}`);
							}
						}
						return { results: [] };
					},
				};
			},
		};
		await expect(
			collectD1Sources(mockDb as unknown as D1Database),
		).resolves.toEqual([]);
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
			(d) =>
				d.source_identity === "DIR-FOUNDING-CIRCLE-2026" &&
				d.evidence[0]?.kind === "OWNER_DIRECTIVE",
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
			donation_destinations: [],
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
		// The core checks generic rules too before giving up.
		expect(decision.factual_reason).toContain("generic rules");
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
			donation_destinations: [],
			conversion_capabilities: [],
			distribution_actions: [
				{ action_id: "ACT-FUND-EMPLOYER-MATCH", rule_id: "RULE-INSTRUCTOR-GROWTH-FUND", channel: "EMPLOYER_MATCHING" },
			],
			source_facts: [],
			owner_directive: null,
			provenance: { store: "test", reader: "test", adapter: "test" },
		};
		const decisions = orchestrate([source], staticEvidence());
		// The unmapped action is reported, never guessed...
		const actionDecision = decisions.find(
			(d) => d.evidence[0]?.reference === "ACT-FUND-EMPLOYER-MATCH",
		)!;
		expect(actionDecision.state).toBe("MISSING_DECISION_INPUT");
		expect(actionDecision.channel).toBeNull();
		expect(
			actionDecision.missing_decision_input.some((m) => m.includes("EMPLOYER_MATCHING")),
		).toBe(true);
		// ...and the generic fundraising rule independently reports the
		// missing donation destination.
		const genericDecision = decisions.find(
			(d) => d.evidence[0]?.reference === "RULE-FUNDRAISING-PUBLIC-DONATION-GOOGLE-ADS",
		)!;
		expect(genericDecision.state).toBe("MISSING_DECISION_INPUT");
		expect(genericDecision.missing_decision_input).toEqual([
			GENERIC_RULE_MISSING_DESTINATION,
		]);
	});

	it("reports MISSING_DECISION_INPUT when purpose/deliverable are not recorded", () => {
		const decisions = runStatic().filter(
			(d) => d.source_identity === "instructor-growth-fund",
		);
		// Eight rule-derived action decisions plus the generic
		// fundraising-rule result: the fundraising fact is confirmed but
		// no public donation destination is, so the rule reports the
		// missing destination instead of inventing one.
		expect(decisions).toHaveLength(9);
		for (const d of decisions) {
			expect(d.state).toBe("MISSING_DECISION_INPUT");
			expect(d.missing_decision_input.length).toBeGreaterThan(0);
		}
		const genericDecision = decisions.find(
			(d) => d.evidence[0]?.kind === "GENERIC_RULE",
		)!;
		expect(genericDecision.evidence[0]).toMatchObject({
			kind: "GENERIC_RULE",
			reference: "RULE-FUNDRAISING-PUBLIC-DONATION-GOOGLE-ADS",
		});
		expect(genericDecision.channel).toBe("GOOGLE_ADS");
		expect(genericDecision.missing_decision_input).toEqual([
			"confirmed public donation destination missing",
		]);
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
	it("produces the two production intents through orchestration", async () => {
		const intents = await orchestrationGoogleAdsIntents(null);
		expect(intents).toHaveLength(2);
		const ids = intents.map(proposalIdentity);
		expect(ids).toContain("OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES");
		expect(ids).toContain("OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE");
	});

	it("carries the recorded Google Ads action provenance on the Series intent", async () => {
		const intents = await orchestrationGoogleAdsIntents(null);
		const series = intents.find(
			(i) => proposalIdentity(i) === "OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES",
		)!;
		expect(series.distribution.action_id).toBe("ACT-SERIES-HUB-GOOGLE-ADS");
		expect(series.distribution.rule_id).toBe("RULE-OPEN-SERIES-HUB");
		expect(series.distribution.channel).toBe("GOOGLE_ADS_GRANT");
	});

	it("keeps the Founding Circle intent free of invented provenance", async () => {
		const intents = await orchestrationGoogleAdsIntents(null);
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
		// Series action decision, Founding Circle owner-directive
		// decision, and the Founding Circle generic-rule decision (the
		// directive carries a confirmed donation destination, so the
		// generic rule fires too).
		expect(googleAds).toHaveLength(3);
		const fcDecisions = googleAds.filter(
			(d) => d.source_identity === "DIR-FOUNDING-CIRCLE-2026",
		);
		expect(fcDecisions).toHaveLength(2);
		// Dedup by logical campaign: both Founding Circle decisions
		// resolve to the same single proposal id, so no duplicate
		// proposal is created for the owner-ordered campaign.
		expect(fcDecisions[0].channel_intent_id).toBe(
			"OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE",
		);
		expect(fcDecisions[1].channel_intent_id).toBe(
			"OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE",
		);
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

	it("builds a factual partial intent for a decided source without channel inputs", () => {
		const destination = "https://example.org/donate/test-fund";
		const source = syntheticSource({
			source_identity: "test-fund-no-inputs",
			source_kind: "FUND",
			factual_title: "Test Fund",
			purpose: "FUNDRAISING",
			donation_destinations: [confirmedDestination(destination)],
			source_facts: ["Goal 10000 USD."],
		});
		expect(
			GOOGLE_ADS_CHANNEL_INPUTS[source.source_identity],
		).toBeUndefined();
		const [decision] = orchestrate([source], staticEvidence());
		expect(decision.state).toBe("DECIDED");
		expect(decision.channel).toBe("GOOGLE_ADS");
		const built = buildGoogleAdsIntent(source, decision);
		expect(built.ok).toBe(true);
		if (!built.ok) throw new Error("unreachable");
		// Only confirmed facts travel: identity, factual name, purpose,
		// confirmed destination, source facts. Nothing is invented.
		expect(built.intent.name).toBe("Test Fund");
		expect(built.intent.target_url).toBe(destination);
		expect(built.intent.cta).toBeNull();
		expect(built.intent.audience).toBeNull();
		expect(built.intent.daily_budget).toBeNull();
		expect(built.intent.geo_target_id).toBeNull();
		expect(built.intent.ad_groups).toEqual([]);
		expect(built.intent.sitelinks).toEqual([]);
		expect(built.intent.source_facts).toEqual(["Goal 10000 USD."]);
		// The incomplete intent reaches the ADR-0031 proposal engine and
		// reports INSUFFICIENT_INPUT with the exact missing fields.
		const proposal = buildProposal(built.intent, []);
		expect(proposal.state).toBe("INSUFFICIENT_INPUT");
		expect(proposal.missing_fields).toEqual([
			"cta",
			"daily_budget",
			"geo_target_id",
			"ad_groups (at least 2)",
			"sitelinks (at least 2)",
		]);
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
		// $50K bridge sprint: the fundraising fact is confirmed, but no
		// public donation destination is recorded for any fund. The
		// generic rule reports the missing destination with the exact
		// string instead of inventing or assuming a URL.
		const bridgeSprint = bySource.get("fund-50k-bridge-sprint")!;
		expect(bridgeSprint.state).toBe("MISSING_DECISION_INPUT");
		expect(bridgeSprint.channel).toBe("GOOGLE_ADS");
		expect(bridgeSprint.missing_decision_input).toEqual([
			"confirmed public donation destination missing",
		]);
		expect(bridgeSprint.evidence[0]).toMatchObject({
			kind: "GENERIC_RULE",
			reference: "RULE-FUNDRAISING-PUBLIC-DONATION-GOOGLE-ADS",
		});
		expect(JSON.stringify(bridgeSprint)).not.toContain("sport.nwaofna.org");
		// Instructor Growth Fund: evidence exists but purpose/deliverable
		// are not recorded, so every decision is incomplete, never guessed.
		for (const d of fundraising.filter((x) => x.source_identity === "instructor-growth-fund")) {
			expect(d.state).toBe("MISSING_DECISION_INPUT");
		}
		// Founding Circle: explicit owner directive, decided; the generic
		// rule fires too (confirmed destination), and both resolve to the
		// same single proposal id (no duplicate).
		const fcDecisions = fundraising.filter(
			(d) => d.source_identity === "DIR-FOUNDING-CIRCLE-2026",
		);
		expect(fcDecisions).toHaveLength(2);
		for (const d of fcDecisions) {
			expect(d.state).toBe("DECIDED");
			expect(d.channel).toBe("GOOGLE_ADS");
		}
	});
});

describe("generic fundraising rule", () => {
	const RULE_ID = "RULE-FUNDRAISING-PUBLIC-DONATION-GOOGLE-ADS";
	const DONATE_URL = "https://example.org/donate/confirmed";

	function decidedSource(
		source_identity: string,
		facts: Partial<NormalizedSource>,
	): { source: NormalizedSource; decision: OrchestrationDecision } {
		const source = syntheticSource({
			source_identity,
			donation_destinations: [confirmedDestination(DONATE_URL)],
			...facts,
		});
		const [decision] = orchestrate([source], staticEvidence());
		return { source, decision };
	}

	it("fires on a confirmed FUNDRAISING purpose with exact output", () => {
		const { decision } = decidedSource("test-purpose", {
			source_kind: "FUND",
			purpose: "FUNDRAISING",
		});
		expect(decision.state).toBe("DECIDED");
		expect(decision.required_result).toBe("Raise donations");
		expect(decision.candidate_action).toBe("Acquire donors via search");
		expect(decision.channel).toBe("GOOGLE_ADS");
		expect(decision.evidence[0]).toMatchObject({
			kind: "GENERIC_RULE",
			reference: RULE_ID,
		});
	});

	it("fires on a confirmed FUNDRAISING capability without the purpose", () => {
		const { decision } = decidedSource("test-capability", {
			source_kind: "SPONSORSHIP_ASSET",
			purpose: "SPONSORSHIP",
			capabilities: ["FUNDRAISING"],
		});
		expect(decision.state).toBe("DECIDED");
		expect(decision.required_result).toBe("Raise donations");
		expect(decision.candidate_action).toBe("Acquire donors via search");
		expect(decision.channel).toBe("GOOGLE_ADS");
		expect(decision.evidence[0].reference).toBe(RULE_ID);
	});

	it("fires on a confirmed DONATION capability without the purpose", () => {
		const { decision } = decidedSource("test-donation-cap", {
			source_kind: "RULE_DERIVED_ASSET",
			purpose: null,
			capabilities: ["DONATION"],
		});
		expect(decision.state).toBe("DECIDED");
		expect(decision.channel).toBe("GOOGLE_ADS");
		expect(decision.evidence[0].reference).toBe(RULE_ID);
	});

	it("is source-type agnostic: same facts, same output, no kind/id/name branching", () => {
		const kinds = ["FUND", "RULE_DERIVED_ASSET", "SPONSORSHIP_ASSET"] as const;
		const results = kinds.map((source_kind, i) =>
			decidedSource(`test-agnostic-${i}`, {
				source_kind,
				purpose: "FUNDRAISING",
			}).decision,
		);
		for (const d of results) {
			expect(d.state).toBe("DECIDED");
			expect(d.required_result).toBe("Raise donations");
			expect(d.candidate_action).toBe("Acquire donors via search");
			expect(d.channel).toBe("GOOGLE_ADS");
			expect(d.evidence[0].kind).toBe("GENERIC_RULE");
			expect(d.evidence[0].reference).toBe(RULE_ID);
		}
		// Decision ids differ only because the source identity is part of
		// the identity input, never because the rule branched on it.
		const ids = results.map((d) => d.decision_id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("carries the exact fact, URL, and per-destination provenance in evidence", () => {
		const { decision } = decidedSource("test-evidence", {
			purpose: "FUNDRAISING",
		});
		const [evidence] = decision.evidence;
		expect(evidence.kind).toBe("GENERIC_RULE");
		expect(evidence.reference).toBe(RULE_ID);
		expect(evidence.detail).toContain("purpose FUNDRAISING");
		expect(evidence.detail).toContain(DONATE_URL);
		expect(evidence.detail).toContain("store=test-store");
		expect(evidence.detail).toContain("reader=test-reader");
		expect(evidence.detail).toContain("adapter=test-adapter");
	});

	it("gives generic decisions deterministic ids", () => {
		const facts = { purpose: "FUNDRAISING" as const };
		const first = decidedSource("test-determinism", facts).decision.decision_id;
		const second = decidedSource("test-determinism", facts).decision.decision_id;
		expect(first).toBe(second);
		expect(first.startsWith("ORCH-")).toBe(true);
	});

	it("reports the exact missing-destination result, never a substituted homepage", () => {
		const source = syntheticSource({
			source_identity: "test-homepage",
			purpose: "FUNDRAISING",
			// A homepage is a public destination, not a donation page.
			public_destinations: ["https://example.org/"],
			donation_destinations: [],
		});
		const [decision] = orchestrate([source], staticEvidence());
		expect(decision.state).toBe("MISSING_DECISION_INPUT");
		expect(decision.missing_decision_input).toEqual([
			GENERIC_RULE_MISSING_DESTINATION,
		]);
		expect(decision.factual_reason).toContain(
			"No homepage is substituted",
		);
		// The almost-qualifying source never reaches the intent feed.
		expect(decision.channel).toBe("GOOGLE_ADS");
	});

	it("never guesses or constructs a donation URL", () => {
		const source = syntheticSource({
			source_identity: "test-no-guess-fund",
			source_kind: "FUND",
			purpose: "FUNDRAISING",
			donation_destinations: [],
		});
		const [decision] = orchestrate([source], staticEvidence());
		expect(decision.state).toBe("MISSING_DECISION_INPUT");
		const serialized = JSON.stringify(decision);
		expect(serialized).not.toContain("http");
		expect(serialized).not.toContain("test-no-guess-fund/donate");
	});

	it("keeps owner-directive precedence: no duplicate Founding Circle proposal", async () => {
		const intents = await orchestrationGoogleAdsIntents(null);
		const fcIntents = intents.filter(
			(i) => proposalIdentity(i) === "OWNER_DIRECTIVE:DIR-FOUNDING-CIRCLE-2026:FOUNDING_CIRCLE",
		);
		// One logical campaign, one intent: the directive-shaped intent
		// wins over the generic-rule one.
		expect(fcIntents).toHaveLength(1);
		expect(fcIntents[0].name).toBe("NWANA · Founding Circle · Donate");
		expect(fcIntents[0].target_url).toBe(NWANA_RUNSIGNUP_DONATION_URL);
	});

	it("flows D1-backed fund sources through the production feed pipeline", async () => {
		const mockDb = {
			prepare: (sql: string) => ({
				all: async () =>
					sql.includes("FROM funds")
						? {
								results: [
									{
										id: "fund-50k-bridge-sprint",
										name: "$50K Manhattan HQ Bridge Sprint",
										goal_amount: 50000,
										currency: "USD",
										status: "active",
										description: null,
									},
								],
							}
						: { results: [] },
			}),
		};
		const db = mockDb as unknown as D1Database;
		const sources = await collectSources(db);
		expect(
			sources.some((s) => s.source_identity === "fund-50k-bridge-sprint"),
		).toBe(true);
		const decisions = orchestrate(sources, staticEvidence());
		const fundDecision = decisions.find(
			(d) =>
				d.source_identity === "fund-50k-bridge-sprint" &&
				d.evidence[0]?.kind === "GENERIC_RULE",
		)!;
		expect(fundDecision.state).toBe("MISSING_DECISION_INPUT");
		expect(fundDecision.missing_decision_input).toEqual([
			"confirmed public donation destination missing",
		]);
		// The feed pipeline runs end to end with D1 sources attached:
		// the almost-qualifying fund is reported, not invented, and the
		// two complete campaigns still build.
		const intents = await orchestrationGoogleAdsIntents(db);
		expect(intents).toHaveLength(2);
		const state = await buildDesiredState(db);
		expect(state.campaigns).toHaveLength(2);
	});

	it("surfaces qualifying and almost-qualifying sources in the Operating Center", async () => {
		const data = await getAdsOverview(
			{} as GoogleAdsEnv,
			disconnectedStatus as never,
			emptyAccount as never,
		);
		const genericDecisions = data.orchestration.filter((d) =>
			d.evidence.some((e) => e.reference === RULE_ID),
		);
		// Founding Circle (decided) and Instructor Growth Fund
		// (missing destination) are both visible with the rule id.
		expect(genericDecisions.length).toBeGreaterThanOrEqual(2);
		const igf = genericDecisions.find(
			(d) => d.source_identity === "instructor-growth-fund",
		)!;
		expect(igf.missing_decision_input).toContain(
			"confirmed public donation destination missing",
		);
		const report = buildAdsReport(data);
		expect(report).toContain(RULE_ID);
		expect(report).toContain("confirmed public donation destination missing");
	});
});

describe("Operating Center orchestration view", () => {
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
