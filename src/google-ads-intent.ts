/**
 * Normalized Google Ads campaign intent (ADR-0016 successor).
 *
 * The Google Ads proposal engine never invents campaign content. Every
 * source (registry object, fund, sponsorship asset, owner directive)
 * goes through a source adapter that carries only confirmed factual
 * data into this normalized intent. Adapters never make policy,
 * eligibility, duplicate, or proposal-state decisions: those belong to
 * the generic proposal pipeline (google-ads-proposals.ts).
 *
 * New source types plug in through new adapters. The generic core never
 * changes when a new source type appears.
 */

import type {
	DistributionLink,
	ProposalOrigin,
	SourceObjectLink,
} from "./google-ads-state";

/** Source kinds the adapters currently know how to normalize. */
export type IntentSourceKind =
	| "REGISTRY_OBJECT"
	| "FUND"
	| "SPONSORSHIP_ASSET"
	| "OWNER_DIRECTIVE";

export interface KeywordHint {
	text: string;
	match_type: "EXACT" | "PHRASE";
}

export interface AdCopyHint {
	headlines: string[];
	descriptions: string[];
	final_url: string;
}

export interface AdGroupHint {
	name: string;
	default_cpc: number;
	keywords: KeywordHint[];
	ads: AdCopyHint[];
}

export interface SitelinkHint {
	text: string;
	final_url: string;
	description?: string;
}

/**
 * Normalized campaign intent. Source-agnostic: after this point the
 * generic pipeline must not know whether the intent came from a
 * Series, a Fund, a sponsorship asset, or an owner directive.
 */
export interface NormalizedCampaignIntent {
	/**
	 * Stable identity of the source: object_id, fund_id, asset_id, or
	 * directive_id. Never invented; always comes from the source.
	 */
	source_identity: string;
	/** Which adapter normalized this intent. */
	source_kind: IntentSourceKind;
	/** OBJECT_DERIVED | OWNER_DIRECTIVE. */
	origin: ProposalOrigin | null;
	/** Real source object link when one exists; null otherwise. */
	source_object: SourceObjectLink | null;
	/** Distribution provenance when confirmed; nulls otherwise. */
	distribution: DistributionLink;
	/**
	 * Campaign purpose: a stable discriminator for proposal identity
	 * (e.g. "VIRTUAL_RACES", "FOUNDING_CIRCLE").
	 */
	purpose: string;
	/** Factual campaign name; becomes the Google Ads campaign name. */
	name: string | null;
	/** Campaign landing page. */
	target_url: string | null;
	/** Call to action supplied by the source. */
	cta: string | null;
	/** Audience / context supplied by the source. */
	audience: string | null;
	/** Factual source facts usable for campaign copy. */
	source_facts: string[];
	daily_budget: number | null;
	/** Google Ads geo target constant. */
	geo_target_id: number | null;
	/** Explicit ad group / copy hints supplied by the source. */
	ad_groups: AdGroupHint[];
	/** Explicit sitelink hints supplied by the source. */
	sitelinks: SitelinkHint[];
	/** Optional explicit campaign-name override from the source. */
	campaign_name_hint: string | null;
}

/**
 * Deterministic proposal identity.
 *
 * proposal_id = origin + stable source/directive identity + campaign
 * purpose. It does not depend on timestamps, runtime execution order,
 * or render/rebuild counts: the same logical source/task always
 * yields the same logical proposal id. No random UUIDs.
 */
export function proposalIdentity(intent: NormalizedCampaignIntent): string {
	const origin = intent.origin ?? "UNKNOWN_ORIGIN";
	return `${origin}:${intent.source_identity}:${intent.purpose}`;
}

export type AdapterResult =
	| { ok: true; intent: NormalizedCampaignIntent }
	| { ok: false; error: string };

function baseIntent(
	source_kind: IntentSourceKind,
	origin: ProposalOrigin | null,
): NormalizedCampaignIntent {
	return {
		source_identity: "",
		source_kind,
		origin,
		source_object: null,
		distribution: { action_id: null, rule_id: null, channel: null },
		purpose: "",
		name: null,
		target_url: null,
		cta: null,
		audience: null,
		source_facts: [],
		daily_budget: null,
		geo_target_id: null,
		ad_groups: [],
		sitelinks: [],
		campaign_name_hint: null,
	};
}

function requireIdentity(value: unknown, what: string): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Registry / object-derived adapter
// ---------------------------------------------------------------------------

export interface RegistryObjectInput {
	/** Stable object id, e.g. "NWANA-RACE-000001". Required. */
	object_id: string;
	object_type?: string | null;
	title?: string | null;
	/** Confirmed distribution provenance, if any. */
	distribution?: DistributionLink;
	/** Campaign purpose, e.g. "VIRTUAL_RACES". Required. */
	purpose: string;
	/** Factual campaign name. */
	name?: string | null;
	target_url?: string | null;
	cta?: string | null;
	audience?: string | null;
	source_facts?: string[];
	daily_budget?: number | null;
	geo_target_id?: number | null;
	ad_groups?: AdGroupHint[];
	sitelinks?: SitelinkHint[];
	campaign_name_hint?: string | null;
}

/**
 * Normalizes a registry/object-derived source. Carries confirmed
 * factual fields only. Successful normalization does NOT imply that a
 * full CampaignSpec can be built: missing campaign inputs surface as
 * INSUFFICIENT_INPUT later in the pipeline.
 */
export function adaptRegistryObject(input: RegistryObjectInput): AdapterResult {
	const object_id = requireIdentity(input.object_id, "object_id");
	if (!object_id) {
		return { ok: false, error: "registry object adapter: object_id is required" };
	}
	const purpose = requireIdentity(input.purpose, "purpose");
	if (!purpose) {
		return { ok: false, error: "registry object adapter: purpose is required" };
	}
	const intent = baseIntent("REGISTRY_OBJECT", "OBJECT_DERIVED");
	intent.source_identity = object_id;
	intent.source_object = {
		object_id,
		object_type: input.object_type ?? null,
		title: input.title ?? null,
	};
	if (input.distribution) {
		intent.distribution = { ...input.distribution };
	}
	intent.purpose = purpose;
	intent.name = input.name ?? null;
	intent.target_url = input.target_url ?? null;
	intent.cta = input.cta ?? null;
	intent.audience = input.audience ?? null;
	intent.source_facts = [...(input.source_facts ?? [])];
	intent.daily_budget = input.daily_budget ?? null;
	intent.geo_target_id = input.geo_target_id ?? null;
	intent.ad_groups = [...(input.ad_groups ?? [])];
	intent.sitelinks = [...(input.sitelinks ?? [])];
	intent.campaign_name_hint = input.campaign_name_hint ?? null;
	return { ok: true, intent };
}

// ---------------------------------------------------------------------------
// Fund adapter
// ---------------------------------------------------------------------------

export interface FundInput {
	/** Stable fund id, e.g. "fund-50k-bridge-sprint". Required. */
	fund_id: string;
	name?: string | null;
	description?: string | null;
	goal_amount?: number | null;
	currency?: string | null;
	status?: string | null;
	/** Campaign purpose, e.g. "FUNDRAISING". Required. */
	purpose: string;
	/** Factual campaign name, when the source supplies one. */
	campaign_name?: string | null;
	target_url?: string | null;
	cta?: string | null;
	audience?: string | null;
	source_facts?: string[];
	daily_budget?: number | null;
	geo_target_id?: number | null;
	ad_groups?: AdGroupHint[];
	sitelinks?: SitelinkHint[];
}

/**
 * Normalizes real factual Fund data. Carries only what the fund
 * actually has: fund id, name, description, goal, currency, status.
 * Never invents target URL, CTA, headlines, descriptions, keywords,
 * audience claims, donation claims, or sitelinks. When campaign inputs
 * are missing, normalization still succeeds and the pipeline returns
 * INSUFFICIENT_INPUT with the exact missing fields.
 */
export function adaptFund(input: FundInput): AdapterResult {
	const fund_id = requireIdentity(input.fund_id, "fund_id");
	if (!fund_id) {
		return { ok: false, error: "fund adapter: fund_id is required" };
	}
	const purpose = requireIdentity(input.purpose, "purpose");
	if (!purpose) {
		return { ok: false, error: "fund adapter: purpose is required" };
	}
	const intent = baseIntent("FUND", "OBJECT_DERIVED");
	intent.source_identity = fund_id;
	intent.source_object = { object_id: fund_id, object_type: null, title: input.name ?? null };
	intent.purpose = purpose;
	intent.name = input.campaign_name ?? null;
	intent.target_url = input.target_url ?? null;
	intent.cta = input.cta ?? null;
	intent.audience = input.audience ?? null;
	const facts: string[] = [...(input.source_facts ?? [])];
	if (input.description) facts.push(input.description);
	if (input.goal_amount != null) {
		facts.push(`goal ${input.goal_amount}${input.currency ? " " + input.currency : ""}`.trim());
	}
	if (input.status) facts.push(`status ${input.status}`);
	intent.source_facts = facts;
	intent.daily_budget = input.daily_budget ?? null;
	intent.geo_target_id = input.geo_target_id ?? null;
	intent.ad_groups = [...(input.ad_groups ?? [])];
	intent.sitelinks = [...(input.sitelinks ?? [])];
	return { ok: true, intent };
}

// ---------------------------------------------------------------------------
// Sponsorship asset adapter
// ---------------------------------------------------------------------------

export interface SponsorshipAssetInput {
	/** Stable asset id. Required. */
	asset_id: string;
	name?: string | null;
	description?: string | null;
	/** Campaign purpose, e.g. "SPONSORSHIP". Required. */
	purpose: string;
	campaign_name?: string | null;
	target_url?: string | null;
	cta?: string | null;
	audience?: string | null;
	source_facts?: string[];
	daily_budget?: number | null;
	geo_target_id?: number | null;
	ad_groups?: AdGroupHint[];
	sitelinks?: SitelinkHint[];
}

/**
 * Normalizes factual sponsorship asset data. Carries the asset's real
 * fields and any explicit supplied campaign hints. Invents nothing:
 * no headlines, descriptions, keywords, URLs, CTA, or claims.
 * Sponsorship-specific logic ends inside this adapter.
 */
export function adaptSponsorshipAsset(input: SponsorshipAssetInput): AdapterResult {
	const asset_id = requireIdentity(input.asset_id, "asset_id");
	if (!asset_id) {
		return { ok: false, error: "sponsorship asset adapter: asset_id is required" };
	}
	const purpose = requireIdentity(input.purpose, "purpose");
	if (!purpose) {
		return { ok: false, error: "sponsorship asset adapter: purpose is required" };
	}
	const intent = baseIntent("SPONSORSHIP_ASSET", "OBJECT_DERIVED");
	intent.source_identity = asset_id;
	intent.source_object = { object_id: asset_id, object_type: null, title: input.name ?? null };
	intent.purpose = purpose;
	intent.name = input.campaign_name ?? null;
	intent.target_url = input.target_url ?? null;
	intent.cta = input.cta ?? null;
	intent.audience = input.audience ?? null;
	const facts: string[] = [...(input.source_facts ?? [])];
	if (input.description) facts.push(input.description);
	intent.source_facts = facts;
	intent.daily_budget = input.daily_budget ?? null;
	intent.geo_target_id = input.geo_target_id ?? null;
	intent.ad_groups = [...(input.ad_groups ?? [])];
	intent.sitelinks = [...(input.sitelinks ?? [])];
	return { ok: true, intent };
}

// ---------------------------------------------------------------------------
// Owner directive adapter
// ---------------------------------------------------------------------------

export interface OwnerDirectiveInput {
	/** Stable directive id, e.g. "DIR-FOUNDING-CIRCLE-2026". Required. */
	directive_id: string;
	/** Campaign purpose, e.g. "FOUNDING_CIRCLE". Required. */
	purpose: string;
	/** Factual campaign name. */
	campaign_name?: string | null;
	target_url?: string | null;
	cta?: string | null;
	audience?: string | null;
	source_facts?: string[];
	daily_budget?: number | null;
	geo_target_id?: number | null;
	ad_groups?: AdGroupHint[];
	sitelinks?: SitelinkHint[];
	/** Optional real source object link; absence is not an error. */
	source_object?: SourceObjectLink | null;
	/** Optional confirmed distribution provenance. */
	distribution?: DistributionLink;
}

/**
 * Normalizes a direct owner directive. A first-class source: no
 * source object and no distribution rule are required. Missing
 * campaign inputs surface as INSUFFICIENT_INPUT later; they are not
 * invented here.
 */
export function adaptOwnerDirective(input: OwnerDirectiveInput): AdapterResult {
	const directive_id = requireIdentity(input.directive_id, "directive_id");
	if (!directive_id) {
		return { ok: false, error: "owner directive adapter: directive_id is required" };
	}
	const purpose = requireIdentity(input.purpose, "purpose");
	if (!purpose) {
		return { ok: false, error: "owner directive adapter: purpose is required" };
	}
	const intent = baseIntent("OWNER_DIRECTIVE", "OWNER_DIRECTIVE");
	intent.source_identity = directive_id;
	intent.source_object = input.source_object ?? null;
	if (input.distribution) {
		intent.distribution = { ...input.distribution };
	}
	intent.purpose = purpose;
	intent.name = input.campaign_name ?? null;
	intent.target_url = input.target_url ?? null;
	intent.cta = input.cta ?? null;
	intent.audience = input.audience ?? null;
	intent.source_facts = [...(input.source_facts ?? [])];
	intent.daily_budget = input.daily_budget ?? null;
	intent.geo_target_id = input.geo_target_id ?? null;
	intent.ad_groups = [...(input.ad_groups ?? [])];
	intent.sitelinks = [...(input.sitelinks ?? [])];
	return { ok: true, intent };
}
