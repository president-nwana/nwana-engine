/**
 * Current Google Ads proposal intents (compatibility layer).
 *
 * This module is no longer the manually maintained production list of
 * campaign intents. The intents are produced by the orchestration layer
 * (orchestration-google-ads.ts): normalized sources -> channel decisions
 * -> channel intents through the ADR-0031 adapters and proposal pipeline.
 * This module only projects that output for the existing callers
 * (reconcile-facing desired state, Operating Center) and keeps the
 * desired-state builder byte-identical for the reconcile endpoint.
 */

import {
	validateDesiredState,
	type CampaignSpec,
	type DesiredState,
} from "./google-ads-state";
import {
	proposalIdentity,
	type NormalizedCampaignIntent,
} from "./google-ads-intent";
import { buildCampaignSpecFromIntent } from "./google-ads-proposals";
import { orchestrationGoogleAdsIntents } from "./orchestration-google-ads";

/**
 * Thin projection of the orchestration output. No manual campaign list:
 * which intents exist is decided by orchestration evidence, not by this
 * module.
 */
export function currentProposalIntents(): NormalizedCampaignIntent[] {
	return orchestrationGoogleAdsIntents();
}

/**
 * Reconcile-facing desired state, built from the current intents
 * through the generic builder. Output is identical to the previous
 * hardcoded builders: same campaign names, budgets, geo, ad groups,
 * keywords, ads, and sitelinks.
 */
export function buildDesiredState(): DesiredState {
	const campaigns: CampaignSpec[] = [];
	for (const intent of currentProposalIntents()) {
		const built = buildCampaignSpecFromIntent(intent);
		if (!built.ok) {
			throw new Error(
				`Google Ads desired state: intent ${proposalIdentity(intent)} ` +
				`has insufficient input: ${built.missing_fields.join(", ")}`,
			);
		}
		campaigns.push(built.spec);
	}
	const state: DesiredState = {
		version: "2026-09-22",
		generated_at: new Date().toISOString(),
		campaigns,
	};
	const violations = validateDesiredState(state);
	if (violations.length > 0) {
		throw new Error(`Desired state violates Ad Grants policy: ${violations.join("; ")}`);
	}
	return state;
}
