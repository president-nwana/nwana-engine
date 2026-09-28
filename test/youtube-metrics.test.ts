import { afterEach, describe, expect, it, vi } from "vitest";
import {
	encryptRefreshToken,
	getYouTubeChannelMetrics,
	getYouTubeStatus,
	type YouTubeEnv,
} from "../src/youtube";

const TOKEN_KEY = "test-token-key-for-youtube-metrics-tests";

function baseEnv(overrides: Partial<YouTubeEnv> = {}): YouTubeEnv {
	return {
		nwana_engine_db: {} as D1Database,
		GOOGLE_ADS_CLIENT_ID: "ads-client-id",
		GOOGLE_ADS_CLIENT_SECRET: "ads-client-secret",
		GOOGLE_ADS_TOKEN_KEY: TOKEN_KEY,
		...overrides,
	};
}

async function envWithCredential(): Promise<YouTubeEnv> {
	const { encrypted, iv } = await encryptRefreshToken("refresh-token-123", TOKEN_KEY);
	const db = {
		prepare: () => ({
			bind: () => ({
				first: async () => ({ encrypted_refresh_token: encrypted, iv }),
				run: async () => ({}),
			}),
		}),
	};
	return baseEnv({ nwana_engine_db: db as unknown as D1Database });
}

type FetchCall = { url: string; init?: RequestInit };
function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const calls: FetchCall[] = [];
	vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		calls.push({ url, init });
		return handler(url, init);
	});
	return calls;
}

function jsonResponse(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function channelPayload(statistics?: Record<string, string>) {
	return {
		items: [
			{
				id: "UC2f_TSMW1BWKThUy6XV1onw",
				snippet: { title: "NORDIC WALKING ASSOCIATION OF NORTH AMERICA NWANA" },
				...(statistics ? { statistics } : {}),
			},
		],
	};
}

/** Stubs the OAuth refresh and the channels endpoint; returns fetch calls. */
function stubYouTubeApi(channelsHandler: (url: string) => Response): FetchCall[] {
	return stubFetch((url) => {
		if (url === "https://oauth2.googleapis.com/token") {
			return jsonResponse({ access_token: "test-access-token" });
		}
		if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) {
			return channelsHandler(url);
		}
		throw new Error(`Unexpected fetch: ${url}`);
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("getYouTubeChannelMetrics", () => {
	it("requests part=id,snippet,statistics and parses string counts to integers", async () => {
		const calls = stubYouTubeApi(() =>
			jsonResponse(
				channelPayload({
					subscriberCount: "20",
					viewCount: "1024",
					videoCount: "18",
				}),
			),
		);
		const result = await getYouTubeChannelMetrics(await envWithCredential());

		const channelsCall = calls.find((call) =>
			call.url.startsWith("https://www.googleapis.com/youtube/v3/channels"),
		);
		expect(channelsCall).toBeDefined();
		const part = new URL(channelsCall!.url).searchParams.get("part");
		expect(part).toContain("statistics");
		expect(part).toContain("id");
		expect(part).toContain("snippet");

		expect(result.ok).toBe(true);
		expect(result.channel_id).toBe("UC2f_TSMW1BWKThUy6XV1onw");
		expect(result.channel_title).toBe("NORDIC WALKING ASSOCIATION OF NORTH AMERICA NWANA");
		const byName = Object.fromEntries(result.metrics.map((metric) => [metric.metric_name, metric]));
		expect(byName["youtube.subscribers"].value).toBe(20);
		expect(byName["youtube.total_views"].value).toBe(1024);
		expect(byName["youtube.video_count"].value).toBe(18);
		for (const metric of result.metrics) {
			expect(metric.source).toBe("youtube");
			expect(metric.source_account).toBe("UC2f_TSMW1BWKThUy6XV1onw");
			expect(metric.unit).toBe("count");
			expect(metric.data_quality).toBe("LIVE_VERIFIED");
			expect(typeof metric.fetched_at).toBe("string");
		}
	});

	it("handles a missing statistics part without throwing", async () => {
		stubYouTubeApi(() => jsonResponse(channelPayload()));
		const result = await getYouTubeChannelMetrics(await envWithCredential());
		expect(result.ok).toBe(true);
		expect(result.metrics.map((metric) => metric.value)).toEqual([0, 0, 0]);
	});

	it("maps non-numeric and negative counts to 0", async () => {
		stubYouTubeApi(() =>
			jsonResponse(
				channelPayload({
					subscriberCount: "not-a-number",
					viewCount: "-5",
					videoCount: "007",
				}),
			),
		);
		const result = await getYouTubeChannelMetrics(await envWithCredential());
		expect(result.ok).toBe(true);
		expect(result.metrics.map((metric) => metric.value)).toEqual([0, 0, 7]);
	});

	it("maps 401/403 to SOURCE_AUTH_ERROR without throwing", async () => {
		for (const status of [401, 403]) {
			stubYouTubeApi(() => jsonResponse({ error: { message: "auth failed" } }, status));
			const result = await getYouTubeChannelMetrics(await envWithCredential());
			expect(result.ok).toBe(false);
			expect(result.metrics).toEqual([]);
			expect(result.data_quality).toBe("SOURCE_AUTH_ERROR");
			expect(typeof result.error).toBe("string");
		}
	});

	it("maps a server failure to SOURCE_API_ERROR without throwing", async () => {
		stubYouTubeApi(() => jsonResponse({ error: { message: "backend error" } }, 500));
		const result = await getYouTubeChannelMetrics(await envWithCredential());
		expect(result.ok).toBe(false);
		expect(result.data_quality).toBe("SOURCE_API_ERROR");
	});

	it("returns OWNER_ACTION_REQUIRED when no OAuth credential is stored", async () => {
		const db = {
			prepare: () => ({
				bind: () => ({
					first: async () => null,
					run: async () => ({}),
				}),
			}),
		};
		const result = await getYouTubeChannelMetrics(
			baseEnv({ nwana_engine_db: db as unknown as D1Database }),
		);
		expect(result.ok).toBe(false);
		expect(result.data_quality).toBe("OWNER_ACTION_REQUIRED");
		expect(result.error).toContain("not connected");
	});

	it("returns OWNER_ACTION_REQUIRED when configuration is missing", async () => {
		const result = await getYouTubeChannelMetrics(
			baseEnv({ GOOGLE_ADS_CLIENT_ID: undefined }),
		);
		expect(result.ok).toBe(false);
		expect(result.data_quality).toBe("OWNER_ACTION_REQUIRED");
	});
});

describe("getYouTubeStatus", () => {
	it("stays backwards compatible and adds statistics fields", async () => {
		stubYouTubeApi(() =>
			jsonResponse(
				channelPayload({
					subscriberCount: "20",
					viewCount: "1024",
					videoCount: "18",
				}),
			),
		);
		const status = await getYouTubeStatus(await envWithCredential());
		expect(status.ok).toBe(true);
		expect(status.connected).toBe(true);
		expect(status.configured).toBe(true);
		expect(status.channel_id).toBe("UC2f_TSMW1BWKThUy6XV1onw");
		expect(status.channel_title).toBe("NORDIC WALKING ASSOCIATION OF NORTH AMERICA NWANA");
		expect(status.subscriber_count).toBe(20);
		expect(status.total_views).toBe(1024);
		expect(status.video_count).toBe(18);
	});
});
