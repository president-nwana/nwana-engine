// Operational queue: owner-facing presentation mapping over the existing
// orchestration decisions and proposal states. Pure and deterministic.
// This module creates no business facts and no architecture: it only maps
// each current decision to one operational status and one exact next step.
//
// Statuses:
//   READY_TO_ACT      - the machine can prepare/act now with an existing path.
//   NEEDS_OWNER_INPUT - exactly one owner decision/fact is missing.
//   BLOCKED_EXTERNAL  - the action is ready inside the machine, but an
//                       external system blocks execution (exact blocker shown).

import { DISTRIBUTION_ACTIONS } from "./distribution-evidence";
import type { OrchestrationDecision } from "./orchestration";
import type { ProposalRecord } from "./google-ads-proposals";

export type OperationalStatus =
	| "READY_TO_ACT"
	| "NEEDS_OWNER_INPUT"
	| "BLOCKED_EXTERNAL";

export interface OperationalRow {
	row_id: string;
	source_identity: string;
	source_title: string;
	required_result: string | null;
	action: string | null;
	channel: string | null;
	business_outcome: string;
	status: OperationalStatus;
	/** One concrete step, in plain operational language. */
	exact_next_step: string;
	/** Exactly one missing owner decision/fact (NEEDS_OWNER_INPUT only). */
	owner_input: string | null;
	/** Exact external blocker (BLOCKED_EXTERNAL only). */
	external_blocker: string | null;
	/** Existing machine path that prepares/handles the action, if any. */
	preparation_path: string | null;
	downstream_state: string | null;
	evidence_refs: string[];
}

export interface UnroutedRule {
	rule_id: string;
	action_ids: string[];
	owner_input: string;
}

export interface OperationalQueue {
	generated_at: string;
	google_ads_execution_allowed: boolean;
	rows: OperationalRow[];
	unrouted_rules: UnroutedRule[];
}

// Verified display titles for the current source identities. These are the
// names the machine already uses for these objects (facts, D1 rows, owner
// directives); nothing is derived from IDs or names here.
const SOURCE_TITLES: Record<string, string> = {
	"NWANA-RACE-000001": "Series 2026",
	"instructor-growth-fund": "Instructor Growth Fund",
	"DIR-FOUNDING-CIRCLE-2026": "Founding Circle",
	"fund-50k-bridge-sprint": "$50K Manhattan HQ Bridge Sprint",
	RUNSIGNUP_ASSET_ALBERT_FATIKHOV: "Albert Fatikhov | Nordic Walking",
	RUNSIGNUP_ASSET_NWANA_SPORT: "NWANA Nordic Walking SPORT",
	RUNSIGNUP_ASSET_PARTNER_NETWORK: "NWANA Partner Network",
};

// Fixed source order for the owner-facing queue.
const SOURCE_ORDER = [
	"NWANA-RACE-000001",
	"DIR-FOUNDING-CIRCLE-2026",
	"fund-50k-bridge-sprint",
	"instructor-growth-fund",
	"RUNSIGNUP_ASSET_ALBERT_FATIKHOV",
	"RUNSIGNUP_ASSET_NWANA_SPORT",
	"RUNSIGNUP_ASSET_PARTNER_NETWORK",
];

function sourceTitle(identity: string): string {
	return SOURCE_TITLES[identity] ?? identity;
}

function businessOutcome(d: OrchestrationDecision): string {
	if (d.channel === "SELLER_SPONSORSHIP") return "Sponsors";
	if (d.channel === "PARTNER_OUTREACH") return "Partners";
	if (d.channel === "PRESS_MEDIA") return "Media distribution";
	if (d.purpose === "VIRTUAL_RACES") return "Participants";
	if (
		d.purpose === "FUNDRAISING" ||
		d.purpose === "FOUNDING_CIRCLE" ||
		d.candidate_action === "Acquire donors via search"
	) {
		return "Donations";
	}
	return "Not assigned";
}

function evidenceRefs(d: OrchestrationDecision): string[] {
	return d.evidence.map((e) => `${e.kind}:${e.reference}`);
}

/** Action id referenced by a distribution-action decision, if any. */
function actionIdOf(d: OrchestrationDecision): string | null {
	for (const e of d.evidence) {
		if (e.kind === "DISTRIBUTION_ACTION") return e.reference;
	}
	return null;
}

function googleAdsRow(
	d: OrchestrationDecision,
	proposal: ProposalRecord | undefined,
): OperationalRow {
	const base = {
		row_id: d.decision_id,
		source_identity: d.source_identity,
		source_title: sourceTitle(d.source_identity),
		required_result: d.required_result,
		action: d.candidate_action,
		channel: d.channel,
		business_outcome: businessOutcome(d),
		preparation_path: null as string | null,
		downstream_state: d.downstream?.state ?? null,
		evidence_refs: evidenceRefs(d),
	};
	const proposalId = d.channel_intent_id ?? "(no intent recorded)";
	const manualStep =
		`The owner creates the campaign manually in the Google Ads account from ` +
		`proposal ${proposalId} (see /operating-center/ads), because the machine's ` +
		`Google Ads integration is read-only.`;
	if (d.downstream?.state === "PROPOSED") {
		return {
			...base,
			status: "BLOCKED_EXTERNAL",
			exact_next_step: manualStep,
			owner_input: null,
			external_blocker:
				"The machine's Google Ads integration is read-only (access_level " +
				"EXPLORER, execution_allowed=false in src/google-ads.ts). It cannot " +
				"create or mutate campaigns. The proposal itself is complete and valid.",
		};
	}
	if (d.downstream?.state === "POSSIBLE DUPLICATE / REVIEW") {
		const dup = proposal?.conflict?.live_campaign_name ?? "(unknown campaign)";
		return {
			...base,
			status: "NEEDS_OWNER_INPUT",
			exact_next_step:
				`1) The owner confirms the duplicate decision. 2) ${manualStep}`,
			owner_input:
				`Confirm whether to keep proposal ${proposalId} despite the ` +
				`confirmed live duplicate campaign "${dup}".`,
			external_blocker: null,
		};
	}
	if (d.downstream?.state === "POLICY_REVIEW") {
		const violations = (proposal?.policy_violations ?? []).join("; ");
		return {
			...base,
			status: "NEEDS_OWNER_INPUT",
			exact_next_step:
				`The owner resolves the policy flags on proposal ${proposalId}; ` +
				`the machine rebuilds the proposal on the next run.`,
			owner_input:
				`Resolve the policy violations on proposal ${proposalId}` +
				(violations ? `: ${violations}` : "."),
			external_blocker: null,
		};
	}
	if (d.downstream?.state === "INSUFFICIENT_INPUT") {
		const fields = (proposal?.missing_fields ?? []).join(", ");
		return {
			...base,
			status: "NEEDS_OWNER_INPUT",
			exact_next_step:
				`The owner supplies the missing factual campaign input; the machine ` +
				`rebuilds the proposal on the next run. Campaign copy is never invented.`,
			owner_input:
				`Supply the missing factual campaign input for proposal ${proposalId}` +
				(fields ? `: ${fields}` : "."),
			external_blocker: null,
		};
	}
	return {
		...base,
		status: "NEEDS_OWNER_INPUT",
		exact_next_step:
			`No downstream proposal state is recorded for this decision; the owner ` +
			`confirms how to proceed.`,
		owner_input: `No downstream proposal state is recorded for intent ${proposalId}.`,
		external_blocker: null,
	};
}

function decidedRow(d: OrchestrationDecision): OperationalRow {
	const title = sourceTitle(d.source_identity);
	const base = {
		row_id: d.decision_id,
		source_identity: d.source_identity,
		source_title: title,
		required_result: d.required_result,
		action: d.candidate_action,
		channel: d.channel,
		business_outcome: businessOutcome(d),
		owner_input: null as string | null,
		external_blocker: null as string | null,
		downstream_state: d.downstream?.state ?? null,
		evidence_refs: evidenceRefs(d),
	};
	switch (d.channel) {
		case "META": {
			const actionId = actionIdOf(d);
			const destination =
				actionId === "ACT-SERIES-HUB-IG"
					? "nwana.official"
					: actionId === "ACT-SERIES-HUB-FB"
						? "the NWANA Facebook page"
						: "the verified Meta destinations";
			return {
				...base,
				status: "READY_TO_ACT",
				exact_next_step:
					`The machine prepares the post draft from the recorded purpose, ` +
					`deliverable, and call to action; the owner publishes it manually ` +
					`on ${destination}.`,
				preparation_path:
					"race-lifecycle announcement drafts (buildNextRacePrep) and the " +
					"result-publication flow (card + editorial draft + owner approval)",
			};
		}
		case "LINKEDIN":
			return {
				...base,
				status: "READY_TO_ACT",
				exact_next_step:
					`The machine prepares the LinkedIn post draft from the recorded ` +
					`purpose, deliverable, and call to action; the owner publishes it ` +
					`manually on the NWANA company page.`,
				preparation_path:
					"editorial draft preparation (no automated LinkedIn publish path exists)",
			};
		case "RUNSIGNUP_EMAIL":
			return {
				...base,
				status: "READY_TO_ACT",
				exact_next_step:
					`The machine prepares the email draft (audience, subject, body, ` +
					`MARKETING classification) for the RunSignup/TicketSignup Email V2 ` +
					`dashboard 513494; the owner presses Send manually.`,
				preparation_path:
					"race-lifecycle email drafts (buildNextRacePrep); send stays manual " +
					"in the Email Marketing dashboard",
			};
		case "PRESS_MEDIA":
			return {
				...base,
				status: "READY_TO_ACT",
				exact_next_step:
					`The machine drafts the press pitch through the media-plan pipeline; ` +
					`the owner approves the draft; external distribution is recorded in ` +
					`the machine and the actual send happens outside the system by the owner.`,
				preparation_path:
					"media-plan pipeline (draft -> owner approval -> site_news publication " +
					"-> recorded external distribution)",
			};
		case "SELLER_SPONSORSHIP":
			return {
				...base,
				status: "READY_TO_ACT",
				exact_next_step:
					`The machine generates the seller package for ${title} (draft stage); ` +
					`seller conversations stay human.`,
				preparation_path:
					"sponsorship-asset package generation (draft -> packaged -> offered)",
			};
		case "PARTNER_OUTREACH":
			return {
				...base,
				status: "NEEDS_OWNER_INPUT",
				exact_next_step:
					`The owner drafts and sends the partner outreach from his mailbox; ` +
					`the partners pipeline records it in the outreach registry.`,
				owner_input:
					`Draft and send the partner outreach for ${title} (the machine has ` +
					`no draft-preparation path for partner outreach; the partners ` +
					`pipeline tracks outreach in the registry).`,
				preparation_path: null,
			};
		default:
			return {
				...base,
				status: "NEEDS_OWNER_INPUT",
				exact_next_step:
					`No operational preparation path is recorded for channel ${d.channel ?? "(unknown)"}; ` +
					`the owner confirms how to proceed.`,
				owner_input: `Confirm how to handle the ${d.channel ?? "(unknown)"} channel for ${title}.`,
				preparation_path: null,
			};
	}
}

function missingInputRow(d: OrchestrationDecision): OperationalRow {
	const title = sourceTitle(d.source_identity);
	const missing = d.missing_decision_input[0] ?? "a required decision input";
	return {
		row_id: d.decision_id,
		source_identity: d.source_identity,
		source_title: title,
		required_result: d.required_result,
		action: d.candidate_action,
		channel: d.channel,
		business_outcome: businessOutcome(d),
		status: "NEEDS_OWNER_INPUT",
		exact_next_step:
			`Once the missing input is recorded, the action is re-evaluated the next ` +
			`time the queue is opened. Nothing is invented in the meantime.`,
		owner_input: missing,
		external_blocker: null,
		preparation_path: null,
		downstream_state: null,
		evidence_refs: evidenceRefs(d),
	};
}

function noDecisionRow(d: OrchestrationDecision): OperationalRow {
	const title = sourceTitle(d.source_identity);
	return {
		row_id: d.decision_id,
		source_identity: d.source_identity,
		source_title: title,
		required_result: null,
		action: null,
		channel: null,
		business_outcome: businessOutcome(d),
		status: "NEEDS_OWNER_INPUT",
		exact_next_step:
			`The owner decides what this source should produce; once a required ` +
			`result and action are recorded, the queue picks the source up.`,
		owner_input:
			`Choose the required result and action for ${title} (${d.source_identity}): ` +
			`no distribution action, owner directive, or generic rule assigns a ` +
			`channel to it today.`,
		external_blocker: null,
		preparation_path: null,
		downstream_state: null,
		evidence_refs: evidenceRefs(d),
	};
}

/**
 * Builds the owner-facing operational queue from the current orchestration
 * decisions. Deterministic: same decisions in, same rows out.
 */
export function buildOperationalQueue(input: {
	decisions: readonly OrchestrationDecision[];
	proposalsById: ReadonlyMap<string, ProposalRecord>;
	googleAdsExecutionAllowed: boolean;
}): OperationalQueue {
	const rows: OperationalRow[] = [];
	const seen = new Set<string>();
	for (const d of input.decisions) {
		// The Founding Circle yields two decisions (owner directive + generic
		// rule) that resolve to the same proposal: one operational row.
		const dedupeKey =
			d.source_identity + "|" + (d.channel ?? "") + "|" + (d.channel_intent_id ?? d.decision_id);
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		if (d.state === "DECIDED" && d.channel === "GOOGLE_ADS") {
			rows.push(
				googleAdsRow(d, d.channel_intent_id ? input.proposalsById.get(d.channel_intent_id) : undefined),
			);
		} else if (d.state === "DECIDED") {
			rows.push(decidedRow(d));
		} else if (d.state === "MISSING_DECISION_INPUT") {
			rows.push(missingInputRow(d));
		} else {
			rows.push(noDecisionRow(d));
		}
	}
	const order = new Map(SOURCE_ORDER.map((id, i) => [id, i]));
	rows.sort((a, b) => {
		const oa = order.get(a.source_identity) ?? SOURCE_ORDER.length;
		const ob = order.get(b.source_identity) ?? SOURCE_ORDER.length;
		if (oa !== ob) return oa - ob;
		return a.row_id < b.row_id ? -1 : a.row_id > b.row_id ? 1 : 0;
	});

	// Distribution actions recorded in config but carried by no current
	// source: they produce no decisions today. Grouped by rule so the owner
	// sees exactly what is dormant and what one decision would route it.
	const referenced = new Set<string>();
	for (const d of input.decisions) {
		for (const e of d.evidence) {
			if (e.kind === "DISTRIBUTION_ACTION") referenced.add(e.reference);
		}
	}
	const unroutedByRule = new Map<string, string[]>();
	for (const a of DISTRIBUTION_ACTIONS) {
		if (referenced.has(a.action_id)) continue;
		const list = unroutedByRule.get(a.rule_id) ?? [];
		list.push(a.action_id);
		unroutedByRule.set(a.rule_id, list);
	}
	const unrouted_rules: UnroutedRule[] = [...unroutedByRule.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([rule_id, action_ids]) => ({
			rule_id,
			action_ids: [...action_ids].sort(),
			owner_input:
				`Confirm which current source should carry ${rule_id} actions ` +
				`(${action_ids.length} actions recorded in the distribution config, ` +
				`carried by no current source), or leave the rule dormant.`,
		}));

	return {
		generated_at: new Date().toISOString(),
		google_ads_execution_allowed: input.googleAdsExecutionAllowed,
		rows,
		unrouted_rules,
	};
}
