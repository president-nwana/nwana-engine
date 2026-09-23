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
	type NormalizedCampaignIntent,
} from "./google-ads-intent";
import { buildCampaignSpecFromIntent } from "./google-ads-proposals";
import { orchestrationGoogleAdsIntents } from "./orchestration-google-ads";

/**
 * Thin projection of the orchestration output. No manual campaign list:
 * which intents exist is decided by orchestration evidence, not by this
 * module. D1-backed canonical sources flow into the same feed; `db`
 * may be null (for example in tests), then only static sources feed it.
 */
export async function currentProposalIntents(
	db: D1Database | null,
): Promise<NormalizedCampaignIntent[]> {
	return orchestrationGoogleAdsIntents(db);
}

/**
 * Reconcile-facing desired state, built from the current intents
 * through the generic builder. Partial intents (INSUFFICIENT_INPUT)
 * stay visible as proposals but never enter the reconcile-facing
 * desired state: only fully buildable campaign specs are desired.
 * Output is identical to the previous hardcoded builders for the
 * existing full intents: same campaign names, budgets, geo, ad groups,
 * keywords, ads, and sitelinks.
 */
export async function buildDesiredState(db: D1Database | null): Promise<DesiredState> {
	const campaigns: CampaignSpec[] = [];
	for (const intent of await currentProposalIntents(db)) {
		const built = buildCampaignSpecFromIntent(intent);
		if (!built.ok) {
			// Partial intent: proposal-visible (INSUFFICIENT_INPUT with
			// the exact missing fields), but not a creatable campaign,
			// so it is excluded from the desired state rather than
			// failing the whole feed.
			continue;
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
