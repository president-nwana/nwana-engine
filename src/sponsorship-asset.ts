// ADR-0017: Sponsorship Asset as a first-class NWANA machine object.
//
// At the moment an object is created, its life and distribution start.
// The Sponsorship Asset is the machine-generated seller package for a
// parent object (Series, Fund, and later Challenge, Academy offer, Event).
// The machine generates the package and tracks its pipeline:
//
//   draft -> packaged -> offered -> negotiating -> committed
//   -> fulfilled -> renewal
//
// The machine NEVER contacts sellers or sponsors. Seller conversations
// (Integrity 9, Zubie Five, Sea Theory, direct outreach) stay human; the
// sales stream picks packages up from the operating center. This object
// is generation and tracking only.
//
// Package content comes from the verified 11-asset inventory
// (~/workspace/your_files/seatheory-inventory-submission.md). Pricing uses
// ONLY the verified 2026 reference grid, labeled as reference; anything
// else is "TBD", never invented.

export const SPONSORSHIP_ASSET_STAGES = [
	"draft",
	"packaged",
	"offered",
	"negotiating",
	"committed",
	"fulfilled",
	"renewal",
] as const;

export type SponsorshipAssetStage =
	(typeof SPONSORSHIP_ASSET_STAGES)[number];

export const SPONSORSHIP_ASSET_STAGE_LABELS: Record<
	SponsorshipAssetStage,
	string
> = {
	draft: "Draft",
	packaged: "Packaged",
	offered: "Offered",
	negotiating: "Negotiating",
	committed: "Committed",
	fulfilled: "Fulfilled",
	renewal: "Renewal",
};

// Forward flow plus one-step corrections backward. renewal is terminal:
// a renewed relationship routes to the next object, it does not loop here.
const SPONSORSHIP_ASSET_TRANSITIONS: Record<
	SponsorshipAssetStage,
	SponsorshipAssetStage[]
> = {
	draft: ["packaged"],
	packaged: ["draft", "offered"],
	offered: ["packaged", "negotiating"],
	negotiating: ["offered", "committed"],
	committed: ["negotiating", "fulfilled"],
	fulfilled: ["committed", "renewal"],
	renewal: [],
};

export function isSponsorshipAssetStage(
	value: string,
): value is SponsorshipAssetStage {
	return (SPONSORSHIP_ASSET_STAGES as readonly string[]).includes(value);
}

export function allowedSponsorshipAssetTransitions(
	stage: SponsorshipAssetStage,
): SponsorshipAssetStage[] {
	return SPONSORSHIP_ASSET_TRANSITIONS[stage];
}

export interface SponsorshipAssetTransitionResult {
	ok: boolean;
	to: SponsorshipAssetStage | null;
	reason: string | null;
}

export function transitionSponsorshipAsset(
	current: string,
	target: string,
): SponsorshipAssetTransitionResult {
	if (!isSponsorshipAssetStage(current)) {
		return { ok: false, to: null, reason: `Unknown current stage "${current}"` };
	}
	if (!isSponsorshipAssetStage(target)) {
		return { ok: false, to: null, reason: `Unknown target stage "${target}"` };
	}
	if (current === target) {
		return { ok: true, to: current, reason: null };
	}
	if (!SPONSORSHIP_ASSET_TRANSITIONS[current].includes(target)) {
		return {
			ok: false,
			to: null,
			reason: `Stage "${current}" cannot move to "${target}". Allowed: ${SPONSORSHIP_ASSET_TRANSITIONS[current].join(", ") || "none (terminal)"}.`,
		};
	}
	return { ok: true, to: target, reason: null };
}

// The owner action the machine surfaces for an asset sitting in a stage.
// Seller conversations stay human: the machine generates and tracks.
export function sponsorshipAssetNextAction(
	stage: SponsorshipAssetStage,
): string {
	switch (stage) {
		case "draft":
			return "Review the generated package for factual accuracy, then mark it Packaged.";
		case "packaged":
			return "Package is ready. Hand it to the sales stream; mark Offered when a seller takes it to market.";
		case "offered":
			return "A seller is carrying the package. The machine tracks; outreach stays human.";
		case "negotiating":
			return "Terms are being discussed by the sales stream. Record the outcome here when it lands.";
		case "committed":
			return "Record the agreement terms and value, then open fulfillment.";
		case "fulfilled":
			return "Confirm every promised sponsor visibility item was delivered, then open renewal.";
		case "renewal":
			return "Renewal lives with the sales stream. Route the relationship to the next object.";
	}
}

export type SponsorshipAssetObjectType = "series" | "fund";

export const SPONSORSHIP_ASSET_OBJECT_TYPES: readonly SponsorshipAssetObjectType[] = [
	"series",
	"fund",
];

export function isSponsorshipAssetObjectType(
	value: string,
): value is SponsorshipAssetObjectType {
	return (SPONSORSHIP_ASSET_OBJECT_TYPES as readonly string[]).includes(
		value,
	);
}

export interface SponsorshipAssetPackageInput {
	object_type: SponsorshipAssetObjectType;
	object_id: string;
	name: string;
	/** Verified facts about the parent object, used verbatim in the package. */
	description: string;
}

export interface SponsorshipAssetPackage {
	title: string;
	description: string;
	audience: string;
	delivers: string;
	reference_pricing: string;
}

// Verified 2026 sponsorship grid, from the Sea Theory inventory doc.
// Labeled as reference everywhere it appears; 2027 pricing is not set.
const PRICING_2026_REFERENCE =
	"Reference: 2026 sponsorship grid. Founding Series Partner $25,000; " +
	"Premier Series Partner $10,000; Official Series Partner $5,000; " +
	"Official Distance Partner $3,000 (one distance); Official Prize Partner " +
	"and Digital Prize Partner (in kind). Terms run through 2026-12-31 and " +
	"cover the 2026 Series only.";

const PRICING_FUND_TBD =
	"TBD. Founding Circle donor tiers ($5K Founder / $10K Founding Partner / " +
	"$25K HQ Founder) are charitable gifts, not sponsorship. 2027 sponsorship " +
	"inventory and pricing to be finalized with the sales partner.";

// Verified Series 2026 facts (machine master map; Series 2026 is the live
// closed loop: hub series.nwaofna.org, weekly virtual races through Dec 2026).
export const SERIES_2026_FACTS = {
	object_id: "SERIES_2026",
	name: "NWANA Series 2026",
	description:
		"The NWANA virtual race series: six distances (1K, 3K, 5K, 10K, 15K, 20K), " +
		"weekly virtual races through December 2026, open to anyone on the continent. " +
		"Registration, verified results, performance levels, points, and standings run " +
		"through the NWANA machine. Series hub: https://series.nwaofna.org/",
	audience:
		"Virtual race participants across North America; active-aging, fitness, and " +
		"wellness audiences; families and community groups entering through accessible racing.",
	delivers:
		"Series naming or presenting partnership across the season; brand presence in race " +
		"communications, official results pages, and standings; category exclusivity options; " +
		"Official Distance Partner designation per distance; year-round virtual inventory " +
		"with no geographic limits.",
} as const;

// Pure builder: parent object facts in, seller package out. No I/O, no
// guessing: unknown object types are rejected by the caller before this runs.
export function buildSponsorshipAssetPackage(
	input: SponsorshipAssetPackageInput,
): SponsorshipAssetPackage {
	if (input.object_type === "series") {
		return {
			title: `Sponsorship package: ${input.name}`,
			description: input.description,
			audience: SERIES_2026_FACTS.audience,
			delivers: SERIES_2026_FACTS.delivers,
			reference_pricing: PRICING_2026_REFERENCE,
		};
	}
	return {
		title: `Sponsorship package: ${input.name}`,
		description: input.description,
		audience:
			"Donors and socially responsible brands; health, longevity, and active-aging " +
			"audiences following the founding-capital campaign.",
		delivers:
			"Social-impact association with building a new American sport from near zero; " +
			"brand linked to the founding capital campaign behind the NWANA federation machine.",
		reference_pricing: PRICING_FUND_TBD,
	};
}

export interface SponsorshipAssetRecord {
	id: string;
	object_type: string;
	object_id: string;
	title: string;
	description: string;
	audience: string;
	delivers: string;
	reference_pricing: string;
	stage: string;
	stage_updated_at: string;
	created_at: string;
	updated_at: string;
}

export interface SponsorshipAssetView extends SponsorshipAssetRecord {
	next_action: string;
}

function assetId(object_type: string, object_id: string): string {
	const clean = (s: string) =>
		s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return `sasset-${clean(object_type)}-${clean(object_id)}`;
}

interface FundRow {
	id: string;
	name: string;
	description: string | null;
	goal_amount: number;
	currency: string;
	status: string;
}

async function resolveParentObject(
	db: D1Database,
	object_type: string,
	object_id: string,
): Promise<
	| { ok: true; input: SponsorshipAssetPackageInput }
	| { ok: false; error: string }
> {
	if (!isSponsorshipAssetObjectType(object_type)) {
		return {
			ok: false,
			error: `Unknown object type "${object_type}". Supported: ${SPONSORSHIP_ASSET_OBJECT_TYPES.join(", ")}.`,
		};
	}
	if (object_type === "series") {
		if (object_id !== SERIES_2026_FACTS.object_id) {
			return {
				ok: false,
				error: `Unknown series "${object_id}". The only series in the engine is ${SERIES_2026_FACTS.object_id}.`,
			};
		}
		return {
			ok: true,
			input: {
				object_type,
				object_id,
				name: SERIES_2026_FACTS.name,
				description: SERIES_2026_FACTS.description,
			},
		};
	}
	const fund = await db
		.prepare(`SELECT id, name, description, goal_amount, currency, status FROM funds WHERE id = ?`)
		.bind(object_id)
		.first<FundRow>();
	if (!fund) {
		return { ok: false, error: `Fund "${object_id}" not found.` };
	}
	return {
		ok: true,
		input: {
			object_type,
			object_id: fund.id,
			name: fund.name,
			description:
				fund.description ??
				`NWANA fundraising campaign (goal ${fund.goal_amount} ${fund.currency}).`,
		},
	};
}

// Idempotent: generating twice for the same (object_type, object_id)
// returns the existing asset, never a duplicate.
export async function generateSponsorshipAsset(
	db: D1Database,
	object_type: string,
	object_id: string,
): Promise<
	| { ok: true; generated: boolean; asset: SponsorshipAssetRecord }
	| { ok: false; error: string }
> {
	if (!object_type || !object_id) {
		return { ok: false, error: "object_type and object_id are required" };
	}
	const id = assetId(object_type, object_id);
	const existing = await db
		.prepare(`SELECT * FROM sponsorship_assets WHERE id = ?`)
		.bind(id)
		.first<SponsorshipAssetRecord>();
	if (existing) {
		return { ok: true, generated: false, asset: existing };
	}
	const resolved = await resolveParentObject(db, object_type, object_id);
	if (!resolved.ok) {
		return resolved;
	}
	const pkg = buildSponsorshipAssetPackage(resolved.input);
	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO sponsorship_assets
			 (id, object_type, object_id, title, description, audience, delivers, reference_pricing, stage, stage_updated_at, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
		)
		.bind(
			id,
			resolved.input.object_type,
			resolved.input.object_id,
			pkg.title,
			pkg.description,
			pkg.audience,
			pkg.delivers,
			pkg.reference_pricing,
			now,
			now,
			now,
		)
		.run();
	const asset = await db
		.prepare(`SELECT * FROM sponsorship_assets WHERE id = ?`)
		.bind(id)
		.first<SponsorshipAssetRecord>();
	if (!asset) {
		return { ok: false, error: `Asset "${id}" was not stored` };
	}
	return { ok: true, generated: true, asset };
}

export async function getSponsorshipAssetsView(db: D1Database): Promise<{
	ok: true;
	generated_at: string;
	assets: SponsorshipAssetView[];
}> {
	const rows = await db
		.prepare(`SELECT * FROM sponsorship_assets ORDER BY created_at`)
		.all<SponsorshipAssetRecord>();
	return {
		ok: true,
		generated_at: new Date().toISOString(),
		assets: rows.results.map((a) => ({
			...a,
			next_action: isSponsorshipAssetStage(a.stage)
				? sponsorshipAssetNextAction(a.stage)
				: "Unknown stage: review manually.",
		})),
	};
}

export async function advanceSponsorshipAsset(
	db: D1Database,
	assetIdValue: string,
	toStage: string,
): Promise<
	| { ok: true; asset: SponsorshipAssetRecord }
	| { ok: false; error: string }
> {
	const transition = transitionSponsorshipAsset(
		(
			await db
				.prepare(`SELECT stage FROM sponsorship_assets WHERE id = ?`)
				.bind(assetIdValue)
				.first<{ stage: string }>()
		)?.stage ?? "unknown",
		toStage,
	);
	if (!transition.ok || !transition.to) {
		return { ok: false, error: transition.reason ?? "Transition rejected" };
	}
	const now = new Date().toISOString();
	await db
		.prepare(
			`UPDATE sponsorship_assets SET stage = ?, stage_updated_at = ?, updated_at = ? WHERE id = ?`,
		)
		.bind(transition.to, now, now, assetIdValue)
		.run();
	const updated = await db
		.prepare(`SELECT * FROM sponsorship_assets WHERE id = ?`)
		.bind(assetIdValue)
		.first<SponsorshipAssetRecord>();
	if (!updated) {
		return { ok: false, error: `Asset "${assetIdValue}" not found` };
	}
	return { ok: true, asset: updated };
}
