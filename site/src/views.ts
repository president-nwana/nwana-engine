// Shared HTML layout, design system, navigation and footer for nwana-site.
// All copy is English. No em-dashes anywhere in user-facing strings.

export const DONATE_URL =
	"https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT";

export interface NetworkLink {
	label: string;
	url: string;
	note?: string;
}

export const NETWORK_LINKS: NetworkLink[] = [
	{ label: "Series 2026 Hub", url: "https://series.nwaofna.org", note: "Weekly races, standings" },
	{ label: "Race Registration", url: "https://sport.nwaofna.org", note: "Enter a race" },
	{ label: "Tickets and Fundraising", url: "https://ticketsignup.io/w/nwaofna", note: "Support the mission" },
	{ label: "NWANA Academy", url: "https://academy.nwaofna.org", note: "Learn and get certified" },
	{ label: "NWANA Health", url: "https://nwaofna.com", note: "Health and science" },
	{ label: "Federation Home", url: "https://federation.nwaofna.org", note: "Launching soon" },
];

export function esc(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

export function formatDate(iso: string | null): string {
	if (!iso) return "Date to be announced";
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	if (!match) return iso;
	const [, y, m, d] = match;
	return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export function weekdayOf(iso: string | null): string {
	if (!iso) return "";
	const date = new Date(`${iso}T12:00:00Z`);
	if (Number.isNaN(date.getTime())) return "";
	return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()];
}

const CSS = `
:root{
  --navy:#0a1f3d; --navy-2:#10294f; --navy-3:#0d2547;
  --gold:#c9a227; --gold-2:#e6c65c; --gold-soft:#f5ead0;
  --paper:#faf8f4; --card:#ffffff; --ink:#1b2432; --muted:#5d6b7f;
  --line:#e7e0d2; --radius:14px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--paper);line-height:1.6}
h1,h2,h3,.serif{font-family:Georgia,"Times New Roman",serif;color:var(--navy);line-height:1.2;margin:0 0 .5em}
a{color:var(--navy-2)}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
/* header */
.topbar{background:var(--navy);color:#dfe6f2;font-size:13px}
.topbar .wrap{display:flex;justify-content:space-between;align-items:center;padding-top:7px;padding-bottom:7px;gap:12px;flex-wrap:wrap}
.topbar a{color:#dfe6f2;text-decoration:none;margin-left:14px}
.topbar a:hover{color:var(--gold-2)}
.topbar .nonprofit{color:#fff;font-weight:700}
.sitehead{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:50}
.sitehead .wrap{display:flex;align-items:center;gap:26px;padding-top:12px;padding-bottom:12px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none}
.brand-logo{width:48px;height:48px;border-radius:50%;object-fit:cover;flex:none;box-shadow:0 2px 8px rgba(10,31,61,.18)}
.brand-name{font-family:Georgia,serif;font-size:22px;color:var(--navy);font-weight:bold;letter-spacing:.5px;line-height:1.1}
.brand-sub{font-size:11px;color:var(--muted);letter-spacing:.4px}
.footer-logo{width:76px;height:76px;border-radius:50%;object-fit:cover;margin-bottom:14px;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.mainnav{margin-left:auto;display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.mainnav a{padding:9px 13px;border-radius:9px;text-decoration:none;color:var(--navy);font-weight:600;font-size:15px}
.mainnav a:hover{background:var(--gold-soft)}
.mainnav a.active{background:var(--navy);color:#fff}
.dropdown{position:relative}
.dropdown>button{background:none;border:0;padding:9px 13px;border-radius:9px;color:var(--navy);font-weight:600;font-size:15px;cursor:pointer;font-family:inherit}
.dropdown>button:hover{background:var(--gold-soft)}
.dropdown>button.active{background:var(--navy);color:#fff}
.dropdown-menu{display:none;position:absolute;right:0;top:110%;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 40px rgba(10,31,61,.16);min-width:280px;padding:8px;z-index:60}
.dropdown:hover .dropdown-menu,.dropdown:focus-within .dropdown-menu{display:block}
.dropdown-menu a{display:block;padding:10px 12px;border-radius:8px;text-decoration:none}
.dropdown-menu a:hover{background:var(--gold-soft)}
.dropdown-menu .dl{font-weight:700;color:var(--navy);font-size:14px}
.dropdown-menu .dn{font-size:12px;color:var(--muted)}
/* hero */
.hero{background:radial-gradient(1200px 500px at 80% -10%,#1d3a6b 0%,var(--navy) 55%,#071627 100%);color:#fff;padding:76px 0 70px;position:relative;overflow:hidden}
.hero:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(115deg,transparent 0 46px,rgba(201,162,39,.05) 46px 48px);pointer-events:none}
.hero .wrap{position:relative;z-index:1}
.eyebrow{display:inline-block;color:var(--gold-2);letter-spacing:2.5px;text-transform:uppercase;font-size:12.5px;font-weight:700;margin-bottom:16px}
.hero h1{color:#fff;font-size:clamp(34px,5.2vw,58px);max-width:16em;margin-bottom:18px}
.hero h1 .gold{color:var(--gold-2)}
.hero p.lead{font-size:clamp(16px,2vw,20px);color:#cfd9ec;max-width:44em;margin:0 0 30px}
.cta-row{display:flex;gap:14px;flex-wrap:wrap}
.btn{display:inline-block;padding:13px 26px;border-radius:999px;font-weight:700;text-decoration:none;font-size:16px;transition:transform .12s ease,box-shadow .12s ease}
.btn:hover{transform:translateY(-1px)}
.btn-gold{background:var(--gold);color:#1a1405;box-shadow:0 8px 22px rgba(201,162,39,.35)}
.btn-gold:hover{background:var(--gold-2)}
.btn-outline{border:2px solid rgba(255,255,255,.55);color:#fff}
.btn-outline:hover{border-color:#fff;background:rgba(255,255,255,.08)}
.btn-navy{background:var(--navy);color:#fff}
.btn-navy:hover{background:var(--navy-2)}
/* stats */
.stats{background:var(--navy-3);color:#fff;margin-top:-1px}
.stats .wrap{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding-top:26px;padding-bottom:26px}
.stat{text-align:center;padding:6px}
.stat .n{font-family:Georgia,serif;font-size:34px;color:var(--gold-2);font-weight:bold}
.stat .l{font-size:13px;color:#aeb9d2;letter-spacing:.4px}
/* sections */
.section{padding:56px 0}
.section.alt{background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.kicker{color:#8a6d1c;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-size:12px;margin-bottom:10px}
.section h2{font-size:clamp(26px,3.4vw,36px);margin-bottom:14px}
.section p{color:#33404f;max-width:62em}
.grid{display:grid;gap:18px}
.grid.cols-3{grid-template-columns:repeat(3,1fr)}
.grid.cols-2{grid-template-columns:repeat(2,1fr)}
.grid.cols-4{grid-template-columns:repeat(4,1fr)}
@media(max-width:1100px){.grid.cols-4{grid-template-columns:repeat(2,1fr)}}
@media(max-width:820px){.grid.cols-3,.grid.cols-2{grid-template-columns:1fr}.grid.cols-4{grid-template-columns:1fr}.stats .wrap{grid-template-columns:repeat(2,1fr)}}
.board-photo{width:96px;height:96px;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;margin-bottom:14px;border:3px solid var(--gold-2);overflow:hidden}
.board-photo img{width:100%;height:100%;object-fit:cover;display:block;flex:none}
.board-card h3{margin:0 0 4px}
.board-card .role{color:var(--navy);font-weight:700;margin:0 0 10px}
.board-card .email{font-size:14px;word-break:break-all}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;box-shadow:0 6px 18px rgba(10,31,61,.05)}
.card h3{font-size:20px;margin-bottom:8px}
.card .meta{font-size:13px;color:var(--muted);margin-bottom:10px}
.badge{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.6px;padding:4px 11px;border-radius:999px;background:var(--navy);color:#fff;text-transform:uppercase}
.badge.gold{background:var(--gold);color:#1a1405}
.badge.soft{background:var(--gold-soft);color:#7a5f14}
.card-link{color:var(--navy);font-weight:700;text-decoration:none}
.card-link:hover{text-decoration:underline}
/* tables */
table.results{width:100%;border-collapse:collapse;font-size:15px;background:#fff}
table.results th{text-align:left;padding:10px 12px;background:var(--navy);color:#fff;font-weight:600;font-size:13px;letter-spacing:.4px}
table.results td{padding:10px 12px;border-bottom:1px solid var(--line)}
table.results tr:last-child td{border-bottom:0}
.level-head{display:flex;align-items:center;gap:12px;margin:26px 0 10px;flex-wrap:wrap}
.level-head h3{margin:0;font-size:21px}
.threshold{font-size:12.5px;font-weight:700;color:#7a5f14;background:var(--gold-soft);padding:4px 12px;border-radius:999px}
.record-tag{font-size:11.5px;font-weight:800;color:#1a1405;background:var(--gold-2);padding:3px 10px;border-radius:999px;letter-spacing:.4px;text-transform:uppercase}
.empty-level{background:#fff;border:1px dashed #c9bfa8;border-radius:10px;padding:16px 18px;color:var(--muted);font-style:italic}
.event-card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:26px;margin-bottom:28px;box-shadow:0 6px 18px rgba(10,31,61,.05)}
.event-card .event-title{font-size:23px;margin-bottom:4px}
.event-card .event-meta{color:var(--muted);font-size:14px;margin-bottom:6px}
/* calendar */
.month{font-family:Georgia,serif;font-size:24px;color:var(--navy);margin:34px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--gold)}
.cal-row{display:flex;gap:18px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-bottom:12px}
.cal-date{min-width:64px;text-align:center}
.cal-date .d{font-family:Georgia,serif;font-size:30px;color:var(--navy);line-height:1}
.cal-date .m{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}
.cal-info{flex:1}
.cal-info .t{font-weight:700;color:var(--navy);font-size:16px}
.cal-info .s{font-size:13px;color:var(--muted)}
/* news */
.news-card{display:block;text-decoration:none;color:inherit}
.news-card:hover{border-color:var(--gold)}
.article{max-width:760px;margin:0 auto}
.article .body{font-size:17.5px;color:#2a3542}
.article .body p{margin:0 0 1.1em}
.article .body ul{margin:0 0 1.1em;padding-left:1.4em}
.article .body h2,.article .body h3{margin:1.4em 0 .5em}
/* winners */
.congrats{background:linear-gradient(135deg,#fffdf6,#fbf3df);border:1px solid var(--gold);border-radius:var(--radius);padding:26px;margin-bottom:26px}
.congrats h3{margin-bottom:6px}
.winner-line{display:flex;gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line);font-size:15.5px}
.winner-line:last-child{border-bottom:0}
.winner-line .lvl{font-weight:700;color:var(--navy);min-width:170px}
.winner-line .who{flex:1}
/* footer */
footer{background:var(--navy);color:#c6d2e8;margin-top:0}
footer .wrap{display:grid;grid-template-columns:1.25fr 1fr 1fr 1fr 1fr;gap:30px;padding-top:44px;padding-bottom:30px}
@media(max-width:1100px){footer .wrap{grid-template-columns:1fr 1fr}}
@media(max-width:820px){footer .wrap{grid-template-columns:1fr}}
.donate-band{background:linear-gradient(120deg,var(--navy) 0%,var(--navy-3) 100%);color:#fff;padding:44px 0}
.donate-band .wrap{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}
.donate-band h2{color:#fff;margin:0 0 6px;font-size:clamp(22px,3vw,30px)}
.donate-band .kicker{color:var(--gold-2);margin-bottom:8px}
footer h4{color:#fff;font-size:14px;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 14px}
footer a{color:#c6d2e8;text-decoration:none;font-size:14.5px;display:block;padding:3px 0}
footer a:hover{color:var(--gold-2)}
footer p{font-size:14px;color:#9fb0cc}
.copyright{border-top:1px solid rgba(255,255,255,.12);padding:16px 0;font-size:12.5px;color:#8a99b8}
.copyright .wrap{display:block;padding-top:0;padding-bottom:0}
.note{background:#fff8e6;border:1px solid #e8d9a8;border-radius:10px;padding:14px 18px;font-size:14px;color:#6b5518;margin:18px 0}
/* faq accordion */
.faq details{background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:10px;padding:16px 20px}
.faq summary{cursor:pointer;font-weight:700;color:var(--navy);font-size:16.5px}
.faq summary:hover{color:var(--navy-2)}
.faq details[open] summary{margin-bottom:10px}
.faq details p{margin:0 0 .8em;color:#33404f;max-width:70em}
.page-head{background:var(--navy);color:#fff;padding:44px 0 38px}
.page-head h1{color:#fff;font-size:clamp(30px,4vw,44px);margin-bottom:8px}
.page-head p{color:#b9c6e2;margin:0;max-width:60em;font-size:17px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:26px 0}
.tabs a{padding:9px 18px;border-radius:999px;border:1.5px solid var(--navy);color:var(--navy);text-decoration:none;font-weight:700;font-size:14.5px}
.tabs a:hover{background:var(--gold-soft)}
.tabs a.active{background:var(--navy);color:#fff}
`;

function networkMenu(): string {
	const items = NETWORK_LINKS.map(
		(l) => `<a href="${esc(l.url)}"><span class="dl">${esc(l.label)}</span><br><span class="dn">${esc(l.note ?? "")}</span></a>`,
	).join("");
	return `<div class="dropdown"><button type="button" aria-haspopup="true">Network ▾</button><div class="dropdown-menu">${items}</div></div>`;
}

export function header(active: string): string {
	const link = (href: string, label: string, key: string) =>
		`<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`;
	const drop = (label: string, keys: string[], items: { href: string; l: string; n: string }[]) =>
		`<div class="dropdown"><button type="button" aria-haspopup="true" class="${keys.includes(active) ? "active" : ""}">${label} ▾</button><div class="dropdown-menu">${
			items.map((i) => `<a href="${i.href}"${i.href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}><span class="dl">${esc(i.l)}</span><br><span class="dn">${esc(i.n)}</span></a>`).join("")
		}</div></div>`;
	const nav = [
		link("/", "Home", "home"),
		link("/about", "About", "about"),
		link("/elite", "Elite Athletes", "elite"),
		drop("Compete", ["results", "calendar", "winners"], [
			{ href: "/results", l: "Results", n: "Verified results and standings" },
			{ href: "/calendar", l: "Calendar", n: "Upcoming Series races" },
			{ href: "/winners", l: "Winners", n: "Congratulations to level winners" },
		]),
		drop("Learn", ["choose-your-path", "events"], [
			{ href: "https://academy.nwaofna.org", l: "Academy", n: "Learn and get certified" },
			{ href: "/choose-your-path", l: "Choose Your Path", n: "Find your role in NWANA" },
			{ href: "/events", l: "Events", n: "Forums, clinics, fundraisers, gatherings" },
		]),
		drop("Get Involved", ["support", "ways-to-give", "sponsors", "partners", "groups", "contact", "sellers"], [
			{ href: "/support", l: "Support / Funds", n: "Donations and fundraising" },
			{ href: "/ways-to-give", l: "Ways to Give", n: "DAF, checks, matching gifts" },
			{ href: "/sponsors", l: "Sponsors", n: "Sponsor the growth of the sport" },
			{ href: "/partners", l: "Partners", n: "Partner Network and collaboration" },
			{ href: "/groups", l: "Umbrella NW Groups", n: "Organize groups under one structure" },
			{ href: "/sellers", l: "For Sellers", n: "Sell the sponsorship inventory" },
			{ href: "/contact", l: "Contact", n: "Reach the federation office" },
		]),
		link("/news", "News", "news"),
	].join("");
	return `
<div class="topbar"><div class="wrap">
  <span class="nonprofit">NWANA is a 501(c)(3) nonprofit public charity. EIN 33-2444142.</span>
  <span><a href="${DONATE_URL}">Donate</a><a href="https://academy.nwaofna.org">Academy</a></span>
</div></div>
<header class="sitehead"><div class="wrap">
  <a class="brand" href="/"><img class="brand-logo" src="/logo.jpg" alt="NWANA, Nordic Walking Association of North America, logo"><span><span class="brand-name">NWANA</span><br><span class="brand-sub">Nordic Walking Association of North America</span></span></a>
  <nav class="mainnav">${nav}${networkMenu()}</nav>
</div></header>`;
}

export function footer(): string {
	return `
<div class="donate-band"><div class="wrap">
  <div><div class="kicker" style="color:var(--gold-2)">Support the mission</div><h2>Help build Nordic walking across North America</h2><p style="color:#cfd9ec;margin:6px 0 0">Your donation trains instructors, grows local groups, and powers verified competitions.</p></div>
  <a class="btn btn-gold" href="${DONATE_URL}">Donate to NWANA</a>
</div></div>
<footer><div class="wrap">
  <div>
    <img class="footer-logo" src="/logo.jpg" alt="NWANA logo">
    <h4>NWANA</h4>
    <p>The Nordic Walking Association of North America is building Nordic walking as a continental sport: weekly verified competitions, fair performance levels, instructor education, and a path from a first kilometer to the world stage.</p>
    <p>A 501(c)(3) public charity. Contributions are tax-deductible.</p>
    <a aria-label="Nordic Walking Association of North America Inc NWANA" href="https://app.candid.org/profile/16510915/nordic-walking-association-of-north-america-inc-nwana-33-2444142/?pkId=31facfb4-fd0b-404a-9f53-147e33297404" target="_blank" rel="noopener" style="display:inline-block;margin-top:12px"><img alt="Candid transparency seal" src="https://widgets.guidestar.org/prod/v1/pdp/transparency-seal/16510915/svg" style="max-width:150px"></a>
  </div>
  <div>
    <h4>Governance</h4>
    <a href="/governance">Governance & Policies</a>
    <a href="/privacy">Privacy Policy</a>
    <a href="/terms">Terms of Use</a>
    <a href="/terms-conditions">Terms & Conditions</a>
    <a href="/code-of-conduct">Code of Conduct</a>
    <a href="/safesport">SafeSport</a>
    <a href="/anti-doping">Anti-Doping</a>
    <a href="/safety">Safety Standards</a>
  </div>
  <div>
    <h4>Media & Resources</h4>
    <a href="/press">Press Kit</a>
    <a href="/brand">Logos & Brand Assets</a>
    <a href="/media-contact">Media & Partner Contact</a>
    <a href="/documents">Downloads & Reports</a>
    <a href="/forms">Forms</a>
    <a href="/faq">FAQ</a>
  </div>
  <div>
    <h4>Support</h4>
    <a href="/support">Support / Funds</a>
    <a href="/ways-to-give">Ways to Give</a>
    <a href="/sponsors">Sponsors</a>
    <a href="/partners">Partners</a>
    <a href="/groups">Umbrella NW Groups</a>
    <a href="/sellers">For Sellers</a>
  </div>
  <div>
    <h4>Contact</h4>
    <a href="/contact">Contact page</a>
    <a href="/faq">FAQ</a>
    <a href="mailto:info@nwaofna.org">info@nwaofna.org</a>
    <a href="/news">News</a>
    <a href="/calendar">Race calendar</a>
  </div>
</div></footer>
<div class="copyright"><div class="wrap">© ${new Date().getFullYear()} Nordic Walking Association of North America, Inc. All rights reserved.</div></div>`;
}

export function layout(title: string, active: string, content: string, description?: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | NWANA</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
<style>${CSS}</style>
</head>
<body>
${header(active)}
<main>${content}</main>
${footer()}
</body>
</html>`;
}

export function emptyState(text: string): string {
	return `<div class="empty-level">${esc(text)}</div>`;
}
