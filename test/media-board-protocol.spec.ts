import { describe, expect, it, vi } from "vitest";

// Minimal D1 stub for media plan and board protocol tests.
// Tables are keyed on exact SQL prefixes; every row is created by an
// explicit call in the test. No invented data.

function makeDb() {
	const mediaPlans: Record<string, unknown>[] = [];
	const mediaArticles: Record<string, unknown>[] = [];
	const boardMeetings: Record<string, unknown>[] = [];
	const boardSubmissions: Record<string, unknown>[] = [];
	const boardUploads: Record<string, unknown>[] = [];
	const auditEvents: Record<string, unknown>[] = [];
	const decisionRequests: Record<string, unknown>[] = [];

	const find = (rows: Record<string, unknown>[], key: string, value: unknown) =>
		rows.find((r) => r[key] === value);

	const db = {
		_tables: { mediaPlans, mediaArticles, boardMeetings, boardSubmissions, boardUploads, auditEvents, decisionRequests },
		prepare(sql: string) {
			let args: unknown[] = [];
			const api = {
				bind(...params: unknown[]) {
					args = params;
					return api;
				},
				async first<T>() {
					if (sql.startsWith("SELECT status FROM media_plans WHERE plan_id = ?")) {
						const p = find(mediaPlans, "plan_id", args[0]);
						return (p ? { status: p.status } : null) as T;
					}
					if (sql.startsWith("SELECT status FROM media_articles WHERE article_id = ?")) {
						const a = find(mediaArticles, "article_id", args[0]);
						return (a ? { status: a.status } : null) as T;
					}
					if (sql.startsWith("SELECT article_id, plan_id, title, angle, status, body_html FROM media_articles")) {
						const a = find(mediaArticles, "article_id", args[0]);
						return (a ? { article_id: a.article_id, plan_id: a.plan_id, title: a.title, angle: a.angle, status: a.status, body_html: a.body_html } : null) as T;
					}
					if (sql.startsWith("SELECT meeting_id, protocol_formed_at FROM board_meetings")) {
						const m = boardMeetings.find(
							(x) => String(x.scheduled_for).substring(0, 10) === String(args[0])
						);
						return (m ? { meeting_id: m.meeting_id, protocol_formed_at: m.protocol_formed_at } : null) as T;
					}
					if (sql.startsWith("SELECT meeting_id, title, status FROM board_meetings")) {
						const m = boardMeetings.find(
							(x) => String(x.scheduled_for).substring(0, 10) === String(args[0]) && (x.status === "DRAFT" || x.status === "OPEN")
						);
						return (m ? { meeting_id: m.meeting_id, title: m.title, status: m.status } : null) as T;
					}
					return null as T;
				},
				async all<T>() {
					if (sql.includes("FROM media_plans p")) {
						return { results: mediaPlans.map((p) => ({ ...p, article_count: 0, published_count: 0, ready_count: 0 })) } as T;
					}
					if (sql.startsWith("SELECT * FROM media_articles WHERE plan_id = ?")) {
						return { results: mediaArticles.filter((a) => a.plan_id === args[0]) } as T;
					}
					if (sql.startsWith("SELECT distribution_id, channel, outlet_name, sent_at, notes, created_at")) {
						const tbl = (db as unknown as { _tables: Record<string, Record<string, unknown>[]> })._tables;
						const dists = tbl.mediaDistributions ?? [];
						return { results: dists.filter((d) => d.article_id === args[0]) } as T;
					}
					if (sql.startsWith("SELECT submission_id FROM board_submissions WHERE status = 'PENDING'")) {
						return { results: boardSubmissions.filter((s) => s.status === "PENDING").map((s) => ({ submission_id: s.submission_id })) } as T;
					}
					if (sql.includes("FROM audit_events")) {
						return { results: auditEvents } as T;
					}
					if (sql.includes("FROM decision_requests")) {
						return { results: decisionRequests } as T;
					}
					if (sql.includes("FROM board_uploads")) {
						return { results: boardUploads } as T;
					}
					return { results: [] } as T;
				},
				async run() {
					if (sql.startsWith("INSERT INTO media_plans")) {
						mediaPlans.push({ plan_id: args[0], title: args[1], period: args[2], notes: args[3], status: "DRAFT", created_at: "2026-09-22T00:00:00Z" });
					} else if (sql.startsWith("INSERT INTO media_articles")) {
						mediaArticles.push({ article_id: args[0], plan_id: args[1], title: args[2], angle: args[3], status: "DRAFT" });
					} else if (sql.startsWith("INSERT INTO media_distributions")) {
						const tbl = (db as unknown as { _tables: Record<string, Record<string, unknown>[]> })._tables;
						if (!tbl.mediaDistributions) tbl.mediaDistributions = [];
						tbl.mediaDistributions.push({ distribution_id: args[0], article_id: args[1], channel: args[2], outlet_name: args[3], sent_at: args[4], notes: args[5] });
					} else if (sql.startsWith("INSERT INTO board_meetings")) {
						boardMeetings.push({ meeting_id: args[0], scheduled_for: args[2], status: "DRAFT", protocol_formed_at: null });
					} else if (sql.startsWith("INSERT INTO audit_events")) {
						auditEvents.push({ action: args[1], module: args[2], details: args[3], created_at: "2026-09-22T00:00:00Z" });
					} else if (sql.startsWith("UPDATE media_plans SET status = 'APPROVED'")) {
						const p = find(mediaPlans, "plan_id", args[0]);
						if (p) p.status = "APPROVED";
					} else if (sql.startsWith("UPDATE media_articles SET body_html")) {
						const a = find(mediaArticles, "article_id", args[2]);
						if (a) { a.body_html = args[0]; a.status = "READY"; }
					} else if (sql.startsWith("UPDATE media_articles SET status = 'APPROVED'")) {
						const a = find(mediaArticles, "article_id", args[1]);
						if (a) a.status = "APPROVED";
					} else if (sql.startsWith("UPDATE media_articles SET status = 'PUBLISHED'")) {
						const a = find(mediaArticles, "article_id", args[3]);
						if (a) a.status = "PUBLISHED";
					} else if (sql.startsWith("UPDATE board_submissions SET meeting_id")) {
						let count = 0;
						for (const s of boardSubmissions) {
							if (s.status === "PENDING") { s.status = "AGENDA"; s.meeting_id = args[0]; count++; }
						}
						return { success: true, meta: { changes: count } };
					} else if (sql.startsWith("UPDATE board_meetings SET protocol_formed_at")) {
						const m = find(boardMeetings, "meeting_id", args[2]);
						if (m) m.protocol_formed_at = args[0];
					}
					return { success: true };
				},
			};
			return api;
		},
	};
	return db as unknown as D1Database & { _tables: Record<string, Record<string, unknown>[]> };
}

describe("media plan lifecycle", () => {
	it("creates a plan, adds an article, saves body_html, approves, and publishes", async () => {
		const { createMediaPlan, addMediaArticle, saveArticleBody, approveArticle, publishArticle } =
			await import("../src/media-plan");
		const db = makeDb();

		// Create plan
		const createReq = new Request("http://x/api/operating-center/media/plans", {
			method: "POST",
			body: JSON.stringify({ title: "Owner topics", period: "Q1" }),
		});
		const createRes = await createMediaPlan(createReq, db);
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { plan_id: string };
		expect(created.plan_id).toMatch(/^MEDIAPLAN-/);

		// Add article
		const addReq = new Request(`http://x/api/operating-center/media/plans/${created.plan_id}/articles`, {
			method: "POST",
			body: JSON.stringify({ title: "Test article", angle: "Test angle" }),
		});
		const addRes = await addMediaArticle(addReq, db, created.plan_id);
		expect(addRes.status).toBe(201);
		const added = (await addRes.json()) as { article_id: string };

		// Save body (DRAFT -> READY, body_html stored)
		const bodyReq = new Request(`http://x/api/operating-center/media/articles/${added.article_id}/body`, {
			method: "POST",
			body: JSON.stringify({ body_html: "<p>Test body</p>" }),
		});
		const bodyRes = await saveArticleBody(bodyReq, db, added.article_id);
		expect(bodyRes.status).toBe(200);
		const tables = (db as unknown as { _tables: Record<string, Record<string, unknown>[]> })._tables;
		const article = tables.mediaArticles.find((a) => a.article_id === added.article_id);
		expect(article?.body_html).toBe("<p>Test body</p>");
		expect(article?.status).toBe("READY");

		// Approve and publish
		const approveRes = await approveArticle(db, added.article_id);
		expect(approveRes.status).toBe(200);
		const publishRes = await publishArticle(db, added.article_id);
		expect(publishRes.status).toBe(200);
		expect(article?.status).toBe("PUBLISHED");
	});

	it("distributes a PUBLISHED article via a separate owner-confirmed action", async () => {
		const { createMediaPlan, addMediaArticle, saveArticleBody, approveArticle, publishArticle, distributeArticle, listArticleDistributions } =
			await import("../src/media-plan");
		const db = makeDb();
		const tables = (db as unknown as { _tables: Record<string, Record<string, unknown>[]> })._tables;
		tables.mediaDistributions = [];

		const planReq = new Request("http://x/api/operating-center/media/plans", {
			method: "POST",
			body: JSON.stringify({ title: "Distro plan" }),
		});
		const planRes = await createMediaPlan(planReq, db);
		const planBody = (await planRes.json()) as { plan_id: string };
		const artReq = new Request(`http://x/api/operating-center/media/plans/${planBody.plan_id}/articles`, {
			method: "POST",
			body: JSON.stringify({ title: "Distro article" }),
		});
		const artRes = await addMediaArticle(artReq, db, planBody.plan_id);
		const artBody = (await artRes.json()) as { article_id: string };
		const bodyReq = new Request(`http://x/api/operating-center/media/articles/${artBody.article_id}/body`, {
			method: "POST",
			body: JSON.stringify({ body_html: "<p>Body</p>" }),
		});
		await saveArticleBody(bodyReq, db, artBody.article_id);
		await approveArticle(db, artBody.article_id);
		await publishArticle(db, artBody.article_id);

		// Cannot distribute without a channel
		const badReq = new Request(`http://x/api/operating-center/media/articles/${artBody.article_id}/distribute`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		const badRes = await distributeArticle(badReq, db, artBody.article_id);
		expect(badRes.status).toBe(400);

		// Owner-confirmed distribution
		const distReq = new Request(`http://x/api/operating-center/media/articles/${artBody.article_id}/distribute`, {
			method: "POST",
			body: JSON.stringify({ channel: "PRESS_RELEASE", outlet_name: "Local News Wire", notes: "Sent by owner" }),
		});
		const distRes = await distributeArticle(distReq, db, artBody.article_id);
		expect(distRes.status).toBe(201);
		const distBody = (await distRes.json()) as { distribution_id: string; channel: string };
		expect(distBody.channel).toBe("PRESS_RELEASE");

		// List distributions
		const listRes = await listArticleDistributions(db, artBody.article_id);
		expect(listRes.status).toBe(200);
		const listBody = (await listRes.json()) as { distributions: unknown[] };
		expect(listBody.distributions.length).toBe(1);
	});

	it("rejects distribution of a non-PUBLISHED article", async () => {
		const { createMediaPlan, addMediaArticle, distributeArticle } = await import("../src/media-plan");
		const db = makeDb();
		const planReq = new Request("http://x/api/operating-center/media/plans", {
			method: "POST",
			body: JSON.stringify({ title: "P" }),
		});
		const planRes = await createMediaPlan(planReq, db);
		const planBody = (await planRes.json()) as { plan_id: string };
		const artReq = new Request(`http://x/api/operating-center/media/plans/${planBody.plan_id}/articles`, {
			method: "POST",
			body: JSON.stringify({ title: "A" }),
		});
		const artRes = await addMediaArticle(artReq, db, planBody.plan_id);
		const artBody = (await artRes.json()) as { article_id: string };
		const distReq = new Request(`http://x/api/operating-center/media/articles/${artBody.article_id}/distribute`, {
			method: "POST",
			body: JSON.stringify({ channel: "PRESS_RELEASE" }),
		});
		const distRes = await distributeArticle(distReq, db, artBody.article_id);
		expect(distRes.status).toBe(400);
	});

	it("rejects article creation for a nonexistent plan", async () => {
		const { addMediaArticle } = await import("../src/media-plan");
		const db = makeDb();
		const req = new Request("http://x/api/operating-center/media/plans/NOPE/articles", {
			method: "POST",
			body: JSON.stringify({ title: "X" }),
		});
		const res = await addMediaArticle(req, db, "NOPE");
		expect(res.status).toBe(404);
	});
});

describe("board protocol", () => {
	it("formWeeklyProtocol moves PENDING submissions to AGENDA and stamps the meeting", async () => {
		const { formWeeklyProtocol } = await import("../src/board-protocol");
		const db = makeDb();
		const tables = (db as unknown as { _tables: Record<string, Record<string, unknown>[]> })._tables;
		tables.boardSubmissions.push(
			{ submission_id: "S1", status: "PENDING", meeting_id: null },
			{ submission_id: "S2", status: "PENDING", meeting_id: null }
		);

		const res = await formWeeklyProtocol(db);
		const body = (await res.json()) as { ok: boolean; meeting_id: string; swept: number };
		expect(body.ok).toBe(true);
		expect(body.swept).toBe(2);

		const meeting = tables.boardMeetings.find((m) => m.meeting_id === body.meeting_id);
		expect(meeting?.protocol_formed_at).toBeTruthy();
		for (const s of tables.boardSubmissions) {
			expect(s.status).toBe("AGENDA");
			expect(s.meeting_id).toBe(body.meeting_id);
		}
	});

	it("reconcileProtocolIfDue is idempotent within the same week", async () => {
		const { reconcileProtocolIfDue } = await import("../src/board-protocol");
		const db = makeDb();
		// Sunday 2026-09-27 18:00 UTC = 2:00 PM EDT
		const first = await reconcileProtocolIfDue(db, new Date("2026-09-27T18:00:00Z"));
		const second = await reconcileProtocolIfDue(db, new Date("2026-09-27T19:00:00Z"));
		expect(first?.reconciled).toBe(true);
		expect(second).toBeNull();
		const tables = (db as unknown as { _tables: Record<string, Record<string, unknown>[]> })._tables;
		expect(tables.boardMeetings.length).toBe(1);
	});
});

describe("upload classification", () => {
	it("routes contact lists, task lists, meeting material, and media material", async () => {
		const { classifyUpload } = await import("../src/board-protocol");
		expect(classifyUpload("contacts.csv", "a@b.com, c@d.com\nJohn, j@x.org")).toBe("RUNSIGNUP_CONTACTS");
		expect(classifyUpload("tasks.md", "- [ ] Fix the bug\n- [ ] Write docs")).toBe("WORK_ITEM");
		expect(classifyUpload("proposal.txt", "Proposal for Sunday discussion: budget")).toBe("MEETING_AGENDA");
		expect(classifyUpload("press.md", "Press release draft: NWANA announces")).toBe("MEDIA_DRAFT");
		expect(classifyUpload("notes.txt", "random notes with no signal")).toBe("NEEDS_OWNER");
	});

	it("buildStagedCsv outputs name,email,phone header", async () => {
		const { buildStagedCsv } = await import("../src/board-protocol");
		const csv = buildStagedCsv("email,name\na@b.com,John Doe\nc@d.com,Jane Smith");
		expect(csv.startsWith("name,email,phone\n")).toBe(true);
		expect(csv).toContain("John Doe,a@b.com,");
		expect(csv).toContain("Jane Smith,c@d.com,");
	});
});

describe("activity feed", () => {
	it("builds the feed from audit events and flags items requiring reading", async () => {
		const { getActivityFeed } = await import("../src/operating-center");
		const db = makeDb();
		const tables = (db as unknown as { _tables: Record<string, Record<string, unknown>[]> })._tables;
		tables.auditEvents.push({
			action: "BOARD_SUBMISSION_CREATED",
			module: "board",
			details: JSON.stringify({ title: "Test submission" }),
			created_at: "2026-09-22T10:00:00Z",
		});
		tables.decisionRequests.push({
			request_id: "DR1",
			title: "Approve press draft",
			created_at: "2026-09-22T11:00:00Z",
		});

		const res = await getActivityFeed(db);
		const body = (await res.json()) as { ok: boolean; items: { label: string; requires_reading: boolean }[] };
		expect(body.ok).toBe(true);
		expect(body.items.length).toBeGreaterThan(0);
		const reading = body.items.filter((i) => i.requires_reading);
		expect(reading.length).toBe(1);
		expect(reading[0].label).toContain("Approve press draft");
		const event = body.items.find((i) => i.label.includes("Test submission"));
		expect(event).toBeTruthy();
		expect(event?.requires_reading).toBe(false);
	});
});
