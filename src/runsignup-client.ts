// Shared RunSignup REST read helper.
//
// Root cause it fixes (2026-09-28): RunSignup returns API-level errors as
// HTTP 200 + {"error": {"error_code": N, "error_msg": "..."}}. Callers that
// checked only response.ok treated those bodies as valid, saw an empty
// "participants" array, and logged the sync as status='ok' with fetched=0.
// Hundreds of silent no-ops looked identical to genuinely empty races.
//
// Rule: always route RunSignup JSON reads through runSignupGetJson and
// handle { ok: false } explicitly. The helper never throws for API or HTTP
// errors; it only returns ok:false when fetch itself fails at the network
// level (also returned, not thrown).

/** RunSignup API-level error body: HTTP 200 + {"error": {"error_code": N, "error_msg": "..."}}. */
export interface RunSignupApiError {
	error_code: number;
	error_msg: string;
}

export interface RunSignupApiResult<T> {
	ok: boolean;
	data?: T;
	/** HTTP status of the response (present when a response was received). */
	http_status?: number;
	/** Set when the body carried a RunSignup API error object. */
	api_error_code?: number;
	/** Set when the body carried a RunSignup API error object, or on transport failure. */
	api_error_msg?: string;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as UnknownRecord;
	}
	return null;
}

/**
 * Extract a RunSignup API error from a parsed response body.
 * Returns null when the body carries no "error" object.
 */
export function extractRunSignupApiError(data: unknown): RunSignupApiError | null {
	const body = asRecord(data);
	if (!body) return null;
	const err = asRecord(body.error);
	if (!err) return null;
	const codeRaw = err.error_code;
	const code =
		typeof codeRaw === "number" && Number.isInteger(codeRaw)
			? codeRaw
			: typeof codeRaw === "string" && /^-?\d+$/.test(codeRaw.trim())
				? parseInt(codeRaw.trim(), 10)
				: null;
	if (code === null) return null;
	const msg = err.error_msg;
	return {
		error_code: code,
		error_msg:
			typeof msg === "string" && msg.length > 0 ? msg : "RunSignup API error",
	};
}

/**
 * Fetch JSON from the RunSignup REST API.
 * - Never throws for API-level errors or HTTP errors: they are returned as
 *   { ok: false, http_status, api_error_code?, api_error_msg? }.
 * - Never throws for network-level fetch failures either: they are returned
 *   as { ok: false, api_error_msg } with no http_status.
 */
export async function runSignupGetJson<T>(
	url: string | URL,
	token?: string,
	extraHeaders?: Record<string, string>,
): Promise<RunSignupApiResult<T>> {
	const headers: Record<string, string> = {};
	if (token) {
		headers["Authorization"] = `Bearer ${token}`;
	}
	if (extraHeaders) {
		for (const [key, value] of Object.entries(extraHeaders)) {
			headers[key] = value;
		}
	}

	let response: Response;
	try {
		response = await fetch(url.toString(), { headers });
	} catch (error) {
		return {
			ok: false,
			api_error_msg: `Network-level fetch failure: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}

	const http_status = response.status;

	let data: unknown = null;
	try {
		data = (await response.json()) as unknown;
	} catch {
		// Non-JSON body: still surface the HTTP status; nothing to parse.
		return response.ok ? { ok: true, data: undefined, http_status } : { ok: false, http_status };
	}

	const apiError = extractRunSignupApiError(data);
	if (apiError) {
		return {
			ok: false,
			http_status,
			api_error_code: apiError.error_code,
			api_error_msg: apiError.error_msg,
		};
	}

	if (!response.ok) {
		return { ok: false, http_status };
	}

	return { ok: true, data: data as T, http_status };
}

/**
 * Interpretation of a RunSignup read failure for the registration-access
 * diagnostic. Codes from https://runsignup.com/Api/ErrorCodes.
 */
export type RunSignupFailureInterpretation =
	| "TOKEN_INVALID"
	| "SCOPE_INSUFFICIENT"
	| "THROTTLED"
	| "EMPTY_LIST_OK"
	| "UNKNOWN";

export function classifyRunSignupFailure(
	api_error_code?: number,
	api_error_msg?: string,
	http_status?: number,
): Exclude<RunSignupFailureInterpretation, "EMPTY_LIST_OK"> {
	// Official error codes (https://runsignup.com/Api/ErrorCodes).
	switch (api_error_code) {
		case 6: // Key authentication failed
		case 13: // You must be logged in to the API as a user
		case 17: // Invalid API caller credentials.
			return "TOKEN_INVALID";
		case 7: // Permission Denied
			return "SCOPE_INSUFFICIENT";
		case 14: // Request throttled.
			return "THROTTLED";
		default:
			break;
	}

	const msg = (api_error_msg ?? "").toLowerCase();
	if (msg.length > 0) {
		if (
			msg.includes("throttle") ||
			msg.includes("too many requests") ||
			msg.includes("rate limit")
		) {
			return "THROTTLED";
		}
		if (
			msg.includes("permission") ||
			msg.includes("not authorized") ||
			msg.includes("access denied") ||
			msg.includes("forbidden")
		) {
			return "SCOPE_INSUFFICIENT";
		}
		if (
			msg.includes("invalid token") ||
			msg.includes("token expired") ||
			msg.includes("unauthorized") ||
			msg.includes("authentication failed") ||
			msg.includes("must be logged in")
		) {
			return "TOKEN_INVALID";
		}
	}

	if (http_status === 401) return "TOKEN_INVALID";
	if (http_status === 403) return "SCOPE_INSUFFICIENT";
	if (http_status === 429) return "THROTTLED";

	return "UNKNOWN";
}
