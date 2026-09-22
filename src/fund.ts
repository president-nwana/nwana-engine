// ADR-0015: Fund as a first-class NWANA machine object.
//
// A Fund is created at the moment the fundraising idea exists. Its prospect
// pipeline moves through the machine lifecycle:
//
//   prospect -> verified -> drafted -> sent -> follow_up -> committed
//   -> stewardship -> recognition
//
// The owner still presses Send and signs every outreach letter. The machine
// never sends on its own: it tracks pipeline state, surfaces the next action
// per stage, and routes committed funds into stewardship and public
// recognition. The first live object is the $50K Manhattan HQ bridge sprint.

export const FUND_STAGES = [
	"prospect",
	"verified",
	"drafted",
	"sent",
	"follow_up",
	"committed",
	"stewardship",
	"recognition",
] as const;

export type FundStage = (typeof FUND_STAGES)[number];

export const FUND_STAGE_LABELS: Record<FundStage, string> = {
	prospect: "Prospect",
	verified: "Verified",
	drafted: "Drafted",
	sent: "Sent",
	follow_up: "Follow-up",
	committed: "Committed",
	stewardship: "Stewardship",
	recognition: "Public recognition",
};

// Forward flow plus one-step corrections backward, plus the direct
// sent -> committed path when a prospect commits without a follow-up nudge.
// recognition is terminal: a recognized donor stays recognized.
const FUND_TRANSITIONS: Record<FundStage, FundStage[]> = {
	prospect: ["verified"],
	verified: ["prospect", "drafted"],
	drafted: ["verified", "sent"],
	sent: ["drafted", "follow_up", "committed"],
	follow_up: ["sent", "committed"],
	committed: ["follow_up", "stewardship"],
	stewardship: ["committed", "recognition"],
	recognition: [],
};

export function isFundStage(value: string): value is FundStage {
	return (FUND_STAGES as readonly string[]).includes(value);
}

export function allowedFundTransitions(stage: FundStage): FundStage[] {
	return FUND_TRANSITIONS[stage];
}

export interface FundTransitionResult {
	ok: boolean;
	to: FundStage | null;
	reason: string | null;
}

export function transitionFundProspect(
	current: string,
	target: string,
): FundTransitionResult {
	if (!isFundStage(current)) {
		return { ok: false, to: null, reason: `Unknown current stage "${current}"` };
	}
	if (!isFundStage(target)) {
		return { ok: false, to: null, reason: `Unknown target stage "${target}"` };
	}
	if (current === target) {
		return { ok: true, to: current, reason: null };
	}
	if (!FUND_TRANSITIONS[current].includes(target)) {
		return {
			ok: false,
			to: null,
			reason: `Stage "${current}" cannot move to "${target}". Allowed: ${FUND_TRANSITIONS[current].join(", ") || "none (terminal)"}.`,
		};
	}
	return { ok: true, to: target, reason: null };
}

// The owner action the machine surfaces for a prospect sitting in a stage.
// Sends stay manual: the machine prepares and tracks, the owner sends.
export function fundProspectNextAction(stage: FundStage): string {
	switch (stage) {
		case "prospect":
			return "Verify vital status and a published official email before drafting.";
		case "verified":
			return "Draft the outreach letter with the current one-pager attached.";
		case "drafted":
			return "Owner reviews the draft, then presses Send from his own mailbox.";
		case "sent":
			return "Watch for a reply or bounce. No action until the follow-up window.";
		case "follow_up":
			return "Send one follow-up. Owner presses Send again.";
		case "committed":
			return "Record the committed amount, send thanks, open stewardship.";
		case "stewardship":
			return "Keep the donor close: progress updates, recognition offer.";
		case "recognition":
			return "Public recognition is live. Route to the next object.";
	}
}

export interface FundRecord {
	id: string;
	name: string;
	slug: string;
	goal_amount: number;
	raised_amount: number;
	currency: string;
	status: string;
	description: string | null;
	created_at: string;
	updated_at: string;
}

export interface FundProspectSeed {
	id: string;
	name: string;
	email: string;
	stage: FundStage;
	ask_amount: number;
	ask_tier: string;
	subject: string;
	one_pager_version: string;
	sent_at: string | null;
	notes: string | null;
}

export interface FundProspectRecord extends FundProspectSeed {
	fund_id: string;
	stage_updated_at: string;
}

export const BRIDGE_SPRINT_FUND: FundRecord = {
	id: "fund-50k-bridge-sprint",
	name: "$50K Manhattan HQ Bridge Sprint",
	slug: "50k-manhattan-hq-bridge-sprint",
	goal_amount: 50000,
	raised_amount: 0,
	currency: "USD",
	status: "active",
	description:
		"Founding capital to build the NWANA federation machine: the operating engine, Series 2027, and the Manhattan headquarters. Bridge to the $2.32M North American Expansion Fund.",
	created_at: "2026-09-20T00:00:00.000Z",
	updated_at: "2026-09-22T00:00:00.000Z",
};

// Factual seed from the outreach registry: Pool 4, all 15 letters pressed
// Send by the owner on 2026-09-22 and verified in Sent mail. One-pager v5
// was attached to every Pool 4 letter.
const SENT_AT = "2026-09-22T14:19:00.000Z";

function seedProspect(
	slug: string,
	name: string,
	email: string,
	ask_amount: number,
	ask_tier: string,
	subject: string,
): FundProspectSeed {
	return {
		id: `fund-50k-bridge-sprint-${slug}`,
		name,
		email,
		stage: "sent",
		ask_amount,
		ask_tier,
		subject,
		one_pager_version: "v5",
		sent_at: SENT_AT,
		notes: "Pool 4. Draft staged by the assistant; owner pressed Send 2026-09-22 ~10:19am ET; verified in Sent mail.",
	};
}

export const BRIDGE_SPRINT_PROSPECTS: FundProspectSeed[] = [
	seedProspect("dean-ornish", "Dean Ornish", "Dean.Ornish@PMRI.org", 10000, "$10K Founding Partner", "Lifestyle medicine needs a sport"),
	seedProspect("peter-attia", "Peter Attia", "Peter@PeterAttiaMD.com", 10000, "$10K Founding Partner", "Exercise is the best longevity intervention. Here is its sport."),
	seedProspect("michael-phelps", "Michael Phelps", "info@michaelphelpsfoundation.org", 10000, "$10K Founding Partner", "A participation sport for the health of America"),
	seedProspect("pau-gasol", "Pau Gasol (via Hector De La Torre)", "hdelatorre@gasolfoundation.org", 10000, "$10K Founding Partner", "A new American sport, built for health"),
	seedProspect("cal-ripken-jr", "Cal Ripken Jr.", "info@ripkenfoundation.org", 10000, "$10K Founding Partner", "From the Iron Man streak to a continental series"),
	seedProspect("novak-djokovic", "Novak Djokovic", "contact@novakdjokovicfoundation.org", 10000, "$10K Founding Partner", "A sport every child can compete in"),
	seedProspect("roger-federer", "Roger Federer", "foundation@rogerfederer.com", 25000, "$25K HQ Founder", "A sport built to last a lifetime"),
	seedProspect("ben-greenfield", "Ben Greenfield", "ben@bengreenfieldfitness.com", 5000, "$5K Founder", "Your audience needs a sport"),
	seedProspect("denise-austin", "Denise Austin", "press@deniseaustin.com", 5000, "$5K Founder", "A sport for the active-aging generation"),
	seedProspect("rhonda-patrick", "Rhonda Patrick", "team@foundmyfitness.com", 5000, "$5K Founder", "Exercise science needs a sport"),
	seedProspect("mark-hyman", "Mark Hyman", "support@drhyman.com", 5000, "$5K Founder", "Functional medicine needs a sport"),
	seedProspect("jackie-joyner-kersee", "Jackie Joyner-Kersee", "info@jjkfoundation.org", 5000, "$5K Founder", "From Olympic gold to a sport for every kid"),
	seedProspect("kareem-abdul-jabbar", "Kareem Abdul-Jabbar", "info@skyhookfoundation.org", 10000, "$10K Founding Partner", "A sport for lifelong movement"),
	seedProspect("lindsey-vonn", "Lindsey Vonn", "scholarships@lindseyvonnfoundation.org", 5000, "$5K Founder", "A sport for the next generation of girls"),
	seedProspect("jillian-michaels", "Jillian Michaels", "support@jillianmichaels.com", 5000, "$5K Founder", "A sport for everyone who moves"),
];

export interface FundViewProspect extends FundProspectRecord {
	next_action: string;
}

export interface FundView {
	fund: FundRecord;
	stage_counts: Record<FundStage, number>;
	prospects: FundViewProspect[];
}

export async function getFundView(db: D1Database): Promise<{
	ok: true;
	generated_at: string;
	funds: FundView[];
}> {
	const fundRows = await db
		.prepare(`SELECT * FROM funds ORDER BY created_at`)
		.all<FundRecord>();
	const prospectRows = await db
		.prepare(`SELECT * FROM fund_prospects ORDER BY name`)
		.all<FundProspectRecord>();

	const byFund = new Map<string, FundProspectRecord[]>();
	for (const p of prospectRows.results) {
		const list = byFund.get(p.fund_id) ?? [];
		list.push(p);
		byFund.set(p.fund_id, list);
	}

	return {
		ok: true,
		generated_at: new Date().toISOString(),
		funds: fundRows.results.map((fund) => {
			const prospects = (byFund.get(fund.id) ?? []).map((p) => ({
				...p,
				next_action: isFundStage(p.stage)
					? fundProspectNextAction(p.stage)
					: "Unknown stage: review manually.",
			}));
			const stage_counts = Object.fromEntries(
				FUND_STAGES.map((s) => [s, prospects.filter((p) => p.stage === s).length]),
			) as Record<FundStage, number>;
			return { fund, stage_counts, prospects };
		}),
	};
}

// Idempotent: safe to call on every deploy or by hand. Never duplicates.
export async function seedBridgeSprintFund(db: D1Database): Promise<{
	ok: true;
	seeded: boolean;
	fund_id: string;
	prospects: number;
}> {
	const existing = await db
		.prepare(`SELECT id FROM funds WHERE slug = ?`)
		.bind(BRIDGE_SPRINT_FUND.slug)
		.first<{ id: string }>();
	if (existing) {
		const count = await db
			.prepare(`SELECT COUNT(*) AS n FROM fund_prospects WHERE fund_id = ?`)
			.bind(existing.id)
			.first<{ n: number }>();
		return { ok: true, seeded: false, fund_id: existing.id, prospects: count?.n ?? 0 };
	}
	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO funds (id, name, slug, goal_amount, raised_amount, currency, status, description, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			BRIDGE_SPRINT_FUND.id,
			BRIDGE_SPRINT_FUND.name,
			BRIDGE_SPRINT_FUND.slug,
			BRIDGE_SPRINT_FUND.goal_amount,
			BRIDGE_SPRINT_FUND.raised_amount,
			BRIDGE_SPRINT_FUND.currency,
			BRIDGE_SPRINT_FUND.status,
			BRIDGE_SPRINT_FUND.description,
			BRIDGE_SPRINT_FUND.created_at,
			now,
		)
		.run();
	for (const p of BRIDGE_SPRINT_PROSPECTS) {
		await db
			.prepare(
				`INSERT INTO fund_prospects (id, fund_id, name, email, stage, ask_amount, ask_tier, subject, one_pager_version, sent_at, stage_updated_at, notes)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				p.id,
				BRIDGE_SPRINT_FUND.id,
				p.name,
				p.email,
				p.stage,
				p.ask_amount,
				p.ask_tier,
				p.subject,
				p.one_pager_version,
				p.sent_at,
				now,
				p.notes,
			)
			.run();
	}
	return { ok: true, seeded: true, fund_id: BRIDGE_SPRINT_FUND.id, prospects: BRIDGE_SPRINT_PROSPECTS.length };
}

export async function advanceFundProspect(
	db: D1Database,
	prospectId: string,
	toStage: string,
): Promise<
	| { ok: true; prospect: FundProspectRecord }
	| { ok: false; error: string }
> {
	const transition = transitionFundProspect(
		(await db.prepare(`SELECT stage FROM fund_prospects WHERE id = ?`).bind(prospectId).first<{ stage: string }>())?.stage ?? "unknown",
		toStage,
	);
	if (!transition.ok || !transition.to) {
		return { ok: false, error: transition.reason ?? "Transition rejected" };
	}
	const now = new Date().toISOString();
	await db
		.prepare(`UPDATE fund_prospects SET stage = ?, stage_updated_at = ? WHERE id = ?`)
		.bind(transition.to, now, prospectId)
		.run();
	const updated = await db
		.prepare(`SELECT * FROM fund_prospects WHERE id = ?`)
		.bind(prospectId)
		.first<FundProspectRecord>();
	if (!updated) {
		return { ok: false, error: `Prospect "${prospectId}" not found` };
	}
	return { ok: true, prospect: updated };
}
