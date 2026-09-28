// Series 2026 registration / participant data layer tests.
//
// Verified facts encoded (official RunSignup API docs, read 2026-09-28):
// - "Get Race Participants": GET https://api.runsignup.com/rest/race/:race_id/participants
// - Auth: OAuth2 Bearer header OR rsu_api_key + X-RSU-API-SECRET (we use Bearer).
// - Key fields: registration_id, event_id, status, registration_date,
//   last_modified, user.user_id, user.first_name, user.last_name.
// - Pagination: page (default 1), results_per_page (default 50).
// - Registrations and results are separate entities; the sync never touches
//   race_event_results.

import { describe, expect, it } from "vitest";
import { parseParticipant } from "../src/series-2026-registrations";

describe("parseParticipant", () => {
	it("parses a full participant record", () => {
		const p = parseParticipant(
			{
				registration_id: 1177636,
				event_id: 664979,
				event_name: "3K",
				status: "active",
				registration_date: "2026-09-01 10:00:00",
				last_modified: "2026-09-02 11:00:00",
				user: { user_id: 555, first_name: "Albert", last_name: "Fatikhov" },
			},
			210000,
			"2026 NWANA Open 3K Nordic Walking Series",
		);
		expect(p).not.toBeNull();
		expect(p?.registrationId).toBe(1177636);
		expect(p?.eventId).toBe(664979);
		expect(p?.userId).toBe(555);
		expect(p?.firstName).toBe("Albert");
		expect(p?.lastName).toBe("Fatikhov");
		expect(p?.status).toBe("active");
		expect(p?.raceId).toBe(210000);
	});

	it("returns null without registration_id or event_id", () => {
		expect(parseParticipant({ event_id: 1 }, 210000, null)).toBeNull();
		expect(parseParticipant({ registration_id: 1 }, 210000, null)).toBeNull();
		expect(parseParticipant(null, 210000, null)).toBeNull();
		expect(parseParticipant("x", 210000, null)).toBeNull();
	});

	it("tolerates missing user block", () => {
		const p = parseParticipant(
			{ registration_id: 7, event_id: 8, status: "active" },
			209980,
			null,
		);
		expect(p).not.toBeNull();
		expect(p?.userId).toBeNull();
		expect(p?.firstName).toBeNull();
	});

	it("keeps the registration identity distinct from results identity", () => {
		// A registration is identified by (race_id, registration_id) — never by
		// athlete name, which is how results identify people.
		const p = parseParticipant(
			{
				registration_id: 42,
				event_id: 43,
				user: { user_id: 99, first_name: "ALBERT", last_name: "FATIKHOV" },
			},
			210000,
			null,
		);
		expect(p?.registrationId).toBe(42);
		expect(p?.userId).toBe(99);
	});
});
