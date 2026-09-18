import { describe, expect, it } from "vitest";
import {
	buildResultCardSvg,
	isResultCardDesignReady,
} from "../src/result-card";

describe("Series 2026 result cards", () => {
	it("has an approved background available for preview", () => {
		expect(isResultCardDesignReady()).toBe(true);
	});

	it("renders the verified result as the visual priority and shows every level", () => {
		const svg = buildResultCardSvg({
			publicationKey: "runsignup:series-2026:210000:1178567:666098",
			title: "2026 NWANA Open 3K Nordic Walking Series - September 12, 2026 — Official Results",
			distance: "3K",
			winners: [{
				athlete: "ALBERT FATIKHOV",
				gender: "Men",
				time: "18:25",
				performance_level: "Elite (< 20:00)",
				series_record: true,
			}],
		});

		expect(svg).toContain('width="1080" height="1080"');
		expect(svg).toContain("MEN&apos;S SERIES RECORD");
		expect(svg).toContain("ALBERT FATIKHOV");
		expect(svg).toContain("18:25");
		expect(svg).toContain("HIGH PERFORMANCE");
		expect(svg).toContain("COMPETITIVE");
		expect(svg).toContain("NO RESULT THIS STAGE");
		expect(svg).toContain("font-size: 112px");
		expect(svg).toContain("data:image/jpeg;base64,");
	});
	it("selects different approved backgrounds for men's and women's results", () => {
		const base = {
			publicationKey: "result-background-selection",
			title: "2026 NWANA Open 3K Series - September 12, 2026 — Official Results",
			distance: "3K",
		};
		const men = buildResultCardSvg({
			...base,
			winners: [{
				athlete: "Alex Walker",
				gender: "Men",
				time: "18:25",
				performance_level: "Elite (< 20:00)",
			}],
		});
		const women = buildResultCardSvg({
			...base,
			winners: [{
				athlete: "Taylor Walker",
				gender: "Women",
				time: "19:10",
				performance_level: "Elite (< 20:00)",
			}],
		});
		expect(men).not.toBe(women);
		expect(men).toContain("ALEX WALKER");
		expect(women).toContain("TAYLOR WALKER");
	});

});
