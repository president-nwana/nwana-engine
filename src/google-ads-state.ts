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


