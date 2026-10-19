import { describe, expect, it } from "vitest";
import {
	getCabinetView,
	getCrmProspect,
	getCrmProspects,
	getEducationView,
	getFundingPipeline,
	getGrantsView,
	getGroupsRegistryView,
	getPeopleView,
	getTerritoryBudgets,
	getTerritoryDrilldown,
	getTodayQueue,
} from "../src/operating-center-cabinet";

// Fake D1 for the Phase 3 cabinet module.
//
// Choice on the money path (documented per the task): the fake is seeded
// richly enough for getMoneyCycle (imported by the cabinet module) to run
// for real against it. Its queries are answered with canned aggregates
// computed by hand from the seed rows below, using the money-cycle
// conventions (VERIFIED gross only in sums, fundraiser mirror excluded
// from cycle totals). That way the cabinet tests also prove the cabinet
// really reuses getMoneyCycle instead of re-deriving money numbers: the
// Florida money numbers asserted below can only come out of the
// money-cycle Florida query and totals query answered here.
//
// Seed world:
// - Territories: continental, national, Florida (terr-st-12), California,
//   one Florida county, one Florida city. Florida subtree = 3 territories.
// - Groups: 2 Florida FORMING defaults, 1 California ACTIVE.
// - Role instances: 5 PLANNED (1 continental, 2 state, 1 county, 1 group).
// - Prospects: 7 (Florida 1, 2, 4). Tiers A1 x2, A2 x2, B x2, C x1.
//   Enrolled: 1, 2, 4, 5, 7. Sends exist for 1, 2, 4, 5.
// - Replies: prospect 1 (other, draft response for Albert), prospect 2
//   (interested), prospect 3 (question).
// - Money events (hand-aggregated in the money-cycle answers below):
//   donation_received VERIFIED 10000c FL city, prospect 1;
//   registration_paid VERIFIED 5000c terr-us;
//   fundraiser_donation_received VERIFIED 9999c FL city (mirror);
//   sponsorship_received UNKNOWN 25000c terr-st-12;
//   license_purchased VERIFIED 0c, territory NULL (unattributed);
//   donation_received UNKNOWN 7000c terr-us.
// - Academy snapshot: course 2, 15 enrolled, 2 certified.
// - Form submissions: 2 NEW individual-instructor-application, 1 REVIEWED
//   contact.

const GATES = [
	{ lane: "contract", scope: "FL", status: "OPEN", basis: "services, not solicitation", source: "Phase 1A memo", updated_at: "2026-10-17" },
	{ lane: "donation", scope: "ALL", status: "CLOSED", basis: "no state gate passed", source: "TZ 8.2", updated_at: "2026-10-17" },
	{ lane: "donation", scope: "FL", status: "CLOSED", basis: "FDACS registration not approved", source: "Phase 1A memo", updated_at: "2026-10-17" },
	{ lane: "grant", scope: "ALL", status: "OWNER_STOP", basis: "owner stop order 2026-10-15", source: "TZ 5.5", updated_at: "2026-10-17" },
	{ lane: "sponsorship", scope: "FL", status: "OPEN", basis: "own B2B gate", source: "Phase 1A memo", updated_at: "2026-10-17" },
];

const TERRITORIES: Record<string, { territory_id: string; type: string; name: string; parent_territory_id: string | null }> = {
	"terr-continental-nwana": { territory_id: "terr-continental-nwana", type: "CONTINENTAL", name: "NWANA Center", parent_territory_id: null },
	"terr-us": { territory_id: "terr-us", type: "NATIONAL", name: "NWANA USA", parent_territory_id: "terr-continental-nwana" },
	"terr-st-12": { territory_id: "terr-st-12", type: "STATE", name: "Florida", parent_territory_id: "terr-us" },
	"terr-st-06": { territory_id: "terr-st-06", type: "STATE", name: "California", parent_territory_id: "terr-us" },
	"terr-county-12086": { territory_id: "terr-county-12086", type: "COUNTY", name: "Miami-Dade County", parent_territory_id: "terr-st-12" },
	"terr-city-1245000": { territory_id: "terr-city-1245000", type: "CITY", name: "Miami", parent_territory_id: "terr-county-12086" },
};

const PROSPECTS: Record<number, Record<string, unknown>> = {
	1: { id: 1, track: "sponsor-kilometers", org_name: "Florida Org A", contact_name: "Ann A", contact_email: "ann@orga.example", contact_title: "VP Partnerships", contact_level: "A1", city_state: "Miami, FL", source: "research", stage: "new", sequence_enrolled_at: "2026-10-11T00:00:00Z", enrolled_by: "operator", territory_id: "terr-city-1245000", created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", unsubscribe_token: "tok-secret-1" },
	2: { id: 2, track: "instructor-training", org_name: "Florida Health", contact_name: "Ben B", contact_email: "ben@health.example", contact_title: "Director", contact_level: "A2", city_state: "Miami, FL", source: "research", stage: "replied", sequence_enrolled_at: "2026-10-09T00:00:00Z", enrolled_by: "operator", territory_id: "terr-county-12086", created_at: "2026-10-09T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", unsubscribe_token: "tok-secret-2" },
	4: { id: 4, track: "sponsor-kilometers", org_name: "Follow Org", contact_name: "Dee D", contact_email: "dee@follow.example", contact_title: "Owner", contact_level: "A1", city_state: "Tampa, FL", source: "research", stage: "new", sequence_enrolled_at: "2026-10-10T00:00:00Z", enrolled_by: "operator", territory_id: "terr-st-12", created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", unsubscribe_token: "tok-secret-4" },
};

const SENDS = [
	{ prospect_id: 1, sequence_step: 1, sent_at: "2026-10-17T00:00:00Z" },
	{ prospect_id: 2, sequence_step: 1, sent_at: "2026-10-01T00:00:00Z" },
	{ prospect_id: 4, sequence_step: 1, sent_at: "2026-10-11T00:00:00Z" },
	{ prospect_id: 5, sequence_step: 1, sent_at: "2026-10-01T00:00:00Z" },
];

const CONFIG = [
	{ track: "sponsor-kilometers", step: 1, delay_days: 0 },
	{ track: "sponsor-kilometers", step: 2, delay_days: 7 },
	{ track: "sponsor-kilometers", step: 3, delay_days: 14 },
	{ track: "corporate-teams", step: 1, delay_days: 0 },
	{ track: "corporate-teams", step: 2, delay_days: 7 },
	{ track: "corporate-teams", step: 3, delay_days: 14 },
	{ track: "instructor-training", step: 1, delay_days: 0 },
	{ track: "instructor-training", step: 2, delay_days: 7 },
	{ track: "instructor-training", step: 3, delay_days: 14 },
];

const CRM_ROWS = [
	{ id: 1, org_name: "Florida Org A", contact_name: "Ann A", contact_title: "VP Partnerships", contact_level: "A1", track: "sponsor-kilometers", stage: "new", city_state: "Miami, FL", territory_id: "terr-city-1245000", territory_name: "Miami", enrolled: 1, sends: 1, last_sent_at: "2026-10-17T00:00:00Z", replies: 1, last_reply_classification: "other" },
	{ id: 2, org_name: "Florida Health", contact_name: "Ben B", contact_title: "Director", contact_level: "A2", track: "instructor-training", stage: "replied", city_state: "Miami, FL", territory_id: "terr-county-12086", territory_name: "Miami-Dade County", enrolled: 1, sends: 1, last_sent_at: "2026-10-01T00:00:00Z", replies: 1, last_reply_classification: "interested" },
	{ id: 3, org_name: "National Corp", contact_name: "Cat C", contact_title: "Manager", contact_level: "B", track: "corporate-teams", stage: "new", city_state: "Austin, TX", territory_id: "terr-us", territory_name: "NWANA USA", enrolled: 0, sends: 0, last_sent_at: null, replies: 1, last_reply_classification: "question" },
	{ id: 4, org_name: "Follow Org", contact_name: "Dee D", contact_title: "Owner", contact_level: "A1", track: "sponsor-kilometers", stage: "new", city_state: "Tampa, FL", territory_id: "terr-st-12", territory_name: "Florida", enrolled: 1, sends: 1, last_sent_at: "2026-10-11T00:00:00Z", replies: 0, last_reply_classification: null },
	{ id: 5, org_name: "Suppressed Org", contact_name: "Eli E", contact_title: "Lead", contact_level: "B", track: "corporate-teams", stage: "new", city_state: "Denver, CO", territory_id: "terr-us", territory_name: "NWANA USA", enrolled: 1, sends: 1, last_sent_at: "2026-10-01T00:00:00Z", replies: 0, last_reply_classification: null },
	{ id: 7, org_name: "Queued Org", contact_name: "Gus G", contact_title: "Lead", contact_level: "A2", track: "corporate-teams", stage: "new", city_state: "Boston, MA", territory_id: "terr-us", territory_name: "NWANA USA", enrolled: 1, sends: 0, last_sent_at: null, replies: 0, last_reply_classification: null },
	{ id: 6, org_name: "Tiny Org", contact_name: "Fay F", contact_title: "Lead", contact_level: "C", track: "instructor-training", stage: "new", city_state: "Boise, ID", territory_id: "terr-us", territory_name: "NWANA USA", enrolled: 0, sends: 0, last_sent_at: null, replies: 0, last_reply_classification: null },
];

const FL_SUBTREE_FRAGMENT = "SELECT territory_id FROM territories WHERE territory_id = 'terr-st-12'";

function makeDb() {
	const first = (sql: string, binds: unknown[]): unknown => {
		// getMoneyCycle Florida cycle counts (checked first: its SQL embeds
		// many prospect / money subqueries of its own).
		if (sql.includes("AS sources")) {
			return { sources: 3, sent: 3, replies: 2, interested: 1, receipts: 2, receipts_gross: 10000, b2b_receipts: 1 };
		}
		if (sql.includes("money_received_cents")) {
			return {
				prospect_id: 2, org_name: "Florida Health", track: "instructor-training", city_state: "Miami, FL",
				first_sent_at: "2026-10-01T00:00:00Z", reply_classification: "interested",
				reply_received_at: "2026-10-15T00:00:00Z", money_received_cents: 0,
			};
		}
		if (sql.includes("FROM funding_lane_gates WHERE lane = ?")) {
			return GATES.find((g) => g.lane === binds[0] && g.scope === binds[1]) ?? null;
		}
		if (sql.includes("FROM territories WHERE territory_id = ?")) {
			return TERRITORIES[String(binds[0])] ?? null;
		}
		if (sql.includes("FROM sponsor_commitments")) return { n: 0, cents: 0 };
		if (sql.includes("FROM outreach_prospects WHERE id = ?")) {
			return PROSPECTS[Number(binds[0])] ?? null;
		}
		if (sql.includes("FROM money_events WHERE territory_id IS NULL")) return { n: 1 };
		if (sql.includes("FROM role_instances")) {
			if (sql.includes("status = 'PLANNED'")) {
				if (sql.includes(FL_SUBTREE_FRAGMENT)) return { n: 3 };
				if (sql.includes("territory_id IN (?, ?)")) return { n: 1 };
				if (sql.includes("territory_id = ?")) return { n: 1 };
				return { n: 5 };
			}
			if (sql.includes(FL_SUBTREE_FRAGMENT)) return { n: 3 };
			if (sql.includes("territory_id = ?")) return { n: 1 };
			return { n: 5 };
		}
		if (sql.includes("FROM outreach_prospects")) {
			if (sql.includes("NOT EXISTS")) return { n: 1 };
			if (sql.includes("sequence_enrolled_at IS NOT NULL")) return { n: 5 };
			if (sql.includes("contact_level IN ('A1', 'A2')")) {
				return { n: sql.includes(FL_SUBTREE_FRAGMENT) ? 3 : 4 };
			}
			if (sql.includes("territory_id = ?")) return { n: 1 };
			if (sql.includes(FL_SUBTREE_FRAGMENT)) return { n: 3 };
			if (sql.includes("FROM outreach_prospects p WHERE 1 = 1")) {
				if (sql.includes("p.track = ?")) return { n: CRM_ROWS.filter((r) => r.track === binds[0]).length };
				if (sql.includes("p.contact_level = ?")) return { n: CRM_ROWS.filter((r) => r.contact_level === binds[0]).length };
				return { n: 7 };
			}
			return { n: 7 };
		}
		if (sql.includes("COUNT(DISTINCT s.prospect_id)")) return { n: 3 };
		if (sql.includes("COUNT(DISTINCT r.prospect_id)")) return { n: 2 };
		if (sql.includes("COUNT(DISTINCT prospect_id) AS n FROM outreach_sends")) return { n: 4 };
		if (sql.includes("COUNT(DISTINCT prospect_id) AS n FROM outreach_replies")) return { n: 3 };
		if (sql.includes("FROM applications")) return { n: 0 };
		if (sql.includes("FROM nw_group_categories")) return { n: 14 };
		if (sql.trim().startsWith("SELECT COUNT(*) AS n FROM territories")) return { n: 6 };
		return null;
	};

	const all = (sql: string, binds: unknown[]): unknown[] => {
		if (sql.includes("FROM funding_lane_gates")) return GATES;
		// Money queries: budgets / Florida by-lane carry the VERIFIED filter;
		// the money-cycle totals query does not.
		if (sql.includes("FROM money_events") && sql.includes("GROUP BY event_type, funding_lane")) {
			if (sql.includes("WHERE gross_status = 'VERIFIED' AND event_type IN")) {
				if (sql.includes(FL_SUBTREE_FRAGMENT)) {
					return [{ event_type: "donation_received", funding_lane: "donation", events: 1, cents: 10000 }];
				}
				if (binds.includes("terr-continental-nwana")) {
					return [{ event_type: "registration_paid", funding_lane: "registration", events: 1, cents: 5000 }];
				}
				return [
					{ event_type: "donation_received", funding_lane: "donation", events: 1, cents: 10000 },
					{ event_type: "license_purchased", funding_lane: "license", events: 1, cents: 0 },
					{ event_type: "registration_paid", funding_lane: "registration", events: 1, cents: 5000 },
				];
			}
			return [
				{ event_type: "donation_received", funding_lane: "donation", events: 2, gross_cents: 10000 },
				{ event_type: "license_purchased", funding_lane: "license", events: 1, gross_cents: 0 },
				{ event_type: "registration_paid", funding_lane: "registration", events: 1, gross_cents: 5000 },
				{ event_type: "sponsorship_received", funding_lane: "sponsorship", events: 1, gross_cents: 0 },
			];
		}
		if (sql.includes("e.event_key")) return [];
		if (sql.includes("FROM money_events WHERE source_prospect_id = ?")) {
			return binds[0] === 1
				? [{ event_type: "donation_received", funding_lane: "donation", gross_cents: 10000, occurred_at: "2026-10-15T00:00:00Z", territory_id: "terr-city-1245000" }]
				: [];
		}
		if (sql.includes("WHERE r.engine_action LIKE '%draft response for Albert%'")) {
			return [{ prospect_id: 1, org_name: "Florida Org A", classification: "other", received_at: "2026-10-16T00:00:00Z", engine_action: "draft response for Albert: reply draft prepared" }];
		}
		if (sql.includes("classification IN ('interested', 'question')")) {
			return [
				{ prospect_id: 3, org_name: "National Corp", classification: "question", received_at: "2026-10-14T00:00:00Z" },
				{ prospect_id: 2, org_name: "Florida Health", classification: "interested", received_at: "2026-10-15T00:00:00Z" },
			];
		}
		if (sql.includes("FROM outreach_sends WHERE prospect_id = ?")) {
			return SENDS.filter((s) => s.prospect_id === binds[0]);
		}
		if (sql.includes("FROM outreach_replies WHERE prospect_id = ?")) {
			if (binds[0] === 1) {
				return [{ classification: "other", received_at: "2026-10-16T00:00:00Z", engine_action: "draft response for Albert: reply draft prepared" }];
			}
			return [];
		}
		if (sql.includes("SELECT prospect_id, sequence_step, sent_at FROM outreach_sends")) return SENDS;
		if (sql.includes("FROM outreach_sequence_config")) return CONFIG;
		if (sql.includes("FROM outreach_suppressions")) return [{ email: "eli@suppressed.example" }];
		if (sql.includes("SELECT id, org_name, track, stage, contact_email FROM outreach_prospects")) {
			return [
				{ id: 1, org_name: "Florida Org A", track: "sponsor-kilometers", stage: "new", contact_email: "ann@orga.example" },
				{ id: 3, org_name: "National Corp", track: "corporate-teams", stage: "new", contact_email: "cat@corp.example" },
				{ id: 4, org_name: "Follow Org", track: "sponsor-kilometers", stage: "new", contact_email: "dee@follow.example" },
				{ id: 5, org_name: "Suppressed Org", track: "corporate-teams", stage: "new", contact_email: "eli@suppressed.example" },
				{ id: 6, org_name: "Tiny Org", track: "instructor-training", stage: "new", contact_email: "fay@tiny.example" },
				{ id: 7, org_name: "Queued Org", track: "corporate-teams", stage: "new", contact_email: "gus@queued.example" },
			];
		}
		if (sql.includes("FROM challenge_form_submissions WHERE status = 'NEW'")) {
			return [{ form_type: "individual-instructor-application", n: 2 }];
		}
		if (sql.includes("FROM challenge_form_submissions GROUP BY form_type, status")) {
			return [
				{ form_type: "contact", status: "REVIEWED", n: 1 },
				{ form_type: "individual-instructor-application", status: "NEW", n: 2 },
			];
		}
		if (sql.includes("FROM academy_instructor_snapshot")) {
			return [{ course_id: 2, enrolled: 15, certified: 2, last_sync: "2026-10-17T10:13:17Z" }];
		}
		if (sql.includes("last_reply_classification")) {
			if (sql.includes(FL_SUBTREE_FRAGMENT)) return CRM_ROWS.filter((r) => [1, 2, 4].includes(r.id));
			if (sql.includes("p.track = ?")) return CRM_ROWS.filter((r) => r.track === binds[0]);
			return CRM_ROWS;
		}
		if (sql.includes("FROM territories WHERE type IN ('CONTINENTAL', 'NATIONAL')")) {
			return [
				{ territory_id: "terr-continental-nwana", type: "CONTINENTAL" },
				{ territory_id: "terr-us", type: "NATIONAL" },
			];
		}
		if (sql.includes("FROM territories WHERE parent_territory_id = ?")) {
			if (sql.includes("GROUP BY type")) {
				return binds[0] === "terr-st-12" ? [{ type: "COUNTY", n: 1 }] : [];
			}
			return binds[0] === "terr-st-12"
				? [{ territory_id: "terr-county-12086", type: "COUNTY", name: "Miami-Dade County" }]
				: [];
		}
		// Only the territories-by-type queries themselves: many other
		// queries embed the Florida subtree subquery, which also contains
		// the words FROM territories, and must fall through to their own
		// table branches below.
		if (sql.trim().startsWith("SELECT type, COUNT(*) AS n FROM territories")) {
			if (sql.includes("state_fips = '12'")) {
				return [
					{ type: "CITY", n: 1 },
					{ type: "COUNTY", n: 1 },
					{ type: "STATE", n: 1 },
				];
			}
			return [
				{ type: "CITY", n: 1 },
				{ type: "CONTINENTAL", n: 1 },
				{ type: "COUNTY", n: 1 },
				{ type: "NATIONAL", n: 1 },
				{ type: "STATE", n: 2 },
			];
		}
		if (sql.includes("FROM nw_groups")) {
			if (sql.includes("WHERE territory_id = ?")) {
				return binds[0] === "terr-st-12"
					? [{ group_id: "g-fl-2", name: "Florida State Group", group_number: 1, status: "FORMING", is_default: 1, category_key: "general", leader_name: null, leader_role: null }]
					: [];
			}
			if (sql.includes(FL_SUBTREE_FRAGMENT)) return [{ status: "FORMING", n: 2, defaults: 2 }];
			return [
				{ status: "ACTIVE", n: 1, defaults: 0 },
				{ status: "FORMING", n: 2, defaults: 2 },
			];
		}
		if (sql.includes("FROM role_instances")) {
			if (sql.includes("GROUP BY r.template_id")) {
				if (sql.includes(FL_SUBTREE_FRAGMENT)) {
					return [
						{ template_id: "county_coordinator", title: "County Coordinator", n: 1 },
						{ template_id: "group_director", title: "Group Director", n: 1 },
						{ template_id: "state_coordinator", title: "State Coordinator", n: 1 },
					];
				}
				return [{ template_id: "president", title: "President", scope_type: "CONTINENTAL", n: 1 }];
			}
			if (sql.includes("GROUP BY t.scope_type")) {
				const fl = sql.includes(FL_SUBTREE_FRAGMENT);
				const hq = sql.includes("IN (?, ?)");
				if (sql.includes("status = 'PLANNED'") || sql.includes("r.status = 'PLANNED'")) {
					if (fl) return [{ scope_type: "COUNTY", n: 1 }, { scope_type: "GROUP", n: 1 }, { scope_type: "STATE", n: 1 }];
					if (hq) return [{ scope_type: "CONTINENTAL", n: 1 }];
					return [
						{ scope_type: "CONTINENTAL", n: 1 },
						{ scope_type: "COUNTY", n: 1 },
						{ scope_type: "GROUP", n: 1 },
						{ scope_type: "STATE", n: 2 },
					];
				}
				if (fl) return [{ scope_type: "COUNTY", n: 1 }, { scope_type: "GROUP", n: 1 }, { scope_type: "STATE", n: 1 }];
				return [
					{ scope_type: "CONTINENTAL", n: 1 },
					{ scope_type: "COUNTY", n: 1 },
					{ scope_type: "GROUP", n: 1 },
					{ scope_type: "STATE", n: 2 },
				];
			}
			if (sql.includes("GROUP BY status")) return [{ status: "PLANNED", n: 5 }];
			return [];
		}
		if (sql.includes("FROM role_templates")) {
			return [
				{ template_id: "president", title: "President", scope_type: "CONTINENTAL", employment_type: "EMPLOYEE", is_paid: 1 },
				{ template_id: "state_coordinator", title: "State Coordinator", scope_type: "STATE", employment_type: "EMPLOYEE", is_paid: 1 },
				{ template_id: "county_coordinator", title: "County Coordinator", scope_type: "COUNTY", employment_type: "EMPLOYEE", is_paid: 1 },
				{ template_id: "group_director", title: "Group Director", scope_type: "GROUP", employment_type: "EMPLOYEE", is_paid: 1 },
			];
		}
		if (sql.includes("FROM outreach_prospects")) {
			if (sql.includes("GROUP BY track")) return [{ track: "instructor-training", n: 1 }, { track: "sponsor-kilometers", n: 2 }];
			if (sql.includes("GROUP BY contact_level")) {
				return [
					{ contact_level: "A1", n: 2 },
					{ contact_level: "A2", n: 2 },
					{ contact_level: "B", n: 2 },
					{ contact_level: "C", n: 1 },
				];
			}
			return [];
		}
		if (sql.includes("FROM applications")) return [];
		if (sql.includes("FROM funds")) return [{ id: "fund-50k-bridge-sprint", name: "$50K Manhattan HQ Bridge Sprint" }];
		if (sql.includes("FROM fund_prospects")) {
			return [
				{ stage: "declined", n: 1 },
				{ stage: "recognition", n: 1 },
				{ stage: "sent", n: 13 },
			];
		}
		if (sql.includes("FROM programs")) return [];
		return [];
	};

	const makeStmt = (sql: string, binds: unknown[] = []) => ({
		bind: (...b: unknown[]) => makeStmt(sql, b),
		first: async () => first(sql, binds),
		all: async () => ({ results: all(sql, binds) }),
		run: async () => ({ meta: { changes: 0 } }),
	});
	return { prepare: (sql: string) => makeStmt(sql) } as unknown as D1Database;
}

const NOW = "2026-10-19T00:00:00Z";

describe("cabinet view", () => {
	it("carries the Florida numbers through every section", async () => {
		const view = await getCabinetView(makeDb());
		expect(view.ok).toBe(true);
		expect(view.florida.territory_id).toBe("terr-st-12");
		expect(view.florida.territories_total).toBe(3);
		expect(view.florida.territories_by_type).toEqual({ CITY: 1, COUNTY: 1, STATE: 1 });
		expect(view.florida.groups).toEqual({ total: 2, forming: 2, active: 0 });
		expect(view.florida.roles_planned).toBe(3);
		expect(view.florida.prospects.total).toBe(3);
		expect(view.florida.prospects.by_track).toEqual({ "instructor-training": 1, "sponsor-kilometers": 2 });
		expect(view.florida.prospects.sent).toBe(3);
		expect(view.florida.prospects.replies).toBe(2);
		// Money facts arrive via getMoneyCycle: Florida receipts and gates.
		expect(view.florida.money.receipts_count).toBe(2);
		expect(view.florida.money.receipts_cents).toBe(10000);
		expect(view.florida.money.sponsorship_contract_receipts).toBe(1);
		expect(view.florida.money.first_case?.prospect_id).toBe(2);
		expect(view.florida.money.first_case?.stage).toContain("reply stage");
		expect(view.florida.lane_gates).toHaveLength(5);
		expect(view.florida.lane_gates?.find((g) => g.lane === "grant")?.status).toBe("OWNER_STOP");
	});

	it("carries national totals, tiers and received money by lane", async () => {
		const view = await getCabinetView(makeDb());
		expect(view.national.territories_total).toBe(6);
		expect(view.national.groups_total).toBe(3);
		expect(view.national.groups_active).toBe(1);
		expect(view.national.prospects_total).toBe(7);
		expect(view.national.tiers).toEqual({ A1: 2, A2: 2, B: 2, C: 1 });
		expect(view.national.enrolled).toBe(5);
		expect(view.national.received_by_lane.donation).toEqual({ events: 2, gross_cents: 10000 });
		expect(view.national.received_by_lane.registration).toEqual({ events: 1, gross_cents: 5000 });
		expect(view.national.received_total_cents).toBe(15000);
	});

	it("reports academy aggregates and today counts from the queue logic", async () => {
		const view = await getCabinetView(makeDb());
		expect(view.academy).toEqual({ students: 15, certified: 2, last_sync: "2026-10-17T10:13:17Z" });
		expect(view.today_counts.unattributed_receipts).toBe(1);
		expect(view.today_counts.applications_new).toBe(2);
		expect(view.today_counts.unsent_step1).toBe(1);
		expect(view.today_counts.replies_waiting).toBe(3);
	});
});

describe("today queue", () => {
	it("ranks a draft decision first, then substantive replies, then due follow-ups", async () => {
		const queue = await getTodayQueue(makeDb(), NOW);
		const kinds = queue.items.map((i) => i.kind);
		expect(kinds[0]).toBe("reply_decision");
		expect(kinds).toEqual([
			"reply_decision",
			"reply_substantive",
			"reply_substantive",
			"followup_due",
			"application_new",
			"step1_queued",
			"receipt_unattributed",
		]);
		const decision = queue.items[0];
		expect(decision.org_name).toBe("Florida Org A");
		expect(decision.title).toContain("reply is waiting for a draft decision");
	});

	it("computes a due follow-up from the last send plus the next step delay", async () => {
		const queue = await getTodayQueue(makeDb(), NOW);
		const due = queue.items.filter((i) => i.kind === "followup_due");
		// Prospect 4: step 1 sent 2026-10-11, step 2 delay 7 days, due
		// 2026-10-18, which is <= 2026-10-19. Prospect 1 was sent
		// 2026-10-17 (due 2026-10-24), prospect 2 has stage replied, and
		// prospect 5 is suppressed: none of them may appear.
		expect(due).toHaveLength(1);
		expect(due[0].prospect_id).toBe(4);
		expect(due[0].due_at).toBe("2026-10-18T00:00:00.000Z");
		expect(queue.counts.followups_due).toBe(1);
		expect(queue.counts.replies_waiting).toBe(3);
		expect(queue.counts.applications_new).toBe(2);
		expect(queue.counts.unsent_step1).toBe(1);
		expect(queue.counts.unattributed_receipts).toBe(1);
	});

	it("aggregates new applications and step 1 queue into single items", async () => {
		const queue = await getTodayQueue(makeDb(), NOW);
		const apps = queue.items.filter((i) => i.kind === "application_new");
		expect(apps).toHaveLength(1);
		expect(apps[0].title).toContain("2 new form submissions");
		expect(apps[0].detail).toContain("individual-instructor-application");
		const step1 = queue.items.filter((i) => i.kind === "step1_queued");
		expect(step1).toHaveLength(1);
		expect(step1[0].detail).toContain("not a manual task");
	});
});

describe("groups registry", () => {
	it("counts groups by status, defaults and Florida separately", async () => {
		const view = await getGroupsRegistryView(makeDb());
		expect(view.territories_total).toBe(6);
		expect(view.groups.total).toBe(3);
		expect(view.groups.by_status).toEqual({ ACTIVE: 1, FORMING: 2 });
		expect(view.groups.defaults).toBe(2);
		expect(view.florida.territories_total).toBe(3);
		expect(view.florida.groups_total).toBe(2);
		expect(view.florida.groups_by_status).toEqual({ FORMING: 2 });
		expect(view.categories.count).toBe(14);
		expect(view.model_note).toContain("Territory first");
	});
});

describe("territory budgets", () => {
	it("sums coverage only from VERIFIED received types, fundraiser mirror excluded", async () => {
		const view = await getTerritoryBudgets(makeDb());
		const national = view.scopes.find((s) => s.key === "national");
		// VERIFIED received rows: donation 10000 + registration 5000 +
		// license 0. The 9999 fundraiser mirror, the UNKNOWN sponsorship
		// 25000 and the UNKNOWN donation 7000 never enter coverage.
		expect(national?.coverage.total_cents).toBe(15000);
		expect(national?.coverage.received_by_lane).toEqual([
			{ lane: "donation", events: 1, cents: 10000 },
			{ lane: "license", events: 1, cents: 0 },
			{ lane: "registration", events: 1, cents: 5000 },
		]);
		const florida = view.scopes.find((s) => s.key === "florida");
		expect(florida?.coverage.total_cents).toBe(10000);
		expect(florida?.territory_root).toBe("terr-st-12");
		const hq = view.scopes.find((s) => s.key === "headquarters");
		expect(hq?.coverage.total_cents).toBe(5000);
		expect(hq?.need.roles_planned).toBe(1);
	});

	it("keeps need as structure with no money amounts and actual spend empty", async () => {
		const view = await getTerritoryBudgets(makeDb());
		for (const scope of view.scopes) {
			expect(scope.need.amounts_note).toContain("no invented sums");
			expect(Object.keys(scope.need).sort()).toEqual(["amounts_note", "by_scope", "roles_planned"]);
			expect(scope.actual.expenses_cents).toBeNull();
		}
		const national = view.scopes.find((s) => s.key === "national");
		expect(national?.need.roles_planned).toBe(5);
		expect(national?.need.by_scope).toEqual({ CONTINENTAL: 1, COUNTY: 1, GROUP: 1, STATE: 2 });
		expect(view.registers_note).toContain("never mixed");
	});
});

describe("people view", () => {
	it("returns academy aggregates only, with no user identifiers anywhere", async () => {
		const view = await getPeopleView(makeDb());
		expect(view.academy.students).toBe(15);
		expect(view.academy.certified).toBe(2);
		expect(view.academy.by_course).toEqual([{ course_id: 2, enrolled: 15, certified: 2 }]);
		expect(view.academy.note).toContain("never displayed");
		expect(JSON.stringify(view)).not.toContain("user_id");
	});

	it("reports roles, the catalog and the empty candidate pipeline honestly", async () => {
		const view = await getPeopleView(makeDb());
		expect(view.roles.total).toBe(5);
		expect(view.roles.by_status).toEqual({ PLANNED: 5 });
		expect(view.roles.by_scope.STATE).toBe(2);
		expect(view.florida_roles.total).toBe(3);
		expect(view.florida_roles.by_template).toHaveLength(3);
		expect(view.hq_roles).toEqual([{ template_id: "president", title: "President", scope_type: "CONTINENTAL", n: 1 }]);
		expect(view.catalog).toHaveLength(4);
		expect(view.catalog[0].is_paid).toBe(true);
		expect(view.applications.total).toBe(0);
		expect(view.applications.note).toContain("no applications have been recorded yet");
		expect(view.applications.pipeline_order).toEqual([
			"Submitted",
			"Screening",
			"Candidate Pool",
			"Funding Available",
			"Offer & Agreement",
			"Appointed",
		]);
		expect(view.candidate_inflow.new_total).toBe(2);
	});
});

describe("grants view", () => {
	it("shows the owner stop gate and empty registry and calendar", async () => {
		const view = await getGrantsView(makeDb());
		expect(view.gate?.lane).toBe("grant");
		expect(view.gate?.scope).toBe("ALL");
		expect(view.gate?.status).toBe("OWNER_STOP");
		expect(view.registry).toEqual([]);
		expect(view.registry_note).toContain("no applications and no letters");
		expect(view.calendar).toEqual([]);
	});
});

describe("funding pipeline", () => {
	it("counts organizations per stage and keeps received money separate", async () => {
		const view = await getFundingPipeline(makeDb());
		const byKey = Object.fromEntries(view.stages.map((s) => [s.key, s]));
		expect(byKey.found).toMatchObject({ n: 7 });
		expect(byKey.qualified).toMatchObject({ n: 4 });
		expect(byKey.sent).toMatchObject({ n: 4 });
		expect(byKey.dialogue).toMatchObject({ n: 3 });
		expect(byKey.commitment).toMatchObject({ n: 0, cents: 0 });
		expect(byKey.received).toMatchObject({ cents: 15000 });
		const fl = Object.fromEntries(view.florida_stages.map((s) => [s.key, s]));
		expect(fl.found).toMatchObject({ n: 3 });
		expect(fl.qualified).toMatchObject({ n: 3 });
		expect(fl.received).toMatchObject({ cents: 10000 });
		expect(view.legacy_fund.funds).toEqual([{ id: "fund-50k-bridge-sprint", name: "$50K Manhattan HQ Bridge Sprint" }]);
		expect(view.legacy_fund.prospects_by_stage).toEqual({ declined: 1, recognition: 1, sent: 13 });
		expect(view.note).toContain("never added to received totals");
	});
});

describe("CRM", () => {
	it("lists prospects with replies first, then enrolled, with aggregates", async () => {
		const list = await getCrmProspects(makeDb(), {});
		expect(list.total).toBe(7);
		expect(list.rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 7, 6]);
		expect(list.rows[0]).toMatchObject({ org_name: "Florida Org A", enrolled: true, sends: 1, replies: 1, territory_name: "Miami" });
		const fl = await getCrmProspects(makeDb(), { scope: "fl" });
		expect(fl.rows.map((r) => r.id)).toEqual([1, 2, 4]);
	});

	it("builds the prospect card: chain to the root, sends, replies, money, no token", async () => {
		const card = await getCrmProspect(makeDb(), 1);
		expect(card.ok).toBe(true);
		if (!card.ok) return;
		expect(card.prospect.org_name).toBe("Florida Org A");
		expect("unsubscribe_token" in card.prospect).toBe(false);
		expect(JSON.stringify(card)).not.toContain("tok-secret");
		expect(card.territory_chain.map((t) => t.territory_id)).toEqual([
			"terr-city-1245000",
			"terr-county-12086",
			"terr-st-12",
			"terr-us",
			"terr-continental-nwana",
		]);
		expect(card.sends).toEqual([{ sequence_step: 1, sent_at: "2026-10-17T00:00:00Z" }]);
		expect(card.replies).toHaveLength(1);
		expect(card.replies[0].engine_action).toContain("draft response for Albert");
		expect(card.money).toEqual([
			{ event_type: "donation_received", funding_lane: "donation", gross_cents: 10000, occurred_at: "2026-10-15T00:00:00Z", territory_id: "terr-city-1245000" },
		]);
		expect(card.roles_note).toContain("funding source");
		expect(card.roles_note).toContain("candidate");
		expect(card.roles_note).toContain("partner");
	});

	it("reports not_found for an unknown prospect", async () => {
		const card = await getCrmProspect(makeDb(), 999);
		expect(card).toEqual({ ok: false, error: "not_found" });
	});
});

describe("territory drilldown and education", () => {
	it("drills into Florida: chain root to self, children, groups, counts", async () => {
		const view = await getTerritoryDrilldown(makeDb(), "terr-st-12");
		expect(view.ok).toBe(true);
		if (!view.ok) return;
		expect(view.territory.name).toBe("Florida");
		expect(view.chain.map((t) => t.territory_id)).toEqual(["terr-continental-nwana", "terr-us", "terr-st-12"]);
		expect(view.children.by_type).toEqual({ COUNTY: 1 });
		expect(view.children.list).toEqual([{ territory_id: "terr-county-12086", type: "COUNTY", name: "Miami-Dade County" }]);
		expect(view.groups).toHaveLength(1);
		expect(view.groups[0].status).toBe("FORMING");
		expect(view.programs).toEqual([]);
		expect(view.prospects_count).toBe(1);
		expect(view.roles_count).toBe(1);
		const missing = await getTerritoryDrilldown(makeDb(), "terr-nope");
		expect(missing).toEqual({ ok: false, error: "not_found" });
	});

	it("returns education aggregates from the sync snapshot", async () => {
		const view = await getEducationView(makeDb());
		expect(view.connected).toBe(true);
		expect(view.students).toBe(15);
		expect(view.certified).toBe(2);
		expect(view.last_sync).toBe("2026-10-17T10:13:17Z");
		expect(view.by_course).toEqual([{ course_id: 2, enrolled: 15, certified: 2 }]);
	});
});
