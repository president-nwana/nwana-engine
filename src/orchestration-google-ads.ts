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
// Challenge Sport · Walking: owner directive source (DIR-CHALLENGE-SPORT-WALKING-2026)
// First new-funnel launch 2026-10-10 (volume driver). Owner-approved launch package:
// google-ads/launch-package-funnel1-2.md. All copy verified against RSA limits
// (headlines <=30, descriptions <=90) and Ad Grants policy (exact/phrase only,
// 2+ words per keyword, 2+ ads per ad group, 2+ sitelinks).
// ---------------------------------------------------------------------------

const CHALLENGE_HOME = "https://challenges.nwaofna.org";
const CHALLENGE_FUNDRAISING = "https://challenges.nwaofna.org/fundraising";
const CHALLENGE_FUNDRAISING_TEAMS = "https://challenges.nwaofna.org/fundraising-teams";
const CHALLENGE_HOW = "https://challenges.nwaofna.org/how-it-works";
const CHALLENGE_TEAMS = "https://challenges.nwaofna.org/teams";
const CHALLENGE_DISCIPLINES = "https://challenges.nwaofna.org/disciplines";

const walkingAdGroups: AdGroupHint[] = [
	{
		name: "Virtual Walking Challenge",
		default_cpc: 1.5,
		keywords: [
			{ text: "virtual walking challenge", match_type: "EXACT" },
			{ text: "virtual walking challenge", match_type: "PHRASE" },
			{ text: "online walking challenge", match_type: "EXACT" },
			{ text: "online walking challenge", match_type: "PHRASE" },
			{ text: "virtual step challenge", match_type: "EXACT" },
			{ text: "virtual step challenge", match_type: "PHRASE" },
		],
		ads: [
			{
				headlines: [
					"Free Virtual Walking Challenge",
					"Join the NWANA Challenge",
					"Walk Anywhere, Anytime",
					"Track Miles, Earn Recognition",
					"All Levels Welcome",
					"Walk for a Good Cause",
					"Free to Join — Start Today",
					"Virtual Walking Challenge 2026",
				],
				descriptions: [
					"Join the free virtual walking challenge and support instructor education.",
					"Free to join. Track miles, join teams, climb leaderboards — every mile counts.",
					"Walk anywhere, anytime. Register free and turn your miles into impact.",
				],
				final_url: CHALLENGE_HOME,
			},
			{
				headlines: [
					"Virtual Walking Challenge",
					"Free to Join Today",
					"Walk Your Own Way",
					"Every Mile Counts",
					"Join Thousands Walking",
					"Start Your Challenge",
					"No Cost to Participate",
				],
				descriptions: [
					"Sign up free and walk on your schedule. Your miles fund instructor education.",
					"The charity walking challenge is open to all levels. Register today.",
				],
				final_url: CHALLENGE_HOME,
			},
		],
	},
	{
		name: "Free Virtual Challenge",
		default_cpc: 1.5,
		keywords: [
			{ text: "free virtual walking challenge", match_type: "EXACT" },
			{ text: "free virtual walking challenge", match_type: "PHRASE" },
			{ text: "free walking challenge", match_type: "EXACT" },
			{ text: "free walking challenge", match_type: "PHRASE" },
			{ text: "free virtual challenge", match_type: "EXACT" },
		],
		ads: [
			{
				headlines: [
					"Free Virtual Walking Challenge",
					"100% Free to Join",
					"No Fees, Just Walking",
					"Join Free Today",
					"Virtual Challenge — Free",
					"Walk for Charity, Free",
					"Start Walking Free",
					"Free Walking Challenge",
				],
				descriptions: [
					"The NWANA Charity Challenge is completely free. Register and start walking today.",
					"Free participation, real impact. Your miles support free instructor education.",
				],
				final_url: CHALLENGE_HOME,
			},
			{
				headlines: [
					"Free Walking Challenge",
					"Zero Fees, All Fun",
					"Join Without Paying",
					"Walk Free Today",
					"Completely Free Entry",
					"Start Free Now",
				],
				descriptions: [
					"No entry fee, no hidden costs. Just walk and make a difference.",
					"Register free in minutes and start your walking challenge.",
				],
				final_url: CHALLENGE_HOME,
			},
		],
	},
	{
		name: "Charity Walking Challenge",
		default_cpc: 1.5,
		keywords: [
			{ text: "charity walking challenge", match_type: "EXACT" },
			{ text: "charity walking challenge", match_type: "PHRASE" },
			{ text: "charity walk challenge", match_type: "EXACT" },
			{ text: "charity walk challenge", match_type: "PHRASE" },
		],
		ads: [
			{
				headlines: [
					"Charity Walking Challenge",
					"Walk for a Cause",
					"Turn Miles Into Donations",
					"Charity Challenge 2026",
					"Walk. Fundraise. Impact.",
					"Join the Charity Challenge",
				],
				descriptions: [
					"Turn your miles into fundraising for free instructor education. Join free.",
					"Join the charity walking challenge. Walk, fundraise, and grow the mission.",
				],
				final_url: CHALLENGE_FUNDRAISING,
			},
			{
				headlines: [
					"Walk for Charity Today",
					"Make Miles Matter",
					"Charity Walk 2026",
					"Fundraise While Walking",
					"Give Back by Walking",
				],
				descriptions: [
					"Your steps can fund free instructor training. Join the challenge.",
					"Walk, raise funds, and help grow Nordic walking across America.",
				],
				final_url: CHALLENGE_FUNDRAISING,
			},
		],
	},
];

const walkingSitelinks: SitelinkHint[] = [
	{ text: "How It Works", final_url: CHALLENGE_HOW, description: "Join, walk, submit results" },
	{ text: "Create a Team", final_url: CHALLENGE_TEAMS, description: "Walk together, raise together" },
	{ text: "Disciplines", final_url: CHALLENGE_DISCIPLINES, description: "Walk, run, cycle and more" },
	{ text: "Fundraising", final_url: CHALLENGE_FUNDRAISING, description: "Turn miles into donations" },
];

// ---------------------------------------------------------------------------
// Fundraise · Walk for Charity: owner directive source (DIR-FUNDRAISE-WALK-CHARITY-2026)
// Second new-funnel launch 2026-10-10 (money intent). Same package and limits.
// ---------------------------------------------------------------------------

const fundraiseAdGroups: AdGroupHint[] = [
	{
		name: "Walk for Charity",
		default_cpc: 1.5,
		keywords: [
			{ text: "walk for charity", match_type: "EXACT" },
			{ text: "walk for charity", match_type: "PHRASE" },
			{ text: "walking for charity", match_type: "EXACT" },
			{ text: "walking for charity", match_type: "PHRASE" },
		],
		ads: [
			{
				headlines: [
					"Walk for Charity",
					"Turn Miles Into Donations",
					"Start Fundraising Today",
					"Charity Walking Challenge",
					"Raise Funds Walking",
					"Your Miles, Their Future",
					"Walk. Raise. Impact.",
				],
				descriptions: [
					"Create a free fundraiser and turn every mile you walk into support.",
					"Walk for charity with NWANA. Start fundraising in minutes — free to join.",
				],
				final_url: CHALLENGE_FUNDRAISING,
			},
			{
				headlines: [
					"Charity Walk Fundraiser",
					"Raise Money Walking",
					"Start Your Fundraiser",
					"Walk With Purpose",
					"Donations Through Walking",
				],
				descriptions: [
					"Turn your daily walks into donations for a nonprofit mission.",
					"Set up your fundraiser in minutes. Every mile raises support.",
				],
				final_url: CHALLENGE_FUNDRAISING,
			},
		],
	},
	{
		name: "Fundraising Challenge",
		default_cpc: 1.5,
		keywords: [
			{ text: "fundraising walking challenge", match_type: "EXACT" },
			{ text: "fundraising walking challenge", match_type: "PHRASE" },
			{ text: "charity walk fundraiser", match_type: "EXACT" },
			{ text: "charity walk fundraiser", match_type: "PHRASE" },
		],
		ads: [
			{
				headlines: [
					"Fundraising Walking Challenge",
					"Walk & Fundraise",
					"Take the Challenge",
					"Join the Fundraising Challenge",
				],
				descriptions: [
					"Join a fundraising walking challenge where your miles fund free instructor education.",
					"Free to join. Walk, fundraise, and multiply your impact with a team.",
				],
				final_url: CHALLENGE_FUNDRAISING,
			},
			{
				headlines: [
					"Join a Fundraising Walk",
					"Challenge for Charity",
					"Walk, Give, Repeat",
					"Fundraise With Every Step",
				],
				descriptions: [
					"Combine walking with giving. Your challenge funds instructor education.",
					"Invite friends, form a team, and fundraise together.",
				],
				final_url: CHALLENGE_FUNDRAISING,
			},
		],
	},
	{
		name: "Team Fundraising",
		default_cpc: 1.5,
		keywords: [
			{ text: "team fundraising challenge", match_type: "EXACT" },
			{ text: "team fundraising challenge", match_type: "PHRASE" },
			{ text: "fundraising team challenge", match_type: "EXACT" },
			{ text: "fundraising team challenge", match_type: "PHRASE" },
		],
		ads: [
			{
				headlines: [
					"Team Fundraising Challenge",
					"Fundraise as a Team",
					"Start a Fundraising Team",
					"Teams That Give Back",
				],
				descriptions: [
					"Create a fundraising team and multiply your impact. Free to start.",
					"Walk together, fundraise together. Launch your team in the Charity Challenge.",
				],
				final_url: CHALLENGE_FUNDRAISING_TEAMS,
			},
			{
				headlines: [
					"Build a Giving Team",
					"Team Up for Charity",
					"Group Fundraising Walk",
					"Stronger Together",
				],
				descriptions: [
					"Rally your crew around a cause. Team fundraising multiplies impact.",
					"Create your team today and start turning miles into donations.",
				],
				final_url: CHALLENGE_FUNDRAISING_TEAMS,
			},
		],
	},
];

const fundraiseSitelinks: SitelinkHint[] = [
	{ text: "Start Fundraising", final_url: CHALLENGE_FUNDRAISING, description: "Create your fundraiser" },
	{ text: "Fundraising Teams", final_url: CHALLENGE_FUNDRAISING_TEAMS, description: "Multiply impact together" },
	{ text: "Donate", final_url: CHALLENGE_FUNDRAISING, description: "Support the mission" },
	{ text: "How It Works", final_url: CHALLENGE_HOW, description: "Join, walk, submit results" },
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
	"DIR-CHALLENGE-SPORT-WALKING-2026": {
		name: "NWANA · Challenge Sport · Walking",
		target_url: CHALLENGE_HOME,
		cta: "Join free",
		audience: null,
		source_facts: [
			"Keyword Planner US: virtual walking challenge 720/mo",
			"free virtual walking challenge 110/mo; charity walking challenge 10/mo",
			"owner-approved launch package 2026-10-10",
		],
		daily_budget: 70,
		geo_target_id: 2840,
		ad_groups: walkingAdGroups,
		sitelinks: walkingSitelinks,
	},
	"DIR-FUNDRAISE-WALK-CHARITY-2026": {
		name: "NWANA · Fundraise · Walk for Charity",
		target_url: CHALLENGE_FUNDRAISING,
		cta: "Start fundraising",
		audience: null,
		source_facts: [
			"Keyword Planner US: walk for charity 480/mo",
			"top-page bids above the $2 Ad Grants cap; lower-auction impressions",
			"owner-approved launch package 2026-10-10",
		],
		daily_budget: 40,
		geo_target_id: 2840,
		ad_groups: fundraiseAdGroups,
		sitelinks: fundraiseSitelinks,
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
