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
});
