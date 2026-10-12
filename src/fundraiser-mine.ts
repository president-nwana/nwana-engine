/**
 * Per-user fundraising state for the NWANA Charity Challenge Series (race 216323).
 *
 * Data source: RunSignup API v2 get-race-fundraisers
 * (https://api.runsignup.com/rest/v2/race-fundraisers/get-race-fundraisers.json)
 * called with the canonical OAuth token from resolveRunSignupAccessToken()
 * — never a static token.
 *
 * Fundraising Teams are a SEPARATE system from race Groups/Teams:
 * - the user's INDIVIDUAL fundraiser is matched by fundraiser_owner.user_id
 *   (the RunSignup user id) and is_team_fundraiser !== "T";
 * - team membership is indicated by parent_fundraiser_id on the individual
 *   fundraiser pointing at a team fundraiser (is_team_fundraiser === "T").
 *
 * Money rules (product-critical):
 * - amount_raised from RunSignup = money ACTUALLY RECEIVED only. Unpaid
 *   pledges never appear in it (proven live 2026-10-07), so personal_raised
 *   and team_raised are received-only by construction.
 * - team_raised is the TEAM total and is NEVER merged into personal_raised.
 */

import { runSignupGetJson } from "./runsignup-client";
import { resolveRunSignupAccessToken, type RunSignupEnvLike } from "./runsignup-oauth";

export const FUNDRAISER_RACE_ID = 216323;

export interface RunSignupFundraiser {
	race_fundraiser_id?: number | string;
	race_fundraiser_name?: string;
	parent_fundraiser_id?: number | string | null;
	is_team_fundraiser?: string;
	fundraiser_url?: string;
	fundraiser_owner?: { user_id?: number | string };
	fundraising_goal?: string;
	amount_raised?: string;
	number_of_donations?: number | string;
}

export interface FundraiserMineState {
	has_fundraiser: boolean;
	fundraiser_id: number | null;
	fundraiser_name: string | null;
	fundraiser_url: string | null;
	/** Money actually received on the personal fundraiser. Never pledged. */
	personal_raised: number | null;
	personal_goal: number | null;
	donors_count: number | null;
	in_team: boolean;
	team_fundraiser_id: number | null;
	team_name: string | null;
	team_goal: number | null;
	/** Team total, kept separate from personal_raised. Never merged. */
	team_raised: number | null;
	team_url: string | null;
}

const EMPTY_STATE: FundraiserMineState = {
	has_fundraiser: false,
	fundraiser_id: null,
	fundraiser_name: null,
	fundraiser_url: null,
	personal_raised: null,
	personal_goal: null,
	donors_count: null,
	in_team: false,
	team_fundraiser_id: null,
	team_name: null,
	team_goal: null,
	team_raised: null,
	team_url: null,
};

/**
 * Parse RunSignup money strings like "$1,234.56" into a number.
 * Returns null when the value is missing or unparseable — null means
 * "unknown", never silently 0.
 */
export function parseMoney(raw: unknown): number | null {
	if (raw == null) return null;
	const cleaned = String(raw).replace(/[$,\s]/g, "");
	if (cleaned === "") return null;
	const n = Number(cleaned);
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 100) / 100;
}

function parseCount(raw: unknown): number | null {
	if (raw == null) return null;
	const n = Number(raw);
	return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Pure mapping: RunSignup fundraiser list -> per-user state.
 * The three honest states:
 *  1. no individual fundraiser owned by the user -> has_fundraiser: false;
 *  2. fundraiser, no parent_fundraiser_id      -> in_team: false;
 *  3. fundraiser + parent team                  -> full team object, totals separate.
 */
export function mapFundraiserMine(
	rsuUserId: number,
	fundraisers: RunSignupFundraiser[],
): FundraiserMineState {
	const list = Array.isArray(fundraisers) ? fundraisers : [];
	const mine = list.find(
		(f) =>
			f.is_team_fundraiser !== "T" &&
			Number(f.fundraiser_owner?.user_id) === rsuUserId,
	);
	if (!mine) return { ...EMPTY_STATE };

	const state: FundraiserMineState = {
		...EMPTY_STATE,
		has_fundraiser: true,
		fundraiser_id:
			mine.race_fundraiser_id != null ? Number(mine.race_fundraiser_id) : null,
		fundraiser_name: mine.race_fundraiser_name ?? null,
		fundraiser_url: mine.fundraiser_url ?? null,
		personal_raised: parseMoney(mine.amount_raised),
		personal_goal: parseMoney(mine.fundraising_goal),
		donors_count: parseCount(mine.number_of_donations),
	};

	const parentId =
		mine.parent_fundraiser_id != null
			? Number(mine.parent_fundraiser_id)
			: null;
	if (parentId && Number.isFinite(parentId)) {
		const team = list.find(
			(f) =>
				Number(f.race_fundraiser_id) === parentId &&
				f.is_team_fundraiser === "T",
		);
		if (team) {
			state.in_team = true;
			state.team_fundraiser_id = Number(team.race_fundraiser_id);
			state.team_name = team.race_fundraiser_name ?? null;
			state.team_goal = parseMoney(team.fundraising_goal);
			state.team_raised = parseMoney(team.amount_raised);
			state.team_url = team.fundraiser_url ?? null;
		}
	}
	return state;
}

interface FundraiserApiResponse {
	race_fundraisers?: RunSignupFundraiser[];
}

/**
 * Fetch + map the current user's fundraising state via canonical OAuth.
 * Never throws: failures are returned as { ok: false, error }.
 */
export async function fetchFundraiserMineState(
	env: RunSignupEnvLike,
	rsuUserId: number,
): Promise<
	| { ok: true; state: FundraiserMineState }
	| { ok: false; error: string }
> {
	let token: string;
	try {
		token = await resolveRunSignupAccessToken(env);
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "OAuth token unavailable",
		};
	}
	const apiUrl = new URL(
		"https://api.runsignup.com/rest/v2/race-fundraisers/get-race-fundraisers.json",
	);
	apiUrl.searchParams.set("race_id", String(FUNDRAISER_RACE_ID));
	apiUrl.searchParams.set("included_fundraiser_types", "any");
	apiUrl.searchParams.set("include_amount_raised", "T");
	apiUrl.searchParams.set("include_number_of_donations", "T");
	apiUrl.searchParams.set("num", "500");

	const res = await runSignupGetJson<FundraiserApiResponse>(apiUrl, token);
	if (!res.ok) {
		return {
			ok: false,
			error:
				res.api_error_msg ||
				`RunSignup API error (http ${res.http_status ?? "unknown"})`,
		};
	}
	const list = Array.isArray(res.data?.race_fundraisers)
		? res.data!.race_fundraisers!
		: [];
	return { ok: true, state: mapFundraiserMine(rsuUserId, list) };
}
