import { getFundView } from "./fund";
import { getSponsorshipAssetsView } from "./sponsorship-asset";

// Executive money view: a read-only, on-demand aggregation for the owner.
// Fundraising and sponsorship are separate processes, separate
// relationships, and separate lifecycles. This view only places their
// numbers side by side for visibility; it merges no tables, no stages,
// and performs no writes.

export interface ExecutiveMoneyFundSummary {
	id: string;
	name: string;
	goal_amount: number;
	raised_amount: number;
	currency: string;
	status: string;
	stage_counts: Record<string, number>;
	ask_by_stage: Record<string, number>;
	committed_ask_total: number;
	follow_ups_due_now: number;
}

export interface ExecutiveMoneySponsorshipSummary {
	assets: Array<{
		id: string;
		title: string;
		object_type: string;
		object_id: string;
		stage: string;
		next_action: string;
	}>;
	stage_counts: Record<string, number>;
	committed_count: number;
	note: string;
}

export interface ExecutiveMoneyView {
	ok: true;
	generated_at: string;
	fundraising: {
		funds: ExecutiveMoneyFundSummary[];
		totals: {
			goal_amount: number;
			raised_amount: number;
			committed_ask_total: number;
		};
	};
	donations: {
		available: false;
		reason: string;
	};
	sponsorship: ExecutiveMoneySponsorshipSummary;
	disclaimer: string;
}

const num = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

export async function getExecutiveMoneyView(
	db: D1Database,
): Promise<ExecutiveMoneyView> {
	const [fundView, sponsorshipView] = await Promise.all([
		getFundView(db),
		getSponsorshipAssetsView(db),
	]);

	const funds: ExecutiveMoneyFundSummary[] = fundView.funds.map((entry) => {
		const ask_by_stage: Record<string, number> = {};
		for (const prospect of entry.prospects) {
			const stage = String(prospect.stage ?? "unknown");
			ask_by_stage[stage] = (ask_by_stage[stage] ?? 0) + num(prospect.ask_amount);
		}
		const committed_ask_total = entry.prospects
			.filter((prospect) => prospect.stage === "committed")
			.reduce((sum, prospect) => sum + num(prospect.ask_amount), 0);
		return {
			id: entry.fund.id,
			name: entry.fund.name,
			goal_amount: num(entry.fund.goal_amount),
			raised_amount: num(entry.fund.raised_amount),
			currency: entry.fund.currency,
			status: entry.fund.status,
			stage_counts: entry.stage_counts,
			ask_by_stage,
			committed_ask_total,
			follow_ups_due_now: entry.follow_ups_due_now,
		};
	});

	const totals = {
		goal_amount: funds.reduce((sum, f) => sum + f.goal_amount, 0),
		raised_amount: funds.reduce((sum, f) => sum + f.raised_amount, 0),
		committed_ask_total: funds.reduce((sum, f) => sum + f.committed_ask_total, 0),
	};

	const stage_counts: Record<string, number> = {};
	for (const asset of sponsorshipView.assets) {
		const stage = String(asset.stage ?? "unknown");
		stage_counts[stage] = (stage_counts[stage] ?? 0) + 1;
	}

	return {
		ok: true,
		generated_at: new Date().toISOString(),
		fundraising: { funds, totals },
		donations: {
			available: false,
			reason: "Donation outcome feed is not connected yet",
		},
		sponsorship: {
			assets: sponsorshipView.assets.map((asset) => ({
				id: asset.id,
				title: asset.title,
				object_type: asset.object_type,
				object_id: asset.object_id,
				stage: asset.stage,
				next_action: asset.next_action,
			})),
			stage_counts,
			committed_count: stage_counts["committed"] ?? 0,
			note: "Agreement values are not recorded in the machine; stages and counts only.",
		},
		disclaimer:
			"Fundraising and sponsorship are separate processes, relationships, and lifecycles. This view aggregates them for visibility only.",
	};
}
