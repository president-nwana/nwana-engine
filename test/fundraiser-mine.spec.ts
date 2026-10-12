// Per-user fundraising state mapping tests.
// Source of truth: RunSignup API v2 get-race-fundraisers response format
// (https://runsignup.com/API/v2/race-fundraisers/get-race-fundraisers.json/GET,
// read 2026-10-08). Only mapFundraiserMine + parseMoney are tested here —
// pure functions, no network, no D1.

import { describe, expect, it } from "vitest";
import {
	mapFundraiserMine,
	parseMoney,
	type RunSignupFundraiser,
} from "../src/fundraiser-mine";

describe("parseMoney", () => {
	it("parses RunSignup money strings", () => {
		expect(parseMoney("$1,234.56")).toBe(1234.56);
		expect(parseMoney("$0.00")).toBe(0);
		expect(parseMoney("$250")).toBe(250);
	});
	it("returns null for missing or unparseable values (unknown, never 0)", () => {
		expect(parseMoney(null)).toBeNull();
		expect(parseMoney(undefined)).toBeNull();
		expect(parseMoney("")).toBeNull();
		expect(parseMoney("abc")).toBeNull();
	});
});

const INDIVIDUAL: RunSignupFundraiser = {
	race_fundraiser_id: 3370193,
	race_fundraiser_name: "AF",
	parent_fundraiser_id: null,
	is_team_fundraiser: "F",
	fundraiser_url: "https://runsignup.com/afnw",
	fundraiser_owner: { user_id: 987001 },
	fundraising_goal: "$500.00",
	amount_raised: "$125.50",
	number_of_donations: 3,
};

const TEAM: RunSignupFundraiser = {
	race_fundraiser_id: 3370200,
	race_fundraiser_name: "Hallandale Beach Nordic Walking Fundraising Team",
	parent_fundraiser_id: null,
	is_team_fundraiser: "T",
	fundraiser_url: "https://runsignup.com/team-hbnw",
	fundraising_goal: "$5,000.00",
	amount_raised: "$300.00",
	number_of_donations: 7,
};

describe("mapFundraiserMine", () => {
	it("state 1: no fundraiser -> has_fundraiser false, everything null", () => {
		const s = mapFundraiserMine(987001, []);
		expect(s.has_fundraiser).toBe(false);
		expect(s.fundraiser_id).toBeNull();
		expect(s.personal_raised).toBeNull();
		expect(s.in_team).toBe(false);
		expect(s.team_name).toBeNull();
	});

	it("state 1: other users' fundraisers do not match", () => {
		const s = mapFundraiserMine(111222, [INDIVIDUAL, TEAM]);
		expect(s.has_fundraiser).toBe(false);
		expect(s.in_team).toBe(false);
	});

	it("state 2: fundraiser exists, no team -> personal data only", () => {
		const s = mapFundraiserMine(987001, [INDIVIDUAL, TEAM]);
		expect(s.has_fundraiser).toBe(true);
		expect(s.fundraiser_id).toBe(3370193);
		expect(s.fundraiser_name).toBe("AF");
		expect(s.fundraiser_url).toBe("https://runsignup.com/afnw");
		expect(s.personal_raised).toBe(125.5);
		expect(s.personal_goal).toBe(500);
		expect(s.donors_count).toBe(3);
		expect(s.in_team).toBe(false);
		expect(s.team_fundraiser_id).toBeNull();
		expect(s.team_raised).toBeNull();
	});

	it("state 3: fundraiser + team via parent_fundraiser_id -> full team object, totals separate", () => {
		const withTeam = { ...INDIVIDUAL, parent_fundraiser_id: 3370200 };
		const s = mapFundraiserMine(987001, [withTeam, TEAM]);
		expect(s.has_fundraiser).toBe(true);
		expect(s.in_team).toBe(true);
		expect(s.team_fundraiser_id).toBe(3370200);
		expect(s.team_name).toBe(
			"Hallandale Beach Nordic Walking Fundraising Team",
		);
		expect(s.team_goal).toBe(5000);
		expect(s.team_raised).toBe(300);
		expect(s.team_url).toBe("https://runsignup.com/team-hbnw");
		// Totals are never merged.
		expect(s.personal_raised).toBe(125.5);
		expect(s.personal_raised).not.toBe(
			(s.personal_raised ?? 0) + (s.team_raised ?? 0),
		);
	});

	it("dangling parent_fundraiser_id -> in_team stays false", () => {
		const dangling = { ...INDIVIDUAL, parent_fundraiser_id: 9999999 };
		const s = mapFundraiserMine(987001, [dangling, TEAM]);
		expect(s.has_fundraiser).toBe(true);
		expect(s.in_team).toBe(false);
		expect(s.team_name).toBeNull();
	});

	it("parent pointing at a non-team fundraiser -> in_team stays false", () => {
		const other = { ...INDIVIDUAL, race_fundraiser_id: 555, is_team_fundraiser: "F" };
		const weird = { ...INDIVIDUAL, parent_fundraiser_id: 555 };
		const s = mapFundraiserMine(987001, [weird, other]);
		expect(s.in_team).toBe(false);
	});

	it("never invents pledged amounts: response has no pledged field", () => {
		const s = mapFundraiserMine(987001, [INDIVIDUAL]);
		expect("pledged" in s).toBe(false);
		expect("pledge" in s).toBe(false);
	});

	it("handles string ids and missing owner gracefully", () => {
		const strIds: RunSignupFundraiser = {
			...INDIVIDUAL,
			race_fundraiser_id: "3370193",
			fundraiser_owner: { user_id: "987001" },
		};
		const s = mapFundraiserMine(987001, [strIds]);
		expect(s.has_fundraiser).toBe(true);
		expect(s.fundraiser_id).toBe(3370193);

		const noOwner: RunSignupFundraiser = { ...INDIVIDUAL };
		delete noOwner.fundraiser_owner;
		expect(mapFundraiserMine(987001, [noOwner]).has_fundraiser).toBe(false);
	});
});
