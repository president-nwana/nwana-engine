/**
 * Current Google Ads proposal intents (migration layer).
 *
 * The two existing proposals (Series 2026, Founding Circle) now enter
 * the universal pipeline through source adapters, exactly like any
 * future proposal will. The existing factual campaign content is
 * carried as explicit supplied hints/input: nothing is re-invented,
 * and no Series/Fund/FoundingCircle-specific logic lives in the
 * generic core (google-ads-proposals.ts).
 *
 * This module also builds the reconcile-facing desired state from
 * the same intents, so /api/operating-center/google-ads/desired-state
 * keeps serving byte-identical campaign specs.
 */

import {
	validateDesiredState,
	type CampaignSpec,
	type DesiredState,
} from "./google-ads-state";
import {
	adaptOwnerDirective,
	adaptRegistryObject,
	proposalIdentity,
	type AdGroupHint,
	type NormalizedCampaignIntent,
	type SitelinkHint,
} from "./google-ads-intent";
import { buildCampaignSpecFromIntent } from "./google-ads-proposals";

// ---------------------------------------------------------------------------
// Series 2026: registry/object-derived source
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
// Founding Circle: owner directive source
// ---------------------------------------------------------------------------

const FC_DONATE = "https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT";
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

// ---------------------------------------------------------------------------
// Current intents
// ---------------------------------------------------------------------------

/**
 * The normalized intents behind the two current proposals. Both go
 * through the same adapters and the same generic pipeline as any
 * future proposal.
 */
export function currentProposalIntents(): NormalizedCampaignIntent[] {
	const intents: NormalizedCampaignIntent[] = [];

	const series = adaptRegistryObject({
		object_id: "NWANA-RACE-000001",
		// The raw registry/objects.yaml record has no formal
		// object_type or title fields; only the real fields are
		// linked, nothing is promoted or inferred.
		object_type: null,
		title: null,
		// Confirmed distribution provenance (migrations/0006):
		// ACT-SERIES-HUB-GOOGLE-ADS, action_type GOOGLE_ADS_CAMPAIGN,
		// channel GOOGLE_ADS_GRANT, rule RULE-OPEN-SERIES-HUB.
		distribution: {
			action_id: "ACT-SERIES-HUB-GOOGLE-ADS",
			rule_id: "RULE-OPEN-SERIES-HUB",
			channel: "GOOGLE_ADS_GRANT",
		},
		purpose: "VIRTUAL_RACES",
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
	});
	if (!series.ok) {
		throw new Error(`Series intent failed to normalize: ${series.error}`);
	}
	intents.push(series.intent);

	const foundingCircle = adaptOwnerDirective({
		// Stable directive id: the owner ordered this proposal
		// directly, so no source object or distribution rule exists.
		directive_id: "DIR-FOUNDING-CIRCLE-2026",
		purpose: "FOUNDING_CIRCLE",
		campaign_name: "NWANA \u00b7 Founding Circle \u00b7 Donate",
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
		// No explicit confirmed source object relationship and no
		// confirmed Google Ads distribution action: both stay null
		// rather than invented.
		source_object: null,
	});
	if (!foundingCircle.ok) {
		throw new Error(`Founding Circle intent failed to normalize: ${foundingCircle.error}`);
	}
	intents.push(foundingCircle.intent);

	return intents;
}

/**
 * Reconcile-facing desired state, built from the current intents
 * through the generic builder. Output is identical to the previous
 * hardcoded builders: same campaign names, budgets, geo, ad groups,
 * keywords, ads, and sitelinks.
 */
export function buildDesiredState(): DesiredState {
	const campaigns: CampaignSpec[] = [];
	for (const intent of currentProposalIntents()) {
		const built = buildCampaignSpecFromIntent(intent);
		if (!built.ok) {
			throw new Error(
				`Google Ads desired state: intent ${proposalIdentity(intent)} ` +
				`has insufficient input: ${built.missing_fields.join(", ")}`,
			);
		}
		campaigns.push(built.spec);
	}
	const state: DesiredState = {
		version: "2026-09-22",
		generated_at: new Date().toISOString(),
		campaigns,
	};
	const violations = validateDesiredState(state);
	if (violations.length > 0) {
		throw new Error(`Desired state violates Ad Grants policy: ${violations.join("; ")}`);
	}
	return state;
}
