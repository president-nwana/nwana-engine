// NWANA Charity Challenge Series API (2026-10-04).
// Routes: /api/challenge/v1/*
// Auth: request header X-Challenge-Key must equal env.CHALLENGE_API_KEY.
// All RunSignup calls use the director grant (env.RUNSIGNUP_ACCESS_TOKEN).
// Identity rule: a write is allowed only for a registration that belongs to
// the OAuth-verified rsu_user_id supplied by the caller. Never trust email.

import { runSignupGetJson } from "./runsignup-client";
import { syncRunSignupDonations } from "./lib/money-ingestion";

export const CHALLENGE_RACE_ID = 216323;

export interface ChallengeEventDef {
	event_id: number;
	event_name: string;
	discipline: "Nordic Walking" | "Race Walking" | "Running" | "Cycling" | "Walking" | "Open Challenge";
	format: "mileage" | "speed" | "relay" | "team" | "open";
	distance_label: string;
	fixed_distance_m: number | null;
}

// Production truth — mirrors RUNSIGNUP_FACTUAL_MAP.md (race 216323).
export const CHALLENGE_EVENTS: ChallengeEventDef[] = [
	// Nordic Walking (7)
	{ event_id: 1222833, event_name: "Nordic Walking — Weekly Mileage", discipline: "Nordic Walking", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222834, event_name: "Nordic Walking — 1K", discipline: "Nordic Walking", format: "speed", distance_label: "1K", fixed_distance_m: 1000 },
	{ event_id: 1222835, event_name: "Nordic Walking — 3K", discipline: "Nordic Walking", format: "speed", distance_label: "3K", fixed_distance_m: 3000 },
	{ event_id: 1222836, event_name: "Nordic Walking — 5K", discipline: "Nordic Walking", format: "speed", distance_label: "5K", fixed_distance_m: 5000 },
	{ event_id: 1222837, event_name: "Nordic Walking — 10K", discipline: "Nordic Walking", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	{ event_id: 1222838, event_name: "Nordic Walking — 4×1K Relay", discipline: "Nordic Walking", format: "relay", distance_label: "4×1K Relay", fixed_distance_m: 1000 },
	{ event_id: 1222839, event_name: "Nordic Walking — 4×5K Relay", discipline: "Nordic Walking", format: "relay", distance_label: "4×5K Relay", fixed_distance_m: 5000 },
	// Race Walking (6)
	{ event_id: 1222840, event_name: "Race Walking — Weekly Mileage", discipline: "Race Walking", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222841, event_name: "Race Walking — 3K", discipline: "Race Walking", format: "speed", distance_label: "3K", fixed_distance_m: 3000 },
	{ event_id: 1222842, event_name: "Race Walking — 5K", discipline: "Race Walking", format: "speed", distance_label: "5K", fixed_distance_m: 5000 },
	{ event_id: 1222843, event_name: "Race Walking — 10K", discipline: "Race Walking", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	{ event_id: 1222844, event_name: "Race Walking — 20K", discipline: "Race Walking", format: "speed", distance_label: "20K", fixed_distance_m: 20000 },
	{ event_id: 1222845, event_name: "Race Walking — 4×5K Relay", discipline: "Race Walking", format: "relay", distance_label: "4×5K Relay", fixed_distance_m: 5000 },
	// Running (7)
	{ event_id: 1222846, event_name: "Running — Weekly Mileage", discipline: "Running", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222847, event_name: "Running — 1 Mile", discipline: "Running", format: "speed", distance_label: "1 Mile", fixed_distance_m: 1609 },
	{ event_id: 1222848, event_name: "Running — 5K", discipline: "Running", format: "speed", distance_label: "5K", fixed_distance_m: 5000 },
	{ event_id: 1222849, event_name: "Running — 10K", discipline: "Running", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	{ event_id: 1222850, event_name: "Running — Half Marathon", discipline: "Running", format: "speed", distance_label: "Half Marathon", fixed_distance_m: 21097 },
	{ event_id: 1222851, event_name: "Running — 4×1M Relay", discipline: "Running", format: "relay", distance_label: "4×1M Relay", fixed_distance_m: 1609 },
	{ event_id: 1222852, event_name: "Running — 4×5K Relay", discipline: "Running", format: "relay", distance_label: "4×5K Relay", fixed_distance_m: 5000 },
	// Cycling (6)
	{ event_id: 1222853, event_name: "Cycling — Weekly Mileage", discipline: "Cycling", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222854, event_name: "Cycling — 10K", discipline: "Cycling", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	{ event_id: 1222855, event_name: "Cycling — 20K", discipline: "Cycling", format: "speed", distance_label: "20K", fixed_distance_m: 20000 },
	{ event_id: 1222856, event_name: "Cycling — 40K", discipline: "Cycling", format: "speed", distance_label: "40K", fixed_distance_m: 40000 },
	{ event_id: 1222857, event_name: "Cycling — 100K", discipline: "Cycling", format: "speed", distance_label: "100K", fixed_distance_m: 100000 },
	{ event_id: 1222858, event_name: "Cycling — Team 100K", discipline: "Cycling", format: "team", distance_label: "Team 100K", fixed_distance_m: null },
	// Walking (4)
	{ event_id: 1222897, event_name: "Walking — Weekly Mileage", discipline: "Walking", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222898, event_name: "Walking — 1 Mile", discipline: "Walking", format: "speed", distance_label: "1 Mile", fixed_distance_m: 1609 },
	{ event_id: 1222899, event_name: "Walking — 5K", discipline: "Walking", format: "speed", distance_label: "5K", fixed_distance_m: 5000 },
	{ event_id: 1222900, event_name: "Walking — 10K", discipline: "Walking", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	// Open Challenge (1) — participation + fundraising, not a competitive discipline.
	// Activity type is selected at logging time and stored in D1 for personal history.
	{ event_id: 1222924, event_name: "Open Challenge — Move for NWANA", discipline: "Open Challenge", format: "open", distance_label: "Any Activity", fixed_distance_m: null },
];

export const CHALLENGE_EVENT_IDS = CHALLENGE_EVENTS.map((e) => e.event_id);
const EVENT_BY_ID = new Map(CHALLENGE_EVENTS.map((e) => [e.event_id, e]));

// Super Event bundles → their sub-event IDs (production truth, race 216323).
export const BUNDLE_TO_EVENTS: Record<number, number[]> = {
	1222859: [1222833, 1222834, 1222835, 1222836, 1222837, 1222838, 1222839], // NW All Events
	1222860: [1222840, 1222841, 1222842, 1222843, 1222844, 1222845], // RW All Events
	1222861: [1222846, 1222847, 1222848, 1222849, 1222850, 1222851, 1222852], // Running All Events
	1222862: [1222853, 1222854, 1222855, 1222856, 1222857, 1222858], // Cycling All Events
	1222905: [1222897, 1222898, 1222899, 1222900], // Walking All Events
};
export const BUNDLE_EVENT_IDS = Object.keys(BUNDLE_TO_EVENTS).map(Number);
const ALL_QUERY_EVENT_IDS = [...CHALLENGE_EVENT_IDS, ...BUNDLE_EVENT_IDS];

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json;charset=utf-8" },
	});
}

type UnknownRecord = Record<string, unknown>;
function asRecord(v: unknown): UnknownRecord | null {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as UnknownRecord) : null;
}
function int(v: unknown): number | null {
	const n = typeof v === "number" ? v : Number(v);
	return Number.isInteger(n) ? n : null;
}

interface Env {
	RUNSIGNUP_ACCESS_TOKEN?: string;
	CHALLENGE_API_KEY?: string;
	nwana_engine_db: D1Database;
}

/** Fetch participants for the challenge race (26 events + 4 bundles in one call).
 * NOTE: the API returns an ARRAY of per-event objects: [{event, participants[]}, ...]
 * — one entry per queried event_id, NOT {participants: [...]} at the top level. */
async function fetchParticipants(env: Env): Promise<{ ok: boolean; participants?: UnknownRecord[]; error?: string }> {
	const token = env.RUNSIGNUP_ACCESS_TOKEN;
	if (!token) return { ok: false, error: "RunSignup director grant not configured" };
	const url = new URL(`https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}/participants`);
	url.searchParams.set("event_id", ALL_QUERY_EVENT_IDS.join(","));
	url.searchParams.set("results_per_page", "500");
	url.searchParams.set("format", "json");
	const res = await runSignupGetJson<unknown>(url, token);
	if (!res.ok) return { ok: false, error: res.api_error_msg || `RunSignup error (${res.http_status})` };
	const out: UnknownRecord[] = [];
	const entries = Array.isArray(res.data) ? res.data : [];
	for (const entry of entries) {
		const rec = asRecord(entry);
		if (!rec) continue;
		const plist = rec.participants;
		if (Array.isArray(plist)) {
			for (const p of plist) {
				const pr = asRecord(p);
				if (pr) out.push(pr);
			}
		}
	}
	return { ok: true, participants: out };
}

function participantUserId(p: UnknownRecord): number | null {
	const user = asRecord(p.user);
	return int(user?.user_id) ?? int(p.user_id);
}

function participantName(p: UnknownRecord): string | null {
	const user = asRecord(p.user);
	const first = String(user?.first_name || p.first_name || "").trim();
	const last = String(user?.last_name || p.last_name || "").trim();
	const full = `${first} ${last}`.trim();
	return full || null;
}

function participantTeam(p: UnknownRecord): { team_id: number | null; team_name: string | null } {
	// RunSignup participant team linkage: team_id, team_name, team_type.
	const teamId = int(p.team_id);
	const teamName = typeof p.team_name === "string" ? p.team_name.trim().slice(0, 100) : null;
	return { team_id: teamId, team_name: teamName || null };
}

/**
 * GET /api/challenge/v1/my-events?rsu_user_id=123
 * Returns the events the verified user is registered for in race 216323.
 */
async function handleMyEvents(url: URL, env: Env): Promise<Response> {
	const rsuUserId = int(url.searchParams.get("rsu_user_id"));
	if (!rsuUserId) return json({ ok: false, error: "rsu_user_id required" }, 400);
	const fetched = await fetchParticipants(env);
	if (!fetched.ok) return json({ ok: false, error: fetched.error }, 502);
	const mine = (fetched.participants || []).filter((p) => participantUserId(p) === rsuUserId);
	const seen = new Map<number, number>(); // event_id -> registration_id
	for (const p of mine) {
		const eid = int(p.event_id);
		const rid = int(p.registration_id);
		if (!eid || !rid) continue;
		if (EVENT_BY_ID.has(eid)) {
			// Direct registration for an individual event.
			if (!seen.has(eid)) seen.set(eid, rid);
		} else if (BUNDLE_TO_EVENTS[eid]) {
			// Bundle registration: expands to all sub-events of the discipline.
			// The bundle's registration_id is used for activity writes until
			// RunSignup proves sub-event registrations exist separately.
			for (const subId of BUNDLE_TO_EVENTS[eid]) {
				if (!seen.has(subId)) seen.set(subId, rid);
			}
		}
	}
	const events = [...seen.entries()].map(([event_id, registration_id]) => {
		const def = EVENT_BY_ID.get(event_id)!;
		return {
			event_id,
			event_name: def.event_name,
			discipline: def.discipline,
			format: def.format,
			distance_label: def.distance_label,
			fixed_distance_m: def.fixed_distance_m,
			registration_id,
		};
	});
	events.sort((a, b) => a.event_id - b.event_id);
	return json({ ok: true, rsu_user_id: rsuUserId, events });
}

interface ActivityInput {
	rsu_user_id?: unknown;
	event_id?: unknown;
	date?: unknown; // YYYY-MM-DD
	distance_m?: unknown; // meters, null when not given
	time_s?: unknown; // seconds, null when not given
	activity_type?: unknown; // Open Challenge only: Hiking, Swimming, etc.
}

/**
 * POST /api/challenge/v1/activities
 * Body: { rsu_user_id, event_id, date, distance_m|null, time_s|null }
 * Verifies the user owns a registration for the event, then POSTs the
 * activity to RunSignup and reads it back.
 */
async function handlePostActivity(request: Request, env: Env): Promise<Response> {
	let input: ActivityInput;
	try {
		input = (await request.json()) as ActivityInput;
	} catch {
		return json({ ok: false, error: "invalid JSON" }, 400);
	}
	const rsuUserId = int(input.rsu_user_id);
	const eventId = int(input.event_id);
	const date = typeof input.date === "string" ? input.date : "";
	const distanceM = input.distance_m == null ? null : int(input.distance_m);
	const timeS = input.time_s == null ? null : int(input.time_s);
	const activityType = typeof input.activity_type === "string" ? input.activity_type.slice(0, 50) : null;
	const def = eventId ? EVENT_BY_ID.get(eventId) : undefined;

	if (!rsuUserId || !def || !eventId) return json({ ok: false, error: "unknown event or user" }, 400);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: "date must be YYYY-MM-DD" }, 400);
	if (distanceM !== null && !(distanceM > 0 && distanceM <= 100000000)) {
		return json({ ok: false, error: "invalid distance_m" }, 400);
	}
	if (timeS !== null && !(timeS > 0 && timeS <= 86400 * 2)) {
		return json({ ok: false, error: "invalid time_s" }, 400);
	}
	// Speed/relay events require a time; mileage/team/open require a distance.
	const needsTime = def.format === "speed" || def.format === "relay";
	const needsDistance = def.format === "mileage" || def.format === "team" || def.format === "open";
	if (needsTime && timeS === null) return json({ ok: false, error: "time is required for this event" }, 400);
	if (needsDistance && distanceM === null) return json({ ok: false, error: "distance is required for this event" }, 400);
	// Open Challenge requires an activity type for personal history.
	if (def.format === "open" && !activityType) {
		return json({ ok: false, error: "activity type is required for Open Challenge" }, 400);
	}

	// Verify ownership: the user must have a registration for this event,
	// either directly or via a discipline bundle covering it.
	const fetched = await fetchParticipants(env);
	if (!fetched.ok) return json({ ok: false, error: fetched.error }, 502);
	const mine = (fetched.participants || []).filter((p) => participantUserId(p) === rsuUserId);
	let registrationId: number | null = null;
	let submitEventId = eventId; // Event ID to submit the activity under.
	let viaBundle: number | null = null;
	const direct = mine.find((p) => int(p.event_id) === eventId);
	if (direct) {
		registrationId = int(direct.registration_id);
	} else {
		// Check bundle coverage. CONFIRMED 2026-10-04: RunSignup API rejects writing
		// directly to sub-event event_id with a bundle registration
		// ("Registration is not in any configured virtual event"). Activities
		// must be written under the BUNDLE event_id; the Engine stores the
		// activity→sub-event mapping in D1 for aggregation.
		for (const p of mine) {
			const eid = int(p.event_id);
			if (eid && BUNDLE_TO_EVENTS[eid] && BUNDLE_TO_EVENTS[eid].includes(eventId)) {
				registrationId = int(p.registration_id);
				viaBundle = eid;
				submitEventId = eid; // Submit under the bundle event.
				break;
			}
		}
	}
	if (!registrationId) {
		return json({ ok: false, error: "not_registered", detail: "This RunSignup user has no registration for the event." }, 403);
	}

	// Build the vr-activities request. Distance unit: event distances are
	// configured in kilometers; result_split_tally_value carries the value.
	const token = env.RUNSIGNUP_ACCESS_TOKEN!;
	const subEventDef = EVENT_BY_ID.get(eventId);
	const subEventLabel = viaBundle && subEventDef ? ` [${subEventDef.event_name}]` : "";
	const activity: UnknownRecord = {
		tally_split_date: date,
		tally_split_comment: `Submitted via NWANA Charity Challenge Series${subEventLabel}`,
	};
	if (distanceM !== null) {
		// Fixed-distance events: submit the event distance; mileage: the logged distance.
		const valueM = def.fixed_distance_m ?? distanceM;
		activity.result_split_tally_value = Math.round((valueM / 1000) * 100) / 100; // km, 2dp
	}
	if (timeS !== null) {
		activity.submitted_time_in_ms = timeS * 1000;
	}
	const postUrl = new URL("https://api.runsignup.com/rest/v2/vr-activities.json");
	postUrl.searchParams.set("race_id", String(CHALLENGE_RACE_ID));
	postUrl.searchParams.set("event_id", String(submitEventId));
	postUrl.searchParams.set("registration_id", String(registrationId));
	const form = new URLSearchParams();
	form.set("request", JSON.stringify({ activities: [activity] }));
	let postRes: Response;
	try {
		postRes = await fetch(postUrl.toString(), {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form.toString(),
		});
	} catch (e) {
		return json({ ok: false, error: "runsignup_unreachable" }, 502);
	}
	let postData: { tally_split_nums?: number[]; error?: { error_msg?: string } };
	try {
		postData = (await postRes.json()) as typeof postData;
	} catch {
		return json({ ok: false, error: "invalid RunSignup response" }, 502);
	}
	if (!postRes.ok || postData.error || !Array.isArray(postData.tally_split_nums) || postData.tally_split_nums.length === 0) {
		const pd = postData as Record<string, unknown>;
		let detail = `HTTP ${postRes.status}`;
		try {
			const det = pd.details as Array<{ code?: string; message?: string }>;
			if (Array.isArray(det) && det.length > 0 && det[0].code) {
				detail = `${det[0].code}: ${det[0].message || ""}`.trim();
			} else if (postData.error?.error_msg) {
				detail = postData.error.error_msg;
			}
		} catch { /* keep default */ }
		return json({ ok: false, error: "runsignup_rejected", detail }, 502);
	}
	const tallySplitNum = postData.tally_split_nums[0];

	// Read back to confirm the write landed.
	const getUrl = new URL("https://api.runsignup.com/rest/v2/vr-activities.json");
	getUrl.searchParams.set("race_id", String(CHALLENGE_RACE_ID));
	getUrl.searchParams.set("event_id", String(submitEventId));
	getUrl.searchParams.set("registration_id", String(registrationId));
	getUrl.searchParams.set("num", "100");
	getUrl.searchParams.set("format", "json");
	const readBack = await runSignupGetJson<{ activities?: unknown[] }>(getUrl, token);
	let confirmed: UnknownRecord | null = null;
	if (readBack.ok && Array.isArray(readBack.data?.activities)) {
		const found = (readBack.data!.activities as unknown[]).map(asRecord).find((a) => a && int(a.tally_split_num) === tallySplitNum);
		if (found) confirmed = found;
	}

	// Store the activity→sub-event mapping in D1 for weekly aggregation.
	// Only needed because RunSignup requires bundle-event submission.
	// Capture the participant name for leaderboard display.
	const participantForName = mine.find((p) => participantUserId(p) === rsuUserId);
	const userName = participantForName ? participantName(participantForName) : null;
	const team = participantForName ? participantTeam(participantForName) : { team_id: null, team_name: null };
	try {
		await env.nwana_engine_db.prepare(
			`INSERT OR IGNORE INTO challenge_activities
			(tally_split_num, race_id, submit_event_id, sub_event_id, registration_id, rsu_user_id, user_name, team_id, team_name, activity_date, distance_m, time_s, activity_type)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(
			tallySplitNum, CHALLENGE_RACE_ID, submitEventId, eventId,
			registrationId, rsuUserId, userName, team.team_id, team.team_name,
			date, distanceM, timeS, activityType
		).run();
	} catch (e) {
		// Mapping failure should not fail the submission; log and continue.
		console.error("challenge_activities insert failed:", e);
	}

	return json({
		ok: true,
		event_id: eventId,
		registration_id: registrationId,
		tally_split_num: tallySplitNum,
		confirmed: confirmed !== null,
		activity: confirmed,
	});
}

/** Series stats: total registration count for the homepage. */
async function handleSeriesStats(env: Env): Promise<Response> {
	const fetched = await fetchParticipants(env);
	if (!fetched.ok) return json({ ok: false, error: fetched.error }, 502);
	const parts = fetched.participants || [];
	const regIds = new Set<number>();
	for (const p of parts) {
		const rid = int((p as UnknownRecord).registration_id);
		if (rid) regIds.add(rid);
	}
	return json({ ok: true, total_registrations: regIds.size });
}

/** Main entry: auth check + routing. Called early from the worker fetch handler. */
export async function handleChallengeApi(request: Request, env: Env, url: URL): Promise<Response> {
	const presented = request.headers.get("X-Challenge-Key") || "";
	if (!env.CHALLENGE_API_KEY || presented !== env.CHALLENGE_API_KEY) {
		return json({ ok: false, error: "unauthorized" }, 401);
	}
	const path = url.pathname;
	if (path === "/api/challenge/v1/series-stats" && request.method === "GET") {
		return handleSeriesStats(env);
	}
	if (path === "/api/challenge/v1/my-events" && request.method === "GET") {
		return handleMyEvents(url, env);
	}
	if (path === "/api/challenge/v1/activities" && request.method === "POST") {
		return handlePostActivity(request, env);
	}
	if (path === "/api/challenge/v1/leaderboard" && request.method === "GET") {
		return handleLeaderboard(url, env);
	}
	if (path === "/api/challenge/v1/sync-donations" && request.method === "POST") {
		return handleSyncDonations(env);
	}
	if (path === "/api/challenge/v1/fundraising-leaderboard" && request.method === "GET") {
		return handleFundraisingLeaderboard(url, env);
	}
	return json({ ok: false, error: "unknown challenge endpoint" }, 404);
}

/**
 * POST /api/challenge/v1/sync-donations
 * Owner-triggered sync of race 216323 donations into canonical money_events.
 * Uses the existing money pipeline; 216323 is NOT in RACE_TO_FUND_ID so no
 * 212466 fund attribution is applied. No polling — explicit trigger only.
 */
async function handleSyncDonations(env: Env): Promise<Response> {
	if (!env.RUNSIGNUP_ACCESS_TOKEN) {
		return json({ ok: false, error: "missing RunSignup token" }, 500);
	}
	try {
		const result = await syncRunSignupDonations(
			env.nwana_engine_db,
			env.RUNSIGNUP_ACCESS_TOKEN,
			{ raceId: CHALLENGE_RACE_ID }
		);
		return json({ race_id: CHALLENGE_RACE_ID, ...result });
	} catch (e) {
		return json({ ok: false, error: "sync failed", detail: String(e).slice(0, 200) }, 500);
	}
}

interface DonationRow {
	source_transaction_id: string;
	occurred_at: string | null;
	gross_cents: number | null;
	source_ref: string;
}

/**
 * GET /api/challenge/v1/fundraising-leaderboard?week=YYYY-MM-DD
 * Weekly fundraising leaderboard from canonical money_events.
 * Race 216323 only. Week = Monday–Sunday.
 * Groups by fundraiser (source_ref). No fake data — empty until real donations sync.
 * Open Challenge participates (discipline does not affect donation ranking).
 */
async function handleFundraisingLeaderboard(url: URL, env: Env): Promise<Response> {
	const weekParam = url.searchParams.get("week");
	let weekStart: string;
	if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
		weekStart = mondayOfWeek(weekParam);
	} else {
		weekStart = mondayOfWeek(new Date().toISOString().slice(0, 10));
	}
	const weekEnd = addDays(weekStart, 6);

	// Query canonical money_events for race 216323 donations in the week.
	// source_ref format: "race:216323/donation:XXXX"
	let rows: DonationRow[] = [];
	try {
		const result = await env.nwana_engine_db.prepare(
			`SELECT source_transaction_id, occurred_at, gross_cents, source_ref
			FROM money_events
			WHERE source_ref LIKE 'race:216323/%'
			  AND event_type IN ('donation_received', 'fundraiser_donation_received')
			  AND gross_cents IS NOT NULL AND gross_cents > 0
			  AND date(occurred_at) >= ? AND date(occurred_at) <= ?
			ORDER BY occurred_at`
		).bind(weekStart, weekEnd).all<DonationRow>();
		rows = result.results || [];
	} catch (e) {
		return json({ ok: false, error: "d1 query failed" }, 500);
	}

	// Group by fundraiser. source_ref may contain fundraiser info;
	// for v1, group by the donation's source identity.
	// TODO: resolve fundraiser_id → display name via fundraiser mapping.
	const byFundraiser = new Map<string, { total_cents: number; count: number }>();
	for (const r of rows) {
		const key = r.source_transaction_id;
		const cur = byFundraiser.get(key) || { total_cents: 0, count: 0 };
		cur.total_cents += r.gross_cents!;
		cur.count += 1;
		byFundraiser.set(key, cur);
	}

	const ranked = [...byFundraiser.entries()]
		.map(([fundraiser_key, v]) => ({
			fundraiser_key,
			total_usd: Math.round((v.total_cents / 100) * 100) / 100,
			donations: v.count,
		}))
		.sort((a, b) => b.total_usd - a.total_usd)
		.map((r, i) => ({ rank: i + 1, ...r }));

	return json({
		ok: true,
		week_start: weekStart,
		week_end: weekEnd,
		race_id: CHALLENGE_RACE_ID,
		leaderboard: ranked,
		note: ranked.length === 0 ? "No donations for race 216323 in this week yet. Sync donations to update." : undefined,
	});
}

/**
 * Monday of the week containing dateStr (YYYY-MM-DD).
 * Week = Monday–Sunday. Uses UTC date arithmetic on the date-only value.
 */
function mondayOfWeek(dateStr: string): string {
	const [y, m, d] = dateStr.split("-").map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	const day = date.getUTCDay(); // 0=Sunday
	const diff = day === 0 ? -6 : 1 - day;
	date.setUTCDate(date.getUTCDate() + diff);
	return date.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
	const [y, m, d] = dateStr.split("-").map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function formatTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	return `${m}:${String(s).padStart(2, "0")}`;
}

interface ActivityRow {
	rsu_user_id: number;
	user_name: string | null;
	sub_event_id: number;
	activity_date: string;
	distance_m: number | null;
	time_s: number | null;
	activity_type: string | null;
	team_id: number | null;
	team_name: string | null;
}

/**
 * GET /api/challenge/v1/leaderboard?week=YYYY-MM-DD&discipline=X&event_id=Y&type=mileage|speed
 * Weekly leaderboards from canonical D1. Week = Monday–Sunday.
 * - mileage: SUM(distance) per participant per week (per discipline's mileage event)
 * - speed: MIN(time) per participant per event per week
 * Open Challenge is excluded (participation + fundraising only, no sport ranking).
 */
async function handleLeaderboard(url: URL, env: Env): Promise<Response> {
	const weekParam = url.searchParams.get("week");
	const disciplineFilter = url.searchParams.get("discipline");
	const eventIdFilter = url.searchParams.get("event_id");
	const typeFilter = url.searchParams.get("type"); // mileage | speed | null (both)

	// Determine week range.
	let weekStart: string;
	if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
		weekStart = mondayOfWeek(weekParam);
	} else {
		// Current week.
		const now = new Date();
		const today = now.toISOString().slice(0, 10);
		weekStart = mondayOfWeek(today);
	}
	const weekEnd = addDays(weekStart, 6);

	// Fetch week's activities from D1.
	let rows: ActivityRow[] = [];
	try {
		const result = await env.nwana_engine_db.prepare(
			`SELECT rsu_user_id, user_name, sub_event_id, activity_date, distance_m, time_s, activity_type, team_id, team_name
			FROM challenge_activities
			WHERE activity_date >= ? AND activity_date <= ?
			ORDER BY activity_date`
		).bind(weekStart, weekEnd).all<ActivityRow>();
		rows = result.results || [];
	} catch (e) {
		return json({ ok: false, error: "d1 query failed" }, 500);
	}

	// Build lookup: event_id → def.
	const mileageBoards: Record<string, Array<{ rank: number; rsu_user_id: number; name: string | null; total_km: number; activities: number }>> = {};
	const speedBoards: Record<string, Array<{ rank: number; rsu_user_id: number; name: string | null; best_time_s: number; best_time: string }>> = {};

	// Group mileage: by discipline (each discipline has one mileage event).
	const mileageEvents = CHALLENGE_EVENTS.filter((e) => e.format === "mileage");
	for (const mev of mileageEvents) {
		if (disciplineFilter && mev.discipline !== disciplineFilter) continue;
		if (eventIdFilter && String(mev.event_id) !== eventIdFilter) continue;
		if (typeFilter && typeFilter !== "mileage") continue;
		const relevant = rows.filter((r) => r.sub_event_id === mev.event_id && r.distance_m);
		const byUser = new Map<number, { name: string | null; total_m: number; count: number }>();
		for (const r of relevant) {
			const cur = byUser.get(r.rsu_user_id) || { name: r.user_name, total_m: 0, count: 0 };
			cur.total_m += r.distance_m!;
			cur.count += 1;
			if (!cur.name && r.user_name) cur.name = r.user_name;
			byUser.set(r.rsu_user_id, cur);
		}
		const ranked = [...byUser.entries()]
			.map(([rsu_user_id, v]) => ({
				rsu_user_id,
				name: v.name,
				total_km: Math.round((v.total_m / 1000) * 100) / 100,
				activities: v.count,
			}))
			.sort((a, b) => b.total_km - a.total_km)
			.map((r, i) => ({ rank: i + 1, ...r }));
		mileageBoards[mev.discipline] = ranked;
	}

	// Group speed: by event (MIN time per participant per event).
	const speedEvents = CHALLENGE_EVENTS.filter((e) => e.format === "speed");
	for (const sev of speedEvents) {
		if (disciplineFilter && sev.discipline !== disciplineFilter) continue;
		if (eventIdFilter && String(sev.event_id) !== eventIdFilter) continue;
		if (typeFilter && typeFilter !== "speed") continue;
		const relevant = rows.filter((r) => r.sub_event_id === sev.event_id && r.time_s);
		const byUser = new Map<number, { name: string | null; best_s: number }>();
		for (const r of relevant) {
			const cur = byUser.get(r.rsu_user_id);
			if (!cur || r.time_s! < cur.best_s) {
				byUser.set(r.rsu_user_id, { name: r.user_name || cur?.name || null, best_s: r.time_s! });
			}
		}
		const ranked = [...byUser.entries()]
			.map(([rsu_user_id, v]) => ({
				rsu_user_id,
				name: v.name,
				best_time_s: v.best_s,
				best_time: formatTime(v.best_s),
			}))
			.sort((a, b) => a.best_time_s - b.best_time_s)
			.map((r, i) => ({ rank: i + 1, ...r }));
		speedBoards[String(sev.event_id)] = ranked;
	}

	// Team/relay boards — UNVERIFIED until a real 4-person team exists in production.
	// Relay: each member's best weekly time, sum of 4. <4 valid members = NOT RANKED.
	// Cycling Team 100K: cumulative team distance, rank by earliest 100K date.
	const teamBoards: Record<string, unknown> = {};
	const relayEvents = CHALLENGE_EVENTS.filter((e) => e.format === "relay");
	for (const rev of relayEvents) {
		if (disciplineFilter && rev.discipline !== disciplineFilter) continue;
		if (eventIdFilter && String(rev.event_id) !== eventIdFilter) continue;
		if (typeFilter && typeFilter !== "speed") continue;
		const relevant = rows.filter((r) => r.sub_event_id === rev.event_id && r.time_s && r.team_id);
		const byTeam = new Map<number, { name: string | null; members: Map<number, { name: string | null; best_s: number }> }>();
		for (const r of relevant) {
			let team = byTeam.get(r.team_id!);
			if (!team) {
				team = { name: r.team_name, members: new Map() };
				byTeam.set(r.team_id!, team);
			}
			const cur = team.members.get(r.rsu_user_id);
			if (!cur || r.time_s! < cur.best_s) {
				team.members.set(r.rsu_user_id, { name: r.user_name, best_s: r.time_s! });
			}
		}
		const ranked: Array<{ team_id: number; team_name: string | null; status: string; total_s?: number; total_time?: string; members?: number }> = [];
		const notRanked: Array<{ team_id: number; team_name: string | null; status: string; members: number }> = [];
		for (const [teamId, t] of byTeam) {
			if (t.members.size >= 4) {
				const total = [...t.members.values()].reduce((sum, m) => sum + m.best_s, 0);
				ranked.push({ team_id: teamId, team_name: t.name, status: "RANKED", total_s: total, total_time: formatTime(total), members: t.members.size });
			} else {
				notRanked.push({ team_id: teamId, team_name: t.name, status: "NOT RANKED", members: t.members.size });
			}
		}
		ranked.sort((a, b) => (a.total_s || 0) - (b.total_s || 0));
		teamBoards[String(rev.event_id)] = {
			unverified: true,
			ranked: ranked.map((r, i) => ({ rank: i + 1, ...r })),
			not_ranked: notRanked,
		};
	}

	// Cycling Team 100K (event 1222858): collective 100K.
	// Rank by earliest date the cumulative team distance reaches 100K.
	// Process dates chronologically, cumulative SUM across dates.
	// Teams that never reach 100K are not ranked. Same-date tie → highest total.
	const team100k = CHALLENGE_EVENTS.find((e) => e.event_id === 1222858);
	if (team100k && (!disciplineFilter || team100k.discipline === disciplineFilter) && (!eventIdFilter || eventIdFilter === "1222858")) {
		const relevant = rows.filter((r) => r.sub_event_id === 1222858 && r.distance_m && r.team_id);
		const byTeam = new Map<number, { name: string | null; byDate: Map<string, number> }>();
		for (const r of relevant) {
			let team = byTeam.get(r.team_id!);
			if (!team) {
				team = { name: r.team_name, byDate: new Map() };
				byTeam.set(r.team_id!, team);
			}
			team.byDate.set(r.activity_date, (team.byDate.get(r.activity_date) || 0) + r.distance_m!);
			if (r.team_name && !team.name) team.name = r.team_name;
		}
		const ranked = [...byTeam.entries()]
			.map(([teamId, t]) => {
				const sortedDates = [...t.byDate.keys()].sort();
				let cum = 0;
				let reachDate: string | null = null;
				for (const d of sortedDates) {
					cum += t.byDate.get(d)!;
					if (cum >= 100000) { reachDate = d; break; }
				}
				const total_m = [...t.byDate.values()].reduce((s, v) => s + v, 0);
				return {
					team_id: teamId,
					team_name: t.name,
					total_km: Math.round((total_m / 1000) * 100) / 100,
					reached_100k: reachDate !== null,
					reach_date: reachDate,
				};
			})
			.filter((t) => t.reached_100k)
			.sort((a, b) => {
				if (a.reach_date! !== b.reach_date!) {
					return a.reach_date! < b.reach_date! ? -1 : 1;
				}
				return b.total_km - a.total_km;
			})
			.map((r, i) => ({ rank: i + 1, ...r }));
		teamBoards["1222858"] = { unverified: true, ranked };
	}

	return json({
		ok: true,
		week_start: weekStart,
		week_end: weekEnd,
		mileage: mileageBoards,
		speed: speedBoards,
		teams: teamBoards,
	});
}
