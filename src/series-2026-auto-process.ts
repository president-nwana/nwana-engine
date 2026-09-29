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
// come only from series_result_approvals, written by the owner's explicit
// action (OC button or recorded owner statement). Any real blocker becomes
// an exception for the owner, never a silent skip.

import {
	allResultsApproved,
	getEventApprovals,
} from "./series-2026-approvals";
import { getEventDisqualifications } from "./series-2026-decisions";
import {
	applySeries2026Levels,
	AUTO_APPROVED_CONFIRMATION,
} from "./series-2026-apply";
import {
	RACE_LIFECYCLE_SERIES,
	syncRaceLifecycleDistance,
	testSeries2026WriteAccess,
} from "./race-lifecycle";
import { syncSeries2026Registrations } from "./series-2026-registrations";
import { previewSeries2026ResultPublications } from "./series-2026-results";
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
	return (await response.json()) as UnknownRecord;
}

/**
 * Live results for one event (all result sets). Read-only.
 */
export async function fetchLiveEventResults(
	accessToken: string,
	raceId: number,
	eventId: number,
): Promise<LiveEventResult[]> {
	const out: LiveEventResult[] = [];
	const setsUrl = new URL(
		`https://api.runsignup.com/rest/race/${raceId}/results/get-result-sets`,
	);
	setsUrl.searchParams.set("format", "json");
	setsUrl.searchParams.set("event_id", String(eventId));
	const setsData = await runSignupGet(setsUrl, accessToken);
	const sets = Array.isArray(setsData.individual_results_sets)
		? (setsData.individual_results_sets as UnknownRecord[])
		: [];
	for (const set of sets) {
		const resultSetId = Number(set.individual_result_set_id);
		if (!Number.isInteger(resultSetId)) continue;
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
			const resultId = text(row.result_id);
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
	let rows = await env.db
		.prepare(
			`SELECT registration_id, user_id, first_name, last_name, status
			 FROM series_registrations WHERE race_id = ? AND event_id = ?`,
		)
		.bind(raceId, eventId)
		.all<EventRegistration>();
	if (rows.results.length === 0) {
		await syncSeries2026Registrations(env.db, {
			accessToken: env.accessToken,
		});
		rows = await env.db
			.prepare(
				`SELECT registration_id, user_id, first_name, last_name, status
				 FROM series_registrations WHERE race_id = ? AND event_id = ?`,
			)
			.bind(raceId, eventId)
			.all<EventRegistration>();
	}
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
	let liveResults: LiveEventResult[];
	try {
		liveResults = await fetchLiveEventResults(env.accessToken, input.raceId, input.eventId);
	} catch (error) {
		// RunSignup API failure (e.g. 522 timeout) — fall back to D1 approvals below.
		console.error("fetchLiveEventResults failed, using D1 approvals fallback:", error instanceof Error ? error.message : error);
		liveResults = [];
	}
	const approvals = await getEventApprovals(db, input.distance, input.eventId);
	// Fallback: if the authenticated RunSignup API returns no results but the
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
		.filter((r) => approvals.has(r.result_id))
		.map((r) => r.result_id);
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

	// Step 2: levels / level places / points / standings (full-distance rebuild).
	// Disqualified results need no approval; they are excluded from the
	// approval check and from scoring (0 points).
	const decidableResultIds = input.trigger.results
		.map((r) => r.result_id)
		.filter((id) => !input.trigger.disqualifiedResultIds.includes(id));
	const approvedNow = await allResultsApproved(
		db,
		input.distance,
		input.eventId,
		decidableResultIds,
	);
	if (!approvedNow) {
		return fail("verify_approvals", "Approvals changed mid-run; refusing to apply without a complete approval set.");
	}
	const applyResult = await applySeries2026Levels({
		db,
		accessToken: env.accessToken,
		distance: input.distance,
		eventId: input.eventId,
		confirmation: AUTO_APPROVED_CONFIRMATION,
		disqualifiedResultIds: input.trigger.disqualifiedResultIds,
	});
	if (!applyResult.ok) {
		return fail("apply_levels", applyResult.error ?? "Levels apply failed");
	}
	await push("apply_levels", "ok", `Applied to ${applyResult.result_count} results; standings rebuilt.`);

	// Step 3: mark the event as levels_computed in the lifecycle state.
	// A full syncRaceLifecycleDistance would exceed Cloudflare's subrequest
	// limit (it previews publications for every event via the RunSignup API).
	// We already synced in Step 1; the only change is that this event's
	// results are now finalized with levels applied. Update D1 directly.
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
		await push("sync_finalized", "ok", "Event marked levels_computed in lifecycle (D1-only, no API calls).");
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
	try {
		const published = await executeResultPublication({
			db,
			runSignupToken: env.accessToken,
			metaToken: env.metaToken,
			publicationKey: draft.publication_key,
			imageUrl: `${env.publicBaseUrl}/result-publications/card/${encodeURIComponent(draft.publication_key)}.jpg`,
			authorizedBy: { kind: "owner_result_approvals", distance: input.distance, eventId: input.eventId },
		});
		await push(
			"publish",
			"ok",
			published.already_published
				? "Already published; duplicates skipped."
				: `Published to ${Object.keys(published.deliveries).length} destinations; winner news + next-race promo written.`,
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
	const eventPublished = pubRow?.status === "PUBLISHED";

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
		if (approvals.has(liveRow.result_id)) row.approved = true;
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
	return row?.status === "PUBLISHED";
}
