/**
 * Google Ads desired-state builder (ADR-0016).
 *
 * The machine publishes the campaigns it wants in the NWANA Ad Grants
 * account as JSON. A Google Ads script pasted once into the Ads UI fetches
 * this endpoint hourly and reconciles the account to the spec.
 *
 * Every spec is validated against the Ad Grants program policy BEFORE it
 * leaves the machine. A violation is a build-time error, never a live
 * account suspension risk. Campaigns are always created PAUSED: a human
 * reviews and enables them (Albert's "presses Send" model, and the
 * advertiser-responsibility rule for AI-assisted content).
 */

export type KeywordMatchType = "EXACT" | "PHRASE";

export interface KeywordSpec {
	text: string;
	match_type: KeywordMatchType;
}

export interface ResponsiveAdSpec {
	headlines: string[];
	descriptions: string[];
	final_url: string;
}

export interface AdGroupSpec {
	name: string;
	default_cpc: number;
	keywords: KeywordSpec[];
	ads: ResponsiveAdSpec[];
}

export interface SitelinkSpec {
	text: string;
	final_url: string;
	description?: string;
}

export interface SourceObjectLink {
	/** Real object id from the existing NWANA object model. */
	object_id: string;
	/**
	 * Object type as recorded in the existing object model.
	 * Null when the record has no formal object_type field;
	 * never filled by inference.
	 */
	object_type: string | null;
	/**
	 * Title as recorded in the existing object model.
	 * Null when the record has no formal title field;
	 * never filled by inference.
	 */
	title: string | null;
}

/**
 * Where a Google Ads proposal comes from.
 *
 * OBJECT_DERIVED: the proposal exists because an NWANA object drives it
 * (source_object is required).
 *
 * OWNER_DIRECTIVE: the proposal exists because the owner directly ordered
 * it. A prior distribution rule and a source object are not required.
 */
export type ProposalOrigin = "OBJECT_DERIVED" | "OWNER_DIRECTIVE";

/**
 * Bridge between the Distribution Planner and a Google Ads proposal.
 * Provenance metadata only: a proposal's eligibility never depends on
 * the presence of a distribution rule. Every field comes from a real
 * distribution rule/action; a missing action is never fabricated.
 */
export interface DistributionLink {
	/** Real action id from the distribution rules seed, or null. */
	action_id: string | null;
	/** Real rule id from the distribution rules seed, or null. */
	rule_id: string | null;
	/** Real channel from the distribution action, or null. */
	channel: string | null;
}

export interface CampaignSpec {
	/** Stable identifier; the script finds campaigns by exact name. */
	name: string;
	daily_budget: number;
	ad_groups: AdGroupSpec[];
	sitelinks: SitelinkSpec[];
	/** United States geo target constant. */
	geo_target_id: number;
	/**
	 * Real NWANA object this proposal is built for, from the existing
	 * object model. Null only when no suitable object exists yet; a
	 * missing linkage is never fabricated.
	 */
	source_object: SourceObjectLink | null;
	/**
	 * Distribution-planner backing for this proposal. Provenance
	 * metadata only (see migrations/0006); eligibility never depends
	 * on it.
	 */
	distribution: DistributionLink;
	/**
	 * Where this proposal comes from. Null/unknown origin always
	 * means not eligible.
	 */
	origin: ProposalOrigin | null;
	/** The script creates every campaign paused. Hardcoded true, not a spec field. */
}


export interface DesiredState {
	version: string;
	generated_at: string;
	campaigns: CampaignSpec[];
}

export const AD_GRANTS_POLICY = {
	/** Shared grant budget across the whole account, USD/day. */
	max_total_daily_budget: 329,
	/** Max CPC unless the campaign uses Maximize Conversions / Maximize Conversion Value. */
	max_manual_cpc: 2.0,
	min_ad_groups_per_campaign: 2,
	min_ads_per_ad_group: 2,
	min_sitelinks_per_campaign: 2,
	min_headlines_per_ad: 3,
	min_descriptions_per_ad: 2,
	/** Ad Grants forbids single-word and overly generic keywords. */
	min_keyword_words: 2,
} as const;

const NWANA_PREFIX = "NWANA \u00b7 ";

/** Most common final URL across all ads; the campaign's target URL. */
export function proposalTargetUrl(spec: CampaignSpec): string {
	const counts = new Map<string, number>();
	for (const group of spec.ad_groups) {
		for (const ad of group.ads) {
			counts.set(ad.final_url, (counts.get(ad.final_url) ?? 0) + 1);
		}
	}
	let best = "";
	let bestCount = -1;
	for (const [url, count] of counts) {
		if (count > bestCount) {
			best = url;
			bestCount = count;
		}
	}
	return best;
}

/**
 * A proposal is creation-eligible when it has a valid HTTPS target URL,
 * passes the Ad Grants policy validator with zero violations, and its
 * origin is known: OBJECT_DERIVED with a real source object, or
 * OWNER_DIRECTIVE. Distribution provenance never affects eligibility.
 * Actual creation still requires owner review.
 */
export function isCreationEligible(campaign: CampaignSpec): boolean {
	const origin = campaign.origin;
	const originOk =
		(origin === "OBJECT_DERIVED" && campaign.source_object !== null) ||
		origin === "OWNER_DIRECTIVE";
	if (!originOk) {
		return false;
	}
	if (!/^https:\/\//.test(proposalTargetUrl(campaign))) {
		return false;
	}
	return validateCampaignSpec(campaign).length === 0;
}

export function validateCampaignSpec(spec: CampaignSpec): string[] {
	const violations: string[] = [];
	if (!spec.name.startsWith(NWANA_PREFIX)) {
		violations.push(`campaign name must start with "${NWANA_PREFIX}" so the script never touches foreign campaigns`);
	}
	if (!(spec.daily_budget > 0)) {
		violations.push("daily_budget must be positive");
	}
	if (spec.ad_groups.length < AD_GRANTS_POLICY.min_ad_groups_per_campaign) {
		violations.push(`at least ${AD_GRANTS_POLICY.min_ad_groups_per_campaign} ad groups required, got ${spec.ad_groups.length}`);
	}
	for (const group of spec.ad_groups) {
		if (!(group.default_cpc > 0) || group.default_cpc > AD_GRANTS_POLICY.max_manual_cpc) {
			violations.push(`ad group "${group.name}": default_cpc must be within (0, ${AD_GRANTS_POLICY.max_manual_cpc}]`);
		}
		for (const keyword of group.keywords) {
			const words = keyword.text.trim().split(/\s+/).filter(Boolean);
			if (words.length < AD_GRANTS_POLICY.min_keyword_words) {
				violations.push(`keyword "${keyword.text}" is too short: Ad Grants forbids single-word keywords`);
			}
		}
		if (group.ads.length < AD_GRANTS_POLICY.min_ads_per_ad_group) {
			violations.push(`ad group "${group.name}": at least ${AD_GRANTS_POLICY.min_ads_per_ad_group} ads required, got ${group.ads.length}`);
		}
		for (const ad of group.ads) {
			if (ad.headlines.length < AD_GRANTS_POLICY.min_headlines_per_ad) {
				violations.push(`ad in "${group.name}": at least ${AD_GRANTS_POLICY.min_headlines_per_ad} headlines required`);
			}
			if (ad.descriptions.length < AD_GRANTS_POLICY.min_descriptions_per_ad) {
				violations.push(`ad in "${group.name}": at least ${AD_GRANTS_POLICY.min_descriptions_per_ad} descriptions required`);
			}
			if (!ad.final_url.startsWith("https://")) {
				violations.push(`ad in "${group.name}": final_url must be https`);
			}
		}
	}
	if (spec.sitelinks.length < AD_GRANTS_POLICY.min_sitelinks_per_campaign) {
		violations.push(`at least ${AD_GRANTS_POLICY.min_sitelinks_per_campaign} sitelinks required, got ${spec.sitelinks.length}`);
	}
	for (const sitelink of spec.sitelinks) {
		if (!sitelink.text || !sitelink.final_url.startsWith("https://")) {
			violations.push(`sitelink "${sitelink.text || "?"}": needs text and an https url`);
		}
	}
	return violations;
}

export function validateDesiredState(state: DesiredState): string[] {
	const violations: string[] = [];
	const total = state.campaigns.reduce((sum, campaign) => sum + campaign.daily_budget, 0);
	if (total > AD_GRANTS_POLICY.max_total_daily_budget) {
		violations.push(`total daily budget $${total} exceeds the $${AD_GRANTS_POLICY.max_total_daily_budget} grant cap`);
	}
	const names = new Set<string>();
	for (const campaign of state.campaigns) {
		if (names.has(campaign.name)) {
			violations.push(`duplicate campaign name "${campaign.name}"`);
		}
		names.add(campaign.name);
		for (const violation of validateCampaignSpec(campaign)) {
			violations.push(`${campaign.name}: ${violation}`);
		}
	}
	return violations;
}

function series2026Campaign(): CampaignSpec {
	const hub = "https://series.nwaofna.org";
	return {
		name: "NWANA \u00b7 Series 2026 \u00b7 Virtual Races",
		// Raw registry/objects.yaml record for NWANA-RACE-000001 has
		// object_id plus external/nwana/capabilities blocks, but NO
		// formal object_type or title fields. Only the real fields
		// are linked; nothing is promoted or inferred.
		source_object: {
			object_id: "NWANA-RACE-000001",
			object_type: null,
			title: null,
		},
		// Real distribution backing (migrations/0006-seed-core-distribution-rules.sql):
		// ACT-SERIES-HUB-GOOGLE-ADS, action_type GOOGLE_ADS_CAMPAIGN,
		// channel GOOGLE_ADS_GRANT, rule RULE-OPEN-SERIES-HUB.
		// Provenance metadata only; eligibility never depends on it.
		distribution: {
			action_id: "ACT-SERIES-HUB-GOOGLE-ADS",
			rule_id: "RULE-OPEN-SERIES-HUB",
			channel: "GOOGLE_ADS_GRANT",
		},
		origin: "OBJECT_DERIVED",
		daily_budget: 200,
		geo_target_id: 2840,
		ad_groups: [
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
						final_url: hub,
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
						final_url: hub,
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
						final_url: hub,
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
						final_url: hub,
					},
				],
			},
		],
		sitelinks: [
			{ text: "Race Calendar", final_url: hub, description: "Every upcoming virtual race" },
			{ text: "Results & Standings", final_url: hub, description: "Verified results by level" },
			{ text: "How It Works", final_url: hub, description: "Race, submit, rank" },
		],
	};
}

function foundingCircleCampaign(): CampaignSpec {
	const donate = "https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT";
	const about = "https://nwaofna.org";
	return {
		name: "NWANA \u00b7 Founding Circle \u00b7 Donate",
		// No explicit confirmed relationship exists between the
		// "NWANA \u00b7 Founding Circle \u00b7 Donate" proposal and the
		// fund-50k-bridge-sprint fundraising object: the production
		// relationships table is empty, the fund metadata never names
		// the Founding Circle, and ADR-0015 never links the two.
		// The linkage stays null rather than invented.
		source_object: null,
		// No confirmed Google Ads distribution action exists for the
		// Founding Circle: migrations/0006 contains no GOOGLE_ADS
		// action outside ACT-SERIES-HUB-GOOGLE-ADS. Provenance stays
		// null; nothing is fabricated to fill it. This proposal exists
		// by direct owner directive, so no prior rule is required.
		distribution: {
			action_id: null,
			rule_id: null,
			channel: null,
		},
		origin: "OWNER_DIRECTIVE",
		daily_budget: 100,
		geo_target_id: 2840,
		ad_groups: [
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
						final_url: donate,
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
						final_url: donate,
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
						final_url: donate,
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
						final_url: about,
					},
				],
			},
		],
		sitelinks: [
			{ text: "Donate Now", final_url: donate, description: "Secure tax-deductible gift" },
			{ text: "About NWANA", final_url: about, description: "The federation story" },
			{ text: "Race Series", final_url: "https://series.nwaofna.org", description: "What your gift powers" },
		],
	};
}

export function buildDesiredState(): DesiredState {
	const state: DesiredState = {
		version: "2026-09-22",
		generated_at: new Date().toISOString(),
		campaigns: [series2026Campaign(), foundingCircleCampaign()],
	};
	const violations = validateDesiredState(state);
	if (violations.length > 0) {
		throw new Error(`Desired state violates Ad Grants policy: ${violations.join("; ")}`);
	}
	return state;
}
