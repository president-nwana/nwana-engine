/**
 * Google Ads channel consumer for the orchestration layer.
 *
 * A DECIDED orchestration decision with channel GOOGLE_ADS becomes a
 * channel-specific intent through the existing ADR-0031 source adapters
 * (google-ads-intent.ts) and the existing universal proposal pipeline
 * (google-ads-proposals.ts). This module builds the channel input data
 * and runs the intent production; it creates no new campaign builder and
 * changes no ADR-0031 core behavior.
 *
 * The factual campaign content for the two current proposals (Series
 * 2026, Founding Circle) is carried here as explicit channel-input
 * data, keyed by source identity. It is supplied input, not a
 * manually maintained campaign list: which campaigns exist is decided
 * by the orchestration evidence, not by this file. A DECIDED source
 * without recorded channel inputs yields a partial intent carrying
 * only confirmed facts (identity, purpose, confirmed donation
 * destination); the ADR-0031 pipeline reports it as INSUFFICIENT_INPUT
 * with the exact missing fields instead of inventing campaign content.
 */

import {
	adaptFund,
	adaptOwnerDirective,
	adaptRegistryObject,
	adaptRuleDerivedAsset,
	adaptSponsorshipAsset,
	proposalIdentity,
	type AdapterResult,
	type AdGroupHint,
	type NormalizedCampaignIntent,
	type SitelinkHint,
} from "./google-ads-intent";
import { DISTRIBUTION_ACTIONS, type DistributionActionConfig } from "./distribution-evidence";
import {
	collectSources,
	NWANA_RUNSIGNUP_DONATION_URL,
	OWNER_DIRECTIVES,
	type NormalizedSource,
} from "./orchestration-sources";
import {
	GENERIC_RULES,
	orchestrate,
	type OrchestrationDecision,
	type OrchestrationEvidence,
} from "./orchestration";

/** Channel-input data the Google Ads consumer needs for one source. */
export interface GoogleAdsChannelInputs {
	name: string;
	target_url: string;
	cta: string;
	audience: string | null;
	source_facts: string[];
	daily_budget: number;
	geo_target_id: number;
	ad_groups: AdGroupHint[];
	sitelinks: SitelinkHint[];
}

// ---------------------------------------------------------------------------
// Series 2026: registry/object-derived source (NWANA-RACE-000001)
// ---------------------------------------------------------------------------

const SERIES_HUB = "https://series.nwaofna.org";

const seriesAdGroups: AdGroupHint[] = [
	{
		name: "Nordic Walking Races",
		default_cpc: 2.0,
		keywords: [
			{ text: "nordic walking races", match_type: "PHRASE" },
			{ text: "virtual nordic walking race", match_type: "PHRASE" },
			{ text: "nordic walking competition", match_type: "PHRASE" },
			{ text: "nordic walking race series", match_type: "EXACT" },
		],
		ads: [
			{
				headlines: [
					"Nordic Walking Races",
					"Weekly Virtual Races USA",
					"1K to 20K Distances",
					"Official U.S. Federation",
					"Race With Poles Nationwide",
					"Join the 2026 Series",
				],
				descriptions: [
					"Weekly virtual Nordic walking races across North America, from 1K to 20K.",
					"Official federation series with verified results and season standings.",
					"Register on RunSignup and race anywhere in the U.S.",
				],
				final_url: SERIES_HUB,
			},
			{
				headlines: [
					"Virtual Walking Races",
					"Nordic Walking Series 2026",
					"Compete From Anywhere",
					"Real Results, Real Rankings",
					"All Levels Welcome",
					"Weekly Start Lines",
				],
				descriptions: [
					"Nordic walking races every week. Walk your distance, submit your result.",
					"Five performance levels, so every walker races fairly.",
					"Season standings on the official series hub.",
				],
				final_url: SERIES_HUB,
			},
		],
	},
	{
		name: "Join Virtual Races",
		default_cpc: 2.0,
		keywords: [
			{ text: "join virtual walking race", match_type: "PHRASE" },
			{ text: "online walking race registration", match_type: "PHRASE" },
			{ text: "virtual race with poles", match_type: "PHRASE" },
		],
		ads: [
			{
				headlines: [
					"Join a Virtual Race",
					"Nordic Walking Events",
					"Register in Minutes",
					"Race Anywhere in the USA",
					"Weekly Race Calendar",
					"Start This Weekend",
				],
				descriptions: [
					"Pick your distance, register online, walk your race, submit your time.",
					"New virtual Nordic walking races every week through December 2026.",
					"Official results and standings from the U.S. federation.",
				],
				final_url: SERIES_HUB,
			},
			{
				headlines: [
					"Walk. Race. Rank.",
					"Nordic Walking for Everyone",
					"Your Pace, Your Level",
					"Federation-Verified Results",
					"1K, 3K, 5K, 10K, 20K",
					"Free to Browse Events",
				],
				descriptions: [
					"Five performance levels mean you compete against walkers at your level.",
					"Register for the next virtual race and see your name in the standings.",
					"Run by the nonprofit federation for Nordic walking in North America.",
				],
				final_url: SERIES_HUB,
			},
		],
	},
];

const seriesSitelinks: SitelinkHint[] = [
	{ text: "Race Calendar", final_url: SERIES_HUB, description: "Every upcoming virtual race" },
	{ text: "Results & Standings", final_url: SERIES_HUB, description: "Verified results by level" },
	{ text: "How It Works", final_url: SERIES_HUB, description: "Race, submit, rank" },
];

// ---------------------------------------------------------------------------
// Founding Circle: owner directive source (DIR-FOUNDING-CIRCLE-2026)
// ---------------------------------------------------------------------------

const FC_DONATE = NWANA_RUNSIGNUP_DONATION_URL;
const FC_ABOUT = "https://nwaofna.org";

const foundingCircleAdGroups: AdGroupHint[] = [
	{
		name: "Support Nordic Walking",
		default_cpc: 2.0,
		keywords: [
			{ text: "support nordic walking", match_type: "PHRASE" },
			{ text: "donate to sports nonprofit", match_type: "PHRASE" },
			{ text: "nordic walking federation donation", match_type: "PHRASE" },
		],
		ads: [
			{
				headlines: [
					"Support Nordic Walking",
					"Tax-Deductible Donation",
					"Build the U.S. Federation",
					"501(c)(3) Nonprofit",
					"Fund Youth Walking Sport",
					"Donate Today",
				],
				descriptions: [
					"Your tax-deductible gift builds Nordic walking as a recognized sport in North America.",
					"NWANA is a 501(c)(3) nonprofit federation running national virtual race series.",
					"Donations fund competitions, coaching, and the instructor pipeline.",
				],
				final_url: FC_DONATE,
			},
			{
				headlines: [
					"Donate to the Federation",
					"Grow Walking Sport in the USA",
					"501(c)(3) Tax-Deductible",
					"Every Gift Builds the Sport",
					"Transparent Nonprofit",
					"Give Securely Online",
				],
				descriptions: [
					"Help take Nordic walking from a niche activity to a continental sport.",
					"Secure online donation to the official North American federation.",
					"Your gift is tax-deductible to the full extent of the law.",
				],
				final_url: FC_DONATE,
			},
		],
	},
	{
		name: "Amateur Sports Giving",
		default_cpc: 2.0,
		keywords: [
			{ text: "donate to amateur sports", match_type: "PHRASE" },
			{ text: "support youth sports nonprofit", match_type: "PHRASE" },
			{ text: "walking sport charity donation", match_type: "PHRASE" },
		],
		ads: [
			{
				headlines: [
					"Give to Amateur Sport",
					"Walking for All Ages",
					"Tax-Deductible Sports Gift",
					"National Race Series",
					"Certified Instructors",
					"Donate in Minutes",
				],
				descriptions: [
					"Support free and low-cost Nordic walking competitions across the country.",
					"NWANA certifies instructors and runs the national virtual series.",
					"Make a secure tax-deductible donation online today.",
				],
				final_url: FC_DONATE,
			},
			{
				headlines: [
					"Fuel the Walking Movement",
					"Donate to NWANA",
					"501(c)(3) Public Charity",
					"Competitions Need You",
					"Build Something Continental",
					"Secure Online Giving",
				],
				descriptions: [
					"One federation, one continent, one sport. Your gift makes it real.",
					"Donations power race operations, results verification, and standings.",
					"Give securely online. Every dollar stays in the sport.",
				],
				final_url: FC_ABOUT,
			},
		],
	},
];

const foundingCircleSitelinks: SitelinkHint[] = [
	{ text: "Donate Now", final_url: FC_DONATE, description: "Secure tax-deductible gift" },
	{ text: "About NWANA", final_url: FC_ABOUT, description: "The federation story" },
	{ text: "Race Series", final_url: "https://series.nwaofna.org", description: "What your gift powers" },
];

/**
 * Explicit Google Ads channel inputs, keyed by source identity. A source
 * without an entry here has no recorded channel inputs; the intent
 * production reports that instead of inventing copy.
 */
export const GOOGLE_ADS_CHANNEL_INPUTS: Readonly<Record<string, GoogleAdsChannelInputs>> = {
	"NWANA-RACE-000001": {
		name: "NWANA \u00b7 Series 2026 \u00b7 Virtual Races",
		target_url: SERIES_HUB,
		// Verified CTA from the distribution action metadata
		// (migrations/0013-add-series-hub-work-items.sql).
		cta: "Visit the Series hub and choose a distance",
		audience: null,
		// Registry-verified facts only (registry/objects.yaml):
		// season 2026, program_family OPEN_SERIES, purpose SERIES_PUBLIC_HUB.
		source_facts: [
			"season 2026",
			"program family OPEN_SERIES",
			"registry purpose SERIES_PUBLIC_HUB",
		],
		daily_budget: 200,
		geo_target_id: 2840,
		ad_groups: seriesAdGroups,
		sitelinks: seriesSitelinks,
	},
	"DIR-FOUNDING-CIRCLE-2026": {
		name: "NWANA \u00b7 Founding Circle \u00b7 Donate",
		target_url: FC_DONATE,
		cta: "Donate Now",
		audience: null,
		source_facts: [
			"NWANA is a 501(c)(3) public charity",
			"donations are tax-deductible",
		],
		daily_budget: 100,
		geo_target_id: 2840,
		ad_groups: foundingCircleAdGroups,
		sitelinks: foundingCircleSitelinks,
	},
};

function findAction(actionId: string): DistributionActionConfig | undefined {
	return DISTRIBUTION_ACTIONS.find((a) => a.action_id === actionId);
}

/**
 * Builds the channel-specific Google Ads intent for one DECIDED decision.
 * Dispatches on the source kind through the registered adapters; adding
 * a new source kind means adding an adapter, not editing a switch.
 *
 * Recorded channel inputs (GOOGLE_ADS_CHANNEL_INPUTS) are used when
 * present. A DECIDED source without recorded inputs is NOT an error:
 * the intent is built partial, carrying only confirmed facts from the
 * normalized source (identity, factual name, purpose, confirmed
 * donation destination, source facts). Missing campaign fields stay
 * missing; the ADR-0031 pipeline turns the partial intent into an
 * INSUFFICIENT_INPUT proposal with the exact missing fields.
 */
export function buildGoogleAdsIntent(
	source: NormalizedSource,
	decision: OrchestrationDecision,
): AdapterResult {
	const inputs = GOOGLE_ADS_CHANNEL_INPUTS[source.source_identity];
	// Partial-intent fallbacks: confirmed facts only, never invented.
	const partialName = inputs?.name ?? source.factual_title ?? null;
	const partialTargetUrl =
		inputs?.target_url ?? source.donation_destinations[0]?.url ?? null;
	const partialFacts = inputs ? inputs.source_facts : [...source.source_facts];

	if (source.source_kind === "REGISTRY_OBJECT") {
		const actionEvidence = decision.evidence.find(
			(e) => e.kind === "DISTRIBUTION_ACTION",
		);
		const action = actionEvidence ? findAction(actionEvidence.reference) : undefined;
		return adaptRegistryObject({
			object_id: source.canonical_object_id ?? source.source_identity,
			// The raw registry/objects.yaml record has no formal
			// object_type or title fields; only the real fields are
			// linked, nothing is promoted or inferred.
			object_type: null,
			title: null,
			// Provenance comes from the orchestration decision's
			// evidence, not from a hardcoded feed.
			distribution: action
				? { action_id: action.action_id, rule_id: action.rule_id, channel: action.channel }
				: undefined,
			purpose: source.purpose ?? "",
			name: partialName,
			target_url: partialTargetUrl,
			cta: inputs?.cta ?? null,
			audience: inputs?.audience ?? null,
			source_facts: partialFacts,
			daily_budget: inputs?.daily_budget ?? null,
			geo_target_id: inputs?.geo_target_id ?? null,
			ad_groups: inputs?.ad_groups ?? [],
			sitelinks: inputs?.sitelinks ?? [],
		});
	}

	if (source.source_kind === "OWNER_DIRECTIVE") {
		return adaptOwnerDirective({
			directive_id: source.source_identity,
			purpose: source.purpose ?? "",
			campaign_name: partialName,
			target_url: partialTargetUrl,
			cta: inputs?.cta ?? null,
			audience: inputs?.audience ?? null,
			source_facts: partialFacts,
			daily_budget: inputs?.daily_budget ?? null,
			geo_target_id: inputs?.geo_target_id ?? null,
			ad_groups: inputs?.ad_groups ?? [],
			sitelinks: inputs?.sitelinks ?? [],
			// No explicit confirmed source object relationship and no
			// confirmed Google Ads distribution action: both stay null
			// rather than invented.
			source_object: null,
		});
	}

	if (source.source_kind === "RULE_DERIVED_ASSET") {
		return adaptRuleDerivedAsset({
			asset_id: source.source_identity,
			name: partialName,
			purpose: source.purpose ?? "",
			target_url: partialTargetUrl,
			cta: inputs?.cta ?? null,
			audience: inputs?.audience ?? null,
			source_facts: partialFacts,
			daily_budget: inputs?.daily_budget ?? null,
			geo_target_id: inputs?.geo_target_id ?? null,
			ad_groups: inputs?.ad_groups ?? [],
			sitelinks: inputs?.sitelinks ?? [],
		});
	}

	if (source.source_kind === "FUND") {
		return adaptFund({
			fund_id: source.source_identity,
			name: source.factual_title,
			purpose: source.purpose ?? "",
			campaign_name: partialName,
			target_url: partialTargetUrl,
			cta: inputs?.cta ?? null,
			audience: inputs?.audience ?? null,
			source_facts: partialFacts,
			daily_budget: inputs?.daily_budget ?? null,
			geo_target_id: inputs?.geo_target_id ?? null,
			ad_groups: inputs?.ad_groups ?? [],
			sitelinks: inputs?.sitelinks ?? [],
		});
	}

	if (source.source_kind === "SPONSORSHIP_ASSET") {
		return adaptSponsorshipAsset({
			asset_id: source.source_identity,
			name: source.factual_title,
			purpose: source.purpose ?? "",
			campaign_name: partialName,
			target_url: partialTargetUrl,
			cta: inputs?.cta ?? null,
			audience: inputs?.audience ?? null,
			source_facts: partialFacts,
			daily_budget: inputs?.daily_budget ?? null,
			geo_target_id: inputs?.geo_target_id ?? null,
			ad_groups: inputs?.ad_groups ?? [],
			sitelinks: inputs?.sitelinks ?? [],
		});
	}

	return {
		ok: false,
		error:
			`No Google Ads adapter registered for source kind ${source.source_kind}. ` +
			`Adding the kind means adding an adapter.`,
	};
}

export function evidenceBundle(): OrchestrationEvidence {
	return {
		actions: DISTRIBUTION_ACTIONS,
		directives: OWNER_DIRECTIVES,
		genericRules: GENERIC_RULES,
	};
}

/**
 * Explicit owner evidence outranks generic rule evidence for the same
 * logical campaign: when two decisions resolve to the same proposal
 * identity, the intent shaped by the stronger evidence wins.
 */
function evidenceRank(decision: OrchestrationDecision): number {
	const ranks: Record<string, number> = {
		OWNER_DIRECTIVE: 0,
		DISTRIBUTION_ACTION: 1,
		DISTRIBUTION_RULE: 2,
		GENERIC_RULE: 3,
	};
	const kinds = decision.evidence.map((e) => ranks[e.kind] ?? 99);
	return kinds.length > 0 ? Math.min(...kinds) : 99;
}

/**
 * The production Google Ads intent feed: all canonical sources (static
 * plus live D1 stores) -> orchestration -> DECIDED GOOGLE_ADS decisions
 * -> channel intents. D1-backed sources flow into the same feed as
 * static sources; no source kind is excluded.
 *
 * One intent per logical campaign: decisions that resolve to the same
 * proposal identity are deduplicated (explicit evidence wins over
 * generic rule evidence), so the generic fundraising rule can never
 * create a duplicate proposal for a campaign the owner already ordered.
 */
export async function orchestrationGoogleAdsIntents(
	db: D1Database | null,
): Promise<NormalizedCampaignIntent[]> {
	const sources = await collectSources(db);
	const decisions = orchestrate(sources, evidenceBundle());
	const byIdentity = new Map(sources.map((s) => [s.source_identity, s]));
	const deduped = new Map<string, { decision: OrchestrationDecision; intent: NormalizedCampaignIntent }>();
	for (const decision of decisions) {
		if (decision.state !== "DECIDED" || decision.channel !== "GOOGLE_ADS") continue;
		const source = byIdentity.get(decision.source_identity);
		if (!source) {
			throw new Error(
				`Orchestration decision ${decision.decision_id} names unknown source ${decision.source_identity}`,
			);
		}
		const built = buildGoogleAdsIntent(source, decision);
		if (!built.ok) {
			throw new Error(
				`Google Ads intent for decision ${decision.decision_id} failed: ${built.error}`,
			);
		}
		const id = proposalIdentity(built.intent);
		const existing = deduped.get(id);
		if (!existing || evidenceRank(decision) < evidenceRank(existing.decision)) {
			deduped.set(id, { decision, intent: built.intent });
		}
	}
	// Feed order follows the winning decision's decision_id order, exactly
	// as before deduplication: adding generic-rule decisions never
	// reorders the intents existing consumers already see.
	return [...deduped.values()]
		.sort((a, b) =>
			a.decision.decision_id < b.decision.decision_id
				? -1
				: a.decision.decision_id > b.decision.decision_id
					? 1
					: 0,
		)
		.map((entry) => entry.intent);
}

/**
 * Full orchestration run for the owner-facing view: all sources (static
 * plus live D1 stores), every decision, Google Ads decisions resolved to
 * their channel_intent_id, optional downstream consumer states attached.
 */
export async function getOrchestrationDecisions(
	db: D1Database | null,
	downstreamByIntentId?: ReadonlyMap<string, string>,
): Promise<OrchestrationDecision[]> {
	const sources = await collectSources(db);
	const byIdentity = new Map(sources.map((s) => [s.source_identity, s]));
	const decisions = orchestrate(sources, evidenceBundle());
	for (const decision of decisions) {
		if (decision.state !== "DECIDED" || decision.channel !== "GOOGLE_ADS") continue;
		const source = byIdentity.get(decision.source_identity);
		if (!source) continue;
		const built = buildGoogleAdsIntent(source, decision);
		if (built.ok) {
			decision.channel_intent_id = proposalIdentity(built.intent);
			const downstreamState = downstreamByIntentId?.get(decision.channel_intent_id);
			if (downstreamState) {
				decision.downstream = { consumer: "GOOGLE_ADS", state: downstreamState };
			}
		}
	}
	return decisions;
}
