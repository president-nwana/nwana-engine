/**
 * Google Ads completed-conversion truth layer — Phase 1 (owner-approved
 * 2026-10-16). Spec: completed-conversions-research-2026-10-16.md.
 *
 * Pipeline:
 *   1. The charity worker (challenges.nwaofna.org) captures gclid/gbraid/
 *      wbraid on ad landings into a first-party cookie and reports them to
 *      POST /api/challenge/v1/ad-click -> recordAdClick() here.
 *   2. When that browser signs in via RunSignup OAuth, the worker reports
 *      POST /api/challenge/v1/ad-click/bind -> bindAdClick() here, tying
 *      the click to the OAuth-verified rsu_user_id. Latest bind wins.
 *   3. Completion records: race-216323 registrations are persisted WITHOUT
 *      the money pipeline's paid-only filter (syncChallengeRegistrations),
 *      fundraisers are first-seen watched (syncChallengeFundraisers), and
 *      donations reuse money_events as-is.
 *   4. buildConversionOutbox() maps the three completion sources into
 *      ads_conversion_outbox, joined to click IDs via the bindings.
 *   5. uploadPendingConversions() (daily cron) uploads pending rows via
 *      Google Ads uploadClickConversions with partial failure enabled.
 *
 * Phase 2 (hashed-email Enhanced Conversions for leads) is deliberately
 * NOT implemented: it needs a separate owner approval because it reverses
 * the Engine's never-read-donor-PII stance. No emails are read or stored
 * anywhere in this module.
 */

import { runSignupGetJson } from "../runsignup-client";
import {
	resolveRunSignupAccessToken,
	type RunSignupEnvLike,
} from "../runsignup-oauth";
import {
	getConversionActions,
	uploadClickConversions,
	GOOGLE_ADS_LIVE_CUSTOMER_ID,
	type GoogleAdsEnv,
} from "../google-ads";

export const ADS_CHALLENGE_RACE_ID = 216323;

/**
 * The exact Google Ads conversion action names the uploader expects.
 * A separate owner UI step creates these as Import (UPLOAD_CLICKS)
 * actions; until they exist the uploader logs "conversion action not
 * found" per missing name and leaves those rows pending.
 */
export const ADS_CONVERSION_ACTION_NAMES = {
	registration: "Challenge Registration (completed)",
	fundraiser: "Fundraiser Created (completed)",
	donation: "Donation (completed)",
} as const;

export type AdsActionKey = keyof typeof ADS_CONVERSION_ACTION_NAMES;

export type ClickKind = "gclid" | "gbraid" | "wbraid";
const CLICK_KINDS: readonly string[] = ["gclid", "gbraid", "wbraid"];

/** Google drops click conversions uploaded more than 90 days after the click. */
const CLICK_WINDOW_DAYS = 90;
const UPLOAD_BATCH_LIMIT = 500;

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

type UnknownRecord = Record<string, unknown>;

function asRecord(v: unknown): UnknownRecord | null {
	return v && typeof v === "object" && !Array.isArray(v)
		? (v as UnknownRecord)
		: null;
}

function intVal(v: unknown): number | null {
	const n = typeof v === "number" ? v : Number(v);
	return Number.isInteger(n) && n > 0 ? n : null;
}

function isClickKind(v: unknown): v is ClickKind {
	return typeof v === "string" && CLICK_KINDS.includes(v);
}

function validClickId(v: unknown): string | null {
	if (typeof v !== "string") return null;
	const s = v.trim();
	if (s.length < 8 || s.length > 512) return null;
	return s;
}

/**
 * Normalize a RunSignup timestamp ("2026-10-12 15:05:36" or ISO) to ISO UTC.
 * RunSignup timestamps carry no offset; Workers run in UTC, and Ads import
 * only needs same-day accuracy at NWANA's volumes. Returns null when the
 * value is unparseable.
 */
export function normalizeTimestamp(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const raw = String(value).trim();
	if (!raw) return null;
	// The RunSignup participants API returns US-format timestamps
	// ("10/4/2026 15:21", no seconds, no offset). Interpret as UTC.
	const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/);
	if (us) {
		const d = new Date(Date.UTC(
			Number(us[3]), Number(us[1]) - 1, Number(us[2]),
			Number(us[4]), Number(us[5]), Number(us[6] ?? 0),
		));
		return Number.isNaN(d.getTime()) ? null : d.toISOString();
	}
	const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
	if (Number.isNaN(d.getTime())) return null;
	return d.toISOString();
}

/** Google Ads API datetime format: "yyyy-mm-dd hh:mm:ss+hh:mm" (UTC here). */
export function toAdsDateTime(iso: string): string {
	const d = new Date(iso);
	const p = (n: number) => String(n).padStart(2, "0");
	return (
		`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
		`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
	);
}

/**
 * Durable per-step evidence in money_sync_state (the money pipeline's
 * pattern): cron console logs are not readable after the fact, so every
 * step records its outcome here — success AND failure.
 */
async function recordSyncState(
	db: D1Database,
	sourceKey: string,
	result: unknown,
	error?: string,
): Promise<void> {
	try {
		await db
			.prepare(
				`INSERT INTO money_sync_state (source_key, last_sync_at, last_sync_result, last_error)
				 VALUES (?, ?, ?, ?)
				 ON CONFLICT(source_key) DO UPDATE SET
					last_sync_at = excluded.last_sync_at,
					last_sync_result = excluded.last_sync_result,
					last_error = excluded.last_error`,
			)
			.bind(
				sourceKey,
				new Date().toISOString(),
				JSON.stringify(result ?? {}).slice(0, 2000),
				error ?? null,
			)
			.run();
	} catch {
		// Evidence recording must never break the step it describes.
	}
}

async function runChunked(
	db: D1Database,
	statements: D1PreparedStatement[],
	chunkSize = 100,
): Promise<void> {
	for (let i = 0; i < statements.length; i += chunkSize) {
		await db.batch(statements.slice(i, i + chunkSize));
	}
}

/**
 * Existing-id lookup in chunks: D1 caps bound parameters per query, so a
 * full participant list cannot go into a single IN (...) clause.
 */
async function fetchExistingIds(
	db: D1Database,
	table: "challenge_registrations" | "challenge_fundraisers",
	column: "registration_id" | "fundraiser_id",
	ids: Array<number | string>,
): Promise<Set<number | string>> {
	const found = new Set<number | string>();
	const CHUNK = 90;
	for (let i = 0; i < ids.length; i += CHUNK) {
		const slice = ids.slice(i, i + CHUNK);
		const res = await db
			.prepare(
				`SELECT ${column} AS id FROM ${table} WHERE ${column} IN (${slice.map(() => "?").join(",")})`,
			)
			.bind(...slice)
			.all<{ id: number | string }>();
		for (const row of res.results ?? []) found.add(row.id);
	}
	return found;
}

// ---------------------------------------------------------------------------
// 1+2. Click capture + identity bind (called from challenge.ts endpoints)
// ---------------------------------------------------------------------------

export async function recordAdClick(
	db: D1Database,
	input: { click_id?: unknown; kind?: unknown; landing_path?: unknown; rsu_user_id?: unknown },
): Promise<{ ok: boolean; error?: string }> {
	const clickId = validClickId(input.click_id);
	if (!clickId) return { ok: false, error: "invalid click_id" };
	if (!isClickKind(input.kind)) return { ok: false, error: "invalid kind" };
	const landingPath =
		typeof input.landing_path === "string" ? input.landing_path.slice(0, 300) : null;
	const nowIso = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO ad_clicks (click_id, kind, first_seen_at, landing_path)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(click_id) DO NOTHING`,
		)
		.bind(clickId, input.kind, nowIso, landingPath)
		.run();
	const rsuUserId = intVal(input.rsu_user_id);
	if (rsuUserId) {
		await upsertBinding(db, rsuUserId, clickId, nowIso);
	}
	return { ok: true };
}

export async function bindAdClick(
	db: D1Database,
	input: { click_id?: unknown; kind?: unknown; rsu_user_id?: unknown },
): Promise<{ ok: boolean; error?: string }> {
	const clickId = validClickId(input.click_id);
	if (!clickId) return { ok: false, error: "invalid click_id" };
	const rsuUserId = intVal(input.rsu_user_id);
	if (!rsuUserId) return { ok: false, error: "invalid rsu_user_id" };
	const kind: ClickKind = isClickKind(input.kind) ? input.kind : "gclid";
	const nowIso = new Date().toISOString();
	// Ensure the click row exists even if the original capture POST was lost
	// (the cookie is the durable copy; this row is its mirror).
	await db
		.prepare(
			`INSERT INTO ad_clicks (click_id, kind, first_seen_at, landing_path)
			 VALUES (?, ?, ?, NULL)
			 ON CONFLICT(click_id) DO NOTHING`,
		)
		.bind(clickId, kind, nowIso)
		.run();
	await upsertBinding(db, rsuUserId, clickId, nowIso);
	return { ok: true };
}

async function upsertBinding(
	db: D1Database,
	rsuUserId: number,
	clickId: string,
	nowIso: string,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO ad_click_bindings (rsu_user_id, click_id, bound_at, updated_at)
			 VALUES (?, ?, ?, datetime('now'))
			 ON CONFLICT(rsu_user_id) DO UPDATE SET
				click_id = excluded.click_id,
				bound_at = excluded.bound_at,
				updated_at = datetime('now')`,
		)
		.bind(rsuUserId, clickId, nowIso)
		.run();
}

// ---------------------------------------------------------------------------
// 3a. Registrations sync — race participants WITHOUT the paid-only filter.
// Mirrors challenge.ts fetchParticipants (same endpoint + payload shape):
// the response is an ARRAY of per-event wrappers [{event, participants[]}].
// ---------------------------------------------------------------------------

export interface ParticipantRegistration {
	registration_id: number;
	rsu_user_id: number | null;
	event_id: number | null;
	registration_date: string | null;
}

/** Pure mapping from one raw participant record (exported for tests). */
export function mapParticipantRegistration(
	p: UnknownRecord,
): ParticipantRegistration | null {
	const registrationId = intVal(p.registration_id);
	if (!registrationId) return null;
	const user = asRecord(p.user);
	return {
		registration_id: registrationId,
		rsu_user_id: intVal(user?.user_id) ?? intVal(p.user_id),
		event_id: intVal(p.event_id),
		registration_date: normalizeTimestamp(
			p.registration_date ?? p.registrationDate,
		),
	};
}

function flattenParticipants(data: unknown): UnknownRecord[] {
	const out: UnknownRecord[] = [];
	const arr = Array.isArray(data) ? data : [data];
	for (const el of arr) {
		const d = asRecord(el);
		if (!d) continue;
		if (Array.isArray(d.participants)) {
			for (const p of d.participants) {
				const pr = asRecord(p);
				if (pr) out.push(pr);
			}
		}
		const ev = asRecord(d.event);
		if (ev && Array.isArray(ev.participants)) {
			for (const p of ev.participants) {
				const pr = asRecord(p);
				if (pr) out.push(pr);
			}
		}
	}
	return out;
}

export interface CompletionSyncResult {
	ok: boolean;
	fetched: number;
	inserted: number;
	updated: number;
	error?: string;
}

export async function syncChallengeRegistrations(
	env: RunSignupEnvLike,
	opts: { raceId: number; eventIds: number[] },
): Promise<CompletionSyncResult> {
	const result = await syncChallengeRegistrationsInner(env, opts).catch(
		(e): CompletionSyncResult => ({
			ok: false, fetched: 0, inserted: 0, updated: 0,
			error: e instanceof Error ? e.message : String(e),
		}),
	);
	await recordSyncState(
		env.nwana_engine_db,
		`ads-truth:registrations:race:${opts.raceId}`,
		result,
		result.ok ? undefined : result.error,
	);
	return result;
}

async function syncChallengeRegistrationsInner(
	env: RunSignupEnvLike,
	opts: { raceId: number; eventIds: number[] },
): Promise<CompletionSyncResult> {
	const db = env.nwana_engine_db;
	let token: string;
	try {
		token = await resolveRunSignupAccessToken(env);
	} catch (e) {
		return { ok: false, fetched: 0, inserted: 0, updated: 0, error: e instanceof Error ? e.message : "OAuth token unavailable" };
	}
	if (opts.eventIds.length === 0) {
		return { ok: false, fetched: 0, inserted: 0, updated: 0, error: "no event IDs supplied" };
	}
	const PAGE_SIZE = 500;
	const MAX_PAGES = 10;
	const byRegistrationId = new Map<number, ParticipantRegistration>();
	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = new URL(`https://api.runsignup.com/rest/race/${opts.raceId}/participants`);
		url.searchParams.set("event_id", opts.eventIds.join(","));
		url.searchParams.set("results_per_page", String(PAGE_SIZE));
		url.searchParams.set("page", String(page));
		url.searchParams.set("format", "json");
		const res = await runSignupGetJson<unknown>(url, token);
		if (!res.ok) {
			return {
				ok: false, fetched: byRegistrationId.size, inserted: 0, updated: 0,
				error: res.api_error_msg || `RunSignup participants read failed (http ${res.http_status ?? "?"})`,
			};
		}
		const records = flattenParticipants(res.data);
		for (const rec of records) {
			const mapped = mapParticipantRegistration(rec);
			if (mapped) byRegistrationId.set(mapped.registration_id, mapped);
		}
		if (records.length < PAGE_SIZE) break;
	}

	const regs = [...byRegistrationId.values()];
	if (regs.length === 0) {
		return { ok: true, fetched: 0, inserted: 0, updated: 0 };
	}
	const existingIds = await fetchExistingIds(
		db, "challenge_registrations", "registration_id", regs.map((r) => r.registration_id),
	);
	const nowIso = new Date().toISOString();
	const statements = regs.map((r) =>
		db
			.prepare(
				`INSERT INTO challenge_registrations
					(registration_id, rsu_user_id, event_id, registration_date, first_seen_at, last_seen_at)
				 VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT(registration_id) DO UPDATE SET
					rsu_user_id = COALESCE(excluded.rsu_user_id, challenge_registrations.rsu_user_id),
					event_id = COALESCE(excluded.event_id, challenge_registrations.event_id),
					registration_date = COALESCE(excluded.registration_date, challenge_registrations.registration_date),
					last_seen_at = excluded.last_seen_at`,
			)
			.bind(r.registration_id, r.rsu_user_id, r.event_id, r.registration_date, nowIso, nowIso),
	);
	await runChunked(db, statements);
	const inserted = regs.filter((r) => !existingIds.has(r.registration_id)).length;
	return { ok: true, fetched: regs.length, inserted, updated: regs.length - inserted };
}

// ---------------------------------------------------------------------------
// 3b. Fundraiser first-seen watcher — polls the same get-race-fundraisers
// endpoint fundraiser-mine.ts consumes, race-wide.
// ---------------------------------------------------------------------------

export interface FundraiserSeen {
	fundraiser_id: string;
	owner_rsu_user_id: number | null;
	is_team: boolean;
	fundraiser_name: string | null;
}

/** Pure mapping from one raw race fundraiser record (exported for tests). */
export function mapFundraiserSeen(f: UnknownRecord): FundraiserSeen | null {
	const idRaw = f.race_fundraiser_id;
	if (idRaw === null || idRaw === undefined || String(idRaw).trim() === "") return null;
	const owner = asRecord(f.fundraiser_owner);
	return {
		fundraiser_id: String(idRaw),
		owner_rsu_user_id: intVal(owner?.user_id),
		is_team: f.is_team_fundraiser === "T",
		fundraiser_name:
			typeof f.race_fundraiser_name === "string" ? f.race_fundraiser_name.slice(0, 200) : null,
	};
}

export async function syncChallengeFundraisers(
	env: RunSignupEnvLike,
	opts: { raceId: number },
): Promise<CompletionSyncResult> {
	const result = await syncChallengeFundraisersInner(env, opts).catch(
		(e): CompletionSyncResult => ({
			ok: false, fetched: 0, inserted: 0, updated: 0,
			error: e instanceof Error ? e.message : String(e),
		}),
	);
	await recordSyncState(
		env.nwana_engine_db,
		`ads-truth:fundraisers:race:${opts.raceId}`,
		result,
		result.ok ? undefined : result.error,
	);
	return result;
}

async function syncChallengeFundraisersInner(
	env: RunSignupEnvLike,
	opts: { raceId: number },
): Promise<CompletionSyncResult> {
	const db = env.nwana_engine_db;
	let token: string;
	try {
		token = await resolveRunSignupAccessToken(env);
	} catch (e) {
		return { ok: false, fetched: 0, inserted: 0, updated: 0, error: e instanceof Error ? e.message : "OAuth token unavailable" };
	}
	const apiUrl = new URL(
		"https://api.runsignup.com/rest/v2/race-fundraisers/get-race-fundraisers.json",
	);
	apiUrl.searchParams.set("race_id", String(opts.raceId));
	apiUrl.searchParams.set("included_fundraiser_types", "any");
	apiUrl.searchParams.set("include_amount_raised", "T");
	apiUrl.searchParams.set("include_number_of_donations", "T");
	apiUrl.searchParams.set("num", "500");
	const res = await runSignupGetJson<{ race_fundraisers?: unknown }>(apiUrl, token);
	if (!res.ok) {
		return {
			ok: false, fetched: 0, inserted: 0, updated: 0,
			error: res.api_error_msg || `RunSignup fundraisers read failed (http ${res.http_status ?? "?"})`,
		};
	}
	const rawList = Array.isArray(res.data?.race_fundraisers) ? res.data.race_fundraisers : [];
	const seen: FundraiserSeen[] = [];
	for (const raw of rawList) {
		const rec = asRecord(raw);
		if (!rec) continue;
		const mapped = mapFundraiserSeen(rec);
		if (mapped) seen.push(mapped);
	}
	if (seen.length === 0) return { ok: true, fetched: 0, inserted: 0, updated: 0 };

	const existingIdsRaw = await fetchExistingIds(
		db, "challenge_fundraisers", "fundraiser_id", seen.map((f) => f.fundraiser_id),
	);
	const existingIds = new Set([...existingIdsRaw].map((v) => String(v)));
	const nowIso = new Date().toISOString();
	const statements = seen.map((f) =>
		db
			.prepare(
				`INSERT INTO challenge_fundraisers
					(fundraiser_id, owner_rsu_user_id, is_team, fundraiser_name, first_seen_at, last_seen_at)
				 VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT(fundraiser_id) DO UPDATE SET
					owner_rsu_user_id = COALESCE(excluded.owner_rsu_user_id, challenge_fundraisers.owner_rsu_user_id),
					fundraiser_name = COALESCE(excluded.fundraiser_name, challenge_fundraisers.fundraiser_name),
					last_seen_at = excluded.last_seen_at`,
			)
			.bind(f.fundraiser_id, f.owner_rsu_user_id, f.is_team ? 1 : 0, f.fundraiser_name, nowIso, nowIso),
	);
	await runChunked(db, statements);
	const inserted = seen.filter((f) => !existingIds.has(f.fundraiser_id)).length;
	return { ok: true, fetched: seen.length, inserted, updated: seen.length - inserted };
}

// ---------------------------------------------------------------------------
// 4. Conversion outbox builder. Donation dedup: one RunSignup donation can
// produce BOTH a donation_received and a fundraiser_donation_received
// money_events row; the outbox key derives from source_ref
// ("race:216323/donation:<id>") so both collapse into one row.
// ---------------------------------------------------------------------------

export interface OutboxBuildResult {
	registrations: number;
	fundraisers: number;
	donations: number;
	rematched: number;
	datesRepaired: number;
}

export async function buildConversionOutbox(
	db: D1Database,
	raceId: number = ADS_CHALLENGE_RACE_ID,
): Promise<OutboxBuildResult> {
	let result: OutboxBuildResult;
	try {
		result = await buildConversionOutboxInner(db, raceId);
	} catch (e) {
		await recordSyncState(
			db, "ads-truth:outbox", { ok: false },
			e instanceof Error ? e.message : String(e),
		);
		throw e;
	}
	await recordSyncState(db, "ads-truth:outbox", result);
	return result;
}

async function buildConversionOutboxInner(
	db: D1Database,
	raceId: number = ADS_CHALLENGE_RACE_ID,
): Promise<OutboxBuildResult> {
	const regRes = await db
		.prepare(
			`INSERT OR IGNORE INTO ads_conversion_outbox
				(event_key, ads_action, click_id, click_kind, rsu_user_id, occurred_at, value_cents, currency, status)
			 SELECT 'registration:' || cr.registration_id, 'registration',
				b.click_id, COALESCE(c.kind, 'gclid'), cr.rsu_user_id,
				COALESCE(cr.registration_date, cr.first_seen_at), NULL, 'USD',
				CASE WHEN b.click_id IS NOT NULL THEN 'pending' ELSE 'unmatched' END
			 FROM challenge_registrations cr
			 LEFT JOIN ad_click_bindings b ON b.rsu_user_id = cr.rsu_user_id
			 LEFT JOIN ad_clicks c ON c.click_id = b.click_id`,
		)
		.run();
	const fundRes = await db
		.prepare(
			`INSERT OR IGNORE INTO ads_conversion_outbox
				(event_key, ads_action, click_id, click_kind, rsu_user_id, occurred_at, value_cents, currency, status)
			 SELECT 'fundraiser:' || cf.fundraiser_id, 'fundraiser',
				b.click_id, COALESCE(c.kind, 'gclid'), cf.owner_rsu_user_id,
				cf.first_seen_at, NULL, 'USD',
				CASE WHEN b.click_id IS NOT NULL THEN 'pending' ELSE 'unmatched' END
			 FROM challenge_fundraisers cf
			 LEFT JOIN ad_click_bindings b ON b.rsu_user_id = cf.owner_rsu_user_id
			 LEFT JOIN ad_clicks c ON c.click_id = b.click_id`,
		)
		.run();
	const prefix = `race:${raceId}/donation:`;
	const donRes = await db
		.prepare(
			`INSERT OR IGNORE INTO ads_conversion_outbox
				(event_key, ads_action, click_id, click_kind, rsu_user_id, occurred_at, value_cents, currency, status)
			 SELECT 'donation:runsignup:' || substr(me.source_ref, ?), 'donation',
				b.click_id, COALESCE(c.kind, 'gclid'), cf.owner_rsu_user_id,
				me.occurred_at,
				CASE WHEN me.gross_status = 'VERIFIED' THEN me.gross_cents ELSE NULL END,
				'USD',
				CASE WHEN b.click_id IS NOT NULL THEN 'pending' ELSE 'unmatched' END
			 FROM money_events me
			 LEFT JOIN challenge_fundraisers cf ON cf.fundraiser_id = me.fundraiser_id
			 LEFT JOIN ad_click_bindings b ON b.rsu_user_id = cf.owner_rsu_user_id
			 LEFT JOIN ad_clicks c ON c.click_id = b.click_id
			 WHERE me.source_system = 'runsignup'
				AND me.event_type IN ('donation_received', 'fundraiser_donation_received')
				AND me.source_ref LIKE ?
				AND me.occurred_at IS NOT NULL`,
		)
		.bind(prefix.length + 1, `${prefix}%`)
		.run();
	// Re-match pass: rows that were unmatched may have gained a join since
	// (a late binding, or a fundraiser first seen after the donation landed).
	const rematchRes = await db
		.prepare(
			`UPDATE ads_conversion_outbox
			 SET click_id = (SELECT b.click_id FROM ad_click_bindings b
					WHERE b.rsu_user_id = ads_conversion_outbox.rsu_user_id),
				click_kind = COALESCE(
					(SELECT c.kind FROM ad_click_bindings b
						JOIN ad_clicks c ON c.click_id = b.click_id
						WHERE b.rsu_user_id = ads_conversion_outbox.rsu_user_id),
					click_kind),
				status = 'pending',
				updated_at = datetime('now')
			 WHERE status = 'unmatched'
				AND rsu_user_id IS NOT NULL
				AND EXISTS (SELECT 1 FROM ad_click_bindings b
					WHERE b.rsu_user_id = ads_conversion_outbox.rsu_user_id)`,
		)
		.run();
	// Date repair: registrations first persisted before their true
	// registration_date was known carry first_seen_at as occurred_at.
	// Once the true date is known, correct not-yet-uploaded rows so the
	// upload reports the real completion time.
	const repairRes = await db
		.prepare(
			`UPDATE ads_conversion_outbox
			 SET occurred_at = (SELECT cr.registration_date FROM challenge_registrations cr
					WHERE cr.registration_id = CAST(substr(ads_conversion_outbox.event_key, 14) AS INTEGER)),
				updated_at = datetime('now')
			 WHERE ads_action = 'registration'
				AND status = 'unmatched'
				AND EXISTS (SELECT 1 FROM challenge_registrations cr
					WHERE cr.registration_id = CAST(substr(ads_conversion_outbox.event_key, 14) AS INTEGER)
						AND cr.registration_date IS NOT NULL
						AND cr.registration_date <> ads_conversion_outbox.occurred_at)`,
		)
		.run();
	return {
		registrations: regRes.meta.changes ?? 0,
		fundraisers: fundRes.meta.changes ?? 0,
		donations: donRes.meta.changes ?? 0,
		rematched: rematchRes.meta.changes ?? 0,
		datesRepaired: repairRes.meta.changes ?? 0,
	};
}

// ---------------------------------------------------------------------------
// 5. Daily upload. Resolves the three Import conversion actions BY NAME;
// missing actions are reported precisely (never a crash) and their rows
// stay pending. Partial failure is written back per row.
// ---------------------------------------------------------------------------

export interface UploadSummary {
	ok: boolean;
	uploaded: number;
	failed: number;
	expired: number;
	skippedNoAction: number;
	/** Verbatim action names that do not exist in the Ads account (yet). */
	notFound: string[];
	error?: string;
}

interface PendingRow {
	event_key: string;
	ads_action: AdsActionKey;
	click_id: string;
	click_kind: string | null;
	occurred_at: string;
	value_cents: number | null;
	currency: string;
}

export async function uploadPendingConversions(
	env: GoogleAdsEnv,
): Promise<UploadSummary> {
	const db = env.nwana_engine_db;
	const summary: UploadSummary = {
		ok: true, uploaded: 0, failed: 0, expired: 0, skippedNoAction: 0, notFound: [],
	};

	// Expire rows whose click has aged out of Google's 90-day window.
	const expireRes = await db
		.prepare(
			`UPDATE ads_conversion_outbox
			 SET status = 'expired',
				last_error = 'click older than 90 days at upload time (Google import window)',
				updated_at = datetime('now')
			 WHERE status = 'pending'
				AND click_id IN (SELECT click_id FROM ad_clicks
					WHERE first_seen_at < datetime('now', '-${CLICK_WINDOW_DAYS} days'))`,
		)
		.run();
	summary.expired += expireRes.meta.changes ?? 0;

	const actionsRes = await getConversionActions(env);
	if (!actionsRes.ok) {
		summary.ok = false;
		summary.error = actionsRes.error ?? "conversion action lookup failed";
		await recordSyncState(db, "ads-truth:upload", summary, summary.error);
		return summary;
	}
	const idByName = new Map<string, string>();
	for (const a of actionsRes.conversion_actions) idByName.set(a.name, a.id);
	const idByAction = new Map<AdsActionKey, string>();
	for (const key of Object.keys(ADS_CONVERSION_ACTION_NAMES) as AdsActionKey[]) {
		const name = ADS_CONVERSION_ACTION_NAMES[key];
		const id = idByName.get(name);
		if (id) idByAction.set(key, id);
		else summary.notFound.push(name);
	}
	for (const name of summary.notFound) {
		console.log(
			`[ads-upload] conversion action not found: "${name}" — create it in Google Ads as an Import (UPLOAD_CLICKS) action; its outbox rows stay pending`,
		);
	}

	const pendingRes = await db
		.prepare(
			`SELECT event_key, ads_action, click_id, click_kind, occurred_at, value_cents, currency
			 FROM ads_conversion_outbox
			 WHERE status = 'pending' AND click_id IS NOT NULL
			 ORDER BY occurred_at ASC
			 LIMIT 2000`,
		)
		.all<PendingRow>();
	const rows = (pendingRes.results ?? []).filter((r) => {
		if (idByAction.has(r.ads_action)) return true;
		summary.skippedNoAction += 1;
		return false;
	});

	for (let i = 0; i < rows.length; i += UPLOAD_BATCH_LIMIT) {
		const chunk = rows.slice(i, i + UPLOAD_BATCH_LIMIT);
		const conversions = chunk.map((r) => {
			const conv: {
				conversionAction: string;
				gclid?: string;
				gbraid?: string;
				wbraid?: string;
				conversionDateTime: string;
				conversionValue?: number;
				currencyCode: string;
				orderId: string;
			} = {
				conversionAction: `customers/${GOOGLE_ADS_LIVE_CUSTOMER_ID}/conversionActions/${idByAction.get(r.ads_action)}`,
				conversionDateTime: toAdsDateTime(r.occurred_at),
				currencyCode: r.currency || "USD",
				orderId: r.event_key,
			};
			if (r.click_kind === "gbraid") conv.gbraid = r.click_id;
			else if (r.click_kind === "wbraid") conv.wbraid = r.click_id;
			else conv.gclid = r.click_id;
			if (r.value_cents !== null && r.value_cents !== undefined) {
				conv.conversionValue = r.value_cents / 100;
			}
			return conv;
		});
		let failures: Array<{ index: number; message: string; errorCode: string }> = [];
		try {
			const result = await uploadClickConversions(
				env,
				GOOGLE_ADS_LIVE_CUSTOMER_ID,
				conversions,
			);
			failures = result.failures;
		} catch (e) {
			// Whole-request failure: count attempts, keep rows pending.
			const msg = e instanceof Error ? e.message : "upload request failed";
			await runChunked(db, chunk.map((r) =>
				db.prepare(
					`UPDATE ads_conversion_outbox
					 SET attempts = attempts + 1, last_error = ?, updated_at = datetime('now')
					 WHERE event_key = ?`,
				).bind(msg.slice(0, 500), r.event_key),
			));
			summary.failed += chunk.length;
			summary.ok = false;
			summary.error = msg;
			continue;
		}
		const failedIdx = new Map(failures.map((f) => [f.index, f]));
		const statements: D1PreparedStatement[] = [];
		chunk.forEach((r, idx) => {
			const failure = failedIdx.get(idx);
			if (!failure) {
				summary.uploaded += 1;
				statements.push(
					db.prepare(
						`UPDATE ads_conversion_outbox
						 SET status = 'uploaded', uploaded_at = datetime('now'),
							attempts = attempts + 1, last_error = NULL, updated_at = datetime('now')
						 WHERE event_key = ?`,
					).bind(r.event_key),
				);
			} else {
				const expiredClick =
					/EXPIRED_CLICK|TOO_OLD|OLDER_THAN/i.test(failure.errorCode) ||
					/too old|expired/i.test(failure.message);
				if (expiredClick) summary.expired += 1;
				else summary.failed += 1;
				statements.push(
					db.prepare(
						`UPDATE ads_conversion_outbox
						 SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = datetime('now')
						 WHERE event_key = ?`,
					).bind(
						expiredClick ? "expired" : "pending",
						`${failure.message} [${failure.errorCode}]`.slice(0, 500),
						r.event_key,
					),
				);
			}
		});
		await runChunked(db, statements);
	}
	await recordSyncState(db, "ads-truth:upload", summary, summary.error);
	return summary;
}
