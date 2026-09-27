// Ahotu lane tests: submission package building, eligibility, the
// auto-enqueue rule, queue lifecycle, and the manual last mile text.
//
// Verified facts encoded (live 2026-09-27):
// - no API, no bulk import -> the machine prepares; a person submits
// - edition date + at least one race/distance REQUIRED for listing
// - challenges NOT supported (no challenge format on Ahotu)
// - organiser account required, free, created by the owner

import { describe, expect, it } from "vitest";
import {
	AHOTU_ELIGIBLE_KINDS,
	AHOTU_MANUAL_LAST_MILE,
	AHOTU_ORGANISER_REGISTRATION_URL,
	AHOTU_SPORT_CATEGORY,
	buildAhotuPackage,
	describeAhotuGaps,
	enqueueAhotuForObject,
	getAhotuQueue,
	getAhotuQueueRow,
	isAhotuEligibleKind,
	markAhotuDuplicate,
	markAhotuListed,
	markAhotuSubmitted,
	type AhotuQueueRow,
	type AhotuRaceInput,
} from "../src/ahotu";

// Minimal stateful D1 stub keyed on the ahotu_queue statements.

function makeAhotuDb() {
	const queue: AhotuQueueRow[] = [];
	const now = () => new Date().toISOString();
	const norm = (rawSql: string) => rawSql.replace(/\s+/g, " ").trim();
	const db = {
		prepare(rawSql: string) {
			const sql = norm(rawSql);
			let args: unknown[] = [];
			const stmt = {
				bind(...params: unknown[]) {
					args = params;
					return stmt;
				},
				async first<T>() {
					if (sql.startsWith("SELECT id, object_id, kind, status, package_json,")) {
						const row = queue.find((q) => q.id === args[0]);
						return (row ?? null) as T | null;
					}
					throw new Error(`unexpected first(): ${sql}`);
				},
				async all<T>() {
					if (sql.startsWith("SELECT id, object_id, kind, status, package_json,")) {
						return { results: [...queue] } as { results: T[] };
					}
					throw new Error(`unexpected all(): ${sql}`);
				},
				async run() {
					if (sql.startsWith("INSERT INTO ahotu_queue")) {
						// ON CONFLICT(object_id) DO NOTHING.
						if (!queue.some((q) => q.object_id === args[0])) {
							queue.push({
								id: queue.length + 1,
								object_id: args[0] as string,
								kind: args[1] as AhotuQueueRow["kind"],
								status: "queued",
								package_json: args[2] as string,
								created_at: now(),
								updated_at: now(),
								submitted_at: null,
								ahotu_url: null,
								notes: args[3] as string,
							});
						}
						return { success: true };
					}
					if (sql.startsWith("UPDATE ahotu_queue SET status = 'submitted'")) {
						const row = queue.find((q) => q.id === args[1]);
						if (row) {
							row.status = "submitted";
							row.submitted_at = now();
							if (args[0] != null) row.ahotu_url = args[0] as string;
							row.updated_at = now();
						}
						return { success: true };
					}
					if (sql.startsWith("UPDATE ahotu_queue SET status = 'listed'")) {
						const row = queue.find((q) => q.id === args[1]);
						if (row) {
							row.status = "listed";
							row.ahotu_url = args[0] as string;
							row.updated_at = now();
						}
						return { success: true };
					}
					if (sql.startsWith("UPDATE ahotu_queue SET status = 'duplicate_found'")) {
						const row = queue.find((q) => q.id === args[1]);
						if (row) {
							row.status = "duplicate_found";
							row.ahotu_url = args[0] as string;
							row.updated_at = now();
						}
						return { success: true };
					}
					throw new Error(`unexpected run(): ${sql}`);
				},
			};
			return stmt;
		},
	};
	return { db: db as unknown as D1Database, queue };
}

const fullInput = (): AhotuRaceInput => ({
	name: "NWANA Florida Open 10K",
	editionDate: "2027-03-14",
	city: "Orlando",
	country: "USA",
	distances: ["10K", "5K"],
	websiteUrl: "https://nwaofna.org/races/florida-open",
	contactName: "Albert Fatikhov",
	contactEmail: "president@nwaofna.org",
	description: "NWANA competition event",
});

describe("buildAhotuPackage", () => {
	it("produces a complete package with edition date, distances, and the Nordic walking category", () => {
		const pkg = buildAhotuPackage(fullInput());
		expect(pkg.sport_category).toBe("Nordic walking");
		expect(pkg.sport_category).toBe(AHOTU_SPORT_CATEGORY);
		expect(pkg.edition_date).toBe("2027-03-14");
		expect(pkg.distances).toEqual(["10K", "5K"]);
		expect(pkg.event_name).toBe("NWANA Florida Open 10K");
		expect(pkg.manual_last_mile).toContain(AHOTU_ORGANISER_REGISTRATION_URL);
	});

	it("throws when the edition date is missing", () => {
		expect(() => buildAhotuPackage({ ...fullInput(), editionDate: null })).toThrow(
			/edition date/i,
		);
	});

	it("throws when no race/distance is given", () => {
		expect(() => buildAhotuPackage({ ...fullInput(), distances: [] })).toThrow(/distance/i);
		expect(() => buildAhotuPackage({ ...fullInput(), distances: ["  "] })).toThrow(
			/distance/i,
		);
	});
});

describe("describeAhotuGaps", () => {
	it("lists the required fields first", () => {
		const gaps = describeAhotuGaps({ ...fullInput(), editionDate: null, distances: [] });
		expect(gaps[0]).toMatch(/edition date/i);
		expect(gaps[1]).toMatch(/distance/i);
	});

	it("is empty for a complete package", () => {
		expect(describeAhotuGaps(fullInput())).toEqual([]);
	});
});

describe("eligibility", () => {
	it("race, series, championship are eligible; everything else is not", () => {
		expect(AHOTU_ELIGIBLE_KINDS).toEqual(["race", "series", "championship"]);
		expect(isAhotuEligibleKind("race")).toBe(true);
		expect(isAhotuEligibleKind("series")).toBe(true);
		expect(isAhotuEligibleKind("championship")).toBe(true);
		// Challenges excluded: Ahotu requires an edition date + race/distance
		// (verified 2026-09-27, no challenge format).
		expect(isAhotuEligibleKind("challenge")).toBe(false);
		expect(isAhotuEligibleKind("fundraising")).toBe(false);
		expect(isAhotuEligibleKind("website")).toBe(false);
	});
});

describe("enqueueAhotuForObject", () => {
	it("enqueues each eligible kind with status 'queued'", async () => {
		const { db } = makeAhotuDb();
		for (const kind of ["race", "series", "championship"] as const) {
			const res = await enqueueAhotuForObject(db, `OBJ-${kind}`, kind, fullInput());
			expect(res.enqueued).toBe(true);
		}
		const queue = await getAhotuQueue(db);
		expect(queue).toHaveLength(3);
		expect(queue.every((q) => q.status === "queued")).toBe(true);
		expect(queue.map((q) => q.kind).sort()).toEqual(["championship", "race", "series"]);
	});

	it("double enqueue of the same object keeps a single row (idempotent)", async () => {
		const { db, queue } = makeAhotuDb();
		await enqueueAhotuForObject(db, "RUNSIGNUP-RACE-1", "race", fullInput());
		await enqueueAhotuForObject(db, "RUNSIGNUP-RACE-1", "race", fullInput());
		expect(queue).toHaveLength(1);
	});

	it("does not enqueue a challenge", async () => {
		const { db, queue } = makeAhotuDb();
		const res = await enqueueAhotuForObject(db, "OBJ-CHAL", "challenge", fullInput());
		expect(res.enqueued).toBe(false);
		expect(res.reason).toBe("ineligible_kind");
		expect(queue).toHaveLength(0);
	});

	it("still queues a row with gaps noted when the package is incomplete", async () => {
		const { db, queue } = makeAhotuDb();
		const res = await enqueueAhotuForObject(db, "RUNSIGNUP-RACE-2", "race", {
			...fullInput(),
			editionDate: null,
			distances: [],
		});
		expect(res.enqueued).toBe(true);
		expect(res.reason).toBe("queued_with_gaps");
		expect(queue).toHaveLength(1);
		const stored = JSON.parse(queue[0].package_json as string);
		expect(stored.partial).toBe(true);
		expect(queue[0].notes).toMatch(/edition date/i);
	});
});

describe("queue lifecycle", () => {
	it("submitted -> listed -> duplicate_found transitions update the row", async () => {
		const { db } = makeAhotuDb();
		await enqueueAhotuForObject(db, "RUNSIGNUP-RACE-3", "race", fullInput());
		const [row] = await getAhotuQueue(db);
		expect(row.status).toBe("queued");

		await markAhotuSubmitted(db, row.id, "https://www.ahotu.com/event/pending");
		const submitted = await getAhotuQueueRow(db, row.id);
		expect(submitted?.status).toBe("submitted");
		expect(submitted?.submitted_at).toBeTruthy();
		expect(submitted?.ahotu_url).toBe("https://www.ahotu.com/event/pending");

		await markAhotuListed(db, row.id, "https://www.ahotu.com/event/nwana-florida-open");
		const listed = await getAhotuQueueRow(db, row.id);
		expect(listed?.status).toBe("listed");
		expect(listed?.ahotu_url).toBe("https://www.ahotu.com/event/nwana-florida-open");
	});

	it("duplicate_found records the existing Ahotu URL", async () => {
		const { db } = makeAhotuDb();
		await enqueueAhotuForObject(db, "RUNSIGNUP-RACE-4", "series", fullInput());
		const [row] = await getAhotuQueue(db);
		await markAhotuDuplicate(db, row.id, "https://www.ahotu.com/event/existing");
		const dup = await getAhotuQueueRow(db, row.id);
		expect(dup?.status).toBe("duplicate_found");
		expect(dup?.ahotu_url).toBe("https://www.ahotu.com/event/existing");
	});
});

describe("manual last mile", () => {
	it("contains the organiser registration URL (owner-created account step)", () => {
		expect(AHOTU_MANUAL_LAST_MILE).toContain(AHOTU_ORGANISER_REGISTRATION_URL);
		expect(AHOTU_MANUAL_LAST_MILE).toContain("My events");
		expect(AHOTU_MANUAL_LAST_MILE).toContain("Add event");
		expect(AHOTU_MANUAL_LAST_MILE).toMatch(/edition date/i);
		expect(AHOTU_MANUAL_LAST_MILE).toMatch(/duplicate/i);
	});
});
