// D1-only Stage 8 processing (2026-10-05).
// Owner-authorized: computes Performance Level, Level Place, points from
// approved results in D1. No RunSignup API calls. No writes to RunSignup.

export interface Stage8D1Result {
	ok: boolean;
	distance: string;
	event_id: number;
	computed: Array<{
		athlete: string;
		result_id: string;
		time: string;
		time_seconds: number;
		performance_level: string;
		level_place: string;
		points: number;
		gender: string;
	}>;
	standings: Array<{
		athlete: string;
		total_points: number;
		events: number;
	}>;
	lifecycle_stage: string;
	error?: string;
}

// 1K thresholds (seconds): Elite <360, High Performance <390,
// Performance <420, Competitive <450, Open >=450.
function get1KLevel(timeSeconds: number): string {
	if (timeSeconds < 360) return "Elite";
	if (timeSeconds < 390) return "High Performance";
	if (timeSeconds < 420) return "Performance";
	if (timeSeconds < 450) return "Competitive";
	return "Open";
}

function parseTimeToSeconds(time: string): number {
	// Format: "5:36" or "5:36.0"
	const parts = time.split(":");
	if (parts.length === 2) {
		const mins = parseInt(parts[0], 10);
		const secs = parseFloat(parts[1]);
		return mins * 60 + secs;
	}
	return 0;
}

export async function processStage8D1(input: {
	db: D1Database;
	distance: string;
	eventId: number;
}): Promise<Stage8D1Result> {
	const { db, distance, eventId } = input;
	const base = {
		ok: false,
		distance,
		event_id: eventId,
		computed: [],
		standings: [],
		lifecycle_stage: "unknown",
	};

	// 1. Read approved results from D1.
	const approvals = await db
		.prepare(
			`SELECT result_id, athlete, time FROM series_result_approvals
			 WHERE series = 'SERIES_2026' AND distance = ? AND event_id = ?
			 ORDER BY time ASC`,
		)
		.bind(distance, eventId)
		.all<{ result_id: string; athlete: string; time: string }>();

	if (!approvals.results || approvals.results.length === 0) {
		return { ...base, error: `No approved results found for ${distance} event ${eventId}` };
	}

	// Verified time mapping for Stage 8 (2026-10-05):
	// Result IDs confirmed via RunSignup diagnostic; times confirmed via
	// public RunSignup results page (Albert verified). The approval parser
	// did not capture times (blank fields), so we use the verified mapping.
	const VERIFIED_TIMES: Record<string, string> = {
		"232911744": "5:36", // ALBERT FATIKHOV
		"232931669": "7:45", // Michael Blanchard
	};

	// Verified gender mapping for Stage 8 (2026-10-05).
	// Both winners are male (Albert confirmed).
	const VERIFIED_GENDERS: Record<string, string> = {
		"232911744": "M", // ALBERT FATIKHOV
		"232931669": "M", // Michael Blanchard
	};

	// 2. Compute levels.
	const computed = approvals.results.map((row) => {
		// Use verified time if approval record has blank time.
		const timeStr = row.time || VERIFIED_TIMES[row.result_id] || "";
		const timeSeconds = parseTimeToSeconds(timeStr);
		const level = distance === "1K" ? get1KLevel(timeSeconds) : "Open";
		return {
			athlete: row.athlete || "Unknown",
			result_id: row.result_id,
			time: timeStr,
			time_seconds: timeSeconds,
			performance_level: level,
			level_place: "0", // string, computed below
			points: 1000, // 1000 points per completed event (observed from historical data)
			gender: VERIFIED_GENDERS[row.result_id] || "M",
		};
	});

	// 3. Compute level places (within each level, by time).
	const byLevel = new Map<string, typeof computed>();
	for (const c of computed) {
		if (!byLevel.has(c.performance_level)) byLevel.set(c.performance_level, []);
		byLevel.get(c.performance_level)!.push(c);
	}
	for (const [, group] of byLevel) {
		group.sort((a, b) => a.time_seconds - b.time_seconds);
		group.forEach((c, idx) => {
			c.level_place = String(idx + 1);
		});
	}

	// 4. Update race_event_results with computed data.
	const resultsJson = JSON.stringify(
		computed.map((c) => ({
			result_id: c.result_id,
			athlete: c.athlete,
			time: c.time,
			performance_level: c.performance_level,
			level_place: c.level_place,
			points: c.points,
			gender: c.gender,
		})),
	);

	// Get race_id from lifecycle.
	const lifecycleRow = await db
		.prepare(`SELECT events_json FROM race_lifecycle WHERE series = 'SERIES_2026' AND distance = ?`)
		.bind(distance)
		.first<{ events_json: string | null }>();

	let raceId = 209980; // 1K default
	let eventDate = "2026-10-03";
	let eventName = "";
	if (lifecycleRow?.events_json) {
		try {
			const events = JSON.parse(lifecycleRow.events_json) as Array<{
				event_id: number;
				race_id?: number;
				event_date?: string;
				event_name?: string;
			}>;
			const ev = events.find((e) => e.event_id === eventId);
			if (ev) {
				if (ev.race_id) raceId = ev.race_id;
				if (ev.event_date) eventDate = ev.event_date;
				if (ev.event_name) eventName = ev.event_name;
			}
		} catch {
			// use defaults
		}
	}

	await db
		.prepare(
			`INSERT INTO race_event_results
			 (series, distance, race_id, event_id, event_name, event_date, result_count, finalized, results_json, synced_at)
			 VALUES ('SERIES_2026', ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))
			 ON CONFLICT(series, distance, event_id) DO UPDATE SET
			 result_count = excluded.result_count,
			 finalized = 1,
			 results_json = excluded.results_json,
			 synced_at = excluded.synced_at`,
		)
		.bind(distance, raceId, eventId, eventName, eventDate, computed.length, resultsJson)
		.run();

	// 5. Compute updated standings (sum points across all events for distance).
	const allResults = await db
		.prepare(
			`SELECT results_json FROM race_event_results
			 WHERE series = 'SERIES_2026' AND distance = ? AND finalized = 1`,
		)
		.bind(distance)
		.all<{ results_json: string }>();

	const athletePoints = new Map<string, { total: number; events: number }>();
	for (const row of allResults.results || []) {
		try {
			const results = JSON.parse(row.results_json) as Array<{
				athlete: string;
				points: number;
			}>;
			for (const r of results) {
				const existing = athletePoints.get(r.athlete) || { total: 0, events: 0 };
				existing.total += r.points || 0;
				existing.events += 1;
				athletePoints.set(r.athlete, existing);
			}
		} catch {
			// skip malformed
		}
	}

	const standings = Array.from(athletePoints.entries())
		.map(([athlete, data]) => ({
			athlete,
			total_points: data.total,
			events: data.events,
		}))
		.sort((a, b) => b.total_points - a.total_points);

	// 6. Update lifecycle stage to "levels_computed" for this event.
	let lifecycleStage = "levels_computed";
	if (lifecycleRow?.events_json) {
		try {
			const events = JSON.parse(lifecycleRow.events_json) as Array<{
				event_id: number;
				stage: string;
			}>;
			const ev = events.find((e) => e.event_id === eventId);
			if (ev) {
				ev.stage = "levels_computed";
				await db
					.prepare(`UPDATE race_lifecycle SET events_json = ? WHERE series = 'SERIES_2026' AND distance = ?`)
					.bind(JSON.stringify(events), distance)
					.run();
				lifecycleStage = "levels_computed";
			}
		} catch {
			// stage update failed, but D1 processing succeeded
		}
	}

	return {
		ok: true,
		distance,
		event_id: eventId,
		computed,
		standings,
		lifecycle_stage: lifecycleStage,
	};
}
