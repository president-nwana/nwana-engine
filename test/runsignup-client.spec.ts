// Unit tests for the shared RunSignup REST client.
//
// Covers the verified root cause: RunSignup reports API-level errors as
// HTTP 200 + {"error": {"error_code": N, "error_msg": "..."}}, which the
// old response.ok checks silently treated as valid (empty) data.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	classifyRunSignupFailure,
	extractRunSignupApiError,
	runSignupGetJson,
} from "../src/runsignup-client";

function mockJsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("extractRunSignupApiError", () => {
	it("extracts code and message from an error body", () => {
		expect(
			extractRunSignupApiError({
				error: { error_code: 7, error_msg: "Permission Denied" },
			}),
		).toEqual({ error_code: 7, error_msg: "Permission Denied" });
	});

	it("returns null when there is no error object", () => {
		expect(extractRunSignupApiError({ participants: [] })).toBeNull();
		expect(extractRunSignupApiError(null)).toBeNull();
		expect(extractRunSignupApiError("text")).toBeNull();
	});
});

describe("runSignupGetJson", () => {
	it("HTTP 200 + in-body API error -> ok:false with code and message", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				mockJsonResponse({
					error: { error_code: 7, error_msg: "Permission Denied" },
				}),
			),
		);
		const result = await runSignupGetJson<Record<string, unknown>>(
			"https://api.runsignup.com/rest/race/209477/participants",
			"token",
		);
		expect(result.ok).toBe(false);
		expect(result.http_status).toBe(200);
		expect(result.api_error_code).toBe(7);
		expect(result.api_error_msg).toBe("Permission Denied");
		expect(result.data).toBeUndefined();
	});

	it("HTTP 200 + valid participants payload -> ok:true with parsed data", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				mockJsonResponse({
					race: { name: "NWANA Open Series 5K" },
					participants: [
						{
							registration_id: 664979,
							event_id: 1177636,
							first_name: "Albert",
							last_name: "Fatikhov",
						},
					],
				}),
			),
		);
		const result = await runSignupGetJson<{
			participants: Array<Record<string, unknown>>;
		}>("https://api.runsignup.com/rest/race/209477/participants", "token");
		expect(result.ok).toBe(true);
		expect(result.http_status).toBe(200);
		expect(result.data?.participants).toHaveLength(1);
		expect(result.api_error_code).toBeUndefined();
	});

	it("HTTP 403 -> ok:false with http_status (never throws)", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => mockJsonResponse({}, 403)));
		const result = await runSignupGetJson(
			"https://api.runsignup.com/rest/race/209477/participants",
			"token",
		);
		expect(result.ok).toBe(false);
		expect(result.http_status).toBe(403);
	});

	it("in-body throttled error -> ok:false with code 14", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				mockJsonResponse({
					error: { error_code: 14, error_msg: "Request throttled." },
				}),
			),
		);
		const result = await runSignupGetJson(
			"https://api.runsignup.com/rest/race/209477/participants",
			"token",
		);
		expect(result.ok).toBe(false);
		expect(result.api_error_code).toBe(14);
		expect(result.api_error_msg).toBe("Request throttled.");
	});

	it("network-level fetch failure -> ok:false (never throws)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("fetch failed");
			}),
		);
		const result = await runSignupGetJson("https://api.runsignup.com/rest/race/209477/participants");
		expect(result.ok).toBe(false);
		expect(result.http_status).toBeUndefined();
		expect(result.api_error_msg).toContain("fetch failed");
	});

	it("sends the Bearer token header", async () => {
		const fetchMock = vi.fn(async () => mockJsonResponse({ participants: [] }));
		vi.stubGlobal("fetch", fetchMock);
		await runSignupGetJson("https://api.runsignup.com/rest/race/209477/participants", "secret-token");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer secret-token");
	});
});

describe("classifyRunSignupFailure", () => {
	it("maps official error codes from runsignup.com/Api/ErrorCodes", () => {
		expect(classifyRunSignupFailure(6, "Key authentication failed")).toBe("TOKEN_INVALID");
		expect(classifyRunSignupFailure(13, "You must be logged in to the API as a user")).toBe(
			"TOKEN_INVALID",
		);
		expect(classifyRunSignupFailure(17, "Invalid API caller credentials.")).toBe("TOKEN_INVALID");
		expect(classifyRunSignupFailure(7, "Permission Denied")).toBe("SCOPE_INSUFFICIENT");
		expect(classifyRunSignupFailure(14, "Request throttled.")).toBe("THROTTLED");
	});

	it("falls back to HTTP status and message patterns", () => {
		expect(classifyRunSignupFailure(undefined, undefined, 401)).toBe("TOKEN_INVALID");
		expect(classifyRunSignupFailure(undefined, undefined, 403)).toBe("SCOPE_INSUFFICIENT");
		expect(classifyRunSignupFailure(undefined, undefined, 429)).toBe("THROTTLED");
		expect(classifyRunSignupFailure(undefined, "Too many requests")).toBe("THROTTLED");
		expect(classifyRunSignupFailure(undefined, "Access denied for this race")).toBe(
			"SCOPE_INSUFFICIENT",
		);
	});

	it("returns UNKNOWN for unrecognized failures", () => {
		expect(classifyRunSignupFailure(999, "Something odd", 500)).toBe("UNKNOWN");
	});
});
