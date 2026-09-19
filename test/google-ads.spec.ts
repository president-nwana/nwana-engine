import { describe, expect, it } from "vitest";
import { googleAdsAuthorizationUrl, GOOGLE_ADS_REDIRECT_URI } from "../src/google-ads";

describe("Google Ads OAuth", () => {
	it("builds a one-time owner authorization request without enabling execution", async () => {
		const url = new URL(await googleAdsAuthorizationUrl({
			nwana_engine_db: {} as D1Database,
			GOOGLE_ADS_CLIENT_ID: "client-id",
			GOOGLE_ADS_CLIENT_SECRET: "client-secret",
			GOOGLE_ADS_TOKEN_KEY: "test-encryption-key",
		}));
		expect(url.origin).toBe("https://accounts.google.com");
		expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/adwords");
		expect(url.searchParams.get("access_type")).toBe("offline");
		expect(url.searchParams.get("prompt")).toBe("consent");
		expect(url.searchParams.get("login_hint")).toBe("admin@nwaofna.org");
		expect(url.searchParams.get("redirect_uri")).toBe(GOOGLE_ADS_REDIRECT_URI);
		expect(url.searchParams.get("state")).toContain(".");
	});

	it("refuses to start when any required secret is absent", async () => {
		await expect(googleAdsAuthorizationUrl({
			nwana_engine_db: {} as D1Database,
			GOOGLE_ADS_CLIENT_ID: "client-id",
		})).rejects.toThrow("GOOGLE_ADS_CLIENT_SECRET");
	});
});
