// Page renderers for the NWANA public site. All copy is English, no em-dashes.

import {
	CalendarItem,
	DISTANCES,
	Distance,
	NewsItem,
	RaceEvent,
	genderLabel,
	getCalendarForSeries,
	getChallengeCalendar,
	getCompetitionCalendar,
	getCompetitionSeries,
	getNews,
	getNewsItem,
	getPastResults,
	getSeasonStats,
	getUpcoming,
	levelNameOf,
	levelThresholdLabels,
	registrationUrl,
	winnersOf,
} from "./data";
import {
	getPublicProgression,
	type PublicProgressionResult,
} from "./progression-data";
import {
	DONATE_URL,
	esc,
	emptyState,
	formatDate,
	weekdayOf,
	layout,
} from "./views";

function statBand(stats: { finishes: number; events: number; athletes: number }): string {
	return `<div class="stats"><div class="wrap">
    <div class="stat"><div class="n">6</div><div class="l">Race distances, 1K to 20K</div></div>
    <div class="stat"><div class="n">5</div><div class="l">Performance levels, fair for every pace</div></div>
    <div class="stat"><div class="n">${stats.finishes.toLocaleString("en-US")}</div><div class="l">Verified finishes this season</div></div>
    <div class="stat"><div class="n">${stats.athletes.toLocaleString("en-US")}</div><div class="l">Athletes with verified finishes</div></div>
  </div></div>`;
}

// ---------------------------------------------------------------------------
// Object fan-out: unified calendar entries from the canonical public
// calendar (created once in the Machine) merged with the legacy race
// results table. Competition and challenge entries are never mixed.
// ---------------------------------------------------------------------------

interface CalEntry {
	title: string;
	event_date: string | null;
	sub: string;
	url: string | null;
}

function entryFromRaceEvent(event: RaceEvent): CalEntry {
	return {
		title: event.event_name ?? `${event.distance} Nordic Walking Race`,
		event_date: event.event_date,
		sub: `${weekdayOf(event.event_date)} · ${event.distance} · Virtual, poles mandatory · Results verified after the race`,
		url: registrationUrl(event),
	};
}

function entryFromCalendarItem(item: CalendarItem, sub: string): CalEntry {
	return {
		title: item.title,
		event_date: item.event_date,
		sub: `${weekdayOf(item.event_date)} · ${sub}`,
		url: item.url,
	};
}

/** Merge entries, dropping exact title+date duplicates (the same object can
 * appear in both the legacy results table and the new public calendar). */
function mergeEntries(lists: CalEntry[][], limit: number): CalEntry[] {
	const seen = new Set<string>();
	const merged: CalEntry[] = [];
	for (const list of lists) {
		for (const e of list) {
			const key = `${e.title}||${e.event_date ?? ""}`;
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(e);
		}
	}
	merged.sort((a, b) => (a.event_date ?? "9999").localeCompare(b.event_date ?? "9999"));
	return merged.slice(0, limit);
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT: Record<string, string> = { "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun","07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec" };

function calRowHtml(e: CalEntry): string {
	const [y, m, d] = (e.event_date ?? "--").split("-");
	return `<div class="cal-row">
    <div class="cal-date"><div class="d">${esc(d ?? "")}</div><div class="m">${esc(MONTH_SHORT[m] ?? "")}</div></div>
    <div class="cal-info">
      <div class="t">${esc(e.title)}</div>
      <div class="s">${esc(e.sub)}</div>
    </div>
    ${e.url ? `<a class="btn btn-navy" href="${esc(e.url)}">Register</a>` : ""}
  </div>`;
}

function calMonthSections(entries: CalEntry[]): string {
	const dated = entries.filter((e) => e.event_date);
	const undated = entries.filter((e) => !e.event_date);
	const months = new Map<string, CalEntry[]>();
	for (const e of dated) {
		const key = (e.event_date ?? "").slice(0, 7);
		if (!months.has(key)) months.set(key, []);
		months.get(key)!.push(e);
	}
	const monthName = (ym: string) => {
		const [y, m] = ym.split("-").map(Number);
		return `${MONTH_NAMES[m - 1]} ${y}`;
	};
	const datedHtml = [...months.entries()]
		.map(([ym, list]) => `
        <div class="month">${esc(monthName(ym))}</div>
        ${list.map(calRowHtml).join("")}`)
		.join("");
	const undatedHtml = undated.length
		? `<div class="month">Dates to be announced</div>${undated.map(calRowHtml).join("")}`
		: "";
	return datedHtml + undatedHtml;
}

function upcomingCardFromEntry(e: CalEntry): string {
	return `<div class="card">
    <div class="meta">${esc(weekdayOf(e.event_date))}, ${esc(formatDate(e.event_date))}</div>
    <h3>${esc(e.title)}</h3>
    <p style="font-size:14.5px">${esc(e.sub)}</p>
    ${e.url ? `<a class="card-link" href="${esc(e.url)}">Register →</a>` : `<span style="color:var(--muted);font-size:14px">Registration opens soon.</span>`}
  </div>`;
}

export async function homePage(db: D1Database): Promise<string> {
	// Homepage "next races" block: competition only. Merges the legacy race
	// results table with the canonical public calendar (objects created once
	// in the Machine); challenges never appear here.
	const [stats, upcoming, competition, latest, news] = await Promise.all([
		getSeasonStats(db),
		getUpcoming(db, 60),
		getCompetitionCalendar(db, 60),
		getPastResults(db, undefined, 1),
		getNews(db, 3),
	]);
	const upcomingEntries = mergeEntries(
		[
			upcoming.map(entryFromRaceEvent),
			competition.map((c) => entryFromCalendarItem(c, "NWANA competition")),
		],
		3,
	);

	const nextRaces = upcomingEntries.length > 0
		? `<div class="grid cols-3">${upcomingEntries.map(upcomingCardFromEntry).join("")}</div>
       <p style="margin-top:18px"><a class="card-link" href="/calendar">See the full calendar →</a></p>`
		: emptyState("The next race dates are being finalized. Check back soon, the calendar never stays empty for long.");

	const spotlight = latest.length > 0 && winnersOf(latest[0]).length > 0
		? (() => {
			const event = latest[0];
			const lines = winnersOf(event)
				.map((w) => `<div class="winner-line"><span class="lvl">${esc(levelNameOf(w))} · ${esc(genderLabel(w.gender))}</span><span class="who"><strong>${esc(w.athlete)}</strong>${w.time ? `, ${esc(w.time)}` : ""}${w.series_record ? ` <span class="record-tag">Series record</span>` : ""}</span></div>`)
				.join("");
			return `<div class="congrats">
          <div class="kicker">Latest winners</div>
          <h3>${esc(event.event_name ?? "")}</h3>
          <p class="meta" style="color:var(--muted);font-size:14px">${esc(formatDate(event.event_date))}</p>
          ${lines}
          <p style="margin-top:14px"><a class="card-link" href="/winners">All congratulations →</a></p>
        </div>`;
		})()
		: "";

	const newsTeaser = news.length > 0
		? `<div class="grid cols-3">${news.map((n) => `
        <a class="card news-card" href="/news/${esc(n.slug)}">
          <div class="meta">${esc(formatDate(n.published_at))} ${n.kind === "winner_announcement" ? `<span class="badge gold" style="margin-left:8px">Winners</span>` : ""}</div>
          <h3>${esc(n.title)}</h3>
        </a>`).join("")}</div>
        <p style="margin-top:18px"><a class="card-link" href="/news">All news →</a></p>`
		: emptyState("News from the federation will appear here. Race reports, winner announcements, and federation updates, published as they happen.");

	const content = `
  <div class="hero hero-photo"><div class="wrap">
    <span class="eyebrow">Nordic Walking Association of North America</span>
    <h1>Every generation gets its fitness movement.<br><span class="gold">Nordic walking is next.</span></h1>
    <p class="lead">NWANA is building Nordic walking as a continental sport: weekly verified races across North America, fair performance levels where every pace has its own podium, and a path from your first kilometer to the world stage.</p>
    <div class="cta-row">
      <a class="btn btn-gold" href="/calendar">Join a Race</a>
      <a class="btn btn-outline" href="${DONATE_URL}">Donate</a>
      <a class="btn btn-outline" href="https://academy.nwaofna.org">Explore the Academy</a>
    </div>
  </div></div>
  ${statBand(stats)}
  <div class="section"><div class="wrap">
    <div class="kicker">How it works</div>
    <h2>One sport, three doors</h2>
    <div class="grid cols-3">
      <div class="card">
        <h3>Compete</h3>
        <p>Weekly Series races from 1K to 20K, all virtual and verified. Submit your result with poles, get placed in your performance level, climb the standings.</p>
        <a class="card-link" href="/results?view=standings">See the standings →</a>
      </div>
      <div class="card">
        <h3>Learn</h3>
        <p>The NWANA Academy takes you from a free intro course to certified instructor, coach, and judge. Technique first, credentials that mean something.</p>
        <a class="card-link" href="https://academy.nwaofna.org">Visit the Academy →</a>
      </div>
      <div class="card">
        <h3>Belong</h3>
        <p>Start or join a local NWANA Group, train together, enter team competitions, and grow the sport in your city. The federation scales through its groups.</p>
        <a class="card-link" href="/groups">Explore NW Groups →</a>
      </div>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Free instructor education</div>
    <h2>Free Instructor Education for Participating Organizations</h2>
    <p>Your organization chooses the people. NWANA provides their Nordic Walking instructor education at no cost to them.</p>
    <p>Senior programs, health and rehabilitation organizations, community groups, veterans programs, youth programs, parks and recreation departments, schools, universities and other participating organizations can nominate their own people.</p>
    <p>Donations, grants, sponsors, fundraising and workplace giving help NWANA operate and scale the program.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn" href="https://challenges.nwaofna.org/organizations">For Organizations</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="https://challenges.nwaofna.org/instructor-training">Instructor Education</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="https://challenges.nwaofna.org/fundraising">Support the Program</a>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Race calendar</div>
    <h2>Next on the start line</h2>
    ${nextRaces}
  </div></div>
  <div class="section"><div class="wrap">
    ${spotlight}
    <div class="kicker">Federation news</div>
    <h2>Latest updates</h2>
    ${newsTeaser}
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">The mission</div>
    <h2>Built like a federation, from day one</h2>
    <p>NWANA is a 501(c)(3) public charity on a simple mission: make Nordic walking a recognized, professionally run sport across North America. Verified competitions, transparent standings, trained instructors, and local groups in every region. Your support helps NWANA provide free instructor education, grow local groups, and power verified competitions.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="${DONATE_URL}">Donate to NWANA</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="/calendar">Find your race</a>
    </div>
  </div></div>`;

	return layout("Home", "home", content, "NWANA, the Nordic Walking Association of North America: weekly verified races, fair performance levels, instructor academy, and a continental sport in the making.");
}

export async function aboutPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap">
    <h1>About NWANA</h1>
    <p>The continental federation building Nordic walking as a professional sport across North America.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Our story</div>
    <h2>One federation for a continental sport</h2>
    <p>The Nordic Walking Association of North America (NWANA) is the continental governing and sanctioning body for competitive Nordic walking across North America.</p>
    <p>NWANA operates as a U.S. nonprofit public charity recognized under Section 501(c)(3) of the Internal Revenue Code. Our mission is to develop Nordic walking with integrity, professional standards, public benefit, and a long-term continental vision across the United States, Canada, Mexico, and the wider North American region.</p>
    <p>NWANA connects education, professional development, licensing, local NW Groups, competition rules, organized competitions, official results, sanctioning, and sport development within one growing system.</p>
    <p>The NWANA Open Nordic Walking Series already provides scheduled competition opportunities, published results, and standings. At the same time, NWANA continues developing the people, local organizations, technical capacity, and event infrastructure needed to expand in-person stadium, road, cross-country, and relay competitions across North America.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">What we do</div>
    <h2>Six pillars of the sport system</h2>
    <div class="grid cols-3">
      <div class="card"><h3>Governance</h3><p>Develop rules, standards, policies, integrity protections, and long-term direction for Nordic walking across North America.</p></div>
      <div class="card"><h3>Education</h3><p>Provide progressive education and qualification pathways for instructors, coaches, judges, Race Directors, technical officials, and leaders through NWANA Academy.</p></div>
      <div class="card"><h3>Licensing</h3><p>Operate licensing pathways for athletes, professionals, individual NW Group participants, and eligible organizations.</p></div>
      <div class="card"><h3>Community</h3><p>Help people join existing NW Groups or begin establishing new groups for communities, workplaces, schools, healthcare organizations, and municipalities.</p></div>
      <div class="card"><h3>Competitions</h3><p>Develop and operate Nordic walking competitions, publish official results and standings, maintain competition rules, and expand opportunities for athletes.</p></div>
      <div class="card"><h3>Sport development</h3><p>Continue building the people, organizations, events, technical standards, sanctioning capacity, and ranking structures for a sustainable continental sport system.</p></div>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">How it works</div>
    <h2>One system, five steps</h2>
    <div class="grid cols-2">
      <div class="card"><h3>1. Learn and develop</h3><p>Begin with Nordic walking education and continue through the appropriate participant or professional pathway.</p></div>
      <div class="card"><h3>2. Connect locally</h3><p>Join an existing NW Group or help establish a new group in your community or organization.</p></div>
      <div class="card"><h3>3. Obtain the appropriate license</h3><p>Select the license that corresponds to your role, activity, organization, or level of professional responsibility.</p></div>
      <div class="card"><h3>4. Participate and compete</h3><p>Take part in NWANA activities, challenges, competitions, and other published opportunities.</p></div>
      <div class="card"><h3>5. Lead, organize, or support</h3><p>Continue developing as a professional, establish an NW Group, organize activities or competitions, volunteer, partner with NWANA, sponsor a program, or support a designated fund.</p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Founder and president</div>
    <h2>Albert Fatikhov</h2>
    <div class="grid cols-2">
      <div class="card">
        <div class="board-photo"><img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/efade10b-4183-42c3-8549-bdcfaed4b27c-bQoiOp.png" alt="Albert Fatikhov"></div>
        <p>NWANA was founded by Albert Fatikhov to build a full continental federation for Nordic walking in the United States: verified competitions, fair performance levels, instructor education, and local groups, all running as one machine.</p>
        <p>As an athlete, he is a World Championship medalist: silver in the 4x5K relay and bronze in the 5K at Lahti 2024. He leads the federation the way he races, from the front.</p>
        <div class="cta-row" style="margin-top:18px">
          <a class="btn btn-navy" href="https://albertfatikhov.nwaofna.org/">Visit Albert Fatikhov's page</a>
        </div>
      </div>
      <div class="card">
        <div class="kicker">Elite athletes</div>
        <h3>A small roster, a high bar</h3>
        <p>NWANA's elite athlete roster is intentionally small. It is led by Albert Fatikhov, World Championship medalist (silver, 4x5K relay; bronze, 5K, Lahti 2024).</p>
        <p>Elite status at NWANA is earned on the course, through the same verified performance levels every athlete climbs, from Open to Elite.</p>
        <p><a class="inline-link" href="/elite">See the Elite Athletes Club &rarr;</a></p>
      </div>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Leadership</div>
    <h2>Board of directors</h2>
    <p>Our leadership is built on real sporting experience. The President and most members of the Board have earned medals at World Championships, continental championships, national championships, and other major competitions in Nordic walking and additional sports.</p>
    <div class="grid cols-4" style="margin-top:22px">
      <div class="card board-card">
        <div class="board-photo"><img src="/board/liene-visocka-sq.jpg" alt="Liene Visocka"></div>
        <h3>Liene Visocka</h3>
        <p class="role">Board Member for Sports</p>
        <p class="email"><a href="mailto:lv@nwaofna.org">lv@nwaofna.org</a></p>
        <p><a href="/board/liene-visocka">Full profile</a></p>
      </div>
      <div class="card board-card">
        <div class="board-photo"><img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/18/13/824/460f6d1b-7fc7-4172-ad9c-a83f72e3d5d6-bQnj7l.png" alt="Maris Vainovskis"></div>
        <h3>Maris Vainovskis</h3>
        <p class="role">Board Director, NWANA</p>
        <p class="email"><a href="mailto:mv@nwaofna.org">mv@nwaofna.org</a></p>
        <p><a href="/board/maris-vainovskis">Full profile</a></p>
      </div>
      <div class="card board-card">
        <div class="board-photo"><img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/30/13/824/7d38b8df-7030-45ad-a7b1-2e66b49af94d-bQrckk.png" alt="Leonids Reinholds"></div>
        <h3>Leonids Reinholds</h3>
        <p class="role">Board Director, NWANA</p>
        <p class="email"><a href="mailto:leonids.reinholds@nwaofna.org">leonids.reinholds@nwaofna.org</a></p>
        <p><a href="/board/leonids-reinholds">Full profile</a></p>
      </div>
      <div class="card board-card">
        <div class="board-photo"><img src="/board/albert-tazetdinov-sq.jpg" alt="Albert Tazetdinov"></div>
        <h3>Albert Tazetdinov</h3>
        <p class="role">CEO, NWANA</p>
        <p class="email"><a href="mailto:albert.tazetdinov@nwaofna.org">albert.tazetdinov@nwaofna.org</a></p>
        <p><a href="/board/albert-tazetdinov">Full profile</a></p>
      </div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Integrity</div>
    <h2>Public benefit and integrity</h2>
    <p>As a 501(c)(3) public charity, NWANA is committed to transparency, public benefit, fair access, participant safety, and responsible sport development. We believe Nordic walking can grow into a strong and respected competitive sport across North America when its development is supported by real education, technical knowledge, community access, fair competition, clear standards, and accountable leadership.</p>
    <p style="margin-top:16px"><a aria-label="Nordic Walking Association of North America Inc NWANA" href="https://app.candid.org/profile/16510915/nordic-walking-association-of-north-america-inc-nwana-33-2444142/?pkId=31facfb4-fd0b-404a-9f53-147e33297404" target="_blank" rel="noopener" style="display:inline-block"><img alt="Candid transparency seal" src="https://widgets.guidestar.org/prod/v1/pdp/transparency-seal/16510915/svg" style="max-width:150px"></a></p>
  </div></div>`;

	return layout("About NWANA", "about", content, "About the Nordic Walking Association of North America: the federation story, founder Albert Fatikhov, elite athletes, and the board of directors.");
}

function eventResultsHtml(event: RaceEvent): string {	const levels = levelThresholdLabels(event.distance as Distance);
	const blocks = levels.map(({ name, label }) => {
		const rows = event.results
			.filter((r) => levelNameOf(r) === name)
			.sort((a, b) => Number(a.level_place ?? 999) - Number(b.level_place ?? 999));
		const body = rows.length > 0
			? `<table class="results"><thead><tr><th>Place in level</th><th>Athlete</th><th>Division</th><th>Time</th></tr></thead><tbody>${rows
				.map((r) => `<tr><td><strong>${esc(r.level_place ?? "")}</strong></td><td>${esc(r.athlete)}${r.series_record ? ` <span class="record-tag">Series record</span>` : ""}</td><td>${esc(genderLabel(r.gender))}</td><td>${esc(r.time ?? "")}</td></tr>`)
				.join("")}</tbody></table>`
			: `<div class="empty-level">No finishers in this level</div>`;
		return `<div class="level-head"><h3>${esc(name)}</h3><span class="threshold">${esc(label)}</span></div>${body}`;
	}).join("");
	const full = event.results_url
		? `<p style="margin-top:16px"><a class="card-link" href="${esc(event.results_url)}">Full results on RunSignup →</a></p>`
		: "";
	return `<div class="event-card">
    <div class="event-title serif">${esc(event.event_name ?? `${event.distance} race`)}</div>
    <div class="event-meta">${esc(weekdayOf(event.event_date))}, ${esc(formatDate(event.event_date))} · ${esc(event.distance)} · ${event.result_count} verified finisher${event.result_count === 1 ? "" : "s"}</div>
    ${blocks}
    ${full}
  </div>`;
}

// ---------------------------------------------------------------------------
// Season standings: athlete progression matrix (ADR-0043).
// Rows = athletes, columns = events of the distance in date order, then
// Races / Best Time / Level-Division / Points / Rank. Standings stay bucketed
// by Performance Level + Gender: an athlete who scored in several levels gets
// one line per level, levels are never mixed into one fake total.
// The public matrix shows only final results, DNS and DSQ.
// ---------------------------------------------------------------------------

const PMAT_CSS = `<style>
.pmat-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:18px 0}
.pmat-controls input[type=search]{padding:10px 16px;border:1.5px solid var(--line);border-radius:999px;font-size:15px;min-width:240px}
.pmat-controls button{padding:10px 22px;font-size:15px}
.pmat-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff;box-shadow:0 6px 18px rgba(10,31,61,.05)}
table.pmat{min-width:max-content;border-collapse:separate;border-spacing:0}
table.pmat th,table.pmat td{padding:9px 12px;border-bottom:1px solid var(--line);font-size:14px;white-space:nowrap}
table.pmat thead th{background:var(--navy);color:#fff;font-size:12.5px;letter-spacing:.4px;text-align:left;position:sticky;top:0}
table.pmat th.sticky,table.pmat td.sticky{position:sticky;left:0;z-index:2;box-shadow:1px 0 0 var(--line)}
table.pmat td.sticky{background:#fff;font-weight:700}
table.pmat thead th.sticky{z-index:3}
table.pmat td.cell-final{font-weight:700}
.pmat-sub{display:block;font-weight:400;font-size:12px;color:var(--muted)}
.pmat-empty{color:var(--muted)}
.pmat-event-date{display:block;font-weight:400;font-size:11.5px;color:#c6d2e8}
.pmat-summary-lines span{display:block;padding:2px 0}
.pmat-pager{display:flex;gap:12px;align-items:center;justify-content:center;margin:22px 0 6px;font-size:15px}
.pmat-pager a{padding:8px 18px;border:1.5px solid var(--navy);border-radius:999px;color:var(--navy);text-decoration:none;font-weight:700}
.pmat-pager a:hover{background:var(--gold-soft)}
.pmat-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:14px 0 4px}
</style>`;

function matrixCellHtml(state: string, cell: { time: string | null; level: string | null; points: number | null }): string {
	if (state === "final") {
		return `<td class="cell-final">${esc(cell.time ?? "")}<span class="pmat-sub">${esc(cell.level ?? "")} · ${cell.points?.toLocaleString("en-US") ?? ""} pts</span></td>`;
	}
	if (state === "dns") return `<td><span class="badge soft">DNS</span></td>`;
	if (state === "dsq") return `<td><span class="badge">DSQ</span></td>`;
	return `<td><span class="pmat-empty">—</span></td>`;
}

function progressionMatrixHtml(matrix: PublicProgressionResult, baseParams: string): string {
	const events = matrix.events;
	const head = events
		.map((e) => `<th>${esc(e.event_name ?? "Race")}<span class="pmat-event-date">${esc(formatDate(e.event_date))}</span></th>`)
		.join("");
	const rows = matrix.rows
		.map((row) => {
			const cells = events
				.map((e) => matrixCellHtml(row.cells[String(e.event_id)]?.state ?? "empty", row.cells[String(e.event_id)] ?? { time: null, level: null, points: null }))
				.join("");
			const bucketLines = row.buckets.length > 0
				? row.buckets.map((b) => `<span>${esc(b.level)} · ${esc(b.gender)}</span>`).join("")
				: `<span class="pmat-empty">—</span>`;
			const pointsLines = row.buckets.length > 0
				? row.buckets.map((b) => `<span><strong>${b.points.toLocaleString("en-US")}</strong></span>`).join("")
				: `<span class="pmat-empty">—</span>`;
			const rankLines = row.buckets.length > 0
				? row.buckets.map((b) => `<span><strong>#${b.rank}</strong></span>`).join("")
				: `<span class="pmat-empty">—</span>`;
			return `<tr>
        <td class="sticky">${esc(row.name)}</td>
        ${cells}
        <td style="text-align:center"><strong>${row.races}</strong></td>
        <td>${esc(row.best_time ?? "—")}</td>
        <td><span class="pmat-summary-lines">${bucketLines}</span></td>
        <td><span class="pmat-summary-lines">${pointsLines}</span></td>
        <td><span class="pmat-summary-lines">${rankLines}</span></td>
      </tr>`;
		})
		.join("");
	const table = rows.length > 0
		? `<div class="pmat-scroll"><table class="results pmat"><thead><tr><th class="sticky">Athlete</th>${head}<th>Races</th><th>Best time</th><th>Level / Division</th><th>Points</th><th>Rank</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="pmat-legend">
        <span><span class="badge soft">DNS</span> registered, no result after the deadline</span>
        <span><span class="badge">DSQ</span> result disqualified by the federation</span>
        <span>Races counts verified finishes only</span>
      </div>`
		: emptyState("No athletes found for this search. Try a different name.");

	const buckets = matrix.buckets
		.map((bucket) => {
			const trs = bucket.entries
				.map((e) => `<tr><td><strong>${e.rank}</strong></td><td>${esc(e.name)}</td><td><strong>${e.points.toLocaleString("en-US")}</strong></td><td>${e.races}</td><td>${esc(e.best_time ?? "")}</td></tr>`)
				.join("");
			return `<div class="level-head"><h3>${esc(bucket.level)} · ${esc(bucket.gender)}</h3></div>
        <table class="results"><thead><tr><th>Rank</th><th>Athlete</th><th>Points</th><th>Races</th><th>Best time</th></tr></thead><tbody>${trs}</tbody></table>`;
		})
		.join("");

	return `${PMAT_CSS}${table}${buckets.length > 0 ? `<h2 style="margin-top:38px">Season standings by level and division</h2>${buckets}` : ""}`;
}

function progressionPagerHtml(matrix: PublicProgressionResult, baseParams: string): string {
	const { page, total_pages, total } = matrix.pagination;
	if (total_pages <= 1) return "";
	const prev = page > 1 ? `<a href="/results?${baseParams}&page=${page - 1}">← Previous</a>` : "";
	const next = page < total_pages ? `<a href="/results?${baseParams}&page=${page + 1}">Next →</a>` : "";
	return `<div class="pmat-pager">${prev}<span>Page ${page} of ${total_pages} · ${total.toLocaleString("en-US")} athletes</span>${next}</div>`;
}

export async function resultsPage(
	db: D1Database,
	distance: string | null,
	view: string | null,
	search: string | null,
	page: number,
): Promise<string> {
	const picked = (DISTANCES as readonly string[]).includes(distance ?? "") ? (distance as Distance) : null;
	const events = await getPastResults(db, picked ?? undefined, 40);
	const activeDistance = picked ?? (events[0]?.distance as Distance | undefined) ?? "10K";
	const standingsView = view === "standings";
	const shown = picked ? events : await getPastResults(db, activeDistance, 40);

	const tabs = DISTANCES.map((d) => `<a href="/results?${standingsView ? "view=standings&" : ""}distance=${d}" class="${d === activeDistance ? "active" : ""}">${d}</a>`).join("");
	const viewTabs = `
    <div class="tabs" style="margin-bottom:6px">
      <a href="/results?distance=${activeDistance}" class="${!standingsView ? "active" : ""}">Race results</a>
      <a href="/results?view=standings&distance=${activeDistance}" class="${standingsView ? "active" : ""}">Season standings</a>
    </div>`;

	let body: string;
	let explainer: string;
	if (standingsView) {
		const matrix = await getPublicProgression(db, activeDistance, {
			search: search ?? undefined,
			page,
		});
		explainer = `<div class="note"><strong>How standings work.</strong> Points are earned per race inside the performance level and division: 1000 for 1st in level, 999 for 2nd, and so on. Season points accumulate across races. When athletes tie on points, the faster approved result decides. Races counts verified finishes only.</div>`;
		if (!matrix || matrix.events.length === 0) {
			body = emptyState("No standings for this distance yet. As soon as verified races accumulate, the tables appear here.");
		} else {
			const safeSearch = esc(search ?? "");
			const baseParams = `view=standings&distance=${activeDistance}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
			const searchForm = `<form method="get" action="/results" class="pmat-controls" role="search">
          <input type="hidden" name="view" value="standings">
          <input type="hidden" name="distance" value="${esc(activeDistance)}">
          <input type="search" name="search" value="${safeSearch}" placeholder="Search athletes" aria-label="Search athletes">
          <button class="btn btn-navy" type="submit">Search</button>
          ${search ? `<a class="card-link" href="/results?view=standings&distance=${activeDistance}">Clear</a>` : ""}
        </form>`;
			body = searchForm + progressionMatrixHtml(matrix, baseParams) + progressionPagerHtml(matrix, baseParams);
		}
	} else {
		explainer = `<div class="note"><strong>Fair by design.</strong> Every finisher is placed in one of five performance levels by time, so a slower athlete wins their own level instead of finishing second behind the champion by minutes per kilometer. Thresholds are per distance and published with every result.</div>`;
		body = shown.length > 0
			? shown.map(eventResultsHtml).join("")
			: emptyState("No verified results for this distance yet. As soon as a race is verified, the full level tables appear here.");
	}

	const content = `
  <div class="page-head"><div class="wrap">
    <h1>Results and standings</h1>
    <p>Verified Series results, newest first. Every event shows all five performance levels, complete by structure, not by participation.</p>
  </div></div>
  <div class="section"><div class="wrap">
    ${viewTabs}
    <div class="tabs">${tabs}</div>
    ${explainer}
    ${body}
  </div></div>`;

	return layout(`Results ${activeDistance}`, "results", content, `Verified NWANA Series ${activeDistance} results by performance level.`);
}

export async function calendarPage(db: D1Database): Promise<string> {
	// Competition calendar only: the canonical public calendar (objects
	// created once in the Machine) plus the legacy race results table.
	// Challenges never appear here.
	const [upcoming, competition] = await Promise.all([
		getUpcoming(db, 80),
		getCompetitionCalendar(db, 80),
	]);
	const entries = mergeEntries(
		[
			upcoming.map(entryFromRaceEvent),
			competition.map((c) => entryFromCalendarItem(c, "NWANA competition")),
		],
		160,
	);

	let body: string;
	if (entries.length === 0) {
		body = emptyState("No upcoming races are scheduled right now. The Series runs weekly, so check back soon.");
	} else {
		body = calMonthSections(entries);
	}

	const content = `
  <div class="page-head"><div class="wrap">
    <h1>Competition calendar</h1>
    <p>Every upcoming NWANA competition: Series races, championships, and competition events. Challenges have their own calendar.</p>
  </div></div>
  <div class="section"><div class="wrap">${body}</div></div>`;

	return layout("Competition Calendar", "calendar", content, "Upcoming NWANA Nordic walking competitions. Register and race.");
}

export async function challengesPage(db: D1Database): Promise<string> {
	// Challenges calendar only: never mixes with competitions.
	const challenges = await getChallengeCalendar(db, 80);
	const entries = mergeEntries(
		[challenges.map((c) => entryFromCalendarItem(c, "NWANA challenge"))],
		80,
	);

	let body: string;
	if (entries.length === 0) {
		body = emptyState("No challenges are open right now. Check back soon, new challenges are announced regularly.");
	} else {
		body = calMonthSections(entries);
	}

	const content = `
  <div class="page-head"><div class="wrap">
    <h1>Challenges</h1>
    <p>NWANA challenges: personal and team challenges that take you deeper into Nordic walking. Separate from the competition calendar, which lists races and championships only.</p>
  </div></div>
  <div class="section"><div class="wrap">${body}</div></div>`;

	return layout("Challenges", "challenges", content, "NWANA Nordic walking challenges. Personal and team challenges, separate from the competition calendar.");
}

export async function seriesPage(db: D1Database): Promise<string> {
	const seriesList = await getCompetitionSeries(db, 40);

	let body: string;
	if (seriesList.length === 0) {
		body = emptyState("Series and championship pages are being prepared. Check back soon.");
	} else {
		const sections = await Promise.all(
			seriesList.map(async (s) => {
				const rows = await getCalendarForSeries(db, s.object_id);
				const rowsHtml = rows.length
					? `<div class="cal-list">${rows.map((r) => `
              <div class="cal-row">
                <div class="cal-info">
                  <div class="t">${esc(r.title)}</div>
                  <div class="s">${esc(weekdayOf(r.event_date))}, ${esc(formatDate(r.event_date))}</div>
                </div>
                ${r.url ? `<a class="btn btn-navy" href="${esc(r.url)}">Register</a>` : ""}
              </div>`).join("")}</div>`
					: `<p class="meta">Events are being scheduled.</p>`;
				return `<div class="card" style="margin-bottom:24px">
          <div class="kicker">${esc(s.object_type === "championship" ? "Championship" : "Series")}</div>
          <h2>${esc(s.title)}</h2>
          ${rowsHtml}
        </div>`;
			}),
		);
		body = sections.join("");
	}

	const content = `
  <div class="page-head"><div class="wrap">
    <h1>Series &amp; Championships</h1>
    <p>NWANA competition properties: series and championships, with their upcoming events. Created once in NWANA Machine, shown here automatically.</p>
  </div></div>
  <div class="section"><div class="wrap">${body}</div></div>`;

	return layout("Series & Championships", "series", content, "NWANA series and championships with upcoming competition events.");
}

export async function winnersPage(db: D1Database): Promise<string> {
	const events = await getPastResults(db, undefined, 8);
	const withWinners = events.filter((e) => winnersOf(e).length > 0);

	const body = withWinners.length > 0
		? withWinners.map((event) => {
			const names = [...new Set(winnersOf(event).map((w) => w.athlete).filter(Boolean))];
			const headline = names.length === 1
				? `Congratulations to ${names[0]}!`
				: names.length > 1
					? `Congratulations to ${names.join(", ")}!`
					: "Congratulations to all finishers!";
			const lines = winnersOf(event)
				.map((w) => `<div class="winner-line"><span class="lvl">${esc(levelNameOf(w))} · ${esc(genderLabel(w.gender))}</span><span class="who"><strong>${esc(w.athlete)}</strong>${w.time ? `, ${esc(w.time)}` : ""}${w.series_record ? ` <span class="record-tag">Series record</span>` : ""}</span></div>`)
				.join("");
			return `<div class="congrats">
          <h3>${esc(headline)}</h3>
          <p style="color:var(--muted);font-size:14px;margin:0 0 10px">${esc(event.event_name ?? "")} · ${esc(formatDate(event.event_date))}</p>
          ${lines}
        </div>`;
		}).join("")
		: emptyState("Winner congratulations will appear here after the next verified race.");

	const content = `
  <div class="page-head"><div class="wrap">
    <h1>Winner congratulations</h1>
    <p>In NWANA every performance level has its own podium. Here we celebrate the level winners of recent races.</p>
  </div></div>
  <div class="section"><div class="wrap">${body}</div></div>`;

	return layout("Winner Congratulations", "winners", content, "Congratulations to recent NWANA Series level winners.");
}

function newsExcerpt(html: string, max = 200): string {
	const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
	return text.length > max ? text.slice(0, max).trimEnd() + "..." : text;
}

export async function newsPage(db: D1Database): Promise<string> {
	const items = await getNews(db, 30);
	const body = items.length > 0
		? `<div class="grid cols-3">${items.map((n) => `
        <a class="card news-card" href="/news/${esc(n.slug)}">
          <div class="meta">${esc(formatDate(n.published_at))} ${n.kind === "winner_announcement" ? `<span class="badge gold" style="margin-left:8px">Winners</span>` : `<span class="badge soft" style="margin-left:8px">News</span>`}</div>
          <h3>${esc(n.title)}</h3>
          <p style="font-size:14.5px;color:var(--muted)">${esc(newsExcerpt(n.body_html))}</p>
        </a>`).join("")}</div>`
		: emptyState("The federation newsroom opens soon. Race reports, winner announcements, and federation updates will be published here as they happen.");

	const content = `
  <div class="page-head"><div class="wrap">
    <h1>News</h1>
    <p>Race reports, winner announcements, and federation updates, published as they happen.</p>
  </div></div>
  <div class="section"><div class="wrap">${body}</div></div>`;

	return layout("News", "news", content, "NWANA federation news: race reports, winner announcements, and updates.");
}

export async function newsArticlePage(db: D1Database, slug: string): Promise<string | null> {
	const item = await getNewsItem(db, slug);
	if (!item) return null;
	const content = `
  <div class="page-head"><div class="wrap">
    <div class="meta" style="color:var(--gold-2);font-size:14px;margin-bottom:10px">${esc(formatDate(item.published_at))} ${item.kind === "winner_announcement" ? `<span class="badge gold" style="margin-left:8px">Winner announcement</span>` : ""}</div>
    <h1>${esc(item.title)}</h1>
  </div></div>
  <div class="section"><div class="wrap">
    <article class="article"><div class="body">${item.body_html}</div>
    <p style="margin-top:30px"><a class="card-link" href="/news">← All news</a></p></article>
  </div></div>`;
	return layout(item.title, "news", content, item.title);
}

export async function sellersPage(): Promise<string> {
	const inventory = [
		{ t: "Series 2027 naming and series partnerships", d: "Four seasonal virtual race series, about two races per week year round. Title and presenting partnerships with category exclusivity options, brand presence across all race communications, results pages, and standings." },
		{ t: "Distance partnerships", d: "1K, 3K, 5K, 10K, 15K, 20K. Official Distance Partner designation for one distance across the season, with branding on distance-specific results and communications." },
		{ t: "Free challenges", d: "About 15 planned challenges in virtual, monthly, and team formats. Presenting partnerships at the top of the participation funnel, the first touch with new audiences entering the NWANA system." },
		{ t: "U.S. and Continental Championships", d: "Live flagship events planned for 2027 to 2028. Founding championship partner positions with on-site brand presence, naming rights, and hospitality as the events launch." },
		{ t: "Academy", d: "Education ladder from a free intro course through instructor, coach, and judge certification to professional license. Education partner designation with reach into instructor, coach, and organizer communities." },
		{ t: "NW Groups network", d: "Local groups licensing community, employer, school, healthcare, parks, fitness, military, and municipal audiences. Community-level brand presence replicated city by city as the network grows." },
		{ t: "Licenses", d: "Recurring annual licenses that keep participants inside the NWANA system. Sustained brand visibility to a renewing licensed base, a membership-style asset." },
		{ t: "Results, rankings, Winners Circle", d: "Official results, standings, rankings, and the emerging elite athlete roster. Credibility and media value, athlete storytelling, and athlete sponsorship pathways." },
		{ t: "Prize partnerships", d: "In-kind product and digital prizes supplied by partners for series and challenge winners. Product trial and sampling with an active participant base; digital engagement through prize codes and offers." },
		{ t: "Media and digital assets", d: "Press kit, media contacts, safe sport and anti-doping credibility materials, volunteer network, and Google Ad Grant traffic driving search visitors to NWANA pages where partners are featured." },
		{ t: "Funds and donor campaigns", d: "Donation campaigns including the Instructor Growth Fund, which converts donations into academy credits and new instructors. Social impact association with workforce development in sport." },
	];
	const cards = inventory.map((a) => `<div class="card"><h3>${esc(a.t)}</h3><p>${esc(a.d)}</p></div>`).join("");

	const content = `
  <div class="page-head"><div class="wrap">
    <div class="kicker">For sponsorship sellers</div>
    <h1>Sell the inventory of a continental sport</h1>
    <p>NWANA is the governing body for Nordic walking across North America, and its commercial inventory spans the whole sport system: competitions, education, community groups, licenses, media, and funds. We are looking for sellers who want to take that inventory to market.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">The inventory</div>
    <h2>Eleven asset groups, one system</h2>
    <p>Every NWANA object feeds the next: the Series leads participants to results and rankings, the Academy leads students to certification and group creation, groups lead to programs and events. Each new group, event, and championship adds new inventory. Renewal and cross-sell are built into the model, so the book of business compounds instead of resetting.</p>
    <div class="grid cols-3" style="margin-top:22px">${cards}</div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">How we work with sellers</div>
    <h2>Commercial terms, stated plainly</h2>
    <div class="grid cols-3">
      <div class="card"><h3>Commission</h3><p>We offer market-rate commissions, with enhanced rates for founding partnerships closed in the first year. We are open to retainer-plus-commission structures. Specific numbers are negotiated per deal, not dictated in outreach.</p></div>
      <div class="card"><h3>Exclusivity</h3><p>All intermediary activity is coordinated through an exclusive seller, with no parallel approaches without agreement. Exclusivity is granted against minimum sales commitments, performance milestones, and termination rights.</p></div>
      <div class="card"><h3>Real products</h3><p>What you sell exists. Series 2026 is live now, Series 2027 is a built pipeline, and the Academy and group licensing are operating systems, not slideware. You never have to invent what the federation delivers.</p></div>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Reference pricing</div>
    <h2>Where the 2026 grid stood</h2>
    <p>For orientation: Founding Series Partner $25,000, Premier Series Partner $10,000, Official Series Partner $5,000, Official Distance Partner $3,000 per distance, prize partnerships in kind. These terms cover the 2026 Series only. Series 2027 inventory and pricing are finalized with the sales partner, so founding partners of 2027 help shape the packages they buy into.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Next step</div>
    <h2>Start the conversation</h2>
    <p>Seller interest is reviewed by the NWANA partnerships office. Write a few lines about who you are, what categories you open, and what you have sold before.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Seller%20interest%3A%20NWANA%20sponsorship%20inventory">Contact the partnerships office</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="/about">About NWANA</a>
    </div>
  </div></div>`;

	return layout("For Sellers", "sellers", content, "Sell NWANA sponsorship inventory: series partnerships, championships, academy, groups network, and eleven asset groups across a continental sport system.");
}
