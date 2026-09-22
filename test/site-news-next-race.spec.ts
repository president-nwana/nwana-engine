import { describe, expect, it } from "vitest";
import {
	autoPublishNextRacePromo,
	buildNextRacePromoNews,
	nextRacePromoSlug,
} from "../src/operating-center";

describe("next race promo slug", () => {
	it("derives a deterministic URL-safe slug from the publication key", () => {
		expect(nextRacePromoSlug("SERIES_2026:5K:209477:777:abc")).toBe(
			"next-race-series-2026-5k-209477-777-abc",
		);
	});

	it("falls back to a plain slug for an empty key", () => {
		expect(nextRacePromoSlug("")).toBe("next-race-news");
	});
});

describe("buildNextRacePromoNews", () => {
	it("promotes name, date, distance, and the registration link", () => {
		const news = buildNextRacePromoNews({
			publicationKey: "SERIES_2026:5K:209477:777:abc",
			next: {
				eventId: 778,
				eventName: "NWANA Virtual 5K",
				eventDate: "2026-10-04",
				distance: "5K",
				registrationUrl: "https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual5K",
			},
		});
		expect(news.title).toBe("Next race: NWANA Virtual 5K");
		expect(news.slug).toBe("next-race-series-2026-5k-209477-777-abc");
		expect(news.body_html).toContain("NWANA Virtual 5K");
		expect(news.body_html).toContain("2026-10-04");
		expect(news.body_html).toContain("Distance: 5K.");
		expect(news.body_html).toContain(
			'href="https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual5K"',
		);
	});

	it("omits the registration line when no link was observed", () => {
		const news = buildNextRacePromoNews({
			publicationKey: "k",
			next: {
				eventId: 778,
				eventName: null,
				eventDate: null,
				distance: "10K",
				registrationUrl: null,
			},
		});
		expect(news.title).toBe("Next race: NWANA 10K");
		expect(news.body_html).not.toContain("Register on RunSignup");
		expect(news.body_html).toContain("Distance: 10K.");
	});

	it("escapes HTML in event names, dates, and registration URLs", () => {
		const news = buildNextRacePromoNews({
			publicationKey: "k",
			next: {
				eventId: 778,
				eventName: 'Race <script>alert("x")</script>',
				eventDate: "2026-10-04",
				distance: "3K",
				registrationUrl: "https://example.com/?a=1&b=<x>\"",
			},
		});
		expect(news.body_html).not.toContain("<script>");
		expect(news.body_html).toContain("&lt;script&gt;");
		expect(news.body_html).toContain(
			'href="https://example.com/?a=1&amp;b=&lt;x&gt;&quot;"',
		);
		// The title is stored raw (the public site escapes it at render
		// time, like publishSiteNews); the body HTML must be pre-escaped.
		expect(news.title).toContain('Race <script>alert("x")</script>');
	});
});

describe("next race promo persistence (in-memory D1 stub)", () => {
	type Row = Record<string, unknown>;

	function makeDb(eventResultRows: Row[] = []) {
		const news: Row[] = [];
		const db = {
			prepare(sql: string) {
				return {
					bind(...args: unknown[]) {
						return {
							async first() {
								if (sql.includes("FROM site_news WHERE")) {
									const [slug] = args;
									return news.find((row) => row.slug === slug) ?? null;
								}
								if (
									sql.includes("FROM race_event_results") &&
									sql.includes("race_id = ?")
								) {
									const [series, race_id, event_id] = args;
									return (
										eventResultRows.find(
											(row) =>
												row.series === series &&
												row.race_id === race_id &&
												row.event_id === event_id,
										) ?? null
									);
								}
								return null;
							},
							async all() {
								if (
									sql.includes("FROM race_event_results") &&
									sql.includes("distance = ?")
								) {
									const [series, distance] = args;
									return {
										results: eventResultRows.filter(
											(row) =>
												row.series === series && row.distance === distance,
										),
									};
								}
								return { results: [] };
							},
							async run() {
								if (sql.includes("INTO site_news")) {
									const [slug, title, body_html, published_at] = args;
									news.push({ slug, title, body_html, published_at });
									return { meta: { changes: 1 } };
								}
								return { meta: { changes: 0 } };
							},
						};
					},
				};
			},
		};
		return { db: db as unknown as D1Database, news };
	}

	const rows: Row[] = [
		{
			series: "SERIES_2026",
			distance: "5K",
			race_id: 209477,
			event_id: 777,
			event_name: "Past 5K",
			event_date: "2026-09-13",
			registration_url: "https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual5K",
		},
		{
			series: "SERIES_2026",
			distance: "5K",
			race_id: 209477,
			event_id: 779,
			event_name: "Later 5K",
			event_date: "2026-10-18",
			registration_url: "https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual5K",
		},
		{
			series: "SERIES_2026",
			distance: "5K",
			race_id: 209477,
			event_id: 778,
			event_name: "Next 5K",
			event_date: "2026-10-04",
			registration_url: "https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual5K",
		},
		{
			series: "SERIES_2026",
			distance: "3K",
			race_id: 210000,
			event_id: 901,
			event_name: "Other distance",
			event_date: "2026-10-05",
			registration_url: "https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual3K",
		},
	];

	const params = {
		publicationKey: "SERIES_2026:5K:209477:777:abc",
		series: "SERIES_2026",
		raceId: 209477,
		eventId: 777,
		nowDate: "2026-09-22",
	};

	it("promotes the earliest future event of the same distance", async () => {
		const { db, news } = makeDb(rows);
		const outcome = await autoPublishNextRacePromo(db, params);
		expect(outcome).toEqual({
			published: true,
			slug: "next-race-series-2026-5k-209477-777-abc",
		});
		expect(news).toHaveLength(1);
		expect(news[0].title).toBe("Next race: Next 5K");
		expect(news[0].body_html as string).toContain("2026-10-04");
		expect(news[0].body_html as string).not.toContain("Later 5K");
		expect(news[0].body_html as string).not.toContain("Other distance");
	});

	it("publishes exactly once: a second publication is skipped", async () => {
		const { db, news } = makeDb(rows);
		const first = await autoPublishNextRacePromo(db, params);
		expect(first.published).toBe(true);
		const second = await autoPublishNextRacePromo(db, params);
		expect(second).toEqual({ published: false, skipped: "already_exists" });
		expect(news).toHaveLength(1);
	});

	it("skips with a reported reason when there is no upcoming race", async () => {
		const { db, news } = makeDb([rows[0]]);
		const outcome = await autoPublishNextRacePromo(db, params);
		expect(outcome).toEqual({ published: false, skipped: "no_upcoming_race" });
		expect(news).toHaveLength(0);
	});

	it("skips with a reported reason when the published event has no stored snapshot", async () => {
		const { db, news } = makeDb([]);
		const outcome = await autoPublishNextRacePromo(db, params);
		expect(outcome).toEqual({
			published: false,
			skipped: "no_results_snapshot",
		});
		expect(news).toHaveLength(0);
	});

	it("normalizes US-format stored dates before the past/future comparison", async () => {
		const usRows: Row[] = [
			{ ...rows[0] },
			{
				series: "SERIES_2026",
				distance: "5K",
				race_id: 209477,
				event_id: 780,
				event_name: "US date 5K",
				event_date: "10/11/2026",
				registration_url: "https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual5K",
			},
		];
		const { db, news } = makeDb(usRows);
		const outcome = await autoPublishNextRacePromo(db, params);
		expect(outcome.published).toBe(true);
		expect(news[0].title).toBe("Next race: US date 5K");
	});
});
