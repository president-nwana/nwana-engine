/**
 * RunSignup Results API health probe for the Operating Center.
 *
 * Albert's directive (2026-10-05): the OC must show an explicit health/status
 * for the RunSignup Results API — OK / EMPTY_RESPONSE_PROTECTED / ERROR —
 * plus a "Retry Series Sync" action. When the API recovers, the Engine must
 * itself surface which stages are awaiting approval instead of making the
 * owner remember to check.
 *
 * Probe strategy: fetch live results for 1K event 1177447 (Jul 4, 2026),
 * which is known to have 3 results in RunSignup (legacy baseline). This is
 * a read-only canary; it never writes.
 * - API call succeeds with results → OK
 * - API call succeeds but returns 0 rows for the known-good event →
 *   EMPTY_RESPONSE_PROTECTED (the lifecycle guard refuses to wipe state)
 * - API call throws (522, timeout, …) → ERROR
 *
 * When OK, the probe also lists events with live results awaiting owner
 * approval so the OC can surface them without manual checking.
 */

import { fetchLiveEventResults } from "./series-2026-auto-process";
import { getEventApprovals } from "./series-2026-approvals";
import { RACE_LIFECYCLE_SERIES } from "./race-lifecycle";
import { SERIES_2026_SOURCES } from "./series-2026-results";

export type RunSignupApiHealthStatus =
	| "OK"
	| "EMPTY_RESPONSE_PROTECTED"
	| "ERROR";

export interface AwaitingApprovalEvent {
	distance: string;
	event_id: number;
	event_name: string;
	event_date: string;
	unapproved_count: number;
}

export interface RunSignupApiHealth {
	status: RunSignupApiHealthStatus;
	detail: string;
	checked_at: string;
	probe: { distance: string; event_id: number; result_count: number } | null;
	awaiting_approval: AwaitingApprovalEvent[];
}

// Canary: 1K Jul 4 2026 — known to have 3 results in RunSignup.
const PROBE_DISTANCE = "1K";
const PROBE_EVENT_ID = 1177447;

interface LifecycleEventView {
	event_id: number;
	event_name: string;
	event_date: string;
	stage: string;
}

export async function getRunSignupApiHealth(
	db: D1Database,
	accessToken: string,
): Promise<RunSignupApiHealth> {
	const checkedAt = new Date().toISOString();
	const probeSource = SERIES_2026_SOURCES.find(
		(s) => s.distance === PROBE_DISTANCE,
	);
	if (!probeSource) {
		return {
			status: "ERROR",
			detail: `Unknown probe distance ${PROBE_DISTANCE}`,
			checked_at: checkedAt,
			probe: null,
			awaiting_approval: [],
		};
	}

	// Step 1: canary probe.
	let probeCount: number | null = null;
	try {
		const probeResults = await fetchLiveEventResults(
			accessToken,
			probeSource.raceId,
			PROBE_EVENT_ID,
		);
		probeCount = probeResults.length;
	} catch (error) {
		return {
			status: "ERROR",
			detail: `RunSignup Results API call failed: ${error instanceof Error ? error.message : String(error)}`,
			checked_at: checkedAt,
			probe: null,
			awaiting_approval: [],
		};
	}
	if (probeCount === 0) {
		return {
			status: "EMPTY_RESPONSE_PROTECTED",
			detail:
				`RunSignup returned 0 results for the known-good canary event ` +
				`${PROBE_DISTANCE} ${PROBE_EVENT_ID} (Jul 4, expected 3). ` +
				`The lifecycle guard is protecting stored state from being wiped.`,
			checked_at: checkedAt,
			probe: { distance: PROBE_DISTANCE, event_id: PROBE_EVENT_ID, result_count: 0 },
			awaiting_approval: [],
		};
	}

	// Step 2: API is OK — find events with live results awaiting approval.
	const awaiting: AwaitingApprovalEvent[] = [];
	for (const source of SERIES_2026_SOURCES) {
		const row = await db
			.prepare(
				`SELECT events_json FROM race_lifecycle WHERE series = ? AND distance = ?`,
			)
			.bind(RACE_LIFECYCLE_SERIES, source.distance)
			.first<{ events_json: string | null }>();
		if (!row?.events_json) continue;
		let events: LifecycleEventView[];
		try {
			events = JSON.parse(row.events_json) as LifecycleEventView[];
		} catch {
			continue;
		}
		const candidates = events.filter(
			(e) => e.stage === "awaiting_results" || e.stage === "verifying",
		);
		for (const candidate of candidates) {
			let live: Array<{ result_id: string }>;
			try {
				live = await fetchLiveEventResults(
					accessToken,
					source.raceId,
					candidate.event_id,
				);
			} catch {
				// Per-event failure must not fail the whole health check.
				continue;
			}
			if (!live.length) continue;
			const approvals = await getEventApprovals(
				db,
				source.distance,
				candidate.event_id,
			);
			const unapproved = live.filter((r) => !approvals.has(r.result_id));
			if (unapproved.length > 0) {
				awaiting.push({
					distance: source.distance,
					event_id: candidate.event_id,
					event_name: candidate.event_name,
					event_date: candidate.event_date,
					unapproved_count: unapproved.length,
				});
			}
		}
	}

	return {
		status: "OK",
		detail:
			`RunSignup Results API responding. Canary ${PROBE_DISTANCE} ` +
			`event ${PROBE_EVENT_ID} returned ${probeCount} results.`,
		checked_at: checkedAt,
		probe: {
			distance: PROBE_DISTANCE,
			event_id: PROBE_EVENT_ID,
			result_count: probeCount,
		},
		awaiting_approval: awaiting,
	};
}
