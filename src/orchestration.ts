/**
 * Orchestration core: channel-neutral machine orchestration.
 *
 * Pipeline:
 *   NORMALIZED SOURCE -> REQUIRED RESULT -> CANDIDATE ACTION ->
 *   CHANNEL DECISION -> CHANNEL-SPECIFIC INTENT -> CHANNEL CONSUMER
 *
 * The core never touches a store and never branches on source kinds.
 * It evaluates the evidence a NormalizedSource carries:
 * - explicit distribution actions (from the committed distribution config),
 * - an explicit owner directive,
 * and turns each evidence item into one decision with a deterministic
 * identity. When a source carries no evidence, the result is NO_DECISION.
 * When required decision data is incomplete, the result is
 * MISSING_DECISION_INPUT. Both are valid outcomes, never errors.
 *
 * Channel-specific intent production lives outside the core
 * (see orchestration-google-ads.ts); the core only records the channel
 * and the channel_intent_id the consumer assigned.
 */

import type {
	DistributionActionConfig,
	NormalizedSource,
	OwnerDirectiveConfig,
} from "./orchestration-sources";

export type OrchestrationChannel =
	| "GOOGLE_ADS"
	| "META"
	| "RUNSIGNUP_EMAIL"
	| "LINKEDIN"
	| "PRESS_MEDIA"
	| "SELLER_SPONSORSHIP"
	| "PARTNER_OUTREACH";

export type DecisionState = "DECIDED" | "NO_DECISION" | "MISSING_DECISION_INPUT";

export type DecisionEvidenceKind =
	| "DISTRIBUTION_ACTION"
	| "OWNER_DIRECTIVE"
	| "DISTRIBUTION_RULE";

/** Exact, traceable reference to the evidence behind a decision. */
export interface DecisionEvidence {
	kind: DecisionEvidenceKind;
	/** Exact identifier: action id, directive id, or rule id. */
	reference: string;
	detail: string;
}

export interface DownstreamState {
	consumer: string;
	state: string;
}

/**
 * One channel decision for one logical source/action/channel.
 * Every positive decision exposes the exact authoritative evidence
 * identifier it was made from.
 */
export interface OrchestrationDecision {
	/** Deterministic: same logical source/action/channel always yields the same id. */
	decision_id: string;
	source_identity: string;
	source_kind: string;
	purpose: string | null;
	required_result: string | null;
	candidate_action: string | null;
	channel: OrchestrationChannel | null;
	priority: number | null;
	/** Verbatim factual explanation of why this decision came out this way. */
	factual_reason: string;
	evidence: DecisionEvidence[];
	execution_mode: string | null;
	state: DecisionState;
	/** Consumer-assigned intent identity (null until a consumer produces one). */
	channel_intent_id: string | null;
	/** Every required decision input that was missing, as plain strings. */
	missing_decision_input: string[];
	/** Set when a consumer already processed the intent; null otherwise. */
	downstream: DownstreamState | null;
}

/** Evidence the core evaluates. Carried, not invented, by the caller. */
export interface OrchestrationEvidence {
	actions: readonly DistributionActionConfig[];
	directives: readonly OwnerDirectiveConfig[];
}

/**
 * Maps the raw channel vocabulary of the distribution config onto the
 * machine's channel identifiers. A raw channel with no mapping is not a
 * decision; it is MISSING_DECISION_INPUT.
 */
export const CHANNEL_MAP: Readonly<Record<string, OrchestrationChannel>> = {
	GOOGLE_ADS_GRANT: "GOOGLE_ADS",
	FACEBOOK: "META",
	INSTAGRAM: "META",
	RUNSIGNUP_EMAIL: "RUNSIGNUP_EMAIL",
	EMAIL: "RUNSIGNUP_EMAIL",
	LINKEDIN: "LINKEDIN",
	MEDIA: "PRESS_MEDIA",
	SELLER_NETWORK: "SELLER_SPONSORSHIP",
	SEAT_THEORY: "SELLER_SPONSORSHIP",
	ZUBIE_FIVE: "SELLER_SPONSORSHIP",
	PARTNER_NETWORK: "PARTNER_OUTREACH",
};

/** Deterministic 32-bit FNV-1a hash, rendered as 8 lowercase hex chars. */
export function stableHash(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function decisionIdForEvidence(
	sourceIdentity: string,
	evidenceRef: string,
	requiredResult: string | null,
	candidateAction: string | null,
	channel: string | null,
): string {
	return (
		"ORCH-" +
		stableHash(
			[sourceIdentity, evidenceRef, requiredResult ?? "", candidateAction ?? "", channel ?? ""].join(
				"|",
			),
		)
	);
}

function decisionIdForNoDecision(sourceIdentity: string): string {
	return "ORCH-" + stableHash(sourceIdentity + "|NO_DECISION");
}

/**
 * Runs the orchestration over normalized sources. Pure and deterministic:
 * the same sources and evidence always yield the same decisions in the
 * same order, independent of render order.
 */
export function orchestrate(
	sources: readonly NormalizedSource[],
	evidence: OrchestrationEvidence,
): OrchestrationDecision[] {
	const actionById = new Map(evidence.actions.map((a) => [a.action_id, a]));
	const directiveById = new Map(
		evidence.directives.map((d) => [d.directive_id, d]),
	);
	const decisions: OrchestrationDecision[] = [];

	for (const source of sources) {
		const sourceDecisions: OrchestrationDecision[] = [];

		for (const ref of source.distribution_actions) {
			const action = actionById.get(ref.action_id);
			if (!action) {
				sourceDecisions.push({
					decision_id: decisionIdForEvidence(
						source.source_identity,
						ref.action_id,
						null,
						null,
						null,
					),
					source_identity: source.source_identity,
					source_kind: source.source_kind,
					purpose: source.purpose,
					required_result: null,
					candidate_action: null,
					channel: null,
					priority: null,
					factual_reason:
						`Source references distribution action ${ref.action_id}, but the action ` +
						`is not present in the distribution evidence config. The reference cannot be resolved.`,
					evidence: [
						{
							kind: "DISTRIBUTION_ACTION",
							reference: ref.action_id,
							detail: `referenced from source ${source.source_identity}; not found in evidence config`,
						},
					],
					execution_mode: null,
					state: "MISSING_DECISION_INPUT",
					channel_intent_id: null,
					missing_decision_input: [
						`distribution action ${ref.action_id} not found in evidence config`,
					],
					downstream: null,
				});
				continue;
			}
			sourceDecisions.push(decideFromAction(source, action));
		}

		if (source.owner_directive) {
			const directive = directiveById.get(source.owner_directive.directive_id);
			if (!directive) {
				sourceDecisions.push({
					decision_id: decisionIdForEvidence(
						source.source_identity,
						source.owner_directive.directive_id,
						null,
						null,
						null,
					),
					source_identity: source.source_identity,
					source_kind: source.source_kind,
					purpose: source.purpose,
					required_result: null,
					candidate_action: null,
					channel: null,
					priority: null,
					factual_reason:
						`Source carries owner directive ${source.owner_directive.directive_id}, but the ` +
						`directive is not present in the owner directive config.`,
					evidence: [
						{
							kind: "OWNER_DIRECTIVE",
							reference: source.owner_directive.directive_id,
							detail: `referenced from source ${source.source_identity}; not found in directive config`,
						},
					],
					execution_mode: null,
					state: "MISSING_DECISION_INPUT",
					channel_intent_id: null,
					missing_decision_input: [
						`owner directive ${source.owner_directive.directive_id} not found in directive config`,
					],
					downstream: null,
				});
			} else {
				sourceDecisions.push(decideFromDirective(source, directive));
			}
		}

		if (sourceDecisions.length === 0) {
			sourceDecisions.push(noDecision(source));
		}

		decisions.push(...sourceDecisions);
	}

	// Stable output order, independent of the order sources were rendered in.
	decisions.sort((a, b) => (a.decision_id < b.decision_id ? -1 : a.decision_id > b.decision_id ? 1 : 0));
	return decisions;
}

function decideFromAction(
	source: NormalizedSource,
	action: DistributionActionConfig,
): OrchestrationDecision {
	const channel = CHANNEL_MAP[action.channel] ?? null;
	const missing: string[] = [];
	if (!channel) {
		missing.push(`channel mapping for action channel "${action.channel}"`);
	}
	if (!action.purpose) {
		missing.push(
			`required_result (action ${action.action_id} purpose not recorded in distribution config)`,
		);
	}
	if (!action.deliverable) {
		missing.push(
			`candidate_action (action ${action.action_id} deliverable not recorded in distribution config)`,
		);
	}
	const state: DecisionState =
		missing.length > 0 ? "MISSING_DECISION_INPUT" : "DECIDED";
	const evidence: DecisionEvidence[] = [
		{
			kind: "DISTRIBUTION_ACTION",
			reference: action.action_id,
			detail:
				`rule ${action.rule_id}, action_type ${action.action_type}, ` +
				`channel ${action.channel}, execution_mode ${action.execution_mode}, ` +
				`migrations/0006` +
				(action.purpose ? " + migrations/0013 metadata" : ""),
		},
	];
	const factual_reason =
		state === "DECIDED"
			? `Distribution action ${action.action_id} (rule ${action.rule_id}) assigns channel ` +
				`${action.channel} with recorded purpose "${action.purpose}" and deliverable ` +
				`"${action.deliverable}".`
			: `Distribution action ${action.action_id} (rule ${action.rule_id}) names channel ` +
				`${action.channel}, but required decision input is incomplete: ${missing.join("; ")}.`;
	return {
		decision_id: decisionIdForEvidence(
			source.source_identity,
			action.action_id,
			action.purpose,
			action.deliverable,
			channel ?? action.channel,
		),
		source_identity: source.source_identity,
		source_kind: source.source_kind,
		purpose: source.purpose,
		required_result: action.purpose,
		candidate_action: action.deliverable,
		channel,
		priority: action.priority,
		factual_reason,
		evidence,
		execution_mode: action.execution_mode,
		state,
		channel_intent_id: null,
		missing_decision_input: missing,
		downstream: null,
	};
}

function decideFromDirective(
	source: NormalizedSource,
	directive: OwnerDirectiveConfig,
): OrchestrationDecision {
	const channel = CHANNEL_MAP[directive.ordered_channel] ?? null;
	const missing: string[] = [];
	if (!channel) {
		missing.push(
			`channel mapping for directive channel "${directive.ordered_channel}"`,
		);
	}
	const state: DecisionState =
		missing.length > 0 ? "MISSING_DECISION_INPUT" : "DECIDED";
	const evidence: DecisionEvidence[] = [
		{
			kind: "OWNER_DIRECTIVE",
			reference: directive.directive_id,
			detail:
				`explicit owner instruction; no source object required; no distribution rule required`,
		},
	];
	const factual_reason =
		state === "DECIDED"
			? `Owner directive ${directive.directive_id} orders channel ` +
				`${directive.ordered_channel} with required result "${directive.required_result}" ` +
				`and candidate action "${directive.candidate_action}".`
			: `Owner directive ${directive.directive_id} is incomplete: ${missing.join("; ")}.`;
	return {
		decision_id: decisionIdForEvidence(
			source.source_identity,
			directive.directive_id,
			directive.required_result,
			directive.candidate_action,
			channel ?? directive.ordered_channel,
		),
		source_identity: source.source_identity,
		source_kind: source.source_kind,
		purpose: directive.purpose,
		required_result: directive.required_result,
		candidate_action: directive.candidate_action,
		channel,
		priority: null,
		factual_reason,
		evidence,
		execution_mode: null,
		state,
		channel_intent_id: null,
		missing_decision_input: missing,
		downstream: null,
	};
}

function noDecision(source: NormalizedSource): OrchestrationDecision {
	const checked: string[] = ["distribution actions", "owner directive"];
	const factual_reason =
		`No distribution action, matching distribution rule, or owner directive assigns a ` +
		`channel to source ${source.source_identity}. Checked: ${checked.join(", ")}. ` +
		`Existence of the source is not decision evidence.`;
	return {
		decision_id: decisionIdForNoDecision(source.source_identity),
		source_identity: source.source_identity,
		source_kind: source.source_kind,
		purpose: source.purpose,
		required_result: null,
		candidate_action: null,
		channel: null,
		priority: null,
		factual_reason,
		evidence: [],
		execution_mode: null,
		state: "NO_DECISION",
		channel_intent_id: null,
		missing_decision_input: [],
		downstream: null,
	};
}
