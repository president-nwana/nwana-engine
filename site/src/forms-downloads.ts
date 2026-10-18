// Site forms + downloads library (added 2026-10-16).
// Fulfils the /forms page (the nine named forms, submissions stored in
// D1 site_form_submissions, migration 0096) and the /documents page
// (real downloadable files generated from the site's own canonical
// content and Engine D1 data). This module is the source mirror of the
// code patched into the live nwana-site bundle on 2026-10-16.

import { esc, layout } from "./views";
import { DISTANCES, levelThresholdLabels } from "./data";
import { aboutPage } from "./pages";
import {
	antiDopingPage,
	brandPage,
	chooseYourPathPage,
	codeOfConductPage,
	eventsPage,
	faqPage,
	governancePage,
	partnersPage,
	pressPage,
	privacyPage,
	safesportPage,
	safetyPage,
	sponsorsPage,
	supportPage,
	termsConditionsPage,
	termsPage,
} from "./pages-migration";
import { FAVICON_PNG_BASE64, LOGO_JPG_BASE64 } from "./assets-embedded";

// ---------- shared helpers ----------
export function sfNyDate(): string {
	try {
		return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" }).format(new Date());
	} catch {
		return new Date().toISOString().slice(0, 10);
	}
}
function sfHead(kicker: string, title: string, lead: string): string {
	return `<div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(lead)}</p></div></div>`;
}
function sfB64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

// ---------- PDF engine (text PDFs, WinAnsi, Helvetica) ----------
interface PdfBlock {
	h?: number;
	li?: number;
	t: string;
}
function dlPdfSanitize(s: string): string {
	return String(s)
		.replace(/[\u2018\u2019]/g, "\u2019")
		.replace(/\u2192/g, "->")
		.replace(/\u2610/g, "[ ]")
		.replace(/[\u2713\u2714]/g, "")
		.replace(/\u00A0/g, " ")
		.replace(/\u202F/g, " ");
}
function dlPdfByte(ch: string): number {
	const c = ch.codePointAt(0) as number;
	if (c < 128) return c;
	const map: Record<number, number> = { 0x2019: 0x92, 0x2018: 0x91, 0x201C: 0x93, 0x201D: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x2022: 0x95, 0x2026: 0x85, 0x20AC: 0x80, 0x2122: 0x99 };
	if (map[c] !== undefined) return map[c];
	if (c >= 0xA0 && c <= 0xFF) return c;
	return 0x3F;
}
function dlPdfEnc(s: string): number[] {
	const out: number[] = [];
	for (const ch of String(s)) out.push(dlPdfByte(ch));
	return out;
}
function dlCharW(ch: string): number {
	if (ch === " ") return 0.278;
	if ("ilj.,:;'!|".indexOf(ch) >= 0) return 0.278;
	if ("ft()[]-/".indexOf(ch) >= 0) return 0.333;
	if (ch >= "0" && ch <= "9") return 0.556;
	if (ch === "m") return 0.833;
	if (ch === "w") return 0.722;
	if (ch === "M") return 0.889;
	if (ch === "W") return 0.944;
	if (ch >= "A" && ch <= "Z") return 0.667;
	if (ch === "%") return 0.889;
	if (ch === "&") return 0.667;
	if (ch === "$") return 0.556;
	if (ch === '"') return 0.355;
	return 0.5;
}
function dlTextW(s: string, size: number): number {
	let w = 0;
	for (const ch of String(s)) w += dlCharW(ch);
	return w * size;
}
function dlWrap(text: string, size: number, maxW: number): string[] {
	const words = String(text).split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let cur = "";
	for (const w of words) {
		const t = cur ? cur + " " + w : w;
		if (dlTextW(t, size) <= maxW || !cur) cur = t;
		else { lines.push(cur); cur = w; }
	}
	if (cur) lines.push(cur);
	return lines.length ? lines : [""];
}
function dlMakePdf(title: string, subtitle: string, blocks: PdfBlock[]): Uint8Array {
	const PW = 612, PH = 792, ML = 54, MR = 54, MT = 58, MB = 56, CW = PW - ML - MR;
	const pages: string[][] = [];
	let ops: string[] = [];
	let y = PH - MT;
	const clean = (s: string) => dlPdfSanitize(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
	function line(txt: string, x: number, yy: number, font: string, size: number, gray?: string) {
		ops.push("BT /" + font + " " + size + " Tf " + (gray !== undefined ? gray + " g " : "") + "1 0 0 1 " + x + " " + yy.toFixed(1) + " Tm (" + clean(txt) + ") Tj ET");
	}
	function newPage() { pages.push(ops); ops = []; y = PH - MT; }
	function need(h: number) { if (y - h < MB) newPage(); }
	line(title, ML, y, "F2", 16); y -= 9;
	ops.push("0.79 0.64 0.15 RG 1.6 w " + ML + " " + y.toFixed(1) + " m " + (PW - MR) + " " + y.toFixed(1) + " l S");
	y -= 17;
	if (subtitle) {
		for (const ln of dlWrap(subtitle, 9, CW)) { line(ln, ML, y, "F1", 9, "0.35"); y -= 12; }
		y -= 7;
	}
	for (const b of blocks || []) {
		if (!b || b.t === undefined || b.t === null) continue;
		const text = String(b.t).replace(/\s+/g, " ").trim();
		if (!text) continue;
		if (b.h) {
			const size = b.h === 1 ? 13 : 12;
			need(32); y -= 9;
			for (const ln of dlWrap(text, size, CW)) { need(17); line(ln, ML, y, "F2", size); y -= 15.5; }
			y -= 4;
		} else if (b.li) {
			const ls = dlWrap(text, 10.5, CW - 14);
			ls.forEach((ln, i) => { need(14.5); line(i === 0 ? "\u2022 " + ln : "    " + ln, ML + 2, y, "F1", 10.5); y -= 14.5; });
		} else {
			for (const ln of dlWrap(text, 10.5, CW)) { need(14.5); line(ln, ML, y, "F1", 10.5); y -= 14.5; }
			y -= 5;
		}
	}
	newPage();
	const total = pages.length;
	pages.forEach((pops, i) => {
		pops.push("BT /F1 8 Tf 0.45 g 1 0 0 1 54 30 Tm (" + clean("Nordic Walking Association of North America (NWANA) \u00B7 nwaofna.org") + ") Tj ET");
		const pg = "Page " + (i + 1) + " of " + total;
		pops.push("BT /F1 8 Tf 0.45 g 1 0 0 1 " + (PW - MR - dlTextW(pg, 8)).toFixed(1) + " 30 Tm (" + clean(pg) + ") Tj ET");
	});
	const fontF1 = 3 + total * 2, fontF2 = fontF1 + 1;
	const chunks: number[][] = [];
	let len = 0;
	const offsets: number[] = [0];
	function push(bytes: number[]) { chunks.push(bytes); len += bytes.length; }
	function pushStr(s: string) { push(dlPdfEnc(s)); }
	function beginObj(id: number) { offsets[id] = len; pushStr(id + " 0 obj\n"); }
	pushStr("%PDF-1.4\n");
	beginObj(1); pushStr("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
	const kids = pages.map((_, i) => (3 + i * 2) + " 0 R").join(" ");
	beginObj(2); pushStr("<< /Type /Pages /Kids [" + kids + "] /Count " + total + " >>\nendobj\n");
	pages.forEach((pops, i) => {
		const pid = 3 + i * 2, cid = pid + 1;
		beginObj(pid);
		pushStr("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 " + fontF1 + " 0 R /F2 " + fontF2 + " 0 R >> >> /Contents " + cid + " 0 R >>\nendobj\n");
		const stream = pops.join("\n");
		beginObj(cid);
		pushStr("<< /Length " + dlPdfEnc(stream).length + " >>\nstream\n");
		pushStr(stream);
		pushStr("\nendstream\nendobj\n");
	});
	beginObj(fontF1); pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");
	beginObj(fontF2); pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n");
	const xrefPos = len;
	const nObj = fontF2 + 1;
	let xref = "xref\n0 " + nObj + "\n0000000000 65535 f \n";
	for (let i = 1; i < nObj; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
	pushStr(xref);
	pushStr("trailer\n<< /Size " + nObj + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF");
	let totalLen = 0;
	for (const c of chunks) totalLen += c.length;
	const out = new Uint8Array(totalLen);
	let pos = 0;
	for (const c of chunks) { out.set(c, pos); pos += c.length; }
	return out;
}

// ---------- HTML -> text blocks (for page-derived PDFs) ----------
function dlDecodeEntities(s: string): string {
	return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e: string) => {
		if (e.charAt(0) === "#") {
			const n = (e.charAt(1) === "x" || e.charAt(1) === "X") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			try { return String.fromCodePoint(n); } catch { return m; }
		}
		const map: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201D", ldquo: "\u201C", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", copy: "\u00A9" };
		return map[e] !== undefined ? map[e] : m;
	});
}
export function dlHtmlToBlocks(htmlStr: string, opts?: { stopAtContact?: boolean }): PdfBlock[] {
	let s = String(htmlStr);
	const fh = s.indexOf('<div class="page-head">');
	if (fh >= 0) s = s.slice(fh);
	const ff = s.indexOf("<footer");
	if (ff >= 0) s = s.slice(0, ff);
	if (opts && opts.stopAtContact) {
		const ci = s.indexOf("<h3>Contact NWANA</h3>");
		if (ci >= 0) {
			const ds = s.lastIndexOf("<div", ci);
			s = s.slice(0, ds > 0 ? ds : ci);
		}
	}
	s = s.replace(/<img[^>]*>/g, " ");
	s = s.replace(/<summary[^>]*>([\s\S]*?)<\/summary>/g, "\n@@H2@@$1\n");
	s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, "\n@@H1@@$1\n");
	s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, "\n@@H2@@$1\n");
	s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, "\n@@H2@@$1\n");
	s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/g, "\n@@H2@@$1\n");
	s = s.replace(/<li[^>]*>/g, "\n@@LI@@");
	s = s.replace(/<br\s*\/?>/g, "\n");
	s = s.replace(/<\/(p|div|section|details|tr|ul|ol)>/g, "\n");
	s = s.replace(/<[^>]+>/g, "");
	s = dlDecodeEntities(s);
	const blocks: PdfBlock[] = [];
	for (const raw of s.split("\n")) {
		const t = raw.replace(/\s+/g, " ").trim();
		if (!t) continue;
		if (t.indexOf("@@H1@@") === 0) blocks.push({ h: 1, t: t.slice(6).trim() });
		else if (t.indexOf("@@H2@@") === 0) blocks.push({ h: 2, t: t.slice(6).trim() });
		else if (t.indexOf("@@LI@@") === 0) { const tx = t.slice(6).trim(); if (tx) blocks.push({ li: 1, t: tx }); }
		else blocks.push({ t });
	}
	if (blocks.length > 1 && !blocks[0].h && blocks[1].h === 1 && blocks[0].t.toLowerCase() === blocks[1].t.toLowerCase()) blocks.shift();
	return blocks;
}

// ---------- D1-backed report builders ----------
async function dlRows(db: D1Database, sql: string, params: unknown[] = []): Promise<Record<string, any>[]> {
	const r = await db.prepare(sql).bind(...params).all<Record<string, any>>();
	return (r && r.results) || [];
}
function dlParseResults(json: string | null): any[] {
	if (!json) return [];
	try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; }
}
async function dlSeasonData(db: D1Database) {
	const events = await dlRows(db, "SELECT series, distance, event_name, event_date, result_count, results_json FROM race_event_results WHERE finalized = 1 ORDER BY event_date ASC");
	let finishes = 0;
	const athletes = new Set<string>();
	for (const e of events) {
		for (const r of dlParseResults(e.results_json)) {
			finishes += 1;
			if (r.athlete) athletes.add(String(r.athlete).toLowerCase());
		}
	}
	return { events, finishes, athletes: athletes.size };
}
function dlReportHead(kind: string): PdfBlock[] {
	return [
		{ t: "Nordic Walking Association of North America (NWANA). This report was generated on " + sfNyDate() + " from NWANA's own records in the NWANA Engine. It is a dated snapshot: figures describe the records held on the generation date and may change as records are updated." },
		{ h: 2, t: kind },
	];
}
async function dlBuildEventParticipation(db: D1Database): Promise<PdfBlock[]> {
	const d = await dlSeasonData(db);
	const blocks = dlReportHead("Event participation detail");
	blocks.push({ t: "Finalized NWANA competition events to date: " + d.events.length + ". Recorded finishes: " + d.finishes + ". Individual athletes with at least one recorded finish: " + d.athletes + "." });
	for (const e of d.events) {
		const n = dlParseResults(e.results_json).length;
		blocks.push({ li: 1, t: (e.event_name || "NWANA event") + " \u00B7 " + (e.event_date || "") + " \u00B7 " + (e.distance || "") + " \u00B7 " + n + " recorded finishes" });
	}
	return blocks;
}
async function dlBuildProgramImpact(db: D1Database): Promise<PdfBlock[]> {
	const d = await dlSeasonData(db);
	const acad = await dlRows(db, "SELECT COUNT(DISTINCT user_id) AS users, COUNT(DISTINCT CASE WHEN certified = 1 THEN user_id END) AS certified FROM academy_instructor_snapshot");
	const fr = await dlRows(db, "SELECT COUNT(*) AS n FROM challenge_fundraisers");
	const reg = await dlRows(db, "SELECT COUNT(*) AS n FROM challenge_registrations");
	const a = acad[0] || { users: 0, certified: 0 };
	const blocks = dlReportHead("Program impact summary");
	blocks.push({ h: 2, t: "Competition program" });
	blocks.push({ t: "Finalized competition events: " + d.events.length + ". Recorded finishes: " + d.finishes + ". Individual athletes with recorded finishes: " + d.athletes + "." });
	blocks.push({ h: 2, t: "Instructor education (NWANA Academy)" });
	blocks.push({ t: "Learners recorded in Academy instructor courses: " + a.users + ". Certified instructors recorded: " + a.certified + ". Figures are aggregate totals from Academy records; individual names are never published." });
	blocks.push({ h: 2, t: "Charity Challenge" });
	blocks.push({ t: "Fundraisers created: " + ((fr[0] || {}).n || 0) + ". Challenge registrations recorded: " + ((reg[0] || {}).n || 0) + "." });
	return blocks;
}
async function dlBuildSeasonSummary(db: D1Database): Promise<PdfBlock[]> {
	const d = await dlSeasonData(db);
	const blocks = dlReportHead("2026 season summary (year to date)");
	blocks.push({ t: "This is a year-to-date activity summary for the 2026 season, generated from NWANA's competition, education, and program records. It is not a financial statement." });
	blocks.push({ h: 2, t: "Competitions" });
	blocks.push({ t: "Finalized events so far: " + d.events.length + ", with " + d.finishes + " recorded finishes by " + d.athletes + " individual athletes." });
	const byDist: Record<string, number> = {};
	for (const e of d.events) byDist[e.distance] = (byDist[e.distance] || 0) + 1;
	blocks.push({ t: "Events by distance: " + Object.keys(byDist).sort().map((k) => k + ": " + byDist[k]).join("; ") + "." });
	const news = await dlRows(db, "SELECT COUNT(*) AS n FROM news_articles WHERE status = 'published' AND (audience = 'nwana' OR audience = 'both')");
	blocks.push({ h: 2, t: "Public communications" });
	blocks.push({ t: "News articles published on nwaofna.org so far: " + ((news[0] || {}).n || 0) + "." });
	return blocks;
}
async function dlBuildSportDevelopment(db: D1Database): Promise<PdfBlock[]> {
	const events = await dlRows(db, "SELECT event_date, distance, result_count FROM race_event_results WHERE finalized = 1 ORDER BY event_date ASC");
	const upcoming = await dlRows(db, "SELECT COUNT(*) AS n FROM public_calendar WHERE kind = 'competition' AND status != 'cancelled' AND (event_date IS NULL OR event_date >= date('now'))");
	const months: Record<string, { ev: number; fin: number }> = {};
	for (const e of events) {
		const m = (e.event_date || "").slice(0, 7);
		if (!m) continue;
		months[m] = months[m] || { ev: 0, fin: 0 };
		months[m].ev += 1; months[m].fin += e.result_count || 0;
	}
	const blocks = dlReportHead("Sport development update");
	blocks.push({ t: "Finalized competitions by month (events \u00B7 recorded participants):" });
	for (const m of Object.keys(months).sort()) blocks.push({ li: 1, t: m + ": " + months[m].ev + " events \u00B7 " + months[m].fin + " participants" });
	blocks.push({ t: "Upcoming competitions currently on the public calendar: " + ((upcoming[0] || {}).n || 0) + "." });
	return blocks;
}
async function dlBuildInstructorUpdate(db: D1Database): Promise<PdfBlock[]> {
	const rows = await dlRows(db, "SELECT course_id, COUNT(DISTINCT user_id) AS users, COUNT(DISTINCT CASE WHEN certified = 1 THEN user_id END) AS certified FROM academy_instructor_snapshot GROUP BY course_id ORDER BY course_id");
	const tot = await dlRows(db, "SELECT COUNT(DISTINCT user_id) AS users, COUNT(DISTINCT CASE WHEN certified = 1 THEN user_id END) AS certified FROM academy_instructor_snapshot");
	const t0 = tot[0] || { users: 0, certified: 0 };
	const blocks = dlReportHead("Instructor and coach development update");
	blocks.push({ t: "Aggregate figures from NWANA Academy records. Individual names are never published." });
	blocks.push({ t: "Learners recorded across Academy instructor courses: " + t0.users + ". Certified instructors recorded: " + t0.certified + "." });
	for (const r of rows) {
		const label = r.course_id === 2 ? "Beginner Instructor course (Academy course 2)" : "Academy course " + r.course_id;
		blocks.push({ li: 1, t: label + ": " + r.users + " learners \u00B7 " + r.certified + " certified" });
	}
	return blocks;
}
async function dlBuildDonationReport(db: D1Database): Promise<PdfBlock[]> {
	const don = await dlRows(db, "SELECT COUNT(*) AS n, SUM(amount_paid_cents) AS cents, MIN(first_seen_at) AS first_seen, MAX(first_seen_at) AS last_seen FROM money_transactions WHERE source_ref LIKE '%/donation:%' AND lifecycle_state = 'ACTIVE' AND amount_paid_status = 'VERIFIED'");
	const fr = await dlRows(db, "SELECT is_team, COUNT(*) AS n FROM challenge_fundraisers GROUP BY is_team");
	const d0 = don[0] || { n: 0, cents: 0 };
	let personal = 0, team = 0;
	for (const r of fr) { if (r.is_team) team = r.n; else personal = r.n; }
	const blocks = dlReportHead("Donation and fundraising report");
	blocks.push({ t: "This report covers donations recorded through RunSignup and verified in NWANA's money ledger. Amounts are the amounts paid by donors. NWANA reports publicly only money actually received; pledges are never counted as received." });
	blocks.push({ t: "Donations recorded: " + d0.n + ". Total donated: $" + ((d0.cents || 0) / 100).toFixed(2) + ". Recording period in the ledger: " + String(d0.first_seen || "").slice(0, 10) + " to " + String(d0.last_seen || "").slice(0, 10) + "." });
	blocks.push({ h: 2, t: "Fundraising" });
	blocks.push({ t: "Charity Challenge fundraisers created: " + (personal + team) + " (" + personal + " personal, " + team + " team). Fundraising is voluntary; participation in NWANA challenges is free." });
	return blocks;
}
async function dlBuildCalendarGuide(db: D1Database): Promise<PdfBlock[]> {
	const items = await dlRows(db, "SELECT title, event_date, url FROM public_calendar WHERE status != 'cancelled' AND (event_date IS NULL OR event_date >= date('now')) ORDER BY (event_date IS NULL), event_date ASC, title ASC LIMIT 120");
	const blocks: PdfBlock[] = [{ t: "Upcoming NWANA competitions and challenges from the public calendar, generated on " + sfNyDate() + ". Registration and full details: https://nwaofna.org/calendar and https://challenges.nwaofna.org." }];
	for (const it of items) blocks.push({ li: 1, t: (it.event_date || "Date to be announced") + " \u00B7 " + it.title });
	if (!items.length) blocks.push({ t: "No upcoming items are currently on the public calendar." });
	return blocks;
}
async function dlBuildNews(db: D1Database): Promise<PdfBlock[]> {
	const items = await dlRows(db, "SELECT title, published_at, excerpt, body_html FROM news_articles WHERE status = 'published' AND (audience = 'nwana' OR audience = 'both') ORDER BY published_at DESC LIMIT 50");
	const blocks: PdfBlock[] = [{ t: "Public announcements and news published by NWANA on nwaofna.org, collected on " + sfNyDate() + "." }];
	for (const it of items) {
		blocks.push({ h: 2, t: it.title });
		blocks.push({ t: "Published: " + String(it.published_at || "").slice(0, 10) });
		const bodyBlocks = dlHtmlToBlocks("<div>" + (it.body_html || "") + "</div>");
		for (const b of bodyBlocks) blocks.push(b);
		if (it.excerpt && (!bodyBlocks.length)) blocks.push({ t: it.excerpt });
	}
	if (!items.length) blocks.push({ t: "No announcements are currently published." });
	return blocks;
}
function dlBuildLevels(): PdfBlock[] {
	const blocks: PdfBlock[] = [{ t: "NWANA competition performance levels are determined by finish time within each distance. The thresholds below are the canonical Series level definitions used by NWANA results and standings." }];
	for (const dist of DISTANCES) {
		blocks.push({ h: 2, t: dist });
		for (const row of levelThresholdLabels(dist)) blocks.push({ li: 1, t: row.name + ": " + row.label });
	}
	return blocks;
}
function dlChecklistFromSafety(blocks: PdfBlock[]): PdfBlock[] {
	return blocks.map((b) => {
		if (b.h && /^\d+\./.test(b.t)) return { h: b.h, t: "[ ] " + b.t };
		return b;
	});
}

// ---------- downloads registry ----------
function dlPolicySub(route: string): string {
	return "Nordic Walking Association of North America (NWANA) \u00B7 Official text as published at https://nwaofna.org" + route + " \u00B7 Downloaded " + sfNyDate();
}
function dlPageSub(what: string): string {
	return "Nordic Walking Association of North America (NWANA) \u00B7 " + what + " \u00B7 Generated as a PDF from nwaofna.org on " + sfNyDate();
}
interface DlDef {
	title: string;
	sub: () => string;
	page?: () => Promise<string>;
	build?: (db: D1Database) => Promise<PdfBlock[]>;
}
const DL_ROUTES: Record<string, DlDef> = {
	"privacy-policy.pdf": { title: "NWANA Privacy Policy", sub: () => dlPolicySub("/privacy"), page: () => privacyPage() },
	"terms-of-use.pdf": { title: "NWANA Terms of Use", sub: () => dlPolicySub("/terms"), page: () => termsPage() },
	"terms-and-conditions.pdf": { title: "NWANA Terms and Conditions", sub: () => dlPolicySub("/terms-conditions"), page: () => termsConditionsPage() },
	"code-of-conduct.pdf": { title: "NWANA Code of Conduct", sub: () => dlPolicySub("/code-of-conduct"), page: () => codeOfConductPage() },
	"safe-sport-policy.pdf": { title: "NWANA Safe Sport Policy", sub: () => dlPolicySub("/safesport"), page: () => safesportPage() },
	"anti-doping-policy.pdf": { title: "NWANA Anti-Doping Policy", sub: () => dlPolicySub("/anti-doping"), page: () => antiDopingPage() },
	"safety-standards.pdf": { title: "NWANA Safety Standards", sub: () => dlPolicySub("/safety"), page: () => safetyPage() },
	"event-safety-checklist.pdf": { title: "NWANA Event Safety Checklist", sub: () => "Checklist format of the NWANA Safety Standards. Full standard: https://nwaofna.org/safety \u00B7 Generated " + sfNyDate(), build: async () => dlChecklistFromSafety(dlHtmlToBlocks(await safetyPage(), { stopAtContact: true })) },
	"program-descriptions.pdf": { title: "NWANA Program Descriptions", sub: () => dlPageSub("Program descriptions from the About NWANA page"), page: () => aboutPage() },
	"governance-overview.pdf": { title: "NWANA Governance and Organizational Overview", sub: () => dlPageSub("From the Governance and Policies page"), page: () => governancePage() },
	"participant-guide.pdf": { title: "NWANA Participant Guide", sub: () => dlPageSub("Answers to frequently asked questions for participants"), page: () => faqPage() },
	"license-certification-information.pdf": { title: "NWANA License and Certification Information", sub: () => dlPageSub("License and certification answers from the NWANA FAQ"), build: async () => { const all = dlHtmlToBlocks(await faqPage(), { stopAtContact: true }); const out: PdfBlock[] = [{ t: "License and certification information, extracted from the NWANA Frequently Asked Questions (https://nwaofna.org/faq)." }]; let keep = false; for (const b of all) { if (b.h) keep = /licen[cs]e|certification/i.test(b.t); if (keep) out.push(b); } return out; } },
	"levels-and-progression-guide.pdf": { title: "NWANA Levels and Progression Guide", sub: () => dlPageSub("Canonical Series performance level definitions"), build: async () => dlBuildLevels() },
	"instructor-coach-resources.pdf": { title: "NWANA Instructor and Coach Resources", sub: () => dlPageSub("Pathways for instructors, coaches, and organizers"), page: () => chooseYourPathPage() },
	"organizer-resources.pdf": { title: "NWANA Organizer Resources", sub: () => dlPageSub("From the NWANA Events page"), page: () => eventsPage() },
	"event-guide.pdf": { title: "NWANA Event Guide: Upcoming Competitions and Challenges", sub: () => dlPageSub("Generated from the NWANA public calendar"), build: (db) => dlBuildCalendarGuide(db) },
	"sponsorship-materials.pdf": { title: "NWANA Sponsorship Materials", sub: () => dlPageSub("From the NWANA Sponsors page"), page: () => sponsorsPage() },
	"partnership-materials.pdf": { title: "NWANA Partnership Materials", sub: () => dlPageSub("From the NWANA Partnerships page"), page: () => partnersPage() },
	"donation-and-impact-materials.pdf": { title: "NWANA Donation and Impact Materials", sub: () => dlPageSub("From the Support and Funds page"), page: () => supportPage() },
	"press-kit.pdf": { title: "NWANA Press Kit", sub: () => dlPageSub("From the NWANA Press Kit page"), page: () => pressPage() },
	"brand-guidelines.pdf": { title: "NWANA Brand Guidelines", sub: () => dlPageSub("From the Logos and Brand Assets page"), page: () => brandPage() },
	"news-and-announcements.pdf": { title: "NWANA News and Announcements", sub: () => dlPageSub("Collected public announcements"), build: (db) => dlBuildNews(db) },
	"season-summary-2026.pdf": { title: "NWANA Annual Summary: 2026 Season to Date", sub: () => dlPageSub("Report generated from NWANA records"), build: (db) => dlBuildSeasonSummary(db) },
	"program-impact-report.pdf": { title: "NWANA Program Impact Report", sub: () => dlPageSub("Report generated from NWANA records"), build: (db) => dlBuildProgramImpact(db) },
	"event-participation-report.pdf": { title: "NWANA Event Participation Report", sub: () => dlPageSub("Report generated from NWANA records"), build: (db) => dlBuildEventParticipation(db) },
	"sport-development-update.pdf": { title: "NWANA Sport Development Update", sub: () => dlPageSub("Report generated from NWANA records"), build: (db) => dlBuildSportDevelopment(db) },
	"instructor-coach-development-update.pdf": { title: "NWANA Instructor and Coach Development Update", sub: () => dlPageSub("Report generated from NWANA Academy records"), build: (db) => dlBuildInstructorUpdate(db) },
	"donation-fundraising-report.pdf": { title: "NWANA Donation and Fundraising Report", sub: () => dlPageSub("Report generated from NWANA records"), build: (db) => dlBuildDonationReport(db) },
};
export async function dlServe(name: string, db: D1Database): Promise<Response | null> {
	if (name === "nwana-logo.jpg") {
		return new Response(sfB64ToBytes(LOGO_JPG_BASE64), { headers: { "content-type": "image/jpeg", "content-disposition": 'attachment; filename="nwana-logo.jpg"', "cache-control": "public, max-age=86400" } });
	}
	if (name === "nwana-favicon.png") {
		return new Response(sfB64ToBytes(FAVICON_PNG_BASE64), { headers: { "content-type": "image/png", "content-disposition": 'attachment; filename="nwana-favicon.png"', "cache-control": "public, max-age=86400" } });
	}
	const def = DL_ROUTES[name];
	if (!def) return null;
	let blocks: PdfBlock[];
	if (def.build) blocks = await def.build(db);
	else blocks = dlHtmlToBlocks(await (def.page as () => Promise<string>)(), { stopAtContact: true });
	const pdf = dlMakePdf(def.title, def.sub(), blocks);
	return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="' + name + '"', "cache-control": "public, max-age=300" } });
}

// ---------- the nine forms named on /forms ----------
export interface SfField {
	k: string;
	l: string;
	t: "text" | "email" | "tel" | "date" | "textarea" | "select" | "checks";
	r?: number;
	o?: string[];
}
export interface SfFormDef {
	slug: string;
	name: string;
	desc: string;
	urgent?: number;
	fields: SfField[];
}
export const SF_FORMS: SfFormDef[] = [
	{ slug: "general-inquiry", name: "General Inquiry Form", desc: "For general questions about NWANA, Nordic Walking, programs, events, licenses, certifications, or participation.", fields: [
		{ k: "name", l: "Full name", t: "text", r: 1 },
		{ k: "email", l: "Email address", t: "email", r: 1 },
		{ k: "topic", l: "Topic", t: "select", r: 1, o: ["NWANA in general", "Nordic Walking", "Programs", "Events", "Licenses", "Certifications", "Participation", "Other"] },
		{ k: "message", l: "Your question", t: "textarea", r: 1 },
	] },
	{ slug: "instructor-coach-inquiry", name: "Instructor / Coach Inquiry Form", desc: "For people interested in becoming NWANA instructors, coaches, or licensed program leaders.", fields: [
		{ k: "name", l: "Full name", t: "text", r: 1 },
		{ k: "email", l: "Email address", t: "email", r: 1 },
		{ k: "phone", l: "Phone (optional)", t: "tel" },
		{ k: "location", l: "City and state", t: "text", r: 1 },
		{ k: "interest", l: "I am interested in becoming", t: "select", r: 1, o: ["NWANA Instructor", "NWANA Coach", "Licensed program leader", "Not sure yet"] },
		{ k: "experience", l: "Relevant experience", t: "textarea" },
		{ k: "message", l: "Anything else NWANA should know", t: "textarea", r: 1 },
	] },
	{ slug: "event-program-proposal", name: "Event / Program Proposal Form", desc: "For organizers, clubs, groups, schools, agencies, or partners who want to propose an event, program, challenge, clinic, or collaboration.", fields: [
		{ k: "name", l: "Full name", t: "text", r: 1 },
		{ k: "email", l: "Email address", t: "email", r: 1 },
		{ k: "organization", l: "Organization", t: "text", r: 1 },
		{ k: "proposal_type", l: "Proposal type", t: "select", r: 1, o: ["Event", "Program", "Challenge", "Clinic", "Collaboration"] },
		{ k: "location", l: "Proposed location", t: "text", r: 1 },
		{ k: "proposed_date", l: "Proposed date (optional)", t: "date" },
		{ k: "description", l: "Describe your proposal", t: "textarea", r: 1 },
	] },
	{ slug: "sponsor-partner-inquiry", name: "Sponsor / Partner Inquiry Form", desc: "For organizations interested in sponsorship, partnership, visibility, program support, or collaboration with NWANA.", fields: [
		{ k: "name", l: "Full name", t: "text", r: 1 },
		{ k: "email", l: "Email address", t: "email", r: 1 },
		{ k: "organization", l: "Organization", t: "text", r: 1 },
		{ k: "website", l: "Website (optional)", t: "text" },
		{ k: "interest", l: "Area of interest", t: "select", r: 1, o: ["Sponsorship", "Partnership", "Visibility", "Program support", "Collaboration"] },
		{ k: "message", l: "Tell us about your interest", t: "textarea", r: 1 },
	] },
	{ slug: "volunteer-interest", name: "Volunteer Interest Form", desc: "For individuals interested in helping with events, programs, outreach, media, administration, or local activities.", fields: [
		{ k: "name", l: "Full name", t: "text", r: 1 },
		{ k: "email", l: "Email address", t: "email", r: 1 },
		{ k: "location", l: "City and state", t: "text", r: 1 },
		{ k: "areas", l: "Areas of interest", t: "checks", r: 1, o: ["Events", "Programs", "Outreach", "Media", "Administration", "Local activities"] },
		{ k: "message", l: "Availability and anything else NWANA should know", t: "textarea", r: 1 },
	] },
	{ slug: "safety-incident-report", name: "Safety / Incident Report Form", desc: "For reporting safety concerns, incidents, injuries, misconduct, conduct issues, or participant protection concerns.", urgent: 1, fields: [
		{ k: "name", l: "Your name", t: "text", r: 1 },
		{ k: "email", l: "Email address", t: "email", r: 1 },
		{ k: "report_type", l: "Type of report", t: "select", r: 1, o: ["Safety concern", "Incident", "Injury", "Misconduct", "Conduct issue", "Participant protection concern"] },
		{ k: "event_location", l: "Event or location", t: "text", r: 1 },
		{ k: "incident_date", l: "Date of the incident or concern (optional)", t: "date" },
		{ k: "description", l: "Describe what happened or what concerns you", t: "textarea", r: 1 },
	] },
	{ slug: "media-request", name: "Media Request Form", desc: "For press, interviews, quotes, images, logos, background information, or media coordination.", fields: [
		{ k: "name", l: "Full name", t: "text", r: 1 },
		{ k: "email", l: "Email address", t: "email", r: 1 },
		{ k: "outlet", l: "Media outlet or organization", t: "text", r: 1 },
		{ k: "request_type", l: "Request type", t: "select", r: 1, o: ["Press inquiry", "Interview", "Quote", "Images", "Logos", "Background information", "Media coordination"] },
		{ k: "deadline", l: "Deadline (optional)", t: "date" },
		{ k: "message", l: "Describe your request", t: "textarea", r: 1 },
	] },
	{ slug: "document-brand-asset-request", name: "Document / Brand Asset Request Form", desc: "For requesting approved logos, documents, reports, forms, or brand materials.", fields: [
		{ k: "name", l: "Full name", t: "text", r: 1 },
		{ k: "email", l: "Email address", t: "email", r: 1 },
		{ k: "organization", l: "Organization (optional)", t: "text" },
		{ k: "asset_type", l: "What are you requesting?", t: "select", r: 1, o: ["Logos", "Documents", "Reports", "Forms", "Brand materials"] },
		{ k: "intended_use", l: "Intended use", t: "text", r: 1 },
		{ k: "message", l: "Details of your request", t: "textarea", r: 1 },
	] },
	{ slug: "correction-request", name: "Correction Request Form", desc: "For requesting correction of registration information, results, rankings, spelling, contact details, or other records.", fields: [
		{ k: "name", l: "Full name", t: "text", r: 1 },
		{ k: "email", l: "Email address", t: "email", r: 1 },
		{ k: "record_type", l: "Record to correct", t: "select", r: 1, o: ["Registration information", "Results", "Rankings", "Spelling", "Contact details", "Other records"] },
		{ k: "record_reference", l: "Record reference (event, date, or the name as it appears)", t: "text", r: 1 },
		{ k: "correction", l: "What should be corrected, and to what?", t: "textarea", r: 1 },
	] },
];
export function sfDef(slug: string): SfFormDef | null {
	for (const f of SF_FORMS) if (f.slug === slug) return f;
	return null;
}
const SF_STYLE = `<style>
.sf-form label{display:block;font-weight:600;color:var(--navy);margin:18px 0 6px}
.sf-form input[type=text],.sf-form input[type=email],.sf-form input[type=tel],.sf-form input[type=date],.sf-form select,.sf-form textarea{width:100%;padding:11px 13px;border:1px solid #c4ccd9;border-radius:9px;font:inherit;background:#fff;color:var(--ink)}
.sf-form textarea{min-height:120px}
.sf-form .sf-check{display:flex;gap:9px;align-items:flex-start;font-weight:400;color:var(--ink);margin:8px 0}
.sf-form .sf-check input{margin-top:5px}
.sf-req{color:#b3261e}
.sf-err{background:#fdecea;border:1px solid #efc3bf;color:#7a1f1a;border-radius:10px;padding:14px 18px;margin:18px 0}
.sf-ok{background:#eef7ee;border:1px solid #bcd8bc;color:#1e4d1e;border-radius:10px;padding:16px 20px;margin:18px 0}
</style>`;
type SfValues = Record<string, string | string[]>;
function sfFieldHtml(f: SfField, val: string | string[] | undefined): string {
	const req = f.r ? ' <span class="sf-req">*</span>' : "";
	const id = "sf-" + f.k;
	if (f.t === "textarea") return `<label for="${id}">${esc(f.l)}${req}</label><textarea id="${id}" name="${f.k}"${f.r ? " required" : ""}>${esc(typeof val === "string" ? val : "")}</textarea>`;
	if (f.t === "select") return `<label for="${id}">${esc(f.l)}${req}</label><select id="${id}" name="${f.k}"${f.r ? " required" : ""}><option value="">Select...</option>${(f.o || []).map((o) => `<option value="${esc(o)}"${val === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
	if (f.t === "checks") {
		const chosen = Array.isArray(val) ? val : [];
		return `<label>${esc(f.l)}${req}</label>${(f.o || []).map((o) => `<label class="sf-check"><input type="checkbox" name="${f.k}" value="${esc(o)}"${chosen.indexOf(o) >= 0 ? " checked" : ""}> <span>${esc(o)}</span></label>`).join("")}`;
	}
	return `<label for="${id}">${esc(f.l)}${req}</label><input type="${f.t}" id="${id}" name="${f.k}" value="${esc(typeof val === "string" ? val : "")}"${f.r ? " required" : ""}>`;
}
export function sfFormPage(def: SfFormDef, values: SfValues, errs: string[]): string {
	const errHtml = errs && errs.length ? `<div class="sf-err"><strong>Your submission was not sent.</strong><br>${errs.map((e) => esc(e)).join("<br>")}</div>` : "";
	const urgent = def.urgent ? `<div class="note"><strong>Urgent safety concerns:</strong> Forms are not a substitute for emergency services. If there is immediate danger, a medical emergency, abuse, threat, criminal conduct, or urgent safety concern, contact emergency services or appropriate authorities immediately. After urgent action is taken, NWANA may also be notified through this form.</div>` : "";
	const content = `
  ${sfHead("Forms", def.name, def.desc)}
  <div class="section"><div class="wrap">
    <p style="margin-bottom:6px"><a class="card-link" href="/forms">\u2190 All NWANA forms</a></p>
    ${urgent}
    ${errHtml}
    <div class="card" style="margin-top:14px">
      <form class="sf-form" method="post" action="/forms/${def.slug}">
        ${def.fields.map((f) => sfFieldHtml(f, values ? values[f.k] : "")).join("")}
        <div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <p style="margin-top:22px"><button class="btn btn-navy" type="submit">Submit</button></p>
        <p style="font-size:15px;color:var(--muted)">Your information is stored by NWANA and handled under the <a href="/privacy">NWANA Privacy Policy</a>. Submitting a form does not guarantee approval, response, selection, license, certification, event approval, sponsorship, partnership, publication, or action.</p>
      </form>
    </div>
  </div></div>`;
	return layout(def.name, "forms", SF_STYLE + content, def.desc);
}
export function sfConfirmPage(def: SfFormDef, id: number): string {
	const ref = "SF-" + String(id).padStart(6, "0");
	const content = `
  ${sfHead("Forms", "Submission received", def.name)}
  <div class="section"><div class="wrap">
    <div class="sf-ok"><strong>Thank you. Your ${esc(def.name)} has been received.</strong><br>Your reference number is <strong>${esc(ref)}</strong>. Please keep it for your records.</div>
    <p>NWANA reviews form submissions and may request additional information before responding or making a decision. See <a href="/forms">how NWANA forms are reviewed</a>.</p>
    <p><a class="card-link" href="/forms">\u2190 Back to all forms</a></p>
  </div></div>`;
	return layout("Submission received", "forms", SF_STYLE + content, "Your NWANA form submission has been received.");
}
export function sfFailPage(): string {
	const content = `
  ${sfHead("Forms", "Something went wrong", "Your submission could not be saved.")}
  <div class="section"><div class="wrap">
    <div class="sf-err"><strong>Your submission was not saved.</strong> Please try again in a moment. If the problem persists, email NWANA at <a href="mailto:info@nwaofna.org">info@nwaofna.org</a> instead.</div>
    <p><a class="card-link" href="/forms">\u2190 Back to all forms</a></p>
  </div></div>`;
	return layout("Something went wrong", "forms", SF_STYLE + content, "Your NWANA form submission could not be saved.");
}
export async function sfHandlePost(request: Request, db: D1Database, def: SfFormDef): Promise<{ status: number; body: string }> {
	let fd: FormData;
	try {
		fd = await request.formData();
	} catch {
		return { status: 400, body: sfFormPage(def, {}, ["The form could not be read. Please try again."]) };
	}
	if (String(fd.get("website") || "").trim() !== "") {
		return { status: 400, body: sfFormPage(def, {}, ["The submission could not be accepted. Please email info@nwaofna.org instead."]) };
	}
	const values: SfValues = {};
	const errs: string[] = [];
	for (const f of def.fields) {
		if (f.t === "checks") {
			const all = fd.getAll(f.k).map((v) => String(v).trim()).filter((v) => (f.o || []).indexOf(v) >= 0);
			values[f.k] = all;
			if (f.r && !all.length) errs.push("Please choose at least one option for: " + f.l);
		} else {
			const v = String(fd.get(f.k) || "").trim().slice(0, 10000);
			values[f.k] = v;
			if (f.r && !v) errs.push("This field is required: " + f.l);
			if (f.t === "select" && v && (f.o || []).indexOf(v) < 0) errs.push("Please choose a listed option for: " + f.l);
			if (f.t === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs.push("Please enter a valid email address.");
		}
	}
	if (errs.length) return { status: 400, body: sfFormPage(def, values, errs) };
	try {
		const res = await db
			.prepare("INSERT INTO site_form_submissions (form_slug, fields_json, ip, user_agent, referer) VALUES (?, ?, ?, ?, ?)")
			.bind(def.slug, JSON.stringify(values), request.headers.get("cf-connecting-ip") || "", String(request.headers.get("user-agent") || "").slice(0, 300), String(request.headers.get("referer") || "").slice(0, 300))
			.run();
		const id = res && res.meta ? Number(res.meta.last_row_id || 0) : 0;
		return { status: 200, body: sfConfirmPage(def, id) };
	} catch (e) {
		console.error("site form submission failed", e);
		return { status: 500, body: sfFailPage() };
	}
}
// ---------- index injectors ----------
export function sfFormsIndexHtml(): string {
	const cards = SF_FORMS.map((f) => `<div class="card"><h3>${esc(f.name)}</h3><p>${esc(f.desc)}</p><p><a class="card-link" href="/forms/${f.slug}">Open the form \u2192</a></p></div>`).join("");
	return `<div style="margin-bottom:10px"><h2>Online forms</h2><p>All nine NWANA forms are available online. Choose the form that matches your request; your submission goes directly to NWANA.</p><div class="grid cols-3">${cards}</div></div>`;
}
export function dlInjectForms(htmlStr: string): string {
	const marker = '<div class="article">';
	if (String(htmlStr).indexOf(marker) < 0) return htmlStr;
	return String(htmlStr).replace(marker, sfFormsIndexHtml() + marker);
}
export function dlLibraryHtml(): string {
	const item = (name: string, note: string, href: string, label?: string) => `<div class="card"><h3>${esc(name)}</h3><p>${esc(note)}</p><p><a class="card-link" href="${href}">${esc(label || "Download PDF \u2192")}</a></p></div>`;
	const policy = [
		item("Privacy Policy", "How NWANA collects, uses, shares, and protects information.", "/downloads/privacy-policy.pdf"),
		item("Terms of Use", "Terms governing NWANA websites and digital services.", "/downloads/terms-of-use.pdf"),
		item("Terms and Conditions", "NWANA terms and conditions, including waivers and refunds.", "/downloads/terms-and-conditions.pdf"),
		item("Code of Conduct", "Conduct standards for the NWANA community.", "/downloads/code-of-conduct.pdf"),
		item("Safe Sport Policy", "Participant protection and Safe Sport standards.", "/downloads/safe-sport-policy.pdf"),
		item("Anti-Doping Policy", "NWANA anti-doping policy and clean sport education.", "/downloads/anti-doping-policy.pdf"),
		item("Safety Standards", "Participant readiness, equipment, routes, weather, supervision, and emergency standards.", "/downloads/safety-standards.pdf"),
	].join("");
	const programs = [
		item("Program Descriptions", "What NWANA is and what it does, from the About NWANA page.", "/downloads/program-descriptions.pdf"),
		item("Governance and Organizational Overview", "How NWANA governance and policies are organized.", "/downloads/governance-overview.pdf"),
		item("Participant Guide", "Frequently asked questions for participants and newcomers.", "/downloads/participant-guide.pdf"),
		item("License and Certification Information", "License and certification answers from the NWANA FAQ.", "/downloads/license-certification-information.pdf"),
		item("Levels and Progression Guide", "Canonical Series performance levels by distance.", "/downloads/levels-and-progression-guide.pdf"),
		item("Event Guide: Upcoming Competitions and Challenges", "Generated from the NWANA public calendar.", "/downloads/event-guide.pdf"),
	].join("");
	const safety = [
		item("Event Safety Checklist", "The NWANA Safety Standards in checklist form.", "/downloads/event-safety-checklist.pdf"),
	].join("");
	const instructors = [
		item("Instructor and Coach Resources", "Pathways for instructors, coaches, judges, and organizers.", "/downloads/instructor-coach-resources.pdf"),
		item("Organizer Resources", "How NWANA Events work and how organizations take part.", "/downloads/organizer-resources.pdf"),
	].join("");
	const supporters = [
		item("Sponsorship Materials", "NWANA sponsorship programs and opportunities.", "/downloads/sponsorship-materials.pdf"),
		item("Partnership Materials", "How organizations partner with NWANA.", "/downloads/partnership-materials.pdf"),
		item("Donation and Impact Materials", "Support and Funds: how donations and fundraising work.", "/downloads/donation-and-impact-materials.pdf"),
	].join("");
	const media = [
		item("Press Kit", "Official descriptions, name usage, and media rules.", "/downloads/press-kit.pdf"),
		item("Brand Guidelines", "Logos and brand asset rules.", "/downloads/brand-guidelines.pdf"),
		item("NWANA Logo (JPG)", "The NWANA logo file. Brand rules and approval requirements apply to any use.", "/downloads/nwana-logo.jpg", "Download JPG \u2192"),
		item("NWANA Favicon (PNG)", "The NWANA favicon file.", "/downloads/nwana-favicon.png", "Download PNG \u2192"),
	].join("");
	const reports = [
		item("Annual Summary: 2026 Season to Date", "Year-to-date activity summary generated from NWANA records.", "/downloads/season-summary-2026.pdf"),
		item("Program Impact Report", "Participation, education, and program figures from NWANA records.", "/downloads/program-impact-report.pdf"),
		item("Event Participation Report", "Event-by-event participation from finalized results.", "/downloads/event-participation-report.pdf"),
		item("Donation and Fundraising Report", "Donations recorded through RunSignup and verified in NWANA's money ledger.", "/downloads/donation-fundraising-report.pdf"),
		item("Sport Development Update", "Competition growth by month, from NWANA records.", "/downloads/sport-development-update.pdf"),
		item("Instructor and Coach Development Update", "Aggregate Academy instructor figures. Names are never published.", "/downloads/instructor-coach-development-update.pdf"),
	].join("");
	const exceptions = `<div class="card"><h3>Reports available on request</h3><p><strong>Health and wellness program summaries:</strong> NWANA does not currently publish a health and wellness program summary. To request one, email <a href="mailto:info@nwaofna.org">info@nwaofna.org</a>.</p><p><strong>Partner and sponsor impact summaries:</strong> these are prepared for the relevant partners and sponsors and shared with them directly. To request one, email <a href="mailto:info@nwaofna.org">info@nwaofna.org</a>.</p></div>`;
	const announcements = [
		item("News and Announcements", "Public announcements and news published by NWANA, collected in one file.", "/downloads/news-and-announcements.pdf"),
	].join("");
	const forms = SF_FORMS.map((f) => `<div class="card"><h3>${esc(f.name)}</h3><p>${esc(f.desc)}</p><p><a class="card-link" href="/forms/${f.slug}">Open the form \u2192</a></p></div>`).join("");
	return `<div style="margin-bottom:10px">
    <h2>Downloads library</h2>
    <p>The documents below are generated from NWANA's own published pages and records, so the file you download matches what NWANA publishes. Policy files reproduce the official policy texts word for word.</p>
    <h3 style="margin-top:26px">Policy documents</h3><div class="grid cols-3">${policy}</div>
    <h3 style="margin-top:26px">Programs, guides, and participation</h3><div class="grid cols-3">${programs}</div>
    <h3 style="margin-top:26px">Safety documents and checklists</h3><div class="grid cols-3">${safety}</div>
    <h3 style="margin-top:26px">Instructors, coaches, and organizers</h3><div class="grid cols-3">${instructors}</div>
    <h3 style="margin-top:26px">Sponsors, partners, and donors</h3><div class="grid cols-3">${supporters}</div>
    <h3 style="margin-top:26px">Media documents, logos, and brand files</h3><div class="grid cols-3">${media}</div>
    <h3 style="margin-top:26px">Reports</h3><div class="grid cols-3">${reports}</div><div style="margin-top:18px">${exceptions}</div>
    <h3 style="margin-top:26px">Public announcements</h3><div class="grid cols-3">${announcements}</div>
    <h3 style="margin-top:26px">Forms</h3><p>NWANA forms are completed online:</p><div class="grid cols-3">${forms}</div>
  </div>`;
}
export function dlInjectLibrary(htmlStr: string): string {
	const marker = '<div class="article">';
	if (String(htmlStr).indexOf(marker) < 0) return htmlStr;
	return String(htmlStr).replace(marker, dlLibraryHtml() + marker);
}
