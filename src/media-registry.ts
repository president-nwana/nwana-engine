// Media registry - the verified outlet/contact/endpoint registry behind the
// Media Distribution System (docs/media-distribution-system.md, migrations
// 0034 + 0035).
//
// Matching rule: NWANA object -> categories + geography -> candidate
// submission endpoints, ranked by verification_level ('opened' first).
// Only 'opened' endpoints are cleared for immediate use; 'search_verified' /
// 'third_party' rows are returned flagged and require manual browser
// verification before first use.
//
// Consent boundary (hard): RESEARCHED_COLD contacts are individual targeted
// outreach only. They must never be added to an Email V2 custom list.
// Only OPTED_IN / RELATIONSHIP contacts may go to the mass layer.

export const VERIFICATION_LEVELS = ["opened", "search_verified", "third_party"] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const CONSENT_CLASSES = ["OPTED_IN", "RELATIONSHIP", "RESEARCHED_COLD"] as const;
export type ConsentClass = (typeof CONSENT_CLASSES)[number];

export const DISTRIBUTION_CHANNELS = [
	"email_v2",
	"gmail_individual",
	"platform_form",
	"direct_form",
] as const;
export type DistributionChannel = (typeof DISTRIBUTION_CHANNELS)[number];

export const DISTRIBUTION_STATUSES = [
	"prepared",
	"sent",
	"submitted",
	"published",
	"replied",
	"follow_up_done",
	"covered",
	"declined",
] as const;
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];

export interface RegistryOutlet {
	outlet_id: string;
	name: string;
	outlet_type: string;
	scope: string;
	geography: string;
	categories: string;
	website_url: string | null;
	verification_level: VerificationLevel;
	notes: string;
}

export interface RegistryEndpoint {
	endpoint_id: string;
	outlet_id: string | null;
	name: string;
	url: string | null;
	accepts: string;
	path_type: string;
	cost_status: string;
	eligibility: string;
	verification_level: VerificationLevel;
	manual_last_mile: string;
	account_required: number;
	notes: string;
}

export interface RegistryContact {
	contact_id: string;
	outlet_id: string | null;
	name: string;
	role: string;
	email: string | null;
	phone: string | null;
	beat: string;
	consent_class: ConsentClass;
	verification_level: VerificationLevel;
}

export interface EndpointMatchOptions {
	categories?: string[];
	geography?: string;
	accepts?: string;
	/** When true (default), only 'opened' rows are returned. */
	verifiedOnly?: boolean;
	limit?: number;
}

const VERIFICATION_RANK = "CASE verification_level WHEN 'opened' THEN 0 WHEN 'search_verified' THEN 1 ELSE 2 END";

/**
 * Find candidate submission endpoints for a NWANA object, given its media
 * categories (e.g. ["running","florida"]) and geography ("Florida").
 * Returns endpoints ordered by verification level; rows that are not
 * 'opened' carry their level so the caller can flag the manual-verification
 * requirement before first use.
 */
export async function findCandidateEndpoints(
	db: D1Database,
	opts: EndpointMatchOptions = {},
): Promise<RegistryEndpoint[]> {
	const verifiedOnly = opts.verifiedOnly ?? true;
	const where: string[] = [];
	const args: unknown[] = [];
	if (verifiedOnly) where.push("e.verification_level = 'opened'");
	if (opts.accepts) {
		where.push("e.accepts LIKE ?");
		args.push(`%"${opts.accepts}"%`);
	}
	// Geography match: endpoint's outlet geography contains the requested
	// geography, or the outlet is national / a press platform (no geo limit).
	if (opts.geography) {
		where.push("(o.geography = '' OR o.geography LIKE ? OR o.scope = 'national')");
		args.push(`%${opts.geography}%`);
	}
	const sql = `SELECT e.endpoint_id, e.outlet_id, e.name, e.url, e.accepts,
		e.path_type, e.cost_status, e.eligibility, e.verification_level,
		e.manual_last_mile, e.account_required, e.notes
		FROM media_submission_endpoints e
		LEFT JOIN media_outlets o ON o.outlet_id = e.outlet_id
		${where.length ? "WHERE " + where.join(" AND ") : ""}
		ORDER BY ${VERIFICATION_RANK}, e.name
		LIMIT ?`;
	args.push(opts.limit ?? 50);
	const res = await db.prepare(sql).bind(...args).all<RegistryEndpoint>();
	let rows = res.results ?? [];
	if (opts.categories && opts.categories.length) {
		const cats = opts.categories.map((c) => c.toLowerCase());
		rows = rows.filter((r) => {
			const hay = `${r.name} ${r.eligibility} ${r.notes}`.toLowerCase();
			return cats.some((c) => hay.includes(c));
		});
	}
	return rows;
}

/**
 * Contacts for an outlet. The consent_class on every returned row tells the
 * caller which layer may use it: OPTED_IN/RELATIONSHIP -> Email V2 mass
 * layer allowed; RESEARCHED_COLD -> individual outreach only.
 */
export async function findOutletContacts(
	db: D1Database,
	outletId: string,
	consentClass?: ConsentClass,
): Promise<RegistryContact[]> {
	const where = ["outlet_id = ?"];
	const args: unknown[] = [outletId];
	if (consentClass) {
		where.push("consent_class = ?");
		args.push(consentClass);
	}
	const res = await db
		.prepare(
			`SELECT contact_id, outlet_id, name, role, email, phone, beat,
				consent_class, verification_level
			FROM media_contacts WHERE ${where.join(" AND ")}
			ORDER BY ${VERIFICATION_RANK}, name`,
		)
		.bind(...args)
		.all<RegistryContact>();
	return res.results ?? [];
}

/**
 * Record a distribution attempt. The machine prepares the record; a person
 * performs the actual send/submission and confirms it back. Status starts at
 * 'prepared'.
 */
export async function recordDistributionAttempt(
	db: D1Database,
	attempt: {
		distribution_id: string;
		article_id: string;
		channel: DistributionChannel;
		outlet_name?: string;
		variant_id?: string;
		endpoint_id?: string;
		contact_id?: string;
		notes?: string;
	},
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO media_distributions
				(distribution_id, article_id, channel, outlet_name, variant_id,
				 endpoint_id, contact_id, status, sent_at, notes)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'prepared', datetime('now'), ?)`,
		)
		.bind(
			attempt.distribution_id,
			attempt.article_id,
			attempt.channel,
			attempt.outlet_name ?? null,
			attempt.variant_id ?? null,
			attempt.endpoint_id ?? null,
			attempt.contact_id ?? null,
			attempt.notes ?? "",
		)
		.run();
}
