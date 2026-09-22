import { describe, expect, it } from "vitest";
import {
	autoPublishRaceAnnouncedNews,
	backfillRaceEventFirstSeen,
	buildRaceAnnouncementNews,
	raceAnnouncementSlug,
} from "../src/operating-center";

describe("race announcement slug", () => {
	it("derives a deterministic URL-safe slug from series, distance, and event id", () => {
		expect(raceAnnouncementSlug("SERIES_2026", "3K", 12345)).toBe(
			"race-announced-series-2026-3k-12345",
		);
	});

	it("falls back to a plain slug for empty parts", () => {
		expect(raceAnnouncementSlug("", "", 0)).toBe("race-announced-0");
	});
});

describe("buildRaceAnnouncementNews", () => {
	it("announces name, date, distance, and the registration link", () => {
		const news = buildRaceAnnouncementNews({
			series: "SERIES_2026",
			distance: "3K",
			raceId: 210010,
			eventId: 12345,
			eventName: "NWANA Virtual 3K",
			eventDate: "2026-10-03",
			registrationUrl: "https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual3K",
		});
		expect(news.title).toBe("New race announced: NWANA Virtual 3K");
		expect(news.slug).toBe("race-announced-series-2026-3k-12345");
		expect(news.body_html).toContain("NWANA Virtual 3K");
		expect(news.body_html).toContain("2026-10-03");
		expect(news.body_html).toContain("Distance: 3K.");
		expect(news.body_html).toContain(
			'href="https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual3K"',
		);
	});

	it("falls back to a distance label when the event name is missing", () => {
		const news = buildRaceAnnouncementNews({
			series: "SERIES_2026",
			distance: "5K",
			raceId: 210011,
			eventId: 77,
			eventName: null,
			eventDate: null,
			registrationUrl: null,
		});
		expect(news.title).toBe("New race announced: NWANA 5K");
		expect(news.body_html).not.toContain("RunSignup");
		expect(news.body_html).toContain("Distance: 5K.");
	});

	it("escapes HTML in event names, dates, and registration URLs", () => {
		const news = buildRaceAnnouncementNews({
			series: "SERIES_2026",
			distance: "1K",
			raceId: 1,
			eventId: 2,
			eventName: 'Race <script>alert("x")</script>',
			eventDate: "2026-10-03",
			registrationUrl: 'https://example.com/?a=1&b=<x>"',
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

describe("race announcement persistence (in-memory D1 stub)", () => {
	type Row = Record<string, unknown>;

	function makeDb(eventResultRows: Row[] = []) {
		const firstSeen: Row[] = [];
		const news: Row[] = [];
		const db = {
			prepare(sql: string) {
				return {
					bind(...args: unknown[]) {
						return {
							async first() {
								if (sql.includes("FROM race_event_first_seen WHERE")) {
									const [series, distance, event_id] = args;
									return (
										firstSeen.find(
											(row) =>
												row.series === series &&
												row.distance === distance &&
												row.event_id === event_id,
										) ?? null
									);
								}
								return null;
							},
							async run() {
								if (sql.includes("INTO race_event_first_seen")) {
									if (sql.includes("FROM race_event_results")) {
										const seenAt = args[0];
										let changes = 0;
										for (const row of eventResultRows) {
											const exists = firstSeen.some(
												(known) =>
													known.series === row.series &&
													known.distance === row.distance &&
													known.event_id === row.event_id,
											);
											if (!exists) {
												firstSeen.push({ ...row, first_seen_at: seenAt });
												changes += 1;
											}
										}
										return { meta: { changes } };
									}
									const [series, distance, race_id, event_id, event_name, event_date, first_seen_at] =
										args;
									const exists = firstSeen.some(
										(row) =>
											row.series === series &&
											row.distance === distance &&
											row.event_id === event_id,
									);
									if (!exists) {
										firstSeen.push({
											series,
											distance,
											race_id,
											event_id,
											event_name,
											event_date,
											first_seen_at,
										});
									}
									return { meta: { changes: exists ? 0 : 1 } };
								}
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
		return { db: db as unknown as D1Database, firstSeen, news };
	}

	const input = {
		series: "SERIES_2026",
		distance: "3K",
		raceId: 210010,
		eventId: 12345,
		eventName: "NWANA Virtual 3K",
		eventDate: "2026-10-03",
		registrationUrl: "https://runsignup.com/Race/FL/SaintPetersburg/NWANAVirtual3K",
	};

	it("publishes exactly once: the second sighting is skipped", async () => {
		const { db, news } = makeDb();
		const first = await autoPublishRaceAnnouncedNews(db, input);
		expect(first.published).toBe(true);
		expect(first.slug).toBe("race-announced-series-2026-3k-12345");
		const second = await autoPublishRaceAnnouncedNews(db, input);
		expect(second).toEqual({ published: false, skipped: "already_announced" });
		expect(news).toHaveLength(1);
		expect(news[0].title).toBe("New race announced: NWANA Virtual 3K");
	});

	it("backfill marks existing events so they are never announced as new", async () => {
		const existing = {
			series: "SERIES_2026",
			distance: "3K",
			race_id: 210010,
			event_id: 12345,
			event_name: "NWANA Virtual 3K",
			event_date: "2026-09-12",
		};
		const { db, firstSeen, news } = makeDb([existing]);
		const backfill = await backfillRaceEventFirstSeen(db, "2026-09-22T12:00:00.000Z");
		expect(backfill.marked).toBe(1);
		expect(firstSeen).toHaveLength(1);
		// Re-running the backfill marks nothing new.
		expect((await backfillRaceEventFirstSeen(db, "2026-09-22T12:00:00.000Z")).marked).toBe(0);
		// A sync that re-observes the old event announces nothing.
		const outcome = await autoPublishRaceAnnouncedNews(db, input);
		expect(outcome).toEqual({ published: false, skipped: "already_announced" });
		expect(news).toHaveLength(0);
	});
});
