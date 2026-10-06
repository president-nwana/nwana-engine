// NWANA Charity Challenge Series API (2026-10-04).
// Routes: /api/challenge/v1/*
// Auth: request header X-Challenge-Key must equal env.CHALLENGE_API_KEY.
// All RunSignup calls use the director grant (env.RUNSIGNUP_ACCESS_TOKEN).
// Identity rule: a write is allowed only for a registration that belongs to
// the OAuth-verified rsu_user_id supplied by the caller. Never trust email.

import { runSignupGetJson } from "./runsignup-client";
import { resolveRunSignupAccessToken } from "./runsignup-oauth";
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
	RUNSIGNUP_OAUTH_CLIENT_ID?: string;
	RUNSIGNUP_OAUTH_CLIENT_SECRET?: string;
	CHALLENGE_API_KEY?: string;
	nwana_engine_db: D1Database;
}

/** Fetch participants for the challenge race (26 events + 4 bundles in one call).
 * NOTE: the API returns an ARRAY of per-event objects: [{event, participants[]}, ...]
 * — one entry per queried event_id, NOT {participants: [...]} at the top level. */
async function fetchParticipants(env: Env): Promise<{ ok: boolean; participants?: UnknownRecord[]; error?: string }> {
	// Use OAuth token lifecycle (not static RUNSIGNUP_ACCESS_TOKEN which expires).
	// The OAuth was restored 2026-10-05 and is CONNECTED.
	let token: string;
	try {
		token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : "OAuth token unavailable" };
	}
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
	const fingerprint = typeof input.fingerprint === "string" ? input.fingerprint.slice(0, 200) : null;
	// Source: "manual" or "file:tcx" / "file:fit" / "file:gpx" / "file"
	let source = "manual";
	if (input.source === "file" || (typeof input.source === "string" && input.source.startsWith("file"))) {
		source = typeof input.source === "string" ? input.source.slice(0, 20) : "file";
	}
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

	// Deduplication: same source file must never create a second activity.
	// Check BEFORE any RunSignup write.
	if (fingerprint) {
		try {
			const existing = await env.nwana_engine_db.prepare(
				"SELECT tally_split_num, event_id FROM challenge_activity_fingerprints WHERE rsu_user_id = ? AND fingerprint = ?"
			).bind(rsuUserId, fingerprint).first<{ tally_split_num: number | null; event_id: number }>();
			if (existing) {
				return json({
					ok: false,
					error: "duplicate",
					detail: "This activity has already been submitted.",
					tally_split_num: existing.tally_split_num,
					event_id: existing.event_id,
				}, 409);
			}
		} catch (e) {
			// If the dedup table is unavailable, fail closed — never risk a duplicate.
			return json({ ok: false, error: "dedup unavailable", detail: "Could not verify uniqueness. Try again." }, 503);
		}
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
	// Use OAuth token lifecycle (not static RUNSIGNUP_ACCESS_TOKEN which expires).
	let token: string;
	try {
		token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);
	} catch (e) {
		return json({ ok: false, error: "OAuth token unavailable", detail: e instanceof Error ? e.message : "" }, 502);
	}
	const subEventDef = EVENT_BY_ID.get(eventId);
	const subEventLabel = viaBundle && subEventDef ? ` [${subEventDef.event_name}]` : "";
	const activity: UnknownRecord = {
		tally_split_date: date,
		tally_split_comment: `Submitted via NWANA Charity Challenge Series${subEventLabel}`,
		// RunSignup requires elevation gain (split_elevation_gain_in_mm); 0 when not available from the file.
		split_elevation_gain_in_mm: 0,
	};
	// Fixed-distance events (speed/relay): always submit the event distance.
	// Mileage/team/open: submit the logged distance.
	const valueM = def.fixed_distance_m ?? distanceM;
	if (valueM !== null && valueM !== undefined) {
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
			const det = pd.details as Array<{ code?: string; message?: unknown }>;
			if (Array.isArray(det) && det.length > 0 && det[0].code) {
				const msg = typeof det[0].message === "string" ? det[0].message : JSON.stringify(det[0].message);
				detail = `${det[0].code}: ${msg || ""}`.trim();
			} else if (postData.error?.error_msg) {
				detail = postData.error.error_msg;
			} else {
				// Fallback: include raw response for debugging
				detail = `HTTP ${postRes.status}: ${JSON.stringify(postData).slice(0, 300)}`;
			}
		} catch { /* keep default */ }
		return json({ ok: false, error: "runsignup_rejected", detail }, 502);
	}
	const tallySplitNum = postData.tally_split_nums[0];

	// Store fingerprint AFTER successful RunSignup write (deduplication).
	if (fingerprint) {
		try {
			await env.nwana_engine_db.prepare(
				"INSERT OR IGNORE INTO challenge_activity_fingerprints (rsu_user_id, fingerprint, event_id, tally_split_num) VALUES (?, ?, ?, ?)"
			).bind(rsuUserId, fingerprint, eventId, tallySplitNum).run();
		} catch (e) {
			// Non-fatal: activity is already in RunSignup; log but don't fail.
			console.error("fingerprint store failed", e);
		}
	}

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
			(tally_split_num, race_id, submit_event_id, sub_event_id, registration_id, rsu_user_id, user_name, team_id, team_name, activity_date, distance_m, time_s, activity_type, source)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(
			tallySplitNum, CHALLENGE_RACE_ID, submitEventId, eventId,
			registrationId, rsuUserId, userName, team.team_id, team.team_name,
			date, valueM, timeS, activityType, source
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

/**
 * GET /api/challenge/v1/week-stats?week=YYYY-MM-DD
 * Weekly activity stats from canonical D1. Week = Monday–Sunday.
 * Returns:
 * - active_participants: unique rsu_user_id with at least one activity in week
 * - total_results: total activity rows in week
 */
async function handleWeekStats(url: URL, env: Env): Promise<Response> {
	const weekParam = url.searchParams.get("week");
	let weekStart: string;
	if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
		weekStart = mondayOfWeek(weekParam);
	} else {
		const now = new Date();
		const today = now.toISOString().slice(0, 10);
		weekStart = mondayOfWeek(today);
	}
	const weekEnd = addDays(weekStart, 6);

	try {
		const result = await env.nwana_engine_db.prepare(
			`SELECT COUNT(DISTINCT rsu_user_id) as active_count, COUNT(*) as total_count
			 FROM challenge_activities
			 WHERE activity_date >= ? AND activity_date <= ?`
		).bind(weekStart, weekEnd).first<{ active_count: number; total_count: number }>();

		return json({
			ok: true,
			week_start: weekStart,
			week_end: weekEnd,
			active_participants: result?.active_count ?? 0,
			total_results: result?.total_count ?? 0,
		});
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "DB error" }, 500);
	}
}

/**
 * GET /api/challenge/v1/team-types
 * Get race team types for the Charity Challenge Series (race 216323).
 * Returns team_type_id values needed to create teams via the Teams API.
 * Prioritizes the general "Challenge Team" type (team_type_id 165480) over Relay Team.
 */
async function handleTeamTypes(env: Env): Promise<Response> {
	try {
		let token: string;
		try {
			token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);
		} catch (e) {
			return json({ ok: false, error: e instanceof Error ? e.message : "OAuth token unavailable" }, 502);
		}
		// The team-types API requires an event_id parameter.
		// Get Challenge Team from regular events, Relay Team from relay events.
		// Challenge Team type_id 165480, Relay Team type_id 165317.
		const regularEvents = CHALLENGE_EVENTS.filter(e =>
			e.format === "mileage" || e.format === "speed"
		);
		const relayEvents = CHALLENGE_EVENTS.filter(e => e.format === "relay");

		let challengeTeamType: unknown = null;
		let relayTeamType: unknown = null;

		// Get Challenge Team type from regular events
		for (const event of regularEvents.slice(0, 3)) {
			const url = new URL(`https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}/teams/team-types`);
			url.searchParams.set("format", "json");
			url.searchParams.set("event_id", String(event.event_id));
			const res = await runSignupGetJson<{ race_team_types?: Array<{ team_type_id: number; team_type: string }> }>(url, token);
			if (res.ok && res.data?.race_team_types) {
				const found = res.data.race_team_types.find(t =>
					t.team_type.toLowerCase().includes("challenge team")
				);
				if (found) {
					challengeTeamType = found;
					break;
				}
			}
		}

		// Get Relay Team type from relay events
		for (const event of relayEvents.slice(0, 3)) {
			const url = new URL(`https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}/teams/team-types`);
			url.searchParams.set("format", "json");
			url.searchParams.set("event_id", String(event.event_id));
			const res = await runSignupGetJson<{ race_team_types?: Array<{ team_type_id: number; team_type: string }> }>(url, token);
			if (res.ok && res.data?.race_team_types) {
				const found = res.data.race_team_types.find(t =>
					t.team_type.toLowerCase().includes("relay")
				);
				if (found) {
					relayTeamType = found;
					break;
				}
			}
		}

		const allTypes = [];
		if (challengeTeamType) allTypes.push(challengeTeamType);
		if (relayTeamType) allTypes.push(relayTeamType);

		return json({
			ok: true,
			team_types: { race_team_types: allTypes },
			challenge_team_type: challengeTeamType,
			relay_team_type: relayTeamType,
		});
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
	}
}

/**
 * GET /api/challenge/v1/teams
 * List existing race teams for the Charity Challenge Series.
 */
async function handleListTeams(env: Env): Promise<Response> {
	try {
		let token: string;
		try {
			token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);
		} catch (e) {
			return json({ ok: false, error: e instanceof Error ? e.message : "OAuth token unavailable" }, 502);
		}
		// The teams API requires event_id.
		// Query BOTH regular events (Challenge Teams) and relay events (Relay Teams).
		const regularEvents = CHALLENGE_EVENTS.filter(e =>
			e.format === "mileage" || e.format === "speed"
		);
		const relayEvents = CHALLENGE_EVENTS.filter(e => e.format === "relay");
		const allEventIds = [
			...regularEvents.map(e => e.event_id),
			...relayEvents.map(e => e.event_id),
		].join(",");
		if (!allEventIds) {
			return json({ ok: false, error: "No events configured" }, 500);
		}
		const url = new URL(`https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}/teams`);
		url.searchParams.set("format", "json");
		url.searchParams.set("event_id", allEventIds);
		url.searchParams.set("include_group_sizes", "T");
		const res = await runSignupGetJson<unknown>(url, token);
		if (!res.ok) return json({ ok: false, error: res.api_error_msg || `RunSignup error (${res.http_status})` }, 502);
		return json({ ok: true, teams: res.data });
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
	}
}

/**
 * POST /api/challenge/v1/teams
 * Create a new race team via RunSignup Teams API.
 * Body: { team_name: string, team_type_id: number, team_gender?: "C"|"M"|"F" }
 * Uses POST /rest/v2/teams/manage-teams.json with OAuth Bearer.
 */
async function handleCreateTeam(request: Request, env: Env): Promise<Response> {
	let body: { team_name?: string; team_type_id?: number; team_gender?: string; rsu_user_id?: number };
	try {
		body = await request.json() as typeof body;
	} catch {
		return json({ ok: false, error: "Invalid JSON body" }, 400);
	}
	const teamName = (body.team_name || "").trim();
	const teamTypeId = Number(body.team_type_id);
	const rsuUserId = body.rsu_user_id ? Number(body.rsu_user_id) : null;
	if (!teamName) return json({ ok: false, error: "team_name is required" }, 400);
	if (!Number.isInteger(teamTypeId) || teamTypeId <= 0) {
		return json({ ok: false, error: "valid team_type_id is required" }, 400);
	}
	const teamGender = body.team_gender === "M" || body.team_gender === "F" ? body.team_gender : "C";

	let token: string;
	try {
		token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "OAuth token unavailable" }, 502);
	}

	// RunSignup Teams API: POST /rest/v2/teams/manage-teams.json
	// Request format: { "race_teams": [{ "team_name", "team_type_id", "team_gender" }] }
	// The API expects the JSON in a "request" POST parameter.
	// REQUIRED query params: race_id, event_ids
	const apiUrl = new URL(`https://api.runsignup.com/rest/v2/teams/manage-teams.json`);
	apiUrl.searchParams.set("race_id", String(CHALLENGE_RACE_ID));
	// Use the valid_event_ids from the Challenge Team type, or fallback to regular events
	const challengeTeamEventIds = CHALLENGE_EVENTS
		.filter(e => e.format === "mileage" || e.format === "speed")
		.map(e => e.event_id)
		.join(",");
	apiUrl.searchParams.set("event_ids", challengeTeamEventIds);
	const requestPayload = {
		race_teams: [
			{
				team_name: teamName,
				team_type_id: teamTypeId,
				team_gender: teamGender,
			},
		],
	};

	try {
		const formData = new URLSearchParams();
		formData.set("request", JSON.stringify(requestPayload));
		formData.set("format", "json");

		const res = await fetch(apiUrl.toString(), {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${token}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: formData.toString(),
		});

		const responseText = await res.text();
		let data: {
			race_team_ids?: number[];
			error?: { error_code?: number; error_msg?: string };
		};
		try {
			data = JSON.parse(responseText);
		} catch {
			return json({
				ok: false,
				error: `RunSignup API returned non-JSON (HTTP ${res.status}): ${responseText.slice(0, 200)}`,
			}, 502);
		}

		if (!res.ok || data.error) {
			return json({
				ok: false,
				error: data.error?.error_msg || `RunSignup API error (${res.status})`,
			}, 502);
		}

		const teamIds = data.race_team_ids || [];
		if (teamIds.length === 0) {
			return json({ ok: false, error: "Team creation returned no ID" }, 502);
		}

		const newTeamId = teamIds[0];
		const now = Math.floor(Date.now() / 1000);

		// Write to D1 cache immediately + add creator to My Teams as captain
		try {
			const db = (env as unknown as { nwana_engine_db: D1Database }).nwana_engine_db;
			const teamTypeLabel = teamTypeId === 165480 ? "Challenge Team"
				: teamTypeId === 165317 ? "Relay Team" : "";
			await db.prepare(`
				INSERT INTO challenge_teams (team_id, team_name, team_type_id, team_type, member_count, synced_at)
				VALUES (?, ?, ?, ?, 1, ?)
				ON CONFLICT(team_id) DO UPDATE SET
					team_name = excluded.team_name,
					team_type_id = excluded.team_type_id,
					team_type = excluded.team_type,
					synced_at = excluded.synced_at
			`).bind(newTeamId, teamName, teamTypeId, teamTypeLabel, now).run();

			if (rsuUserId && Number.isInteger(rsuUserId) && rsuUserId > 0) {
				await db.prepare(`
					INSERT INTO challenge_team_members (team_id, rsu_user_id, is_captain, synced_at)
					VALUES (?, ?, 1, ?)
					ON CONFLICT(team_id, rsu_user_id) DO UPDATE SET
						is_captain = 1,
						synced_at = excluded.synced_at
				`).bind(newTeamId, rsuUserId, now).run();
			}
		} catch (dbErr) {
			// D1 write failure should not fail the team creation
			console.log("D1 teams cache write failed:", dbErr instanceof Error ? dbErr.message : dbErr);
		}

		return json({
			ok: true,
			team_id: newTeamId,
			team_name: teamName,
		});
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "Request failed" }, 502);
	}
}

/**
 * POST /api/challenge/v1/setup-challenge-team-type
 * Creates a general "Challenge Team" group type in RunSignup for race 216323.
 * This is for regular participant teams (Hallandale Beach, Central Park, etc.),
 * NOT relay teams. Preserves the existing Relay Team type.
 *
 * WARNING: The RunSignup team-types API DELETES any existing types not included
 * in the request. This handler first fetches all existing types and includes
 * them to avoid deletion.
 */
async function handleSetupChallengeTeamType(env: Env): Promise<Response> {
	try {
		let token: string;
		try {
			token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);
		} catch (e) {
			return json({ ok: false, error: e instanceof Error ? e.message : "OAuth token unavailable" }, 502);
		}

		// Step 1: Get race info to find race_event_days_id
		// Try the race endpoint first
		const raceUrl = new URL(`https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}`);
		raceUrl.searchParams.set("format", "json");
		const raceRes = await runSignupGetJson<{
			race?: {
				race_event_days_id?: number;
				event_days?: Array<{ race_event_days_id: number }>;
			};
		}>(raceUrl, token);

		let raceEventDaysId: number | undefined;
		if (raceRes.ok && raceRes.data?.race) {
			raceEventDaysId = raceRes.data.race.race_event_days_id
				|| raceRes.data.race.event_days?.[0]?.race_event_days_id;
		}

		if (!raceEventDaysId) {
			// Fallback: try to get from events endpoint
			const eventsUrl = new URL(`https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}/events`);
			eventsUrl.searchParams.set("format", "json");
			const eventsRes = await runSignupGetJson<{
				events?: Array<{ race_event_days_id?: number }>;
			}>(eventsUrl, token);
			if (eventsRes.ok && eventsRes.data?.events?.[0]?.race_event_days_id) {
				raceEventDaysId = eventsRes.data.events[0].race_event_days_id;
			}
		}

		if (!raceEventDaysId) {
			// Log and continue without it - may work with OAuth
			console.log("Warning: race_event_days_id not found, attempting POST without it");
		}

		// Step 2: Get all existing team types (to preserve them)
		// Try each event until we find team types
		let existingTypes: Array<{
			team_type_id: number;
			team_type: string;
			team_type_desc?: string;
			min_members?: number;
			max_members?: number | null;
			min_male_members?: number;
			max_male_members?: number | null;
			min_female_members?: number;
			max_female_members?: number | null;
			max_num_teams?: number | null;
			valid_event_ids?: number[];
			require_gender_selection?: string;
			allow_all_male_team?: string;
			allow_all_female_team?: string;
			allow_coed_team?: string;
			allow_nonbinary_in_male_or_female?: string;
		}> = [];

		const relayEvents = CHALLENGE_EVENTS.filter(e => e.format === "relay");
		for (const event of relayEvents.slice(0, 3)) {
			const typeUrl = new URL(`https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}/teams/team-types`);
			typeUrl.searchParams.set("format", "json");
			typeUrl.searchParams.set("event_id", String(event.event_id));
			const typeRes = await runSignupGetJson<{ race_team_types?: typeof existingTypes }>(typeUrl, token);
			if (typeRes.ok && typeRes.data?.race_team_types && typeRes.data.race_team_types.length > 0) {
				existingTypes = typeRes.data.race_team_types;
				break;
			}
		}

		// Step 3: Check if Challenge Team type already exists
		const challengeTeamExists = existingTypes.some(t =>
			t.team_type.toLowerCase().includes("challenge team")
		);
		if (challengeTeamExists) {
			return json({
				ok: true,
				message: "Challenge Team type already exists",
				existing_types: existingTypes.map(t => ({ team_type_id: t.team_type_id, team_type: t.team_type })),
			});
		}

		// Step 4: Build the full list (existing + new Challenge Team)
		// Get all non-relay event IDs for the Challenge Team type
		const regularEventIds = CHALLENGE_EVENTS
			.filter(e => e.format !== "relay" && e.format !== "team" && e.format !== "open")
			.map(e => e.event_id);

		const allTypes = [
			// Preserve existing types (Relay Team, etc.)
			...existingTypes.map(t => ({
				team_type_id: t.team_type_id,
				team_type: t.team_type,
				team_type_desc: t.team_type_desc || "",
				min_members: t.min_members ?? 0,
				max_members: t.max_members ?? null,
				min_male_members: t.min_male_members ?? 0,
				max_male_members: t.max_male_members ?? null,
				min_female_members: t.min_female_members ?? 0,
				max_female_members: t.max_female_members ?? null,
				max_num_teams: t.max_num_teams ?? null,
				valid_event_ids: t.valid_event_ids || [],
				require_gender_selection: t.require_gender_selection || "F",
				allow_all_male_team: t.allow_all_male_team || "T",
				allow_all_female_team: t.allow_all_female_team || "T",
				allow_coed_team: t.allow_coed_team || "T",
				allow_nonbinary_in_male_or_female: t.allow_nonbinary_in_male_or_female || "T",
			})),
			// Add new Challenge Team type (no team_type_id = create new)
			{
				team_type: "Challenge Team",
				team_type_desc: "General teams for Charity Challenge Series participants — clubs, companies, families, friends, communities (e.g. Hallandale Beach, Central Park, New Jersey, Kolobok).",
				min_members: 1,
				max_members: null,
				min_male_members: 0,
				max_male_members: null,
				min_female_members: 0,
				max_female_members: null,
				max_num_teams: null,
				valid_event_ids: regularEventIds,
				require_gender_selection: "F",
				allow_all_male_team: "T",
				allow_all_female_team: "T",
				allow_coed_team: "T",
				allow_nonbinary_in_male_or_female: "T",
			},
		];

		// Step 5: POST to create/update team types
		// WARNING: Any existing type NOT in this list will be DELETED.
		// Try without race_event_days_id first (may not be required with OAuth).
		const apiUrl = `https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}/teams/team-types`;
		const formData = new URLSearchParams();
		formData.set("request", JSON.stringify({ race_team_types: allTypes }));
		formData.set("format", "json");
		formData.set("request_format", "json");
		// Only include race_event_days_id if we found it
		if (raceEventDaysId) {
			formData.set("race_event_days_id", String(raceEventDaysId));
		}

		const res = await fetch(apiUrl, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${token}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: formData.toString(),
		});

		const data = await res.json() as {
			race_team_type_ids?: number[];
			error?: { error_code?: number; error_msg?: string };
		};

		if (!res.ok || data.error) {
			return json({
				ok: false,
				error: data.error?.error_msg || `RunSignup API error (${res.status})`,
			}, 502);
		}

		return json({
			ok: true,
			message: "Challenge Team type created",
			race_team_type_ids: data.race_team_type_ids,
			preserved_existing: existingTypes.length,
			regular_events_count: regularEventIds.length,
		});
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
	}
}

/**
 * GET /api/challenge/v1/debug-race-info
 * Debug endpoint to see RunSignup race API structure.
 */
async function handleDebugRaceInfo(env: Env): Promise<Response> {
	try {
		const token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);

		// Try events endpoint
		const eventsUrl = new URL(`https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}/events`);
		eventsUrl.searchParams.set("format", "json");
		const eventsRes = await runSignupGetJson<unknown>(eventsUrl, token);

		let eventKeys: string[] = [];
		let eventSample = "";
		if (eventsRes.ok && eventsRes.data) {
			const data = eventsRes.data as { events?: Array<Record<string, unknown>> };
			if (data.events && data.events[0]) {
				eventKeys = Object.keys(data.events[0]);
				eventSample = JSON.stringify(data.events[0]).slice(0, 1000);
			}
		}

		return json({
			ok: true,
			event_keys: eventKeys,
			event_sample: eventSample,
			events_error: eventsRes.ok ? null : eventsRes.api_error_msg,
		});
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
	}
}

/**
 * GET /api/challenge/v1/teams/search?query=...&limit=20&offset=0&team_type_id=...
 * Server-side search over the D1 teams cache. Never returns the full catalog.
 * RunSignup is source of truth; D1 is the searchable index (synced on-demand).
 */
async function handleSearchTeams(url: URL, env: Env): Promise<Response> {
	try {
		const query = (url.searchParams.get("query") || "").trim();
		const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 50);
		const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
		const teamTypeId = url.searchParams.get("team_type_id");

		const db = (env as unknown as { nwana_engine_db: D1Database }).nwana_engine_db;

		let sql = `SELECT team_id, team_name, team_type_id, team_type, member_count FROM challenge_teams WHERE 1=1`;
		const params: (string | number)[] = [];

		if (query) {
			sql += ` AND team_name LIKE ?`;
			params.push(`%${query}%`);
		}
		if (teamTypeId) {
			sql += ` AND team_type_id = ?`;
			params.push(parseInt(teamTypeId, 10));
		}

		sql += ` ORDER BY team_name ASC LIMIT ? OFFSET ?`;
		params.push(limit, offset);

		const result = await db.prepare(sql).bind(...params).all<{
			team_id: number;
			team_name: string;
			team_type_id: number;
			team_type: string;
			member_count: number;
		}>();

		// Get total count for pagination
		let countSql = `SELECT COUNT(*) as total FROM challenge_teams WHERE 1=1`;
		const countParams: (string | number)[] = [];
		if (query) {
			countSql += ` AND team_name LIKE ?`;
			countParams.push(`%${query}%`);
		}
		if (teamTypeId) {
			countSql += ` AND team_type_id = ?`;
			countParams.push(parseInt(teamTypeId, 10));
		}
		const countResult = await db.prepare(countSql).bind(...countParams).first<{ total: number }>();

		return json({
			ok: true,
			teams: result.results || [],
			total: countResult?.total || 0,
			limit,
			offset,
			has_more: (offset + limit) < (countResult?.total || 0),
		});
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
	}
}

/**
 * POST /api/challenge/v1/teams/sync
 * Sync teams from RunSignup (source of truth) into D1 cache.
 * On-demand only (no polling). Called after team creation or manually.
 */
async function handleSyncTeams(env: Env): Promise<Response> {
	try {
		let token: string;
		try {
			token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);
		} catch (e) {
			return json({ ok: false, error: e instanceof Error ? e.message : "OAuth token unavailable" }, 502);
		}

		const db = (env as unknown as { nwana_engine_db: D1Database }).nwana_engine_db;
		const now = Math.floor(Date.now() / 1000);

		// Fetch from RunSignup (paginated)
		const regularEvents = CHALLENGE_EVENTS.filter(e => e.format === "mileage" || e.format === "speed");
		const relayEvents = CHALLENGE_EVENTS.filter(e => e.format === "relay");
		const allEventIds = [...regularEvents, ...relayEvents].map(e => e.event_id).join(",");

		let synced = 0;
		let page = 1;

		while (true) {
			const url = new URL(`https://api.runsignup.com/rest/race/${CHALLENGE_RACE_ID}/teams`);
			url.searchParams.set("format", "json");
			url.searchParams.set("event_id", allEventIds);
			url.searchParams.set("include_group_sizes", "T");
			url.searchParams.set("page", String(page));
			url.searchParams.set("results_per_page", "100");

			const res = await runSignupGetJson<{
				race_teams?: Array<{
					team_id: number;
					team_name: string;
					team_type_id: number;
					team_member_current_count?: number;
					last_modified_ts?: number;
				}>;
			}>(url, token);

			if (!res.ok || !res.data?.race_teams || res.data.race_teams.length === 0) {
				break;
			}

			for (const t of res.data.race_teams) {
				const teamType = t.team_type_id === 165480 ? "Challenge Team"
					: t.team_type_id === 165317 ? "Relay Team"
					: "";
				await db.prepare(`
					INSERT INTO challenge_teams (team_id, team_name, team_type_id, team_type, member_count, last_modified_ts, synced_at)
					VALUES (?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(team_id) DO UPDATE SET
						team_name = excluded.team_name,
						team_type_id = excluded.team_type_id,
						team_type = excluded.team_type,
						member_count = excluded.member_count,
						last_modified_ts = excluded.last_modified_ts,
						synced_at = excluded.synced_at
				`).bind(
					t.team_id,
					t.team_name,
					t.team_type_id,
					teamType,
					t.team_member_current_count || 0,
					t.last_modified_ts || null,
					now
				).run();
				synced++;
			}

			if (res.data.race_teams.length < 100) break;
			page++;
			if (page > 100) break; // safety limit
		}

		return json({ ok: true, synced, synced_at: now });
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
	}
}

/**
 * GET /api/challenge/v1/teams/mine?rsu_user_id=...
 * Teams the current user belongs to or manages (from D1).
 */
async function handleMyTeams(url: URL, env: Env): Promise<Response> {
	try {
		const rsuUserId = url.searchParams.get("rsu_user_id");
		if (!rsuUserId) {
			return json({ ok: false, error: "rsu_user_id is required" }, 400);
		}

		const db = (env as unknown as { nwana_engine_db: D1Database }).nwana_engine_db;
		const result = await db.prepare(`
			SELECT t.team_id, t.team_name, t.team_type_id, t.team_type, t.member_count, m.is_captain
			FROM challenge_teams t
			JOIN challenge_team_members m ON m.team_id = t.team_id
			WHERE m.rsu_user_id = ?
			ORDER BY t.team_name ASC
		`).bind(parseInt(rsuUserId, 10)).all();

		return json({ ok: true, teams: result.results || [] });
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
	}
}

/**
 * GET /api/challenge/v1/activities/mine?rsu_user_id=
 * Returns only the requesting user's activities with event details.
 */
async function handleMyActivities(url: URL, env: Env): Promise<Response> {
	const rsuUserId = parseInt(url.searchParams.get("rsu_user_id") || "0", 10);
	if (!rsuUserId) return json({ ok: false, error: "rsu_user_id required" }, 400);
	try {
		const rows = await env.nwana_engine_db.prepare(
			`SELECT tally_split_num, activity_date, distance_m, time_s, source, activity_type,
			        sub_event_id, submit_event_id, registration_id, created_at
			 FROM challenge_activities WHERE rsu_user_id = ? ORDER BY activity_date DESC, tally_split_num DESC LIMIT 200`
		).bind(rsuUserId).all();
		const activities = (rows.results || []).map((r: any) => {
			const def = EVENT_BY_ID.get(r.sub_event_id);
			return {
				tally_split_num: r.tally_split_num,
				date: r.activity_date,
				distance_m: r.distance_m,
				time_s: r.time_s,
				source: r.source || "manual",
				activity_type: r.activity_type,
				event_id: r.sub_event_id,
				event_name: def ? def.event_name : ("Event " + r.sub_event_id),
				discipline: def ? def.discipline : "",
				format: def ? def.format : "",
				distance_label: def ? def.distance_label : "",
				registration_id: r.registration_id,
				created_at: r.created_at,
			};
		});
		return json({ ok: true, activities });
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
	}
}

/**
 * DELETE /api/challenge/v1/activities/:tally_split_num?rsu_user_id=
 * Deletes from RunSignup via official API, then removes D1 mapping + fingerprint.
 * After deletion the same source file can be uploaded again.
 */
async function handleDeleteActivity(tallyStr: string, url: URL, env: Env): Promise<Response> {
	const tallySplitNum = parseInt(tallyStr, 10);
	const rsuUserId = parseInt(url.searchParams.get("rsu_user_id") || "0", 10);
	if (!tallySplitNum || !rsuUserId) return json({ ok: false, error: "tally_split_num and rsu_user_id required" }, 400);

	// Ownership check via D1 mapping.
	const row = await env.nwana_engine_db.prepare(
		"SELECT * FROM challenge_activities WHERE tally_split_num = ? AND rsu_user_id = ?"
	).bind(tallySplitNum, rsuUserId).first<any>();
	if (!row) return json({ ok: false, error: "not found or not yours" }, 404);

	let token: string;
	try {
		token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);
	} catch (e) {
		return json({ ok: false, error: "OAuth token unavailable" }, 502);
	}

	// Official RunSignup DELETE.
	const delUrl = new URL("https://api.runsignup.com/rest/v2/vr-activities.json");
	delUrl.searchParams.set("race_id", String(CHALLENGE_RACE_ID));
	delUrl.searchParams.set("event_id", String(row.submit_event_id));
	delUrl.searchParams.set("registration_id", String(row.registration_id));
	delUrl.searchParams.set("tally_split_num", String(tallySplitNum));
	let delRes: Response;
	try {
		delRes = await fetch(delUrl.toString(), {
			method: "DELETE",
			headers: { "Authorization": "Bearer " + token },
		});
	} catch (e) {
		return json({ ok: false, error: "runsignup_unreachable" }, 502);
	}
	let delData: any;
	try { delData = await delRes.json(); } catch { return json({ ok: false, error: "invalid RunSignup response" }, 502); }
	const deleted = Array.isArray(delData.tally_split_nums) && delData.tally_split_nums.includes(tallySplitNum);
	if (!delRes.ok || !deleted) {
		return json({ ok: false, error: "runsignup_delete_failed", detail: JSON.stringify(delData).slice(0, 300) }, 502);
	}

	// Remove D1 mapping + fingerprint so the file can be re-uploaded.
	try {
		await env.nwana_engine_db.prepare(
			"DELETE FROM challenge_activities WHERE tally_split_num = ?"
		).bind(tallySplitNum).run();
		await env.nwana_engine_db.prepare(
			"DELETE FROM challenge_activity_fingerprints WHERE rsu_user_id = ? AND tally_split_num = ?"
		).bind(rsuUserId, tallySplitNum).run();
	} catch (e) {
		console.error("delete cleanup failed", e);
	}
	return json({ ok: true, deleted: tallySplitNum });
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
	if (path === "/api/challenge/v1/activities/mine" && request.method === "GET") {
		return handleMyActivities(url, env);
	}
	const actMatch = path.match(/^\/api\/challenge\/v1\/activities\/(\d+)$/);
	if (actMatch && request.method === "DELETE") {
		return handleDeleteActivity(actMatch[1], url, env);
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
	if (path === "/api/challenge/v1/week-stats" && request.method === "GET") {
		return handleWeekStats(url, env);
	}
	if (path === "/api/challenge/v1/team-types" && request.method === "GET") {
		return handleTeamTypes(env);
	}
	if (path === "/api/challenge/v1/teams" && request.method === "GET") {
		return handleListTeams(env);
	}
	if (path === "/api/challenge/v1/teams" && request.method === "POST") {
		return handleCreateTeam(request, env);
	}
	if (path === "/api/challenge/v1/setup-challenge-team-type" && request.method === "POST") {
		return handleSetupChallengeTeamType(env);
	}
	if (path === "/api/challenge/v1/teams/search" && request.method === "GET") {
		return handleSearchTeams(url, env);
	}
	if (path === "/api/challenge/v1/teams/sync" && request.method === "POST") {
		return handleSyncTeams(env);
	}
	if (path === "/api/challenge/v1/teams/mine" && request.method === "GET") {
		return handleMyTeams(url, env);
	}
	if (path === "/api/challenge/v1/debug-race-info" && request.method === "GET") {
		return handleDebugRaceInfo(env);
	}
	if (path.startsWith("/api/challenge/v1/forms/") && request.method === "POST") {
		const formType = path.slice("/api/challenge/v1/forms/".length);
		return handleFormSubmit(formType, request, env);
	}
	if (path === "/api/challenge/v1/form-submissions" && request.method === "GET") {
		return handleFormList(url, env);
	}
	return json({ ok: false, error: "unknown challenge endpoint" }, 404);
}

const VALID_FORM_TYPES = ["contact", "organization", "sponsor", "partner"] as const;

/**
 * POST /api/challenge/v1/forms/<type>
 * Durable form submission storage. Generates unique ID, stores payload as JSON,
 * status NEW by default. No PII logging.
 */
async function handleFormSubmit(formType: string, request: Request, env: Env): Promise<Response> {
	if (!(VALID_FORM_TYPES as readonly string[]).includes(formType)) {
		return json({ ok: false, error: "unknown form type" }, 400);
	}
	let payload: Record<string, unknown>;
	try {
		payload = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ ok: false, error: "invalid JSON" }, 400);
	}
	// Basic spam guard: honeypot field must be empty.
	if (payload._hp && String(payload._hp).trim() !== "") {
		return json({ ok: true, message: "Thank you!" }); // Silently accept spam.
	}
	const id = `frm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	// Strip honeypot and internal fields before storage.
	const clean: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(payload)) {
		if (k.startsWith("_")) continue;
		if (typeof v === "string" && v.length > 5000) continue; // Truncate abuse.
		clean[k] = typeof v === "string" ? v.slice(0, 5000) : v;
	}
	try {
		await env.nwana_engine_db.prepare(
			`INSERT INTO challenge_form_submissions (id, form_type, status, payload_json, source)
			VALUES (?, ?, 'NEW', ?, 'challenges.nwaofna.org')`
		).bind(id, formType, JSON.stringify(clean)).run();
	} catch (e) {
		return json({ ok: false, error: "storage failed" }, 500);
	}
	return json({ ok: true, id, message: "Thank you! We received your submission and will be in touch." });
}

/**
 * GET /api/challenge/v1/form-submissions?form_type=organization&status=NEW
 * List form submissions for Operating Center follow-up. Auth via X-Challenge-Key.
 */
async function handleFormList(url: URL, env: Env): Promise<Response> {
	const formType = url.searchParams.get("form_type");
	const status = url.searchParams.get("status");
	let sql = `SELECT id, form_type, status, payload_json, source, created_at, updated_at
		FROM challenge_form_submissions WHERE 1=1`;
	const binds: unknown[] = [];
	if (formType && (VALID_FORM_TYPES as readonly string[]).includes(formType)) {
		sql += ` AND form_type = ?`;
		binds.push(formType);
	}
	if (status) {
		sql += ` AND status = ?`;
		binds.push(status);
	}
	sql += ` ORDER BY created_at DESC LIMIT 200`;
	try {
		const result = await env.nwana_engine_db.prepare(sql).bind(...binds).all();
		return json({ ok: true, submissions: result.results || [] });
	} catch (e) {
		return json({ ok: false, error: "d1 query failed" }, 500);
	}
}

/**
 * POST /api/challenge/v1/sync-donations
 * Owner-triggered sync of race 216323 donations into canonical money_events.
 * Uses the existing money pipeline; 216323 is NOT in RACE_TO_FUND_ID so no
 * 212466 fund attribution is applied. No polling — explicit trigger only.
 */
async function handleSyncDonations(env: Env): Promise<Response> {
	// Use OAuth token lifecycle (not static RUNSIGNUP_ACCESS_TOKEN which expires).
	let token: string;
	try {
		token = await resolveRunSignupAccessToken(env as unknown as Parameters<typeof resolveRunSignupAccessToken>[0]);
	} catch (e) {
		return json({ ok: false, error: "OAuth token unavailable", detail: e instanceof Error ? e.message : "" }, 502);
	}
	try {
		const result = await syncRunSignupDonations(
			env.nwana_engine_db,
			token,
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
	fundraiser_id: string | null;
}

/**
 * GET /api/challenge/v1/fundraising-leaderboard?week=YYYY-MM-DD
 * Weekly fundraising leaderboard from canonical money_events.
 * Race 216323 only. Week = Monday–Sunday.
 * Groups by fundraiser_id (NOT by transaction — multiple donations to one
 * fundraiser produce one row with summed amount). No fake data — empty until
 * real donations sync. Open Challenge participates (discipline does not
 * affect donation ranking).
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
	// Use ONLY donation_received: for fundraiser donations, ingestion creates
	// both donation_received and fundraiser_donation_received with the same
	// amount — summing both would double-count. fundraiser_id is on the
	// donation_received record.
	let rows: DonationRow[] = [];
	try {
		const result = await env.nwana_engine_db.prepare(
			`SELECT source_transaction_id, occurred_at, gross_cents, source_ref, fundraiser_id
			FROM money_events
			WHERE source_ref LIKE 'race:216323/%'
			  AND event_type = 'donation_received'
			  AND gross_cents IS NOT NULL AND gross_cents > 0
			  AND date(occurred_at) >= ? AND date(occurred_at) <= ?
			ORDER BY occurred_at`
		).bind(weekStart, weekEnd).all<DonationRow>();
		rows = result.results || [];
	} catch (e) {
		return json({ ok: false, error: "d1 query failed" }, 500);
	}

	// Group by fundraiser_id. Donations without a fundraiser_id (general race
	// donations) are grouped under a shared "general" key.
	const byFundraiser = new Map<string, { total_cents: number; count: number }>();
	for (const r of rows) {
		const key = r.fundraiser_id || "__general__";
		const cur = byFundraiser.get(key) || { total_cents: 0, count: 0 };
		cur.total_cents += r.gross_cents!;
		cur.count += 1;
		byFundraiser.set(key, cur);
	}

	const ranked = [...byFundraiser.entries()]
		.map(([fundraiser_id, v]) => ({
			fundraiser_id,
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
