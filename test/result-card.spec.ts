import { describe, expect, it } from "vitest";
import {
	buildResultCardSvg,
	isResultCardDesignReady,
	RESULT_CARD_DESIGN_BLOCKER,
} from "../src/result-card";

describe("Series 2026 result cards", () => {
	it("keeps publication blocked until a visual family is approved", () => {
		expect(isResultCardDesignReady()).toBe(false);
	});

	it("cannot render the rejected geometric placeholder", () => {
		expect(() => buildResultCardSvg({
			publicationKey: "runsignup:series-2026:210000:1178567:666098",
			title: "2026 NWANA Open 3K Nordic Walking Series - September 12, 2026 — Official Results",
			distance: "3K",
			winners: [{
				athlete: "ALBERT FATIKHOV",
				gender: "Men",
				time: "18:25",
				performance_level: "Elite (< 20:00)",
			}],
		})).toThrow(RESULT_CARD_DESIGN_BLOCKER);
	});
});
