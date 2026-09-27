// Ahotu lane — Media Distribution System.
//
// Calibrated live 2026-09-27 against the real organiser-dashboard form
// (signed in with the owner's organiser account; full wizard mapped,
// nothing published). Ahotu (https://www.ahotu.com, World's Sports Group)
// is a global endurance race calendar.
//
// Verified facts encoded here:
// - An organiser account is REQUIRED and FREE. The owner created NWANA's
//   organiser account on 2026-09-27. Registration:
//   https://www.ahotu.com/members/registration/organiser
//   Account creation is an OWNER action — the Machine never creates it.
// - NO API, NO bulk/CSV import: manual per-event entry only, inside the
//   organiser dashboard.
// - The add-event flow is a wizard, not a single form:
//   Screen 1 "Create event" (https://www.ahotu.com/p/organiser-events/new):
//     Name* (+ name-language dropdown — REQUIRED by save validation,
//     choose "English"), Translated names (optional), Official website,
//     Year event started, Contact: Email / Facebook / Twitter / Instagram /
//     YouTube, Organisation dropdown. Save -> the edition wizard opens.
//     New events automatically enter "Waiting validation" status; there is
//     NO visible publish button and NO delete control — drafts cannot be
//     removed from the dashboard, so never create test drafts.
//   Screen 2 "Create a new edition" (5 tabs, Cancel/Save on each):
//     General: Date* (calendar picker; "To be confirmed" checkbox), Status
//       dropdown (Ok/Cancelled/Postponed/...).
//     Descriptions: per-language tabs ("Add description"), plain textarea.
//     Registration: URL, Starts/Ends date pickers, Max participants.
//     Location*: venue/city search; Country and City auto-set; Lat/Lng.
//     Races: "Add a race" per race — Name, Activity dropdown ("Nordic
//       walking" IS a verified option), second format dropdown (Standard,
//       Time trial, ...), Charity checkbox, Location radio Hybrid/On
//       site/Virtual, Start Time, Status/Participation/Selection/
//       Restrictions radios, Min/Max age, Field size, Distance* (number +
//       unit: Kilometer/Meter/Mile/Feet/Step/Story/Yard/Hour/Day/Minute;
//       Marathon/Half Marathon shortcuts; Certified course, Timed),
//       Elevation/Elevation drop/Min/Max altitude, Course URL, Terrain
//       (Road/Mixed/Trail/Track/Urban trail/Indoor), Topography, Profile,
//       Environment checkboxes, # aid stations.
//   Screen 3 "Add photos": jpeg/png/tiff, 5-15 MB landscape preferred;
//     no flyers, course maps, or images with text.
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
 * The exact human last mile for the Ahotu organiser dashboard (wizard flow,
 * calibrated live 2026-09-27 against the real form). Duplicated verbatim
 * into the migration's media_submission_endpoints.manual_last_mile.
 */
export const AHOTU_MANUAL_LAST_MILE = `EXACT MANUAL LAST MILE — AHOTU (wizard calibrated live 2026-09-27). A person performs every step; the Machine never submits.
0. FIRST check the event is not already listed (Ahotu deletes duplicates): ${AHOTU_NORDIC_WALKING_URL}
1. Sign in to the organiser dashboard (owner's free organiser account): https://www.ahotu.com/p/profile/organiser — open "My events" -> "+ Add event".
2. SCREEN "Create event": Name* = the prepared event name, and in the name-language dropdown choose "English" (save validation rejects the form without a language). Official website = prepared URL. Year event started = prepared year. Contact: Email / Facebook / Twitter / Instagram / YouTube = prepared values. Organisation: leave "-" unless told otherwise. Click "Save" -> the edition wizard opens.
3. EDITION wizard, tab "General": Date* = the prepared edition date (calendar picker; tick "To be confirmed" only if the date is not final). Status: leave "Ok".
4. Tab "Descriptions": "Add description" -> language "English" -> paste the prepared description.
5. Tab "Registration": URL = prepared registration URL (Starts/Ends/Max participants only if prepared).
6. Tab "Location": Location* = type the prepared venue/city and pick the match from the search (Country/City set automatically); verify they are right.
7. Tab "Races": "Add a race" -> for each prepared race: Name = race name; Activity = "Nordic walking" (dropdown option, verified); Distance* = value + unit (Kilometer/Mile/...); Start Time if prepared; Location: On site (or Hybrid/Virtual if prepared); Terrain/Topography/Profile if prepared. Repeat "Add a race" for every distance.
8. Save the edition. New events enter "Waiting validation" automatically; Ahotu reviews before the event goes public. There is no delete control — never create test drafts.
9. When the event is live on ahotu.com, record its URL in ahotu_queue (markAhotuListed) and in media_distributions.external_url.
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

/** Calibrated form version: the live add-event wizard as mapped 2026-09-27. */
export const AHOTU_FORM_VERSION = "2026-09-27";

export interface AhotuRaceInput {
	name: string;
	/** Edition date, e.g. "2027-03-14". REQUIRED by Ahotu. */
	editionDate: string | null;
	city?: string | null;
	country?: string | null;
	/** At least one race/distance, e.g. ["10K", "5K"]. REQUIRED by Ahotu. */
	distances: string[];
	websiteUrl?: string | null;
	registrationUrl?: string | null;
	yearStarted?: string | null;
	contactEmail?: string | null;
	facebook?: string | null;
	twitter?: string | null;
	instagram?: string | null;
	youtube?: string | null;
	description?: string | null;
}

export interface AhotuPackage {
	form_version: typeof AHOTU_FORM_VERSION;
	/** "Nordic walking" — the per-race Activity dropdown option (verified). */
	race_activity: typeof AHOTU_SPORT_CATEGORY;
	event_name: string;
	/** REQUIRED by save validation next to the name — always "English". */
	name_language: "English";
	year_started: string | null;
	edition_date: string;
	city: string | null;
	country: string | null;
	distances: string[];
	website_url: string | null;
	registration_url: string | null;
	contact_email: string | null;
	socials: {
		facebook: string | null;
		twitter: string | null;
		instagram: string | null;
		youtube: string | null;
	};
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
		form_version: AHOTU_FORM_VERSION,
		race_activity: AHOTU_SPORT_CATEGORY,
		event_name: input.name.trim(),
		name_language: "English",
		year_started: input.yearStarted?.trim() || null,
		edition_date: (input.editionDate as string).trim(),
		city: input.city?.trim() || null,
		country: input.country?.trim() || null,
		distances,
		website_url: input.websiteUrl?.trim() || null,
		registration_url: input.registrationUrl?.trim() || null,
		contact_email: input.contactEmail?.trim() || null,
		socials: {
			facebook: input.facebook?.trim() || null,
			twitter: input.twitter?.trim() || null,
			instagram: input.instagram?.trim() || null,
			youtube: input.youtube?.trim() || null,
		},
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
	if (!input.registrationUrl?.trim()) gaps.push("registration URL");
	if (!input.yearStarted?.trim()) gaps.push("year event started");
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
			form_version: AHOTU_FORM_VERSION,
			race_activity: AHOTU_SPORT_CATEGORY,
			event_name: raceInput.name,
			name_language: "English",
			year_started: raceInput.yearStarted ?? null,
			edition_date: raceInput.editionDate,
			city: raceInput.city ?? null,
			country: raceInput.country ?? null,
			distances: raceInput.distances ?? [],
			website_url: raceInput.websiteUrl ?? null,
			registration_url: raceInput.registrationUrl ?? null,
			contact_email: raceInput.contactEmail ?? null,
			socials: {
				facebook: raceInput.facebook ?? null,
				twitter: raceInput.twitter ?? null,
				instagram: raceInput.instagram ?? null,
				youtube: raceInput.youtube ?? null,
			},
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
