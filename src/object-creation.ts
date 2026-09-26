// NWANA Engine — Object creation workflow.
//
// The owner creates a new NWANA object (Challenge, Series, Championship,
// Race, ...) ONCE inside NWANA Machine. The machine then:
//   1. creates through the official RunSignup/TicketSignup API everything
//      the API really allows,
//   2. fills every field the API accepts,
//   3. stores the Machine-object <-> RunSignup-ID link,
//   4. shows the owner ONLY the fields/steps the API cannot perform,
//   5. gives an exact manual last mile in the RunSignup dashboard for those.
//
// HONEST BOUNDARY (verified against the official RunSignup API docs,
// https://runsignup.com/API/Methods, 2026-09-26):
// - The API CANNOT create: race / event / challenge / series /
//   championship / fundraising / sponsor / volunteer / store / website /
//   membership / email objects. Creating the object itself is ALWAYS a
//   dashboard step. The machine never claims otherwise.
// - The API CAN (after the object exists in the dashboard):
//   race description, race URLs, registration periods (FULL REPLACE),
//   age-based pricing (FULL REPLACE), race questions (upsert; every omitted
//   question is DELETED unless append_questions=T), coupons (add/edit),
//   race divisions, race corrals, participants, groups/teams, results and
//   result sets, series scoring (BETA, existing series only), ticket
//   add/edit (scoped key), volunteer check-in.
// - Replace-semantics steps ALWAYS show a dry-run preview first.
// - NOTHING is written to RunSignup without the owner's explicit per-step
//   confirmation ("APPLY_STEP"), on top of the operating-center owner key.
//
// Storage: the creation packet is a row in the existing `objects` table
// (object_type = 'creation_packet'); the linked RunSignup race is another
// `objects` row (source = 'runsignup', source_type = 'race'); the link is a
// row in the existing `relationships` table. No new migration.

import {
	postRunSignupForm,
	runSignupGetJson,
	type RunSignupWriteAccess,
} from "./race-lifecycle";

export type { RunSignupWriteAccess };

export const OBJECT_CREATION_PACKET_TYPE = "creation_packet";

export type ObjectCreationKind =
	| "challenge"
	| "series"
	| "championship"
	| "race"
	| "fundraising"
	| "membership"
	| "volunteer"
	| "store"
	| "website";

export const OBJECT_CREATION_KINDS: Array<{
	kind: ObjectCreationKind;
	label: string;
}> = [
	{ kind: "challenge", label: "Challenge" },
	{ kind: "series", label: "Series" },
	{ kind: "championship", label: "Championship" },
	{ kind: "race", label: "Race" },
	{ kind: "fundraising", label: "Fundraising campaign" },
	{ kind: "membership", label: "Membership" },
	{ kind: "volunteer", label: "Volunteer program" },
	{ kind: "store", label: "Store" },
	{ kind: "website", label: "Website" },
];

export type CreationPacketStatus =
	| "dashboard_pending"
	| "linked"
	| "api_in_progress"
	| "manual_pending"
	| "complete";

export type CreationStepKind = "api" | "manual";
export type CreationStepStatus = "pending" | "done" | "error" | "skipped";

export interface CreationStep {
	step_id: string;
	kind: CreationStepKind;
	title: string;
	description: string;
	status: CreationStepStatus;
	// API steps only.
	endpoint?: string;
	replace_semantics?: "full_replace" | "delete_omitted" | "additive";
	warnings?: string[];
	requires?: string[];
	payload_preview?: unknown;
	executed_at?: string | null;
	error?: string | null;
	// Manual steps only.
	dashboard_steps?: string[];
}

// ---------------------------------------------------------------------------
// Field capability map: the honest boundary as data.
// ---------------------------------------------------------------------------

export type FieldCapability =
	| "api_writable"
	| "api_replace"
	| "api_upsert_delete_omitted"
	| "dashboard_only";

export interface FieldCapabilityEntry {
	field: string;
	capability: FieldCapability;
	// Verified API endpoint path, or null when the API cannot do it (or the
	// exact URL is not yet verified — the step then stays manual).
	endpoint: string | null;
	access: string;
	note: string;
}

// Verified 2026-09-26 against https://runsignup.com/API/Methods and the
// individual method pages. Entries with endpoint: null are NOT wired into
// the apply path; the executor refuses steps without a verified endpoint.
export const OBJECT_FIELD_CAPABILITIES: FieldCapabilityEntry[] = [
	{
		field: "Create the race / event / challenge / series / championship object itself",
		capability: "dashboard_only",
		endpoint: null,
		access: "Race Director (dashboard)",
		note: "The published API catalog has no create method for races, events, series, challenges, fundraising, sponsors, volunteers, stores, websites, memberships, or email. Always the first manual step.",
	},
	{
		field: "Create events under a race",
		capability: "dashboard_only",
		endpoint: null,
		access: "Race Director (dashboard)",
		note: "No API method creates events. Dashboard: race -> Events -> Add Event.",
	},
	{
		field: "Race description",
		capability: "api_writable",
		endpoint: "POST /rest/race/:race_id/race-description",
		access: "Partners, Race Directors",
		note: "Method 'Set a Race's Description'. description is a direct POST field.",
	},
	{
		field: "Race and event URLs (external race URL, results URL, Facebook)",
		capability: "api_writable",
		endpoint: "POST /rest/race/:race_id/race-urls",
		access: "Partners, Race Directors",
		note: "Method 'Set Race URLs'. Blank value removes a URL. Do NOT set alternate_registration_url unless registration must leave RunSignup.",
	},
	{
		field: "Registration periods",
		capability: "api_replace",
		endpoint: "POST /rest/race/:race_id/registration-periods",
		access: "Affiliates, Partners, Race Directors, Users, Timers, Super Partner",
		note: "Method 'Setup Event Registration Periods'. FULL REPLACE: all existing periods are removed first. Always dry-run preview.",
	},
	{
		field: "Age-based pricing",
		capability: "api_replace",
		endpoint: "POST /rest/race/:race_id/pricing/age-based",
		access: "Affiliates, Partners, Race Directors, Users, Timers, Super Partner",
		note: "Method 'Setup Event Age Based Pricing'. FULL REPLACE: all existing pricing is removed first. Always dry-run preview.",
	},
	{
		field: "Registration questions",
		capability: "api_upsert_delete_omitted",
		endpoint: "POST /rest/race/:race_id/questions",
		access: "Affiliates, Partners, Race Directors, Users, Timers, Super Partner",
		note: "Method 'Set up Race Questions'. Include question_id to edit; omitted questions are DELETED unless append_questions=T. The plan defaults to append_questions=T.",
	},
	{
		field: "Coupons",
		capability: "api_writable",
		endpoint: "POST /rest/race/:race_id/coupons",
		access: "Affiliates, Partners, Race Directors, Users, Timers, Super Partner",
		note: "Method 'Add or Edit Coupon'. coupon_id null = new coupon; shared-between-races coupons cannot be edited via API.",
	},
	{
		field: "Race divisions",
		capability: "api_writable",
		endpoint: null,
		access: "Partners, Race Directors, Timers",
		note: "Method 'Create or Edit Race Divisions' exists in the API catalog; exact URL not yet verified against the docs, so the step stays manual until wired.",
	},
	{
		field: "Race corrals",
		capability: "api_writable",
		endpoint: null,
		access: "Partners, Race Directors, Timers",
		note: "Method 'Create or Edit Race Corrals' exists in the API catalog; exact URL not yet verified against the docs, so the step stays manual until wired.",
	},
	{
		field: "Participants",
		capability: "api_writable",
		endpoint: null,
		access: "Partners, Race Directors, Timers",
		note: "Method 'Add or Edit Race Participants' exists in the API catalog; exact URL not yet verified against the docs, so the step stays manual until wired.",
	},
	{
		field: "Groups / teams",
		capability: "api_writable",
		endpoint: null,
		access: "Affiliates, Partners, Race Directors, Users, Timers, Super Partner",
		note: "Method 'Add/Edit Race Groups/Teams' exists in the API catalog; exact URL not yet verified against the docs, so the step stays manual until wired.",
	},
	{
		field: "Results and result sets",
		capability: "api_writable",
		endpoint: "POST /rest/race/:race_id/results/full-results",
		access: "Partners, Race Directors, Timers",
		note: "Already used by the Series 2026 levels pipeline (custom fields + full results).",
	},
	{
		field: "Series scoring (existing series)",
		capability: "api_writable",
		endpoint: "POST /rest/v2/race-series/non-standard-scoring-types.json",
		access: "Race Directors, Timers",
		note: "BETA. Already used by the Series 2026 levels pipeline. Creates scoring inside an existing series; it does not create the series itself.",
	},
	{
		field: "Tickets (add/edit)",
		capability: "api_writable",
		endpoint: null,
		access: "Ticket Events (scoped key)",
		note: "Ticket add/edit needs a scoped ticket-event key the current credentials may not hold; exact URL not yet verified, so the step stays manual until wired.",
	},
	{
		field: "Volunteer check-in",
		capability: "api_writable",
		endpoint: null,
		access: "Partners, Race Directors, Timers",
		note: "Check-in timestamps are readable and check-in is API-possible; volunteer program setup itself is dashboard-only. Exact write URL not yet verified.",
	},
	{
		field: "Fundraising / donation setup (pages, goals, fundraisers)",
		capability: "dashboard_only",
		endpoint: null,
		access: "Race Director (dashboard)",
		note: "The API catalog exposes only read methods for donations and fundraisers (Get Race Donations, Get Fundraisers for Races). Setup is dashboard-only.",
	},
	{
		field: "Store setup",
		capability: "dashboard_only",
		endpoint: null,
		access: "Race Director (dashboard)",
		note: "The API catalog exposes only read methods for store purchases. Store setup is dashboard-only.",
	},
	{
		field: "Website pages",
		capability: "dashboard_only",
		endpoint: null,
		access: "Race Director (dashboard)",
		note: "No website-page write methods in the published API catalog.",
	},
	{
		field: "Membership setup",
		capability: "dashboard_only",
		endpoint: null,
		access: "Race Director (dashboard)",
		note: "The API catalog exposes only read methods for club members and memberships. Setup is dashboard-only.",
	},
	{
		field: "Email campaigns, contacts, lists",
		capability: "dashboard_only",
		endpoint: null,
		access: "Race Director (dashboard)",
		note: "The published API catalog exposes no Email V2, contact-list, campaign-send, or email-reporting methods. Email Marketing dashboard is the last mile.",
	},
	{
		field: "Sponsors",
		capability: "dashboard_only",
		endpoint: null,
		access: "Race Director (dashboard)",
		note: "No sponsor write methods in the published API catalog.",
	},
];

// ---------------------------------------------------------------------------
// Packet model. Stored in the existing `objects` table
// (object_type = 'creation_packet'); every step's status lives in metadata.
// ---------------------------------------------------------------------------

export interface RegistrationPeriodInput {
	registration_opens: string;
	registration_closes: string;
	race_fee_in_cents: number;
}

export interface AgeBasedPricingInput {
	start_time: string;
	end_time: string;
	race_fee_in_cents: number;
	min_age?: number;
	max_age?: number;
}

export interface CreationPacketInput {
	kind: ObjectCreationKind;
	title: string;
	description?: string;
	event_date?: string;
	distance?: string;
	format?: string;
	external_race_url?: string;
	external_results_url?: string;
	facebook_page_id?: string;
	// Advanced API fields; used only when the owner supplies them.
	runsignup_event_id?: number;
	registration_periods?: RegistrationPeriodInput[];
	age_based_pricing?: AgeBasedPricingInput[];
	questions?: Array<Record<string, unknown>>;
	append_questions?: boolean;
	coupons?: Array<Record<string, unknown>>;
	notes?: string;
}

export interface CreationPacketMeta {
	kind: ObjectCreationKind;
	description: string | null;
	event_date: string | null;
	distance: string | null;
	format: string | null;
	external_race_url: string | null;
	external_results_url: string | null;
	facebook_page_id: string | null;
	runsignup_event_id: number | null;
	registration_periods: RegistrationPeriodInput[];
	age_based_pricing: AgeBasedPricingInput[];
	questions: Array<Record<string, unknown>>;
	append_questions: boolean;
	coupons: Array<Record<string, unknown>>;
	notes: string | null;
	runsignup_race_id: number | null;
	runsignup_race_name: string | null;
	write_access: RunSignupWriteAccess;
	probe: CredentialProbeResult | null;
	steps: CreationStep[];
	created_by: "engine:object-creation";
}

export interface CreationPacket {
	packet_id: string;
	title: string;
	status: CreationPacketStatus;
	meta: CreationPacketMeta;
	created_at: string;
	updated_at: string;
}

export interface CredentialProbeResult {
	ran_at: string;
	ok: boolean;
	method: "entity-info" | "races-list" | "none";
	entity_type: string | null;
	entity_specific_id: string | null;
	note: string;
}

const KIND_LABEL: Record<ObjectCreationKind, string> = {
	challenge: "Challenge",
	series: "Series",
	championship: "Championship",
	race: "Race",
	fundraising: "Fundraising campaign",
	membership: "Membership",
	volunteer: "Volunteer program",
	store: "Store",
	website: "Website",
};

function kindLabel(kind: ObjectCreationKind): string {
	return KIND_LABEL[kind] ?? kind;
}

function pendingStep(step: Omit<CreationStep, "status">): CreationStep {
	return { ...step, status: "pending" };
}

// Pure: builds the ordered step list for a packet. Manual steps first
// (the dashboard work the API cannot do), then the API steps the machine
// can execute once the RunSignup race is linked.
export function buildCreationSteps(input: CreationPacketInput): CreationStep[] {
	const label = kindLabel(input.kind);
	const title = input.title.trim();
	const steps: CreationStep[] = [];

	const createDashboardSteps = [
		"Open https://runsignup.com and sign in with the NWANA race-director account.",
		`In the dashboard, use Create a Race and complete the wizard. Race name: "${title}".` +
			(input.event_date ? ` Race date: ${input.event_date}.` : "") +
			(input.format === "virtual" ? " Format: virtual race." : ""),
		"On the race dashboard, copy the Race ID (from the race URL or Race Info).",
		"Return to the Operating Center -> Create page, open this packet, and link the Race ID. The machine verifies it with a read-only API call.",
	];
	steps.push(
		pendingStep({
			step_id: "dashboard_create_object",
			kind: "manual",
			title: `Create the ${label} in the RunSignup dashboard`,
			description:
				"The official API cannot create races, events, series, or challenges. This is the one creation step that stays manual by design.",
			dashboard_steps: createDashboardSteps,
		}),
	);

	if (
		input.kind === "challenge" ||
		input.kind === "series" ||
		input.kind === "championship" ||
		input.kind === "race"
	) {
		steps.push(
			pendingStep({
				step_id: "dashboard_create_event",
				kind: "manual",
				title: "Add the event(s) under the race",
				description:
					"Events cannot be created via API. Create at least one event, then note its Event ID: the API steps for periods, pricing, and questions need it.",
				dashboard_steps: [
					"Race dashboard -> Events -> Add Event.",
					`Event name: "${title}"` +
						(input.distance ? ` — ${input.distance}` : "") +
						(input.event_date ? `, date ${input.event_date}` : "") +
						".",
					"Copy the Event ID and store it on this packet (link step accepts an event ID).",
				],
			}),
		);
	}

	const dashboardOnly: Array<{
		id: string;
		title: string;
		description: string;
		steps: string[];
	}> = [];
	if (input.kind === "fundraising") {
		dashboardOnly.push({
			id: "dashboard_fundraising",
			title: "Set up fundraising in the dashboard",
			description:
				"The API exposes only read methods for donations and fundraisers. Pages, goals, and fundraisers are dashboard-only.",
			steps: [
				"Race dashboard -> Donations / Fundraising -> set up the donation page and goal.",
				"Enable fundraisers if the campaign needs them.",
				"Mark this step done when the fundraising setup is live.",
			],
		});
	}
	if (input.kind === "membership") {
		dashboardOnly.push({
			id: "dashboard_membership",
			title: "Set up memberships in the dashboard",
			description:
				"The API exposes only read methods for club members and memberships. Setup is dashboard-only.",
			steps: [
				"Race dashboard -> Memberships -> configure membership types and pricing.",
				"Mark this step done when memberships are live.",
			],
		});
	}
	if (input.kind === "volunteer") {
		dashboardOnly.push({
			id: "dashboard_volunteers",
			title: "Set up volunteers in the dashboard",
			description:
				"Volunteer program setup is dashboard-only; check-in timestamps are readable via API.",
			steps: [
				"Race dashboard -> Volunteers -> configure volunteer roles and shifts.",
				"Mark this step done when the volunteer setup is live.",
			],
		});
	}
	if (input.kind === "store") {
		dashboardOnly.push({
			id: "dashboard_store",
			title: "Set up the store in the dashboard",
			description:
				"The API exposes only read methods for store purchases. Store setup is dashboard-only.",
			steps: [
				"Race dashboard -> Store -> add products and pricing.",
				"Mark this step done when the store is live.",
			],
		});
	}
	if (input.kind === "website") {
		dashboardOnly.push({
			id: "dashboard_website",
			title: "Build the website pages in the dashboard",
			description: "Website pages have no write API. Build them in the dashboard.",
			steps: [
				"Race dashboard -> Website -> build the pages for this site.",
				"Mark this step done when the pages are published.",
			],
		});
	}
	if (
		input.kind === "challenge" ||
		input.kind === "series" ||
		input.kind === "championship" ||
		input.kind === "race"
	) {
		dashboardOnly.push({
			id: "dashboard_sponsors",
			title: "Add sponsors in the dashboard",
			description: "Sponsors have no write API.",
			steps: [
				"Race dashboard -> Sponsors -> add sponsor logos and tiers.",
				"Mark this step done when sponsors are in place (or skip if none yet).",
			],
		});
	}
	dashboardOnly.push({
		id: "dashboard_email",
		title: "Email setup stays in the Email Marketing dashboard",
		description:
			"The published API catalog has no Email V2 methods. Audience, message, and send stay in the dashboard.",
		steps: [
			"Open the NWANA Email Marketing dashboard when the object is ready to announce.",
			"Mark this step done after the announcement email is handled (distribution is a later stage).",
		],
	});
	for (const item of dashboardOnly) {
		steps.push(
			pendingStep({
				step_id: item.id,
				kind: "manual",
				title: item.title,
				description: item.description,
				dashboard_steps: item.steps,
			}),
		);
	}

	// API steps: generated only for fields the owner actually supplied.
	if (input.description && input.description.trim()) {
		steps.push(
			pendingStep({
				step_id: "set_race_description",
				kind: "api",
				title: "Set the race description via API",
				description: "Writes the packet description to the RunSignup race.",
				endpoint: "POST /rest/race/:race_id/race-description",
				replace_semantics: "additive",
				requires: ["runsignup_race_id"],
				payload_preview: { description: input.description.trim() },
			}),
		);
	}
	const urlFields: Record<string, string> = {};
	if (input.external_race_url?.trim()) urlFields.external_race_url = input.external_race_url.trim();
	if (input.external_results_url?.trim()) urlFields.external_results_url = input.external_results_url.trim();
	if (input.facebook_page_id?.trim()) urlFields.facebook_page_id = input.facebook_page_id.trim();
	if (Object.keys(urlFields).length > 0) {
		steps.push(
			pendingStep({
				step_id: "set_race_urls",
				kind: "api",
				title: "Set race URLs via API",
				description: "Writes external race/results URLs to the RunSignup race.",
				endpoint: "POST /rest/race/:race_id/race-urls",
				replace_semantics: "additive",
				requires: ["runsignup_race_id"],
				warnings: [
					"Do not set alternate_registration_url: registration would leave RunSignup.",
				],
				payload_preview: { race: urlFields },
			}),
		);
	}
	if (input.registration_periods && input.registration_periods.length > 0) {
		steps.push(
			pendingStep({
				step_id: "setup_registration_periods",
				kind: "api",
				title: "Set registration periods via API",
				description: "Writes the registration periods for the event.",
				endpoint: "POST /rest/race/:race_id/registration-periods",
				replace_semantics: "full_replace",
				requires: ["runsignup_race_id", "runsignup_event_id"],
				warnings: [
					"DANGER: all existing registration periods are removed and replaced. Review the dry-run payload before confirming.",
				],
				payload_preview: {
					event_id: input.runsignup_event_id ?? "(set the Event ID first)",
					registration_periods: input.registration_periods,
				},
			}),
		);
	}
	if (input.age_based_pricing && input.age_based_pricing.length > 0) {
		steps.push(
			pendingStep({
				step_id: "setup_age_based_pricing",
				kind: "api",
				title: "Set age-based pricing via API",
				description: "Writes age-based pricing for the event.",
				endpoint: "POST /rest/race/:race_id/pricing/age-based",
				replace_semantics: "full_replace",
				requires: ["runsignup_race_id", "runsignup_event_id"],
				warnings: [
					"DANGER: all existing pricing is removed and replaced. Review the dry-run payload before confirming.",
				],
				payload_preview: {
					event_id: input.runsignup_event_id ?? "(set the Event ID first)",
					age_based_pricing: input.age_based_pricing,
				},
			}),
		);
	}
	if (input.questions && input.questions.length > 0) {
		const append = input.append_questions !== false;
		steps.push(
			pendingStep({
				step_id: "setup_race_questions",
				kind: "api",
				title: "Set registration questions via API",
				description: append
					? "Adds the questions without touching existing ones (append_questions=T)."
					: "Upserts questions; existing questions NOT in this payload will be DELETED.",
				endpoint: "POST /rest/race/:race_id/questions",
				replace_semantics: "delete_omitted",
				requires: ["runsignup_race_id"],
				warnings: append
					? ["append_questions=T: existing questions are preserved."]
					: [
						"DANGER: append_questions is off. Any existing question not in this payload will be DELETED. Review the dry-run payload before confirming.",
					],
				payload_preview: {
					append_questions: append ? "T" : "F",
					questions: input.questions,
				},
			}),
		);
	}
	if (input.coupons && input.coupons.length > 0) {
		steps.push(
			pendingStep({
				step_id: "add_coupons",
				kind: "api",
				title: "Add coupons via API",
				description: "Adds the coupons (coupon_id null = new coupon).",
				endpoint: "POST /rest/race/:race_id/coupons",
				replace_semantics: "additive",
				requires: ["runsignup_race_id"],
				warnings: [
					"Coupons shared between races cannot be edited via API.",
				],
				payload_preview: { coupons: input.coupons },
			}),
		);
	}

	return steps;
}

// Pure: derives the packet status from the link state and step states.
export function derivePacketStatus(meta: CreationPacketMeta): CreationPacketStatus {
	if (!meta.runsignup_race_id) return "dashboard_pending";
	const apiSteps = meta.steps.filter((s) => s.kind === "api");
	const manualSteps = meta.steps.filter((s) => s.kind === "manual");
	const finished = (s: CreationStep) => s.status === "done" || s.status === "skipped";
	const apiDone = apiSteps.every(finished);
	const manualDone = manualSteps.every(finished);
	if (apiDone && manualDone) return "complete";
	if (apiDone) return "manual_pending";
	if (apiSteps.some((s) => s.status === "done")) return "api_in_progress";
	return "linked";
}

export interface WritePlanStep {
	step_id: string;
	kind: CreationStepKind;
	title: string;
	description: string;
	status: CreationStepStatus;
	endpoint: string | null;
	replace_semantics: "full_replace" | "delete_omitted" | "additive" | null;
	warnings: string[];
	requires: string[];
	payload_preview: unknown;
	dashboard_steps: string[] | null;
	needs_event_id: boolean;
}

export interface ObjectWritePlan {
	packet_id: string;
	title: string;
	kind: ObjectCreationKind;
	write_mode: "dry_run";
	executed: false;
	write_access: RunSignupWriteAccess;
	probe_ready: boolean;
	probe_note: string | null;
	linked: boolean;
	runsignup_race_id: number | null;
	report: string;
	steps: WritePlanStep[];
	manual_last_mile: WritePlanStep[];
}

// Pure: the dry-run plan. executed is always false; nothing here touches
// RunSignup. The plan merges the stored per-step statuses so a rebuilt plan
// never loses completed work.
export function buildWritePlan(packet: CreationPacket): ObjectWritePlan {
	const meta = packet.meta;
	const toPlanStep = (s: CreationStep): WritePlanStep => ({
		step_id: s.step_id,
		kind: s.kind,
		title: s.title,
		description: s.description,
		status: s.status,
		endpoint: s.endpoint ?? null,
		replace_semantics: s.replace_semantics ?? null,
		warnings: s.warnings ?? [],
		requires: s.requires ?? [],
		payload_preview: s.payload_preview ?? null,
		dashboard_steps: s.dashboard_steps ?? null,
		needs_event_id:
			(s.requires ?? []).includes("runsignup_event_id") &&
			meta.runsignup_event_id === null,
	});
	const apiSteps = meta.steps.filter((s) => s.kind === "api").map(toPlanStep);
	const manualSteps = meta.steps.filter((s) => s.kind === "manual").map(toPlanStep);
	const pendingManual = manualSteps.filter((s) => s.status === "pending" || s.status === "error");
	const pendingApi = apiSteps.filter((s) => s.status === "pending" || s.status === "error");
	return {
		packet_id: packet.packet_id,
		title: packet.title,
		kind: meta.kind,
		write_mode: "dry_run",
		executed: false,
		write_access: meta.write_access,
		probe_ready: meta.probe?.ok === true,
		probe_note: meta.probe ? meta.probe.note : null,
		linked: meta.runsignup_race_id !== null,
		runsignup_race_id: meta.runsignup_race_id,
		report:
			`DRY RUN: packet ${packet.packet_id} ("${packet.title}"). ` +
			`${pendingApi.length} API step(s) pending, ${pendingManual.length} manual step(s) pending. ` +
			`Write access is ${meta.write_access}; nothing was written.`,
		steps: apiSteps,
		manual_last_mile: manualSteps,
	};
}

// ---------------------------------------------------------------------------
// D1 persistence (existing `objects` / `relationships` tables only).
// ---------------------------------------------------------------------------

function metaFromInput(input: CreationPacketInput): CreationPacketMeta {
	const clean = (v: string | undefined): string | null => {
		const t = (v ?? "").trim();
		return t ? t : null;
	};
	return {
		kind: input.kind,
		description: clean(input.description),
		event_date: clean(input.event_date),
		distance: clean(input.distance),
		format: clean(input.format),
		external_race_url: clean(input.external_race_url),
		external_results_url: clean(input.external_results_url),
		facebook_page_id: clean(input.facebook_page_id),
		runsignup_event_id:
			typeof input.runsignup_event_id === "number" ? input.runsignup_event_id : null,
		registration_periods: input.registration_periods ?? [],
		age_based_pricing: input.age_based_pricing ?? [],
		questions: input.questions ?? [],
		append_questions: input.append_questions !== false,
		coupons: input.coupons ?? [],
		notes: clean(input.notes),
		runsignup_race_id: null,
		runsignup_race_name: null,
		write_access: "UNKNOWN",
		probe: null,
		steps: buildCreationSteps(input),
		created_by: "engine:object-creation",
	};
}

interface PacketRow {
	object_id: string;
	title: string | null;
	metadata: string | null;
	created_at: string;
	updated_at: string;
}

function rowToPacket(row: PacketRow): CreationPacket {
	const meta = JSON.parse(row.metadata ?? "{}") as CreationPacketMeta;
	return {
		packet_id: row.object_id,
		title: row.title ?? "",
		status: derivePacketStatus(meta),
		meta,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

function newPacketId(): string {
	const stamp = Date.now().toString(36).toUpperCase();
	const rand = Math.floor(Math.random() * 1296)
		.toString(36)
		.toUpperCase()
		.padStart(2, "0");
	return `PACKET-${stamp}-${rand}`;
}

export async function createCreationPacket(
	db: D1Database,
	input: CreationPacketInput,
	opts?: { packet_id?: string },
): Promise<CreationPacket> {
	if (!input.title || !input.title.trim()) {
		throw new Error("A title is required to create a packet.");
	}
	if (!OBJECT_CREATION_KINDS.some((k) => k.kind === input.kind)) {
		throw new Error(`Unknown object kind: ${input.kind}`);
	}
	const packetId = opts?.packet_id ?? newPacketId();
	const meta = metaFromInput(input);
	await db
		.prepare(
			`INSERT INTO objects (object_id, object_type, title, source, source_type, source_id, status, metadata)
			 VALUES (?, ?, ?, 'machine', 'creation_packet', NULL, 'active', ?)`,
		)
		.bind(packetId, OBJECT_CREATION_PACKET_TYPE, input.title.trim(), JSON.stringify(meta))
		.run();
	const row = await db
		.prepare(
			`SELECT object_id, title, metadata, created_at, updated_at FROM objects WHERE object_id = ?`,
		)
		.bind(packetId)
		.first<PacketRow>();
	if (!row) throw new Error("Packet was not stored.");
	return rowToPacket(row);
}

export async function listCreationPackets(db: D1Database): Promise<CreationPacket[]> {
	const rows = await db
		.prepare(
			`SELECT object_id, title, metadata, created_at, updated_at FROM objects
			 WHERE object_type = ? ORDER BY created_at DESC`,
		)
		.bind(OBJECT_CREATION_PACKET_TYPE)
		.all<PacketRow>();
	return rows.results.map(rowToPacket);
}

export async function getCreationPacket(
	db: D1Database,
	packetId: string,
): Promise<CreationPacket | null> {
	const row = await db
		.prepare(
			`SELECT object_id, title, metadata, created_at, updated_at FROM objects
			 WHERE object_id = ? AND object_type = ?`,
		)
		.bind(packetId, OBJECT_CREATION_PACKET_TYPE)
		.first<PacketRow>();
	return row ? rowToPacket(row) : null;
}

async function savePacketMeta(
	db: D1Database,
	packetId: string,
	meta: CreationPacketMeta,
): Promise<void> {
	await db
		.prepare(
			`UPDATE objects SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE object_id = ?`,
		)
		.bind(JSON.stringify(meta), packetId)
		.run();
}

// ---------------------------------------------------------------------------
// Read-only credential probe. Safe GET only; it never writes anything.
// The workflow does not consider itself ready until this probe succeeds.
// ---------------------------------------------------------------------------

export async function probeRunSignupCredentials(input: {
	accessToken: string;
}): Promise<CredentialProbeResult> {
	const ranAt = new Date().toISOString();
	// Primary: the documented "Get V2 API Key Entity Info" endpoint.
	try {
		const url = new URL("https://api.runsignup.com/rest/v2/auth-info/entity-info.json");
		url.searchParams.set("format", "json");
		const data = await runSignupGetJson(url, { accessToken: input.accessToken });
		const entity = (data.entity_info ?? data) as Record<string, unknown>;
		return {
			ran_at: ranAt,
			ok: true,
			method: "entity-info",
			entity_type: typeof entity.entity_type === "string" ? entity.entity_type : null,
			entity_specific_id:
				entity.entity_specific_id !== undefined && entity.entity_specific_id !== null
					? String(entity.entity_specific_id)
					: null,
			note: "Entity-info endpoint accepted the token. Read access verified.",
		};
	} catch {
		// Fallback: the races list is proven to work with the Bearer token.
		try {
			const url = new URL("https://api.runsignup.com/rest/races");
			url.searchParams.set("format", "json");
			url.searchParams.set("results_per_page", "1");
			await runSignupGetJson(url, { accessToken: input.accessToken });
			return {
				ran_at: ranAt,
				ok: true,
				method: "races-list",
				entity_type: null,
				entity_specific_id: null,
				note: "Entity-info did not accept this token; read access verified via the races list instead.",
			};
		} catch (error) {
			return {
				ran_at: ranAt,
				ok: false,
				method: "none",
				entity_type: null,
				entity_specific_id: null,
				note: `Probe failed: ${(error as Error).message}`,
			};
		}
	}
}

export async function saveProbeResult(
	db: D1Database,
	packetId: string,
	probe: CredentialProbeResult,
): Promise<CreationPacket> {
	const packet = await getCreationPacket(db, packetId);
	if (!packet) throw new Error(`Unknown packet: ${packetId}`);
	packet.meta.probe = probe;
	await savePacketMeta(db, packetId, packet.meta);
	const updated = await getCreationPacket(db, packetId);
	if (!updated) throw new Error("Packet was not stored.");
	return updated;
}

// ---------------------------------------------------------------------------
// Linking: the owner creates the race in the dashboard, pastes the Race ID,
// the machine verifies it with a read-only GET and stores the link in the
// existing `objects` / `relationships` tables.
// ---------------------------------------------------------------------------

export interface LinkRunSignupRaceInput {
	db: D1Database;
	accessToken: string;
	packetId: string;
	raceId: number;
	eventId?: number;
}

export async function linkRunSignupRace(
	input: LinkRunSignupRaceInput,
): Promise<{ ok: true; packet_id: string; race_id: number; race_name: string | null }> {
	const packet = await getCreationPacket(input.db, input.packetId);
	if (!packet) throw new Error(`Unknown packet: ${input.packetId}`);
	if (!Number.isInteger(input.raceId) || input.raceId <= 0) {
		throw new Error("A valid RunSignup race ID is required.");
	}

	// Read-only verification: the race must exist and be readable.
	const url = new URL(`https://api.runsignup.com/rest/race/${input.raceId}`);
	url.searchParams.set("format", "json");
	const data = await runSignupGetJson(url, { accessToken: input.accessToken });
	const race = data.race as Record<string, unknown> | undefined;
	const raceName = typeof race?.name === "string" ? race.name : null;

	const runsignupObjectId = `RUNSIGNUP-RACE-${input.raceId}`;
	await input.db
		.prepare(
			`INSERT INTO objects (object_id, object_type, title, source, source_type, source_id, status, metadata)
			 VALUES (?, ?, ?, 'runsignup', 'race', ?, 'active', ?)
			 ON CONFLICT(object_id) DO UPDATE SET
				title = excluded.title,
				metadata = excluded.metadata,
				updated_at = CURRENT_TIMESTAMP`,
		)
		.bind(
			runsignupObjectId,
			packet.meta.kind,
			raceName ?? packet.title,
			String(input.raceId),
			JSON.stringify({
				linked_from_packet: packet.packet_id,
				verified_via: "api-get-race",
				verified_at: new Date().toISOString(),
			}),
		)
		.run();

	await input.db
		.prepare(
			`INSERT INTO relationships (relationship_id, subject_object_id, relationship_type, target_object_id, metadata)
			 VALUES (?, ?, 'linked_to', ?, ?)
			 ON CONFLICT(relationship_id) DO NOTHING`,
		)
		.bind(
			`REL-${packet.packet_id}-LINKEDTO-${runsignupObjectId}`,
			packet.packet_id,
			runsignupObjectId,
			JSON.stringify({ linked_at: new Date().toISOString() }),
		)
		.run();

	packet.meta.runsignup_race_id = input.raceId;
	packet.meta.runsignup_race_name = raceName;
	if (typeof input.eventId === "number" && Number.isInteger(input.eventId) && input.eventId > 0) {
		packet.meta.runsignup_event_id = input.eventId;
	}
	// Refresh the plan so payload previews carry the linked IDs, then mark
	// the dashboard-creation step done (the owner just proved it exists).
	const refreshed = buildCreationSteps({
		kind: packet.meta.kind,
		title: packet.title,
		description: packet.meta.description ?? undefined,
		event_date: packet.meta.event_date ?? undefined,
		distance: packet.meta.distance ?? undefined,
		format: packet.meta.format ?? undefined,
		external_race_url: packet.meta.external_race_url ?? undefined,
		external_results_url: packet.meta.external_results_url ?? undefined,
		facebook_page_id: packet.meta.facebook_page_id ?? undefined,
		runsignup_event_id: packet.meta.runsignup_event_id ?? undefined,
		registration_periods: packet.meta.registration_periods,
		age_based_pricing: packet.meta.age_based_pricing,
		questions: packet.meta.questions,
		append_questions: packet.meta.append_questions,
		coupons: packet.meta.coupons,
		notes: packet.meta.notes ?? undefined,
	});
	const statusById = new Map(packet.meta.steps.map((s) => [s.step_id, s.status]));
	packet.meta.steps = refreshed.map((s) => {
		const prev = statusById.get(s.step_id);
		const status =
			s.step_id === "dashboard_create_object" ? "done" : (prev ?? s.status);
		return { ...s, status };
	});
	await savePacketMeta(input.db, packet.packet_id, packet.meta);

	return { ok: true, packet_id: packet.packet_id, race_id: input.raceId, race_name: raceName };
}

// ---------------------------------------------------------------------------
// API step execution. One step at a time, only after the owner's explicit
// "APPLY_STEP" confirmation. Default: nothing is written.
// ---------------------------------------------------------------------------

export const APPLY_STEP_CONFIRM = "APPLY_STEP";

interface ApiCallSpec {
	url: string;
	// Direct POST form fields (e.g. race-description's `description`).
	formFields?: Record<string, string>;
	// The `request` JSON body (the proven postRunSignupForm pattern).
	requestJson?: unknown;
}

async function postRunSignupWrite(
	url: string,
	accessToken: string,
	spec: { formFields?: Record<string, string>; requestJson?: unknown },
): Promise<Record<string, unknown>> {
	const form = new FormData();
	if (spec.requestJson !== undefined) {
		form.append("request", JSON.stringify(spec.requestJson));
	}
	for (const [key, value] of Object.entries(spec.formFields ?? {})) {
		form.append(key, value);
	}
	const response = await fetch(url, {
		method: "POST",
		headers: { Authorization: `Bearer ${accessToken}` },
		body: form,
	});
	const data = (await response.json()) as Record<string, unknown>;
	if (!response.ok) {
		const error = new Error(`RunSignup write request failed: ${response.status}`);
		(error as { status?: number }).status = response.status;
		throw error;
	}
	return data;
}

// Pure: builds the exact API call for an executable step. Returns null for
// steps that cannot be executed (manual steps, or API steps whose endpoint
// is not yet verified against the docs).
export function buildApiCall(
	packet: CreationPacket,
	stepId: string,
): ApiCallSpec | null {
	const raceId = packet.meta.runsignup_race_id;
	if (!raceId) return null;
	const base = `https://api.runsignup.com/rest/race/${raceId}`;
	const json = "?format=json&request_format=json";
	switch (stepId) {
		case "set_race_description": {
			if (!packet.meta.description) return null;
			return {
				url: `${base}/race-description${json}`,
				formFields: { description: packet.meta.description },
			};
		}
		case "set_race_urls": {
			const race: Record<string, string> = {};
			if (packet.meta.external_race_url) race.external_race_url = packet.meta.external_race_url;
			if (packet.meta.external_results_url) race.external_results_url = packet.meta.external_results_url;
			if (packet.meta.facebook_page_id) race.facebook_page_id = packet.meta.facebook_page_id;
			if (Object.keys(race).length === 0) return null;
			return { url: `${base}/race-urls${json}`, requestJson: { race } };
		}
		case "setup_registration_periods": {
			const eventId = packet.meta.runsignup_event_id;
			if (!eventId || packet.meta.registration_periods.length === 0) return null;
			return {
				url: `${base}/registration-periods${json}&event_id=${eventId}`,
				requestJson: { registration_periods: packet.meta.registration_periods },
			};
		}
		case "setup_age_based_pricing": {
			const eventId = packet.meta.runsignup_event_id;
			if (!eventId || packet.meta.age_based_pricing.length === 0) return null;
			return {
				url: `${base}/pricing/age-based${json}&event_id=${eventId}`,
				requestJson: { age_based_pricing: packet.meta.age_based_pricing },
			};
		}
		case "setup_race_questions": {
			if (packet.meta.questions.length === 0) return null;
			const url =
				`${base}/questions${json}` +
				(packet.meta.append_questions ? "&append_questions=T" : "");
			return { url, requestJson: { questions: packet.meta.questions } };
		}
		case "add_coupons": {
			if (packet.meta.coupons.length === 0) return null;
			return { url: `${base}/coupons${json}`, requestJson: { coupons: packet.meta.coupons } };
		}
		default:
			return null;
	}
}

export interface ApplyStepInput {
	db: D1Database;
	accessToken: string;
	packetId: string;
	stepId: string;
	confirm: string;
}

export interface ApplyStepResult {
	ok: boolean;
	packet_id: string;
	step_id: string;
	write_access: RunSignupWriteAccess;
	detail: string;
}

export async function applyCreationStep(input: ApplyStepInput): Promise<ApplyStepResult> {
	const packet = await getCreationPacket(input.db, input.packetId);
	if (!packet) throw new Error(`Unknown packet: ${input.packetId}`);
	if (input.confirm !== APPLY_STEP_CONFIRM) {
		throw new Error(`Explicit confirm "${APPLY_STEP_CONFIRM}" is required before any RunSignup write.`);
	}
	const step = packet.meta.steps.find((s) => s.step_id === input.stepId);
	if (!step) throw new Error(`Unknown step: ${input.stepId}`);
	if (step.kind !== "api") {
		throw new Error(`Step ${input.stepId} is manual; it cannot be applied via API.`);
	}
	if (step.status === "done") {
		throw new Error(`Step ${input.stepId} is already done.`);
	}
	if (packet.meta.write_access === "DENIED") {
		throw new Error("RunSignup write access is DENIED for these credentials; no write is attempted.");
	}
	if (packet.meta.probe?.ok !== true) {
		throw new Error("Run the read-only credential probe first; the workflow is not ready without it.");
	}
	if (!packet.meta.runsignup_race_id) {
		throw new Error("Link the dashboard-created RunSignup race before applying API steps.");
	}
	const missing = (step.requires ?? []).filter(
		(req) =>
			(req === "runsignup_race_id" && packet.meta.runsignup_race_id === null) ||
			(req === "runsignup_event_id" && packet.meta.runsignup_event_id === null),
	);
	if (missing.length > 0) {
		throw new Error(`Step ${input.stepId} needs ${missing.join(", ")} first.`);
	}
	const spec = buildApiCall(packet, input.stepId);
	if (!spec) {
		throw new Error(
			`Step ${input.stepId} has no verified API endpoint yet; it stays manual until the endpoint is verified against the docs.`,
		);
	}

	const fail = async (detail: string, writeAccess: RunSignupWriteAccess): Promise<ApplyStepResult> => {
		step.status = "error";
		step.error = detail;
		packet.meta.write_access = writeAccess;
		await savePacketMeta(input.db, packet.packet_id, packet.meta);
		return { ok: false, packet_id: packet.packet_id, step_id: step.step_id, write_access: writeAccess, detail };
	};

	try {
		if (spec.requestJson !== undefined && !spec.formFields) {
			// The proven postRunSignupForm path (request JSON in FormData).
			await postRunSignupForm(spec.url, input.accessToken, spec.requestJson);
		} else {
			await postRunSignupWrite(spec.url, input.accessToken, spec);
		}
	} catch (error) {
		const status = (error as { status?: number }).status;
		if (status === 401 || status === 403) {
			return fail(
				`The write was rejected with HTTP ${status}; RunSignup write access is denied for these credentials.`,
				"DENIED",
			);
		}
		return fail(`The write attempt failed: ${(error as Error).message}`, packet.meta.write_access);
	}

	step.status = "done";
	step.executed_at = new Date().toISOString();
	step.error = null;
	packet.meta.write_access = "CONFIRMED";
	await savePacketMeta(input.db, packet.packet_id, packet.meta);
	return {
		ok: true,
		packet_id: packet.packet_id,
		step_id: step.step_id,
		write_access: "CONFIRMED",
		detail: `Step "${step.title}" applied; RunSignup write access is confirmed.`,
	};
}

// Owner attestation for manual steps: the human did the dashboard work.
export async function completeManualStep(
	db: D1Database,
	packetId: string,
	stepId: string,
): Promise<{ ok: true; packet_id: string; step_id: string; status: CreationPacketStatus }> {
	const packet = await getCreationPacket(db, packetId);
	if (!packet) throw new Error(`Unknown packet: ${packetId}`);
	const step = packet.meta.steps.find((s) => s.step_id === stepId);
	if (!step) throw new Error(`Unknown step: ${stepId}`);
	if (step.kind !== "manual") {
		throw new Error(`Step ${stepId} is an API step; use the apply flow instead.`);
	}
	step.status = "done";
	step.error = null;
	await savePacketMeta(db, packetId, packet.meta);
	return { ok: true, packet_id: packetId, step_id: stepId, status: derivePacketStatus(packet.meta) };
}

// Owner-editable fields: description, URLs, periods, pricing, questions,
// coupons, and the event ID can be set/changed after the dashboard work
// without recreating the packet. Steps are rebuilt and keep their statuses.
export interface PacketApiFieldsInput {
	description?: string;
	event_date?: string;
	distance?: string;
	format?: string;
	external_race_url?: string;
	external_results_url?: string;
	facebook_page_id?: string;
	runsignup_event_id?: number;
	registration_periods?: RegistrationPeriodInput[];
	age_based_pricing?: AgeBasedPricingInput[];
	questions?: Array<Record<string, unknown>>;
	append_questions?: boolean;
	coupons?: Array<Record<string, unknown>>;
	notes?: string;
}

export async function setPacketApiFields(
	db: D1Database,
	packetId: string,
	fields: PacketApiFieldsInput,
): Promise<CreationPacket> {
	const packet = await getCreationPacket(db, packetId);
	if (!packet) throw new Error(`Unknown packet: ${packetId}`);
	const m = packet.meta;
	const clean = (v: string | undefined, fallback: string | null): string | null => {
		if (v === undefined) return fallback;
		const t = v.trim();
		return t ? t : null;
	};
	const input: CreationPacketInput = {
		kind: m.kind,
		title: packet.title,
		description: clean(fields.description, m.description) ?? undefined,
		event_date: clean(fields.event_date, m.event_date) ?? undefined,
		distance: clean(fields.distance, m.distance) ?? undefined,
		format: clean(fields.format, m.format) ?? undefined,
		external_race_url: clean(fields.external_race_url, m.external_race_url) ?? undefined,
		external_results_url: clean(fields.external_results_url, m.external_results_url) ?? undefined,
		facebook_page_id: clean(fields.facebook_page_id, m.facebook_page_id) ?? undefined,
		runsignup_event_id:
			fields.runsignup_event_id !== undefined ? fields.runsignup_event_id : (m.runsignup_event_id ?? undefined),
		registration_periods: fields.registration_periods ?? m.registration_periods,
		age_based_pricing: fields.age_based_pricing ?? m.age_based_pricing,
		questions: fields.questions ?? m.questions,
		append_questions: fields.append_questions ?? m.append_questions,
		coupons: fields.coupons ?? m.coupons,
		notes: clean(fields.notes, m.notes) ?? undefined,
	};
	if (
		input.runsignup_event_id !== undefined &&
		(!Number.isInteger(input.runsignup_event_id) || input.runsignup_event_id <= 0)
	) {
		throw new Error("A valid event ID is required.");
	}
	packet.meta = { ...metaFromInput(input), write_access: m.write_access, probe: m.probe, runsignup_race_id: m.runsignup_race_id, runsignup_race_name: m.runsignup_race_name };
	// Preserve statuses and execution state of steps that survived the rebuild.
	const prev = new Map(m.steps.map((s) => [s.step_id, s]));
	packet.meta.steps = packet.meta.steps.map((s) => {
		const old = prev.get(s.step_id);
		return old ? { ...s, status: old.status, executed_at: old.executed_at, error: old.error } : s;
	});
	await savePacketMeta(db, packetId, packet.meta);
	const updated = await getCreationPacket(db, packetId);
	if (!updated) throw new Error("Packet was not stored.");
	return updated;
}

// Owner-editable field: the Event ID (and, in the future, other packet
// fields) can be set after the dashboard work without recreating the packet.
export async function setPacketEventId(
	db: D1Database,
	packetId: string,
	eventId: number,
): Promise<{ ok: true; packet_id: string; runsignup_event_id: number }> {
	if (!Number.isInteger(eventId) || eventId <= 0) {
		throw new Error("A valid event ID is required.");
	}
	await setPacketApiFields(db, packetId, { runsignup_event_id: eventId });
	return { ok: true, packet_id: packetId, runsignup_event_id: eventId };
}
