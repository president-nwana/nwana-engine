// Operational queue (owner-facing): mapping-only presentation over the
// existing orchestration decisions and proposal states. No new business
// facts are created here. Statuses: READY_TO_ACT, NEEDS_OWNER_INPUT,
// BLOCKED_EXTERNAL only.

import { describe, it, expect } from "vitest";
import {
	collectStaticSources,
	adaptFundSources,
} from "../src/orchestration-sources";
import { orchestrate } from "../src/orchestration";
import {
	evidenceBundle,
	buildGoogleAdsIntent,
} from "../src/orchestration-google-ads";
import { buildProposals } from "../src/google-ads-proposals";
import { proposalIdentity } from "../src/google-ads-intent";
import {
	buildOperationalQueue,
	type OperationalRow,
} from "../src/operational-queue";

const VALID_STATUSES = ["READY_TO_ACT", "NEEDS_OWNER_INPUT", "BLOCKED_EXTERNAL"];

const CURRENT_SOURCE_IDENTITIES = [
	"NWANA-RACE-000001",
	"RUNSIGNUP_ASSET_ALBERT_FATIKHOV",
	"RUNSIGNUP_ASSET_NWANA_SPORT",
	"RUNSIGNUP_ASSET_PARTNER_NETWORK",
	"instructor-growth-fund",
	"DIR-FOUNDING-CIRCLE-2026",
	"fund-50k-bridge-sprint",
];

/** Deterministic production-like queue: static sources + the one live D1 fund. */
function productionLikeQueue() {
	const sources = collectStaticSources();
	sources.push(
		...adaptFundSources([
			{
				id: "fund-50k-bridge-sprint",
				name: "$50K Manhattan HQ Bridge Sprint",
				status: "active",
			} as never,
		]),
	);
	const decisions = orchestrate(sources, evidenceBundle());
	const byIdentity = new Map(sources.map((s) => [s.source_identity, s]));
	const intents = [];
	for (const d of decisions) {
		if (d.state === "DECIDED" && d.channel === "GOOGLE_ADS") {
			const built = buildGoogleAdsIntent(byIdentity.get(d.source_identity)!, d);
			if (built.ok) {
				intents.push(built.intent);
				d.channel_intent_id = proposalIdentity(built.intent);
			}
		}
	}
	const proposals = buildProposals(intents, []);
	const proposalsById = new Map(proposals.map((p) => [p.proposal_id, p]));
	for (const d of decisions) {
		if (d.channel_intent_id) {
			const state = proposalsById.get(d.channel_intent_id)?.state;
			if (state) d.downstream = { consumer: "GOOGLE_ADS", state };
		}
	}
	return buildOperationalQueue({
		decisions,
		proposalsById,
		googleAdsExecutionAllowed: false,
	});
}

function allText(r: OperationalRow): string {
	return [
		r.row_id,
		r.source_identity,
		r.source_title,
		r.required_result,
		r.action,
		r.channel,
		r.business_outcome,
		r.exact_next_step,
		r.owner_input,
		r.external_blocker,
		r.preparation_path,
		r.downstream_state,
		r.evidence_refs.join(" "),
	].join("\n");
}

describe("operational queue", () => {
	it("represents every current source with at least one row", () => {
		const q = productionLikeQueue();
		const identities = new Set(q.rows.map((r) => r.source_identity));
		for (const id of CURRENT_SOURCE_IDENTITIES) {
			expect(identities.has(id), `source ${id} has no queue row`).toBe(true);
		}
	});

	it("uses only the three allowed operational statuses", () => {
		const q = productionLikeQueue();
		expect(q.rows.length).toBeGreaterThan(0);
		for (const r of q.rows) {
			expect(VALID_STATUSES).toContain(r.status);
		}
	});

	it("NEEDS_OWNER_INPUT rows carry exactly one owner input and no blocker", () => {
		const q = productionLikeQueue();
		const rows = q.rows.filter((r) => r.status === "NEEDS_OWNER_INPUT");
		expect(rows.length).toBeGreaterThan(0);
		for (const r of rows) {
			expect(typeof r.owner_input).toBe("string");
			expect(r.owner_input!.length).toBeGreaterThan(0);
			expect(r.external_blocker).toBeNull();
		}
	});

	it("BLOCKED_EXTERNAL rows name an external blocker and no owner input", () => {
		const q = productionLikeQueue();
		const rows = q.rows.filter((r) => r.status === "BLOCKED_EXTERNAL");
		expect(rows.length).toBeGreaterThan(0);
		for (const r of rows) {
			expect(typeof r.external_blocker).toBe("string");
			expect(r.external_blocker!.length).toBeGreaterThan(0);
			expect(r.owner_input).toBeNull();
		}
	});

	it("READY_TO_ACT rows name an exact next step and no blocker", () => {
		const q = productionLikeQueue();
		const rows = q.rows.filter((r) => r.status === "READY_TO_ACT");
		expect(rows.length).toBeGreaterThan(0);
		for (const r of rows) {
			expect(typeof r.exact_next_step).toBe("string");
			expect(r.exact_next_step.length).toBeGreaterThan(0);
			expect(r.external_blocker).toBeNull();
			expect(r.owner_input).toBeNull();
		}
	});

	it("produces one row per source+channel+intent (Founding Circle deduped)", () => {
		const q = productionLikeQueue();
		const keys = q.rows.map(
			(r) => `${r.source_identity}|${r.channel}|${r.row_id}`,
		);
		expect(new Set(keys).size).toBe(keys.length);
		const fcAds = q.rows.filter(
			(r) =>
				r.source_identity === "DIR-FOUNDING-CIRCLE-2026" &&
				r.channel === "GOOGLE_ADS",
		);
		expect(fcAds).toHaveLength(1);
		expect(fcAds[0].downstream_state).toBe("PROPOSED");
		expect(fcAds[0].status).toBe("BLOCKED_EXTERNAL");
	});

	it("marks the Series Google Ads proposal as awaiting owner review", () => {
		const q = productionLikeQueue();
		const seriesAds = q.rows.find(
			(r) =>
				r.source_identity === "NWANA-RACE-000001" && r.channel === "GOOGLE_ADS",
		)!;
		expect(seriesAds).toBeDefined();
		expect(seriesAds.status).toBe("NEEDS_OWNER_INPUT");
		expect(seriesAds.owner_input).toContain(
			"OBJECT_DERIVED:NWANA-RACE-000001:VIRTUAL_RACES",
		);
	});

	it("never makes the missing-donation-destination proposals ready", () => {
		const q = productionLikeQueue();
		const rows = q.rows.filter(
			(r) => r.owner_input === "confirmed public donation destination missing",
		);
		expect(rows.length).toBeGreaterThan(0);
		for (const r of rows) {
			expect(r.status).toBe("NEEDS_OWNER_INPUT");
		}
	});

	it("lists dormant rules as unrouted with owner input", () => {
		const q = productionLikeQueue();
		const byRule = new Map(q.unrouted_rules.map((u) => [u.rule_id, u]));
		expect([...byRule.keys()].sort()).toEqual(
			[
				"RULE-ATHLETE-ASSET",
				"RULE-NWANA-SPORT",
				"RULE-OPEN-SERIES-DISTANCE",
				"RULE-OPEN-SERIES-EVENT",
				"RULE-PARTNER-NETWORK",
			].sort(),
		);
		const total = q.unrouted_rules.reduce(
			(n, u) => n + u.action_ids.length,
			0,
		);
		expect(total).toBe(22);
		for (const u of q.unrouted_rules) {
			expect(u.owner_input).toContain(u.rule_id);
		}
	});

	it("is deterministic: same decisions in, same rows out", () => {
		const a = productionLikeQueue();
		const b = productionLikeQueue();
		expect(a.rows).toEqual(b.rows);
		expect(a.unrouted_rules).toEqual(b.unrouted_rules);
	});

	it("is pure: input decisions are not mutated by the mapping", () => {
		const sources = collectStaticSources();
		const decisions = orchestrate(sources, evidenceBundle());
		const before = JSON.stringify(decisions);
		buildOperationalQueue({
			decisions,
			proposalsById: new Map(),
			googleAdsExecutionAllowed: false,
		});
		expect(JSON.stringify(decisions)).toBe(before);
	});

	it("carries no em dashes in owner-facing text", () => {
		const q = productionLikeQueue();
		for (const r of q.rows) {
			expect(allText(r)).not.toContain("—");
		}
		for (const u of q.unrouted_rules) {
			expect(u.owner_input).not.toContain("—");
		}
	});
});
