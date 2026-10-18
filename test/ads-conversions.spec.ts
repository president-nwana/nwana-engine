import { describe, expect, it } from "vitest";
import {
	ADS_CONVERSION_ACTION_NAMES,
	mapFundraiserSeen,
	mapParticipantRegistration,
	normalizeTimestamp,
	toAdsDateTime,
} from "../src/lib/ads-conversions";

describe("ads-conversions action names (uploader contract)", () => {
	it("expects the three owner-created Import actions verbatim", () => {
		expect(ADS_CONVERSION_ACTION_NAMES).toEqual({
			registration: "Challenge Registration (completed)",
			fundraiser: "Fundraiser Created (completed)",
			donation: "Donation (completed)",
		});
	});
});

describe("normalizeTimestamp", () => {
	it("converts RunSignup space-separated timestamps to ISO UTC", () => {
		expect(normalizeTimestamp("2026-10-12 15:05:36")).toBe("2026-10-12T15:05:36.000Z");
	});
	it("passes ISO timestamps through normalized", () => {
		expect(normalizeTimestamp("2026-10-12T15:05:36.000Z")).toBe("2026-10-12T15:05:36.000Z");
	});
	it("parses the RunSignup participants US format as UTC", () => {
		expect(normalizeTimestamp("10/4/2026 15:21")).toBe("2026-10-04T15:21:00.000Z");
		expect(normalizeTimestamp("1/5/2026 8:05:30")).toBe("2026-01-05T08:05:30.000Z");
	});
	it("returns null for junk and empty values", () => {
		expect(normalizeTimestamp("not a date")).toBeNull();
		expect(normalizeTimestamp("")).toBeNull();
		expect(normalizeTimestamp(null)).toBeNull();
		expect(normalizeTimestamp(undefined)).toBeNull();
	});
});

describe("toAdsDateTime", () => {
	it("formats as yyyy-mm-dd hh:mm:ss+00:00", () => {
		expect(toAdsDateTime("2026-10-12T15:05:36.000Z")).toBe("2026-10-12 15:05:36+00:00");
	});
});

describe("mapParticipantRegistration", () => {
	it("maps a participant with nested user object", () => {
		const mapped = mapParticipantRegistration({
			registration_id: 555,
			event_id: 1222833,
			registration_date: "2026-10-01 08:30:00",
			user: { user_id: 777 },
		});
		expect(mapped).toEqual({
			registration_id: 555,
			rsu_user_id: 777,
			event_id: 1222833,
			registration_date: "2026-10-01T08:30:00.000Z",
		});
	});
	it("falls back to a flat user_id and tolerates missing fields", () => {
		const mapped = mapParticipantRegistration({ registration_id: "556", user_id: 888 });
		expect(mapped?.rsu_user_id).toBe(888);
		expect(mapped?.event_id).toBeNull();
		expect(mapped?.registration_date).toBeNull();
	});
	it("rejects records without a registration_id (free regs included, paid filter absent)", () => {
		expect(mapParticipantRegistration({ user_id: 1 })).toBeNull();
		const free = mapParticipantRegistration({ registration_id: 9, amount_paid: 0 });
		expect(free?.registration_id).toBe(9);
	});
});

describe("mapFundraiserSeen", () => {
	it("maps an individual fundraiser with its owner", () => {
		const mapped = mapFundraiserSeen({
			race_fundraiser_id: 3370193,
			is_team_fundraiser: "F",
			race_fundraiser_name: "Albert F.",
			fundraiser_owner: { user_id: 4242 },
		});
		expect(mapped).toEqual({
			fundraiser_id: "3370193",
			owner_rsu_user_id: 4242,
			is_team: false,
			fundraiser_name: "Albert F.",
		});
	});
	it("flags team fundraisers and tolerates a missing owner", () => {
		const mapped = mapFundraiserSeen({ race_fundraiser_id: "12", is_team_fundraiser: "T" });
		expect(mapped?.is_team).toBe(true);
		expect(mapped?.owner_rsu_user_id).toBeNull();
	});
	it("rejects records without an id", () => {
		expect(mapFundraiserSeen({})).toBeNull();
	});
});
