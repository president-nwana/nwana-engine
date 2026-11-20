// Page renderers for migrated old-site content.
// Source of truth: ~/workspace/nwana-site/content-extraction.txt (2026-09-22).
// Legal pages are copied VERBATIM from the extraction (no paraphrase).
// All copy is English. No em-dashes anywhere in user-facing strings.

import { DONATE_URL, esc, layout } from "./views";

function mailto(subject: string, label = "Email NWANA"): string {
	return `<a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=${encodeURIComponent(subject)}">${esc(label)}</a>`;
}

function contactCard(subject: string, intro?: string): string {
	return `<div class="card"><h3>Contact NWANA</h3>${
		intro ? `<p>${esc(intro)}</p>` : ""
	}<p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> ${esc(subject)}</p><p>${mailto(subject, "Compose your email")}</p></div>`;
}

function legalSection(num: number | string, title: string, body: string): string {
	return `<div class="card" style="margin-bottom:16px"><h3>${esc(num)}. ${esc(title)}</h3><p>${esc(body)}</p></div>`;
}

function effectiveDate(date: string): string {
	return `<p style="color:var(--muted);font-size:15px;margin-bottom:22px"><strong>Effective Date:</strong> ${esc(date)}</p>`;
}

function bullets(items: string[]): string {
	return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

function pageHead(kicker: string, title: string, lead: string): string {
	return `<div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(lead)}</p></div></div>`;
}

// ---------------- 1. /sponsors ----------------

export async function sponsorsPage(): Promise<string> {
	const programs = [
		{ t: "National Sponsor", d: "Support NWANA's overall growth and receive visibility across the organization, programs, communications, websites, events, and public initiatives." },
		{ t: "Sport Development Sponsor", d: "Support competitions, rankings, teams, RaceDay infrastructure, event systems, and future championship pathways." },
		{ t: "Instructor Growth Sponsor", d: "Support the development of trained instructors and coaches through NWANA Academy course credits, training pathways, and license programs." },
		{ t: "Community Program Sponsor", d: "Support local groups, public activity programs, beginner access, youth programs, senior programs, family programs, and community outreach." },
		{ t: "Challenge / Series Sponsor", d: "Support virtual challenges, monthly series, team competitions, city rankings, club rankings, and future event series." },
		{ t: "Health & Wellness Sponsor", d: "Support programs connected to active lifestyle, movement, wellness, active aging, and accessible outdoor activity." },
		{ t: "Youth & Family Sponsor", d: "Support youth participation, family activity, school programs, beginner pathways, and safe entry into Nordic Walking." },
		{ t: "Event Sponsor", d: "Support individual events, clinics, competitions, demos, awards, race materials, participant experience, or event operations." },
	];
	const content = `
  ${pageHead("Sponsors", "Sponsor the growth of Nordic Walking in North America", "Nordic Walking is one of the most underdeveloped sport and wellness opportunities in North America. That is exactly why the sponsorship window is open now. NWANA is building the structure around a movement that already has global recognition: events, challenges, instructor education, licenses, teams, local groups, results, rankings, community programs, and future competition pathways. Sponsors who come in early are not just buying visibility. They are helping build the category.")}
  <div class="section"><div class="wrap">
    <div class="kicker">Why sponsor NWANA</div>
    <h2>More than a logo on an event</h2>
    <p>Most sponsorships place a logo on an existing event. NWANA offers something different: the opportunity to support the growth of an entire movement while it is still being built. Nordic Walking connects multiple powerful audiences:</p>
    ${bullets(["active adults", "seniors and active aging communities", "families", "beginners returning to movement", "athletes and endurance participants", "health and wellness programs", "parks and recreation communities", "corporate wellness teams", "schools and universities", "local clubs and groups", "donors and community supporters", "future competitors and teams"])}
    <p>A NWANA sponsor can be visible across education, events, challenges, teams, fundraising, community programs, sport development, wellness initiatives, and public outreach.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">What makes NWANA valuable</div>
    <h2>A rare combination for sponsors</h2>
    <p>Nordic Walking is simple, accessible, outdoor, low-cost, social, and scalable. It does not require expensive facilities. It can happen in parks, neighborhoods, schools, trails, workplaces, senior centers, campuses, and community spaces. That gives sponsors a rare combination:</p>
    ${bullets(["sport visibility", "wellness relevance", "community impact", "active aging connection", "family-friendly positioning", "local and national growth potential", "public benefit alignment", "measurable participation", "strong storytelling", "room to become an early category leader"])}
    <p>NWANA is building the platform that can connect these pieces into one recognizable North American system.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Sponsor the foundation</div>
    <h2>What sponsorship can support</h2>
    <p>NWANA is building the foundation for Nordic Walking in North America. Sponsorship can support:</p>
    ${bullets(["instructor and coach education", "NWANA Academy course development", "license and certification pathways", "local groups and clubs", "weekly and monthly challenges", "competition series", "youth and family programs", "senior and active aging programs", "adaptive and inclusive programs", "health and wellness initiatives", "RaceDay, timing, results, and ranking systems", "safety and policy development", "media and public awareness", "community access programs", "future regional and national events"])}
    <p>Every sponsor helps NWANA move from scattered interest to organized growth.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Sponsorship opportunities</div>
    <h2>Eight sponsorship programs</h2>
    <div class="grid cols-3" style="margin-top:22px">${programs.map((p) => `<div class="card"><h3>${esc(p.t)}</h3><p>${esc(p.d)}</p></div>`).join("")}</div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Visibility</div>
    <h2>Visibility for sponsors</h2>
    <p>Depending on level and program fit, visibility may include:</p>
    ${bullets(["website placement", "event page placement", "challenge page placement", "donation campaign visibility", "sponsor recognition in emails", "social media recognition", "event announcements", "team or challenge recognition", "program page placement", "race or competition visibility", "sponsor messages in participant communications", "recognition in reports or impact updates", "logo placement where appropriate", "custom campaign alignment"])}
    <p>NWANA will work with sponsors to match visibility with the right audience, program, geography, and level of support.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">The difference</div>
    <h2>More than a logo</h2>
    <p>The best NWANA sponsorships are not just logo placements. They are stories. A company can help train instructors. A brand can help launch local groups. An employer can support employee wellness teams. A donor can help build youth access. A sponsor can help create competition infrastructure. A community organization can help bring Nordic Walking to a city, school, trail, or senior center. That is the difference between sponsoring an event and helping build a movement.</p>
    <h2 style="margin-top:34px">Corporate wellness and team sponsorship</h2>
    <p>NWANA can help companies and organizations connect sponsorship with participation. Sponsors may create employee teams, workplace challenges, umbrella groups, fundraising teams, or branded participation campaigns. This allows a company to support NWANA while also engaging its own employees, departments, offices, clients, families, or communities in a positive activity. Nordic Walking is accessible enough for beginners and meaningful enough to become a long-term wellness habit.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Impact</div>
    <h2>Sponsor impact</h2>
    <p>A sponsorship can help NWANA create real outcomes:</p>
    ${bullets(["more trained instructors", "more local activity", "more accessible programs", "more events", "more teams", "more public awareness", "more safe participation", "more opportunities for seniors, families, beginners, and athletes", "more structure for Nordic Walking in North America"])}
    <p>Sponsors help make the system visible, credible, and scalable.</p>
    <h2 style="margin-top:34px">Why now</h2>
    <p>Nordic Walking is already established in many parts of the world, but North America is still early. That creates a rare opportunity for sponsors. The first serious supporters of NWANA can help shape the public identity of Nordic Walking in North America before the category becomes crowded. Early sponsors can be associated with the foundation: the first programs, the first instructor growth, the first challenges, the first teams, the first competition pathways, and the first national visibility. This is the moment to step in.</p>
    <h2 style="margin-top:34px">Who should sponsor NWANA</h2>
    <p>NWANA may be a strong fit for companies and organizations connected to:</p>
    ${bullets(["sport", "fitness", "wellness", "outdoor recreation", "active aging", "health promotion", "footwear and apparel", "equipment", "parks and recreation", "employee wellness", "insurance and prevention", "community health", "education", "tourism and trails", "events and timing", "media and public outreach", "local business and civic leadership"])}
    <p>If your organization wants to be connected to movement, health, community, sport, and public benefit, NWANA is a strong platform to explore.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Sponsorship vs partnership</div>
    <h2>A clear distinction</h2>
    <p>Sponsorship and partnership are different. A sponsor supports NWANA through funding, visibility packages, campaign support, event support, program support, or brand alignment. A partner works with NWANA to build programs, host activities, reach communities, educate leaders, or develop long-term pathways. Some organizations may become both sponsors and partners, but sponsorship begins with support and visibility.</p>
    <p>See also: <a class="card-link" href="/partners">Partner Network →</a></p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Start the sponsorship conversation</div>
    <h2>Contact the partnerships office</h2>
    <p>NWANA is building sponsorship opportunities at several levels, from program-specific support to broader national visibility. If your company or organization wants to support the growth of Nordic Walking in North America, contact NWANA with a short description of your organization, your goals, your audience, and the type of sponsorship you want to explore.</p>
    <div class="grid cols-2" style="margin-top:22px">${contactCard("Sponsorship Inquiry", "For sponsorship inquiries, contact NWANA.")}<div class="card"><h3>Sell sponsorships</h3><p>If you sell sponsorships professionally and want to take the NWANA inventory to market, see our seller page.</p><p><a class="card-link" href="/sellers">For sellers →</a></p></div></div>
  </div></div>`;

	return layout("Sponsors", "sponsors", content, "Sponsor NWANA: eight sponsorship programs supporting competitions, instructor education, community programs, and the growth of Nordic Walking across North America.");
}

// ---------------- 2. /umbrella-groups (Umbrella NW Groups) ----------------

const NW_GROUPS_URL = "https://groups.nwaofna.org/";

export async function groupsPage(): Promise<string> {
	const content = `
  ${pageHead("NW Groups", "Umbrella NW Groups", "Umbrella NW Groups help companies, organizations, schools, municipalities, clubs, sponsors, and large community networks organize multiple Nordic Walking groups under one shared NWANA structure. An Umbrella NW Group can connect departments, offices, regional teams, employee wellness groups, school groups, club chapters, community partners, fundraising teams, or event teams while keeping them visible as part of one larger organization or sponsor pathway.")}
  <div class="section"><div class="wrap">
    <div class="kicker">The concept</div>
    <h2>What is an Umbrella NW Group?</h2>
    <p>An Umbrella NW Group is a higher-level group structure. Instead of creating only one small team, a larger organization can support multiple connected groups under one umbrella. For example, a company may create one umbrella group for the organization and then connect separate groups for departments, office locations, employee teams, or regional branches.</p>
    <h2 style="margin-top:30px">Example structure</h2>
    <div class="card">
      <h3>Organization Umbrella Group</h3>
      ${bullets(["Marketing Team", "Sales Team", "HR", "Wellness Team", "Regional Office Team", "Remote Team", "Community Partner Team"])}
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Who can use this</div>
    <h2>Built for organizations with reach</h2>
    <p>Umbrella NW Groups may be useful for:</p>
    ${bullets(["employers and corporate wellness programs", "schools, colleges, and universities", "municipal recreation departments", "health and wellness organizations", "senior and active aging programs", "large clubs and community networks", "regional groups", "sponsors and fundraising partners", "organizations with multiple offices, departments, or locations"])}
    <h2 style="margin-top:30px">Why it matters</h2>
    <p>Umbrella NW Groups can help an organization support participation, employee wellness, community health, fundraising, challenges, events, local leadership, and long-term Nordic Walking development. They also give sponsors and partner organizations a visible way to show impact by helping more people participate under a shared NWANA pathway.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">For everyone</div>
    <h2>For participants</h2>
    <p>You do not need to run a company or large organization to help start an Umbrella NW Group. If you work for an employer, attend a school, belong to a club, volunteer with a community organization, or know a local sponsor, you can bring this idea to them and invite them to create or support an Umbrella NW Group with NWANA.</p>
    <h2 style="margin-top:30px">For sponsors and employers</h2>
    <p>An Umbrella NW Group can become a public participation and impact platform for a sponsor, employer, or partner organization. It may connect wellness participation, team activity, fundraising, challenges, events, community visibility, and support for NWANA's education and sport development pathways.</p>
    <h2 style="margin-top:30px">How it can connect to fundraising</h2>
    <p>Some umbrella structures may also connect to fundraising campaigns, team fundraisers, or sponsor-supported programs. A larger organization may support multiple teams while helping raise funds for NWANA programs, instructor development, community growth, events, or future competition pathways.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Get started</div>
    <h2>Start an Umbrella NW Group</h2>
    <p>If your company, school, municipality, club, sponsor group, or organization wants to explore an Umbrella NW Group, contact NWANA to discuss the best structure. If you are an individual participant, you can also introduce this idea to your employer, school, club, wellness program, city office, or community organization.</p>
    <div class="grid cols-2" style="margin-top:22px">
      ${contactCard("Umbrella NW Group")}
      <div class="card"><h3>NW Groups member organization</h3><p>Join an existing NW Group or become the first licensed participant connected with the formation of a new group in your community or organization.</p><p><a class="card-link" href="${NW_GROUPS_URL}">Visit the NW Groups site →</a></p></div>
    </div>
  </div></div>`;

	return layout("Umbrella NW Groups", "umbrella-groups", content, "Umbrella NW Groups: one shared NWANA structure connecting multiple Nordic Walking groups for employers, schools, clubs, and sponsors.");
}
// ---------------- 3. /press (Press Kit) ----------------

export async function pressPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Press Kit</div><h1>Press Kit</h1><p>The Nordic Walking Association of North America (NWANA, we, us, or our) provides this Press Kit page for journalists, media organizations, sponsors, partners, public agencies, community organizations, event organizers, and other parties seeking accurate public information about NWANA and Nordic Walking in North America. This page may include official descriptions, media contacts, background information, logos, approved images, press materials, and public resources.</p></div></div>
  <div class="section"><div class="wrap">
    <p style="color:var(--muted);font-size:15px;margin-bottom:22px"><strong>Effective Date:</strong> August 10, 2026</p>
    <div class="article"><div class="body">
      <h2>1. About NWANA</h2><p>The Nordic Walking Association of North America is an organization dedicated to developing Nordic Walking in the United States, Canada, and the broader North American region. NWANA supports the growth of Nordic Walking through sport development, instructor and coach education, licenses and certifications, community programs, events, health and wellness initiatives, safety standards, partnerships, sponsorships, media resources, and public education. NWANA's goal is to help make Nordic Walking more visible, accessible, structured, and professionally supported across North America.</p><h2>2. What Is Nordic Walking?</h2><p>Nordic Walking is a form of walking that uses specially designed poles and technique to engage both the upper and lower body. When taught correctly, Nordic Walking can support posture awareness, coordination, balance, endurance, outdoor activity, community participation, and sport development. Nordic Walking can be practiced recreationally, socially, for wellness, and as a competitive sport.</p><h2>3. NWANA's Areas of Work</h2><p>NWANA's work may include: public education about Nordic Walking; sport development and competition pathways; instructor and coach education; licenses and certifications; local groups, clubs, and teams; events, challenges, and competitions; health, wellness, and active lifestyle programs; youth, adult, senior, and community participation; safety standards and conduct policies; anti-doping education and clean sport awareness; sponsorship and partnership development; media and public outreach.</p><h2>4. Media Use of NWANA Information</h2><p>Media organizations may use official descriptions from this page when referencing NWANA, provided that the information is not altered in a misleading way. Media should avoid presenting NWANA as a medical provider, government agency, or official representative of any third-party organization unless that relationship is specifically confirmed by NWANA. NWANA does not provide medical advice, diagnosis, treatment, physical therapy, rehabilitation, or healthcare services.</p><h2>5. Short Description</h2><p>The Nordic Walking Association of North America (NWANA) supports the development of Nordic Walking across North America through education, sport development, events, licenses, certifications, community programs, safety standards, partnerships, and public outreach.</p><h2>6. Medium Description</h2><p>The Nordic Walking Association of North America (NWANA) is building a structured platform for Nordic Walking in North America. NWANA supports instructor and coach education, sport development, events, licenses and certifications, community programs, safety standards, media resources, and partnerships that help make Nordic Walking more visible, accessible, and professionally supported.</p><h2>7. Full Description</h2><p>The Nordic Walking Association of North America (NWANA) is dedicated to developing Nordic Walking in the United States, Canada, and the broader North American region. NWANA works to support Nordic Walking as an accessible activity, a structured sport and wellness practice, and a developing sport pathway. NWANA's initiatives may include instructor and coach education, licenses and certifications, events, competitions, challenges, local groups, community programs, health and wellness initiatives, safety standards, anti-doping education, sponsorships, partnerships, media resources, and public education. NWANA's long-term goal is to help build a recognizable, responsible, and sustainable Nordic Walking ecosystem in North America.</p><h2>8. Key Messages</h2><p>Nordic Walking is more than walking with poles; it is a teachable technique and a structured movement system. Nordic Walking can serve recreational, wellness, community, and sport purposes. NWANA is helping organize Nordic Walking in North America through education, events, licenses, certifications, policies, and partnerships. Safe participation, responsible instruction, clean sport, and community access are central to NWANA's work. NWANA welcomes participants, athletes, instructors, coaches, officials, organizers, volunteers, sponsors, donors, partners, and media.</p><h2>9. Approved Name Usage</h2><p>Use the organization name as: Nordic Walking Association of North America. The abbreviation may be used as: NWANA. Preferred first reference: The Nordic Walking Association of North America (NWANA). After first reference: NWANA. Avoid using unofficial abbreviations, altered names, or names that imply affiliation with another organization unless approved by NWANA.</p><h2>10. Logo and Brand Assets</h2><p>NWANA logos, emblems, marks, images, and brand materials may be available through the Logos &amp; Brand Assets page. Use of NWANA brand assets must follow NWANA brand rules and approval requirements. Downloading a logo or image does not automatically grant permission for commercial, sponsor, merchandise, event, apparel, advertising, or public promotional use.</p><h2>11. Photos and Video</h2><p>NWANA may provide approved photos, videos, or image resources for media use. Photos and videos may be subject to copyright, participant privacy, photographer rights, event restrictions, or youth participant limitations. Media outlets should credit NWANA or the appropriate photographer when requested. Do not use NWANA photos or videos in misleading, offensive, commercial, or unrelated contexts.</p><h2>12. Interview Topics</h2><p>NWANA may be available for interviews or comments on topics such as: Nordic Walking in North America; benefits and accessibility of Nordic Walking; Nordic Walking technique and education; growth of Nordic Walking as a sport; instructor and coach development; community programs; active aging and wellness participation; events and competitions; safety standards; partnerships and sponsorships; NWANA organizational development.</p><h2>13. Media Requests</h2><p>Media representatives may contact NWANA for: interviews; quotes; background information; event information; logo or image requests; speaker requests; fact checking; press releases; media partnerships. Please include your name, organization, deadline, topic, requested format, and contact information.</p><h2>14. Sponsorship and Partnership Inquiries</h2><p>Sponsors, partners, public agencies, community organizations, schools, clubs, health and wellness organizations, and event organizers may contact NWANA for collaboration opportunities. Media and partnership requests may be routed to the appropriate NWANA representative.</p><h2>15. Accuracy and Updates</h2><p>NWANA may update this Press Kit page from time to time as programs, events, leadership, licenses, certifications, partnerships, and organizational resources develop. Media organizations should use the most current information available on NWANA websites or contact NWANA to confirm details before publication.</p><h2>16. Contact NWANA</h2><p>For press, media, sponsorship, or partnership inquiries, contact NWANA: Email: info@nwaofna.org. Subject line: Press / Media Request</p>
    </div></div>
    <div style="margin-top:34px"><div class="card"><h3>Contact NWANA</h3><p>For press, media, sponsorship, or partnership inquiries, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Press / Media Request</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Press%20%2F%20Media%20Request">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Press Kit", "press", content, "NWANA Press Kit: official descriptions, key messages, name usage, interview topics, and media contact information.");
}

// ---------------- 4. /media-contact ----------------

export async function mediaContactPage(): Promise<string> {
	const sections: [number, string, string][] = [
		[1, "Media Inquiries", "Media representatives may contact NWANA for: interviews; quotes; background information; event information; press materials; logo or image requests; speaker requests; fact checking; press releases; media partnerships; coverage of Nordic Walking programs, events, or sport development. When contacting NWANA, please include your name, media organization, deadline, topic, requested format, and contact information."],
		[2, "Partnership Inquiries", "NWANA welcomes partnership conversations with organizations interested in supporting Nordic Walking programs, events, education, sport development, wellness initiatives, community access, active lifestyle programs, or public outreach. Potential partners may include: public agencies; parks and recreation departments; schools and universities; clubs and community groups; health and wellness organizations; senior and active aging organizations; nonprofit organizations; event organizations; corporate wellness programs; sport organizations; local businesses; national or regional organizations."],
		[3, "Sponsorship Inquiries", "Sponsors may contact NWANA about opportunities to support: NWANA programs; events and competitions; sport development; instructor and coach education; community initiatives; youth and family programs; health and wellness programs; safety and education resources; media and outreach campaigns; donation or fundraising campaigns. Sponsorship opportunities may vary by program, event, location, visibility level, and timing."],
		[4, "What to Include in Your Message", "To help NWANA respond efficiently, please include: your name; your organization; your role or title; your email address and phone number; the type of inquiry; your location; your deadline, if any; a short description of your request; any relevant website, document, proposal, or event link."],
		[5, "Response Time", "NWANA will make reasonable efforts to respond to media and partner inquiries as quickly as possible. Response time may vary depending on the nature of the request, event schedules, volunteer availability, deadlines, and organizational priorities. Urgent media deadlines should be clearly stated in the subject line."],
		[6, "Use of NWANA Name or Logo", "Contacting NWANA does not grant permission to use the NWANA name, logo, brand assets, event names, program names, images, or official materials. Use of NWANA brand assets, sponsorship language, partnership language, or official status must be approved by NWANA where required."],
		[7, "Contact NWANA", "For media, sponsorship, partnership, or public information inquiries, contact NWANA: Email: info@nwaofna.org. Subject line: Media / Partner Inquiry"],
	];
	const content = `
  ${pageHead("Media & Partners", "Contact for Media / Partners", "The Nordic Walking Association of North America (NWANA, we, us, or our) welcomes inquiries from media representatives, sponsors, partners, public agencies, schools, clubs, community organizations, health and wellness organizations, event organizers, donors, and other groups interested in Nordic Walking in North America. Use this page to contact NWANA about media requests, partnership opportunities, sponsorship interest, public information, collaboration ideas, or organizational questions.")}
  <div class="section"><div class="wrap">
    ${effectiveDate("August 10, 2026")}
    <div class="article"><div class="body">
      ${sections.map(([n, t, b]) => `<h2>${n}. ${esc(t)}</h2><p>${esc(b)}</p>`).join("")}
    </div></div>
    <div style="margin-top:34px">${contactCard("Media / Partner Inquiry", "For media, sponsorship, partnership, or public information inquiries, contact NWANA.")}</div>
    <p style="margin-top:22px">Related resources: <a class="card-link" href="/press">Press Kit →</a> <a class="card-link" href="/brand" style="margin-left:18px">Logos & Brand Assets →</a></p>
  </div></div>`;

	return layout("Contact for Media and Partners", "media-contact", content, "Contact NWANA about media requests, partnerships, sponsorship interest, and public information.");
}

// ---------------- 5. /brand ----------------

export async function brandPage(): Promise<string> {
	const sections: [number, string, string][] = [
		[1, "Purpose", "NWANA brand assets help create a consistent and recognizable identity for Nordic Walking in North America. These assets may be used to support: NWANA programs; NWANA events and competitions; licensed instructors and coaches; certified officials and organizers; approved groups, clubs, and teams; sponsorships and partnerships; media coverage; educational materials; donation and fundraising campaigns; public communications."],
		[2, "What May Be Included", "NWANA may provide brand assets such as: NWANA logos; NWANA emblems; event logos; program marks; sport marks; health and wellness marks; instructor or coach marks; official color references; approved images; approved copy blocks; press-ready materials; social media graphics; sponsor or partner graphics; downloadable files. The availability of specific assets may change over time."],
		[3, "Ownership", "All NWANA names, logos, emblems, marks, graphics, designs, images, documents, and brand materials are owned by NWANA or used with permission unless otherwise stated. Downloading or receiving a NWANA logo or brand asset does not transfer ownership and does not automatically grant permission for any public, commercial, promotional, event, apparel, merchandise, or sponsor use."],
		[4, "General Use Rules", "NWANA brand assets must be used accurately, respectfully, and consistently. You may not: alter, distort, redraw, recolor, stretch, crop, or modify NWANA logos without permission; use NWANA logos in a way that suggests false approval, endorsement, partnership, certification, license status, or official authority; use NWANA branding for unapproved events, programs, products, services, merchandise, or commercial activity; combine NWANA logos with other marks in a way that creates confusion; place NWANA logos on offensive, unsafe, misleading, political, discriminatory, or inappropriate materials; use NWANA assets in a way that damages the reputation, mission, or integrity of NWANA."],
		[5, "Approved Use", "NWANA brand assets may be used when: NWANA has approved the use; the use is connected to an official NWANA program, event, license, certification, or communication; the user is an approved sponsor, partner, organizer, instructor, coach, official, volunteer, or media contact; the use follows NWANA brand guidelines and any written instructions; the use does not misrepresent the relationship with NWANA. Some uses may require written approval before publication."],
		[6, "Instructors, Coaches, Officials, and Organizers", "NWANA license holders and certified individuals may be allowed to use certain NWANA materials only within the scope of their license, certification, role, and current status. A person may not use NWANA branding to suggest that they hold a license, certification, title, or authorization that they do not have. If a license or certification expires, is suspended, is revoked, or is not renewed, NWANA brand use connected to that status must stop unless NWANA gives written permission."],
		[7, "Events, Groups, Clubs, and Teams", "NWANA logos or program marks may be used for events, groups, clubs, and teams only when approved by NWANA or when permitted by specific NWANA guidelines. Use of NWANA branding for an event does not automatically mean that the event is sanctioned, insured, certified, endorsed, or operated by NWANA unless NWANA clearly states that status in writing. Local groups, clubs, teams, and organizers should avoid creating materials that confuse the public about whether an activity is official, sanctioned, independent, local, regional, national, or partner-led."],
		[8, "Sponsors and Partners", "Sponsors and partners may use NWANA brand assets only according to the terms of their sponsorship or partnership agreement. Sponsorship or partnership does not automatically grant unlimited rights to use NWANA logos, marks, images, participant photos, event names, or program materials. NWANA may require review and approval of sponsor or partner materials before publication."],
		[9, "Media Use", "Media organizations may use NWANA-provided logos, photos, and brand materials for accurate news, editorial, or public-information coverage related to NWANA. Media use must not misrepresent NWANA, falsely imply endorsement, alter official marks, or use NWANA materials in misleading or inappropriate ways. For media questions or asset requests, contact NWANA."],
		[10, "Photos and Images", "Photos, videos, and images provided by NWANA may be subject to copyright, participant privacy, photographer rights, event restrictions, or media-use limitations. Do not use NWANA photos or participant images for advertising, merchandise, sponsorship, commercial campaigns, or public promotion unless you have permission. Youth participant images require special care and may be restricted."],
		[11, "Merchandise and Commercial Use", "NWANA logos and brand assets may not be used on merchandise, apparel, products, paid advertising, commercial services, or fundraising items without written approval. This includes, but is not limited to: shirts; hats; jackets; medals; certificates; banners; signs; websites; social media ads; printed materials; training products; paid courses; sponsor materials; event merchandise."],
		[12, "Brand Consistency", "When using approved NWANA brand assets, users should preserve: correct logo proportions; readable spacing; approved colors where provided; clear background contrast; accurate naming; professional presentation; correct relationship language. NWANA may request edits, removal, correction, or replacement of materials that use the brand incorrectly."],
		[13, "No Implied Endorsement", "Use of NWANA brand assets does not create an endorsement, sponsorship, partnership, certification, license, sanctioning, employment, agency relationship, or official approval unless NWANA clearly states that relationship in writing."],
		[14, "Removal or Correction", "NWANA may require removal, correction, or discontinuation of any use of NWANA logos, marks, images, names, or brand materials that NWANA determines is unauthorized, inaccurate, misleading, outdated, harmful, inconsistent, or inappropriate. Failure to comply may result in loss of access, license action, certification action, event approval denial, partnership termination, or other action."],
		[15, "Requests for Permission", "If you are unsure whether your use is allowed, ask NWANA before publishing, printing, selling, distributing, or promoting materials that include NWANA brand assets. Permission requests should include: your name and organization; intended use; where the asset will appear; whether the use is public, private, commercial, nonprofit, media, event, or educational; sample layout or draft if available; deadline or publication date."],
		[16, "Updates to Brand Assets", "NWANA may update, replace, retire, or revise logos, marks, graphics, files, and brand guidelines at any time. Users should use the most current approved assets when available. Older logos or files may no longer be approved for new materials."],
		[17, "Contact NWANA", "For logo, brand asset, media, sponsor, or permission questions, contact NWANA: Email: info@nwaofna.org. Subject line: Brand Assets Request"],
	];
	const content = `
  ${pageHead("Brand Resources", "Logos & Brand Assets", "The Nordic Walking Association of North America (NWANA, we, us, or our) provides logos, brand assets, images, documents, and related materials to support appropriate use of the NWANA identity in approved programs, events, communications, partnerships, sponsorships, media coverage, and public information. This page explains how NWANA logos and brand assets may be used.")}
  <div class="section"><div class="wrap">
    ${effectiveDate("August 10, 2026")}
    <div class="article"><div class="body">
      ${sections.map(([n, t, b]) => `<h2>${n}. ${esc(t)}</h2><p>${esc(b)}</p>`).join("")}
    </div></div>
    <div style="margin-top:34px">${contactCard("Brand Assets Request", "For logo, brand asset, media, sponsor, or permission questions, contact NWANA.")}</div>
  </div></div>`;

	return layout("Logos and Brand Assets", "brand", content, "NWANA brand rules: logos, images, merchandise and commercial use, permission requests, and approval requirements.");
}

// ---------------- 6. /governance ----------------

export async function governancePage(): Promise<string> {
	const legal = [
		{ href: "/privacy", t: "Privacy Policy", d: "How NWANA collects, uses, shares, protects, and retains information submitted through websites, registrations, donations, forms, licenses, certifications, events, and communications." },
		{ href: "/terms", t: "Terms of Use", d: "Rules for using NWANA websites, pages, content, forms, registration links, donation pages, license pages, communications, and digital resources." },
		{ href: "/terms-conditions", t: "Terms & Conditions", d: "Terms that apply to registrations, programs, events, licenses, certifications, donations, sponsorships, purchases, applications, and other NWANA activities." },
	];
	const conduct = [
		{ href: "/code-of-conduct", t: "Code of Conduct", d: "NWANA's expectations for respect, fairness, safety, integrity, inclusion, communication, youth protection, reporting, and responsible behavior." },
		{ href: "/safesport", t: "SafeSport", d: "Participant protection, youth safety, misconduct prevention, reporting expectations, adult-youth boundaries, and safe program culture." },
		{ href: "/anti-doping", t: "Anti-Doping", d: "Clean sport principles, anti-doping education, WADA education resources, athlete responsibility, and sport integrity expectations." },
		{ href: "/safety", t: "Safety Standards", d: "Basic safety expectations for Nordic Walking activities, routes, weather, equipment, group programs, youth participation, incidents, and emergency readiness." },
	];
	const resources = [
		{ href: "/documents", t: "Downloads & Reports", d: "Public documents, reports, forms, guides, program resources, and organizational materials." },
		{ href: "/forms", t: "Forms", d: "Central access point for NWANA forms, requests, applications, reports, inquiries, and submissions." },
		{ href: "/brand", t: "Logos & Brand Assets", d: "Rules and access information for NWANA logos, brand assets, images, graphics, and approved identity materials." },
		{ href: "/press", t: "Press Kit", d: "Official descriptions, media language, background information, approved public messaging, and press resources." },
		{ href: "/media-contact", t: "Contact for Media / Partners", d: "Contact pathway for media representatives, sponsors, partners, public agencies, organizations, and collaboration inquiries." },
	];
	const related = [
		{ href: "/support", t: "Support / Funds", d: "Support NWANA programs, instructor growth, community access, sport development, events, education, and public outreach." },
		{ href: "/partners", t: "Partners", d: "Explore organizational partnership pathways for programs, events, education, community access, and Nordic Walking development." },
		{ href: "/sponsors", t: "Sponsors", d: "Learn how sponsors can support NWANA's growth, visibility, programs, events, instructor development, and community impact." },
		{ href: "/events", t: "Events", d: "NWANA organizational events, clinics, workshops, fundraisers, recognition events, partner gatherings, and education sessions." },
	];
	const groupCards = (items: { href: string; t: string; d: string }[]) =>
		`<div class="grid cols-3" style="margin-top:18px">${items.map((i) => `<a class="card news-card" href="${i.href}"><h3>${esc(i.t)}</h3><p style="font-size:15.5px;color:var(--muted)">${esc(i.d)}</p></a>`).join("")}</div>`;
	const content = `
  ${pageHead("Governance", "Governance & Policies", "The Nordic Walking Association of North America (NWANA) is building Nordic Walking in North America through clear standards, responsible leadership, safe participation, public-facing policies, education, licenses, events, community programs, partnerships, sponsorships, and transparent organizational resources. This page is the central access point for NWANA governance, policies, safety standards, legal terms, media resources, public documents, forms, and contact pathways. NWANA is a U.S. nonprofit public charity recognized under IRS Section 501(c)(3). Donations may be tax-deductible to the extent allowed by law. Please consult your tax advisor.")}
  <div class="section"><div class="wrap">
    <div class="kicker">Core legal policies</div>
    <h2>Legal policies</h2>
    ${groupCards(legal)}
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Conduct, safety, and sport integrity</div>
    <h2>Conduct and safety</h2>
    ${groupCards(conduct)}
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Public resources</div>
    <h2>Documents, media, and forms</h2>
    ${groupCards(resources)}
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Related NWANA pages</div>
    <h2>Support, partners, sponsors, events</h2>
    ${groupCards(related)}
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Questions</div>
    <h2>Ask the federation</h2>
    <p>For governance, policy, safety, media, partner, sponsor, or document questions, contact NWANA.</p>
    <div style="margin-top:22px">${contactCard("General Question")}</div>
  </div></div>`;

	return layout("Governance and Policies", "governance", content, "NWANA governance hub: legal policies, code of conduct, SafeSport, anti-doping, safety standards, documents, forms, and media resources.");
}
// ---------------- 7. /privacy (Privacy Policy, VERBATIM) ----------------

export async function privacyPage(): Promise<string> {
	const intro = "The Nordic Walking Association of North America (NWANA, we, us, or our) respects the privacy of participants, athletes, license holders, instructors, coaches, officials, volunteers, donors, sponsors, partners, parents, guardians, and visitors who use our websites, registration pages, donation pages, forms, communications, and related digital services. This Privacy Policy explains what information NWANA may collect, how we may use it, how information may be shared, and what choices individuals may have regarding their information. By using NWANA websites, registering for NWANA activities, submitting forms, making donations, participating in programs or events, applying for licenses or certifications, or communicating with NWANA, you acknowledge this Privacy Policy.";
	const sections: [number, string, string][] = [
		[1, "Information We May Collect", "NWANA may collect information that you provide directly to us or through platforms we use to operate our programs, licenses, certifications, events, donations, communications, and websites. This may include: name; email address; phone number; mailing address; city, state, province, country, or ZIP/postal code; date of birth or age, when needed for eligibility, youth participation, event categories, training, safety, or license records; gender or event category, when used for registration, participation, or results; emergency contact information; parent or guardian information for youth participants; team, club, group, company, school, or organization affiliation; instructor, coach, official, volunteer, organizer, sponsor, donor, or partner role; license, certification, training, or credential information; registration details; donation records; payment status; waiver acknowledgments; answers to registration, license, certification, application, training, or inquiry questions; communication preferences; submitted messages, forms, requests, reports, or feedback. For programs, events, challenges, competitions, rankings, training, certifications, or community activities, NWANA may also collect or maintain related participation information, including event records, attendance, submitted results, team or club records, training completion status, certification status, license status, volunteer activity, and program involvement."],
		[2, "Use of RunSignup and Third-Party Platforms", "NWANA may use RunSignup and related platform tools to manage websites, event registration, licenses, donations, fundraising, participant data, communications, results, reporting, and payment processing. Information submitted through RunSignup is also handled according to RunSignup's own privacy policy and terms. Users should review RunSignup's privacy policy when registering, donating, purchasing, applying for a license, or using RunSignup-powered pages. RunSignup Privacy Policy: https://info.runsignup.com/about-us/privacy-policy/. NWANA may also use other third-party tools or service providers for email, website hosting, forms, analytics, payment processing, document storage, communications, education, or operational support."],
		[3, "How We Use Information", "NWANA may use collected information to: operate programs, events, challenges, competitions, training, and community activities; manage registrations, donations, licenses, certifications, applications, renewals, and payments; communicate with participants, license holders, donors, volunteers, sponsors, partners, coaches, instructors, officials, organizers, and the public; send confirmations, receipts, reminders, event updates, safety notices, policy updates, program information, and administrative messages; publish results, rankings, team standings, club standings, or competition records where applicable; verify eligibility, category placement, age group, team affiliation, license status, training status, or credential status; support safety planning, emergency response, incident reporting, participant protection, and program administration; respond to questions, reports, requests, or concerns; manage volunteers, officials, instructors, coaches, organizers, partners, and sponsors; improve NWANA programs, websites, communications, training, events, and services; maintain internal records; comply with legal, financial, tax, safety, insurance, operational, or reporting obligations; protect the rights, safety, integrity, and security of NWANA, participants, license holders, and the public. NWANA may also use aggregated, statistical, or non-identifying information to understand participation, improve programs, report impact, support grant applications, communicate with sponsors or partners, and develop Nordic Walking in North America."],
		[4, "Public Results, Rankings, Recognition, and Records", "Some NWANA activities may involve public recognition, event results, rankings, team standings, certifications, awards, photos, videos, or historical records. By participating in NWANA activities where public records are part of the program or event, you understand that certain information may be displayed publicly. This may include name, event, program, category, result, ranking, team, club, city, state, province, country, certification status, license status, award, or related participation information. If you have a concern about the public display of your information, contact NWANA before registering, participating, or submitting results. NWANA may not be able to remove all historical, archival, third-party, or already-published records."],
		[5, "Donations and Payment Information", "NWANA may collect donations, fundraising contributions, registration fees, license fees, certification fees, sponsorship payments, merchandise payments, or other payments through RunSignup or other payment processors. NWANA does not intentionally collect or store full credit card numbers through its own website pages. Payment information is generally processed by third-party payment platforms. Those platforms may collect and process payment information according to their own privacy policies, security standards, and terms. NWANA may maintain donation records, payment status, donor name, donor contact information, donation amount, campaign designation, receipt information, and related records for administrative, tax, reporting, recognition, or compliance purposes."],
		[6, "Email and Communications", "NWANA may send communications related to registrations, donations, events, programs, training, certifications, licenses, safety notices, policy updates, volunteer opportunities, sponsorship opportunities, partnership opportunities, fundraising, and organizational news. You may unsubscribe from promotional communications where an unsubscribe option is provided. Some operational, safety, legal, payment, registration, license, event, or program-related messages may still be necessary even if you opt out of promotional messages."],
		[7, "Photos, Video, and Media", "NWANA programs, events, and activities may include photography, video, livestreams, interviews, screenshots, social media posts, or other media. NWANA may use event-related or program-related images or video for promotion, education, reporting, fundraising, sponsor communication, media coverage, historical records, and organizational development. If a participant, parent, guardian, or individual has a specific concern about use of an image, they should contact NWANA. NWANA will review reasonable requests, especially for youth participants or safety-related concerns, but cannot guarantee removal from third-party platforms, media outlets, archived materials, or content already shared publicly."],
		[8, "Children and Youth Participants", "NWANA may offer programs, events, training, or activities that include youth participants. When information is submitted for a child or minor, it should be provided by a parent, guardian, or authorized adult where required. Youth participant information may be used for registration, event management, training, safety, category placement, communication with parents or guardians, results, awards, and program administration. Parents or guardians may contact NWANA with questions about youth participant information."],
		[9, "Sharing of Information", "NWANA does not sell personal information. NWANA may share information when reasonably necessary to: operate programs, events, registrations, donations, training, licenses, certifications, or communications; work with RunSignup or other service providers; process payments; publish results, rankings, team standings, awards, certifications, license status, or event records where applicable; support timers, officials, organizers, volunteers, instructors, coaches, event staff, or program administrators; respond to safety concerns, emergencies, reports, or participant protection issues; comply with legal, tax, financial, insurance, regulatory, or law enforcement obligations; protect the rights, safety, security, reputation, or integrity of NWANA and its participants; work with sponsors, partners, grantors, or media using aggregated or appropriate event-related or program-related information. When NWANA uses service providers, those providers may process information on NWANA's behalf or according to their own platform terms and privacy policies."],
		[10, "Sponsors, Partners, and Reports", "NWANA may share aggregated, statistical, or non-identifying information with sponsors, donors, partners, grantors, media, or community stakeholders. Examples may include participation numbers, program reach, cities or regions represented, donation totals, event impact, volunteer activity, training completion totals, license totals, certification totals, or general demographic and participation trends. NWANA does not intentionally provide sponsors or partners with private personal contact information for their independent marketing unless a person has consented, requested contact, or the sharing is clearly part of a specific program, benefit, registration choice, or partnership activity."],
		[11, "Cookies, Analytics, and Website Data", "NWANA websites or third-party platforms used by NWANA may collect technical or usage information through cookies, analytics tools, server logs, tracking technologies, or similar tools. This may include IP address, browser type, device type, pages visited, referring links, approximate location, date and time of visit, and interactions with website features, forms, or emails. This information may be used to operate websites, improve user experience, understand traffic, protect security, support marketing, measure engagement, and improve programs. Third-party platforms, including RunSignup, may use their own cookies and analytics according to their own privacy policies."],
		[12, "Data Security", "NWANA uses reasonable administrative, technical, and organizational measures intended to protect information. However, no website, email system, registration platform, payment system, or digital transmission can be guaranteed to be completely secure. Users are responsible for using secure passwords, protecting their own accounts, and using caution when submitting information online."],
		[13, "Data Retention", "NWANA may retain information for as long as reasonably necessary for program administration, license records, certification records, event administration, donation records, financial and tax records, legal compliance, safety and incident records, results and historical records, communication history, dispute resolution, insurance or risk management, and organizational records. Some results, rankings, awards, certifications, license records, photos, historical records, or public event records may be retained indefinitely as part of NWANA's organizational archive."],
		[14, "Your Choices and Requests", "You may contact NWANA to ask privacy questions, request correction of inaccurate information, update contact information, request removal from certain communications, ask about deletion or limitation of certain information, raise concerns about public display of information, or ask about youth participant information. NWANA will review requests and respond as appropriate. Some information may need to be retained for legal, financial, safety, operational, event, insurance, reporting, or historical recordkeeping reasons."],
		[15, "Links to Other Websites", "NWANA websites may link to third-party websites, including RunSignup, partner websites, sponsor websites, education resources, anti-doping resources, Safe Sport resources, social media platforms, payment processors, and other external services. NWANA is not responsible for the privacy practices, content, security, or policies of third-party websites. Users should review the privacy policies of those third-party services."],
		[16, "International Users", "NWANA is based in the United States and primarily serves participants, supporters, and organizations connected to Nordic Walking in North America. If you access NWANA services from outside the United States, you understand that your information may be processed in the United States or through service providers used by NWANA."],
		[17, "Changes to This Privacy Policy", "NWANA may update this Privacy Policy from time to time. Updates will be posted on this page with a revised effective date. Continued use of NWANA websites, registrations, donations, programs, licenses, certifications, or services after updates are posted means you acknowledge the updated policy."],
		[18, "Contact NWANA", "For privacy questions or requests, contact NWANA: Email: info@nwaofna.org. Subject line: Privacy Policy Question"],
	];
	const content = `
  ${pageHead("Privacy Policy", "Privacy Policy", intro)}
  <div class="section"><div class="wrap">
    ${effectiveDate("August 9, 2026")}
    <div class="article"><div class="body">
      ${sections.map(([n, t, b]) => `<h2>${n}. ${esc(t)}</h2><p>${esc(b)}</p>`).join("")}
    </div></div>
    <div style="margin-top:34px">${contactCard("Privacy Policy Question", "For privacy questions or requests, contact NWANA.")}</div>
  </div></div>`;

	return layout("Privacy Policy", "privacy", content, "NWANA Privacy Policy: how we collect, use, share, protect, and retain information.");
}

// ---------------- 8. /terms (Terms of Use, VERBATIM) ----------------

export async function termsPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Terms of Use</div><h1>Terms of Use</h1><p>These Terms of Use govern your access to and use of websites, pages, content, forms, registration links, license pages, donation pages, communications, and related digital resources operated by the Nordic Walking Association of North America (NWANA, we, us, or our). By accessing or using NWANA websites, registering for NWANA activities, applying for a license or certification, submitting a form, making a donation, viewing content, or interacting with NWANA digital services, you agree to these Terms of Use. If you do not agree, please do not use NWANA websites or digital services.</p></div></div>
  <div class="section"><div class="wrap">
    <p style="color:var(--muted);font-size:15px;margin-bottom:22px"><strong>Effective Date:</strong> August 10, 2026</p>
    <div class="article"><div class="body">
      <h2>1. Purpose of NWANA Websites</h2><p>NWANA websites and digital resources may provide information about: Nordic Walking; NWANA programs, events, competitions, challenges, and rankings; health, wellness, sport, and community programs; instructors, coaches, officials, organizers, and volunteers; licenses, certifications, training, and education; groups, clubs, teams, and community initiatives; donations, sponsorships, and partnerships; governance, policies, rules, safety standards, and resources; media, reports, forms, downloads, and educational materials. The information on NWANA websites is provided for general organizational, educational, event, program, sport, wellness, and community purposes.</p><h2>2. Use of RunSignup and Third-Party Platforms</h2><p>NWANA may use RunSignup and related platform tools for websites, event registration, licenses, donations, fundraising, communications, results, reporting, and payment processing. When you register, donate, purchase, submit information, apply for a license, or use RunSignup-powered pages, your use may also be governed by RunSignup's own terms, privacy policy, race contract, payment terms, and platform rules. RunSignup Privacy Policy: https://info.runsignup.com/about-us/privacy-policy/. RunSignup Race Contract: https://runsignup.com/About-Us/Race-Contract. NWANA is not responsible for the operation, availability, policies, security, or technical performance of third-party platforms.</p><h2>3. Eligibility and User Responsibility</h2><p>You are responsible for ensuring that your use of NWANA websites and participation in NWANA activities complies with applicable laws, rules, policies, eligibility requirements, and registration terms. If you register or submit information on behalf of another person, including a minor, team member, family member, athlete, volunteer, participant, license applicant, or organization, you represent that you have authority to do so. Parents, guardians, coaches, instructors, team leaders, and organizers are responsible for ensuring that youth participants are registered and supervised appropriately.</p><h2>4. No Medical Advice</h2><p>NWANA does not provide medical advice, diagnosis, treatment, physical therapy, rehabilitation, or healthcare services through its websites. Information related to health, wellness, sport, movement, training, safety, injury prevention, or physical activity is provided for general educational purposes only. You should consult a qualified healthcare provider before beginning any physical activity program, especially if you have a medical condition, injury, disability, health concern, or have been inactive. Participation in Nordic Walking, walking programs, sport activities, events, competitions, training, and related activities involves physical effort and risk.</p><h2>5. Participation and Assumption of Risk</h2><p>Nordic Walking, walking programs, events, challenges, competitions, training, wellness programs, and related activities may involve risks, including but not limited to falls, collisions, overuse injuries, weather exposure, dehydration, equipment-related risks, traffic or course hazards, uneven surfaces, health-related incidents, and contact with other participants or spectators. By participating in NWANA activities, you understand that physical activity carries inherent risks. You are responsible for participating within your ability, using appropriate equipment, following safety instructions, and stopping if you feel unsafe or unwell. Specific events, programs, registrations, license applications, certifications, courses, or activities may require separate waivers, releases, rules, or participant agreements.</p><h2>6. Rules, Policies, and Conduct</h2><p>Users, participants, athletes, license holders, instructors, coaches, officials, volunteers, organizers, sponsors, partners, and spectators are expected to follow applicable NWANA rules, policies, safety standards, codes of conduct, event instructions, and program requirements. NWANA may deny, suspend, remove, disqualify, or restrict participation, access, registration, results, rankings, credentials, licenses, certifications, or privileges if a person violates NWANA rules, policies, safety expectations, conduct standards, or applicable law. NWANA may update rules, standards, procedures, event requirements, rankings, policies, programs, and participation requirements as the organization develops.</p><h2>7. Event Information, Results, Rankings, and Records</h2><p>NWANA may publish event information, results, rankings, team standings, club standings, city standings, awards, certifications, license status, photos, videos, and other program-related or sport-related records. NWANA works to provide accurate information, but errors may occur. Event details, dates, rules, categories, rankings, results, fees, schedules, locations, program details, license requirements, certification requirements, and participation requirements may change. NWANA may correct, update, remove, or revise results, rankings, records, event information, or program information when needed. Participation in an event, challenge, ranking, competition, program, course, license process, certification process, or activity does not guarantee placement, awards, recognition, publication, certification, licensing, credentialing, ranking, or future opportunity.</p><h2>8. Donations, Fees, Purchases, and Payments</h2><p>NWANA may collect donations, registration fees, license fees, certification fees, sponsorship payments, merchandise payments, or other payments through RunSignup or other payment processors. All payments are subject to the terms shown at the time of transaction and any applicable refund policy, event policy, license policy, certification policy, donation policy, program policy, or platform policy. Donations may be used to support NWANA programs, sport development, education, events, safety, operations, outreach, community programs, health and wellness initiatives, and related organizational purposes, unless a specific restricted purpose is clearly stated. NWANA may change donation campaigns, giving levels, sponsorship opportunities, fees, program pricing, license pricing, and certification pricing at any time.</p><h2>9. Refunds</h2><p>Refund availability depends on the specific event, program, registration, donation, purchase, license, certification, or fee. Unless a specific refund policy states otherwise, payments may be non-refundable. Processing fees charged by third-party platforms may also be non-refundable. Participants, donors, applicants, and purchasers should review applicable refund terms before completing a transaction.</p><h2>10. Intellectual Property</h2><p>All NWANA names, logos, marks, designs, text, graphics, documents, rules, educational materials, training materials, website content, images, videos, page layouts, and other materials are owned by NWANA or used with permission, unless otherwise stated. You may view and use website content for personal, informational, non-commercial purposes related to NWANA participation. You may not copy, reproduce, modify, publish, sell, distribute, scrape, repurpose, or use NWANA materials, logos, rules, educational content, training content, or branding for commercial or public purposes without written permission from NWANA. Use of NWANA logos, brand assets, event names, program names, official marks, or training materials must follow NWANA brand guidelines and written approval where required.</p><h2>11. User Submissions</h2><p>If you submit information, forms, photos, videos, results, messages, feedback, reports, ideas, suggestions, team information, event proposals, partnership inquiries, sponsorship inquiries, license applications, certification materials, or other content to NWANA, you are responsible for making sure the information is accurate and that you have the right to submit it. By submitting content to NWANA, you grant NWANA permission to use, review, store, process, display, publish, edit, or share that content as reasonably needed for organizational, event, sport, safety, reporting, promotional, educational, administrative, or operational purposes. NWANA is not required to use, publish, respond to, or retain submitted content. Do not submit confidential, sensitive, private, or third-party information unless it is necessary and you have authority to provide it.</p><h2>12. Prohibited Uses</h2><p>You agree not to use NWANA websites or digital services to: violate any law, rule, regulation, or policy; submit false, misleading, fraudulent, or unauthorized information; impersonate another person or organization; interfere with website operation, security, or availability; attempt unauthorized access to accounts, systems, data, or platform tools; upload harmful code, malware, spam, or abusive content; harass, threaten, abuse, defame, or harm others; misuse NWANA names, logos, materials, or official status; scrape, copy, harvest, or misuse data; interfere with events, registrations, rankings, results, programs, license processes, certification processes, or operations; engage in conduct that damages NWANA, participants, license holders, partners, sponsors, or the public. NWANA may restrict or remove access for misuse.</p><h2>13. Third-Party Links</h2><p>NWANA websites may include links to third-party websites, including RunSignup, sponsors, partners, education resources, anti-doping resources, Safe Sport resources, social media platforms, payment processors, and other external services. Third-party websites are not controlled by NWANA. NWANA is not responsible for their content, accuracy, availability, privacy practices, terms, security, or actions. Use third-party websites at your own risk and review their terms and policies.</p><h2>14. Website Availability and Accuracy</h2><p>NWANA may update, change, suspend, remove, or discontinue website content, pages, programs, links, forms, registrations, license pages, donation pages, or services at any time. NWANA does not guarantee that its websites will be uninterrupted, error-free, secure, current, complete, or available at all times. NWANA may correct errors, update information, or revise content without notice.</p><h2>15. No Guarantee of Outcomes</h2><p>NWANA does not guarantee any specific athletic result, ranking, award, certification, license, sponsorship, donation outcome, health outcome, business outcome, partnership, event approval, program result, or opportunity. Participation in NWANA programs or use of NWANA resources does not guarantee selection, approval, recognition, publication, certification, licensing, credentialing, ranking, or future opportunity.</p><h2>16. Disclaimer of Warranties</h2><p>NWANA websites and content are provided on an as is and as available basis. To the fullest extent permitted by law, NWANA disclaims all warranties, express or implied, including warranties of accuracy, completeness, fitness for a particular purpose, merchantability, non-infringement, availability, and security. NWANA does not warrant that its websites, third-party platforms, registrations, payments, results, communications, or digital services will be uninterrupted, secure, or error-free.</p><h2>17. Limitation of Liability</h2><p>To the fullest extent permitted by law, NWANA, its board members, officers, directors, volunteers, employees, contractors, officials, instructors, coaches, organizers, affiliates, sponsors, and partners shall not be liable for any indirect, incidental, consequential, special, punitive, or exemplary damages arising from or related to your use of NWANA websites, participation in NWANA activities, reliance on website content, third-party platform use, registrations, licenses, donations, purchases, results, rankings, communications, or digital services. This limitation applies even if NWANA has been advised of the possibility of such damages. Some jurisdictions do not allow certain limitations of liability, so some limitations may not apply to you.</p><h2>18. Indemnification</h2><p>You agree to defend, indemnify, and hold harmless NWANA, its board members, officers, directors, volunteers, employees, contractors, officials, instructors, coaches, organizers, affiliates, sponsors, and partners from and against claims, damages, losses, liabilities, costs, and expenses arising from or related to: your use of NWANA websites; your participation in NWANA activities; information or content you submit; your violation of these Terms of Use; your violation of NWANA rules or policies; your violation of applicable law; your infringement of third-party rights; your conduct toward other participants, users, or organizations.</p><h2>19. Privacy</h2><p>Use of NWANA websites is also governed by NWANA's Privacy Policy. NWANA may collect, use, process, and share information as described in the Privacy Policy and as reasonably needed to operate programs, events, registrations, donations, licenses, certifications, communications, and organizational activity.</p><h2>20. Changes to These Terms</h2><p>NWANA may update these Terms of Use from time to time. Updated terms will be posted on this page with a revised effective date. Continued use of NWANA websites, registrations, donations, programs, licenses, certifications, or services after updates are posted means you accept the updated Terms of Use.</p><h2>21. Governing Law</h2><p>These Terms of Use are governed by the laws of the United States and, where applicable, the laws of the state in which NWANA is organized or operates, without regard to conflict-of-law principles. Any dispute related to these Terms of Use, NWANA websites, or NWANA digital services shall be handled in a proper court or forum with jurisdiction, unless another agreement, waiver, registration term, or platform term applies.</p><h2>22. Contact NWANA</h2><p>For questions about these Terms of Use, contact NWANA: Email: info@nwaofna.org. Subject line: Terms of Use Question</p>
    </div></div>
    <div style="margin-top:34px"><div class="card"><h3>Contact NWANA</h3><p>For questions about these Terms of Use, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Terms of Use Question</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Terms%20of%20Use%20Question">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Terms of Use", "terms", content, "NWANA Terms of Use: rules for using NWANA websites and digital services.");
}
// ---------------- 9. /terms-conditions (Terms & Conditions, VERBATIM) ----------------

export async function termsConditionsPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Terms &amp; Conditions</div><h1>Terms &amp; Conditions</h1><p>These Terms &amp; Conditions apply to registrations, programs, events, challenges, licenses, certifications, donations, sponsorships, purchases, forms, applications, and other transactions or activities offered by the Nordic Walking Association of North America (NWANA, we, us, or our). By registering, donating, purchasing, applying, participating, submitting information, or using NWANA services, you agree to these Terms &amp; Conditions.</p></div></div>
  <div class="section"><div class="wrap">
    <p style="color:var(--muted);font-size:15px;margin-bottom:22px"><strong>Effective Date:</strong> August 10, 2026</p>
    <div class="article"><div class="body">
      <h2>1. Scope</h2><p>These Terms &amp; Conditions apply to NWANA activities including, but not limited to: Nordic Walking events, competitions, challenges, and programs; instructor, coach, official, organizer, and volunteer programs; licenses, certifications, renewals, and applications; donations and fundraising campaigns; sponsorship and partnership activities; educational programs, courses, workshops, and training; forms, waivers, submissions, and digital communications; purchases or payments made through NWANA or third-party platforms used by NWANA. Additional terms may apply to specific events, programs, courses, licenses, certifications, donations, or purchases. If specific terms are shown during registration or payment, those terms also apply.</p><h2>2. Use of RunSignup and Third-Party Platforms</h2><p>NWANA may use RunSignup and related platform tools to manage registrations, donations, payments, event pages, license pages, communications, results, and reporting. When you complete a transaction through RunSignup or another third-party platform, you may also be subject to that platform's terms, privacy policy, payment terms, processing fees, and technical rules. NWANA is not responsible for third-party platform outages, payment processing issues, account access problems, technical errors, or platform policies.</p><h2>3. Accuracy of Information</h2><p>You are responsible for providing accurate, complete, and current information when registering, donating, applying, purchasing, submitting forms, or communicating with NWANA. This includes, when applicable: name; contact information; age or date of birth; emergency contact; event category; license or certification information; team, club, group, or organization affiliation; waiver acknowledgments; payment information; application answers; submitted results or activity records. NWANA may deny, correct, suspend, remove, or cancel a registration, result, license, certification, application, or participation record if information is false, incomplete, misleading, unauthorized, or inconsistent with NWANA requirements.</p><h2>4. Eligibility</h2><p>Some NWANA activities may have eligibility requirements based on age, category, license status, certification status, training completion, safety requirements, event rules, location, role, or other criteria. You are responsible for reviewing and meeting all applicable eligibility requirements before registering, applying, purchasing, or participating. NWANA may verify eligibility and may deny or remove participation if eligibility requirements are not met.</p><h2>5. Youth Participants</h2><p>Youth participants may be required to register through a parent, guardian, coach, instructor, team leader, school representative, or authorized adult. Parents and guardians are responsible for reviewing event details, safety information, waivers, rules, communications, and participation requirements before allowing a minor to participate. NWANA may require additional permissions, waivers, supervision, or documentation for youth participation.</p><h2>6. Assumption of Risk</h2><p>Nordic Walking, walking programs, sport activities, events, competitions, challenges, training, and related activities involve physical effort and inherent risks. Risks may include, but are not limited to: falls; collisions; uneven surfaces; weather conditions; heat, cold, rain, snow, wind, or poor visibility; dehydration; fatigue; overuse injuries; equipment-related risks; traffic or course hazards; contact with other participants, spectators, volunteers, or officials; health-related incidents. By participating, you understand and accept these risks. You are responsible for participating within your ability, using appropriate equipment, following safety instructions, and stopping if you feel unsafe, injured, ill, or unwell.</p><h2>7. No Medical Advice</h2><p>NWANA does not provide medical advice, diagnosis, treatment, physical therapy, rehabilitation, or healthcare services. Information related to health, wellness, sport, training, safety, injury prevention, movement, or physical activity is provided for general educational purposes only. You should consult a qualified healthcare provider before beginning any physical activity program, especially if you have a medical condition, injury, disability, health concern, or have been inactive.</p><h2>8. Waivers and Releases</h2><p>Specific events, programs, courses, registrations, applications, or activities may require separate waivers, releases, acknowledgments, or agreements. By completing a registration or application, you agree to any waiver, release, acknowledgment, or terms presented during that process. If a waiver is required and not completed, NWANA may deny participation.</p><h2>9. Rules, Conduct, and Safety</h2><p>Participants, athletes, license holders, instructors, coaches, officials, volunteers, organizers, sponsors, partners, parents, guardians, and spectators must follow applicable NWANA rules, codes of conduct, safety standards, event instructions, policies, and platform requirements. NWANA may deny, suspend, remove, disqualify, or restrict participation, access, registration, results, rankings, licenses, certifications, credentials, or privileges for conduct that violates NWANA rules, policies, safety expectations, event requirements, or applicable law.</p><h2>10. Events, Programs, and Schedule Changes</h2><p>NWANA may change, postpone, reschedule, modify, convert, or cancel events, programs, courses, challenges, competitions, or activities due to weather, safety, low participation, operational needs, venue issues, emergencies, public health concerns, technical issues, or other circumstances. NWANA may also change distances, formats, categories, routes, schedules, start times, locations, rules, or participation requirements when needed. NWANA is not responsible for travel, lodging, missed work, personal expenses, or other costs related to changes, postponements, cancellations, or participation decisions.</p><h2>11. Results, Rankings, and Records</h2><p>NWANA may publish results, rankings, standings, awards, team records, club records, city records, submitted activity records, and related participation information. NWANA may correct, revise, remove, or update results, rankings, standings, or records when errors, eligibility issues, rule violations, technical problems, or verification concerns are identified. Publication of results or rankings does not guarantee awards, recognition, license approval, certification, future eligibility, or continued listing.</p><h2>12. Licenses and Certifications</h2><p>NWANA may offer licenses, certifications, credentials, renewals, training programs, and related applications. A NWANA license or certification is an organization-issued credential. It is not a government-issued medical, healthcare, physical therapy, athletic training, or professional state license. NWANA licenses and certifications may be subject to: application requirements; training completion; exams or assessments; payment of fees; renewal requirements; conduct standards; continuing education; safety requirements; scope limitations; review, suspension, or revocation. NWANA may deny, suspend, revoke, or refuse renewal of a license or certification for failure to meet requirements, policy violations, misconduct, false information, nonpayment, safety concerns, or other reasons determined by NWANA.</p><h2>13. Payments and Fees</h2><p>NWANA may collect registration fees, license fees, certification fees, course fees, donation payments, sponsorship payments, merchandise payments, or other payments. All fees are shown at the time of transaction or in the applicable program information. Fees may change at any time. Third-party platform processing fees may apply and may be non-refundable. You are responsible for reviewing all charges before completing payment.</p><h2>14. Refunds</h2><p>Unless a specific refund policy states otherwise, NWANA payments may be non-refundable. This may include: event registrations; challenge registrations; course fees; license fees; certification fees; application fees; donations; sponsorship payments; merchandise purchases; processing fees. Refunds, credits, transfers, or deferrals may be offered only when stated in the specific event, program, or transaction terms or approved by NWANA in writing. Donations are generally non-refundable unless required by law or approved by NWANA due to error or special circumstances.</p><h2>15. Donations</h2><p>Donations may be used to support NWANA's mission, programs, sport development, education, events, safety, outreach, operations, community programs, health and wellness initiatives, and related organizational purposes. If a donation campaign identifies a specific purpose, NWANA will make reasonable efforts to use funds for that purpose. If the original purpose becomes impractical, unavailable, completed, or no longer needed, NWANA may redirect funds to a related organizational purpose consistent with NWANA's mission. Donation recognition, donor listings, campaign thermometers, and public acknowledgments may be offered at NWANA's discretion.</p><h2>16. Sponsorships and Partnerships</h2><p>Sponsorship and partnership opportunities may be subject to separate written terms, package descriptions, approval requirements, payment terms, deliverables, timelines, and brand-use rules. NWANA may decline, modify, or terminate sponsorship or partnership participation if it conflicts with NWANA's mission, values, policies, safety standards, legal obligations, or reputation. Sponsorship or partnership participation does not grant ownership, control, governance rights, endorsement rights, or exclusive rights unless specifically agreed in writing.</p><h2>17. Merchandise and Digital Materials</h2><p>NWANA may offer merchandise, downloads, educational materials, documents, forms, guides, or digital resources. Availability, pricing, delivery timing, formats, and product details may change. Digital materials, training materials, documents, and downloads may be for personal or authorized use only and may not be copied, resold, redistributed, or modified without written permission from NWANA.</p><h2>18. Intellectual Property</h2><p>NWANA names, logos, marks, materials, rulebooks, documents, educational content, training materials, website content, images, videos, designs, and other resources are owned by NWANA or used with permission unless otherwise stated. You may not use NWANA names, logos, brand assets, event names, program names, training materials, or official marks for commercial, public, promotional, or organizational purposes without written permission from NWANA.</p><h2>19. Photos, Video, and Media</h2><p>NWANA activities may include photography, video, livestreams, interviews, screenshots, social media posts, or other media. By participating in NWANA activities, you understand that you may appear in photos, videos, or event media. NWANA may use event-related or program-related media for promotion, education, reporting, fundraising, sponsor communication, media coverage, historical records, and organizational development. Parents or guardians may contact NWANA with concerns regarding youth participant media use.</p><h2>20. Communications</h2><p>By registering, donating, applying, purchasing, submitting a form, or participating in NWANA activities, you may receive communications related to your transaction, registration, license, certification, donation, event, program, safety, policy updates, or organizational activity. You may unsubscribe from promotional communications where an unsubscribe option is provided. Operational, safety, legal, payment, registration, event, license, or certification messages may still be necessary.</p><h2>21. Prohibited Conduct</h2><p>You may not: submit false or misleading information; register another person without authority; misuse NWANA systems, names, logos, or materials; interfere with events, programs, rankings, results, or operations; harass, threaten, abuse, or endanger others; violate safety rules or event instructions; misuse licenses, certifications, or credentials; copy, resell, or redistribute NWANA materials without permission; use NWANA activities or platforms for fraud, spam, harassment, or unlawful conduct. NWANA may restrict or remove access or participation for prohibited conduct.</p><h2>22. Privacy</h2><p>NWANA's use of personal information is described in the NWANA Privacy Policy. By using NWANA websites, registering, donating, applying, purchasing, or participating, you acknowledge that NWANA may collect and use information as described in the Privacy Policy and as reasonably necessary to operate NWANA activities.</p><h2>23. Limitation of Liability</h2><p>To the fullest extent permitted by law, NWANA, its board members, officers, directors, volunteers, employees, contractors, officials, instructors, coaches, organizers, affiliates, sponsors, and partners shall not be liable for indirect, incidental, consequential, special, punitive, or exemplary damages arising from or related to participation, registration, donations, purchases, licenses, certifications, website use, third-party platforms, results, rankings, communications, or NWANA activities. Some jurisdictions do not allow certain limitations of liability, so some limitations may not apply.</p><h2>24. Changes to These Terms &amp; Conditions</h2><p>NWANA may update these Terms &amp; Conditions at any time. Updates will be posted on this page with a revised effective date. Continued registration, participation, donation, purchase, application, or use of NWANA services after updates are posted means you accept the updated Terms &amp; Conditions.</p><h2>25. Contact NWANA</h2><p>For questions about these Terms &amp; Conditions, contact NWANA: Email: info@nwaofna.org. Subject line: Terms &amp; Conditions Question</p>
    </div></div>
    <div style="margin-top:34px"><div class="card"><h3>Contact NWANA</h3><p>For questions about these Terms &amp; Conditions, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Terms &amp; Conditions Question</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Terms%20%26%20Conditions%20Question">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Terms and Conditions", "terms-conditions", content, "NWANA Terms & Conditions for registrations, programs, events, licenses, donations, and purchases.");
}

// ---------------- 10. /code-of-conduct (Code of Conduct, VERBATIM) ----------------

export async function codeOfConductPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Code of Conduct</div><h1>Code of Conduct</h1><p>The Nordic Walking Association of North America (NWANA, we, us, or our) is committed to creating a safe, respectful, fair, and welcoming environment for all participants, athletes, license holders, instructors, coaches, officials, volunteers, organizers, donors, sponsors, partners, parents, guardians, and spectators. This Code of Conduct applies to all NWANA programs, events, competitions, challenges, training activities, certification activities, license activities, meetings, communications, online spaces, and related organizational activities. By participating in NWANA activities, representing NWANA, holding a NWANA license or certification, volunteering, organizing, sponsoring, donating, or interacting with NWANA programs or communities, you agree to follow this Code of Conduct.</p></div></div>
  <div class="section"><div class="wrap">
    <p style="color:var(--muted);font-size:15px;margin-bottom:22px"><strong>Effective Date:</strong> August 10, 2026</p>
    <div class="article"><div class="body">
      <h2>1. Core Principles</h2><p>Everyone involved with NWANA is expected to act with: respect; fairness; honesty; safety awareness; sportsmanship; inclusion; accountability; integrity; responsibility toward the community. NWANA expects all individuals to help build a positive culture for Nordic Walking in North America.</p><h2>2. Respectful Behavior</h2><p>All individuals must treat others with respect, dignity, and courtesy. This includes respecting: participants of all ages and abilities; beginners and experienced athletes; instructors, coaches, officials, organizers, and volunteers; parents, guardians, families, and spectators; people of different backgrounds, cultures, languages, identities, beliefs, and physical abilities; partner organizations, sponsors, venues, and host communities. Disagreements should be handled calmly, respectfully, and through appropriate channels.</p><h2>3. Safety First</h2><p>Safety is a shared responsibility. Participants, athletes, instructors, coaches, officials, volunteers, organizers, and spectators must follow applicable safety rules, event instructions, venue rules, equipment guidance, and NWANA safety standards. Individuals should not knowingly create unsafe conditions, ignore safety instructions, pressure others to participate beyond their ability, or continue activity when injury, illness, weather, course conditions, or other risks make participation unsafe. If you see a safety concern, report it to the appropriate NWANA representative, event organizer, official, instructor, coach, or volunteer.</p><h2>4. Fair Play and Sportsmanship</h2><p>NWANA expects fair play and good sportsmanship in all programs, events, challenges, competitions, rankings, and team activities. Participants must not cheat, falsify results, manipulate rankings, misrepresent age, category, identity, team affiliation, license status, certification status, or eligibility. Athletes and teams must respect officials, course rules, timing procedures, event instructions, and final decisions made through proper NWANA processes. Winning, ranking, recognition, or personal goals never justify dishonest, unsafe, abusive, or disrespectful behavior.</p><h2>5. Inclusion and Non-Discrimination</h2><p>NWANA welcomes individuals who want to participate in Nordic Walking, sport, wellness, education, community programs, and related activities. NWANA does not tolerate discrimination, harassment, exclusion, or abusive conduct based on race, color, national origin, ethnicity, religion, sex, gender identity, sexual orientation, age, disability, veteran status, language, culture, economic status, physical ability, or any other protected or personal characteristic. Reasonable differences in eligibility, categories, safety requirements, training requirements, or event rules may apply where needed for fairness, safety, age grouping, competition structure, or program integrity.</p><h2>6. Harassment, Abuse, and Bullying</h2><p>NWANA does not tolerate harassment, abuse, bullying, intimidation, threats, stalking, hazing, unwanted physical contact, sexual misconduct, exploitation, retaliation, or other harmful behavior. This applies in person, online, by email, by phone, through social media, in messaging platforms, during events, during training, during travel connected to NWANA activities, and in any NWANA-related setting. Any concern involving abuse, harassment, youth protection, participant safety, or serious misconduct should be reported promptly.</p><h2>7. Youth Protection</h2><p>Adults working with or around youth participants must act with care, professionalism, and appropriate boundaries. Parents, guardians, instructors, coaches, officials, volunteers, organizers, and NWANA representatives must follow applicable youth safety rules, SafeSport principles, reporting expectations, supervision standards, and conduct requirements. Adults must not exploit, manipulate, isolate, endanger, or engage in inappropriate relationships or communications with youth participants. Youth safety concerns should be reported immediately through the appropriate NWANA reporting channel and, where required, to law enforcement or child protection authorities.</p><h2>8. Instructor, Coach, Official, and Organizer Responsibilities</h2><p>NWANA instructors, coaches, officials, organizers, volunteers, and representatives have additional responsibility because they influence participant safety, trust, and the reputation of NWANA. They must: act within the scope of their role, license, certification, training, and authority; avoid making false claims about qualifications, licenses, certifications, titles, or NWANA approval; teach, coach, judge, organize, or lead responsibly and safely; avoid conflicts of interest where possible; disclose conflicts when appropriate; treat participants fairly; protect confidential or sensitive information; avoid favoritism, manipulation, exploitation, or misuse of authority; report safety, conduct, or policy concerns when required. A NWANA license or certification is an organization-issued credential. It is not a government-issued medical, healthcare, physical therapy, athletic training, or professional state license.</p><h2>9. Health, Wellness, and Medical Boundaries</h2><p>NWANA activities may include health, wellness, movement, sport, education, and training content. NWANA participants, instructors, coaches, license holders, volunteers, and representatives must not present NWANA programs as medical treatment, diagnosis, physical therapy, rehabilitation, or healthcare unless they separately hold the required professional license and are acting within that lawful professional scope. NWANA instructors and coaches may teach Nordic Walking technique, safety, group activity, athletic progression, sport preparation, and wellness-oriented movement within the scope of their NWANA training. Participants with medical conditions, injuries, disabilities, or health concerns should consult qualified healthcare providers before participating.</p><h2>10. Anti-Doping and Clean Sport</h2><p>NWANA supports clean sport principles. Athletes, coaches, instructors, officials, organizers, and support personnel must not encourage, assist, conceal, or participate in doping, banned substance misuse, result manipulation, or conduct that undermines sport integrity. Participants in higher-level competition may be required to follow anti-doping education, testing, or eligibility requirements established by NWANA, event organizers, or applicable sport authorities.</p><h2>11. Alcohol, Drugs, and Impairment</h2><p>Participants, instructors, coaches, officials, volunteers, organizers, and representatives must not participate in, lead, judge, supervise, coach, or organize NWANA activities while impaired by alcohol, drugs, medication misuse, or any substance that creates a safety risk or impairs judgment. Illegal drug use, unsafe substance use, or substance-related conduct that endangers others is prohibited at NWANA activities.</p><h2>12. Communications and Online Conduct</h2><p>NWANA expects respectful conduct in all communications, including email, phone, text messages, social media, online groups, registration platforms, comments, forums, and digital meetings. Do not use NWANA-related communications to harass, threaten, insult, defame, shame, exploit, spam, impersonate, mislead, or abuse others. NWANA may moderate, remove, restrict, or report harmful, misleading, abusive, or inappropriate communications connected to NWANA activities or platforms.</p><h2>13. Privacy and Confidentiality</h2><p>Individuals may receive personal, private, sensitive, safety-related, youth-related, financial, or organizational information through NWANA activities. Such information must be handled responsibly and used only for appropriate NWANA purposes. Do not share private participant information, youth information, contact details, reports, internal documents, donation information, incident details, or confidential communications unless authorized or required by law, safety, reporting, or NWANA policy.</p><h2>14. Conflicts of Interest</h2><p>Individuals representing NWANA or acting in official roles should avoid conflicts of interest and disclose conflicts when appropriate. This includes situations involving judging, awards, rankings, licensing, certification, vendor selection, sponsorship, discipline, complaints, family relationships, financial interests, or personal relationships that could affect fairness or trust. NWANA may require recusal, disclosure, reassignment, review, or other action to protect integrity.</p><h2>15. Use of NWANA Name, Logo, and Authority</h2><p>No person may misuse the NWANA name, logo, brand assets, titles, licenses, certifications, materials, or official status. Individuals may not claim to represent NWANA, approve events, issue licenses, certify others, speak on behalf of NWANA, use NWANA branding, or create official NWANA programs unless authorized. Use of NWANA branding, materials, logos, or titles must follow NWANA approval, brand guidelines, and applicable license or certification terms.</p><h2>16. Reporting Concerns</h2><p>NWANA encourages reporting of safety concerns, misconduct, harassment, abuse, discrimination, bullying, policy violations, conflicts of interest, suspected result manipulation, or other conduct concerns. Reports should include as much relevant information as possible, such as: names of individuals involved; date, time, and location; event or program name; description of the concern; witnesses, if any; supporting documents, screenshots, messages, photos, or other evidence. For urgent danger, medical emergencies, abuse, threats, or criminal conduct, contact emergency services or appropriate authorities immediately.</p><h2>17. No Retaliation</h2><p>NWANA does not tolerate retaliation against anyone who makes a good-faith report, participates in a review, asks a safety question, raises a policy concern, or supports another person in reporting. Retaliation may include threats, harassment, exclusion, intimidation, punishment, public shaming, loss of opportunity, or other negative treatment because someone raised a concern.</p><h2>18. Review and Enforcement</h2><p>NWANA may review conduct concerns, safety concerns, reports, complaints, or policy violations. NWANA may take action when appropriate, including but not limited to: warning; education or corrective action; removal from an event or program; disqualification; result correction or removal; suspension of participation; restriction from NWANA activities; denial, suspension, or revocation of licenses or certifications; removal from volunteer, official, instructor, coach, organizer, or leadership roles; referral to law enforcement or appropriate authorities where required. NWANA may act immediately when needed to protect safety, youth participants, participants, the public, or the integrity of NWANA activities.</p><h2>19. Cooperation</h2><p>Participants, license holders, instructors, coaches, officials, volunteers, organizers, and representatives are expected to cooperate with reasonable NWANA reviews, safety inquiries, eligibility checks, conduct reviews, and policy enforcement. Failure to cooperate may result in restriction, suspension, removal, or other action.</p><h2>20. Updates to This Code</h2><p>NWANA may update this Code of Conduct from time to time. Updates will be posted on this page with a revised effective date. Continued participation in NWANA activities after updates are posted means you acknowledge the updated Code of Conduct.</p><h2>21. Contact NWANA</h2><p>For questions or concerns related to this Code of Conduct, contact NWANA: Email: info@nwaofna.org. Subject line: Code of Conduct Concern</p>
    </div></div>
    <div style="margin-top:34px"><div class="card"><h3>Contact NWANA</h3><p>For questions or concerns related to this Code of Conduct, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Code of Conduct Concern</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Code%20of%20Conduct%20Concern">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Code of Conduct", "code-of-conduct", content, "NWANA Code of Conduct: respect, safety, fair play, youth protection, reporting, and enforcement.");
}
// ---------------- 11. /safesport (Safe Sport Policy, VERBATIM) ----------------

export async function safesportPage(): Promise<string> {
	const intro = "The Nordic Walking Association of North America (NWANA, we, us, or our) is committed to providing a safe, respectful, and protective environment for all participants, including youth athletes, adult participants, instructors, coaches, officials, volunteers, organizers, parents, guardians, donors, sponsors, and partners. This Safe Sport Policy applies to NWANA programs, events, competitions, challenges, training activities, certification activities, license activities, meetings, communications, online spaces, and related organizational activities. NWANA expects every person involved in its activities to help prevent abuse, harassment, misconduct, bullying, discrimination, retaliation, and unsafe behavior.";
	const sections: [number, string, string][] = [
		[1, "Purpose", "The purpose of this Safe Sport Policy is to protect participants and create a culture of safety, respect, accountability, and trust. NWANA's Safe Sport standards are intended to: protect youth and vulnerable participants; promote safe adult-youth interactions; prevent abuse, harassment, bullying, and misconduct; establish reporting expectations; support appropriate boundaries; guide instructors, coaches, officials, organizers, and volunteers; protect the integrity of NWANA programs and events."],
		[2, "Who Must Follow This Policy", "This policy applies to: participants and athletes; youth participants; parents and guardians; instructors and coaches; license holders; officials and judges; volunteers; organizers and event staff; board members and organizational leaders; sponsors and partners when involved in NWANA activities; spectators and guests at NWANA activities."],
		[3, "Prohibited Conduct", "NWANA does not tolerate: sexual misconduct; physical abuse; emotional abuse; harassment; bullying; hazing; discrimination; threats or intimidation; retaliation; inappropriate adult-youth communication; inappropriate physical contact; grooming behavior; exploitation of authority; unsafe supervision; knowingly ignoring safety or misconduct concerns. This applies in person, online, by phone, by email, through social media, during events, during training, during travel connected to NWANA activities, and in any NWANA-related setting."],
		[4, "Youth Protection", "Adults involved in NWANA activities must maintain appropriate boundaries with youth participants. Adults should avoid one-on-one isolated situations with minors whenever possible. Interactions with youth should be observable, interruptible, and connected to a legitimate NWANA activity. Adults must not use their role, authority, license, certification, coaching position, volunteer position, or organizational status to manipulate, pressure, exploit, or endanger a youth participant. Parents and guardians should be informed about youth participation, schedules, supervision, travel expectations, communications, and safety procedures when applicable."],
		[5, "Communication With Minors", "Communication with minors should be appropriate, transparent, and related to NWANA activity. Adults should avoid private, inappropriate, secretive, or personal communications with minors. When possible, communications with youth participants should include a parent, guardian, another authorized adult, or use official group communication channels. Inappropriate messages, personal relationship-building, sexual content, pressure, secrecy, or grooming behavior are prohibited."],
		[6, "Physical Contact and Instruction", "Nordic Walking instruction may involve demonstrations, technical correction, equipment adjustment, or safety guidance. Any physical contact must be appropriate, limited, respectful, and connected to a legitimate instructional or safety purpose. Participants should be told what correction or adjustment is being made. Physical contact should be avoided when verbal instruction or demonstration is sufficient. Inappropriate, unnecessary, sexual, punitive, forceful, or unsafe physical contact is prohibited."],
		[7, "Supervision and Event Safety", "NWANA activities involving youth or vulnerable participants should include appropriate supervision based on the nature of the activity, participant age, location, risk level, and event format. Organizers, instructors, coaches, officials, and volunteers should take reasonable steps to maintain safe environments, including: clear check-in and check-out procedures where needed; appropriate adult supervision; safe course or training areas; emergency contact access; weather and environmental awareness; incident reporting procedures; respect for participant limits and abilities."],
		[8, "Reporting Concerns", "NWANA encourages reporting of safety concerns, misconduct, harassment, abuse, bullying, discrimination, inappropriate conduct, boundary violations, or suspected policy violations. Reports should include as much information as possible, such as: names of individuals involved; date, time, and location; event or program name; description of the concern; witnesses, if any; screenshots, messages, documents, photos, or other supporting information. For urgent danger, medical emergencies, abuse, threats, or criminal conduct, contact emergency services or appropriate authorities immediately."],
		[9, "Mandatory Reporting", "Nothing in this policy replaces any legal obligation to report suspected child abuse, abuse of a vulnerable person, sexual misconduct, or criminal conduct to law enforcement, child protection services, or other appropriate authorities. Individuals who are mandatory reporters under applicable law must comply with those legal duties. NWANA may also report concerns to appropriate authorities when required or when necessary to protect participants."],
		[10, "No Retaliation", "NWANA does not tolerate retaliation against any person who makes a good-faith report, raises a concern, participates in a review, supports another person in reporting, or asks a safety question. Retaliation may include threats, harassment, intimidation, exclusion, punishment, loss of opportunity, public shaming, or other negative treatment because someone raised a concern."],
		[11, "Review and Response", "NWANA may review reports, safety concerns, conduct concerns, or suspected policy violations. NWANA may take action when appropriate, including: warning; education or corrective action; removal from an event or program; restriction from NWANA activities; suspension of participation; disqualification; denial, suspension, or revocation of licenses or certifications; removal from instructor, coach, official, organizer, volunteer, or leadership roles; referral to law enforcement or appropriate authorities where required. NWANA may act immediately when needed to protect youth participants, participants, the public, or the integrity of NWANA activities."],
		[12, "Training and Education", "NWANA may require Safe Sport training or related safety education for certain roles, including instructors, coaches, officials, organizers, volunteers, and license holders. Training requirements may vary by role, activity, level of responsibility, and contact with youth participants. NWANA may develop and offer Safe Sport education through NWANA Academy or direct participants to approved external education resources where appropriate."],
		[13, "Responsibility of Instructors, Coaches, Officials, and Organizers", "Individuals in leadership or authority roles have a higher duty of care. Instructors, coaches, officials, organizers, volunteers, and license holders must: follow NWANA safety and conduct standards; maintain appropriate boundaries; protect youth and vulnerable participants; avoid conflicts of interest and misuse of authority; report serious concerns; cooperate with reasonable safety reviews; act in the best interest of participants and the organization."],
		[14, "Privacy and Confidentiality", "NWANA will make reasonable efforts to handle reports with care and discretion. Information may be shared when necessary to review a concern, protect participants, comply with law, involve appropriate authorities, take corrective action, or operate NWANA programs safely. NWANA cannot promise absolute confidentiality when safety, legal duties, participant protection, or organizational responsibility require disclosure."],
		[15, "Policy Updates", "NWANA may update this Safe Sport Policy from time to time. Updates will be posted on this page with a revised effective date. Continued participation in NWANA activities after updates are posted means you acknowledge the updated policy."],
		[16, "Contact NWANA", "For Safe Sport questions or concerns, contact NWANA: Email: info@nwaofna.org. Subject line: Safe Sport Concern"],
	];
	const content = `
  ${pageHead("SafeSport", "Safe Sport Policy", intro)}
  <div class="section"><div class="wrap">
    ${effectiveDate("August 10, 2026")}
    <div class="article"><div class="body">
      ${sections.map(([n, t, b]) => `<h2>${n}. ${esc(t)}</h2><p>${esc(b)}</p>`).join("")}
    </div></div>
    <div style="margin-top:34px">${contactCard("Safe Sport Concern", "For Safe Sport questions or concerns, contact NWANA.")}</div>
  </div></div>`;

	return layout("Safe Sport Policy", "safesport", content, "NWANA Safe Sport Policy: participant protection, youth safety, reporting expectations, and safe program culture.");
}

// ---------------- 12. /anti-doping (Anti-Doping Policy, VERBATIM) ----------------

export async function antiDopingPage(): Promise<string> {
	const intro = "The Nordic Walking Association of North America (NWANA, we, us, or our) supports clean sport, fair competition, athlete education, and sport integrity. This Anti-Doping Policy applies to NWANA athletes, participants, license holders, instructors, coaches, officials, organizers, volunteers, teams, and any person involved in NWANA sport activities, competitions, challenges, training, rankings, or representative pathways. NWANA uses anti-doping education to help participants understand clean sport principles and their responsibilities as Nordic Walking develops as a competitive sport in North America.";
	const sections: [number, string, string][] = [
		[1, "Purpose", "The purpose of this Anti-Doping Policy is to: promote clean and fair competition; educate athletes and support personnel; discourage doping, banned substance misuse, and result manipulation; protect athlete health and safety; support sport integrity; prepare athletes for higher levels of competition; establish basic anti-doping education expectations for NWANA participation."],
		[2, "Clean Sport Commitment", "NWANA expects all participants to compete and participate honestly, safely, and fairly. Athletes, instructors, coaches, officials, organizers, and support personnel must not encourage, assist, conceal, or participate in doping, banned substance misuse, prohibited methods, result manipulation, or conduct that undermines clean sport."],
		[3, "Education-Based Approach", "NWANA's anti-doping approach begins with education. At the current stage of Nordic Walking Sport development in North America, NWANA uses a two-level education pathway: Level 1: Basic Anti-Doping Education; Level 2: Elite / International Anti-Doping Education. These education steps are designed to be simple, scalable, and appropriate for a developing sport system."],
		[4, "Level 1: Required Basic Education", "NWANA may require athletes and license holders to complete basic anti-doping education before participating in certain NWANA sport activities, rankings, competitions, or license-based eligibility programs. For Level 1, NWANA may use the WADA Play True Quiz as a baseline education tool. Level 1 is intended to help participants understand: clean sport principles; athlete responsibility; fair competition; risks of prohibited substances; importance of checking medications and supplements; basic anti-doping awareness. Participants may be asked to save a certificate, screenshot, or other completion proof."],
		[5, "Level 2: Elite / International Pathway", "Athletes entering elite, national team, representative, or international participation pathways may be required to complete additional anti-doping education. For Level 2, NWANA may direct athletes to WADA ADEL education modules or other appropriate clean sport education resources. Level 2 may apply to: elite athlete pathways; national team consideration; international event participation; representative team participation; higher-level competition; athletes selected or invited for advanced NWANA sport opportunities. NWANA may request proof of completion before confirming eligibility, selection, ranking status, or participation."],
		[6, "Proof of Completion", "NWANA may require athletes, license holders, instructors, coaches, or support personnel to provide proof of anti-doping education completion. Acceptable proof may include: certificate; screenshot; completion record; confirmation from an education platform; upload through a NWANA course or license process. NWANA may provide an upload process through NWANA Academy, a license application, a course lesson, or another official NWANA form."],
		[7, "Athlete and Support Personnel Responsibility", "Athletes are responsible for what they use, consume, and submit in competition or training. Coaches, instructors, officials, organizers, team leaders, parents, guardians, and support personnel should not encourage or assist any athlete in using banned substances, unsafe supplements, prohibited methods, or dishonest practices. All participants are encouraged to be careful with: medications; supplements; injections; recovery products; performance claims; substances provided by others; products that may contain undisclosed ingredients. When in doubt, athletes should seek qualified guidance from appropriate medical or anti-doping resources."],
		[8, "Supplements and Medications", "NWANA does not approve, certify, recommend, or guarantee the safety or legality of supplements, medications, recovery products, or performance products. Athletes should understand that supplements may carry contamination or labeling risks. Use of a medication or supplement does not remove an athlete's responsibility for compliance with applicable anti-doping rules in competitions where such rules apply."],
		[9, "Competition and Event Requirements", "Specific NWANA events, competitions, rankings, teams, or representative pathways may include additional anti-doping requirements. These may include: completion of anti-doping education; certificate upload; eligibility review; signed acknowledgments; compliance with event rules; compliance with applicable governing body or international rules; cooperation with testing or review procedures where applicable. Failure to meet anti-doping requirements may affect eligibility, ranking, selection, license status, results, or participation."],
		[10, "Prohibited Conduct", "NWANA may take action if a person engages in conduct that undermines clean sport, including: use of prohibited substances or methods where applicable rules prohibit them; encouraging doping or substance misuse; providing prohibited substances to athletes; falsifying education proof; refusing required education or compliance steps; manipulating results or eligibility; concealing anti-doping violations; retaliating against a person who reports a concern; interfering with a review or investigation."],
		[11, "Review and Enforcement", "NWANA may review anti-doping concerns, eligibility questions, education completion issues, or suspected clean sport violations. NWANA may take action when appropriate, including: education or warning; requirement to complete or repeat education; removal from rankings; disqualification from an event or challenge; denial of eligibility; suspension from participation; denial, suspension, or revocation of a NWANA license or certification; removal from team, representative, instructor, coach, official, or organizer roles; referral to appropriate sport authorities where applicable. NWANA may act immediately when needed to protect athletes, competition fairness, sport integrity, or the reputation of NWANA."],
		[12, "Reporting Concerns", "NWANA encourages reporting of clean sport concerns, suspected doping, unsafe supplement practices, result manipulation, falsified education proof, or other sport integrity concerns. Reports should include as much relevant information as possible, such as: name of the person involved; event or program; date and location; description of the concern; witnesses, if any; supporting documents, screenshots, messages, photos, or other evidence."],
		[13, "No Retaliation", "NWANA does not tolerate retaliation against anyone who raises a good-faith anti-doping, clean sport, safety, or integrity concern. Retaliation may result in restriction, suspension, removal, license action, or other disciplinary action."],
		[14, "Relationship to WADA", "NWANA may use education tools and resources provided by the World Anti-Doping Agency (WADA), including the WADA Play True Quiz and WADA ADEL platform. Use of WADA education tools does not mean that NWANA is WADA, is operated by WADA, or is an official WADA representative. Participants should review WADA resources directly for current anti-doping education and information."],
		[15, "Policy Updates", "NWANA may update this Anti-Doping Policy from time to time as NWANA sport programs, competition levels, education systems, and participation pathways develop. Updates will be posted on this page with a revised effective date. Continued participation in NWANA activities after updates are posted means you acknowledge the updated policy."],
		[16, "Contact NWANA", "For anti-doping education questions or clean sport concerns, contact NWANA: Email: info@nwaofna.org. Subject line: Anti-Doping Question"],
	];
	const content = `
  ${pageHead("Anti-Doping", "Anti-Doping Policy", intro)}
  <div class="section"><div class="wrap">
    ${effectiveDate("August 10, 2026")}
    <div class="article"><div class="body">
      ${sections.map(([n, t, b]) => `<h2>${n}. ${esc(t)}</h2><p>${esc(b)}</p>`).join("")}
    </div></div>
    <div style="margin-top:34px">${contactCard("Anti-Doping Question", "For anti-doping education questions or clean sport concerns, contact NWANA.")}</div>
  </div></div>`;

	return layout("Anti-Doping Policy", "anti-doping", content, "NWANA Anti-Doping Policy: clean sport principles, education pathway, and athlete responsibility.");
}

// ---------------- 13. /safety (Safety Standards, VERBATIM) ----------------

export async function safetyPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Safety Standards</div><h1>Safety Standards</h1><p>The Nordic Walking Association of North America (NWANA, we, us, or our) is committed to promoting safe participation in Nordic Walking programs, events, challenges, competitions, training activities, and community initiatives. These Safety Standards apply to NWANA participants, athletes, license holders, instructors, coaches, officials, organizers, volunteers, teams, clubs, partners, parents, guardians, spectators, and any person involved in NWANA activities. Nordic Walking is an accessible activity, but it still involves movement, equipment, outdoor environments, weather, surfaces, traffic, fatigue, and other risks. Safety is a shared responsibility.</p></div></div>
  <div class="section"><div class="wrap">
    <p style="color:var(--muted);font-size:15px;margin-bottom:22px"><strong>Effective Date:</strong> August 10, 2026</p>
    <div class="article"><div class="body">
      <h2>1. Purpose</h2><p>The purpose of these Safety Standards is to: reduce avoidable risks; support safe participation; guide organizers, instructors, coaches, officials, volunteers, and participants; promote responsible event and program planning; establish basic expectations for weather, equipment, routes, supervision, and emergency readiness; protect participants, youth, volunteers, spectators, and the public.</p><h2>2. Shared Responsibility</h2><p>Everyone involved in NWANA activities has a role in safety. Participants are responsible for participating within their ability, using appropriate equipment, following instructions, and stopping if they feel unsafe, injured, ill, or unwell. Instructors, coaches, organizers, officials, and volunteers are responsible for taking reasonable steps to create safe environments, communicate expectations, monitor conditions, and respond appropriately to concerns. Parents and guardians are responsible for helping youth participants understand rules, safety expectations, equipment needs, and appropriate conduct.</p><h2>3. Participant Readiness</h2><p>Participants should consider their health, physical readiness, experience, equipment, weather conditions, and course environment before participating. Participants should not begin or continue activity if they feel unsafe, dizzy, faint, ill, injured, unusually short of breath, confused, severely fatigued, or otherwise unable to participate safely. Participants with medical conditions, injuries, disabilities, pregnancy, recent illness, recent surgery, or long periods of inactivity should consult a qualified healthcare provider before participating. NWANA does not provide medical clearance, medical diagnosis, treatment, physical therapy, rehabilitation, or healthcare services.</p><h2>4. Equipment Safety</h2><p>Participants should use equipment that is appropriate for Nordic Walking and suitable for the activity, environment, and surface. This may include: properly sized Nordic Walking poles; secure straps or grips; appropriate tips or paws for the surface; comfortable walking or athletic footwear; weather-appropriate clothing; visibility items when needed; hydration or nutrition when appropriate; phone, ID, or emergency information when appropriate. Participants should inspect poles, straps, tips, shoes, and other equipment before activity. Damaged, unsafe, or inappropriate equipment should not be used.</p><h2>5. Technique and Control</h2><p>Participants should use technique appropriate to their ability and the activity format. Instructors and coaches should teach safe progression, basic technique, spacing, warm-up, cool-down, pacing, and control. Participants should avoid unsafe pole use, sudden stops, crowding, swinging poles near others, blocking paths, crossing poles dangerously, or moving faster than conditions allow. In group settings, participants should maintain appropriate spacing and be aware of people in front, behind, and beside them.</p><h2>6. Route and Course Safety</h2><p>Routes, courses, training areas, and event spaces should be selected with safety in mind. Organizers, instructors, coaches, and volunteers should consider: surface condition; traffic exposure; intersections and crossings; visibility; lighting; hills, turns, narrow areas, stairs, curbs, roots, gravel, ice, mud, or uneven surfaces; emergency access; rest areas; hydration access; start and finish flow; spectator areas; accessibility needs; weather exposure. Routes should be appropriate for the activity level, participant group, and event format.</p><h2>7. Weather and Environmental Conditions</h2><p>Weather and environmental conditions must be considered before and during activity. Risks may include: heat; cold; rain; snow; ice; lightning; high winds; poor air quality; smoke; humidity; low visibility; extreme sun exposure. NWANA activities may be modified, delayed, shortened, relocated, converted, postponed, or canceled when conditions create unacceptable risk. Participants should dress appropriately, hydrate, use sun protection when needed, and stop activity if weather or environmental conditions become unsafe.</p><h2>8. Heat Safety</h2><p>In hot conditions, organizers, instructors, coaches, volunteers, and participants should consider: hydration; shade; route length; pace; start time; participant age and condition; signs of heat exhaustion or heat illness; access to cooling or assistance. Participants should slow down or stop if they experience dizziness, confusion, nausea, chills, weakness, headache, cramps, or unusual fatigue.</p><h2>9. Cold, Ice, and Low-Visibility Safety</h2><p>In cold, icy, snowy, or low-visibility conditions, organizers and participants should consider: traction; appropriate footwear; pole tips suitable for the surface; reflective or visible clothing; shorter routes; daylight timing; wind chill; frostbite or hypothermia risks; safe transportation to and from activity. Activity should be modified or canceled if the surface or conditions are unsafe.</p><h2>10. Traffic and Public Spaces</h2><p>When NWANA activities take place on sidewalks, paths, trails, parks, roads, or shared public spaces, participants must respect public rules and other users. Participants should: obey traffic laws and crossing signals; use sidewalks, paths, or designated routes when available; stay alert around vehicles, cyclists, runners, pedestrians, animals, and other users; avoid blocking paths; pass safely; keep poles under control; follow organizer or volunteer instructions. Activities should not create unnecessary risk to participants or the public.</p><h2>11. Group Activities</h2><p>For group walks, training sessions, clinics, programs, or events, leaders should communicate: route or course information; expected pace; start and finish location; safety rules; emergency contact process; what to do if separated from the group; weather or equipment expectations; participant responsibilities. Groups should be managed in a way that supports safe spacing, appropriate pace, and awareness of participant ability.</p><h2>12. Youth Safety</h2><p>Activities involving youth participants should include appropriate supervision based on age, activity type, location, group size, and risk level. Parents, guardians, instructors, coaches, volunteers, and organizers should ensure that youth participants understand basic safety rules, route expectations, equipment use, and communication procedures. Youth participants should not be left unsupervised in situations where supervision is reasonably required. NWANA Safe Sport standards also apply to youth activities.</p><h2>13. Emergency Readiness</h2><p>Organizers, instructors, coaches, officials, and volunteers should consider emergency readiness before activities. Depending on the activity, this may include: emergency contact information; access to phone or communication device; first aid supplies; knowledge of route access points; emergency vehicle access; weather monitoring; incident reporting process; designated meeting point; volunteer or staff roles; plan for lost or separated participants. For larger events, additional emergency planning may be required.</p><h2>14. Incidents, Injuries, and Reporting</h2><p>Safety incidents, injuries, near misses, unsafe conditions, participant protection concerns, or serious conduct issues should be reported to NWANA or the appropriate event organizer. Reports should include: date and time; location; event or program name; names of individuals involved; description of what happened; witnesses, if any; action taken; photos, screenshots, or documents if available. For emergencies, call emergency services first.</p><h2>15. Medical Support</h2><p>NWANA activities may vary in size and risk level. Not all activities will have on-site medical personnel. Participants are responsible for their own health and should carry necessary medication, emergency information, and personal medical supplies when appropriate. Organizers should communicate whether medical support, first aid, hydration, or emergency services are available for a specific event.</p><h2>16. Accessibility and Adaptation</h2><p>NWANA supports inclusive participation where reasonable and safe. Participants with disabilities, mobility limitations, health concerns, or adaptation needs should contact NWANA or the event organizer before participating when accommodations or route information may be needed. NWANA may modify activities, routes, pace, format, or participation expectations when reasonable and appropriate, but not all activities or locations may be suitable for every participant.</p><h2>17. Instructor, Coach, Official, and Organizer Responsibility</h2><p>Individuals in leadership roles have additional responsibility to support safety. They should: act within the scope of their role, license, certification, and training; communicate safety expectations; monitor conditions; adapt activity when needed; avoid pushing participants beyond safe limits; respect participant concerns; report serious incidents; follow NWANA policies and event procedures; maintain appropriate boundaries and conduct.</p><h2>18. Event Modification or Cancellation</h2><p>NWANA or event organizers may modify, delay, shorten, relocate, convert, postpone, or cancel an activity due to safety concerns. Reasons may include: severe weather; unsafe route or course conditions; public safety issues; emergency conditions; low visibility; heat or cold risk; poor air quality; venue issues; staffing or volunteer limitations; medical or operational concerns; public authority direction. Safety decisions may be made before or during an activity.</p><h2>19. No Guarantee of Safety</h2><p>NWANA works to promote safe participation, but no activity can be made risk-free. By participating in NWANA activities, individuals understand that risks may remain even when reasonable safety measures are used. Participants are responsible for making personal decisions about whether to participate, continue, slow down, stop, or seek assistance.</p><h2>20. Policy Updates</h2><p>NWANA may update these Safety Standards from time to time. Updates will be posted on this page with a revised effective date. Continued participation in NWANA activities after updates are posted means you acknowledge the updated Safety Standards.</p><h2>21. Contact NWANA</h2><p>For safety questions, concerns, or incident reporting, contact NWANA: Email: info@nwaofna.org. Subject line: Safety Concern</p>
    </div></div>
    <div style="margin-top:34px"><div class="card"><h3>Contact NWANA</h3><p>For safety questions, concerns, or incident reporting, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Safety Concern</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Safety%20Concern">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Safety Standards", "safety", content, "NWANA Safety Standards: participant readiness, equipment, routes, weather, supervision, emergency readiness, and incident reporting.");
}
// ---------------- 14. /documents (Downloads & Reports) ----------------

export async function documentsPage(): Promise<string> {
	const intro = "The Nordic Walking Association of North America (NWANA, we, us, or our) provides this Downloads & Reports page as a central place for public documents, organizational materials, program resources, reports, forms, guides, and selected informational files. This page may include documents related to NWANA programs, events, sport development, health and wellness initiatives, licenses, certifications, safety standards, policies, media resources, partnership materials, sponsorship materials, and public organizational information.";
	const sections: [number, string, string][] = [
		[1, "Purpose of This Page", "The purpose of this page is to make important NWANA materials easier to find, review, download, and share when appropriate. Documents may be provided for: participants and athletes; instructors and coaches; officials and organizers; volunteers; donors; sponsors; partners; media contacts; parents and guardians; community organizations; public agencies; schools, clubs, and groups; people interested in Nordic Walking in North America."],
		[2, "Available Downloads", "NWANA may make the following types of materials available on this page: program descriptions; event guides; participant guides; safety documents; policy documents; license and certification information; instructor and coach resources; organizer resources; sponsorship materials; partnership materials; donation and impact materials; media documents; logos and brand files; reports; forms; public announcements; educational resources; templates and checklists. The availability of specific documents may change over time."],
		[3, "Reports", "NWANA may publish selected reports to show program development, participation, impact, fundraising progress, sport growth, community activity, or organizational updates. Reports may include: annual summaries; program impact reports; event participation reports; donation or fundraising reports; sport development updates; health and wellness program summaries; instructor and coach development updates; partner or sponsor impact summaries; public charity or organizational updates where applicable. Some reports may be public, while others may be shared only with specific donors, sponsors, partners, board members, organizers, or authorized individuals."],
		[4, "Forms", "NWANA may provide downloadable or online forms for: participant inquiries; event proposals; instructor or coach applications; license or certification requests; volunteer interest; sponsor or partner interest; incident or safety reporting; media requests; permission requests; document requests; program development inquiries. Some forms may be completed directly online. Other forms may be provided as downloadable files."],
		[5, "Document Accuracy", "NWANA works to keep documents accurate and current, but documents may change as programs, policies, events, licenses, certifications, and organizational needs develop. Users should check the effective date, version date, or publication date of any document before relying on it. If a document appears outdated, incomplete, inconsistent, or unclear, contact NWANA for confirmation."],
		[6, "Official Versions", "Documents posted on this page may be updated, replaced, or removed at any time. If there is a conflict between an older downloaded document and a newer version posted by NWANA, the newer version should generally be considered the current version unless NWANA states otherwise. Specific events, programs, registrations, licenses, certifications, or agreements may also include additional terms, waivers, rules, or requirements."],
		[7, "Permitted Use", "NWANA documents and downloads are provided for informational, educational, organizational, event, media, sponsorship, partnership, or authorized program purposes. You may download and use publicly available materials for personal or organizational reference related to NWANA activities. You may not copy, sell, modify, rebrand, redistribute, publish, or use NWANA materials for commercial or public purposes without written permission from NWANA, unless the document clearly states that such use is allowed."],
		[8, "Logos and Brand Materials", "Logos, emblems, graphics, images, and brand assets are subject to NWANA brand rules and approval requirements. Downloading a logo or brand asset does not automatically grant permission to use it in public, commercial, sponsor, partner, event, apparel, merchandise, advertising, media, or promotional materials. Use of NWANA logos or brand assets must follow NWANA approval and brand guidelines where required."],
		[9, "Third-Party Materials", "Some downloads, reports, links, or resources may refer to third-party organizations, platforms, sponsors, partners, public agencies, educational resources, or external tools. Third-party materials are provided for convenience or reference. NWANA is not responsible for third-party content, accuracy, policies, availability, or updates. Users should review third-party materials directly before relying on them."],
		[10, "Public and Restricted Materials", "Not all NWANA documents are public. Some materials may be restricted to approved instructors, coaches, officials, organizers, license holders, sponsors, partners, board members, volunteers, or authorized program participants. NWANA may deny access to restricted materials or require approval, payment, license status, certification status, training completion, or written authorization before providing certain documents."],
		[11, "No Legal, Medical, or Professional Advice", "Downloads and reports may include information related to sport, wellness, safety, policies, training, organization, governance, fundraising, sponsorship, or public education. These materials are provided for general informational purposes only and do not constitute legal, medical, financial, tax, insurance, physical therapy, rehabilitation, or other professional advice. Users should consult qualified professionals when professional advice is needed."],
		[12, "Updates to This Page", "NWANA may update this Downloads & Reports page from time to time. Documents may be added, revised, reorganized, archived, or removed. Updates will be posted on this page or through NWANA communications when appropriate."],
		[13, "Contact NWANA", "For questions about downloads, reports, forms, or document access, contact NWANA: Email: info@nwaofna.org. Subject line: Downloads & Reports Question"],
	];
	const content = `
  ${pageHead("Documents & Reports", "Downloads & Reports", intro)}
  <div class="section"><div class="wrap">
    ${effectiveDate("August 10, 2026")}
    <div class="article"><div class="body">
      ${sections.map(([n, t, b]) => `<h2>${n}. ${esc(t)}</h2><p>${esc(b)}</p>`).join("")}
    </div></div>
    <div style="margin-top:34px">${contactCard("Downloads & Reports Question", "For questions about downloads, reports, forms, or document access, contact NWANA.")}</div>
  </div></div>`;

	return layout("Downloads and Reports", "documents", content, "NWANA Downloads & Reports: public documents, reports, guides, forms, and organizational materials.");
}

// ---------------- 15. /forms ----------------

export async function formsPage(): Promise<string> {
	const intro = "The Nordic Walking Association of North America (NWANA, we, us, or our) provides this Forms page as a central access point for official NWANA forms, requests, applications, reports, and submissions. Some forms may be available directly online. Other forms may be provided as downloadable documents or handled by email until a dedicated form is available.";
	const sections: [number, string, string][] = [
		[1, "Purpose of This Page", "This page is intended to help participants, athletes, license holders, instructors, coaches, officials, volunteers, organizers, sponsors, partners, media representatives, parents, guardians, and community organizations find the correct way to submit information to NWANA. NWANA forms may be used for: questions and general inquiries; license or certification requests; instructor or coach applications; event or program proposals; sponsor and partner inquiries; volunteer interest; safety or incident reporting; media requests; document or logo requests; correction requests; feedback and suggestions."],
		[2, "Available Forms", "NWANA may provide forms for the following purposes: General Inquiry Form (for general questions about NWANA, Nordic Walking, programs, events, licenses, certifications, or participation); Instructor / Coach Inquiry Form (for people interested in becoming NWANA instructors, coaches, or licensed program leaders); Event / Program Proposal Form (for organizers, clubs, groups, schools, agencies, or partners who want to propose an event, program, challenge, clinic, or collaboration); Sponsor / Partner Inquiry Form (for organizations interested in sponsorship, partnership, visibility, program support, or collaboration with NWANA); Volunteer Interest Form (for individuals interested in helping with events, programs, outreach, media, administration, or local activities); Safety / Incident Report Form (for reporting safety concerns, incidents, injuries, misconduct, conduct issues, or participant protection concerns); Media Request Form (for press, interviews, quotes, images, logos, background information, or media coordination); Document / Brand Asset Request Form (for requesting approved logos, documents, reports, forms, or brand materials); Correction Request Form (for requesting correction of registration information, results, rankings, spelling, contact details, or other records)."],
		[3, "How Forms Are Reviewed", "Form submissions may be reviewed by NWANA staff, board members, volunteers, committee members, organizers, or authorized representatives depending on the type of request. Submitting a form does not guarantee approval, response, selection, license, certification, event approval, sponsorship, partnership, publication, or action. NWANA may request additional information before responding or making a decision."],
		[4, "Accuracy of Submissions", "You are responsible for providing accurate, complete, and current information when submitting a form. Do not submit information on behalf of another person or organization unless you have authority to do so. Do not submit confidential, private, medical, financial, youth-related, or sensitive information unless it is necessary for the purpose of the form."],
		[5, "Urgent Safety Concerns", "Forms are not a substitute for emergency services. If there is immediate danger, a medical emergency, abuse, threat, criminal conduct, or urgent safety concern, contact emergency services or appropriate authorities immediately. After urgent action is taken, NWANA may also be notified through the appropriate reporting process."],
		[6, "Privacy", "Information submitted through NWANA forms may be used to review, process, respond to, document, or act on the request. Information may be handled according to NWANA's Privacy Policy and any applicable platform policies, including RunSignup policies when forms are hosted or processed through RunSignup."],
		[7, "Contact NWANA", "If you are not sure which form to use, contact NWANA: Email: info@nwaofna.org. Subject line: Forms Question"],
	];
	const content = `
  ${pageHead("Forms", "Forms", intro)}
  <div class="section"><div class="wrap">
    ${effectiveDate("August 10, 2026")}
    <div class="article"><div class="body">
      ${sections.map(([n, t, b]) => `<h2>${n}. ${esc(t)}</h2><p>${esc(b)}</p>`).join("")}
    </div></div>
    <div style="margin-top:34px">${contactCard("Forms Question", "If you are not sure which form to use, contact NWANA.")}</div>
  </div></div>`;

	return layout("Forms", "forms", content, "NWANA Forms: inquiries, applications, proposals, reports, and submissions.");
}

// ---------------- 16. /choose-your-path ----------------

export async function chooseYourPathPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Choose Your Path</div><h1>Choose Your Path</h1><p>NWANA connects Nordic Walking education, community participation, organized sport, professional development, events, and organizational collaboration across North America. Please review all the pathways before deciding where to begin. Choose the role that best matches your interests today; you may follow additional pathways as your experience and involvement grow.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">For participants</div>
    <h2>Move, learn, compete</h2>
    <div class="grid cols-3">
      <div class="card"><h3>Learn Nordic Walking</h3><p>Build a sound technical foundation and explore structured Nordic Walking education for beginners and experienced walkers.</p><p><a class="card-link" href="https://academy.nwaofna.org">Visit the Academy →</a></p></div>
      <div class="card"><h3>Compete as an Athlete</h3><p>Enter current NWANA competitions, submit results, follow standings, and explore the rules and disciplines of Nordic Walking sport.</p><p><a class="card-link" href="https://runsignup.com/Race/FL/SaintPetersburg/NWANANWSeries">Competition Calendar →</a></p></div>
      <div class="card"><h3>Join an NW Group</h3><p>Join an NW Group in your community or organization free. Every NW Group is created and owned by NWANA, and joining takes a minute on the NW Groups site.</p><p><a class="card-link" href="https://groups.nwaofna.org/">NW Groups →</a></p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">For professionals and organizers</div>
    <h2>Teach, judge, organize</h2>
    <div class="grid cols-3">
      <div class="card"><h3>Become an Instructor or Coach</h3><p>Develop the technical and instructional knowledge needed to teach Nordic Walking, support participants, or work with athletes through NWANA education and training.</p><p><a class="card-link" href="https://runsignup.com/MemberOrg/InstructorTrainingSpecializations">Professional Pathways →</a></p></div>
      <div class="card"><h3>Become a Judge or Technical Official</h3><p>Help support fair and consistent competition through knowledge of Nordic Walking rules, technique evaluation, and event procedures. Contact NWANA to express your interest and receive current information about education and qualification opportunities.</p><p><a class="card-link" href="mailto:info@nwaofna.org?subject=Officiating%20Interest">Email: info@nwaofna.org (Officiating Interest) →</a></p></div>
      <div class="card"><h3>Organize a Nordic Walking Competition</h3><p>Work with NWANA to develop Nordic Walking competitions consistent with appropriate technical, operational, safety, and participant-protection standards. Contact NWANA before presenting or promoting an event as affiliated with, recognized by, or sanctioned by NWANA.</p><p><a class="card-link" href="mailto:info@nwaofna.org?subject=Competition%20Organization">Email: info@nwaofna.org (Competition Organization) →</a></p></div>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">For organizations and supporters</div>
    <h2>Partner, sponsor, support, serve</h2>
    <div class="grid cols-2">
      <div class="card"><h3>Partner with NWANA</h3><p>Collaborate with NWANA to develop programs, host activities, provide locations, reach communities, support education, organize events, or expand Nordic Walking opportunities. Partnership is based on practical collaboration and shared development.</p><p><a class="card-link" href="/partners">Partner Network →</a></p></div>
      <div class="card"><h3>Sponsor NWANA</h3><p>Support NWANA programs, competitions, education, local groups, instructor development, community access, or public outreach while receiving recognition appropriate to the sponsorship.</p><p><a class="card-link" href="/sponsors">Sponsors →</a></p></div>
      <div class="card"><h3>Support NWANA</h3><p>Help expand Nordic Walking opportunities through a donation, fundraising campaign, designated fund, or support for a specific NWANA program.</p><p><a class="card-link" href="/ways-to-give">Ways to Give →</a></p></div>
      <div class="card"><h3>Serve and Help Build NWANA</h3><p>Contribute your experience through volunteer service, committees, regional development, technical work, strategic projects, or organizational leadership. Opportunities depend on NWANA's current needs and may require relevant experience, qualifications, review, selection, or appointment.</p><p><a class="card-link" href="mailto:info@nwaofna.org?subject=Volunteering">Email: info@nwaofna.org (Volunteering) →</a></p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Still not sure</div>
    <h2>Still not sure where to begin?</h2>
    <p>Contact NWANA and tell us what you would like to do. We will help direct you to the most appropriate starting point.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=General%20Question">Contact NWANA</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="/contact">Contact page</a>
    </div>
    <p style="margin-top:26px">Also see: <a class="card-link" href="/elite">Elite Athletes →</a> <a class="card-link" href="/events" style="margin-left:18px">NWANA Events →</a> <a class="card-link" href="/faq" style="margin-left:18px">FAQ →</a></p>
  </div></div>`;
	return layout("Choose Your Path", "choose-your-path", content, "Choose your NWANA pathway: learn, compete, join a group, become an instructor or official, partner, sponsor, or volunteer.");
}
// ---------------- 17. /faq ----------------

export async function faqPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">FAQ</div><h1>Frequently Asked Questions</h1><p>Answers to common questions about NWANA, Nordic Walking, education, licenses, groups, competitions, partnerships, sponsorships, donations, safety, and policies.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="faq">
      <details><summary>What is NWANA?</summary><div style="margin-top:10px"><p>The Nordic Walking Association of North America (NWANA) is a U.S. nonprofit organization recognized by the Internal Revenue Service as tax-exempt under Section 501(c)(3) of the Internal Revenue Code and classified as a public charity. NWANA is the continental governing and sanctioning body for competitive Nordic Walking across North America.</p></div></details><details><summary>What does NWANA do?</summary><div style="margin-top:10px"><p>NWANA develops Nordic Walking education, professional pathways, licenses, local NW Groups, competition rules, events, results, rankings, safety standards, partnerships, sponsorships, fundraising programs, and public resources. NWANA connects participants, athletes, professionals, communities, organizations, organizers, partners, sponsors, donors, and volunteers through one developing Nordic Walking system.</p></div></details><details><summary>Where does NWANA operate?</summary><div style="margin-top:10px"><p>NWANA's primary geographic responsibility is North America, including the United States, Canada, Mexico, and the wider North American region. Some virtual competitions, educational resources, and other programs may also be available to participants outside North America when stated in the applicable program information.</p></div></details><details><summary>Where should I begin?</summary><div style="margin-top:10px"><p>Start with the <a href="/choose-your-path">Choose Your Path</a> page.</p></div></details><details><summary>I am completely new to Nordic Walking. Can I participate?</summary><div style="margin-top:10px"><p>Yes. You do not need previous Nordic Walking experience to begin. You may explore introductory education through NWANA Academy (<a href="https://academy.nwaofna.org">academy.nwaofna.org</a>), join an NW Group, or participate in an activity or competition that is open to beginners.</p></div></details><details><summary>Is NWANA education only for instructors and coaches?</summary><div style="margin-top:10px"><p>No. NWANA Academy offers education for many audiences, including beginners, participants, athletes, leaders, instructors, coaches, judges, race directors, officials, organizers, and other roles.</p></div></details><details><summary>What is the difference between a course, certification, and license?</summary><div style="margin-top:10px"><p>A course is an educational program. A certification confirms successful completion of specified education and assessments. A license is a separate NWANA authorization connected with a defined role, category, level, or scope. Completing a course or receiving a certificate does not automatically activate a license.</p></div></details><details><summary>What types of licenses does NWANA provide?</summary><div style="margin-top:10px"><p>NWANA's licensing system includes several separate areas: Athlete Licenses for competitive participation when required; Professional Licenses for instructors, coaches, judges, Race Directors, and Competition Technical Officials; and a voluntary Individual License for members who choose to hold one. Joining an NW Group is free and separate from licensing. Each license has its own purpose, eligibility requirements, scope, term, and activation process.</p></div></details><details><summary>Where can I find Athlete Licenses?</summary><div style="margin-top:10px"><p>Athlete Licenses are available through <a href="https://license.nwaofna.org">license.nwaofna.org</a>. An Athlete License is required only when the rules for a particular competition expressly require one.</p></div></details><details><summary>Is an NW Groups Individual License an Athlete License?</summary><div style="margin-top:10px"><p>No. The Individual License is a voluntary NWANA license, separate from Athlete Licenses. Joining an NW Group is free and requires no license. If an Athlete License is required for a particular competition, it is obtained separately through the NWANA athlete licensing website.</p></div></details><details><summary>What professional pathways does NWANA offer?</summary><div style="margin-top:10px"><p>NWANA is developing progressive pathways for: Nordic Walking Instructors; Nordic Walking Coaches; Competition Judges; Race Directors; Competition Technical Officials. Each pathway has its own education, practical preparation, assessments, experience requirements, and licenses. <a href="https://runsignup.com/MemberOrg/InstructorTrainingSpecializations">Professional Pathways</a></p></div></details><details><summary>Where does NWANA professional education begin?</summary><div style="margin-top:10px"><p>Every NWANA professional pathway begins with the Nordic Walking Instructor – Beginner Level Certification through NWANA Academy. This course establishes the fundamental understanding of Nordic Walking technique, equipment, movement principles, safety, and professional responsibility required before entering more advanced education.</p></div></details><details><summary>Can I skip professional education levels?</summary><div style="margin-top:10px"><p>No. NWANA professional education develops step by step. Previous education or experience may be considered, but it does not automatically authorize a person to bypass required NWANA education, assessment, practical preparation, or licensing requirements.</p></div></details><details><summary>Does completing professional education guarantee a license?</summary><div style="margin-top:10px"><p>No. Course completion and licensing are separate. After completing the required education, an applicant must satisfy the applicable eligibility, verification, practical, and license-activation requirements.</p></div></details><details><summary>What is an NWANA Nordic Walking Group?</summary><div style="margin-top:10px"><p>An NW Group connects people through Nordic Walking within a particular community, organization, territory, or program category. NWANA can establish a dedicated group page and provide tools for registrations, communications, activities, events, fundraising, ticket sales, donations, and continued group development. <a href="https://groups.nwaofna.org/">NW Groups</a></p></div></details><details><summary>Can I join an existing NW Group?</summary><div style="margin-top:10px"><p>Yes. If an appropriate group already exists, joining is free: find your group and <a href="https://groups.nwaofna.org/find-a-group">join it</a>. Every territory and category also carries its FORMING group in the registry: join it free and receive updates as NWANA builds it toward launch.</p></div></details><details><summary>Does joining an NW Group require me to lead a group?</summary><div style="margin-top:10px"><p>No. Joining is free and carries no obligation to create or lead a group, organize activities, or conduct events. Members who want to become involved in those activities are welcome to do so through the applicable pathways.</p></div></details><details><summary>Can an NW Group carry the name of an organization?</summary><div style="margin-top:10px"><p>A group connected with a specific company, school, university, government agency, healthcare organization, faith community, sports organization, homeowners association, or other established organization is created and owned by NWANA, in coordination with that organization. The use of another organization's name, logo, facilities, communication channels or other resources runs through that organization's own approval.</p></div></details><details><summary>What statuses can an NW Group have?</summary><div style="margin-top:10px"><p>NW Groups have two statuses, FORMING and ACTIVE. A FORMING group is in its build phase in its territory: NWANA is appointing its prescribed roles and preparing its launch, and its page carries the launch schedule as it is set. An ACTIVE group holds regular activities. All NW Groups are created and owned by NWANA, and group money is accounted inside NWANA by territory. Participation is free: residents join their territory group on the NW Groups site. NWANA runs the association and its groups through its appointed officers and prescribed group roles.</p></div></details><details><summary>What competitions does NWANA currently offer?</summary><div style="margin-top:10px"><p>NWANA currently conducts scheduled virtual distance competitions through the NWANA Open Nordic Walking Series. Participants can register, complete the published distance, submit the required evidence, and follow official results and standings. <a href="https://runsignup.com/Race/FL/SaintPetersburg/NWANANWSeries">Competition Calendar</a></p></div></details><details><summary>Is NWANA also developing in-person competitions?</summary><div style="margin-top:10px"><p>Yes. NWANA is establishing a broader competition system that includes Stadium, Road, Cross-Country, and Relay competition. A particular event or championship is confirmed only when NWANA publishes its official name, date, location, registration information, rules, and competition designation. <a href="https://runsignup.com/Race/FL/SaintPetersburg/NWANANordicWalkingSPORT">NWANA Nordic Walking Sport</a></p></div></details><details><summary>What is the difference between an NWANA Event and a competition?</summary><div style="margin-top:10px"><p>NWANA Events may include clinics, workshops, education sessions, community programs, fundraising events, recognition events, partner gatherings, forums, and other organizational activities. Competitive events involving official rules, judging, results, rankings, qualification, or sanctioning belong within the NWANA Sport system. See the <a href="/events">Events</a> page.</p></div></details><details><summary>Can my organization host an NWANA Event?</summary><div style="margin-top:10px"><p>NWANA may work with organizations, venues, municipalities, schools, universities, companies, nonprofits, clubs, community groups, and other qualified hosts. The event format, responsibilities, branding, registration, financial structure, safety requirements, and organizational relationship must be agreed upon with NWANA.</p></div></details><details><summary>Can my group or organization conduct a Nordic Walking competition?</summary><div style="margin-top:10px"><p>Yes, but an independently organized competition does not automatically become an official NWANA competition. Contact NWANA before presenting or promoting an event as affiliated with, recognized by, approved by, or sanctioned by NWANA.</p></div></details><details><summary>What is the difference between a partner and a sponsor?</summary><div style="margin-top:10px"><p>A partner works with NWANA to develop programs, locations, education, groups, events, community access, technology, outreach, or other practical initiatives. A sponsor primarily provides financial or material support and receives recognition appropriate to the supported program, audience, and sponsorship arrangement. An organization may serve as both a partner and a sponsor when appropriate.</p></div></details><details><summary>How can my organization become an NWANA partner?</summary><div style="margin-top:10px"><p>Review the partnership opportunities and contact NWANA with information about your organization, audience, resources, location, and proposed area of collaboration. <a href="/partners">Partner with NWANA</a></p></div></details><details><summary>How can a company or organization sponsor NWANA?</summary><div style="margin-top:10px"><p>Sponsors may support education, instructor development, competitions, events, awards, technology, local groups, community access, safety programs, athlete opportunities, or broader organizational growth. Sponsorship arrangements are developed according to the supported program, geographic reach, audience, visibility, and level of involvement. <a href="/sponsors">Sponsor NWANA</a></p></div></details><details><summary>How can I donate or raise funds for NWANA?</summary><div style="margin-top:10px"><p>You may make a donation, support a designated fund, create a personal fundraiser, organize a team fundraiser, ask about employer matching gifts, or sponsor a specific NWANA program. <a href="/support">Support and Funds</a></p></div></details><details><summary>Are donations to NWANA tax-deductible?</summary><div style="margin-top:10px"><p>NWANA is a U.S. nonprofit public charity recognized under IRS Section 501(c)(3). Donations may be tax-deductible to the extent allowed by law. Donors should consult their tax advisor regarding their individual circumstances.</p></div></details><details><summary>Can I volunteer or serve within NWANA?</summary><div style="margin-top:10px"><p>NWANA may offer opportunities involving events, committees, regional development, technical work, public outreach, professional programs, organizational projects, and other areas. Opportunities depend on current organizational needs and may require relevant experience, qualifications, screening, review, selection, or appointment.</p></div></details><details><summary>Does NWANA create medical, treatment, or rehabilitation programs?</summary><div style="margin-top:10px"><p>No. NWANA does not diagnose medical conditions or create medical, treatment, or rehabilitation programs. NWANA provides Nordic Walking education, technical standards, professional pathways, and sport expertise. Healthcare professionals and authorized healthcare organizations remain responsible for any medical or rehabilitation programs they develop or supervise.</p></div></details><details><summary>Does NWANA support adaptive and inclusive participation?</summary><div style="margin-top:10px"><p>NWANA seeks to expand Nordic Walking opportunities for people with different abilities, backgrounds, ages, and participation needs. Specific accommodations depend on the program, competition, location, available personnel, and safety requirements. Contact NWANA before registering if you require an accommodation or need help identifying an appropriate pathway.</p></div></details><details><summary>What protections apply when minors participate?</summary><div style="margin-top:10px"><p>NWANA activities involving minors must follow applicable participant-protection, supervision, consent, communication, reporting, and safety requirements. Professional roles involving participants under age 18 may require additional education, authorization, screening, or program-specific approval.</p></div></details><details><summary>Where can I find NWANA Safe Sport information?</summary><div style="margin-top:10px"><p>NWANA's Safe Sport Policy addresses participant protection, youth safety, misconduct prevention, reporting expectations, adult-youth boundaries, and safe program culture. <a href="/safesport">Safe Sport Policy</a></p></div></details><details><summary>Where can I find NWANA policies and public documents?</summary><div style="margin-top:10px"><p>The <a href="/governance">Governance & Policies</a> page provides access to legal policies, conduct and safety standards, Safe Sport, Anti-Doping information, public resources, forms, brand materials, press resources, and official contact pathways.</p></div></details><details><summary>May I use the NWANA name or logo?</summary><div style="margin-top:10px"><p>The NWANA name, logos, marks, and official identity materials may not be used in a way that suggests authorization, endorsement, recognition, partnership, sponsorship, or sanctioning without permission. Review the applicable brand resources or contact NWANA before using NWANA identity materials publicly. <a href="/brand">Brand assets</a></p></div></details><details><summary>Where can media representatives find information about NWANA?</summary><div style="margin-top:10px"><p>Media representatives may use the NWANA <a href="/press">Press Kit</a> and <a href="/media-contact">Contact for Media / Partners</a> pages for approved descriptions, background information, public materials, and interview or media requests.</p></div></details><details><summary>What should I do if I cannot find the right pathway?</summary><div style="margin-top:10px"><p>Review all pathways on the <a href="/choose-your-path">Choose Your Path</a> page. If none clearly fits your interests, community, organization, or proposed activity, contact NWANA and describe what you want to do. NWANA will help direct you to the most appropriate existing pathway or consider whether another approach is needed.</p></div></details><details><summary>How do I contact NWANA?</summary><div style="margin-top:10px"><p>For general questions, use the <a href="/contact">Contact</a> page or email <a href="mailto:info@nwaofna.org">info@nwaofna.org</a>. Please identify the program, license, course, group, competition, event, partnership, sponsorship, donation, or policy connected with your question so it can be directed appropriately.</p></div></details>
    </div>
    <div style="margin-top:34px"><div class="card"><h3>Contact NWANA</h3><p>Still have a question? Contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> General Question</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=General%20Question">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Frequently Asked Questions", "faq", content, "NWANA FAQ: Nordic Walking, education, licenses, groups, competitions, partnerships, donations, safety, and contact.");
}
// ---------------- 18. /events ----------------

export async function eventsPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Community Events</div><h1>NWANA Community Events</h1><p>Community Events are NWANA's national event format: local organizations hold Discovery walks, sports days, clinics and community gatherings for their own audiences, on the federation's methodology and inside the NWANA system. The federation supplies the sport component, training for organizers and the national calendar; hosts bring their place and their people. Events sit alongside NWANA competitions and challenges, and turn local audiences into participants, groups and programs.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">The model</div>
    <h2>How Community Events work</h2>
    <p>An organization that wants Nordic Walking in front of its own audience becomes the host. NWANA and the host agree the format: a Discovery walk to a place worth seeing, a sports day, a themed community gathering, a clinic. NWANA prepares the host's organizers, supplies the walking program and the sport component, including the six-minute walk experiment that lets every participant compare walking with poles and walking in the usual way. The host gathers its audience through its own channels.</p>
    <p>Hosts include park and recreation agencies, schools and universities, community and activity networks, clubs, health and active aging organizations, municipalities and community nonprofits. Events run inside the host's own program calendar and connect onward: participants find local NW Groups, Academy courses, challenges and competitions through the same federation system.</p>
    <p>A South Florida Discovery Series is in preparation as a first example of the format, together with local co-organizers.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="/institutional-programs">Programs for organizations</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="https://groups.nwaofna.org/organizations">Connect your organization</a>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">What counts</div>
    <h2>What counts as an NWANA Event?</h2>
    <p>NWANA Events may include:</p>
    <ul><li>forums and conferences</li><li>fundraising events</li><li>galas and donor events</li><li>awards and recognition events</li><li>clinics and workshops</li><li>NWANA Academy sessions</li><li>instructor and coach education events</li><li>partner and sponsor gatherings</li><li>community programs</li><li>health and wellness events</li><li>local leader meetings</li><li>event director and organizer meetings</li><li>public outreach programs</li><li>special events connected to NWANA development</li></ul>
    <p>Some events may be in person. Others may be virtual, hybrid, local, regional, national, educational, fundraising-focused, or connected to a larger NWANA program.</p>
    <h2 style="margin-top:30px">Why events matter</h2>
    <p>Nordic Walking development needs more than websites, registrations, and results. It needs people meeting each other. It needs organizations understanding the mission. It needs sponsors seeing the opportunity. It needs leaders learning how to build programs. It needs communities seeing Nordic Walking as something real, organized, and worth joining. NWANA Events help turn interest into action. They can create new partnerships, raise funds, train leaders, recognize achievement, launch local programs, support instructors, and bring Nordic Walking into more communities.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Who events serve</div>
    <h2>For participants and supporters</h2>
    <p>NWANA Events give participants, families, supporters, donors, volunteers, and community members a way to connect with NWANA beyond a challenge or competition. At an NWANA Event, people may:</p>
    <ul><li>learn about Nordic Walking</li><li>meet instructors, coaches, leaders, and organizers</li><li>support NWANA funds</li><li>discover local groups and programs</li><li>attend clinics or workshops</li><li>celebrate achievements</li><li>invite friends, family, or colleagues</li><li>become part of the larger NWANA movement</li></ul>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">For organizations</div>
    <h2>For partners</h2>
    <p>NWANA Events can help partners introduce Nordic Walking to their communities, organizations, employees, students, clients, members, or local audiences. Partner-supported events may include:</p>
    <ul><li>community demonstrations</li><li>school or university sessions</li><li>senior and active aging programs</li><li>wellness events</li><li>workplace activity events</li><li>local group launches</li><li>public agency programs</li><li>clinics, workshops, or education sessions</li></ul>
    <p>Events give partners a practical way to move from conversation to real activity.</p>
    <h2 style="margin-top:30px">For sponsors</h2>
    <p>NWANA Events give sponsors a visible way to support the growth of Nordic Walking while connecting with people, communities, and programs. Sponsor-supported events may help fund:</p>
    <ul><li>instructor development</li><li>community programs</li><li>clinics and workshops</li><li>awards and recognition</li><li>fundraising events</li><li>education sessions</li><li>local group development</li><li>health and wellness programs</li><li>future competition pathways</li></ul>
    <p>Sponsors can help make NWANA Events more visible, more professional, and more accessible.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Hosts</div>
    <h2>For organizers and hosts</h2>
    <p>NWANA may work with organizations, venues, race directors, municipalities, schools, clubs, companies, nonprofits, and community partners to host or support events that align with NWANA's mission. An NWANA Event can be small and local or larger and regional. What matters is that it helps build Nordic Walking in a structured, safe, and meaningful way. Potential hosts may include:</p>
    <ul><li>parks and recreation departments</li><li>schools and universities</li><li>senior centers</li><li>community organizations</li><li>corporate wellness teams</li><li>nonprofits</li><li>local clubs</li><li>race and event organizations</li><li>health and wellness organizations</li><li>sponsors and partners</li></ul>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Announcements</div>
    <h2>Current and future events</h2>
    <p>NWANA is building an event pathway that can grow over time. Current and future events may be announced through this hub, NWANA communications, partner channels, and related RunSignup or TicketSignup pages. As NWANA grows, this page may include conferences, clinics, fundraisers, award events, education sessions, community launches, partner events, and other public programs connected to Nordic Walking development.</p>
    <div style="margin-top:26px"><div class="card"><h3>Contact NWANA</h3><p>If your organization wants to host, partner, or sponsor an NWANA Event, contact us with a short description of your idea, location, audience, and goals. NWANA can help identify whether your idea fits best as an event, clinic, workshop, partner program, fundraiser, community launch, or future competition-related activity.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> NWANA Event Inquiry</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=NWANA%20Event%20Inquiry">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("NWANA Community Events", "events", content, "NWANA Community Events: the national event format that local organizations run on NWANA methodology: Discovery walks, sports days, clinics and community gatherings.");
}

// ---------------- 19. /elite (Elite Athletes, content preserved) ----------------

// Canonical athlete profile row: the single source of truth shared with the
// Engine, OC, sponsor exports, and news cards. Static credentials are
// verified records; stats are derived from official finalized results and
// materialized by the Engine. This page never invents or hardcodes numbers.
interface CanonicalAthleteRow {
	full_name: string;
	org_role: string | null;
	athlete_role: string | null;
	public_property_url: string | null;
	photo_url: string | null;
	credentials_json: string;
	computed_stats_json: string | null;
	stats_computed_at: string | null;
}

interface AthleteCredentialLite {
	type: string;
	title: string;
	detail: string;
}

interface AthleteStatsLite {
	wins: number;
	season_wins: Record<string, number>;
}

async function getCanonicalAthlete(db: D1Database | undefined, slug: string): Promise<CanonicalAthleteRow | null> {
	if (!db) return null;
	try {
		return await db
			.prepare(
				`SELECT full_name, org_role, athlete_role, public_property_url, photo_url,
				        credentials_json, computed_stats_json, stats_computed_at
				 FROM athlete_profiles WHERE slug = ?`,
			)
			.bind(slug)
			.first<CanonicalAthleteRow>();
	} catch {
		return null;
	}
}

// Albert Fatikhov card: static verified credentials from the canonical row,
// dynamic season numbers from Engine-computed stats. No hardcoded counts.
function albertCard(profile: CanonicalAthleteRow | null): string {
	let credentials: AthleteCredentialLite[] = [];
	let wins2026: number | null = null;
	let statsAsOf: string | null = null;
	if (profile) {
		try {
			credentials = JSON.parse(profile.credentials_json || "[]");
		} catch {
			credentials = [];
		}
		try {
			const stats: AthleteStatsLite | null = profile.computed_stats_json
				? JSON.parse(profile.computed_stats_json)
				: null;
			if (stats) {
				wins2026 = stats.season_wins?.["2026"] ?? stats.wins ?? null;
				statsAsOf = profile.stats_computed_at ? profile.stats_computed_at.slice(0, 10) : null;
			}
		} catch {
			wins2026 = null;
		}
	}
	const bulletFor = (c: AthleteCredentialLite): string => {
		const sep = c.type === "national_championship" ? ": " : ", ";
		return c.detail ? `${c.title}${sep}${c.detail}` : c.title;
	};
	const achievementBullets = credentials
		.filter((c) => c.type === "world_championship" || c.type === "national_championship" || c.type === "competition_best")
		.map(bulletFor);
	if (wins2026 !== null) {
		achievementBullets.push(`${wins2026} NWANA Open Series Victories, 2026 season`);
	}
	const focus = credentials.find((c) => c.type === "focus");
	const seasonLine = wins2026 !== null
		? `During the 2026 season, he has recorded ${wins2026} victories in the NWANA Open Nordic Walking Series while competing across distances from 1K through 20K.`
		: `During the 2026 season, he competes in the NWANA Open Nordic Walking Series across distances from 1K through 20K.`;
	const photo = profile?.photo_url ||
		"https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/efade10b-4183-42c3-8549-bdcfaed4b27c-bQoiOp.png";
	const propertyUrl = profile?.public_property_url || "https://albertfatikhov.nwaofna.org/";
	return `
    <div class="card" style="margin-top:22px;margin-bottom:20px">
      <div class="kicker">United States</div>
      <h3>Albert Fatikhov, World Championship Medalist</h3>
      <div style="margin:14px 0">
        <img src="${esc(photo)}" alt="Albert Fatikhov" style="max-width:300px;width:100%;border-radius:12px">
      </div>
      <p>Albert Fatikhov is a World Championship medalist in competitive Nordic Walking and an active international-level athlete. His competitive record includes two World Championship medals, six Latvian Championship medals, and a successful return to regular competition in the United States through the NWANA Open Nordic Walking Series. At the 2024 World Championship in Lahti, Finland, Albert won the Silver Medal in the 4 x 5K men's relay and the Bronze Medal in the 5K individual race. ${esc(seasonLine)}</p>
      ${bullets(achievementBullets)}
      ${focus ? `<p><strong>${esc(focus.title)}.</strong> Albert continues to compete actively while focusing on speed, technique, and performance development across the shorter Nordic Walking distances.</p>` : ``}
      ${statsAsOf ? `<p style="color:var(--muted);font-size:14.5px">Season statistics computed from official finalized NWANA results, as of ${esc(statsAsOf)}.</p>` : ``}
      <p><a class="card-link" href="${esc(propertyUrl)}" target="_blank" rel="noopener">albertfatikhov.nwaofna.org →</a></p>
    </div>`;
}

export async function elitePage(db?: D1Database): Promise<string> {
	const albert = await getCanonicalAthlete(db, "albert-fatikhov");
	const content = `
  ${pageHead("Elite Athletes", "Elite Athletes Club", "Elite athletes exist, even before the sport is fully developed in the U.S. Competitive Nordic Walking is still emerging in the United States. Yet international-level athletes already represent the country on the world stage.")}
  <div class="section"><div class="wrap">
    <div class="kicker">A young sport. Proven international results.</div>
    <h2>A small roster, a high bar</h2>
    <p>Membership is intentionally limited and based on verified international achievements. The Elite Athletes Club documents athletes whose results meet the highest international standards, and sets a clear reference point for credibility, judging, and competitive growth nationwide.</p>
    <div class="grid cols-4" style="margin-top:26px">
      <div class="card"><h3>Credibility</h3><p>World-level medals exist within the U.S. athlete pool.</p></div>
      <div class="card"><h3>Leadership</h3><p>NWANA is building the sport from the top down.</p></div>
      <div class="card"><h3>Standards</h3><p>Technique and judging can align to a real benchmark.</p></div>
      <div class="card"><h3>Growth</h3><p>Elite presence accelerates events, clubs, and regional markets.</p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Elite directory</div>
    <h2>Verified international achievements</h2>
        ${albertCard(albert)}
    <div class="card" style="margin-bottom:20px">
      <div class="kicker">United States</div>
      <h3>Tommy Aunan, World Championship Medalist</h3>
      <div style="margin:14px 0">
        <img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/4fab2899-110f-44d8-9022-232b0157381a-bQojhe.png" alt="Tommy Aunan" style="max-width:300px;width:100%;border-radius:12px">
      </div>
      <p>Tommy Aunan is one of the most decorated endurance athletes representing the United States on the international stage. A remarkably versatile competitor, Tommy has built an extraordinary career spanning 40 World Masters Championships, World Masters Games, and World Championships across Cross-Country Skiing, Biathlon, Athletics, and Nordic Walking. In Nordic Walking, Tommy has established himself as an elite international competitor, representing the USA at three Nordic Walking World Championships. At the 2024 World Championship in Lahti, Finland, he won the Silver Medal in the 10K and the Bronze Medal in the 5K individual races. Latest Achievement, Daegu 2026: At the 2026 World Masters Athletics Championships in Daegu, South Korea, Tommy added two more gold medals to his international record in the 10K and 20K Race Walk national team competitions. He is now a 9-time World Masters Athletics national team medalist, with 3 gold, 2 silver, and 4 bronze medals.</p>
      ${bullets(["Double Gold, 10K & 20K Race Walk National Team Competitions, World Masters Athletics Championships, Daegu, South Korea, 2026", "Silver Medal, 10K Nordic Walking World Championship, Lahti, Finland, 2024", "Bronze Medal, 5K Nordic Walking World Championship, Lahti, Finland, 2024", "9-Time World Masters Athletics Team Medalist (3 Gold, 2 Silver, 4 Bronze)", "8-Time USA Masters National Racewalk Champion", "34 USA National & Masters Medals", "Double Bronze, 5K & 20K Race Walk, World Masters Games, Sydney, Australia, 2009", "41 World Masters Events Across Cross-Country Skiing, Biathlon, Athletics, and Nordic Walking"])}
      <p>Tommy Aunan continues to compete internationally across multiple endurance disciplines and represents an exceptional level of longevity and achievement in Masters sport.</p>
      <p><a class="card-link" href="/elite/tommy-aunan">Tommy Aunan's full profile and photo gallery →</a></p>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="kicker">United States</div>
      <h3>Sven Thorslund, World Championship Medalist</h3>
      <div style="margin:14px 0">
        <img src="/elite/sven-thorslund-379.jpg" alt="Sven Thorslund competing at the 2026 Nordic Walking World Championships in Lahti" style="max-width:300px;width:100%;border-radius:12px">
      </div>
      <p>Sven Thorslund is a Swedish-American Nordic walker and one of the fastest-rising athletes in North America. His disciplined, technique-driven style and exceptional endurance have positioned him as a standout competitor on the international stage.</p>
      ${bullets(["Silver Medal, M55 10K, Nordic Walking World Championships, Lahti, Finland (2026)", "7th place, 5K, Nordic Walking World Championships, Lahti, Finland (2026)", "Selected for the U.S. 5K Relay Team, Lahti 2026"])}
      <p><strong>Training and technique.</strong> Training year-round in Miami's demanding heat and humidity, Sven focuses on cadence efficiency, upper-chain endurance, and precision of original technique — fast, consistent, and technically refined.</p>
      <p><strong>NWANA development pathway.</strong> Sven credits NWANA for recognizing his potential early and supporting his participation in Lahti. Their guidance played a central role in his breakthrough performance and contributed to placing the United States on the event's country medal list.</p>
      <p><strong>Global background.</strong> His passion for international movement is rooted in years of global adventure trekking, including expeditions in Nepal, Morocco, and Tanzania.</p>
      <p>Sven is an active participant in the NWANA Virtual Competition Series, steadily climbing the rankings through consistent performance and disciplined technique work — engaged across both virtual and in-person formats.</p>
      <p><a class="card-link" href="/elite/sven-thorslund">Sven Thorslund's full profile →</a></p>
    </div>
    <div class="card">
      <div class="kicker">Limited by design</div>
      <h3>Future Elite Athlete</h3>
      <p>International medals/awards required. Documentation and verification mandatory.</p>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Recognize talent</div>
    <h2>Know a U.S. athlete with international Nordic Walking awards?</h2>
    <p>Help us build the roster. Available for limited official invitations: sanctioned competitions; technique & performance clinics; judging & standards education; regional development day; media & promotion support.</p>
    <p><strong>How it works:</strong> Send request: city, date, format. NWANA confirms availability and scope. Official NWANA appearance activation.</p>
    <div style="margin-top:22px">${contactCard("Elite Athlete Invitation", "Know a U.S. athlete with international Nordic Walking awards? Help us build the roster.")}</div>
  </div></div>`;

	return layout("Elite Athletes", "elite", content, "NWANA Elite Athletes Club: verified international achievements, an intentionally limited roster, and recognition of elite talent.");
}

// ---------------- 19b. /elite/tommy-aunan ----------------

export async function tommyAunanPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Tommy Aunan</div><h1>Tommy Aunan</h1><p>United States · Nordic Walking &amp; Masters Athletics World Championship Medalist</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Elite Athletes Club</div>
    <h2>United States · Nordic Walking & Masters Athletics World Championship Medalist</h2>
    <p>One of the most decorated endurance athletes representing the United States on the international stage. Tommy has competed in <strong>40 World Masters Championships</strong> across Cross-Country Skiing, Biathlon, Athletics, and Nordic Walking — building a legendary career that spans two decades of world-class competition.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">World Championship medals</div>
    <h2>9x World Medalist</h2>
    <div class="grid cols-4" style="margin-top:22px">
      <div class="card"><h3>Double Gold</h3><p>10K / 20K Race Walk, National Team Competitions · World Masters Athletics Championships · Daegu, South Korea · 2026</p></div>
      <div class="card"><h3>Silver Medal</h3><p>10K Nordic Walking · World Championship · Lahti, Finland · 2024</p></div>
      <div class="card"><h3>Bronze Medal</h3><p>5K Nordic Walking · World Championship · Lahti, Finland · 2024</p></div>
      <div class="card"><h3>Double Bronze</h3><p>5K & 20K Racewalk · World Masters Games · Sydney · 2009</p></div>
    </div>
    <p style="margin-top:18px">World Masters Athletics national team competitions: <strong>3 Gold · 2 Silver · 4 Bronze</strong>.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Photo gallery</div>
    <h2>Championships and competitions across two decades</h2>
    <div class="grid cols-3" style="margin-top:22px">
      <div class="card"><img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/d44cbab6-cd07-4f2f-b1f5-089d87a65979-bQojH8.png" alt="Sprint Race · World Masters Biathlon Championship · Kontiolahti, Finland · March 20, 2026" style="width:100%;border-radius:12px;margin-bottom:10px"><p style="font-size:15px;color:var(--muted)">Sprint Race · World Masters Biathlon Championship · Kontiolahti, Finland · March 20, 2026</p></div><div class="card"><img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/385635c5-34f8-4e15-a013-7fe58a2e3bad-bQojPt.png" alt="World Masters Biathlon Championship · Kontiolahti, Finland" style="width:100%;border-radius:12px;margin-bottom:10px"><p style="font-size:15px;color:var(--muted)">World Masters Biathlon Championship · Kontiolahti, Finland</p></div><div class="card"><img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/e6842f2b-0ba4-4971-b9d6-e4f4206e3a9e-bQojT4.png" alt="World Masters Biathlon Championship · Kontiolahti, Finland" style="width:100%;border-radius:12px;margin-bottom:10px"><p style="font-size:15px;color:var(--muted)">World Masters Biathlon Championship · Kontiolahti, Finland</p></div><div class="card"><img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/012750dd-813b-49d5-9a0b-1993f156a4cb-bQojYc.png" alt="World Masters Athletics Championship · Gothenburg, Sweden · 2024 · 10km Racewalk" style="width:100%;border-radius:12px;margin-bottom:10px"><p style="font-size:15px;color:var(--muted)">World Masters Athletics Championship · Gothenburg, Sweden · 2024 · 10km Racewalk</p></div><div class="card"><img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/ef857035-826a-4fc4-8761-93adfc9840cf-bQoj0o.png" alt="Nordic Walking World Championship 2024 · Lahti, Finland" style="width:100%;border-radius:12px;margin-bottom:10px"><p style="font-size:15px;color:var(--muted)">Nordic Walking World Championship 2024 · Lahti, Finland</p></div><div class="card"><img src="https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/4b81c485-9c18-4b4c-9673-4a624cdbf833-bQoj1Z.png" alt="World Masters XC-Ski Championship · Brusson, Italy · 2006" style="width:100%;border-radius:12px;margin-bottom:10px"><p style="font-size:15px;color:var(--muted)">World Masters XC-Ski Championship · Brusson, Italy · 2006</p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Career achievements</div>
    <h2>Across five disciplines</h2>
    <div class="grid cols-2" style="margin-top:22px">
      <div class="card"><h3>Nordic Walking</h3><ul><li>Silver Medal, 10K – World Championship, Lahti, Finland 2024</li><li>Bronze Medal, 5K – World Championship, Lahti, Finland 2024</li><li>3x USA Representative at Nordic Walking World Championships</li><li>Active ambassador for competitive Nordic Walking in North America</li></ul></div>
      <div class="card"><h3>Racewalk</h3><ul><li>8-time USA Masters National Racewalk Champion</li><li>34 medals at USA National &amp; Masters Championships</li><li>9-time medalist in national team competitions at the World Masters Athletics Championships — 3 Gold, 2 Silver, 4 Bronze</li><li>Double Gold — 10K &amp; 20K Race Walk, national team competitions, World Masters Athletics Championships, Daegu, South Korea 2026</li><li>Double Bronze — 5K &amp; 20K Racewalk, World Masters Games, Sydney 2009</li></ul></div>
      <div class="card"><h3>Biathlon</h3><ul><li>Multiple World Masters Biathlon Championship competitor</li><li>Most recently competed in the Sprint Race, World Masters Biathlon Championships, Kontiolahti, Finland · March 20, 2026</li></ul></div>
      <div class="card"><h3>Cross-Country Skiing</h3><ul><li>World Masters XC-Ski Championship competitor</li><li>Represented USA at World Masters XC-Ski Championships, Brusson, Italy 2006</li></ul></div>
    </div>
    <div class="card" style="margin-top:20px"><h3>Overall legacy</h3><ul><li>40 World Masters Championships across Cross-Country Skiing, Biathlon, Athletics, and Nordic Walking</li><li>One of the most versatile and decorated Masters endurance athletes in U.S. history</li><li>Continues to set the standard for high-performance Nordic Walking in North America</li></ul></div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Invite Tommy to your event</div>
    <h2>Raise your event's credibility</h2>
    <p>Raise the credibility of your event with a World Championship medalist presence. Available for: sanctioned competitions; technique clinics; judging & standards; regional development; media & promotion; speaking engagements.</p>
    <p><strong>How to invite:</strong> Submit request: city, date, and event format. NWANA confirms availability and scope. Official NWANA appearance is activated.</p>
    <div style="margin-top:22px"><div class="card"><h3>Contact NWANA</h3><p>Request Tommy Aunan's appearance at your event.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Invite Tommy Aunan</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Invite%20Tommy%20Aunan">Compose your email</a></p></div></div>
    <p style="margin-top:22px"><a class="card-link" href="/elite">← Back to Elite Athletes</a></p>
  </div></div>`;
	return layout("Tommy Aunan", "elite", content, "Tommy Aunan: 9x World Medalist in Nordic Walking and Masters Athletics. Photo gallery, career achievements, and event invitations.");
}

// ---------------- 19b2. /elite/sven-thorslund ----------------

export async function svenThorslundPage(): Promise<string> {
	const content = `
  ${pageHead("Sven Thorslund", "Sven Thorslund", "United States · Nordic Walking World Championship Medalist")}
  <div class="section"><div class="wrap">
    <div class="kicker">Elite Athletes Club</div>
    <h2>United States · Nordic Walking World Championship Medalist</h2>
    <div style="margin:18px 0;max-width:420px">
      <img src="/elite/sven-thorslund-silver.jpg" alt="Sven Thorslund, M55 10K silver medalist, Lahti 2026" style="width:100%;border-radius:12px">
    </div>
    <p>Sven Thorslund is a Swedish-American Nordic walker competing for the United States internationally — and one of the fastest-rising athletes in North America. At the Nordic Walking World Championships in Lahti, Finland, in September 2026, he won the <strong>silver medal in the M55 10K</strong>, finished <strong>7th in the 5K</strong>, and was selected for the <strong>U.S. 5K Relay Team</strong>.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Lahti 2026</div>
    <h2>World Championship results</h2>
    <div class="grid cols-3" style="margin-top:22px">
      <div class="card"><h3>Silver Medal</h3><p>M55 10K · Nordic Walking World Championships · Lahti, Finland · 2026</p></div>
      <div class="card"><h3>7th place</h3><p>5K · Nordic Walking World Championships · Lahti, Finland · 2026</p></div>
      <div class="card"><h3>U.S. Relay Team</h3><p>Selected for the U.S. 5K Relay Team · Lahti 2026</p></div>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Training and technique</div>
    <h2>Built in Miami's heat</h2>
    <p>Training year-round in Miami's demanding heat and humidity, Sven focuses on cadence efficiency, upper-chain endurance, and precision of original technique — fast, consistent, and technically refined. His disciplined, technique-driven style and exceptional endurance have positioned him as a standout competitor on the international stage.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">NWANA development pathway</div>
    <h2>Recognized early, supported to the podium</h2>
    <p>Sven credits NWANA for recognizing his potential early and supporting his participation in Lahti. Their guidance played a central role in his breakthrough performance and contributed to placing the United States on the event's country medal list.</p>
    <p style="margin-top:14px">His passion for international movement is rooted in years of global adventure trekking, including expeditions in Nepal, Morocco, and Tanzania.</p>
    <p style="margin-top:14px">Sven is an active participant in the NWANA Virtual Competition Series, steadily climbing the rankings through consistent performance and disciplined technique work — engaged across both virtual and in-person formats.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Invite Sven to your event</div>
    <h2>A world medalist at your start line</h2>
    <p>Raise the credibility of your event with a World Championship medalist presence. Available for: sanctioned competitions; technique clinics; judging & standards; regional development; media & promotion; speaking engagements.</p>
    <p><strong>How to invite:</strong> Submit request: city, date, and event format. NWANA confirms availability and scope. Official NWANA appearance is activated.</p>
    <div style="margin-top:22px">${contactCard("Invite Sven Thorslund", "Request Sven Thorslund's appearance at your event.")}</div>
    <p style="margin-top:22px"><a class="card-link" href="/elite">← Back to Elite Athletes</a></p>
  </div></div>`;

	return layout("Sven Thorslund", "elite", content, "Sven Thorslund: Nordic Walking World Championship silver medalist (M55 10K, Lahti 2026). Profile, results, and event invitations.");
}

// ---------------- 19c. Board member profile pages ----------------

function boardProfilePage(opts: { name: string; role: string; email: string; photo: string; paragraphs: string[]; closing?: string }): string {
	const body = `
  ${pageHead("Board of directors", opts.name, `${opts.role}, NWANA`)}
  <div class="section"><div class="wrap">
    <div class="card" style="max-width:780px">
      <div class="board-photo"><img src="${opts.photo}" alt="${opts.name}"></div>
      <h3>${opts.name}</h3>
      <p class="role">${opts.role}, NWANA</p>
      <p class="email"><a href="mailto:${opts.email}">${opts.email}</a></p>
      ${opts.paragraphs.map((p) => `<p>${p}</p>`).join("")}
      ${opts.closing ? `<p><strong>${opts.closing}</strong></p>` : ""}
    </div>
    <p style="margin-top:22px"><a class="card-link" href="/about">← Back to About NWANA</a></p>
  </div></div>`;
	return layout(opts.name, "about", body, `${opts.name}: ${opts.role} on the NWANA board of directors.`);
}

export async function lieneVisockaPage(): Promise<string> {
	return boardProfilePage({
		name: "Liene Visocka",
		role: "Board Member for Sports",
		email: "lv@nwaofna.org",
		photo: "https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/18/13/824/c29de07a-1301-4d5d-887c-c2ba84a4b65a-bQnj5Y.png",
		paragraphs: [
			"My journey in Nordic walking began approximately ten years ago in Latvia, following an active period in sports and a desire to find a sustainable, effective form of physical activity.",
			"I was seeking a discipline that would engage multiple muscle groups, support both physical and emotional well-being, and remain accessible without significant financial investment. At the same time, it was important for me to be involved in a structured activity where progress could be measured, analyzed, and continuously improved.",
			"Nordic walking proved to be the ideal solution.",
			"I began by attending guided training sessions under the supervision of a professional coach, where I developed proper technique and gained a deeper understanding of the sport. Alongside regular training, I actively participated in competitions, which allowed me to track my development and refine my skills.",
			"Over time, I achieved noticeable improvements in posture, overall physical conditioning, and endurance, while also experiencing the positive impact on mental balance and well-being.",
			"As my experience grew, so did my motivation to share this knowledge and inspire others.",
			"This led me to pursue professional education and become a certified Nordic walking trainer. Today, I work with individuals and groups, delivering structured training sessions focused on correct technique, functional movement, and long-term health benefits.",
			"My approach emphasizes accessibility and sustainability, ensuring that Nordic walking can be adapted to different levels of physical preparation, ages, and goals.",
			"In parallel with coaching, I am committed to promoting Nordic walking as a valuable and versatile activity that contributes to overall health, community engagement, and active lifestyle development. Through my work, I aim to educate, motivate, and support people in building lasting healthy habits.",
		],
		closing: "My goal is to continue developing high-quality training programs, sharing knowledge, and contributing to the growth and recognition of Nordic walking at both local and international levels.",
	});
}

export async function marisVainovskisPage(): Promise<string> {
	return boardProfilePage({
		name: "Maris Vainovskis",
		role: "Board Director",
		email: "mv@nwaofna.org",
		photo: "https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/18/13/824/460f6d1b-7fc7-4172-ad9c-a83f72e3d5d6-bQnj7l.png",
		paragraphs: [
			"By profession, I am a partner at an international law firm in Latvia, heading Banking and Finance as well as Corporate and Commercial legal practices, with over 25 years of experience in banking, capital markets and international transactions.",
			"Alongside that work, I serve as a top executive of the World DanceSport Federation (WDSF) – a role that keeps me closely connected to high-performance sport governance at the global level.",
			"My own athletic background is in DanceSport, where I competed seriously as an athlete. That foundation gave me something lasting: an understanding of what disciplined, structured movement does for the body and the mind, and an instinct to keep seeking it regardless of what life demands.",
			"About five years ago, I discovered Nordic walking. It began simply – poles in hand, fresh air, no expectations. But what started as casual walking gradually became something much more intentional. I started learning proper technique, training consistently, and then entering the Latvian national championships. The sport rewarded every step of that progression honestly and without shortcuts.",
			"The results followed: podiums at the Latvian national championships, a world title at 10km, and eventually ultra-distance walks of 107 kilometres – completed in full Nordic walking technique.",
			"I share these not as credentials, but as proof of what the discipline makes possible. Nordic walking is accessible to almost anyone. It engages more than 90% of the body's muscles, supports cardiovascular health, improves posture, and creates a form of movement that is sustainable across decades.",
			"It scales effortlessly – from a first walk in a city park to a national championship start line to a 107km ultra. Correct technique is the key that unlocks all of it.",
			"That is the message I want people to take away. Not the titles, but the arc. A busy professional, a former athlete, a person who simply picked up poles one day – and found a sport that gave back far more than it asked.",
		],
		closing: "As a Director of NWANA, that is the experience I hope to help others find.",
	});
}

export async function leonidsReinholdsPage(): Promise<string> {
	return boardProfilePage({
		name: "Leonids Reinholds",
		role: "Board Director",
		email: "leonids.reinholds@nwaofna.org",
		photo: "https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/30/13/824/7d38b8df-7030-45ad-a7b1-2e66b49af94d-bQrckk.png",
		paragraphs: [
			"Leonids Reinholds believes that a single step can change a life.",
			"His journey in Nordic walking began in 2022 – not for medals, but for well-being. At the time, he weighed 96 kg, had no athletic background, and simply wanted to feel better. One training session became two, two became a routine, and the routine turned into confidence.",
			"In a year and a half, he lost 15 kg and discovered that his body and mind were capable of much more.",
			"In 2023, Leonids entered his first 10 km race. A broken leg ended the season early – but that setback became a turning point. After recovery, he did not return to where he had been; he moved forward.",
			"He completed his first 21 km race, and in 2024 represented Latvia at the World Championships in Lahti, finishing 4th. In 2025, his progress continued with a European Championship bronze at 5 km, silver at 21 km, and gold as part of the Latvian men's national team.",
			"Beyond medals, Leonids gained something deeper – an understanding of people.",
			"He learned that everyone needs someone who says, \u201cYou can do this.\u201d That true community supports rather than compares. That meaningful change happens faster than we think when someone believes in us.",
			"Today, as a Board Member at NWANA, Leonids focuses on strategic development and building systems that make sport and health accessible to all.",
		],
		closing: "His personal journey, professional mindset, and belief in people help NWANA grow as a community where everyone can feel: \u201cThis is possible for me too.\u201d",
	});
}

export async function albertTazetdinovPage(): Promise<string> {
	return boardProfilePage({
		name: "Albert Tazetdinov",
		role: "Secretary",
		email: "albert.tazetdinov@nwaofna.org",
		photo: "https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/18/13/824/306a42b5-fb70-4478-85b4-28f2c2aa014d-bQnkcj.png",
		paragraphs: [
			"Albert Tazetdinov serves as the Secretary of the Nordic Walking Association of North America, supporting the organization's governance and day-to-day operations as it builds the continental federation for Nordic walking.",
			"Before leading NWANA, Albert Tazetdinov was a competitive Olympic weightlifter at national junior level, earning a bronze medal at the junior championship along with multiple regional titles and cup victories. A university-educated weightlifting and strength coach, he brings a competitor's mindset to NWANA's day-to-day work: focus on the result, respect for athletes, and no excuses.",
		],
	});
}

// ---------------- 20. /support (Support / Funds) ----------------

export async function supportPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Support / Funds</div><h1>Support the NWANA Mission</h1><p>NWANA is building the foundation for Nordic Walking in North America: trained instructors, local leaders, community programs, sport pathways, events, education, safety standards, and public awareness. Your support helps build an organized, visible, and growing Nordic Walking system, beginning with active development in the United States and supporting future expansion across Canada, Mexico, and the wider North American region.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Why support matters</div>
    <h2>A movement does not grow by itself</h2>
    <p>Nordic Walking is accessible, low-cost, outdoor, social, and adaptable. It can serve beginners, families, seniors, athletes, wellness programs, local groups, schools, communities, and future competitions. But a movement does not grow by itself. To build Nordic Walking responsibly, NWANA needs:</p>
    <ul><li>trained instructors and coaches</li><li>local group leaders</li><li>education and certification pathways</li><li>community programs</li><li>events and challenges</li><li>safety and conduct standards</li><li>sport development</li><li>youth, senior, adaptive, and wellness pathways</li><li>public outreach</li><li>partnerships and sponsorship support</li></ul>
    <p>Every donation helps NWANA build the people and systems needed for long-term growth.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Current priority</div>
    <h2>Instructor Growth Fund</h2>
    <p>The current fundraising priority is the NWANA Instructor Growth Fund. This fund helps create NWANA Academy course credits for future instructors and local leaders. Each course credit can help a new person begin the pathway toward teaching safe Nordic Walking technique, leading local groups, supporting community programs, building clubs and teams, and bringing Nordic Walking to more people. A trained instructor can become the starting point for an entire local community. Sponsored seats from the fund open as donations arrive, and candidates join through the fund waitlist. Organizations train their own nominees through the separate free instructor education program for participating organizations.</p>
    <div class="grid cols-2" style="margin-top:22px">
      <div class="card"><h3>What your support can help build</h3><ul><li>instructor and coach education</li><li>license and certification pathways</li><li>local groups and clubs</li><li>community walking programs</li><li>youth and family programs</li><li>senior and active aging programs</li><li>adaptive and inclusive programs</li><li>health and wellness initiatives</li><li>sport challenges and competitions</li><li>RaceDay, timing, results, and event infrastructure</li><li>safety education and policy development</li><li>public outreach and media materials</li><li>scholarships, credits, and access opportunities</li></ul></div>
      <div class="card"><h3>501(c)(3) public charity</h3><p>NWANA is a U.S. nonprofit public charity recognized under IRS Section 501(c)(3). Donations may be tax-deductible to the extent allowed by law. Please consult your tax advisor regarding your specific situation.</p><p><a class="btn btn-gold" href="https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT" style="margin-top:10px">Donate online</a></p></div>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Ways to support</div>
    <h2>Five ways to help</h2>
    <div class="grid cols-2" style="margin-top:18px">
      <div class="card"><h3>Donate</h3><p>Make a one-time contribution to help NWANA build programs, education, events, and community access.</p><p><a class="card-link" href="https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT">Donate online →</a></p></div>
      <div class="card"><h3>Become a Fundraiser</h3><p>Create a personal fundraiser and invite friends, family, colleagues, or community members to support NWANA.</p><p><a class="card-link" href="mailto:info@nwaofna.org?subject=Support%20NWANA%20Question">Ask how to start →</a></p></div>
      <div class="card"><h3>Start a Team Fundraiser</h3><p>Build a team fundraiser for a company, school, club, department, office, family, or community group.</p><p><a class="card-link" href="mailto:info@nwaofna.org?subject=Support%20NWANA%20Question">Ask how to start →</a></p></div>
      <div class="card"><h3>Ask About Matching Gifts</h3><p>Many employers match charitable donations. A matching gift may double the impact of your contribution.</p></div>
      <div class="card"><h3>Sponsor a Program</h3><p>Businesses and organizations can support instructor development, events, youth programs, wellness programs, sport development, or community initiatives.</p><p><a class="card-link" href="/sponsors">Sponsors →</a></p></div>
    </div>
    <h2 style="margin-top:34px">Matching gifts</h2>
    <p>Your employer may be able to increase your impact. Many companies offer matching gift programs for charitable donations made by employees. If your employer participates, your donation to NWANA may help create additional course credits, support more instructors, and expand Nordic Walking programs to more communities. Check with your employer's giving or human resources department to see whether matching gifts are available.</p>
    <h2 style="margin-top:30px">Team and umbrella fundraising</h2>
    <p>NWANA can also support group-based fundraising. Companies, schools, clubs, departments, offices, families, and community organizations may create team fundraisers or umbrella fundraising structures to support NWANA together. This makes participation visible, creates shared purpose, and helps groups contribute to the growth of Nordic Walking in a practical way.</p>
    <h2 style="margin-top:30px">Support builds access</h2>
    <p>Your contribution does more than fund a single activity. It can help NWANA train leaders, create local programs, support events, provide education, develop safety standards, and give more people a place to start. Nordic Walking can grow in North America if we build the structure around it.</p>
    <div style="margin-top:26px"><div class="card"><h3>Contact NWANA</h3><p>For donation, fundraising, sponsorship, or support questions, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Support NWANA Question</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Support%20NWANA%20Question">Compose your email</a></p></div></div>
    <p style="margin-top:22px">See also: <a class="card-link" href="/ways-to-give">Ways to Give →</a></p>
  </div></div>`;
	return layout("Support and Funds", "support", content, "Support NWANA: the Instructor Growth Fund, donations, fundraisers, matching gifts, and program sponsorship.");
}

// ---------------- 21. /ways-to-give ----------------

export async function waysToGivePage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Ways to Give</div><h1>Ways to Give</h1><p>Your gift to the Nordic Walking Association of North America (NWANA) builds the sport of Nordic walking across the continent: a national competition series, instructor certification, and programs that bring healthy movement to people of all ages and abilities. NWANA is a 501(c)(3) public charity. EIN: 33-2444142. Gifts are tax-deductible to the extent allowed by law.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="grid cols-2">
      <div class="card">
        <div class="kicker">Online</div>
        <h3>Give online</h3>
        <p>The easiest way: support the growth of Nordic walking sport in North America with a secure online gift.</p>
        <p><a class="btn btn-gold" href="https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT">Donate online</a></p>
      </div>
      <div class="card">
        <div class="kicker">Donor-advised fund</div>
        <h3>Give from your Donor-Advised Fund (DAF)</h3>
        <p>The simplest way to give from your DAF is to recommend a grant to NWANA directly through your fund provider (Fidelity Charitable, Schwab Charitable, Vanguard Charitable, or your community foundation). Search for us by name or EIN:</p>
        <p><strong>Legal name:</strong> Nordic Walking Association of North America<br><strong>EIN:</strong> 33-2444142<br><strong>Address:</strong> 1755 E Hallandale Beach Blvd, #304E, Hallandale Beach, FL 33009</p>
        <p>No online form is needed. Your DAF provider will send the grant to us directly. Please note: if you give through a DAF, your tax receipt comes from your DAF provider, not from NWANA, because the deduction was taken when you funded your DAF.</p>
      </div>
      <div class="card">
        <div class="kicker">By check</div>
        <h3>Give by check</h3>
        <p>Make your check payable to "Nordic Walking Association of North America" or "NWANA" and mail it to:</p>
        <p><strong>1755 E Hallandale Beach Blvd, #304E<br>Hallandale Beach, FL 33009</strong></p>
      </div>
      <div class="card">
        <div class="kicker">Through your employer</div>
        <h3>Give through your employer</h3>
        <p>If your employer offers matching gifts or workplace giving (for example through Benevity), search for NWANA by our EIN 33-2444142. Your gift may be doubled at no extra cost to you. The search tools on this page, right below, check your employer directly.</p>
      </div>
    </div>
    <div class="card" style="margin-top:22px">
      <div class="kicker">Matching Gifts & Workplace Giving</div>
      <h3>Double your gift through your employer</h3>
      <p>Many employers match charitable donations or offer payroll giving. Your $50 gift can become $100. Search your company below, submit the short request through your employer's giving portal, and your employer sends the match to NWANA.</p>
      <div class="grid cols-2" style="margin-top:18px">
        <div>
          <p><strong>Match My Donation</strong></p>
          <p>Your employer may match your donation. Search your company below.</p>
          <div class="dd-embed" style="margin-top:12px">
<script>var DDCONF = { API_KEY: "JWmgTNzp4AFUPCzY" };</script>
<script src="https://doublethedonation.com/api/js/ddplugin.js"></script>
<div id="dd-container">
<a href="https://doublethedonation.com/matching-grant-resources/matching-gift-basics/">Matching Gift</a> and <a href="https://doublethedonation.com/matching-grant-resources/volunteer-grant-basics/">Volunteer Grant</a> information provided by<br>
<a href="https://doublethedonation.com"><img alt="Powered by Double the Donation" src="https://doublethedonation.com/api/img/powered-by.png" /></a>
</div>
          </div>
        </div>
        <div>
          <p><strong>Give Through Payroll</strong></p>
          <p>See if your employer offers payroll giving: donate directly from your paycheck.</p>
          <div class="dd-embed" style="margin-top:12px">
<script src="https://doublethedonation.com/api/js/ddplugin.js"></script>
<div id="dtd-plugin"></div>
<script type="text/javascript">
  var dtd_plugin_node = document.getElementById("dtd-plugin");
  var dtd_plugin_config = {"sections": ["payroll-giving","match","volunteer","sponsorships"]};
  doublethedonation.plugin.v2.load_plugin(dtd_plugin_node, "JWmgTNzp4AFUPCzY", dtd_plugin_config);
</script>
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:22px">
      <div class="kicker">Other ways</div>
      <h3>Wire transfers, stock gifts, and other ways to give</h3>
      <p>For wire transfers, gifts of stock, or anything else, please contact us and we will provide instructions.</p>
      <p style="margin-top:16px"><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Support%20NWANA%20Question"></a></p>
    </div>
    <div style="margin-top:26px"><div class="card"><h3>Contact NWANA</h3><p>For donation, fundraising, sponsorship, or support questions, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Support NWANA Question</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Support%20NWANA%20Question">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Ways to Give", "ways-to-give", content, "Ways to give to NWANA: online, donor-advised fund, check, employer matching, wire transfers, and stock gifts. EIN 33-2444142.");
}
// ---------------- 22. /contact ----------------

export async function contactPage(): Promise<string> {
	const groups: [string, [string, string][]][] = [
		["General", [
			["General Question", "Questions about NWANA, Nordic Walking, programs, events, licenses, certifications, or participation."],
		]],
		["Sponsorship and partnerships", [
			["Sponsorship Inquiry", "For companies and organizations exploring sponsorship."],
			["Media / Partner Inquiry", "For partnership, media, sponsorship, and public information inquiries."],
			["Press / Media Request", "For journalists: interviews, quotes, background information, and press materials."],
			["Umbrella NW Group", "For companies, schools, municipalities, clubs, and sponsors exploring an Umbrella NW Group."],
			["Elite Athlete Invitation", "For invitations and appearance requests for NWANA elite athletes."],
		]],
		["Governance, policy, and brand", [
			["Privacy Policy Question", "Questions about the NWANA Privacy Policy."],
			["Terms of Use Question", "Questions about the NWANA Terms of Use."],
			["Terms & Conditions Question", "Questions about NWANA Terms & Conditions."],
			["Code of Conduct Concern", "Questions or concerns related to the Code of Conduct."],
			["Safe Sport Concern", "Safe Sport questions or participant protection concerns."],
			["Anti-Doping Question", "Anti-doping education questions or clean sport concerns."],
			["Safety Concern", "Safety questions, concerns, or incident reporting."],
			["Brand Assets Request", "Logo, brand asset, media, sponsor, or permission questions."],
			["Downloads & Reports Question", "Questions about downloads, reports, forms, or document access."],
			["Forms Question", "Not sure which form to use, or questions about submissions."],
		]],
		["Sport, events, and support", [
			["NWANA Event Inquiry", "For organizations that want to host, partner, or sponsor an NWANA Event."],
			["Officiating Interest", "For becoming a Judge or Technical Official."],
			["Competition Organization", "For organizing a Nordic Walking competition with NWANA."],
			["Support NWANA Question", "For donation, fundraising, sponsorship, or support questions."],
			["Volunteering", "For volunteer service and helping build NWANA."],
		]],
	];
	const content = `
  ${pageHead("Contact", "Contact NWANA", "Every inquiry goes to the NWANA partnerships and communications office at info@nwaofna.org. Choose the subject line that best matches your request so your message reaches the right person quickly.")}
  <div class="section"><div class="wrap">
    ${groups.map(([title, cards]) => `
      <div class="kicker" style="margin-top:34px">${esc(title)}</div>
      <div class="grid cols-3" style="margin-bottom:6px">
        ${cards.map(([subject, desc]) => `<div class="card"><h3>${esc(subject)}</h3><p>${esc(desc)}</p><p><a class="card-link" href="mailto:info@nwaofna.org?subject=${encodeURIComponent(subject)}">info@nwaofna.org →</a></p></div>`).join("")}
      </div>`).join("")}
    <div class="note" style="margin-top:40px"><strong>Email-first.</strong> NWANA routes general, media, donor, partner, and sponsor inquiries through info@nwaofna.org with purpose-specific subject lines. If you are not sure which subject fits, use "General Question" and describe your request.</div>
  </div></div>`;

	return layout("Contact NWANA", "contact", content, "Contact NWANA: email-first contact with purpose-specific subject lines for media, partners, sponsors, donors, and the public.");
}

// ---------------- 23. /partners (Founding & Strategic Partnerships) ----------------

export async function partnersPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Founding &amp; Strategic Partnerships</div><h1>Build Nordic Walking in North America with NWANA</h1><p>NWANA is building the North American infrastructure for Nordic Walking: education, instructor certification, community groups, competitions, technology, media, athlete development, and future championships. A small number of Founding Strategic Partners will help build this system at the beginning and secure long-term category, visibility, and activation rights across the NWANA ecosystem.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">The opportunity</div>
    <h2>This is not a logo on a single race</h2>
    <p>NWANA is building the North American infrastructure for Nordic Walking: education, instructor certification, community groups, competitions, technology, media, athlete development and future championships.</p>
    <p>A small number of Founding Strategic Partners will have the opportunity to help build this system at the beginning and secure long-term category, visibility and activation rights across the NWANA ecosystem.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">The central idea</div>
    <h2>One partnership. The whole system.</h2>
    <p>A Founding Strategic Partnership covers the entire growing NWANA system: education, competition, community, media, technology, and future championships.</p>
    <p>The founding circle forms at the start of the system, and founding positions carry the founding record permanently.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Already built</div>
    <h2>You are funding a foundation, not an idea</h2>
    <p>The core of the system already exists and operates. Founding capital scales it.</p>
    <div class="grid cols-3" style="margin-top:22px"><div class="card"><h3>Academy</h3><p>Instructor and coach education for Nordic Walking, online and in person.</p></div><div class="card"><h3>Instructor &amp; Coach Certification</h3><p>Defined certification and licensing pathways for professionals across North America.</p></div><div class="card"><h3>NW Groups</h3><p>Local group pathways for communities, clubs, employers, and public programs.</p></div><div class="card"><h3>2026 Competition Series</h3><p>Weekly verified Nordic Walking races across six distances and five fair performance levels.</p></div><div class="card"><h3>Challenges</h3><p>Virtual and team participation challenges that bring new people into the sport.</p></div><div class="card"><h3>2027 Series</h3><p>The next season of the NWANA competition calendar, now in planning.</p></div><div class="card"><h3>Partner Network</h3><p>Organizations across North America putting NWANA infrastructure to work.</p></div><div class="card"><h3>NWANA Engine</h3><p>The operating technology behind education, registration, licensing, groups, events, and communications.</p></div><div class="card"><h3>Results &amp; Athlete Infrastructure</h3><p>Verified results, standings, rankings, and athlete development records.</p></div><div class="card"><h3>Future Championships</h3><p>The road to U.S. and North American Nordic Walking Championships.</p></div></div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">The product</div>
    <h2>NWANA Founding Strategic Partner</h2>
    <p>Founding Strategic Partners secure a long-term position across the NWANA ecosystem, with rights designed around the partner. The founding circle is limited in size, with exclusivity defined per agreement and a founding record that belongs to its members.</p>
    <div class="grid cols-3" style="margin-top:22px"><div class="card"><h3>A limited number of founding positions</h3><p>Founding positions are strictly limited, and each position is entered in the NWANA Founding Registry.</p></div><div class="card"><h3>Category exclusivity</h3><p>Category exclusivity may be available and is defined in each founding agreement.</p></div><div class="card"><h3>Permanent founding record</h3><p>Entry in the NWANA Founding Registry: the official historical record — website archive, headquarters recognition, and championship recognition.</p></div><div class="card"><h3>Term architecture</h3><p>Permanent recognition plus long-term activation rights. Horizons are fixed individually in each founding agreement.</p></div><div class="card"><h3>Championships rights</h3><p>Championship integration and rights are defined in each founding agreement.</p></div><div class="card"><h3>Future properties</h3><p>Rights involving future NWANA properties are defined in each founding agreement.</p></div><div class="card"><h3>First-partner advantage</h3><p>The earliest partners secure founding positions and the founding record.</p></div><div class="card"><h3>Content and media activation</h3><p>Storytelling, content, and media programs built around the partner.</p></div><div class="card"><h3>Community, employees, and hospitality</h3><p>Programs connecting the partner with local groups, participants, and employees, plus VIP hospitality at NWANA events.</p></div></div>
    <div class="grid cols-2" style="margin-top:26px">
      <div class="card"><h3>Founding Strategic Partnerships</h3><p style="font-size:26px;font-weight:800;color:var(--navy)">Custom, multi-year</p><p>Full founding position with category exclusivity and ecosystem-wide rights. Investment levels are defined with each partner.</p></div>
      <div class="card"><h3>Major / Category Partnerships</h3><p style="font-size:26px;font-weight:800;color:var(--navy)">Custom</p><p>Scoped per partner: category, properties, term, and activation designed together.</p></div>
    </div>
    <p style="margin-top:18px">Investment levels are formed individually with each partner.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">The second path</div>
    <h2>Philanthropic Founding Circle</h2>
    <p>Not all founding capital comes from sponsorship. The Philanthropic Founding Circle is a separate, equal path for individuals, families, and family offices who want to provide operating and growth capital for NWANA — motivated by honor, respect, and founder status, not by commercial rights.</p>
    <div class="grid cols-2" style="margin-top:22px">
      <div class="card"><h3>Founder status</h3><p>Permanent recognition as a founder of the North American Nordic Walking system — in the NWANA Founding Registry, the official historical record, headquarters recognition, and championship recognition.</p></div>
      <div class="card"><h3>Growth capital, directly</h3><p>Circle gifts fund the operating core: the professional team, national expansion, technology, competitions, and the championship platform.</p></div>
      <div class="card"><h3>Charitable recognition</h3><p>Gifts are charitable contributions to NWANA, a 501(c)(3) public charity. They carry recognition in the NWANA Founding Registry.</p></div>
      <div class="card"><h3>Separate by design</h3><p>Commercial partnership rights and charitable recognition never mix. Each path has its own agreement, its own recognition architecture, and its own purpose.</p></div>
    </div>
    <p style="margin-top:18px"><a class="card-link" href="/ways-to-give">Ways to give →</a></p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">The result</div>
    <h2>What your founding partnership makes possible</h2>
    <p>Founding capital creates outcomes: the system your name will stand on.</p>
    <div class="grid cols-3" style="margin-top:22px"><div class="card"><h3>A professional operating team</h3><p>A full-time professional team running the continental federation.</p></div><div class="card"><h3>National expansion</h3><p>NWANA operating in new states, provinces, and regions across North America.</p></div><div class="card"><h3>Scalable technology</h3><p>Systems that run competitions, education records, groups, events, and communications across the federation.</p></div><div class="card"><h3>Major competitions</h3><p>A real competition calendar: verified races, officiating, results, and rankings.</p></div><div class="card"><h3>A North American championship platform</h3><p>The road to U.S. and North American Nordic Walking Championships.</p></div><div class="card"><h3>An instructor and community network</h3><p>Trained instructors and local groups bringing Nordic Walking to communities across the continent.</p></div><div class="card"><h3>National visibility</h3><p>A national audience for Nordic Walking and for the partners who built it.</p></div></div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Next step</div>
    <h2>Start the conversation</h2>
    <p>Contact the President and the partnership team at <a href="mailto:info@nwaofna.org">info@nwaofna.org</a>.</p>
    <div class="cta-row" style="margin-top:18px">
      <a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Founding%20Partnership%20Discussion">Discuss a Founding Partnership</a>
      <a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Request%3A%20Partnership%20Brief">Request the Partnership Brief</a>
    </div>
    <div class="card" style="margin-top:26px"><h3>Looking for the Partner Network?</h3><p>Organizations that want to distribute, deliver, or support NWANA programs through the network model can explore the <a class="card-link" href="/partner-network">NWANA Partner Network →</a></p></div>
    <div class="note" style="margin-top:26px"><strong>Disclaimer.</strong> Submitting an inquiry does not create partner, sponsor, license, sanction, or endorsement status. Partnership scope is confirmed separately by NWANA.</div>
  </div></div>`;
	return layout("Founding & Strategic Partnerships", "partners", content, "NWANA Founding and Strategic Partnerships: help build the North American infrastructure for Nordic Walking and secure long-term category, visibility, and activation rights.");
}

// ---------------- 23b. /partner-network (Partner Network) ----------------

export async function partnerNetworkPage(): Promise<string> {
	const types: [string, string, string[]][] = [
		["01", "Sport Federation / Governing Body", ["Sport integration", "Education", "Competition", "Technical cooperation"], ],
		["02", "Sports Club / Sports Organization", ["Add Nordic Walking programs", "Teams", "Sections", "Events"]],
		["03", "National / Regional Association or Network", ["Distribution", "Referrals", "Multi-location deployment"]],
		["04", "Government / Public Agency", ["Public deployment", "Facilities", "Funding", "Policy alignment"]],
		["05", "Parks / Recreation / Community Infrastructure", ["Locations", "Staff", "Public programs", "Community reach"]],
		["06", "Healthcare / Health System", ["Physical activity", "Referrals", "Education", "Community programs"]],
		["07", "Aging / Senior Services Organization", ["Active aging", "Network distribution", "Local programs"]],
		["08", "School / College / University System", ["Education", "Clubs", "Research", "Wellness", "Competition"]],
		["09", "Employer / Corporation", ["Employee participation", "Community activation", "Funding"]],
		["10", "Sportswear / Equipment / Outdoor Brand", ["Equipment", "Product support", "Activation", "Sponsorship"]],
		["11", "Foundation / Philanthropic Organization", ["Capacity", "Access", "Education", "Research", "Expansion"]],
		["12", "Nonprofit / Community Organization", ["Community delivery", "Referrals", "Volunteers", "Audience access"]],
		["13", "Military / Veterans Organization", ["Programs", "Chapters", "Facilities", "Community participation"]],
		["14", "Event / Race / Competition Organization", ["Events", "Nordic Walking divisions", "Production", "Technical support"]],
		["15", "Venue / Facility Partner", ["Host programs", "Meetings", "Activations", "Competitions"]],
		["16", "Travel / Hospitality / Transportation Partner", ["Travel", "Lodging", "Logistics", "Regional development"]],
		["17", "Technology / Professional Services Partner", ["Technology", "Expertise", "Services", "Infrastructure"]],
		["18", "Research / Academic / Scientific Partner", ["Evidence", "Evaluation", "Research", "Measurement"]],
		["19", "Media / Communications Partner", ["Awareness", "Education", "Storytelling", "Audience reach"]],
		["20", "Local Business / Community Supporter", ["Support a local group", "Event", "Equipment", "Community activation"]],
	];
	const roles: [string, string][] = [
		["Distribute", "Bring NWANA opportunities to members, chapters, affiliates, agencies, employees, campuses, or locations."],
		["Deliver", "Operate or support local groups, instruction, programs, activities, events, or competition."],
		["Support", "Provide funding, sponsorship, equipment, facilities, technology, professional services, or expertise."],
		["Strengthen", "Contribute research, evaluation, public awareness, education, policy alignment, or institutional access."],
	];
	const typeDescs: string[] = [
		"Sport federations, governing bodies, and umbrella sport organizations.",
		"Football, running, ski, athletics, multisport, and other established sports organizations.",
		"Membership organizations, chapter systems, affiliate networks, and professional associations.",
		"Federal, state, provincial, county, municipal, and other public-sector organizations.",
		"Park systems, recreation agencies, community centers, and public recreation networks.",
		"Hospitals, clinics, rehabilitation organizations, health systems, and related providers.",
		"Aging networks, senior services, senior living systems, agencies, and providers.",
		"Schools, colleges, universities, campus systems, and education networks.",
		"Businesses and employers of any size or industry, including multi-location companies.",
		"Sportswear, footwear, outdoor, equipment, wearable, and sporting-goods brands.",
		"Private, family, corporate, and community foundations and other philanthropic organizations.",
		"Charities, community organizations, service organizations, and mission-driven nonprofits.",
		"Military-related organizations, veterans networks, service organizations, and facilities.",
		"Race directors, event companies, competition organizers, and endurance-sport operators.",
		"Stadiums, trails, campuses, resorts, sports complexes, malls, and other venues.",
		"Airlines, rail, hotels, destinations, transportation providers, and travel organizations.",
		"Technology, timing, payments, insurance, legal, accounting, marketing, CRM, and data organizations.",
		"Universities, research institutes, laboratories, researchers, and scientific organizations.",
		"Media organizations, publishers, platforms, agencies, and communications networks.",
		"Restaurants, retailers, local employers, service businesses, and other community businesses.",
	];
	const typeCardsWithDesc = types.map(([num, name, tags], i) => `<div class="card"><div class="meta">${esc(num)}</div><h3>${esc(name)}</h3><p style="font-size:15px;color:var(--muted)">${esc(typeDescs[i])}</p><p style="font-size:13.5px">${tags.map((t) => `<span class="threshold" style="margin:0 6px 6px 0;display:inline-block">${esc(t)}</span>`).join("")}</p></div>`).join("");
	const content = `
  ${pageHead("Partner Network", "NWANA Partner Network", "NWANA Partner Network connects organizations with the infrastructure, programs, and opportunities of the Nordic Walking Association of North America. NWANA works with national and regional networks, sports organizations, government and public agencies, healthcare and aging organizations, schools and universities, corporations, foundations, equipment and outdoor brands, event organizers, research institutions, media, local businesses, and other organizations that can help develop Nordic Walking across North America. Partners may distribute opportunities through existing networks, support local delivery, fund or sponsor NWANA programs, provide equipment or professional services, host activities and events, contribute research, or support public awareness and regional development. NWANA builds the continental infrastructure. Partners help put it to work.")}
  <div class="section"><div class="wrap">
    <div class="kicker">A network built to put infrastructure to work</div>
    <h2>You already have the people, places, networks, or resources</h2>
    <p>NWANA has built the continental infrastructure for Nordic Walking: education, professional pathways, licensing, local group development, competition, technology, and organizational support. The NWANA Partner Network connects that infrastructure with organizations that can distribute, deliver, fund, equip, host, evaluate, promote, or otherwise strengthen Nordic Walking across North America. Partners do not need to become Nordic Walking organizations themselves. They can use the people, locations, networks, expertise, resources, and communities they already have, while NWANA provides the Nordic Walking system. You already have the people, places, networks, or resources. NWANA provides the Nordic Walking infrastructure.</p>
    <h2 style="margin-top:34px">How the system works</h2>
    <div class="grid cols-4" style="margin-top:18px">
      <div class="card"><h3>1. NWANA</h3><p>Education, Licensing, Groups, Competition, Technology, Standards.</p></div>
      <div class="card"><h3>2. Partner Network</h3><p>Distribution, Funding, Equipment, Facilities, Research, Awareness.</p></div>
      <div class="card"><h3>3. Local Organizations</h3><p>Parks, Clubs, Healthcare, Universities, Employers, Communities.</p></div>
      <div class="card"><h3>4. People</h3><p>Groups, Programs, Instruction, Events, Competitions, Participation.</p></div>
    </div>
    <p style="margin-top:18px"><strong>NWANA builds the system. Partners help it reach organizations. Local organizations put it into practice.</strong></p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Find your place</div>
    <h2>Find your place in the network</h2>
    <p>From international brands and national associations to sports clubs, universities, cities, healthcare systems, foundations, and local businesses, there is more than one way to help Nordic Walking grow. Find the type that best describes your organization.</p>
    <div class="grid cols-3" style="margin-top:22px">${typeCardsWithDesc}</div>
    <h2 style="margin-top:40px">One organization can play more than one role</h2>
    <p><strong>Your Organization Type Is Only the Beginning.</strong> Partner Type describes what your organization is. Partnership Role describes what you can do with NWANA. One organization may take on several roles.</p>
    <div class="grid cols-2" style="margin-top:18px">${roles.map(([r, d]) => `<div class="card"><h3>${esc(r)}</h3><p>${esc(d)}</p></div>`).join("")}</div>
    <p style="margin-top:18px"><strong>Examples:</strong> A sports club may deliver programs and competitions. A national association may distribute opportunities through its network. A corporation may fund expansion and support employee participation. A university may combine delivery, education, research, and events.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Two big paths</div>
    <div class="grid cols-2">
      <div class="card"><h3>Bring NWANA to your network</h3><p>Already have members, chapters, locations, campuses, agencies, facilities, or communities? Explore how your organization can make NWANA infrastructure available across the network you already serve.</p><p><a class="card-link" href="/partners/become-a-partner">Become a Partner →</a></p></div>
      <div class="card"><h3>Help build the system</h3><p>Want to fund, sponsor, equip, host, or strengthen Nordic Walking across North America? Support NWANA's organizational capacity, education, local development, competition, regional expansion, equipment access, research, or future championships.</p><p><a class="card-link" href="/partners">Founding Partnerships →</a></p></div>
    </div>
    <h2 style="margin-top:34px">What NWANA brings</h2>
    <p><strong>You Do Not Have to Start From Zero.</strong></p>
    <div class="grid cols-3" style="margin-top:18px">
      <div class="card"><h3>Education</h3><p>Academy and professional development.</p></div>
      <div class="card"><h3>Professional Pathways & Licensing</h3><p>Defined education, certification, licensing, and role pathways.</p></div>
      <div class="card"><h3>NW Groups</h3><p>Fourteen local pathways designed for different organizational environments.</p></div>
      <div class="card"><h3>Sport & Competition</h3><p>Rules, event pathways, athlete participation, results, rankings, and competition development.</p></div>
      <div class="card"><h3>Technology</h3><p>Connected systems for education, registration, licensing, groups, events, fundraising, and communications.</p></div>
      <div class="card"><h3>Continental Coordination</h3><p>A common North American framework connecting organizations that would otherwise develop Nordic Walking separately.</p></div>
    </div>
    <p style="margin-top:22px">Whether you represent a national network, sports club, government agency, company, university, healthcare organization, foundation, brand, research institution, event organization, or local business, we would like to understand what you already have, and what could become possible by connecting it with the NWANA system.</p>
    <div class="note" style="margin-top:26px"><strong>Disclaimer.</strong> Submitting an inquiry does not create partner, sponsor, license, sanction, or endorsement status. Partnership scope is confirmed separately by NWANA.</div>
    <div style="margin-top:26px">${contactCard("Partner Inquiry", "Partner inquiry: info@nwaofna.org. Please include your organization, audience, resources, location, and proposed area of collaboration.")}</div>
  </div></div>`;

	return layout("Partner Network", "partner-network", content, "NWANA Partner Network: 20 partner types, four partnership roles, and two paths to collaborate across North America.");
}

// ---------------- 24. /partners/become-a-partner ----------------

export async function becomePartnerPage(): Promise<string> {
	const content = `
  ${pageHead("Become a Partner", "Become a Partner", "The NWANA Partner Network connects organizations that can help distribute, deliver, fund, equip, host, evaluate, promote, or strengthen Nordic Walking across North America. You do not need to become a Nordic Walking organization yourself. You may already have the people, locations, members, chapters, facilities, expertise, funding, products, or community reach that can help Nordic Walking grow. NWANA provides the shared infrastructure: education, professional pathways, licensing, local group development, competition, technology, standards, and continental coordination. Local organizations and professionals use that infrastructure within their own authority and responsibilities.")}
  <div class="section"><div class="wrap">
    <div class="kicker">Step 1</div>
    <h2>Who can become a partner?</h2>
    <p>The Partner Network is designed for a wide range of organizations, including:</p>
    ${bullets(["sport federations and governing bodies", "sports clubs and sports organizations", "national and regional associations or networks", "government and public agencies", "parks and recreation organizations", "healthcare and health systems", "aging and senior-services organizations", "schools, colleges, and universities", "employers and corporations", "sportswear, equipment, and outdoor brands", "foundations and philanthropic organizations", "nonprofits and community organizations", "military and veterans organizations", "event and competition organizations", "venues and facilities", "travel, hospitality, and transportation organizations", "technology and professional-service providers", "research and academic institutions", "media and communications organizations", "local businesses and community supporters"])}
    <p>NWANA's Partner Network architecture uses these twenty primary organization types while allowing each organization to take on multiple partnership roles.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Ways to participate</div>
    <h2>There is more than one way to participate</h2>
    <p>A partner relationship may involve one or several roles. Your organization may:</p>
    <div class="grid cols-3" style="margin-top:18px">
      <div class="card"><h3>Distribute</h3><p>Make NWANA opportunities available through members, chapters, affiliates, agencies, campuses, employees, or locations.</p></div>
      <div class="card"><h3>Deliver</h3><p>Operate or support local groups, instruction, programs, events, or participation opportunities.</p></div>
      <div class="card"><h3>Fund</h3><p>Support organizational capacity, education, regional development, access, research, or specific NWANA programs.</p></div>
      <div class="card"><h3>Sponsor</h3><p>Support NWANA, a program, Series, campaign, or event through an agreed sponsorship relationship.</p></div>
      <div class="card"><h3>Equip</h3><p>Provide poles, apparel, footwear, technology, timing systems, products, or related expertise.</p></div>
      <div class="card"><h3>Host</h3><p>Provide venues, trails, campuses, parks, meeting spaces, or event locations.</p></div>
      <div class="card"><h3>Educate</h3><p>Support professional preparation for instructors, coaches, officials, organizers, and other roles.</p></div>
      <div class="card"><h3>Develop Competition</h3><p>Support events, divisions, officials, timing, production, or participant services.</p></div>
      <div class="card"><h3>Research & Evaluate</h3><p>Contribute research, measurement, implementation studies, or program evaluation.</p></div>
      <div class="card"><h3>Provide Professional or Technical Capacity</h3><p>Support technology, legal, accounting, insurance advisory, CRM, data, communications, design, or other professional needs.</p></div>
      <div class="card"><h3>Build Awareness</h3><p>Support media, public education, storytelling, communications, and audience reach.</p></div>
      <div class="card"><h3>Enable Public or Institutional Deployment</h3><p>Help connect NWANA infrastructure with public, educational, healthcare, corporate, or other institutional systems.</p></div>
    </div>
    <p style="margin-top:18px">These roles are defined separately from Partner Type so that one organization can participate in several ways.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">What we want to understand</div>
    <h2>Before any partnership is defined</h2>
    <p>Before any partnership is defined, NWANA wants to understand: who your organization is; where you operate; who you serve or reach; what resources, network, expertise, facilities, or capabilities you already have; what part of NWANA interests you; and what kind of relationship you would like to explore. That is why the next step is a short Partner Inquiry rather than an automatic enrollment.</p>
    <h2 style="margin-top:30px">What happens after you submit an inquiry?</h2>
    <p>NWANA will review the information you provide and determine the appropriate next step. Depending on the opportunity, that may include:</p>
    ${bullets(["a discovery conversation", "clarification of the proposed role and geography", "identification of the relevant NWANA pathway or program", "discussion of responsibilities, support, funding, sponsorship, recognition, or deliverables", "and, where appropriate, a defined partnership agreement"])}
    <p>Submitting an inquiry does not automatically create Partner status. The Partner Network framework explicitly separates inquiry, review, scoping, approval, activation, and public listing.</p>
    <div style="margin-top:26px">${contactCard("Partner Inquiry", "Ready to explore a relationship with NWANA? Complete our Partner Inquiry. Please include: your organization; where you operate; who you serve; your resources, network, expertise, or facilities; which part of NWANA interests you; what kind of relationship you want to explore.")}</div>
    <div class="note" style="margin-top:26px"><strong>Disclaimer.</strong> Submission of an inquiry does not create a partnership, sponsorship, license, certification, sanction, endorsement, appointment, or authorization to operate on behalf of NWANA. Any approved relationship is defined separately by its scope, responsibilities, applicable NWANA requirements, and written terms where required.</div>
  </div></div>`;

	return layout("Become a Partner", "become-a-partner", content, "Become an NWANA Partner: who can join, participation roles, the inquiry process, and next steps.");
}
