import { describe, expect, it } from "vitest";
import { buildDistributionPlan } from "../src/distribution-planner";

const object = {
	object_id: "NWANA-SERIES-2026",
	object_type: "COMPETITION-SERIES-HUB",
	title: "2026 NWANA Open Nordic Walking Series",
	status: "active",
	program_family: "OPEN_SERIES",
	commercial_role: "SELLABLE",
};
const rule = {
	rule_id: "RULE-OPEN-SERIES-HUB",
	name: "Open Series Hub Distribution",
	priority: 10,
	match_object_type: "COMPETITION-SERIES-HUB",
	match_program_family: "OPEN_SERIES",
	match_commercial_role: "SELLABLE",
	match_capability_type: "SPONSORSHIP",
	match_status: "active",
};
const capabilities = [
	{
		capability_type: "SPONSORSHIP",
		available: 1,
		configured: 0,
		read_state: "unknown",
		write_state: "unknown",
		permission_state: "unknown",
		distribution_eligible: 1,
		source_platform: "runsignup",
	},
];

const audiences = [
	{ audience_id: "AUD-PARTICIPANTS", rule_id: rule.rule_id, audience_type: "PARTICIPANTS", enabled: 1 },
	{ audience_id: "AUD-SPONSORS", rule_id: rule.rule_id, audience_type: "SPONSORS", enabled: 1 },
];
const actions = [
	{ action_id: "ACT-FB", rule_id: rule.rule_id, audience_id: "AUD-PARTICIPANTS", action_type: "SOCIAL_POST", channel: "FACEBOOK", destination: "NWANA", execution_mode: "MANUAL_LAST_MILE", priority: 10, enabled: 1, metadata: '{"purpose":"Promote the Series","deliverable":"Facebook post","call_to_action":"Visit the Series hub","content_scope":"SERIES_PROMOTION"}' },
	{ action_id: "ACT-SELLERS", rule_id: rule.rule_id, audience_id: "AUD-SPONSORS", action_type: "SELLER_OUTREACH", channel: "SELLER_NETWORK", destination: "NWANA_SELLERS", execution_mode: "NOT_CONNECTED", priority: 10, enabled: 1, metadata: null },
];

describe("Stage 8 distribution planner", () => {
	it("builds a reviewable Series 2026 plan without allowing execution", () => {
		const plan = buildDistributionPlan({ object, capabilities, rules: [rule], audiences, actions });
		expect(plan.mode).toBe("PLAN_ONLY");
		expect(plan.execution_allowed).toBe(false);
		expect(plan.summary).toEqual({ matched_rules: 1, audiences: 2, actions: 2 });
		expect(plan.capabilities[0]).toMatchObject({
			capability_type: "SPONSORSHIP",
			platform_available: true,
			configured_for_object: false,
		});
		expect(plan.rules[0]?.audiences[0]?.actions[0]?.action_id).toBe("ACT-FB");
		expect(plan.rules[0]?.audiences[0]?.actions[0]?.work_item).toMatchObject({
			work_item_id: "WORK-ACT-FB",
			status: "DRAFT",
			purpose: "Promote the Series",
			deliverable: "Facebook post",
			call_to_action: "Visit the Series hub",
			content_scope: "SERIES_PROMOTION",
			requires_review: true,
			execution_allowed: false,
		});
	});

	it("does not match a rule when the object lacks its required capability", () => {
		const plan = buildDistributionPlan({ object, capabilities: [], rules: [rule], audiences, actions });
		expect(plan.summary).toEqual({ matched_rules: 0, audiences: 0, actions: 0 });
	});
});
