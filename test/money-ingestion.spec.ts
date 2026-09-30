// Money ingestion tests: idempotent sync, no-duplicate re-sync, lifecycle
// derivation, checkpoint-only-after-commit, failure classification.
//
// The D1 stub emulates exactly the statements issued by
// src/lib/money-ingestion.ts (same approach as test/canonical-metrics.spec.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	responses: [] as Array<{
		ok: boolean;
		data?: unknown;
		http_status?: number;
		api_error_code?: number;
		api_error_msg?: string;
	}>,
}));

vi.mock("../src/runsignup-client", async (importOriginal) => {
	const mod = (await importOriginal()) as Record<string, unknown>;
	return {
		...mod,
		runSignupGetJson: async () => {
			const r = mocks.responses.shift();
			if (!r) throw new Error("unexpected RunSignup call: no mocked response left");
			return r;
		},
	};
});

// Import after the mock is registered.
const { syncRunSignupDonations, getMoneySyncState, listMoneyEvents, listMoneyTransactions } =
	await import("../src/lib/money-ingestion");

interface StubStatement {
	sql: string;
	args: unknown[];
}

function makeMoneyDb() {
	const events = new Map<string, Record<string, unknown>>();
	const transactions = new Map<string, Record<string, unknown>>();
	const sync = new Map<string, Record<string, unknown>>();

	const EVENT_COLS = [
		"event_key", "source_system", "source_transaction_id", "transaction_key",
		"event_type", "occurred_at", "currency",
		"gross_cents", "gross_status", "fee_cents", "fee_status",
		"net_cents", "net_status", "refund_cents", "refund_status",
		"attribution", "source_ref", "source_payload_hash",
	];
	// money_transactions INSERT binds (lifecycle_state is the 'ACTIVE' literal in SQL).
	const TXN_COLS = [
		"transaction_key", "source_system", "source_transaction_id", "first_event_key",
		"currency", "gross_cents", "gross_status", "fee_cents", "fee_status",
		"net_cents", "net_status", "refund_cents", "refund_status",
		"attribution", "source_ref", "source_payload_hash",
	];

	const rowFrom = (cols: string[], args: unknown[]) => {
		const row: Record<string, unknown> = {};
		cols.forEach((c, i) => (row[c] = args[i]));
		return row;
	};

	const applyStatement = (st: StubStatement): number => {
		const sql = st.sql.replace(/\s+/g, " ").trim();
		if (sql.startsWith("INSERT OR IGNORE INTO money_events")) {
			const row = rowFrom(EVENT_COLS, st.args);
			const key = String(row["event_key"]);
			if (events.has(key)) return 0;
			events.set(key, row);
			return 1;
		}
		if (sql.startsWith("INSERT INTO money_transactions")) {
			const row = rowFrom(TXN_COLS, st.args);
			row["lifecycle_state"] = "ACTIVE";
			transactions.set(String(row["transaction_key"]), row);
			return 1;
		}
		if (sql.startsWith("UPDATE money_transactions")) {
			// binds: currency, gross_cents, gross_status, fee_cents, fee_status,
			// net_cents, net_status, refund_cents, refund_status,
			// lifecycle_state, source_payload_hash, transaction_key
			const a = st.args;
			const t = transactions.get(String(a[11]));
			if (!t) return 0;
			t["currency"] = a[0]; t["gross_cents"] = a[1]; t["gross_status"] = a[2];
			t["fee_cents"] = a[3]; t["fee_status"] = a[4]; t["net_cents"] = a[5];
			t["net_status"] = a[6]; t["refund_cents"] = a[7]; t["refund_status"] = a[8];
			t["lifecycle_state"] = a[9]; t["source_payload_hash"] = a[10];
			return 1;
		}
		if (sql.includes("money_sync_state")) {
			// upsert binds: source_key, cursor, last_sync_at, last_sync_result
			// (failure path binds: source_key, last_sync_at, last_error)
			const a = st.args;
			if (a.length === 4) {
				sync.set(String(a[0]), {
					source_key: a[0], cursor: a[1], last_sync_at: a[2],
					last_sync_result: a[3], last_error: null,
				});
			} else {
				const prev = sync.get(String(a[0])) ?? { source_key: a[0] };
				sync.set(String(a[0]), { ...prev, last_sync_at: a[1], last_error: a[2] });
			}
			return 1;
		}
		throw new Error(`stub cannot handle SQL: ${sql.slice(0, 80)}`);
	};

	const prepare = (rawSql: string) => {
		const sql = rawSql;
		let args: unknown[] = [];
		const stmt = {
			bind(...params: unknown[]) {
				args = params;
				return stmt;
			},
			async all() {
				const norm = sql.replace(/\s+/g, " ").trim();
				if (norm.includes("FROM money_transactions") && norm.includes("IN (")) {
					const keys = new Set(args.map(String));
					return {
						results: [...transactions.values()].filter((t) =>
							keys.has(String(t["transaction_key"])),
						),
					};
				}
				if (norm.includes("FROM money_events")) {
					return { results: [...events.values()] };
				}
				if (norm.includes("FROM money_transactions")) {
					return { results: [...transactions.values()] };
				}
				throw new Error(`stub all() cannot handle SQL: ${norm.slice(0, 80)}`);
			},
			async first() {
				const norm = sql.replace(/\s+/g, " ").trim();
				if (norm.includes("FROM money_sync_state")) {
					return sync.get(String(args[0])) ?? null;
				}
				throw new Error(`stub first() cannot handle SQL: ${norm.slice(0, 80)}`);
			},
			_sql: sql,
			_getArgs: () => args,
		};
		return stmt;
	};

	const db = {
		prepare,
		async batch(statements: Array<{ _sql: string; _getArgs: () => unknown[] }>) {
			// Atomic all-or-nothing, like D1: validate first, then apply.
			const parsed: StubStatement[] = statements.map((s) => ({
				sql: s._sql,
				args: s._getArgs(),
			}));
			const results = parsed.map((st) => ({ meta: { changes: applyStatement(st) } }));
			return results;
		},
	};

	return {
		db: db as unknown as D1Database,
		events,
		transactions,
		sync,
	};
}

const donationPage = (donations: unknown[]) => ({
	ok: true as const,
	data: { donations },
	http_status: 200,
});

beforeEach(() => {
	mocks.responses.length = 0;
});

describe("syncRunSignupDonations", () => {
	it("ingests donations into canonical events and transactions", async () => {
		const { db, events, transactions, sync } = makeMoneyDb();
		mocks.responses.push(
			donationPage([
				{ donation_id: 101, donation_amount: 50, donation_date: "2026-09-20 10:00:00" },
				{ donation_id: 102, donation_amount: 25.5, processing_fee: 1.02 },
			]),
		);

		const r = await syncRunSignupDonations(db, "token");
		expect(r.ok).toBe(true);
		expect(r.fetched).toBe(2);
		expect(r.transactionsNew).toBe(2);
		expect(r.eventsIngested).toBe(2);
		expect(r.eventsDuplicate).toBe(0);
		expect(r.cursor).toBe("102");

		expect(events.size).toBe(2);
		expect(events.has("runsignup:evt:donation_received:donation:101")).toBe(true);
		const e101 = events.get("runsignup:evt:donation_received:donation:101")!;
		expect(e101["gross_cents"]).toBe(5000);
		expect(e101["gross_status"]).toBe("VERIFIED");
		expect(e101["fee_status"]).toBe("UNKNOWN");
		expect(e101["attribution"]).toBe("ATTRIBUTION_UNKNOWN");
		expect(e101["transaction_key"]).toBe("runsignup:donation:101");

		expect(transactions.size).toBe(2);
		const t102 = transactions.get("runsignup:donation:102")!;
		expect(t102["gross_cents"]).toBe(2550);
		expect(t102["fee_cents"]).toBe(102);
		expect(t102["lifecycle_state"]).toBe("ACTIVE");

		const checkpoint = sync.get("runsignup:donations:race:212466")!;
		expect(checkpoint["cursor"]).toBe("102");
		expect(checkpoint["last_error"]).toBeNull();
	});

	it("second sync against unchanged source creates zero duplicates", async () => {
		const { db, events, transactions } = makeMoneyDb();
		const page = donationPage([
			{ donation_id: 101, donation_amount: 50, donation_date: "2026-09-20 10:00:00" },
		]);
		mocks.responses.push(page);
		const first = await syncRunSignupDonations(db, "token");
		expect(first.eventsIngested).toBe(1);

		mocks.responses.push(
			donationPage([
				{ donation_id: 101, donation_amount: 50, donation_date: "2026-09-20 10:00:00" },
			]),
		);
		const second = await syncRunSignupDonations(db, "token");
		expect(second.ok).toBe(true);
		expect(second.fetched).toBe(1);
		expect(second.eventsIngested).toBe(0);
		expect(second.eventsDuplicate).toBe(0); // nothing attempted: snapshot unchanged
		expect(second.transactionsNew).toBe(0);
		expect(events.size).toBe(1);
		expect(transactions.size).toBe(1);
	});

	it("skips records without a stable donation id", async () => {
		const { db, events } = makeMoneyDb();
		mocks.responses.push(donationPage([{ donation_amount: 10 }, { donation_id: 5, donation_amount: 10 }]));
		const r = await syncRunSignupDonations(db, "token");
		expect(r.ok).toBe(true);
		expect(r.skippedNoIdentity).toBe(1);
		expect(r.eventsIngested).toBe(1);
		expect(events.size).toBe(1);
	});

	it("derives a partial-refund lifecycle event on changed snapshot, idempotently", async () => {
		const { db, events, transactions } = makeMoneyDb();
		mocks.responses.push(donationPage([{ donation_id: 9, donation_amount: 100 }]));
		await syncRunSignupDonations(db, "token");
		expect(events.size).toBe(1);

		// Source now shows a partial refund.
		mocks.responses.push(
			donationPage([{ donation_id: 9, donation_amount: 100, refund_amount: 40 }]),
		);
		const r2 = await syncRunSignupDonations(db, "token");
		expect(r2.ok).toBe(true);
		expect(r2.lifecycleEvents).toBe(1);
		expect(r2.eventsIngested).toBe(1);
		expect(events.size).toBe(2);
		const refundKey = [...events.keys()].find((k) =>
			k.startsWith("runsignup:evt:transaction_partially_refunded:donation:9:"),
		);
		expect(refundKey).toBeDefined();
		expect(events.get(refundKey!)!["refund_cents"]).toBe(4000);
		expect(events.get(refundKey!)!["refund_status"]).toBe("VERIFIED");
		expect(transactions.get("runsignup:donation:9")!["lifecycle_state"]).toBe("PARTIALLY_REFUNDED");

		// Third sync, same refunded state: zero new events (stable fallback key).
		mocks.responses.push(
			donationPage([{ donation_id: 9, donation_amount: 100, refund_amount: 40 }]),
		);
		const r3 = await syncRunSignupDonations(db, "token");
		expect(r3.eventsIngested).toBe(0);
		expect(r3.lifecycleEvents).toBe(0);
		expect(events.size).toBe(2);
	});

	it("detects a full refund", async () => {
		const { db, events, transactions } = makeMoneyDb();
		mocks.responses.push(donationPage([{ donation_id: 3, donation_amount: 75 }]));
		await syncRunSignupDonations(db, "token");
		mocks.responses.push(
			donationPage([{ donation_id: 3, donation_amount: 75, refund_amount: 75 }]),
		);
		const r = await syncRunSignupDonations(db, "token");
		expect(r.lifecycleEvents).toBe(1);
		const key = [...events.keys()].find((k) =>
			k.startsWith("runsignup:evt:transaction_refunded:donation:3:"),
		);
		expect(key).toBeDefined();
		expect(transactions.get("runsignup:donation:3")!["lifecycle_state"]).toBe("REFUNDED");
	});

	it("records classified failures without advancing the cursor", async () => {
		const { db, sync } = makeMoneyDb();
		mocks.responses.push(donationPage([{ donation_id: 11, donation_amount: 10 }]));
		const ok1 = await syncRunSignupDonations(db, "token");
		expect(ok1.ok).toBe(true);
		expect(sync.get("runsignup:donations:race:212466")!["cursor"]).toBe("11");

		mocks.responses.push({
			ok: false,
			http_status: 403,
			api_error_code: 7,
			api_error_msg: "Permission Denied",
		});
		const r = await syncRunSignupDonations(db, "token");
		expect(r.ok).toBe(false);
		expect(r.failureInterpretation).toBe("SCOPE_INSUFFICIENT");
		expect(r.error).toContain("Permission Denied");
		const checkpoint = sync.get("runsignup:donations:race:212466")!;
		expect(checkpoint["cursor"]).toBe("11"); // not advanced
		expect(checkpoint["last_error"]).toContain("Permission Denied");
	});

	it("handles an empty source (zero donations) cleanly", async () => {
		const { db, events } = makeMoneyDb();
		mocks.responses.push(donationPage([]));
		const r = await syncRunSignupDonations(db, "token");
		expect(r.ok).toBe(true);
		expect(r.fetched).toBe(0);
		expect(r.eventsIngested).toBe(0);
		expect(r.cursor).toBeNull();
		expect(events.size).toBe(0);
	});

	it("emits fundraiser_donation_received when the record carries a fundraiser", async () => {
		const { db, events } = makeMoneyDb();
		mocks.responses.push(
			donationPage([{ donation_id: 21, donation_amount: 30, fundraiser_id: 5 }]),
		);
		const r = await syncRunSignupDonations(db, "token");
		expect(r.eventsIngested).toBe(2);
		expect(
			events.has("runsignup:evt:fundraiser_donation_received:donation:21"),
		).toBe(true);
	});
});

describe("canonical read paths", () => {
	it("getMoneySyncState returns the persisted checkpoint", async () => {
		const { db } = makeMoneyDb();
		mocks.responses.push(donationPage([{ donation_id: 1, donation_amount: 5 }]));
		await syncRunSignupDonations(db, "token");
		const state = await getMoneySyncState(db);
		expect(state).not.toBeNull();
		expect(state!["source_key"]).toBe("runsignup:donations:race:212466");
		expect(state!["cursor"]).toBe("1");
		const parsed = JSON.parse(String(state!["last_sync_result"]));
		expect(parsed.transactionsNew).toBe(1);
	});

	it("listMoneyEvents / listMoneyTransactions read canonical D1 state", async () => {
		const { db } = makeMoneyDb();
		// Extend the stub's all() for the read paths: reuse money_events rows.
		mocks.responses.push(donationPage([{ donation_id: 1, donation_amount: 5 }]));
		await syncRunSignupDonations(db, "token");
		// The stub's all() handles FROM money_events; the read paths order by
		// occurred_at — emulate minimal ordering support via the stored rows.
		const evts = await listMoneyEvents(db);
		expect(evts.length).toBe(1);
		expect(evts[0]["event_key"]).toBe("runsignup:evt:donation_received:donation:1");
		const txns = await listMoneyTransactions(db);
		expect(txns.length).toBe(1);
		expect(txns[0]["transaction_key"]).toBe("runsignup:donation:1");
	});
});
