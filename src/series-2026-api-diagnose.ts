/**
 * Diagnostic: raw RunSignup API responses for the known control result set.
 *
 * Albert (2026-10-05): do not call the empty response an "outage" until the
 * full RunSignup auth history is reconstructed. This endpoint returns the
 * RAW API responses (status + body) for the known-good control:
 *   race_id=210020, event_id=1177725, individual_result_set_id=665163
 *   ("Virtual 20K NW Series - August 16, 2026")
 * so we can see whether the API reports an auth error (codes 6/13/17),
 * returns empty data, or returns the expected results.
 *
 * Read-only. Never logs or returns credential values.
 */

export interface RunSignupRawDiagnostic {
	checked_at: string;
	auth_method: string;
	steps: Array<{
		endpoint: string;
		http_status: number | null;
		transport_error: string | null;
		body_preview: string;
		api_error_code: number | null;
		api_error_msg: string | null;
		result_count: number | null;
	}>;
}

function extractApiError(body: string): { code: number | null; msg: string | null } {
	try {
		const data = JSON.parse(body) as Record<string, unknown>;
		const err = data.error as Record<string, unknown> | undefined;
		if (err && typeof err.error_code !== "undefined") {
			const code = Number(err.error_code);
			return {
				code: Number.isInteger(code) ? code : null,
				msg: typeof err.error_msg === "string" ? err.error_msg : null,
			};
		}
	} catch {
		// not JSON or no error object
	}
	return { code: null, msg: null };
}

export async function diagnoseRunSignupRaw(
	accessToken: string,
): Promise<RunSignupRawDiagnostic> {
	const steps: RunSignupRawDiagnostic["steps"] = [];
	const raceId = 210020;
	const eventId = 1177725;
	const resultSetId = 665163;

	// Step 1: get-result-sets
	const setsUrl = new URL(
		`https://api.runsignup.com/rest/race/${raceId}/results/get-result-sets`,
	);
	setsUrl.searchParams.set("format", "json");
	setsUrl.searchParams.set("event_id", String(eventId));
	try {
		const resp = await fetch(setsUrl, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		const body = await resp.text();
		const apiErr = extractApiError(body);
		let count: number | null = null;
		try {
			const data = JSON.parse(body) as Record<string, unknown>;
			const sets = data.individual_results_sets;
			count = Array.isArray(sets) ? sets.length : 0;
		} catch {
			count = null;
		}
		steps.push({
			endpoint: "get-result-sets",
			http_status: resp.status,
			transport_error: null,
			body_preview: body.slice(0, 500),
			api_error_code: apiErr.code,
			api_error_msg: apiErr.msg,
			result_count: count,
		});
	} catch (error) {
		steps.push({
			endpoint: "get-result-sets",
			http_status: null,
			transport_error: error instanceof Error ? error.message : String(error),
			body_preview: "",
			api_error_code: null,
			api_error_msg: null,
			result_count: null,
		});
	}

	// Step 2: get-results for the known set (only if step 1 did not transport-fail)
	if (steps[0].transport_error === null) {
		const resultsUrl = new URL(
			`https://api.runsignup.com/rest/race/${raceId}/results/get-results`,
		);
		resultsUrl.searchParams.set("format", "json");
		resultsUrl.searchParams.set("event_id", String(eventId));
		resultsUrl.searchParams.set("individual_result_set_id", String(resultSetId));
		resultsUrl.searchParams.set("results_per_page", "1000");
		try {
			const resp = await fetch(resultsUrl, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			const body = await resp.text();
			const apiErr = extractApiError(body);
			let count: number | null = null;
			try {
				const data = JSON.parse(body) as Record<string, unknown>;
				const sets = data.individual_results_sets as Array<Record<string, unknown>> | undefined;
				const rows = Array.isArray(sets?.[0]?.results) ? sets[0].results : [];
				count = (rows as unknown[]).length;
			} catch {
				count = null;
			}
			steps.push({
				endpoint: "get-results",
				http_status: resp.status,
				transport_error: null,
				body_preview: body.slice(0, 500),
				api_error_code: apiErr.code,
				api_error_msg: apiErr.msg,
				result_count: count,
			});
		} catch (error) {
			steps.push({
				endpoint: "get-results",
				http_status: null,
				transport_error: error instanceof Error ? error.message : String(error),
				body_preview: "",
				api_error_code: null,
				api_error_msg: null,
				result_count: null,
			});
		}
	}

	return {
		checked_at: new Date().toISOString(),
		auth_method: "Bearer RUNSIGNUP_ACCESS_TOKEN (server-to-server)",
		steps,
	};
}
