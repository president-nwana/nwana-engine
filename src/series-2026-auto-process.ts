// NWANA Engine — Series 2026 autonomous downstream processing (ADR-0042).
//
// After the owner approves an athlete's result, the Machine owns the whole
// standard downstream lifecycle. This module:
//   1. evaluates the per-event trigger (all expected results approved OR
//      submission deadline reached);
//   2. runs the full chain: write-access pre-flight -> results sync ->
//      levels apply -> results sync -> publication (Meta + winner news +
//      next-race promo);
//   3. derives the per-athlete pipeline view (Registered -> Submitted ->
//      Approved -> Processed -> Published).
//
// Human boundary (hard): this module NEVER creates an approval. Approvals
// come only from two owner-controlled sources:
//   ENGINE   — series_result_approvals, written by the owner's explicit
//              action (OC button or recorded owner statement);
//   RUNSIGNUP — the owner's approval inside the RunSignup dashboard
//              (RaceDay Tools -> Virtual/Challenge Results -> Approve
//              Results). RunSignup exposes no approval-status field on any
//              read API; but with "Require race director approval" enabled,
//              unapproved results are excluded from public results, so
//              presence in get-results IS the approval (presence signal).
// Any real blocker becomes an exception for the owner, never a silent skip.

import {
	allResultsApproved,
	getEventApprovals,
} from "./series-2026-approvals";
import { getEventDisqualifications } from "./series-2026-decisions";
import {
	applySeries2026Levels,
	applyTriggerEventLevels,
	AUTO_APPROVED_CONFIRMATION,
} from "./series-2026-apply";
import {
	RACE_LIFECYCLE_SERIES,
	syncRaceLifecycleDistance,
	testSeries2026WriteAccess,
	type LifecycleResultRow,
} from "./race-lifecycle";
import { syncSeries2026Registrations } from "./series-2026-registrations";
import { previewSeries2026ResultPublications } from "./series-2026-results";
import { getSeries2026ResultCard } from "./series-2026-result-card";
import { executeResultPublication } from "./result-publication-core";
import { refreshAllAthleteStats } from "./athletes";

export interface AutoProcessEnv {
	db: D1Database;
	accessToken: string;
	metaToken?: string;
	apiCallerToken?: string;
	apiCallerSecret?: string;
	publicBaseUrl: string;
}

export interface LiveEventResult {
	result_id: string;
	athlete: string;
	gender: string | null;
	time: string | null;
}

export interface EventRegistration {
	registration_id: string;
	user_id: string;
	first_name: string;
	last_name: string;
	status: string;
}

interface UnknownRecord {
	[key: string]: unknown;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * RunSignup returns result_id as a JSON number in get-results; the Engine
 * uses string ids everywhere (D1, approvals, comparisons). Normalize at
 * ingestion so live ids match D1 approval ids. Without this, every live
 * row is silently dropped and the presence signal can never fire.
 */
function resultIdText(value: unknown): string | null {
	const s = text(value);
	if (s) return s;
	return typeof value === "number" && Number.isInteger(value) ? String(value) : null;
}

async function runSignupGet(
	url: URL,
	accessToken: string,
): Promise<UnknownRecord> {
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`RunSignup request failed: ${response.status} for ${url.pathname} :: ${body.slice(0, 300)}`,
		);
	}
	const data = (await response.json()) as UnknownRecord;
	// RunSignup returns HTTP 200 with an error payload for auth failures
	// (e.g. error_code 6 "Key authentication failed"). Treat that as an
	// error, not an empty result set.
	const err = data.error as Record<string, unknown> | undefined;
	if (err && typeof err === "object") {
		const code = Number((err as Record<string, unknown>).error_code);
		const msg =
			typeof (err as Record<string, unknown>).error_msg === "string"
				? ((err as Record<string, unknown>).error_msg as string)
				: "Unknown RunSignup API error";
		if (code === 6 || code === 13 || code === 17) {
			throw new Error(
				`RunSignup AUTH_FAILED (error_code ${code}): ${msg}. OAuth re-authorization required.`,
			);
		}
		throw new Error(
			`RunSignup API error (error_code ${Number.isInteger(code) ? code : "?"}): ${msg}`,
		);
	}
	return data;
}

/**
 * Live results for one event (all result sets). Read-only.
 * If get-result-sets discovery fails (RunSignup 522 flakiness), falls back
 * to the provided knownSetIds.
 */
export async function fetchLiveEventResults(
	accessToken: string,
	raceId: number,
	eventId: number,
	knownSetIds?: number[],
): Promise<LiveEventResult[]> {
	const out: LiveEventResult[] = [];
	let setIds: number[] = [];
	try {
		const setsUrl = new URL(
			`https://api.runsignup.com/rest/race/${raceId}/results/get-result-sets`,
		);
		setsUrl.searchParams.set("format", "json");
		setsUrl.searchParams.set("event_id", String(eventId));
		const setsData = await runSignupGet(setsUrl, accessToken);
		const sets = Array.isArray(setsData.individual_results_sets)
			? (setsData.individual_results_sets as UnknownRecord[])
			: [];
		setIds = sets
			.map((s) => Number(s.individual_result_set_id))
			.filter((id) => Number.isInteger(id));
	} catch (error) {
		// Discovery failed (e.g. 522). Fall back to known set IDs if provided.
		if (!knownSetIds?.length) throw error;
		setIds = knownSetIds;
	}
	if (!setIds.length && knownSetIds?.length) {
		setIds = knownSetIds;
	}
	for (const resultSetId of setIds) {
		const resultsUrl = new URL(
			`https://api.runsignup.com/rest/race/${raceId}/results/get-results`,
		);
		resultsUrl.searchParams.set("format", "json");
		resultsUrl.searchParams.set("event_id", String(eventId));
		resultsUrl.searchParams.set("individual_result_set_id", String(resultSetId));
		resultsUrl.searchParams.set("results_per_page", "1000");
		const resultsData = await runSignupGet(resultsUrl, accessToken);
		const resultSets = Array.isArray(resultsData.individual_results_sets)
			? (resultsData.individual_results_sets as UnknownRecord[])
			: [];
		const rows = Array.isArray(resultSets[0]?.results)
			? (resultSets[0]?.results as UnknownRecord[])
			: [];
		for (const row of rows) {
			const resultId = resultIdText(row.result_id);
			if (!resultId) continue;
			out.push({
				result_id: resultId,
				athlete: [text(row.first_name), text(row.last_name)]
					.filter(Boolean)
					.join(" "),
				gender: text(row.gender),
				time: text(row.chip_time) ?? text(row.clock_time),
			});
		}
	}
	return out;
}

/**
 * Where an approval came from. ENGINE = explicit owner approval recorded
 * in D1 series_result_approvals (OC button / recorded owner statement).
 * RUNSIGNUP = the owner's approval inside the RunSignup dashboard, seen
 * via the presence signal (see fetchResultsRequireApproval).
 */
export type ApprovalSource = "RUNSIGNUP" | "ENGINE";

/**
 * Read the race's "Require race director approval" virtual-results setting
 * (vr-settings.json, same endpoint family fetchSubmissionDeadline uses).
 *
 * Returns true/false, or null when the API is unreachable or the field is
 * absent — fail closed: callers must then rely on Engine D1 approvals only.
 *
 * Why this matters: RunSignup exposes the approval status of a virtual
 * result on NO read API (result_approval_ts exists only in a POST response
 * example). But with this setting enabled, unapproved results are excluded
 * from public results — so a result returned by get-results is
 * owner-approved by definition (presence signal).
 */
export async function fetchResultsRequireApproval(
	accessToken: string,
	raceId: number,
	eventId: number,
): Promise<boolean | null> {
	const url = new URL("https://api.runsignup.com/rest/v2/vr-settings.json");
	url.searchParams.set("format", "json");
	url.searchParams.set("race_id", String(raceId));
	url.searchParams.set("event_id", String(eventId));
	try {
		const data = await runSignupGet(url, accessToken);
		const settings = data.virtual_result_settings as UnknownRecord | undefined;
		const raw = settings?.results_require_approval;
		if (raw === "T" || raw === "1" || raw === 1 || raw === true) return true;
		if (raw === "F" || raw === "0" || raw === 0 || raw === false) return false;
		return null;
	} catch {
		// 522 flakiness etc. — fail closed to D1 approvals only.
		return null;
	}
}

/**
 * Official submission deadline for a virtual event, from the RunSignup API
 * (Get Virtual Event Result Settings). Returns an ISO timestamp or null
 * when the API reports no window. Never guessed, never hardcoded.
 */
export async function fetchSubmissionDeadline(
	db: D1Database,
	accessToken: string,
	distance: string,
	raceId: number,
	eventId: number,
): Promise<{ deadline: string | null; source: string }> {
	// D1 first: use cached deadline if available. The RunSignup API is
	// unreliable (522 timeouts); don't hang the request on it.
	const cached = await db
		.prepare(
			`SELECT submission_deadline, deadline_source FROM series_event_deadlines
			 WHERE series = ? AND distance = ? AND event_id = ?`,
		)
		.bind(RACE_LIFECYCLE_SERIES, distance, eventId)
		.first<{ submission_deadline: string | null; deadline_source: string | null }>();
	if (cached?.submission_deadline) {
		return { deadline: cached.submission_deadline, source: (cached.deadline_source ?? "") + " (cached)" };
	}
	const url = new URL("https://api.runsignup.com/rest/v2/vr-settings.json");
	url.searchParams.set("format", "json");
	url.searchParams.set("race_id", String(raceId));
	url.searchParams.set("event_id", String(eventId));
	let deadline: string | null = null;
	let source = "vr-settings.json: no accept_results_end_ts reported";
	try {
		const data = await runSignupGet(url, accessToken);
		const settings = data.virtual_result_settings as UnknownRecord | undefined;
		const endTs = Number(settings?.accept_results_end_ts);
		if (Number.isFinite(endTs) && endTs > 0) {
			deadline = new Date(endTs * 1000).toISOString();
			source = "vr-settings.json accept_results_end_ts";
		}
	} catch (error) {
		source = `vr-settings.json error: ${error instanceof Error ? error.message : "unknown"}`;
	}
	await db
		.prepare(
			`INSERT INTO series_event_deadlines
				(series, distance, race_id, event_id, submission_deadline, deadline_source, checked_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (series, distance, event_id) DO UPDATE SET
				submission_deadline = excluded.submission_deadline,
				deadline_source = excluded.deadline_source,
				checked_at = excluded.checked_at`,
		)
		.bind(
			RACE_LIFECYCLE_SERIES,
			distance,
			raceId,
			eventId,
			deadline,
			source,
			new Date().toISOString(),
		)
		.run();
	return { deadline, source };
}

/** Active registrations for one event. Syncs from RunSignup first when empty. */
export async function getEventRegistrations(
	env: AutoProcessEnv,
	raceId: number,
	eventId: number,
): Promise<EventRegistration[]> {
	const rows = await env.db
		.prepare(
			`SELECT registration_id, user_id, first_name, last_name, status
			 FROM series_registrations WHERE race_id = ? AND event_id = ?`,
		)
		.bind(raceId, eventId)
		.all<EventRegistration>();
	// Do NOT auto-sync from the RunSignup API here. The participants endpoint
	// has never returned data in production (and currently 522s). An empty
	// D1 table means "unknown", not "zero registered" — decideTrigger already
	// handles that correctly. Trying to sync would just hang the request.
	return rows.results.filter(
		(row) => (row.status ?? "").toLowerCase() === "active",
	);
}

export type TriggerReason =
	| "all_approved"
	| "deadline_reached"
	| "waiting"
	| "exception";

export interface TriggerInputs {
	registrations: EventRegistration[];
	results: LiveEventResult[];
	approvedResultIds: string[];
	/** Result ids the owner explicitly disqualified. Decided: need no
	 * approval, give 0 points, never block the trigger. */
	disqualifiedResultIds?: string[];
	deadline: string | null;
	now?: number;
}

/**
 * Pure trigger decision (ADR-0042, ADR-0043). No I/O: given the facts, decide
 * whether the Machine may run the downstream lifecycle.
 *
 * Fire when:
 *   A. every submitted result is decided (approved, or explicitly
 *      disqualified) AND every active registration has a submitted result; or
 *   B. the official submission deadline passed AND at least one result is
 *      approved (the rest become exceptions).
 * A result with no owner decision stays Submitted and blocks A.
 * Never fire when a result comes from an athlete with no active
 * registration — that is an owner exception, not an auto-process case —
 * but only when registration data is actually present. An empty
 * registration list means "unknown", not "unregistered".
 */
export function decideTrigger(input: TriggerInputs): {
	fire: boolean;
	reason: TriggerReason;
	detail: string;
	missingSubmissions: string[];
	unapprovedResults: LiveEventResult[];
	unregisteredResults: LiveEventResult[];
} {
	const now = input.now ?? Date.now();
	const approved = new Set(input.approvedResultIds);
	const disqualified = new Set(input.disqualifiedResultIds ?? []);
	const regNames = new Set(
		input.registrations.map((r) =>
			`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim().toLowerCase(),
		),
	);
	const resultNames = new Set(input.results.map((r) => r.athlete.toLowerCase()));
	const missingSubmissions = input.registrations
		.filter(
			(r) =>
				!resultNames.has(`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim().toLowerCase()),
		)
		.map((r) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim());
	const unapprovedResults = input.results.filter(
		(r) => !approved.has(r.result_id) && !disqualified.has(r.result_id),
	);
	// Unregistered-athlete exception only applies when we actually HAVE
	// registration data. An empty registration list means "unknown" (the
	// RunSignup participants feed has never returned data in production),
	// not "zero registered athletes". Blocking on unknown data would freeze
	// every event forever; the owner's approval is the verification.
	const unregisteredResults = input.registrations.length > 0
		? input.results.filter(
			(r) => r.athlete && !regNames.has(r.athlete.toLowerCase()),
		)
		: [];

	if (unregisteredResults.length > 0) {
		return {
			fire: false,
			reason: "exception",
			detail: `Results from unregistered athletes need owner review: ${unregisteredResults.map((r) => r.athlete).join(", ")}`,
			missingSubmissions,
			unapprovedResults,
			unregisteredResults,
		};
	}
	if (
		input.results.length > 0 &&
		unapprovedResults.length === 0 &&
		missingSubmissions.length === 0
	) {
		const decided = input.results.length;
		return {
			fire: true,
			reason: "all_approved",
			detail: `All ${decided} submitted results are decided (approved${disqualified.size > 0 ? `, ${disqualified.size} disqualified` : ""}) and every registered athlete submitted.`,
			missingSubmissions,
			unapprovedResults,
			unregisteredResults,
		};
	}
	if (input.deadline && now >= Date.parse(input.deadline)) {
		if (approved.size === 0) {
			return {
				fire: false,
				reason: "exception",
				detail: "Submission deadline passed with no approved results; nothing safe to process.",
				missingSubmissions,
				unapprovedResults,
				unregisteredResults,
			};
		}
		return {
			fire: true,
			reason: "deadline_reached",
			detail: `Deadline ${input.deadline} passed. Processing ${approved.size} approved results; ${missingSubmissions.length} missing submissions and ${unapprovedResults.length} unapproved results are exceptions.`,
			missingSubmissions,
			unapprovedResults,
			unregisteredResults,
		};
	}
	return {
		fire: false,
		reason: "waiting",
		detail: `Waiting: ${missingSubmissions.length} registered athletes without results, ${unapprovedResults.length} results not yet approved${input.deadline ? `, deadline ${input.deadline}` : ", no deadline reported"}.`,
		missingSubmissions,
		unapprovedResults,
		unregisteredResults,
	};
}

export interface TriggerEvaluation {
	fire: boolean;
	reason: TriggerReason;
	detail: string;
	registrations: EventRegistration[];
	results: LiveEventResult[];
	approvedResultIds: string[];
	/** Per-result approval source: RUNSIGNUP (presence signal) or ENGINE (D1). */
	approvalSources: Record<string, ApprovalSource>;
	disqualifiedResultIds: string[];
	missingSubmissions: string[];
	unapprovedResults: LiveEventResult[];
	unregisteredResults: LiveEventResult[];
	deadline: string | null;
	deadlineSource: string;
}

/**
 * Evaluate the ADR-0042 trigger for one event:
 * fire when all expected results are approved, or when the submission
 * deadline has passed (approved results proceed; the rest are exceptions).
 */
export async function evaluateEventTrigger(
	env: AutoProcessEnv,
	input: { distance: string; raceId: number; eventId: number },
): Promise<TriggerEvaluation> {
	const { db } = env;
	const registrations = await getEventRegistrations(env, input.raceId, input.eventId);
	const approvals = await getEventApprovals(db, input.distance, input.eventId);
	let liveResults: LiveEventResult[];
	if (approvals.size > 0) {
		// Owner approvals exist in D1 — skip the unreliable RunSignup API entirely.
		// The owner's approval is the verification; the API adds nothing.
		liveResults = [];
	} else {
		try {
			liveResults = await fetchLiveEventResults(env.accessToken, input.raceId, input.eventId);
		} catch (error) {
			// RunSignup API failure (e.g. 522 timeout) — fall back to D1 approvals below.
			console.error("fetchLiveEventResults failed, using D1 approvals fallback:", error instanceof Error ? error.message : error);
			liveResults = [];
		}
	}
	// RUNSIGNUP presence signal: when the race requires director approval,
	// every result returned by get-results is owner-approved by definition
	// (RunSignup excludes unapproved results from public results). Read-only
	// and idempotent: identical API data always yields the identical
	// decision. No D1 rows are written for these approvals — the source is
	// recorded in approvalSources instead.
	const runsignupApprovedIds = new Set<string>();
	if (approvals.size === 0 && liveResults.length > 0) {
		const requireApproval = await fetchResultsRequireApproval(
			env.accessToken,
			input.raceId,
			input.eventId,
		);
		if (requireApproval === true) {
			for (const r of liveResults) runsignupApprovedIds.add(r.result_id);
		}
		// requireApproval false/null -> old behavior: D1 approvals only.
	}
	// If the authenticated RunSignup API returns no results but the
	// owner has recorded approvals in D1 (verified against the public API at
	// approval time), use the D1 approvals as the results list. The owner's
	// approval is the verification; an empty live fetch means "API returned
	// nothing", not "no results exist".
	const results = liveResults.length > 0
		? liveResults
		: Array.from(approvals.values()).map((a) => ({
			result_id: a.resultId,
			athlete: a.athlete ?? `Result ${a.resultId}`,
			gender: null as string | null,
			time: a.time ?? null,
		}));
	const approvedResultIds = results
		.filter((r) => approvals.has(r.result_id) || runsignupApprovedIds.has(r.result_id))
		.map((r) => r.result_id);
	const approvalSources: Record<string, ApprovalSource> = {};
	for (const r of results) {
		if (approvals.has(r.result_id)) approvalSources[r.result_id] = "ENGINE";
		else if (runsignupApprovedIds.has(r.result_id)) approvalSources[r.result_id] = "RUNSIGNUP";
	}
	const disqualifications = await getEventDisqualifications(db, input.distance, input.eventId);
	const disqualifiedResultIds = results
		.filter((r) => disqualifications.has(r.result_id))
		.map((r) => r.result_id);

	const { deadline, source } = await fetchSubmissionDeadline(
		db,
		env.accessToken,
		input.distance,
		input.raceId,
		input.eventId,
	);

	const decision = decideTrigger({
		registrations,
		results,
		approvedResultIds,
		disqualifiedResultIds,
		deadline,
	});

	return {
		...decision,
		registrations,
		results,
		approvedResultIds,
		approvalSources,
		disqualifiedResultIds,
		deadline,
		deadlineSource: source,
	};
}

export interface AutoProcessStepOutcome {
	step: string;
	status: "ok" | "skipped" | "failed";
	detail: string;
}

export interface AutoProcessResult {
	ok: boolean;
	distance: string;
	eventId: number;
	trigger: TriggerReason;
	steps: AutoProcessStepOutcome[];
	error?: string;
}

async function logAutoStep(
	db: D1Database,
	input: { distance: string; raceId: number; eventId: number; trigger: string },
	step: string,
	status: string,
	detail: string,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO series_auto_process_log
				(series, distance, race_id, event_id, trigger, step, status, detail)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			RACE_LIFECYCLE_SERIES,
			input.distance,
			input.raceId,
			input.eventId,
			input.trigger,
			step,
			status,
			detail,
		)
		.run();
}

/**
 * Run the full standard downstream lifecycle for one event after the
 * trigger fired. Every step is audit-logged; any failure stops the chain
 * and is reported as an owner exception.
 */
export async function autoProcessEvent(
	env: AutoProcessEnv,
	input: { distance: string; raceId: number; eventId: number; trigger: TriggerEvaluation },
): Promise<AutoProcessResult> {
	const { db } = env;
	const logInput = {
		distance: input.distance,
		raceId: input.raceId,
		eventId: input.eventId,
		trigger: input.trigger.reason,
	};
	const steps: AutoProcessStepOutcome[] = [];
	const push = async (step: string, status: "ok" | "skipped" | "failed", detail: string) => {
		steps.push({ step, status, detail });
		await logAutoStep(db, logInput, step, status, detail);
	};
	const fail = async (step: string, detail: string): Promise<AutoProcessResult> => {
		await push(step, "failed", detail);
		return { ok: false, distance: input.distance, eventId: input.eventId, trigger: input.trigger.reason, steps, error: detail };
	};

	// Step 0: trigger authorization audit. Records WHY this run may proceed:
	// the trigger reason plus the approval source of every authorizing
	// result (RUNSIGNUP = presence in get-results with
	// results_require_approval=T; ENGINE = explicit owner approval in D1
	// series_result_approvals). This is the audit trail for the approval
	// decision — no approval rows are invented here.
	const approvalSourceDetail = Object.entries(input.trigger.approvalSources ?? {})
		.map(([resultId, source]) => `${resultId}:${source}`)
		.join(", ");
	await push(
		"trigger",
		"ok",
		`reason=${input.trigger.reason}; approvals={${approvalSourceDetail || "none"}}; ${input.trigger.detail}`,
	);

	// Pre-flight: RunSignup write access (automatic probe, was an owner action).
	const lifecycleRow = await db
		.prepare(`SELECT write_access FROM race_lifecycle WHERE series = ? AND distance = ?`)
		.bind(RACE_LIFECYCLE_SERIES, input.distance)
		.first<{ write_access: string | null }>();
	if (lifecycleRow?.write_access !== "CONFIRMED") {
		const probe = await testSeries2026WriteAccess({
			db,
			accessToken: env.accessToken,
			distance: input.distance,
		});
		if (probe.write_access !== "CONFIRMED") {
			return fail("write_access_probe", `RunSignup write access is ${probe.write_access}: ${probe.detail}`);
		}
		await push("write_access_probe", "ok", probe.detail);
	} else {
		await push("write_access_probe", "skipped", "Write access already CONFIRMED.");
	}

	// Step 1: fresh results snapshot.
	try {
		await syncRaceLifecycleDistance({
			db,
			accessToken: env.accessToken,
			apiCallerToken: env.apiCallerToken,
			apiCallerSecret: env.apiCallerSecret,
			distance: input.distance,
		});
		await push("sync_results", "ok", "Lifecycle sync completed.");
	} catch (error) {
		return fail("sync_results", error instanceof Error ? error.message : "Sync failed");
	}

	// Step 2a: GUARANTEED trigger-event apply (Defect 2 fix). The chunked
	// distance rebuild below can return ok:true without touching the trigger
	// event in the current invocation (chunk cursor); the event must have
	// its levels + level places before any publication continues.
	//
	// Approval re-verification first: approvals must not have changed
	// mid-run. Disqualified results need no approval; they are excluded
	// from the approval check and from scoring (0 points).
	const decidableResultIds = input.trigger.results
		.map((r) => r.result_id)
		.filter((id) => !input.trigger.disqualifiedResultIds.includes(id));
	// The trigger may be authorized by the RUNSIGNUP presence signal (no D1
	// rows). Pass those ids so the re-verification accepts them; ENGINE
	// approvals are still re-read from D1 inside allResultsApproved, so a
	// mid-run revocation there still blocks the run.
	const runsignupApprovedNow = new Set(
		Object.entries(input.trigger.approvalSources ?? {})
			.filter(([, source]) => source === "RUNSIGNUP")
			.map(([resultId]) => resultId),
	);
	const approvedNow = await allResultsApproved(
		db,
		input.distance,
		input.eventId,
		decidableResultIds,
		runsignupApprovedNow,
	);
	if (!approvedNow) {
		return fail("verify_approvals", "Approvals changed mid-run; refusing to apply without a complete approval set.");
	}
	let triggerFinalizedRows: LifecycleResultRow[] = [];
	const triggerApply = await applyTriggerEventLevels({
		db,
		accessToken: env.accessToken,
		distance: input.distance,
		eventId: input.eventId,
		confirmation: AUTO_APPROVED_CONFIRMATION,
		disqualifiedResultIds: input.trigger.disqualifiedResultIds,
	});
	if (!triggerApply.ok) {
		// Idempotent retry: the trigger event was already processed (stage
		// "levels_computed" from a previous run). The Step-1 sync already
		// refreshed the D1 snapshot from the RunSignup custom fields, so
		// the snapshot is verified (not re-applied) in Step 3.
		const alreadyApplied = (triggerApply.error ?? "").includes('stage "levels_computed"');
		if (alreadyApplied) {
			await push("apply_levels", "ok", "Trigger event already levels_computed (idempotent skip); snapshot verified in sync_finalized.");
		} else {
			return fail("apply_levels", triggerApply.error ?? "Trigger event levels apply failed");
		}
	} else {
		triggerFinalizedRows = triggerApply.finalizedRows;
		await push("apply_levels", "ok", `Trigger event ${input.eventId}: levels + level places applied to ${triggerApply.result_count} result(s) (guaranteed before publish).`);
	}

	// Step 2b: distance-wide chunked rebuild (standings consistency, legacy
	// parity). The trigger event was already handled above; when this
	// rebuild's chunk reaches it, identical values are rewritten
	// idempotently.
	const applyResult = await applySeries2026Levels({
		db,
		accessToken: env.accessToken,
		distance: input.distance,
		eventId: input.eventId,
		confirmation: AUTO_APPROVED_CONFIRMATION,
		disqualifiedResultIds: input.trigger.disqualifiedResultIds,
	});
	if (!applyResult.ok) {
		// Idempotent retry: if levels were already applied (event in
		// "levels_computed" stage), skip the apply and continue to publish.
		// The D1 data is already correct; no need to re-apply.
		const alreadyApplied = (applyResult.error ?? "").includes('stage "levels_computed"');
		if (alreadyApplied) {
			await push("apply_levels", "ok", "Levels already applied (idempotent skip); continuing to publish.");
		} else {
			return fail("apply_levels", applyResult.error ?? "Levels apply failed");
		}
	} else {
		await push("apply_levels", "ok", `Applied to ${applyResult.result_count} results; standings rebuilt.`);
	}

	// Step 3: mark the event as levels_computed in the lifecycle state.
	// A full syncRaceLifecycleDistance would exceed Cloudflare's subrequest
	// limit (it previews publications for every event via the RunSignup API).
	// We already synced in Step 1; the only change is that this event's
	// results are now finalized with levels applied. Update D1 directly.
	//
	// Defect 3 fix: Step 1 wrote race_event_results BEFORE levels were
	// computed. Refresh the canonical snapshot with the finalized rows
	// (levels + level places) now; otherwise the site keeps serving the
	// pre-levels version of the results.
	try {
		const lifecycleRow = await db
			.prepare(`SELECT events_json FROM race_lifecycle WHERE series = ? AND distance = ?`)
			.bind(RACE_LIFECYCLE_SERIES, input.distance)
			.first<{ events_json: string | null }>();
		if (lifecycleRow?.events_json) {
			const events = JSON.parse(lifecycleRow.events_json) as Array<{ event_id: number; stage: string }>;
			let updated = false;
			for (const e of events) {
				if (e.event_id === input.eventId && e.stage === "verifying") {
					e.stage = "levels_computed";
					updated = true;
				}
			}
			if (updated) {
				await db
					.prepare(`UPDATE race_lifecycle SET events_json = ?, updated_at = ? WHERE series = ? AND distance = ?`)
					.bind(JSON.stringify(events), new Date().toISOString(), RACE_LIFECYCLE_SERIES, input.distance)
					.run();
			}
		}
		if (triggerFinalizedRows.length > 0) {
			await db
				.prepare(
					`UPDATE race_event_results
					 SET results_json = ?, result_count = ?, finalized = 1, synced_at = ?
					 WHERE series = ? AND distance = ? AND event_id = ?`,
				)
				.bind(
					JSON.stringify(triggerFinalizedRows),
					triggerFinalizedRows.length,
					new Date().toISOString(),
					RACE_LIFECYCLE_SERIES,
					input.distance,
					input.eventId,
				)
				.run();
			await push("sync_finalized", "ok", `Event marked levels_computed; canonical snapshot refreshed with ${triggerFinalizedRows.length} finalized row(s) (levels + places).`);
		} else {
			// Idempotent-skip path: Step 1 already re-synced from live
			// RunSignup (custom fields present), so verify the snapshot
			// actually carries levels before publishing.
			const snap = await db
				.prepare(`SELECT results_json FROM race_event_results WHERE series = ? AND distance = ? AND event_id = ?`)
				.bind(RACE_LIFECYCLE_SERIES, input.distance, input.eventId)
				.first<{ results_json: string | null }>();
			const rows: Array<{ performance_level?: string | null }> = snap?.results_json ? JSON.parse(snap.results_json) : [];
			const missing = rows.filter((r) => !r.performance_level).length;
			if (rows.length > 0 && missing > 0) {
				return fail("sync_finalized", `Snapshot for event ${input.eventId} has ${missing}/${rows.length} rows without Performance Level after idempotent skip; refusing to publish stale data.`);
			}
			await push("sync_finalized", "ok", "Event marked levels_computed in lifecycle (D1-only, no API calls); snapshot already finalized.");
		}
	} catch (error) {
		return fail("sync_finalized", error instanceof Error ? error.message : "Lifecycle update failed");
	}

	// Step 3b: refresh canonical athlete stats (dynamic victories / podiums /
	// best times). The Engine is the single writer; the site, OC, and exports
	// read the materialized row, so no page can drift from the canonical
	// numbers. A stats failure must not fail the result pipeline.
	try {
		const refreshed = await refreshAllAthleteStats(db);
		await push("athlete_stats", "ok", `Refreshed stats for ${Object.keys(refreshed).length} athlete profile(s).`);
	} catch (error) {
		await push("athlete_stats", "skipped", `Stats refresh failed (non-blocking): ${error instanceof Error ? error.message : String(error)}`);
	}

	// Step 4: publication — Meta congratulations + winner news + next-race promo.
	if (!env.metaToken) {
		return fail("publish", "NWANA_META_TOKEN is not configured");
	}
	const preview = await previewSeries2026ResultPublications(env.accessToken, {
		raceId: input.raceId,
	});
	const draft = preview.drafts.find((d) => d.source.event_id === input.eventId);
	if (!draft) {
		return fail("publish", `No publication draft found for event ${input.eventId}`);
	}
	// Validate image is actually available before publication.
	// If the card cannot be generated, fail fast with IMAGE_GENERATION_FAILED
	// instead of publishing a text-only post and marking it PUBLISHED.
	// Preflight calls getSeries2026ResultCard DIRECTLY — never fetch() our
	// own public URL. A Worker cannot reliably self-fetch (Cloudflare
	// edge/bot protection answers 404 to self-fetch), and the card route
	// only serves GET, so the old HEAD probe guaranteed
	// IMAGE_GENERATION_FAILED. Same direct preflight as the manual publish
	// path: verify the actual generated PNG bytes and content-type.
	const cardUrl = `${env.publicBaseUrl}/result-publications/card/${encodeURIComponent(draft.publication_key)}.png`;
	try {
		const cardResponse = await getSeries2026ResultCard(draft.publication_key, "jpeg", {
			nwana_engine_db: env.db,
			RUNSIGNUP_ACCESS_TOKEN: env.accessToken,
			RUNSIGNUP_API_REG: env.apiCallerToken,
			RUNSIGNUP_API_REG_SECRET: env.apiCallerSecret,
		});
		if (!cardResponse.ok) {
			return fail("publish", `IMAGE_GENERATION_FAILED: card generation failed (HTTP ${cardResponse.status}) for ${draft.publication_key}`);
		}
		const contentType = cardResponse.headers.get("content-type") ?? "";
		if (!contentType.includes("image/png")) {
			return fail("publish", `IMAGE_GENERATION_FAILED: card has wrong content-type "${contentType}" for ${draft.publication_key}`);
		}
		const cardBytes = new Uint8Array(await cardResponse.arrayBuffer());
		const isPng = cardBytes.length > 8 &&
			cardBytes[0] === 0x89 && cardBytes[1] === 0x50 && cardBytes[2] === 0x4E && cardBytes[3] === 0x47;
		if (!isPng) {
			return fail("publish", `IMAGE_GENERATION_FAILED: card bytes are not valid PNG for ${draft.publication_key}`);
		}
		await push("card_preflight", "ok", `Card generated directly (${cardBytes.length} PNG bytes) for ${draft.publication_key}.`);
	} catch (error) {
		return fail("publish", `IMAGE_GENERATION_FAILED: card generation threw: ${error instanceof Error ? error.message : "unknown"}`);
	}
	try {
		const published = await executeResultPublication({
			db,
			runSignupToken: env.accessToken,
			metaToken: env.metaToken,
			publicationKey: draft.publication_key,
			imageUrl: cardUrl,
			authorizedBy: { kind: "owner_result_approvals", distance: input.distance, eventId: input.eventId },
		});
		await push(
			"publish",
			published.status === "META_DELIVERY_FAILED" ? "failed" : "ok",
			published.already_published
				? `Already published (${published.status}); duplicates skipped.`
				: `${published.status}: ${Object.keys(published.deliveries).length} destinations; winner news + next-race promo written.`,
		);
	} catch (error) {
		return fail("publish", error instanceof Error ? error.message : "Publication failed");
	}

	return { ok: true, distance: input.distance, eventId: input.eventId, trigger: input.trigger.reason, steps };
}

// ---------------------------------------------------------------------------
// Athlete pipeline view: Registered -> Submitted -> Approved -> Processed -> Published
// ---------------------------------------------------------------------------

export type PipelineStage =
	| "registered"
	| "submitted"
	| "approved"
	| "processed"
	| "published";

export interface AthletePipelineRow {
	athlete: string;
	registered: boolean;
	submitted: boolean;
	approved: boolean;
	processed: boolean;
	published: boolean;
	stage: PipelineStage;
	result: string | null;
	level: string | null;
	levelPlace: string | null;
	points: number | null;
}

/**
 * Per-athlete pipeline state for one event. Processed = level + level place
 * present in the local results snapshot; published = event publication
 * history is PUBLISHED.
 */
export async function getAthletePipeline(
	env: AutoProcessEnv,
	input: { distance: string; raceId: number; eventId: number },
	liveResults?: LiveEventResult[],
): Promise<AthletePipelineRow[]> {
	const { db } = env;
	const registrations = await getEventRegistrations(env, input.raceId, input.eventId);
	const approvals = await getEventApprovals(db, input.distance, input.eventId);
	const live = liveResults ?? await fetchLiveEventResults(env.accessToken, input.raceId, input.eventId);
	// RUNSIGNUP presence signal: same semantics as the trigger — when the
	// race requires director approval, live results are owner-approved.
	const requireApproval = await fetchResultsRequireApproval(env.accessToken, input.raceId, input.eventId);
	const runsignupApproved = requireApproval === true;

	const snapshot = await db
		.prepare(`SELECT results_json FROM race_event_results WHERE series = ? AND distance = ? AND event_id = ?`)
		.bind(RACE_LIFECYCLE_SERIES, input.distance, input.eventId)
		.first<{ results_json: string | null }>();
	const snapshotRows: Array<{
		result_id?: string; athlete?: string; time?: string | null;
		performance_level?: string | null; level_place?: string | null;
	}> = snapshot?.results_json ? JSON.parse(snapshot.results_json) : [];
	const byResultId = new Map(snapshotRows.map((r) => [String(r.result_id), r]));

	const pubRow = await db
		.prepare(`SELECT status FROM result_publication_history WHERE race_id = ? AND event_id = ? ORDER BY updated_at DESC LIMIT 1`)
		.bind(input.raceId, input.eventId)
		.first<{ status: string | null }>();
	const eventPublished = pubRow?.status === "PUBLISHED" || pubRow?.status === "PUBLISHED_COMPLETE" || pubRow?.status === "PUBLISHED_PARTIAL";

	const byName = new Map<string, AthletePipelineRow>();
	const ensure = (name: string): AthletePipelineRow => {
		const key = name.toLowerCase();
		let row = byName.get(key);
		if (!row) {
			row = {
				athlete: name, registered: false, submitted: false, approved: false,
				processed: false, published: false, stage: "registered",
				result: null, level: null, levelPlace: null, points: null,
			};
			byName.set(key, row);
		}
		return row;
	};

	for (const reg of registrations) {
		const name = `${reg.first_name ?? ""} ${reg.last_name ?? ""}`.trim();
		if (name) ensure(name).registered = true;
	}
	for (const liveRow of live) {
		if (!liveRow.athlete) continue;
		const row = ensure(liveRow.athlete);
		row.submitted = true;
		if (!row.result) row.result = liveRow.time;
		if (approvals.has(liveRow.result_id) || runsignupApproved) row.approved = true;
		const snap = byResultId.get(liveRow.result_id);
		if (snap) {
			row.result = snap.time ?? row.result;
			row.level = snap.performance_level ?? null;
			row.levelPlace = snap.level_place ?? null;
			if (snap.level_place) {
				const place = Number(snap.level_place);
				if (Number.isFinite(place) && place > 0) row.points = 1001 - place;
			}
			if (snap.performance_level && snap.level_place) row.processed = true;
		}
		row.published = eventPublished;
	}
	for (const [resultId, approval] of approvals) {
		const row = ensure(approval.athlete || `Result ${resultId}`);
		row.submitted = true;
		row.approved = true;
		const snap = byResultId.get(resultId);
		if (snap) {
			if (!row.result) row.result = snap.time ?? approval.time ?? null;
			if (!row.level) row.level = snap.performance_level ?? null;
			if (!row.levelPlace) row.levelPlace = snap.level_place ?? null;
			if (snap.level_place && row.points === null) {
				const place = Number(snap.level_place);
				if (Number.isFinite(place) && place > 0) row.points = 1001 - place;
			}
			if (snap.performance_level && snap.level_place) row.processed = true;
		} else if (!row.result && approval.time) {
			row.result = approval.time;
		}
		row.published = eventPublished;
	}
	// Results known from the snapshot but never approved (shouldn't happen
	// after the trigger, but visible when it does).
	for (const snap of snapshotRows) {
		if (!snap.athlete) continue;
		const row = ensure(snap.athlete);
		row.submitted = true;
		if (!row.result) row.result = snap.time ?? null;
		if (!row.level) row.level = snap.performance_level ?? null;
		if (!row.levelPlace) row.levelPlace = snap.level_place ?? null;
		if (snap.performance_level && snap.level_place) {
			row.processed = true;
			const place = Number(snap.level_place);
			if (Number.isFinite(place) && place > 0 && row.points === null) row.points = 1001 - place;
		}
		row.published = eventPublished;
	}

	for (const row of byName.values()) {
		row.stage = row.published
			? "published"
			: row.processed
				? "processed"
				: row.approved
					? "approved"
					: row.submitted
						? "submitted"
						: "registered";
	}
	return [...byName.values()].sort((a, b) => a.athlete.localeCompare(b.athlete));
}

/**
 * ADR-0042 cron guard: an event whose publication already reached PUBLISHED
 * is never re-processed by the daily deadline wake-up. Manual owner
 * "process now" retries remain available through the OC endpoint.
 */
export async function isEventPublished(
	db: D1Database,
	raceId: number,
	eventId: number,
): Promise<boolean> {
	const row = await db
		.prepare(`SELECT status FROM result_publication_history WHERE race_id = ? AND event_id = ? ORDER BY updated_at DESC LIMIT 1`)
		.bind(raceId, eventId)
		.first<{ status: string | null }>();
	return row?.status === "PUBLISHED" || row?.status === "PUBLISHED_COMPLETE" || row?.status === "PUBLISHED_PARTIAL";
}
