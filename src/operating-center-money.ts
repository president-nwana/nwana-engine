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
		available: boolean;
		reason: string;
		event_count: number;
		total_gross_cents: number;
		currency: string;
		last_sync_at: string | null;
	};
	sponsorship: ExecutiveMoneySponsorshipSummary;
	disclaimer: string;
}

const num = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

// Phase 1 Money Ingestion: donation outcomes from canonical D1 monetary
// state (money_events), per ADR-0044. This reads Engine state only — it
// never re-reads RunSignup. Falls back to "not connected" when the money
// event store has no rows yet (or the migration has not run here).
async function getDonationOutcome(db: D1Database): Promise<ExecutiveMoneyView["donations"]> {
	const unavailable = (reason: string): ExecutiveMoneyView["donations"] => ({
		available: false,
		reason,
		event_count: 0,
		total_gross_cents: 0,
		currency: "USD",
		last_sync_at: null,
	});
	try {
		const agg = await db
			.prepare(
				`SELECT COUNT(*) AS event_count,
						COALESCE(SUM(CASE WHEN gross_status = 'VERIFIED' THEN gross_cents ELSE 0 END), 0) AS total_gross_cents
				 FROM money_events WHERE event_type = 'donation_received'`,
			)
			.first<{ event_count: number; total_gross_cents: number }>();
		const sync = await db
			.prepare(`SELECT last_sync_at FROM money_sync_state WHERE source_key = ?`)
			.bind("runsignup:donations:race:212466")
			.first<{ last_sync_at: string | null }>();
		const eventCount = num(agg?.event_count);
		if (eventCount === 0) {
			return unavailable(
				sync?.last_sync_at
					? "Donation feed synced; no donations recorded yet"
					: "Donation outcome feed is not connected yet",
			);
		}
		return {
			available: true,
			reason: "RunSignup donations ingested into canonical Engine monetary state",
			event_count: eventCount,
			total_gross_cents: num(agg?.total_gross_cents),
			currency: "USD",
			last_sync_at: sync?.last_sync_at ?? null,
		};
	} catch {
		return unavailable("Donation outcome feed is not connected yet");
	}
}

export async function getExecutiveMoneyView(
	db: D1Database,
): Promise<ExecutiveMoneyView> {
	const [fundView, sponsorshipView, donationOutcome] = await Promise.all([
		getFundView(db),
		getSponsorshipAssetsView(db),
		getDonationOutcome(db),
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
		donations: donationOutcome,
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
