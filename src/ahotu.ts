// Ahotu lane — Media Distribution System.
//
// Verified live 2026-09-27. Ahotu (https://ahotu.com, World's Sports Group)
// is a global endurance race calendar; "Nordic walking" is an official sport
// category: https://www.ahotu.com/sport/nordic-walking
//
// Verified facts encoded here:
// - No NWANA events are listed; no NWANA organiser account exists.
// - An organiser account is REQUIRED and FREE. Registration:
//   https://www.ahotu.com/members/registration/organiser
//   Account creation is an OWNER action — the Machine never creates it.
// - NO API, NO bulk/CSV import: manual per-event entry only, inside the
//   organiser dashboard.
// - REQUIRED for listing: an edition date AND at least one race/distance,
//   otherwise the event is NOT listed.
// - Ahotu deletes duplicates: always check the event is not already listed.
// - Challenges are NOT supported: the format requires an edition date +
//   race/distance. Eligible kinds: race, series, championship.
//
// The Machine auto-enqueues a submission package for every eligible new
// object (see enqueueAhotuForObject, called from linkRunSignupRace). The
// dashboard submission itself is a human last mile. No external sends
// anywhere in this module.

export const AHOTU_ELIGIBLE_KINDS = ["race", "series", "championship"] as const;
export type AhotuEligibleKind = (typeof AHOTU_ELIGIBLE_KINDS)[number];

export const AHOTU_SPORT_CATEGORY = "Nordic walking";
export const AHOTU_SITE_URL = "https://ahotu.com";
export const AHOTU_NORDIC_WALKING_URL = "https://www.ahotu.com/sport/nordic-walking";
export const AHOTU_ORGANISER_REGISTRATION_URL =
	"https://www.ahotu.com/members/registration/organiser";
export const AHOTU_HELP_ADD_EVENT_URL =
	"https://help.ahotu.com/article/22-how-can-i-add-an-event-to-ahotu";

/**
 * The exact human last mile for the Ahotu organiser dashboard (official
 * flow, verified 2026-09-27). Duplicated verbatim into the migration's
 * media_submission_endpoints.manual_last_mile.
 */
export const AHOTU_MANUAL_LAST_MILE = `EXACT MANUAL LAST MILE — AHOTU (verified live 2026-09-27). A person performs every step; the Machine never submits.
1. If the free NWANA organiser account does not exist yet, create it (OWNER action, one-time): ${AHOTU_ORGANISER_REGISTRATION_URL} — sign up as an organiser. Listing an event is free.
2. Sign in to the organiser dashboard, open "My events" -> "+ Add event".
3. FIRST check the event is not already listed (Ahotu deletes duplicates): ${AHOTU_NORDIC_WALKING_URL}
4. Enter the event name + contact details -> Save.
5. Add the edition date AND at least one race/distance via the left-hand menu -> Save. REQUIRED: without a date + distance the event is NOT listed.
6. When the event is live on ahotu.com, record its URL in ahotu_queue (markAhotuListed) and in media_distributions.external_url.
Official instructions: ${AHOTU_HELP_ADD_EVENT_URL}`;

export const AHOTU_QUEUE_STATUSES = [
	"queued",
	"package_ready",
	"submitted",
	"listed",
	"duplicate_found",
	"declined",
] as const;
export type AhotuQueueStatus = (typeof AHOTU_QUEUE_STATUSES)[number];

export interface AhotuRaceInput {
	name: string;
	/** Edition date, e.g. "2027-03-14". REQUIRED by Ahotu. */
	editionDate: string | null;
	city?: string | null;
	country?: string | null;
	/** At least one race/distance, e.g. ["10K", "5K"]. REQUIRED by Ahotu. */
	distances: string[];
	websiteUrl?: string | null;
	contactName?: string | null;
	contactEmail?: string | null;
	description?: string | null;
}

export interface AhotuPackage {
	sport_category: typeof AHOTU_SPORT_CATEGORY;
	event_name: string;
	edition_date: string;
	city: string | null;
	country: string | null;
	distances: string[];
	website_url: string | null;
	contact_name: string | null;
	contact_email: string | null;
	description: string | null;
	manual_last_mile: string;
}

export class AhotuPackageError extends Error {}

function requiredFields(input: AhotuRaceInput): { distances: string[] } {
	if (!input.name?.trim()) {
		throw new AhotuPackageError("Ahotu package: event name is required.");
	}
	if (!input.editionDate?.trim()) {
		throw new AhotuPackageError(
			"Ahotu package: edition date is required — Ahotu will not list the event without it.",
		);
	}
	const distances = (input.distances ?? []).map((d) => d.trim()).filter(Boolean);
	if (!distances.length) {
		throw new AhotuPackageError(
			"Ahotu package: at least one race/distance is required — Ahotu will not list the event without it.",
		);
	}
	return { distances };
}

/**
 * Build the complete Ahotu submission package. Throws AhotuPackageError when
 * the fields Ahotu requires for listing (edition date, race/distance) are
 * missing. Never invents missing fields — the caller records them as gaps.
 */
export function buildAhotuPackage(input: AhotuRaceInput): AhotuPackage {
	const { distances } = requiredFields(input);
	return {
		sport_category: AHOTU_SPORT_CATEGORY,
		event_name: input.name.trim(),
		edition_date: (input.editionDate as string).trim(),
		city: input.city?.trim() || null,
		country: input.country?.trim() || null,
		distances,
		website_url: input.websiteUrl?.trim() || null,
		contact_name: input.contactName?.trim() || null,
		contact_email: input.contactEmail?.trim() || null,
		description: input.description?.trim() || null,
		manual_last_mile: AHOTU_MANUAL_LAST_MILE,
	};
}

/**
 * Fields the owner must fill before the human last mile can run. Required
 * fields are listed first so a missing edition date / distance is obvious.
 */
export function describeAhotuGaps(input: AhotuRaceInput): string[] {
	const gaps: string[] = [];
	if (!input.editionDate?.trim()) gaps.push("edition date (REQUIRED by Ahotu)");
	if (!(input.distances ?? []).some((d) => d.trim()))
		gaps.push("at least one race/distance (REQUIRED by Ahotu)");
	if (!input.city?.trim()) gaps.push("city");
	if (!input.country?.trim()) gaps.push("country");
	if (!input.websiteUrl?.trim()) gaps.push("website URL");
	if (!input.contactName?.trim()) gaps.push("contact name");
	if (!input.contactEmail?.trim()) gaps.push("contact email");
	if (!input.description?.trim()) gaps.push("description");
	return gaps;
}

/** True only for kinds Ahotu accepts. Challenges excluded: Ahotu requires an
 * edition date + race/distance (verified 2026-09-27, no challenge format). */
export function isAhotuEligibleKind(kind: string): kind is AhotuEligibleKind {
	return (AHOTU_ELIGIBLE_KINDS as readonly string[]).includes(kind);
}

export interface AhotuQueueRow {
	id: number;
	object_id: string;
	kind: AhotuEligibleKind;
	status: AhotuQueueStatus;
	package_json: string;
	created_at: string;
	updated_at: string;
	submitted_at: string | null;
	ahotu_url: string | null;
	notes: string;
}

const SELECT_QUEUE = `SELECT id, object_id, kind, status, package_json,
	created_at, updated_at, submitted_at, ahotu_url, notes FROM ahotu_queue`;

/**
 * Auto-enqueue an object for Ahotu. Called from linkRunSignupRace after fanout
 * succeeds. Idempotent: one row per object_id (ON CONFLICT DO NOTHING).
 *
 * - Non-eligible kinds (challenge, fundraising, ...) are a no-op: Ahotu has
 *   no format for them.
 * - If the package cannot be built (missing edition date / distance), the
 *   row is still queued with a partial package and the gaps listed in
 *   `notes` — the object must always appear in the queue; the owner fills
 *   the gaps before the manual last mile.
 *
 * Own-D1 write only; no external sends.
 */
export async function enqueueAhotuForObject(
	db: D1Database,
	objectId: string,
	kind: string,
	raceInput: AhotuRaceInput,
): Promise<{ enqueued: boolean; reason: string }> {
	// Challenges excluded: Ahotu requires an edition date + race/distance
	// (verified 2026-09-27, no challenge format).
	if (!isAhotuEligibleKind(kind)) {
		return { enqueued: false, reason: "ineligible_kind" };
	}
	const gaps = describeAhotuGaps(raceInput);
	let packageJson: string;
	let notes: string;
	try {
		packageJson = JSON.stringify(buildAhotuPackage(raceInput));
		notes = gaps.length
			? `Queued by the Machine. Complete before the manual last mile: ${gaps.join(", ")}.`
			: "Queued by the Machine. Package complete.";
	} catch (err) {
		packageJson = JSON.stringify({
			partial: true,
			missing_fields: gaps,
			sport_category: AHOTU_SPORT_CATEGORY,
			event_name: raceInput.name,
			edition_date: raceInput.editionDate,
			city: raceInput.city ?? null,
			country: raceInput.country ?? null,
			distances: raceInput.distances ?? [],
			website_url: raceInput.websiteUrl ?? null,
			contact_name: raceInput.contactName ?? null,
			contact_email: raceInput.contactEmail ?? null,
			description: raceInput.description ?? null,
			manual_last_mile: AHOTU_MANUAL_LAST_MILE,
		});
		notes = `Package incomplete: ${(err as Error).message} Complete before the manual last mile: ${gaps.join(", ")}.`;
	}
	await db
		.prepare(
			`INSERT INTO ahotu_queue
				(object_id, kind, status, package_json, notes, created_at, updated_at)
			 VALUES (?, ?, 'queued', ?, ?, datetime('now'), datetime('now'))
			 ON CONFLICT(object_id) DO NOTHING`,
		)
		.bind(objectId, kind, packageJson, notes)
		.run();
	return { enqueued: true, reason: gaps.length ? "queued_with_gaps" : "queued_complete" };
}

export async function getAhotuQueue(db: D1Database): Promise<AhotuQueueRow[]> {
	const res = await db
		.prepare(`${SELECT_QUEUE} ORDER BY created_at, id`)
		.all<AhotuQueueRow>();
	return res.results ?? [];
}

export async function getAhotuQueueRow(
	db: D1Database,
	id: number,
): Promise<AhotuQueueRow | null> {
	const row = await db
		.prepare(`${SELECT_QUEUE} WHERE id = ? LIMIT 1`)
		.bind(id)
		.first<AhotuQueueRow>();
	return row ?? null;
}

export async function markAhotuSubmitted(
	db: D1Database,
	id: number,
	url?: string,
): Promise<void> {
	await db
		.prepare(
			`UPDATE ahotu_queue
			 SET status = 'submitted', submitted_at = datetime('now'),
			     ahotu_url = COALESCE(?, ahotu_url), updated_at = datetime('now')
			 WHERE id = ?`,
		)
		.bind(url ?? null, id)
		.run();
}

export async function markAhotuListed(db: D1Database, id: number, url: string): Promise<void> {
	await db
		.prepare(
			`UPDATE ahotu_queue
			 SET status = 'listed', ahotu_url = ?, updated_at = datetime('now')
			 WHERE id = ?`,
		)
		.bind(url, id)
		.run();
}

export async function markAhotuDuplicate(
	db: D1Database,
	id: number,
	existingUrl: string,
): Promise<void> {
	await db
		.prepare(
			`UPDATE ahotu_queue
			 SET status = 'duplicate_found', ahotu_url = ?, updated_at = datetime('now')
			 WHERE id = ?`,
		)
		.bind(existingUrl, id)
		.run();
}
