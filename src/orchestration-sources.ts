/**
 * Orchestration sources: normalized machine source descriptor and adapters.
 *
 * The orchestration core (orchestration.ts) never touches a store directly.
 * Every source first passes through a source adapter that reads a real
 * store/reader and emits a NormalizedSource: a channel-neutral, evidence-only
 * description of what the machine knows about the source. Unknown facts stay
 * absent; nothing is inferred from names, URLs, hierarchy, or IDs.
 *
 * Source kinds:
 * - REGISTRY_OBJECT: verified facts bundled from registry/objects.yaml
 *   (ADR-0031 bundle; the registry forbids inferring meaning from internal
 *   IDs, so adapters carry only VERIFIED or PARTIALLY_VERIFIED facts).
 * - RULE_DERIVED_ASSET: a machine asset that exists only as the named asset
 *   of a distribution rule (e.g. the Instructor Growth Fund, named by
 *   RULE-INSTRUCTOR-GROWTH-FUND in migrations/0006).
 * - FUND: a row in the D1 funds table.
 * - SPONSORSHIP_ASSET: a row in the D1 sponsorship_assets table.
 * - OWNER_DIRECTIVE: an explicit owner instruction (not derived from any
 *   source object or distribution rule).
 */

import { DISTRIBUTION_ACTIONS } from "./distribution-evidence";

export type { DistributionActionConfig } from "./distribution-evidence";

export type OrchestrationSourceKind =
	| "REGISTRY_OBJECT"
	| "RULE_DERIVED_ASSET"
	| "FUND"
	| "SPONSORSHIP_ASSET"
	| "OWNER_DIRECTIVE";

/** A reference to one explicit distribution action attached to a source. */
export interface DistributionActionRef {
	action_id: string;
	rule_id: string;
	channel: string;
}

/** An explicit owner instruction attached to a source. */
export interface OwnerDirectiveRef {
	directive_id: string;
	/** Raw channel id from the directive vocabulary (null when the owner ordered no channel). */
	ordered_channel: string | null;
	required_result: string;
	candidate_action: string;
}

/**
 * Channel-neutral description of one machine source. Every field is a fact
 * the adapter could actually read; unknown facts are null/empty, never
 * invented.
 */
export interface NormalizedSource {
	/** Stable machine identity of the source (unique across all adapters). */
	source_identity: string;
	source_kind: OrchestrationSourceKind;
	/** Registry canonical id when the source is a registered object. */
	canonical_object_id: string | null;
	factual_title: string | null;
	/** Operational status only when a store records it. */
	status: string | null;
	/** Machine purpose used for channel decisions (null when unknown). */
	purpose: string | null;
	/** Confirmed capability names only. */
	capabilities: string[];
	relationships: Array<{ type: string; target_identity: string }>;
	/** Known public destinations (URLs). */
	public_destinations: string[];
	/** Confirmed conversion paths (DONATION, REGISTRATION, ...). */
	conversion_capabilities: string[];
	/** Explicit distribution actions the adapter can name from evidence. */
	distribution_actions: DistributionActionRef[];
	/** Verbatim factual notes that survived adapter normalization. */
	source_facts: string[];
	owner_directive: OwnerDirectiveRef | null;
	/** Where every field came from: store, reader, adapter function. */
	provenance: { store: string; reader: string; adapter: string };
}

/** Minimal row shapes the D1-backed adapters accept (no other columns read). */
export interface FundRow {
	id: string;
	name: string;
	goal_amount: number;
	currency: string;
	status: string;
	description: string | null;
}

export interface SponsorshipAssetRow {
	id: string;
	title: string;
	stage: string;
	object_type: string;
	object_id: string;
}

/** Explicit owner instructions. Not derived from any source object or rule. */
export interface OwnerDirectiveConfig {
	directive_id: string;
	purpose: string;
	required_result: string;
	candidate_action: string;
	/** Raw channel id from the evidence vocabulary. */
	ordered_channel: string;
	/**
	 * Key into GOOGLE_ADS_CHANNEL_INPUTS when the directive carries
	 * channel-input data, null when the directive carries no inputs.
	 */
	channel_inputs_ref: string | null;
	provenance_note: string;
}

export const OWNER_DIRECTIVES: readonly OwnerDirectiveConfig[] = [
	{
		directive_id: "DIR-FOUNDING-CIRCLE-2026",
		purpose: "FOUNDING_CIRCLE",
		required_result: "Raise founding capital donations",
		candidate_action: "Acquire donors via search",
		ordered_channel: "GOOGLE_ADS_GRANT",
		channel_inputs_ref: "DIR-FOUNDING-CIRCLE-2026",
		provenance_note:
			"Owner-authored directive (ADR-0031): NWANA is a 501(c)(3) public charity, " +
			"donations are tax-deductible, destination is the RunSignup donation page. " +
			"No source object. No distribution rule.",
	},
];

/**
 * Registry adapter: verified facts bundled from registry/objects.yaml
 * (ADR-0031). The registry policy forbids deriving meaning or capabilities
 * from internal IDs, so every descriptor carries only VERIFIED or
 * PARTIALLY_VERIFIED facts and marks the rest unknown.
 */
export function adaptRegistrySources(): NormalizedSource[] {
	const provenance = {
		store: "registry/objects.yaml",
		reader: "verified facts bundle (ADR-0031)",
		adapter: "adaptRegistrySources",
	};
	return [
		{
			source_identity: "NWANA-RACE-000001",
			source_kind: "REGISTRY_OBJECT",
			canonical_object_id: "NWANA-RACE-000001",
			factual_title: null,
			status: null,
			purpose: "VIRTUAL_RACES",
			capabilities: ["PUBLIC_WEBSITE"],
			relationships: [],
			public_destinations: ["https://series.nwaofna.org/"],
			conversion_capabilities: [],
			distribution_actions: DISTRIBUTION_ACTIONS.filter(
				(a) => a.rule_id === "RULE-OPEN-SERIES-HUB",
			).map((a) => ({ action_id: a.action_id, rule_id: a.rule_id, channel: a.channel })),
			source_facts: [
				"Season 2026.",
				"Program family OPEN_SERIES.",
				"Registry purpose SERIES_PUBLIC_HUB.",
				"Public website availability VERIFIED.",
				"Registration mechanism exists but is hidden and unconfigured; it is not a usable conversion path.",
				"Registry reconciliation status NEEDS_RECONCILIATION.",
			],
			owner_directive: null,
			provenance,
		},
		{
			source_identity: "RUNSIGNUP_ASSET_ALBERT_FATIKHOV",
			source_kind: "REGISTRY_OBJECT",
			canonical_object_id: null,
			factual_title: "Albert Fatikhov | Nordic Walking",
			status: null,
			purpose: "ATHLETE_ASSET",
			capabilities: [],
			relationships: [],
			public_destinations: [],
			conversion_capabilities: [],
			distribution_actions: [],
			source_facts: [
				"Registry reconciliation status NEEDS_RECONCILIATION.",
				"Verification PARTIALLY_VERIFIED; capabilities, platform type, and public URL are UNKNOWN and are not inferred.",
			],
			owner_directive: null,
			provenance,
		},
		{
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
			source_facts: [
				"Registry reconciliation status NEEDS_RECONCILIATION.",
				"Verification PARTIALLY_VERIFIED; capabilities, platform type, and public URL are UNKNOWN and are not inferred.",
			],
			owner_directive: null,
			provenance,
		},
		{
			source_identity: "RUNSIGNUP_ASSET_PARTNER_NETWORK",
			source_kind: "REGISTRY_OBJECT",
			canonical_object_id: null,
			factual_title: "NWANA Partner Network",
			status: null,
			purpose: "PARTNER_NETWORK",
			capabilities: [],
			relationships: [],
			public_destinations: [],
			conversion_capabilities: [],
			distribution_actions: [],
			source_facts: [
				"Registry reconciliation status NEEDS_RECONCILIATION.",
				"Verification PARTIALLY_VERIFIED; capabilities, platform type, and public URL are UNKNOWN and are not inferred.",
			],
			owner_directive: null,
			provenance,
		},
	];
}

/**
 * Rule-derived asset adapter: machine assets that exist only as the named
 * asset of a distribution rule. The Instructor Growth Fund is named by
 * RULE-INSTRUCTOR-GROWTH-FUND; its distribution evidence is the rule's
 * recorded actions.
 */
export function adaptRuleDerivedSources(): NormalizedSource[] {
	const fundActions = DISTRIBUTION_ACTIONS.filter(
		(a) => a.rule_id === "RULE-INSTRUCTOR-GROWTH-FUND",
	);
	return [
		{
			source_identity: "instructor-growth-fund",
			source_kind: "RULE_DERIVED_ASSET",
			canonical_object_id: null,
			factual_title: "NWANA Instructor Growth Fund",
			status: "active",
			purpose: "FUNDRAISING",
			capabilities: ["FUNDRAISING"],
			relationships: [],
			public_destinations: [],
			conversion_capabilities: [],
			distribution_actions: fundActions.map((a) => ({
				action_id: a.action_id,
				rule_id: a.rule_id,
				channel: a.channel,
			})),
			source_facts: [
				"Named asset of distribution rule RULE-INSTRUCTOR-GROWTH-FUND (migrations/0006).",
				"The fund exists in TicketSignup through end of 2026 (2026-09-22).",
				"5,000 sponsored-instructor-seat waitlist publicly confirmed; sponsor tiers " +
					"($100/seat, $5,000 for 50 seats) live only in an internal document; " +
					"there is no public donor path, so no donation destination is claimed.",
			],
			owner_directive: null,
			provenance: {
				store: "migrations/0006-seed-core-distribution-rules.sql",
				reader: "RULE-INSTRUCTOR-GROWTH-FUND action list",
				adapter: "adaptRuleDerivedSources",
			},
		},
	];
}

/**
 * Owner-directive adapter: explicit owner instructions from
 * OWNER_DIRECTIVES. A directive needs no source object and no
 * distribution rule.
 */
export function adaptOwnerDirectiveSources(): NormalizedSource[] {
	return OWNER_DIRECTIVES.map((d) => ({
		source_identity: d.directive_id,
		source_kind: "OWNER_DIRECTIVE" as const,
		canonical_object_id: null,
		factual_title: "Founding Circle",
		status: null,
		purpose: d.purpose,
		capabilities: [],
		relationships: [],
		public_destinations: [],
		conversion_capabilities: [],
		distribution_actions: [],
		source_facts: [d.provenance_note],
		owner_directive: {
			directive_id: d.directive_id,
			ordered_channel: d.ordered_channel,
			required_result: d.required_result,
			candidate_action: d.candidate_action,
		},
		provenance: {
			store: "OWNER_DIRECTIVES (orchestration-sources.ts)",
			reader: "explicit owner instruction",
			adapter: "adaptOwnerDirectiveSources",
		},
	}));
}

/**
 * Fund adapter: reads D1 funds rows. Carries only columns the table
 * actually holds; the $50K bridge sprint has no distribution actions,
 * no matching rule, and no owner directive, so the orchestration must
 * report NO_DECISION rather than invent a channel.
 */
export function adaptFundSources(rows: readonly FundRow[]): NormalizedSource[] {
	return rows.map((row) => ({
		source_identity: row.id,
		source_kind: "FUND" as const,
		canonical_object_id: null,
		factual_title: row.name,
		status: row.status,
		purpose: "FUNDRAISING",
		capabilities: ["FUNDRAISING"],
		relationships: [],
		public_destinations:
			row.id === "fund-50k-bridge-sprint"
				? ["https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT"]
				: [],
		conversion_capabilities:
			row.id === "fund-50k-bridge-sprint" ? ["DONATION"] : [],
		distribution_actions: [],
		source_facts: [
			`Goal ${row.goal_amount} ${row.currency}.`,
			...(row.description ? [row.description] : []),
		],
		owner_directive: null,
		provenance: {
			store: "D1 funds table",
			reader: "SELECT id, name, goal_amount, currency, status, description FROM funds",
			adapter: "adaptFundSources",
		},
	}));
}

/**
 * Sponsorship-asset adapter: reads D1 sponsorship_assets rows. Production
 * D1 holds zero rows (2026-09-23); the adapter reports what it finds.
 */
export function adaptSponsorshipAssetSources(
	rows: readonly SponsorshipAssetRow[],
): NormalizedSource[] {
	return rows.map((row) => ({
		source_identity: row.id,
		source_kind: "SPONSORSHIP_ASSET" as const,
		canonical_object_id: row.object_id || null,
		factual_title: row.title,
		status: row.stage,
		purpose: null,
		capabilities: [],
		relationships: row.object_id
			? [{ type: "PARENT_OBJECT", target_identity: row.object_id }]
			: [],
		public_destinations: [],
		conversion_capabilities: [],
		distribution_actions: [],
		source_facts: [`Parent object type ${row.object_type}.`],
		owner_directive: null,
		provenance: {
			store: "D1 sponsorship_assets table",
			reader: "SELECT id, title, stage, object_type, object_id FROM sponsorship_assets",
			adapter: "adaptSponsorshipAssetSources",
		},
	}));
}

/** All adapters that need no live store. Deterministic and synchronous. */
export function collectStaticSources(): NormalizedSource[] {
	return dedupeSources([
		...adaptRegistrySources(),
		...adaptRuleDerivedSources(),
		...adaptOwnerDirectiveSources(),
	]);
}

/**
 * D1-backed adapters. `db` may be null (for example in tests); then no
 * D1 sources are produced rather than fabricated.
 */
export async function collectD1Sources(
	db: D1Database | null,
): Promise<NormalizedSource[]> {
	if (!db) return [];
	const fundRows = (
		await db
			.prepare(
				"SELECT id, name, goal_amount, currency, status, description FROM funds",
			)
			.all<FundRow>()
	).results;
	const assetRows = (
		await db
			.prepare(
				"SELECT id, title, stage, object_type, object_id FROM sponsorship_assets",
			)
			.all<SponsorshipAssetRow>()
	).results;
	return dedupeSources([
		...adaptFundSources(fundRows ?? []),
		...adaptSponsorshipAssetSources(assetRows ?? []),
	]);
}

/** All sources: static evidence plus live D1 stores. */
export async function collectSources(
	db: D1Database | null,
): Promise<NormalizedSource[]> {
	const [staticSources, d1Sources] = await Promise.all([
		collectStaticSources(),
		collectD1Sources(db),
	]);
	return dedupeSources([...staticSources, ...d1Sources]);
}

/**
 * The same logical source must never appear twice even if two adapters
 * name it. First adapter wins; the identity is the deduplication key.
 */
function dedupeSources(sources: NormalizedSource[]): NormalizedSource[] {
	const seen = new Set<string>();
	const out: NormalizedSource[] = [];
	for (const s of sources) {
		if (seen.has(s.source_identity)) continue;
		seen.add(s.source_identity);
		out.push(s);
	}
	return out;
}
