export interface DistributionObject {
	object_id: string;
	object_type: string;
	title: string | null;
	status: string;
	program_family: string | null;
	commercial_role: string | null;
}

export interface DistributionCapability {
	capability_type: string;
	available: number;
	configured: number;
	read_state: string;
	write_state: string;
	permission_state: string;
	distribution_eligible: number;
	source_platform: string | null;
}

export interface DistributionRule {
	rule_id: string;
	name: string;
	priority: number;
	match_object_type: string | null;
	match_program_family: string | null;
	match_commercial_role: string | null;
	match_capability_type: string | null;
	match_status: string | null;
}

export interface DistributionAudience {
	audience_id: string;
	rule_id: string;
	audience_type: string;
	enabled: number;
}

export interface DistributionAction {
	action_id: string;
	rule_id: string;
	audience_id: string | null;
	action_type: string;
	channel: string;
	destination: string | null;
	execution_mode: string;
	priority: number;
	enabled: number;
}

export function matchesDistributionRule(
	object: DistributionObject,
	capabilities: ReadonlySet<string>,
	rule: DistributionRule,
): boolean {
	return (
		(rule.match_object_type === null ||
			rule.match_object_type === object.object_type) &&
		(rule.match_program_family === null ||
			rule.match_program_family === object.program_family) &&
		(rule.match_commercial_role === null ||
			rule.match_commercial_role === object.commercial_role) &&
		(rule.match_status === null || rule.match_status === object.status) &&
		(rule.match_capability_type === null ||
			capabilities.has(rule.match_capability_type))
	);
}

export function buildDistributionPlan(params: {
	object: DistributionObject;
	capabilities: DistributionCapability[];
	rules: DistributionRule[];
	audiences: DistributionAudience[];
	actions: DistributionAction[];
}) {
	const availableCapabilityTypes = new Set(
		params.capabilities
			.filter((capability) => capability.available === 1)
			.map((capability) => capability.capability_type),
	);
	const matchedRules = params.rules
		.filter((rule) =>
			matchesDistributionRule(params.object, availableCapabilityTypes, rule),
		)
		.sort((left, right) => left.priority - right.priority)
		.map((rule) => {
			const audiences = params.audiences
				.filter(
					(audience) =>
						audience.enabled === 1 &&
						audience.rule_id === rule.rule_id,
				)
				.map((audience) => ({
					audience_id: audience.audience_id,
					audience_type: audience.audience_type,
					actions: params.actions
						.filter(
							(action) =>
								action.enabled === 1 &&
								action.rule_id === rule.rule_id &&
								action.audience_id === audience.audience_id,
						)
						.sort((left, right) => left.priority - right.priority)
						.map((action) => ({
							action_id: action.action_id,
							action_type: action.action_type,
							channel: action.channel,
							destination: action.destination,
							execution_mode: action.execution_mode,
						})),
				}));

			return {
				rule_id: rule.rule_id,
				name: rule.name,
				priority: rule.priority,
				audiences,
			};
		});

	const audienceCount = matchedRules.reduce(
		(total, rule) => total + rule.audiences.length,
		0,
	);
	const actionCount = matchedRules.reduce(
		(total, rule) =>
			total +
			rule.audiences.reduce(
				(audienceTotal, audience) =>
					audienceTotal + audience.actions.length,
				0,
			),
		0,
	);

	return {
		mode: "PLAN_ONLY" as const,
		execution_allowed: false as const,
		object: params.object,
		capabilities: params.capabilities
			.map((capability) => ({
				capability_type: capability.capability_type,
				platform_available: capability.available === 1,
				configured_for_object: capability.configured === 1,
				distribution_eligible:
					capability.distribution_eligible === 1,
				read_state: capability.read_state,
				write_state: capability.write_state,
				permission_state: capability.permission_state,
				source_platform: capability.source_platform,
			}))
			.sort((left, right) =>
				left.capability_type.localeCompare(
					right.capability_type,
				),
			),
		rules: matchedRules,
		summary: {
			matched_rules: matchedRules.length,
			audiences: audienceCount,
			actions: actionCount,
		},
	};
}
