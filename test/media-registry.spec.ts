import { describe, expect, it } from "vitest";
import {
	findCandidateEndpoints,
	findOutletContacts,
	recordDistributionAttempt,
} from "../src/media-registry";

// Minimal D1 stub keyed on SQL prefixes, following the repo's test pattern.

function makeDb() {
	const endpoints: Record<string, unknown>[] = [
		{
			endpoint_id: "wfts-tips",
			outlet_id: "wfts",
			name: "WFTS-TV Newsroom",
			url: "https://example.com/contact",
			accepts: '["news_tip"]',
			path_type: "email",
			cost_status: "EXPECTED $0",
			eligibility: "Tampa Bay",
			verification_level: "opened",
			manual_last_mile: "send tip",
			account_required: 0,
			notes: "",
		},
		{
			endpoint_id: "ap-newsroom",
			outlet_id: "ap",
			name: "AP Newsroom",
			url: "https://example.com/ap",
			accepts: '["press_release"]',
			path_type: "web_form",
			cost_status: "EXPECTED $0",
			eligibility: "national significance",
			verification_level: "opened",
			manual_last_mile: "fill form",
			account_required: 0,
			notes: "",
		},
		{
			endpoint_id: "unverified-blog",
			outlet_id: "blog",
			name: "Random running blog Florida",
			url: "https://example.com/blog",
			accepts: '["pitch"]',
			path_type: "email",
			cost_status: "UNKNOWN",
			eligibility: "running florida",
			verification_level: "third_party",
			manual_last_mile: "",
			account_required: 0,
			notes: "",
		},
	];
	const contacts: Record<string, unknown>[] = [
		{
			contact_id: "c1",
			outlet_id: "wfts",
			name: "WFTS newsroom",
			role: "newsroom",
			email: "tips@example.com",
			phone: null,
			beat: "",
			consent_class: "RESEARCHED_COLD",
			verification_level: "opened",
		},
		{
			contact_id: "c2",
			outlet_id: "wfts",
			name: "Press subscriber",
			role: "",
			email: "press@example.com",
			phone: null,
			beat: "",
			consent_class: "OPTED_IN",
			verification_level: "opened",
		},
	];
	const inserted: Record<string, unknown>[] = [];

	const db = {
		_tables: { endpoints, contacts, inserted },
		prepare(sql: string) {
			let args: unknown[] = [];
			const api = {
				bind(...params: unknown[]) {
					args = params;
					return api;
				},
				async all<T>() {
					if (sql.includes("FROM media_submission_endpoints e")) {
						let rows = endpoints.slice();
						if (sql.includes("e.verification_level = 'opened'")) {
							rows = rows.filter((r) => r.verification_level === "opened");
						}
						if (sql.includes("e.accepts LIKE ?")) {
							const needle = String(args[0]).replace(/%/g, "").replace(/"/g, "");
							rows = rows.filter((r) => String(r.accepts).includes(needle));
						}
						return { results: rows } as T;
					}
					if (sql.includes("FROM media_contacts WHERE")) {
						let rows = contacts.filter((c) => c.outlet_id === args[0]);
						if (sql.includes("consent_class = ?")) {
							rows = rows.filter((c) => c.consent_class === args[1]);
						}
						return { results: rows } as T;
					}
					return { results: [] } as T;
				},
				async run() {
					inserted.push({ sql, args });
					return { success: true } as never;
				},
				async first<T>() {
					return null as T;
				},
			};
			return api;
		},
	};
	return db as unknown as D1Database & { _tables: Record<string, Record<string, unknown>[]> };
}

describe("media registry matching", () => {
	it("verifiedOnly returns only opened endpoints by default", async () => {
		const db = makeDb();
		const rows = await findCandidateEndpoints(db, {});
		expect(rows.length).toBe(2);
		expect(rows.every((r) => r.verification_level === "opened")).toBe(true);
	});

	it("can include unverified rows flagged with their level", async () => {
		const db = makeDb();
		const rows = await findCandidateEndpoints(db, { verifiedOnly: false });
		expect(rows.length).toBe(3);
		const flagged = rows.find((r) => r.endpoint_id === "unverified-blog");
		expect(flagged?.verification_level).toBe("third_party");
	});

	it("filters by accepts type", async () => {
		const db = makeDb();
		const rows = await findCandidateEndpoints(db, {
			verifiedOnly: false,
			accepts: "press_release",
		});
		expect(rows.map((r) => r.endpoint_id)).toEqual(["ap-newsroom"]);
	});

	it("filters endpoints by category keywords", async () => {
		const db = makeDb();
		const rows = await findCandidateEndpoints(db, {
			verifiedOnly: false,
			categories: ["florida"],
		});
		expect(rows.map((r) => r.endpoint_id)).toContain("unverified-blog");
	});

	it("exposes consent_class so the caller can enforce the bulk boundary", async () => {
		const db = makeDb();
		const all = await findOutletContacts(db, "wfts");
		expect(all.length).toBe(2);
		const cold = all.filter((c) => c.consent_class === "RESEARCHED_COLD");
		expect(cold.length).toBe(1);
		// RESEARCHED_COLD must never go to the Email V2 mass layer.
		expect(cold[0].email).toBe("tips@example.com");
		const opted = await findOutletContacts(db, "wfts", "OPTED_IN");
		expect(opted.length).toBe(1);
	});

	it("records a distribution attempt as prepared, never auto-sent", async () => {
		const db = makeDb();
		await recordDistributionAttempt(db, {
			distribution_id: "dist-1",
			article_id: "art-1",
			channel: "gmail_individual",
			outlet_name: "WFTS-TV",
			contact_id: "c1",
			notes: "pitch draft ready",
		});
		const tables = (db as unknown as { _tables: Record<string, Record<string, unknown>[]> })._tables;
		expect(tables.inserted.length).toBe(1);
		const call = tables.inserted[0];
		expect(String(call.sql)).toContain("'prepared'");
		expect(call.args).toContain("gmail_individual");
	});
});
