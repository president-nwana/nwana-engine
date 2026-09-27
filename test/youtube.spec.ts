import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildContentRange,
	chunkRanges,
	encryptRefreshToken,
	GOOGLE_YOUTUBE_DEFAULT_REDIRECT_URI,
	publishVideo,
	truncateYouTubeTitle,
	uploadVideo,
	YOUTUBE_SCOPE,
	YOUTUBE_TITLE_LIMIT,
	YOUTUBE_UPLOAD_CHUNK_SIZE,
	youTubeAuthorizationUrl,
	type YouTubeEnv,
} from "../src/youtube";

const TOKEN_KEY = "test-token-key-for-youtube-unit-tests";

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

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("YouTube OAuth", () => {
	it("requests the youtube.upload scope with offline consent", async () => {
		const url = new URL(await youTubeAuthorizationUrl(baseEnv()));
		expect(url.origin).toBe("https://accounts.google.com");
		expect(url.searchParams.get("scope")).toBe(YOUTUBE_SCOPE);
		expect(url.searchParams.get("scope")).toContain("youtube.upload");
		expect(url.searchParams.get("access_type")).toBe("offline");
		expect(url.searchParams.get("prompt")).toBe("consent");
		expect(url.searchParams.get("redirect_uri")).toBe(GOOGLE_YOUTUBE_DEFAULT_REDIRECT_URI);
		expect(url.searchParams.get("state")).toContain(".");
	});

	it("falls back to GOOGLE_ADS_* credentials and honors a redirect override", async () => {
		const url = new URL(await youTubeAuthorizationUrl(baseEnv({
			GOOGLE_YOUTUBE_CLIENT_ID: "yt-client-id",
			GOOGLE_YOUTUBE_REDIRECT_URI: "https://example.com/yt-callback",
		})));
		expect(url.searchParams.get("client_id")).toBe("yt-client-id");
		expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/yt-callback");
	});

	it("refuses to start when no credentials are configured", async () => {
		await expect(youTubeAuthorizationUrl({
			nwana_engine_db: {} as D1Database,
		})).rejects.toThrow("GOOGLE_YOUTUBE_CLIENT_ID");
	});
});

describe("upload chunk math", () => {
	it("splits a 20 MB file into 8 MB ranges with an inclusive end", () => {
		const total = 20 * 1024 * 1024;
		expect(chunkRanges(total, YOUTUBE_UPLOAD_CHUNK_SIZE)).toEqual([
			[0, 8388607],
			[8388608, 16777215],
			[16777216, 20971519],
		]);
	});

	it("builds the exact Content-Range header value", () => {
		expect(buildContentRange(0, 8388607, 20971520)).toBe("bytes 0-8388607/20971520");
		expect(buildContentRange(16777216, 20971519, 20971520)).toBe("bytes 16777216-20971519/20971520");
	});

	it("truncates titles to 100 characters", () => {
		const long = "x".repeat(150);
		expect(truncateYouTubeTitle(long)).toHaveLength(YOUTUBE_TITLE_LIMIT);
		expect(truncateYouTubeTitle("Short title")).toBe("Short title");
	});
});

describe("uploadVideo", () => {
	it("creates the video as unlisted and never touches the public endpoint", async () => {
		const env = await envWithCredential();
		let initBody: Record<string, unknown> = {};
		let putRange: string | null = null;
		const calls = stubFetch((url, init) => {
			if (url === "https://oauth2.googleapis.com/token") {
				return jsonResponse({ access_token: "access-token" });
			}
			if (url === "https://videos.example.com/race.mp4") {
				if (init?.method === "HEAD") return new Response(null, { status: 200 });
				return new Response(new Uint8Array(10).fill(7), {
					status: 200,
					headers: { "content-type": "video/mp4" },
				});
			}
			if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
				initBody = JSON.parse(String(init?.body));
				return new Response(null, {
					status: 200,
					headers: { location: "https://upload.example.com/session/abc" },
				});
			}
			if (url === "https://upload.example.com/session/abc") {
				putRange = new Headers(init?.headers).get("content-range");
				return jsonResponse({ id: "vid123" });
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const result = await uploadVideo(env, {
			sourceUrl: "https://videos.example.com/race.mp4",
			title: "NWANA race video",
			description: "Race highlights",
			tags: ["NordicWalking"],
		});

		expect(result).toEqual({
			video_id: "vid123",
			url: "https://www.youtube.com/watch?v=vid123",
			privacy_status: "unlisted",
		});
		const status = (initBody.status ?? {}) as { privacyStatus?: string };
		expect(status.privacyStatus).toBe("unlisted");
		expect(putRange).toBe("bytes 0-9/10");
		// The public videos endpoint must never be called during upload.
		expect(calls.some((c) => c.url.startsWith("https://www.googleapis.com/youtube/v3/videos"))).toBe(false);
	});
});

describe("publishVideo", () => {
	it("flips the video to public via the videos endpoint", async () => {
		const env = await envWithCredential();
		let putBody: Record<string, unknown> = {};
		let putMethod: string | undefined;
		stubFetch((url, init) => {
			if (url === "https://oauth2.googleapis.com/token") {
				return jsonResponse({ access_token: "access-token" });
			}
			if (url.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
				putMethod = init?.method;
				putBody = JSON.parse(String(init?.body));
				return jsonResponse({ id: "vid123" });
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const result = await publishVideo(env, "vid123");
		expect(result).toEqual({ video_id: "vid123", privacy_status: "public" });
		expect(putMethod).toBe("PUT");
		expect(putBody).toEqual({
			id: "vid123",
			status: { privacyStatus: "public" },
		});
	});
});
