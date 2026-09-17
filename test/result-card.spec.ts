import { describe, expect, it } from "vitest";
import {
	buildResultCardSvg,
	selectResultCardVariant,
} from "../src/result-card";

describe("Series 2026 result cards", () => {
	it("keeps the chosen visual stable for the same publication", () => {
		const key = "runsignup:series-2026:210000:1178567:666098";
		expect(selectResultCardVariant(key)).toBe(selectResultCardVariant(key));
	});

	it("renders a branded square card from verified winners", () => {
		const svg = buildResultCardSvg({
			publicationKey: "runsignup:series-2026:210000:1178567:666098",
			title: "2026 NWANA Open 3K Nordic Walking Series - September 12, 2026 — Official Results",
			distance: "3K",
			winners: [{
				athlete: "ALBERT FATIKHOV",
				gender: "Men",
				time: "18:25",
				performance_level: "Elite (< 20:00)",
			}],
		});

		expect(svg).toContain('width="1080" height="1080"');
		expect(svg).toContain("ALBERT FATIKHOV");
		expect(svg).toContain("18:25");
		expect(svg).toContain("2026 NWANA OPEN 3K");
		expect(svg).toContain("genericImage-websiteLogo");
	});
});
