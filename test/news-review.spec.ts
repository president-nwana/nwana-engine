import { describe, expect, it } from "vitest";
import { approveNewsReview, getNewsReview, markDistributionSent } from "../src/news-review";

const ARTICLE_ID = "news-sven-thorslund-elite-2026-09-26";

const ARTICLE = {
	article_id: ARTICLE_ID,
	title: "Sven Thorslund joins the NWANA Elite Athletes Club",
	status: "PUBLISHED",
	published_at: "2026-09-26",
	angle: "elite_athlete_joined",
	body_html: "Sven Thorslund joins the NWANA Elite Athletes Club.",
};

const VARIANTS = [
	{ variant_id: "var-sven-2026-prlog", variant_type: "press_release_short", title: "PR", body: "PR body", status: "DRAFT" },
	{ variant_id: "var-sven-2026-podcastguests", variant_type: "guest_pitch", title: "Pitch", body: "Pitch body", status: "DRAFT" },
];

const DISTS = [
	{ distribution_id: "dist-threads", channel: "threads", outlet_name: "Threads @nwana.official", status: "prepared", sent_at: null, notes: "MANUAL", created_at: "2026-09-27" },
	{ distribution_id: "dist-prlog", channel: "prlog", outlet_name: "PRLog", status: "prepared", sent_at: null, notes: "MANUAL. Variant: var-sven-2026-prlog.", created_at: "2026-09-27" },
	{ distribution_id: "dist-noref", channel: "prlog", outlet_name: "X", status: "prepared", sent_at: null, notes: "no variant ref", created_at: "2026-09-27" },
];

function makeDb(opts: { variants?: typeof VARIANTS; dists?: typeof DISTS; distRow?: unknown } = {}) {
	const variants = opts.variants ?? VARIANTS;
	const dists = opts.dists ?? DISTS;
	const runCalls: string[] = [];
	return {
		runCalls,
		prepare: (sql: string) => ({
			bind: function (...args: unknown[]) { (this as { _args?: unknown[] })._args = args; return this; },
			all: async () => ({
				results: /FROM media_content_variants/.test(sql) ? variants
					: /FROM media_distributions/.test(sql) && /ORDER BY channel/.test(sql) ? dists
					: [],
			}),
			first: async () => {
				if (/FROM media_articles/.test(sql) && /WHERE article_id/.test(sql)) return ARTICLE;
				if (/COUNT\(\*\)/.test(sql)) return { n: dists.length };
				if (/FROM media_distributions WHERE distribution_id/.test(sql)) return opts.distRow ?? dists[0];
				return null;
			},
			run: async function (this: { _args?: unknown[] }) {
				runCalls.push(sql + " | args: " + JSON.stringify(this._args ?? []));
				return { meta: { changes: 2 } };
			},
		}),
	} as never;
}

describe("news review", () => {
	it("returns article, variants, and distributions with resolved post texts", async () => {
		const res = await getNewsReview(makeDb(), ARTICLE_ID);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; review: { article: { title: string }; variants: unknown[]; distributions: Array<{ channel: string; post_text: string; text_source: string }> } };
		expect(body.ok).toBe(true);
		expect(body.review.article.title).toContain("Sven Thorslund");
		expect(body.review.variants).toHaveLength(2);
		expect(body.review.distributions).toHaveLength(3);

		const threads = body.review.distributions.find((d) => d.channel === "threads")!;
		expect(threads.post_text).toContain("Sven Thorslund");
		expect(threads.post_text).toContain("https://www.nwaofna.org/news/sven-thorslund-joins-elite-athletes-club");
		expect(threads.text_source).toContain("generated");

		const prlog = body.review.distributions.find((d) => d.distribution_id === "dist-prlog")!;
		expect(prlog.post_text).toBe("PR body");
		expect(prlog.text_source).toContain("var-sven-2026-prlog");

		const noref = body.review.distributions.find((d) => d.distribution_id === "dist-noref")!;
		expect(noref.post_text).toBe("");
		expect(noref.text_source).toContain("missing");
	});

	it("404s for an unknown article", async () => {
		const db = {
			prepare: (sql: string) => ({
				bind: function () { return this; },
				all: async () => ({ results: [] }),
				first: async () => null,
				run: async () => ({}),
			}),
		} as never;
		const res = await getNewsReview(db, "nope");
		expect(res.status).toBe(404);
		const body = (await res.json()) as { ok: boolean; error: string };
		expect(body.ok).toBe(false);
	});

	it("approve flips DRAFT variants and writes an audit event", async () => {
		const db = makeDb() as unknown as { runCalls: string[] } & Record<string, unknown>;
		const res = await approveNewsReview(db as never, ARTICLE_ID);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; variants_approved: number; distributions_prepared: number };
		expect(body.ok).toBe(true);
		expect(body.variants_approved).toBe(2);
		expect(body.distributions_prepared).toBe(3);
		expect(db.runCalls.some((s) => /UPDATE media_content_variants/.test(s))).toBe(true);
		expect(db.runCalls.some((s) => /INSERT INTO audit_events/.test(s) && /NEWS_DISTRIBUTION_APPROVED/.test(s))).toBe(true);
	});

	it("mark-sent records status sent with a timestamp and audits", async () => {
		const db = makeDb() as unknown as { runCalls: string[] } & Record<string, unknown>;
		const res = await markDistributionSent(db as never, "dist-threads");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; status: string };
		expect(body.ok).toBe(true);
		expect(body.status).toBe("sent");
		expect(db.runCalls.some((s) => /status = 'sent'/.test(s))).toBe(true);
		expect(db.runCalls.some((s) => /NEWS_DISTRIBUTION_SENT/.test(s))).toBe(true);
	});

	it("mark-sent is idempotent for an already-sent distribution", async () => {
		const db = makeDb({ distRow: { ...DISTS[0], status: "sent" } });
		const res = await markDistributionSent(db, "dist-threads");
		const body = (await res.json()) as { ok: boolean; already_sent: boolean };
		expect(body.ok).toBe(true);
		expect(body.already_sent).toBe(true);
	});
});
