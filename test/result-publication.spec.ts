import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

type FetchEnv = Parameters<typeof worker.fetch>[1];

function makeEnv(db?: unknown): FetchEnv {
	return {
		OPERATING_CENTER_KEY: "test-owner-key",
		NWANA_META_TOKEN: "test-meta-token",
		nwana_engine_db: db ?? null,
	} as unknown as FetchEnv;
}

function publishRequest(key: string | undefined, body: unknown): Request {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (key !== undefined) headers["authorization"] = `Bearer ${key}`;
	return new Request("https://engine.test/result-publications/publish", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

describe("POST /result-publications/publish owner gate", () => {
	it("returns 401 without the owner key", async () => {
		const res = await worker.fetch(
			publishRequest(undefined, {
				publication_key: "runsignup:series-2026:1:2:3",
				confirmation: "PUBLISH",
			}),
			makeEnv(),
		);
		expect(res.status).toBe(401);
	});

	it("returns 401 with a wrong key", async () => {
		const res = await worker.fetch(
			publishRequest("wrong-key", {
				publication_key: "runsignup:series-2026:1:2:3",
				confirmation: "PUBLISH",
			}),
			makeEnv(),
		);
		expect(res.status).toBe(401);
	});

	it("requires explicit PUBLISH confirmation even with the key", async () => {
		const res = await worker.fetch(
			publishRequest("test-owner-key", {
				publication_key: "runsignup:series-2026:1:2:3",
			}),
			makeEnv(),
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toMatch(/PUBLISH confirmation/);
	});

	it("returns already_published without external calls when history says PUBLISHED", async () => {
		const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", fetchSpy);
		try {
			const db = {
				prepare: () => ({
					bind: () => ({
						first: async () => ({ status: "PUBLISHED" }),
					}),
				}),
			};
			const res = await worker.fetch(
				publishRequest("test-owner-key", {
					publication_key: "runsignup:series-2026:1:2:3",
					confirmation: "PUBLISH",
				}),
				makeEnv(db),
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as { already_published?: boolean };
			expect(body.already_published).toBe(true);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
