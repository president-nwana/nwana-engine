import { describe, expect, it } from "vitest";
import {
	buildWinnerAnnouncementNews,
	winnerAnnouncementSlug,
} from "../src/operating-center";

describe("winner announcement slug", () => {
	it("derives a deterministic URL-safe slug from the publication key", () => {
		expect(winnerAnnouncementSlug("SERIES_2026:3K:12345:678")).toBe(
			"winner-announcement-series-2026-3k-12345-678",
		);
	});

	it("falls back to a plain slug for an empty key", () => {
		expect(winnerAnnouncementSlug("")).toBe("winner-announcement-news");
	});
});

describe("buildWinnerAnnouncementNews", () => {
	const rows = [
		{
			athlete: "Albert Fatikhov",
			gender: "M",
			time: "15:42",
			performance_level: "Elite",
			level_place: "1",
		},
		{
			athlete: "Second Runner",
			gender: "M",
			time: "16:10",
			performance_level: "Elite",
			level_place: "2",
		},
		{
			athlete: "Jane Walker",
			gender: "F",
			time: "19:03",
			performance_level: "Performance",
			level_place: "1",
		},
		{
			athlete: "Open Winner",
			gender: null,
			time: "24:00",
			performance_level: null,
			level_place: "1",
		},
	];

	it("announces only level-place-1 finishers, grouped by level in level order", () => {
		const news = buildWinnerAnnouncementNews({
			publicationKey: "SERIES_2026:3K:1:2",
			eventName: "NWANA Virtual 3K",
			eventDate: "2026-09-12",
			distance: "3K",
			rows,
		});
		expect(news).not.toBeNull();
		expect(news!.title).toBe("Winner congratulations: NWANA Virtual 3K");
		expect(news!.slug).toBe("winner-announcement-series-2026-3k-1-2");
		const eliteAt = news!.body_html.indexOf("<h3>Elite</h3>");
		const performanceAt = news!.body_html.indexOf("<h3>Performance</h3>");
		const openAt = news!.body_html.indexOf("<h3>Open</h3>");
		expect(eliteAt).toBeGreaterThan(-1);
		expect(performanceAt).toBeGreaterThan(eliteAt);
		expect(openAt).toBeGreaterThan(performanceAt);
		expect(news!.body_html).toContain("Albert Fatikhov (M, 15:42)");
		expect(news!.body_html).not.toContain("Second Runner");
		expect(news!.body_html).toContain("Jane Walker (F, 19:03)");
		expect(news!.body_html).toContain("Open Winner (24:00)");
		expect(news!.body_html).toContain("2026-09-12");
		expect(news!.body_html).toContain('href="/results"');
	});

	it("returns null when nobody holds level place 1", () => {
		expect(
			buildWinnerAnnouncementNews({
				publicationKey: "SERIES_2026:3K:1:2",
				eventName: "NWANA Virtual 3K",
				eventDate: null,
				distance: "3K",
				rows: rows.map((row) => ({ ...row, level_place: "2" })),
			}),
		).toBeNull();
	});

	it("escapes HTML in athlete names, levels, and event names", () => {
		const news = buildWinnerAnnouncementNews({
			publicationKey: "k",
			eventName: 'Race <script>alert("x")</script>',
			eventDate: null,
			distance: "3K",
			rows: [
				{
					athlete: 'Evil <img src=x onerror=alert(1)>',
					gender: "M",
					time: "10:00",
					performance_level: "Elite",
					level_place: "1",
				},
			],
		});
		expect(news).not.toBeNull();
		expect(news!.body_html).not.toContain("<script>");
		expect(news!.body_html).not.toContain("<img");
		// The title is stored raw (the public site escapes it at render
		// time, like publishSiteNews); the body HTML must be pre-escaped.
		expect(news!.title).toContain('Race <script>alert("x")</script>');
		expect(news!.body_html).toContain("&lt;img src=x onerror=alert(1)&gt;");
	});

	it("falls back to distance label when the event name is missing", () => {
		const news = buildWinnerAnnouncementNews({
			publicationKey: "k",
			eventName: null,
			eventDate: null,
			distance: "5K",
			rows: [
				{
					athlete: "Solo Winner",
					gender: null,
					time: null,
					performance_level: null,
					level_place: "1",
				},
			],
		});
		expect(news).not.toBeNull();
		expect(news!.title).toBe("Winner congratulations: NWANA 5K");
		expect(news!.body_html).toContain("<li>Solo Winner</li>");
	});
});
