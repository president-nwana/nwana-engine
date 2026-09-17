import { describe, expect, it, vi } from "vitest";
import { getFacebookPageToken, publishFacebookResult, publishInstagramResult } from "../src/meta-result-publisher";

function response(data: unknown) {
	return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Meta result publisher", () => {
	it("resolves the NWANA page token without exposing it", async () => {
		const fetcher = vi.fn(async () => response({ data: [{ id: "595301193675669", access_token: "page-secret" }] }));
		await expect(getFacebookPageToken("user-secret", "595301193675669", fetcher as typeof fetch)).resolves.toBe("page-secret");
	});

	it("publishes Facebook and Instagram through their separate endpoints", async () => {
		const facebookFetch = vi.fn(async () => response({ id: "fb-post" }));
		await expect(publishFacebookResult({ pageId: "103190499173992", message: "Results", link: "https://example.com/results", pageToken: "secret", fetcher: facebookFetch as typeof fetch })).resolves.toEqual({ external_id: "fb-post" });

		const instagramFetch = vi.fn()
			.mockResolvedValueOnce(response({ id: "container" }))
			.mockResolvedValueOnce(response({ id: "ig-media" }));
		await expect(publishInstagramResult({ accountId: "17841455094791338", caption: "Results", imageUrl: "https://example.com/result.jpg", userToken: "secret", fetcher: instagramFetch as typeof fetch })).resolves.toEqual({ external_id: "ig-media" });
		expect(instagramFetch).toHaveBeenCalledTimes(2);
		expect(String(facebookFetch.mock.calls[0]?.[0])).toContain("/103190499173992/feed");
		expect(String(instagramFetch.mock.calls[0]?.[0])).toContain("/17841455094791338/media");
	});
});
