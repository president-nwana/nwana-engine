import { describe, expect, it } from "vitest";
import {
	buildAllPacks,
	buildPack,
	PACK_CHANNELS,
	PACK_OBJECT_TYPES,
	packObjectTypeLabel,
	type PackObjectData,
} from "../src/manual-distribution-packs";

const FULL_EVENT: PackObjectData = {
	title: "NWANA Open Nordic Walking Series — 5K",
	description: "Virtual race, walk anywhere.",
	eventDate: "October 18, 2026",
	location: "Saint Petersburg, FL",
	distance: "5K",
	format: "virtual",
	registrationUrl: "https://runsignup.com/Race/FL/SaintPetersburg/NWANANWSeries",
	resultsUrl: "https://runsignup.com/Race/Results/209477",
	top3: [
		{ name: "Anna K.", detail: "32:41" },
		{ name: "John D.", detail: "33:02" },
		{ name: "Maria S.", detail: "33:20" },
	],
	deadline: "October 31, 2026",
	mechanics: "Walk 5K anywhere, submit your result with photo evidence.",
	selectionNote: "Top 3 per age group qualify for the championship final.",
};

describe("manual-distribution-packs", () => {
	it("exposes the five object types and six channels", () => {
		expect(PACK_OBJECT_TYPES).toEqual([
			"series_results",
			"competition_event",
			"championship",
			"challenge",
			"news_item",
		]);
		expect(PACK_CHANNELS).toEqual([
			"threads",
			"linkedin",
			"youtube",
			"eventbrite",
			"generic",
		]);
		expect(packObjectTypeLabel("challenge")).toBe("Challenge");
	});

	it("series_results threads pack fits 500 chars and names the winners", () => {
		const pack = buildPack("series_results", FULL_EVENT, "threads");
		expect(pack.text.length).toBeLessThanOrEqual(500);
		expect(pack.truncated).toBe(false);
		expect(pack.text).toContain("Anna K.");
		expect(pack.text).toContain("🥇");
		expect(pack.text).toContain("#OpenSeries");
		expect(pack.text).toContain("#NWANA");
		expect(pack.targetUrl).toBe(FULL_EVENT.resultsUrl);
		expect(pack.imageSpec.kind).toBe("result_card");
		expect(pack.imageSpec.brand).toBe("NWANA");
		expect(pack.missingFields).toEqual([]);
	});

	it("never invents facts: missing data becomes [NEEDS: …] placeholders", () => {
		const pack = buildPack("series_results", {}, "generic");
		expect(pack.missingFields.length).toBeGreaterThan(0);
		expect(pack.text).toContain("[NEEDS: event title]");
		expect(pack.text).toContain("[NEEDS: results URL]");
		expect(pack.text).toContain("[NEEDS: finisher 1 name]");
		// No hallucinated names or dates anywhere in the text.
		expect(pack.text).not.toMatch(/Anna|October|2026|Saint Petersburg/);
	});

	it("competition_event pack carries date, location and registration", () => {
		const pack = buildPack("competition_event", FULL_EVENT, "generic");
		expect(pack.text.length).toBeLessThanOrEqual(4000);
		expect(pack.text).toContain("October 18, 2026");
		expect(pack.text).toContain("Saint Petersburg, FL");
		expect(pack.text).toContain("https://runsignup.com/Race/FL/SaintPetersburg/NWANANWSeries");
		expect(pack.imageSpec.kind).toBe("event_poster");
	});

	it("championship pack uses the first-in-North-America narrative and selection note", () => {
		const pack = buildPack("championship", FULL_EVENT, "linkedin");
		expect(pack.text).toContain("North American");
		expect(pack.text).toContain("Top 3 per age group qualify");
		expect(pack.text).toContain("#Championships");
		expect(pack.text.length).toBeLessThanOrEqual(3000);
	});

	it("challenge pack carries mechanics, deadline and CTA", () => {
		const pack = buildPack("challenge", FULL_EVENT, "threads");
		expect(pack.text).toContain("Walk 5K anywhere");
		expect(pack.text).toContain("October 31, 2026");
		expect(pack.text).toContain("#Challenge");
	});

	it("youtube and eventbrite packs include a length-limited title", () => {
		const yt = buildPack("competition_event", FULL_EVENT, "youtube");
		expect(yt.title).not.toBeNull();
		expect(yt.title!.length).toBeLessThanOrEqual(100);
		const eb = buildPack("competition_event", FULL_EVENT, "eventbrite");
		expect(eb.title!.length).toBeLessThanOrEqual(75);
		const th = buildPack("competition_event", FULL_EVENT, "threads");
		expect(th.title).toBeNull();
	});

	it("linkedin packs carry the B2B angle intro", () => {
		const li = buildPack("series_results", FULL_EVENT, "linkedin");
		const th = buildPack("series_results", FULL_EVENT, "threads");
		expect(li.text).toContain("keeps growing");
		expect(th.text).not.toContain("keeps growing");
	});

	it("flags truncation instead of silently overflowing the channel limit", () => {
		const long: PackObjectData = {
			...FULL_EVENT,
			description: "x".repeat(2000),
		};
		const pack = buildPack("competition_event", long, "threads");
		expect(pack.text.length).toBeLessThanOrEqual(500);
		expect(pack.truncated).toBe(true);
	});

	it("buildAllPacks returns every channel", () => {
		const all = buildAllPacks("challenge", FULL_EVENT);
		expect(Object.keys(all).sort()).toEqual([...PACK_CHANNELS].sort());
		for (const ch of PACK_CHANNELS) {
			expect(all[ch].channel).toBe(ch);
			expect(all[ch].missingFields).toEqual([]);
		}
	});

	// --- news_item / ELITE_ATHLETE_JOINED ---------------------------------

	const SVEN_NEWS: PackObjectData = {
		title: "Sven Thorslund joins the NWANA Elite Athletes Club",
		canonicalUrl: "https://www.nwaofna.org/news/sven-thorslund-joins-elite-athletes-club",
		newsKind: "elite_athlete_joined",
		personName: "Sven Thorslund",
		personProfileUrl: "https://www.nwaofna.org/elite/sven-thorslund",
		achievement:
			"Silver medal, M55 10K, Nordic Walking World Championships, Lahti 2026 · 7th, 5K · selected for the U.S. 5K Relay Team",
		newsDate: "September 26, 2026",
	};

	it("news_item elite_athlete_joined: congratulatory threads pack with canonical link", () => {
		const pack = buildPack("news_item", SVEN_NEWS, "threads");
		expect(pack.text.length).toBeLessThanOrEqual(500);
		expect(pack.truncated).toBe(false);
		expect(pack.text).toContain("Sven Thorslund");
		expect(pack.text).toContain("Elite Athletes Club");
		expect(pack.text).toContain("Silver medal, M55 10K");
		expect(pack.text).toContain("https://www.nwaofna.org/news/sven-thorslund-joins-elite-athletes-club");
		expect(pack.text).toContain("#EliteAthletes");
		expect(pack.text).toContain("#NWANA");
		expect(pack.targetUrl).toBe(SVEN_NEWS.canonicalUrl);
		expect(pack.imageSpec.kind).toBe("announcement");
		expect(pack.imageSpec.headline).toBe("Sven Thorslund");
		expect(pack.missingFields).toEqual([]);
	});

	it("news_item linkedin pack carries the B2B growth intro", () => {
		const pack = buildPack("news_item", SVEN_NEWS, "linkedin");
		expect(pack.text).toContain("Elite Athletes Club is growing");
		expect(pack.text).toContain("Sven Thorslund");
		expect(pack.text.length).toBeLessThanOrEqual(3000);
	});

	it("news_item youtube pack has a length-limited title", () => {
		const pack = buildPack("news_item", SVEN_NEWS, "youtube");
		expect(pack.title).not.toBeNull();
		expect(pack.title!.length).toBeLessThanOrEqual(100);
		expect(pack.title).toContain("Sven Thorslund");
	});

	it("news_item generic pack links the full story and the athlete profile", () => {
		const pack = buildPack("news_item", SVEN_NEWS, "generic");
		expect(pack.text).toContain("https://www.nwaofna.org/news/sven-thorslund-joins-elite-athletes-club");
		expect(pack.text).toContain("https://www.nwaofna.org/elite/sven-thorslund");
	});

	it("buildAllPacks skips eventbrite for news_item (a news item is not an event)", () => {
		const all = buildAllPacks("news_item", SVEN_NEWS);
		expect(Object.keys(all).sort()).toEqual(["generic", "linkedin", "threads", "youtube"]);
	});

	it("news_item with an unknown kind falls back to the generic news frame", () => {
		const pack = buildPack(
			"news_item",
			{
				title: "NWANA Academy opens new cohort",
				canonicalUrl: "https://www.nwaofna.org/news/academy-cohort",
				newsKind: "academy_update",
			},
			"threads",
		);
		expect(pack.text).toContain("NWANA Academy opens new cohort");
		expect(pack.text).toContain("https://www.nwaofna.org/news/academy-cohort");
		expect(pack.text).not.toContain("#EliteAthletes");
		expect(pack.missingFields).toEqual([]);
	});

	it("news_item never invents facts: missing data becomes [NEEDS: …] placeholders", () => {
		const pack = buildPack("news_item", { newsKind: "elite_athlete_joined" }, "generic");
		expect(pack.missingFields.length).toBeGreaterThan(0);
		// The headline is registered as missing (the congratulatory line
		// replaces it in the elite frame); the URL and athlete name show as
		// inline placeholders.
		expect(pack.missingFields).toContain("news headline");
		expect(pack.text).toContain("[NEEDS: canonical news URL]");
		expect(pack.text).toContain("[NEEDS: athlete name]");
		expect(pack.text).not.toMatch(/Sven|Thorslund|Lahti|silver/i);
	});
});
