/**
 * Generic Google Ads proposal engine.
 *
 * Pipeline: normalized intent -> deterministic proposal identity ->
 * generic CampaignSpec assembly -> policy validation -> eligibility ->
 * live conflict check -> proposal state -> owner review.
 *
 * This module is source-agnostic. After normalization there is no
 * Series / Fund / Founding Circle / Sponsorship / Challenge / Event /
 * Championship-specific logic anywhere here: identity, assembly,
 * missing-field detection, validation, eligibility, conflict
 * detection, and state are the same generic functions for every
 * intent. New source types plug in through new adapters
 * (google-ads-intent.ts) without touching this core.
 *
 * Zero Google Ads mutations: everything here is read-only planning.
 */

import {
	AD_GRANTS_POLICY,
	isCreationEligible,
	proposalTargetUrl,
	validateCampaignSpec,
	type CampaignSpec,
	type DistributionLink,
	type ProposalOrigin,
	type SourceObjectLink,
} from "./google-ads-state";
import {
	proposalIdentity,
	type IntentSourceKind,
	type NormalizedCampaignIntent,
} from "./google-ads-intent";

// ---------------------------------------------------------------------------
// Generic CampaignSpec builder
// ---------------------------------------------------------------------------

export type SpecBuildResult =
	| { ok: true; spec: CampaignSpec }
	| { ok: false; missing_fields: string[] };

/**
 * Assembles a CampaignSpec purely from the supplied factual facts and
 * explicit hints in the normalized intent. This builder never invents
 * headlines, descriptions, keywords, claims, audiences, CTA, URLs, or
 * any other campaign content: when required inputs are absent it
 * returns INSUFFICIENT_INPUT with the exact missing fields.
 */
export function buildCampaignSpecFromIntent(
	intent: NormalizedCampaignIntent,
): SpecBuildResult {
	const missing: string[] = [];
	const name = intent.campaign_name_hint ?? intent.name;
	if (!name || name.trim().length === 0) missing.push("name");
	if (!intent.target_url || intent.target_url.trim().length === 0) missing.push("target_url");
	if (!intent.cta || intent.cta.trim().length === 0) missing.push("cta");
	if (!(intent.daily_budget != null && intent.daily_budget > 0)) missing.push("daily_budget");
	if (!(intent.geo_target_id != null && intent.geo_target_id > 0)) missing.push("geo_target_id");

	if (intent.ad_groups.length < AD_GRANTS_POLICY.min_ad_groups_per_campaign) {
		missing.push(`ad_groups (at least ${AD_GRANTS_POLICY.min_ad_groups_per_campaign})`);
	} else {
		intent.ad_groups.forEach((group, gi) => {
			const g = `ad_groups[${gi}]`;
			if (!group.name || group.name.trim().length === 0) missing.push(`${g}.name`);
			if (!(group.default_cpc > 0)) missing.push(`${g}.default_cpc`);
			if (group.keywords.length === 0) missing.push(`${g}.keywords`);
			if (group.ads.length < AD_GRANTS_POLICY.min_ads_per_ad_group) {
				missing.push(`${g}.ads (at least ${AD_GRANTS_POLICY.min_ads_per_ad_group})`);
			} else {
				group.ads.forEach((ad, ai) => {
					const a = `${g}.ads[${ai}]`;
					if (ad.headlines.length < AD_GRANTS_POLICY.min_headlines_per_ad) {
						missing.push(`${a}.headlines (at least ${AD_GRANTS_POLICY.min_headlines_per_ad})`);
					}
					if (ad.descriptions.length < AD_GRANTS_POLICY.min_descriptions_per_ad) {
						missing.push(`${a}.descriptions (at least ${AD_GRANTS_POLICY.min_descriptions_per_ad})`);
					}
					if (!ad.final_url || ad.final_url.trim().length === 0) missing.push(`${a}.final_url`);
				});
			}
		});
	}

	if (intent.sitelinks.length < AD_GRANTS_POLICY.min_sitelinks_per_campaign) {
		missing.push(`sitelinks (at least ${AD_GRANTS_POLICY.min_sitelinks_per_campaign})`);
	} else {
		intent.sitelinks.forEach((sitelink, si) => {
			if (!sitelink.text || sitelink.text.trim().length === 0) missing.push(`sitelinks[${si}].text`);
			if (!sitelink.final_url || sitelink.final_url.trim().length === 0) {
				missing.push(`sitelinks[${si}].final_url`);
			}
		});
	}

	if (missing.length > 0) {
		return { ok: false, missing_fields: missing };
	}

	return {
		ok: true,
		spec: {
			name: (name as string).trim(),
			daily_budget: intent.daily_budget as number,
			geo_target_id: intent.geo_target_id as number,
			source_object: intent.source_object,
			distribution: { ...intent.distribution },
			origin: intent.origin,
			ad_groups: intent.ad_groups.map((group) => ({
				name: group.name,
				default_cpc: group.default_cpc,
				keywords: group.keywords.map((k) => ({ text: k.text, match_type: k.match_type })),
				ads: group.ads.map((ad) => ({
					headlines: [...ad.headlines],
					descriptions: [...ad.descriptions],
					final_url: ad.final_url,
				})),
			})),
			sitelinks: intent.sitelinks.map((s) => ({
				text: s.text,
				final_url: s.final_url,
				...(s.description ? { description: s.description } : {}),
			})),
		},
	};
}

// ---------------------------------------------------------------------------
// Live conflict detection (deterministic, data-driven)
// ---------------------------------------------------------------------------

/**
 * Explicit verified proposal <-> live campaign mapping.
 * Stored as data/configuration, consumed by the generic conflict
 * matcher. Adding a mapping never changes matcher code.
 */
export interface VerifiedConflictMapping {
	/** Deterministic proposal_id this mapping applies to. */
	proposal_id: string;
	/** Exact live Google Ads campaign name. */
	live_campaign_name: string;
	verified_at: string;
	note: string;
}

export const VERIFIED_CONFLICT_MAPPINGS: VerifiedConflictMapping[] = [
	{
		proposal_id: "OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES",
		live_campaign_name: "2026 NWANA Open Nordic Walking Series",
		verified_at: "2026-09-23",
		note: "Owner-verified 2026-09-23: the live account campaign is the real 2026 Series campaign.",
	},
];

export interface LiveConflict {
	live_campaign_name: string;
	via: "EXACT_NAME" | "VERIFIED_MAPPING";
	/** Whether the live campaign name was present in the current snapshot. */
	live_present_in_snapshot: boolean;
}

/**
 * Generic deterministic conflict check. Signals, in order:
 * 1. exact campaign name match against the live snapshot;
 * 2. explicit verified proposal <-> live campaign mapping (data).
 *
 * No fuzzy matching, no similarity, no embeddings, no guessing. If
 * equivalence cannot be proven, no duplicate flag is set. Nothing is
 * ever merged, deleted, paused, renamed, or mutated here.
 */
export function findLiveConflict(
	proposal_id: string,
	spec_name: string,
	liveCampaigns: ReadonlyArray<{ name: string }>,
	mappings: ReadonlyArray<VerifiedConflictMapping>,
): LiveConflict | null {
	const exact = liveCampaigns.find((c) => c.name === spec_name);
	if (exact) {
		return {
			live_campaign_name: exact.name,
			via: "EXACT_NAME",
			live_present_in_snapshot: true,
		};
	}
	const mapping = mappings.find((m) => m.proposal_id === proposal_id);
	if (mapping) {
		const live = liveCampaigns.find((c) => c.name === mapping.live_campaign_name);
		return {
			live_campaign_name: mapping.live_campaign_name,
			via: "VERIFIED_MAPPING",
			live_present_in_snapshot: live !== undefined,
		};
	}
	return null;
}

// ---------------------------------------------------------------------------
// Proposal state machine
// ---------------------------------------------------------------------------

export type ProposalState =
	| "INSUFFICIENT_INPUT"
	| "POLICY_REVIEW"
	| "POSSIBLE DUPLICATE / REVIEW"
	| "PROPOSED";

export interface ProposalAdGroup {
	name: string;
	default_cpc: number;
	keywords: Array<{ text: string; match_type: "EXACT" | "PHRASE" }>;
	ads_count: number;
}

/** Universal proposal output consumed by the Operating Center. */
export interface ProposalRecord {
	proposal_id: string;
	origin: ProposalOrigin | null;
	source_kind: IntentSourceKind;
	source_identity: string;
	source_object: SourceObjectLink | null;
	purpose: string;
	name: string | null;
	target_url: string | null;
	daily_budget: number | null;
	creation_eligible: boolean;
	policy_violations: string[];
	state: ProposalState;
	conflict: LiveConflict | null;
	distribution: DistributionLink;
	missing_fields: string[];
	next_action: string;
	ad_groups: ProposalAdGroup[];
}

/**
 * Intent-level required factual inputs. Missing origin, missing
 * source identity, missing purpose, or an OBJECT_DERIVED intent
 * without a real source object link all mean INSUFFICIENT_INPUT.
 */
export function missingIntentFields(intent: NormalizedCampaignIntent): string[] {
	const missing: string[] = [];
	if (intent.origin !== "OBJECT_DERIVED" && intent.origin !== "OWNER_DIRECTIVE") {
		missing.push("origin");
	}
	if (!intent.source_identity || intent.source_identity.trim().length === 0) {
		missing.push("source_identity");
	}
	if (!intent.purpose || intent.purpose.trim().length === 0) {
		missing.push("purpose");
	}
	if (intent.origin === "OBJECT_DERIVED" && intent.source_object === null) {
		missing.push("source_object");
	}
	return missing;
}

function insufficientRecord(
	intent: NormalizedCampaignIntent,
	proposal_id: string,
	missing_fields: string[],
): ProposalRecord {
	return {
		proposal_id,
		origin: intent.origin,
		source_kind: intent.source_kind,
		source_identity: intent.source_identity,
		source_object: intent.source_object,
		purpose: intent.purpose,
		name: intent.name,
		target_url: intent.target_url,
		daily_budget: intent.daily_budget,
		creation_eligible: false,
		policy_violations: [],
		state: "INSUFFICIENT_INPUT",
		conflict: null,
		distribution: { ...intent.distribution },
		missing_fields,
		next_action: `Supply the missing factual input: ${missing_fields.join(", ")}`,
		ad_groups: [],
	};
}

/**
 * Runs one normalized intent through the full generic pipeline.
 *
 * State precedence (generic, deterministic):
 * 1. missing required factual input -> INSUFFICIENT_INPUT
 * 2. CampaignSpec built but validator returns violations -> POLICY_REVIEW
 * 3. valid + eligible + deterministic confirmed live conflict -> POSSIBLE DUPLICATE / REVIEW
 * 4. valid + eligible + no confirmed conflict -> PROPOSED
 *
 * Eligibility and duplicate status are separate concepts: a conflict
 * never destroys a proposal, and distribution provenance never gates
 * eligibility.
 */
export function buildProposal(
	intent: NormalizedCampaignIntent,
	liveCampaigns: ReadonlyArray<{ name: string }>,
	mappings: ReadonlyArray<VerifiedConflictMapping> = VERIFIED_CONFLICT_MAPPINGS,
): ProposalRecord {
	const proposal_id = proposalIdentity(intent);

	const intentMissing = missingIntentFields(intent);
	if (intentMissing.length > 0) {
		return insufficientRecord(intent, proposal_id, intentMissing);
	}

	const built = buildCampaignSpecFromIntent(intent);
	if (!built.ok) {
		return insufficientRecord(intent, proposal_id, built.missing_fields);
	}
	const spec = built.spec;

	const violations = validateCampaignSpec(spec);
	const adGroups: ProposalAdGroup[] = spec.ad_groups.map((g) => ({
		name: g.name,
		default_cpc: g.default_cpc,
		keywords: g.keywords.map((k) => ({ text: k.text, match_type: k.match_type })),
		ads_count: g.ads.length,
	}));
	const base = {
		proposal_id,
		origin: intent.origin,
		source_kind: intent.source_kind,
		source_identity: intent.source_identity,
		source_object: intent.source_object,
		purpose: intent.purpose,
		name: spec.name,
		target_url: proposalTargetUrl(spec),
		daily_budget: spec.daily_budget,
		policy_violations: violations,
		conflict: null as LiveConflict | null,
		distribution: { ...intent.distribution },
		missing_fields: [] as string[],
		ad_groups: adGroups,
	};

	if (violations.length > 0) {
		const conflict = findLiveConflict(proposal_id, spec.name, liveCampaigns, mappings);
		return {
			...base,
			creation_eligible: false,
			state: "POLICY_REVIEW",
			conflict,
			next_action: "Fix the policy violations before owner review",
		};
	}

	const eligible = isCreationEligible(spec);
	const conflict = findLiveConflict(proposal_id, spec.name, liveCampaigns, mappings);
	if (conflict) {
		const via = conflict.via === "VERIFIED_MAPPING" ? "verified" : "existing";
		return {
			...base,
			creation_eligible: eligible,
			state: "POSSIBLE DUPLICATE / REVIEW",
			conflict,
			next_action: `Review against the ${via} live campaign "${conflict.live_campaign_name}" before any creation`,
		};
	}
	return {
		...base,
		creation_eligible: eligible,
		state: "PROPOSED",
		next_action: eligible
			? "Needs owner review before creation"
			: "Resolve eligibility blockers before owner review",
	};
}

/** Runs every normalized intent through the same generic pipeline. */
export function buildProposals(
	intents: ReadonlyArray<NormalizedCampaignIntent>,
	liveCampaigns: ReadonlyArray<{ name: string }>,
	mappings: ReadonlyArray<VerifiedConflictMapping> = VERIFIED_CONFLICT_MAPPINGS,
): ProposalRecord[] {
	return intents.map((intent) => buildProposal(intent, liveCampaigns, mappings));
}
