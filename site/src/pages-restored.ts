// Pages restored from the live 2026-11-09 production version.
// Static page bodies are the exact rendered content of the live pages
// (snapshots in ~/workspace/site-live-2026-11-09). The Athlete Cabinet is
// dynamic: it aggregates the same finalized race_event_results the rest of
// the site reads, with points = 1001 - level_place (the standings rule).
// Athlete license labels are carried in ATHLETE_LICENSES below: no D1 table
// holds them (verified 2026-11-19 against the live database schema); the
// 2026-11-09 cabinet rendered exactly these five holders.

import { DISTANCES, getCompetitionCalendar, getPastResults, levelNameOf } from "./data";
import { esc, layout } from "./views";

// ---------------- /championships ----------------

export async function championshipsPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">NWANA Sport · Championships</div><h1>NWANA Championships</h1><p>The destination of the NWANA sport system: United States and North American championship titles in Nordic Walking, built on the weekly Series, the Academy, and a growing corps of trained organizers and judges across the continent.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Championship calendar</div>
    <h2>Championships in development</h2>
    <p>NWANA is developing its first championship cycle. TBD in the table marks a championship in active development: the federation confirms each location and date as host agreements are signed, and publishes them here.</p>
    <table class="results" style="margin-top:22px">
      <tr><th>Championship</th><th>Years</th><th>Location</th><th>Dates</th></tr>
      <tr><td>U.S. Nordic Walking Championships</td><td>2027–2028</td><td>TBD</td><td>TBD</td></tr>
      <tr><td>North American Nordic Walking Championships</td><td>2027–2028</td><td>TBD</td><td>TBD</td></tr>
    </table>
    <p style="margin-top:18px">Official championship sites: <a href="https://uschamp.nwaofna.org">U.S. Nordic Walking Championships</a> · <a href="https://nachamp.nwaofna.org">North American Nordic Walking Championships</a></p>
    <p style="margin-top:10px">The Championship Priority Lists are open on RunSignup: <a href="https://runsignup.com/Race/FL/SaintPetersburg/USNordicWalkingChampionships">join the U.S. list</a> · <a href="https://runsignup.com/Race/FL/SaintPetersburg/NorthAmericanNordicWalkingChampionships">join the North American list</a>. List members receive their registration invitations first when registration opens.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">The sport</div>
    <h2>Disciplines and championship racing</h2>
    <p>Championship racing grows from the Series distances: 1K, 3K, 5K, 10K, 15K and 20K. NWANA develops championship formats toward in-person racing: stadium, road and cross-country courses, with relay racing in the championship program as the host format matures. Championship competition is official NWANA competition, and athletes race with the Athlete License.</p>
    <h2 style="margin-top:30px">Qualification in development</h2>
    <p>The championship selection system is in development as part of the sport program: Series results and rankings form its foundation, and NWANA publishes qualification rules as the first championship host agreements are confirmed.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Building the championships</div>
    <h2>A development program, open to partners</h2>
    <div class="grid cols-3" style="margin-top:22px">
      <div class="card"><h3>Host cities</h3><p>Cities and venues join the championship development program as hosts of the first U.S. and North American titles.</p></div>
      <div class="card"><h3>Organizers and judges</h3><p>NWANA Academy prepares championship organizers, race directors and judges, with practical assessments at Series and sanctioned events.</p></div>
      <div class="card"><h3>Championship partners</h3><p>Founding championship partner positions open as the championship program is confirmed, with partnership scope formed in individual agreements.</p></div>
    </div>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="/series/2027">Race the 2027 Series</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="/institutional-programs/sports-associations">For associations and organizers</a>
    </div>
  </div></div>`;
	return layout("NWANA Championships", "championships", content, "NWANA Championships: U.S. and North American Nordic Walking championship titles in development, with locations and dates to be confirmed.");
}

// ---------------- /licenses ----------------

export async function licensesPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">NWANA Licensing</div><h1>NWANA Licenses</h1><p>NWANA licenses are the official status of athletes and professionals in North American Nordic Walking. An active license records your level in the national registry, carries your official results, and opens the professional paths of the federation.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Athlete License</div>
    <h2>Athlete License</h2>
    <p>The Athlete License is the official competitive status of a Nordic Walking athlete in the NWANA system. NWANA Series events welcome every participant, and the official standings, season points, ratings, titles and awards belong to athletes with an active Athlete License. The U.S. and North American Championships race open categories for every participant and an official championship standings for licensed athletes.</p>
    <p style="margin-top:14px"><strong>$65 per year.</strong></p>
    <p style="margin-top:10px">The license year runs to December 31. Licenses purchased from October 28, 2026 through December 31, 2026 are valid through December 31, 2027. A license purchased from November 1 covers the rest of the current year and the full following year at the same price.</p>
    <ul style="margin-top:14px">
      <li>Official season standings and rating points in the NWANA Open Series</li>
      <li>Official championship standings at the U.S. and North American Championships</li>
      <li>Titles and awards of the official standings</li>
      <li>10 percent entry discount at NWANA's own competitions</li>
      <li>NWANA Safe Sport course free in the Academy</li>
      <li>Your record in the national athlete registry</li>
    </ul>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="https://license.nwaofna.org">Get the Athlete License</a>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Professional Licenses</div>
    <h2>Professional Licenses</h2>
    <p>Professional licenses confirm an approved role and level in the NWANA system: instructor, coach, judge, race director, technical official. Every professional path begins with the Nordic Walking Instructor, Beginner Level Certification, and each stage builds on the one before it. Each license follows its Academy education: complete the course, earn the certificate, pass the NWANA License Eligibility Review, and purchase the approved license. The certificate records your education; the active license records your current professional status.</p>
    <h3 style="margin-top:26px">Instructor</h3>
    <table class="results" style="margin-top:12px">
      <tr><th>License</th><th>Annual fee</th><th>Path</th></tr>
      <tr><td>Instructor Beginner License</td><td>$95 per year</td><td>Entry license after the Nordic Walking Instructor, Beginner Level Certification.</td></tr>
      <tr><td>Fundamentals Instructor License, Level 1</td><td>$125 per year</td><td></td></tr>
      <tr><td>Fitness &amp; Wellness Instructor License, Level 2</td><td>$175 per year</td><td></td></tr>
      <tr><td>Competition Technique Instructor License, Level 3</td><td>$225 per year</td><td></td></tr>
    </table>
    <h3 style="margin-top:26px">Coach</h3>
    <table class="results" style="margin-top:12px">
      <tr><th>License</th><th>Annual fee</th></tr>
      <tr><td>Development Coach License, Level 1</td><td>$275 per year</td></tr>
      <tr><td>Competition Coach License, Level 2</td><td>$325 per year</td></tr>
      <tr><td>High Performance Coach License, Level 3</td><td>$395 per year</td></tr>
    </table>
    <h3 style="margin-top:26px">Officials</h3>
    <table class="results" style="margin-top:12px">
      <tr><th>License</th><th>Annual fee</th></tr>
      <tr><td>Competition Judge License, Level 1</td><td>$75 per year</td></tr>
      <tr><td>Competition Judge License, Level 2</td><td>$125 per year</td></tr>
      <tr><td>Competition Judge License, Level 3</td><td>$175 per year</td></tr>
      <tr><td>Competition Technical Official License</td><td>$95 per year</td></tr>
      <tr><td>Race Director License</td><td>$195 per year</td></tr>
    </table>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Children and Youth Specializations</div>
    <h2>Children and Youth Specializations</h2>
    <p>Children and youth specializations extend an active Instructor or Coach license for work with young participants. The Academy specialization track is in preparation, and license purchase opens for qualified specialists as each course launches.</p>
    <ul style="margin-top:14px">
      <li>Children's Nordic Walking Instructor License: $75 per year.</li>
      <li>Youth Nordic Walking Instructor License: $75 per year.</li>
      <li>Children's Development Coach License: $95 per year.</li>
      <li>Youth Development Coach License: $125 per year.</li>
      <li>Elite Youth Coach License: $195 per year.</li>
      <li>Minor Participant License: $49 per year. The license of a young participant in NWANA programs.</li>
    </ul>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">How NWANA Licensing Works</div>
    <h2>How NWANA Licensing Works</h2>
    <ul style="margin-top:14px">
      <li>The license year ends on December 31 for every license. Licenses purchased from October 28, 2026 through December 31, 2026 run to December 31, 2027. Purchases from November 1 run to December 31 of the following year.</li>
      <li>The highest license of a line includes the lower levels of the same line.</li>
      <li>A professional who holds several roles pays the primary license in full and receives each additional license of another line at 50 percent, with each qualification confirmed.</li>
      <li>An active professional license carries the Athlete License at 50 percent.</li>
      <li>Professional licenses renew for each new license year, and renewal builds on the qualification requirements of the role.</li>
      <li>Free NWANA membership and NW Groups participation stand on their own and welcome everyone.</li>
    </ul>
  </div></div>`;
	return layout("NWANA Licenses", "licenses", content, "NWANA Licenses: the Athlete License and the professional licenses of the NWANA system, with prices, terms and the earning paths.");
}

// ---------------- /series/2027 ----------------

export async function series2027Page(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">NWANA Sport · Season 2027</div><h1>2027 NWANA Open Nordic Walking Series</h1><p>One annual season in five parts: Winter, Spring, Summer and Fall Series, closing with the NWANA Cup in December. Official virtual competition for Athlete License holders across six distances, with categories, points and rankings, and a pathway toward the NWANA Championships.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Season status</div>
    <h2>A season in preparation</h2>
    <p>The 2027 season architecture is approved and presented here in full. NWANA is building the season now: the calendar takes shape part by part, and registration opens on this page as each competition is created. The 2026 season races every week in the meantime, and its calendar and results stand on the Series pages.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="/calendar">2026 Competition Calendar</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="/results">Official Results</a>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Season structure</div>
    <h2>Five parts, one championship year</h2>
    <div class="grid cols-3" style="margin-top:22px"><div class="card"><h3>Winter Series</h3><p>January to February 2027. The season opens in the heart of winter, with virtual starts across the continent.</p></div><div class="card"><h3>Spring Series</h3><p>March to May 2027. The calendar grows with the daylight, and the standings take their first real shape.</p></div><div class="card"><h3>Summer Series</h3><p>June to August 2027. Peak season racing across all six distances.</p></div><div class="card"><h3>Fall Series</h3><p>September to November 2027. The final points campaign before the Cup.</p></div><div class="card"><h3>NWANA Cup</h3><p>December 2027. The season final: the year's leading athletes race for the Cup across the championship distances.</p></div>
      <div class="card"><h3>The full year</h3><p>Points earned across the four seasonal Series carry into the NWANA Cup, where the season's titles are decided.</p></div>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Distances and rhythm</div>
    <h2>Six distances, four racing weekends a month</h2>
    <p>The season races the six Series distances: 1K, 3K, 5K, 10K, 15K and 20K. Each month runs four competition weekends: the first weekend races 1K and 5K, the second 3K and 10K, the third 1K and 15K, the fourth 3K and 20K. The short distances race twice a month; every distance races at least once a month.</p>
    <h2 style="margin-top:30px">Categories, points and rankings</h2>
    <p>Athletes race in Youth, Open and Masters competition and in age groups, earning points toward the season rankings in every start. Each athlete's points count in the Open standings and in the age group standings. The Open winner holds the Open title, and age group victories belong to the leading athletes of each group in line behind the Open podium.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Participation</div>
    <h2>Official competition for licensed athletes</h2>
    <p>Participation in NWANA competitions is open to every athlete. The official standings of the Series and the Championships, with season points, ratings, titles and awards, are maintained for athletes holding an active NWANA Athlete License, and championship titles are awarded within the official standings under the championship regulations. The federation's open program travels alongside it: Charity Challenges welcome everyone, with teams, personal goals and fundraising, and ask for enthusiasm alone.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="https://license.nwaofna.org">Get the Athlete License</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="/challenges">Charity Challenges, open to everyone</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="/championships">The road to the Championships</a>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Partnerships</div>
    <h2>Build the season with NWANA</h2>
    <p>Season partnerships, distance partnerships and Cup partnerships form individually with each partner as the calendar is built. Companies and organizations that want a place in the 2027 season start the conversation with the partnerships office.</p>
    <p style="margin-top:14px"><a class="card-link" href="/sponsors">Sponsorship programs →</a> <a class="card-link" href="/partners" style="margin-left:18px">Strategic partnerships →</a></p>
  </div></div>`;
	return layout("2027 NWANA Open Nordic Walking Series", "series-2027", content, "The 2027 NWANA Open Nordic Walking Series: Winter, Spring, Summer and Fall Series and the December NWANA Cup. Official virtual competition for Athlete License holders.");
}

// ---------------- /institutional-programs ----------------

export async function institutionalProgramsPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Institutional Programs</div><h1>Nordic Walking programs for organizations and networks</h1><p>NWANA builds Nordic Walking programs together with park agencies, school districts, universities, community networks, health organizations and sports associations. The federation brings a complete program into the partner's own system: program design, workforce training, on-site delivery, local groups, events and competition pathways, all running on NWANA's built infrastructure.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Five sectors</div>
    <h2>Choose the door that matches your organization</h2>
    <p>Every sector enters the same NWANA system through its own program shape. An agency may lead with Healthy Aging, a university with a sports section, a sports association with competitions. The entries are equal, and programs grow from the first step into the full system.</p>
    <div class="grid cols-3" style="margin-top:22px"><div class="card"><h3>Parks & Recreation</h3><p>Complete Nordic Walking programs for park and recreation agencies: Healthy Aging, trained staff, local groups at parks and centers, events and virtual competitions.</p><p style="margin-top:12px"><a class="card-link" href="/institutional-programs/parks-recreation">Explore the program →</a></p></div><div class="card"><h3>Schools & Universities</h3><p>Staff wellness, physical education, sports sections and instructor training for districts, schools and universities.</p><p style="margin-top:12px"><a class="card-link" href="/institutional-programs/schools-universities">Explore the program →</a></p></div><div class="card"><h3>Community & Fitness Networks</h3><p>A complete Nordic Walking program that community, sport and education networks adopt across their locations, with local groups and a national calendar.</p><p style="margin-top:12px"><a class="card-link" href="/institutional-programs/community-networks">Explore the program →</a></p></div><div class="card"><h3>Health & Active Aging</h3><p>Instructor-led Nordic Walking programs for health systems and active aging organizations, with regular sessions, groups and events.</p><p style="margin-top:12px"><a class="card-link" href="/institutional-programs/health-active-aging">Explore the program →</a></p></div><div class="card"><h3>Sports Associations & Event Organizers</h3><p>Nordic Walking inside existing competitions: rules, sanctioning, officiating, organizer education and a championship pathway.</p><p style="margin-top:12px"><a class="card-link" href="/institutional-programs/sports-associations">Explore the program →</a></p></div>
      <div class="card"><h3>Talk with NWANA first</h3><p>Every program begins with a working conversation about your organization, your audiences and your goals. NWANA then prepares a program proposal with composition, stages and budget categories.</p><p style="margin-top:12px"><a class="card-link" href="/contact">Contact the federation office →</a></p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Program composition</div>
    <h2>What a program includes</h2>
    <p>Program terms are formed individually with each partner. The composition below is the federation's standard program architecture; each partnership assembles the elements its network needs.</p>
    <div class="grid cols-3" style="margin-top:22px"><div class="card"><h3>Program design and adaptation</h3><p>NWANA designs the program around the partner's audiences, locations and calendar: session formats, group structure, event formats and progression routes.</p></div><div class="card"><h3>Instructor and workforce development</h3><p>Agency and network staff train on NWANA Academy levels, with tailored instructor programs for the partner's workforce and certification through the Academy.</p></div><div class="card"><h3>On-site masterclasses and assessments</h3><p>NWANA coaches deliver masterclasses, practical training and exams at the partner's locations. Field delivery is a funded program service, with travel built into the program budget.</p></div><div class="card"><h3>Community implementation</h3><p>Programs launch as living local activity: regular sessions, NW Groups based at the partner's locations, themed Community Events and ongoing methodological support.</p></div><div class="card"><h3>Competition and challenge pathways</h3><p>Participants progress into the federation's calendar: virtual Series cycles, open Charity Challenges and Community Events that connect locations into one national system.</p></div><div class="card"><h3>Monitoring and program support</h3><p>NWANA supports the partner with participation records, program reporting, evaluation formats and development planning for the next cycle.</p></div></div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Ways to start</div>
    <h2>Five entries into the system</h2>
    <div class="grid cols-3" style="margin-top:22px"><div class="card"><h3>Start with staff training</h3><p>Train the first instructors and open the program with a prepared team.</p></div><div class="card"><h3>Start with a local group</h3><p>Open an NW Group at one location and grow from real weekly activity.</p></div><div class="card"><h3>Start with a competition cycle</h3><p>Enter the virtual Series or an open challenge cycle and engage participants across locations.</p></div><div class="card"><h3>Start with an event</h3><p>Run a Community Event: a Discovery walk, a sports day or a themed gathering on NWANA methodology.</p></div><div class="card"><h3>Start with the full program</h3><p>Build the complete program at once: design, training, masterclasses, groups, events and evaluation.</p></div>
      <div class="card"><h3>The first step</h3><p>A working conversation with NWANA, then a joint program proposal: composition, stages, responsibilities and budget categories, ready for the partner's own decision process.</p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Instructor education for participating organizations</div>
    <h2>Your people, trained by the federation</h2>
    <p>Participating organizations enroll their own nominees in NWANA instructor education with a dedicated enrollment code. The organization chooses the people; NWANA provides their Nordic Walking instructor education. Individual sponsored seats are awarded separately through the NWANA Instructor Growth Fund, as donations fund them.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="https://challenges.nwaofna.org/organizations">Organization enrollment</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="https://academy.nwaofna.org">NWANA Academy</a>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Start the conversation</div>
    <h2>Contact the partnerships office</h2>
    <p>Write a few lines about your organization, your network and the program you want to build. NWANA replies with the relevant program composition and a proposal for a working conversation.</p>
    <div style="margin-top:26px"><div class="card"><h3>Contact NWANA</h3><p>For institutional program inquiries, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Institutional Programs inquiry</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Institutional%20Programs%20inquiry">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Institutional Programs", "institutional-programs", content, "NWANA Institutional Programs: complete Nordic Walking programs for park agencies, schools, universities, community networks, health organizations and sports associations.");
}

// ---------------- /institutional-programs/parks-recreation ----------------

export async function institutionalParksPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Institutional Programs · Parks &amp; Recreation</div><h1>Nordic Walking programs for park and recreation agencies</h1><p>Parks are where America already walks. NWANA brings park and recreation agencies a complete Nordic Walking program: a Healthy Aging program for residents, trained agency staff, local groups based at parks and recreation centers, themed events and virtual competitions, all inside one national system.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">The program</div>
    <h2>The NWANA Healthy Aging Program for parks</h2>
    <p>The first joint product NWANA offers park agencies is a comprehensive Nordic Walking Healthy Aging Program. Older adults train with poles under instructor guidance, build technique that turns a walk into training, meet in a stable social group, and progress at their own pace. Participants also enter themed events, virtual competitions and Community Events across the wider NWANA system.</p>
    <div class="grid cols-3" style="margin-top:22px"><div class="card"><h3>Program design and adaptation</h3><p>NWANA adapts the Healthy Aging program to the agency's parks, recreation centers, resident audiences and seasonal calendar.</p></div><div class="card"><h3>Instructor and workforce development</h3><p>Agency staff train through a dedicated Nordic Walking instructor program for parks and recreation on NWANA Academy levels, online with a final assessment.</p></div><div class="card"><h3>On-site masterclasses and practical assessments</h3><p>NWANA's championship-level coaches travel to the agency, deliver masterclasses, run practical exams and help launch the first groups. Field delivery is a funded program service, with travel and lodging in the program budget.</p></div><div class="card"><h3>Community implementation</h3><p>Residents join regular instructor-led sessions at parks and centers. Local NW Groups form at agency locations, and themed Community Events bring new residents in.</p></div><div class="card"><h3>Evaluation and development</h3><p>Participation records, program reporting and a six-minute walking assessment under an agreed protocol show the agency what the program delivers, cycle by cycle.</p></div>
      <div class="card"><h3>A national system behind the program</h3><p>Agency programs connect to NWANA's continental infrastructure: the Academy, the NW Groups registry, the virtual Series, Community Events and the championship pathway. Residents gain a route from a first walk to instructor training, competitions and organizing.</p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">A demonstration start</div>
    <h2>Begin with a funded demonstration</h2>
    <p>NWANA proposes a demonstration format for the first agencies: approximately three to five agencies build the program together in three stages.</p>
    <ul><li>Stage 1, Design: program adaptation, staff selection, training plan and budget for each agency.</li><li>Stage 2, Delivery: staff training and certification, on-site masterclasses, and an 8 to 12 week cycle of resident activity.</li><li>Stage 3, Evaluation and replication: results review, participant and agency feedback, and a replication plan for the next agencies.</li></ul>
    <p>Program funding assembles from national grant programs, agency agreements for training and field delivery, and sponsor support for equipment and participant access. Program development, coordination, instructor education, masterclasses, assessments, travel and evaluation are budget categories of the program itself.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Ways in</div>
    <h2>An agency chooses its own entry</h2>
    <p>Agencies enter the system through the door that fits their season: staff training, a local NW Group at a park or center, a virtual competition cycle for residents, a Community Event, or the full Healthy Aging program. Direct agency agreements for instructor training, on-site masterclasses, practical exams and launch support develop independently of grant cycles, on terms formed with each agency.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="/institutional-programs">All Institutional Programs</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="https://groups.nwaofna.org/organizations">NW Groups for organizations</a>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Start the conversation</div>
    <h2>Contact the partnerships office</h2>
    <p>Tell us about your agency, your parks and centers, and the residents you serve. NWANA prepares the program composition and a proposal for a working conversation.</p>
    <div style="margin-top:26px"><div class="card"><h3>Contact NWANA</h3><p>For park and recreation agency inquiries, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Parks and Recreation program inquiry</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Parks%20and%20Recreation%20program%20inquiry">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Parks & Recreation Programs", "institutional-programs", content, "NWANA programs for park and recreation agencies: the Healthy Aging program, staff instructor training, on-site masterclasses, local groups and events.");
}

// ---------------- /institutional-programs/schools-universities ----------------

export async function institutionalSchoolsPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Institutional Programs · Schools &amp; Universities</div><h1>Nordic Walking for schools, districts and universities</h1><p>NWANA builds Nordic Walking into school and university life on three tracks: employee wellness for staff, physical education and sports sections for students, and Academy instructor training that turns employees into certified program leaders.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Instructor training</div>
    <h2>Free instructor training for your employees</h2>
    <p>Participating districts and universities receive free Beginner instructor training for their employees through NWANA Academy: online lessons, technique video review, and a Final Assessment. The organization selects the employees and receives a dedicated enrollment code for its cohort.</p>
    <p>Trained employees lead walking activity inside their own organization: staff wellness sessions, student groups and community programs. In clinical and rehabilitation settings, activities run under the organization's own professional oversight.</p>
    <div class="cta-row" style="margin-top:22px">
      <a class="btn btn-navy" href="https://challenges.nwaofna.org/organizations">Organization enrollment</a>
      <a class="btn btn-outline" style="border-color:var(--navy);color:var(--navy)" href="https://academy.nwaofna.org">NWANA Academy</a>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Staff wellness</div>
    <h2>A walking program your wellness calendar can hold</h2>
    <p>Nordic Walking gives a wellness program a complete activity: brief energizing sessions during the workday, regular staff walking groups, and technique that makes every session real training. District and university wellness teams coordinate the schedule; NWANA trains the leaders and supplies the program structure.</p>
    <h2 style="margin-top:30px">Students and campus sport</h2>
    <p>Students meet Nordic Walking in physical education, in university sports sections and in student NW Groups. School and university teams enter NWANA's virtual competitions and Community Events, and students who want the sport pathway progress through Academy levels toward instructor, coach and judge qualifications.</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Progression</div>
    <h2>From a first cohort to a standing program</h2>
    <ul><li>Cohort training: the first employees certify as Beginner instructors.</li><li>Program launch: staff sessions and student groups open on a regular schedule.</li><li>Local presence: an NW Group anchors the organization in the NWANA registry.</li><li>Growth: higher Academy levels prepare instructors, coaches and event organizers inside the organization.</li></ul>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Start the conversation</div>
    <h2>Contact the partnerships office</h2>
    <p>Tell us about your district or university and the employees and students you serve. NWANA prepares the training and program composition for a working conversation.</p>
    <div style="margin-top:26px"><div class="card"><h3>Contact NWANA</h3><p>For school district and university inquiries, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Schools and Universities program inquiry</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Schools%20and%20Universities%20program%20inquiry">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Schools & Universities Programs", "institutional-programs", content, "NWANA programs for schools, districts and universities: free instructor training for employees, staff wellness, student groups and sports sections.");
}

// ---------------- /institutional-programs/health-active-aging ----------------

export async function institutionalHealthPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Institutional Programs · Health &amp; Active Aging</div><h1>Nordic Walking programs for health and active aging organizations</h1><p>NWANA builds instructor-led Nordic Walking programs for health systems, senior services and active aging organizations: regular sessions, stable social groups, themed events and a sport pathway for participants who want more.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">The program</div>
    <h2>Active aging with a sport inside</h2>
    <p>Participants train with poles under instructor guidance and build technique that turns a walk into training. The program holds regular sessions across the week, social connection inside a stable group, and themed events through the season. A six-minute walking experiment lets every participant compare walking with poles and walking in the usual way, in distance and in feeling.</p>
    <p>Older adults in the NWANA system also stand on start lines: they join open challenges, represent their sites in Community Events, train toward instructor certification and help organize local groups. The program treats its participants as athletes and community leaders in the making.</p>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Composition</div>
    <h2>What NWANA delivers</h2>
    <div class="grid cols-3" style="margin-top:22px">
      <div class="card"><h3>Program adaptation</h3><p>Session formats, intensity progression and group structure adapted to the organization's participants and locations.</p></div>
      <div class="card"><h3>Staff instructor training</h3><p>Organization staff train and certify through NWANA Academy, with on-site masterclasses and practical assessments as funded program services.</p></div>
      <div class="card"><h3>Ongoing groups</h3><p>Local NW Groups anchor regular participation at each site, with federation standards and support.</p></div>
      <div class="card"><h3>Events and challenges</h3><p>Community Events and open Charity Challenges connect sites into one national calendar and give participants shared goals.</p></div>
      <div class="card"><h3>Measurement</h3><p>Participation records and a six-minute walking assessment under an agreed protocol track the program cycle by cycle.</p></div>
      <div class="card"><h3>Clinical settings</h3><p>In clinical and rehabilitation settings, activities run under the organization's own professional oversight, with NWANA supplying the Nordic Walking methodology and training.</p></div>
    </div>
  </div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">Start the conversation</div>
    <h2>Contact the partnerships office</h2>
    <p>Tell us about your organization and the people you serve. NWANA prepares the program composition and stages for a working conversation.</p>
    <div style="margin-top:26px"><div class="card"><h3>Contact NWANA</h3><p>For health system and active aging organization inquiries, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Health and Active Aging program inquiry</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Health%20and%20Active%20Aging%20program%20inquiry">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Health & Active Aging Programs", "institutional-programs", content, "NWANA Nordic Walking programs for health systems and active aging organizations: instructor-led sessions, groups, events and measurement.");
}

// ---------------- /institutional-programs/sports-associations ----------------

export async function institutionalSportsPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Institutional Programs · Sports Associations &amp; Event Organizers</div><h1>Add Nordic Walking to your competitions</h1><p>NWANA brings the complete sport system to associations and event organizers: competition rules, sanctioning, officiating, organizer and judge education, verified results infrastructure and a championship pathway for the athletes your events develop.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">What NWANA provides</div>
    <h2>The sport, ready to run</h2>
    <div class="grid cols-3" style="margin-top:22px">
      <div class="card"><h3>Rules and sanctioning</h3><p>NWANA competition rules, sanctioning of Nordic Walking competitions and official recognition of results inside the federation system.</p></div>
      <div class="card"><h3>Organizer and judge education</h3><p>Race directors, organizers and judges train through NWANA Academy, with practical assessments at live events.</p></div>
      <div class="card"><h3>Results infrastructure</h3><p>Verified results, standings and rankings run on NWANA's competition infrastructure, integrated with event registration.</p></div>
      <div class="card"><h3>Athlete pathway</h3><p>Your participants gain a development route: Athlete License, the official virtual Series, rankings and the road to NWANA championships.</p></div>
      <div class="card"><h3>Elite credibility</h3><p>NWANA's leadership and Elite Athletes include World and European Championship medalists. See the <a href="/elite">Elite Athletes</a> roster.</p></div>
      <div class="card"><h3>Category growth</h3><p>A Nordic Walking division adds a complete participant category to an existing event: new athletes, new sponsors, a new story for the event.</p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Formats</div>
    <h2>Three ways to bring Nordic Walking in</h2>
    <ul><li>A Nordic Walking division inside an existing running or walking event, run to NWANA rules with official results.</li><li>A dedicated NWANA-sanctioned competition built with the federation from course to podium.</li><li>A season series across several events, with standings that carry athletes toward the championships.</li></ul>
    <div style="margin-top:26px"><div class="card"><h3>Contact NWANA</h3><p>For sports association and event organizer inquiries, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Sports Associations program inquiry</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Sports%20Associations%20program%20inquiry">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Sports Associations & Event Organizers", "institutional-programs", content, "Add Nordic Walking to your competitions with NWANA: rules, sanctioning, officiating, organizer education and verified results.");
}

// ---------------- /institutional-programs/community-networks ----------------

export async function institutionalCommunityPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">Institutional Programs · Community &amp; Fitness Networks</div><h1>A Nordic Walking program your network can adopt</h1><p>NWANA owns a complete Nordic Walking program: the methodology, instructor education, the group launch system and the competition pathways. Community, sport and education networks adopt the program across their locations and give their members a full activity system with local groups and a national calendar.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">The adoption model</div>
    <h2>One program, every location</h2>
    <p>A network adopts Nordic Walking the way national networks adopt established activity programs: NWANA supplies the program and its standards, the network's own instructors deliver it locally, and members move inside one system of groups, events and competitions. Audiences of every age train in the same program: youth and families, adults, and older adults.</p>
    <div class="grid cols-3" style="margin-top:22px">
      <div class="card"><h3>Program package</h3><p>Methodology, session formats, instructor curriculum, group standards and participant pathways, maintained by NWANA as the program owner.</p></div>
      <div class="card"><h3>Workforce first</h3><p>Location instructors and coordinators train and certify through NWANA Academy, with on-site masterclasses for launch teams.</p></div>
      <div class="card"><h3>Local groups</h3><p>Each location opens its NW Group in the federation registry, with a regular weekly schedule and a local leader.</p></div>
      <div class="card"><h3>National calendar</h3><p>Members enter Community Events, open Charity Challenges and virtual Series cycles that connect locations into one national movement.</p></div>
      <div class="card"><h3>Standards and reporting</h3><p>NWANA maintains program standards, participation records and reporting formats across the network.</p></div>
      <div class="card"><h3>Growth path</h3><p>Pilot locations prove the format, trained local leaders carry it to the next locations, and the network scales on its own footprint.</p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Ways in</div>
    <h2>Start where your network stands</h2>
    <p>A network may begin with instructor training for its first locations, a pilot group launch, a network-wide challenge cycle, or a Community Event series. NWANA forms the program composition and stages with each network individually.</p>
    <div style="margin-top:26px"><div class="card"><h3>Contact NWANA</h3><p>For community and activity network inquiries, contact NWANA.</p><p><strong>Email:</strong> <a href="mailto:info@nwaofna.org">info@nwaofna.org</a><br><strong>Subject line:</strong> Community Networks program inquiry</p><p><a class="btn btn-navy" href="mailto:info@nwaofna.org?subject=Community%20Networks%20program%20inquiry">Compose your email</a></p></div></div>
  </div></div>`;
	return layout("Community & Fitness Networks Programs", "institutional-programs", content, "Adopt NWANA's Nordic Walking program across your community network: methodology, instructor training, local groups and a national calendar.");
}

// ---------------- Athlete Cabinet ----------------

const ATHLETE_LICENSES: Record<string, string> = {
	"albert-fatikhov": "Elite Athlete License",
	"michael-blanchard": "Annual Athlete License",
	"susan-otto": "Annual Athlete License",
	"sven-thorslund": "Elite Athlete License",
	"stela-rameau": "Annual Athlete License",
};

const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

function longDate(iso: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	if (!m) return iso;
	return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

function fmt(n: number): string {
	return n.toLocaleString("en-US");
}

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function timeToSecs(t: string | null): number {
	if (!t) return Number.MAX_SAFE_INTEGER;
	const parts = t.trim().split(":").map(Number);
	if (parts.length < 2 || parts.some((p) => Number.isNaN(p) || p < 0)) return Number.MAX_SAFE_INTEGER;
	let s = 0;
	for (const p of parts) s = s * 60 + p;
	return s;
}

interface CabinetResult {
	date: string;
	distance: string;
	time: string | null;
	gender: string;
	level: string;
	place: number;
	points: number;
	record: boolean;
}

interface CabinetAthlete {
	name: string;
	slug: string;
	results: CabinetResult[];
	points: number;
	finishes: number;
	firsts: number;
}

async function cabinetAthletes(db: D1Database): Promise<CabinetAthlete[]> {
	const events = await getPastResults(db, undefined, 200);
	const map = new Map<string, CabinetAthlete>();
	for (const ev of events) {
		for (const r of ev.results) {
			const place = Number(r.level_place);
			if (!r.athlete || Number.isNaN(place) || place < 1) continue;
			const slug = slugify(r.athlete);
			let a = map.get(slug);
			if (!a) {
				a = { name: r.athlete, slug, results: [], points: 0, finishes: 0, firsts: 0 };
				map.set(slug, a);
			}
			const points = 1001 - place;
			a.results.push({
				date: ev.event_date ?? "",
				distance: ev.distance,
				time: r.time,
				gender: (r.gender ?? "").toUpperCase(),
				level: levelNameOf(r),
				place,
				points,
				record: !!r.series_record,
			});
			a.points += points;
			a.finishes += 1;
			if (place === 1) a.firsts += 1;
		}
	}
	return [...map.values()].sort((x, y) => y.points - x.points || x.name.localeCompare(y.name));
}

function athleteCard(a: CabinetAthlete): string {
	const license = ATHLETE_LICENSES[a.slug];
	return `<div class="card" style="text-align:left"><a class="card-link" href="/cabinet/${a.slug}" style="font-size:19px">${esc(a.name)}</a><br><span style="color:var(--muted)">${a.finishes} verified finishes · ${fmt(a.points)} season points</span>${license ? `<br><span style="color:var(--muted)">${esc(license)} holder</span>` : ""}</div>`;
}

export async function cabinetIndexPage(db: D1Database, q: string): Promise<string> {
	const athletes = await cabinetAthletes(db);
	const query = (q ?? "").trim();
	let msg = "";
	if (query) {
		const needle = query.toLowerCase();
		const matches = athletes.filter((a) => a.name.toLowerCase().includes(needle));
		if (matches.length) {
			const rows = matches
				.map(
					(a) =>
						`<p style="padding:13px 0;border-bottom:1px solid #e4e9f0"><a class="card-link" href="/cabinet/${a.slug}" style="font-size:19px">${esc(a.name)}</a><br><span style="color:var(--muted)">${a.finishes} verified finishes · ${fmt(a.points)} season points</span></p>`,
				)
				.join("");
			msg = `<div class="card" style="margin-top:22px;text-align:left">${rows}</div>`;
		} else {
			msg = `<div class="card" style="margin-top:22px;text-align:left"><p>Cabinets open for every athlete in the official Series standings. Enter the name exactly as it appears in the race results and search again.</p></div>`;
		}
	}
	const cards = athletes.map(athleteCard).join("");
	const content = `
  <div class="page-head"><div class="wrap">
    <h1>Athlete Cabinet</h1>
    <p>Your season in one place: results, points and personal bests from the official NWANA Series standings.</p>
  </div></div>
  <div class="section"><div class="wrap" style="max-width:640px">
    <form method="get" action="/cabinet" style="display:flex;gap:10px;flex-wrap:wrap">
      <input type="text" name="q" value="${esc(query)}" placeholder="Your name, as in the race results" aria-label="Your name" style="flex:1;min-width:220px;padding:13px 16px;border:1px solid var(--navy);border-radius:10px;font-size:16px;font-family:inherit">
      <button type="submit" class="btn btn-navy" style="border:none;cursor:pointer;font-family:inherit">Find my cabinet</button>
    </form>
    ${msg}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:22px">${cards}</div>
  </div></div>`;
	return layout("Athlete Cabinet", "cabinet", content, "The personal cabinet of NWANA Series athletes: results, season points and personal bests.");
}

export async function cabinetAthletePage(db: D1Database, slug: string): Promise<string | null> {
	const athletes = await cabinetAthletes(db);
	const a = athletes.find((x) => x.slug === slug);
	if (!a) return null;
	const license = ATHLETE_LICENSES[a.slug];
	const results = [...a.results].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));

	const byLevel = new Map<string, { points: number; latest: string }>();
	for (const r of results) {
		const cur = byLevel.get(r.level) ?? { points: 0, latest: "" };
		cur.points += r.points;
		if (r.date > cur.latest) cur.latest = r.date;
		byLevel.set(r.level, cur);
	}
	const breakdown = [...byLevel.entries()]
		.sort((x, y) => (x[1].latest < y[1].latest ? 1 : x[1].latest > y[1].latest ? -1 : 0))
		.map(([level, v]) => `${esc(level)} ${fmt(v.points)}`)
		.join(" · ");

	// Series records: for each distance and gender division, the fastest
	// series_record-flagged result is the current record. An athlete's count
	// is the number of distances where they hold the current record; the
	// detail line shows their latest flagged result in a held distance.
	const holders = new Map<string, { slug: string; secs: number }>();
	for (const x of athletes) {
		for (const r of x.results) {
			if (!r.record) continue;
			const key = `${r.distance}|${r.gender}`;
			const secs = timeToSecs(r.time);
			const cur = holders.get(key);
			if (!cur || secs < cur.secs) holders.set(key, { slug: x.slug, secs });
		}
	}
	const heldDistances = new Set<string>();
	for (const [key, h] of holders) {
		if (h.slug === a.slug) heldDistances.add(key.split("|")[0]);
	}
	const heldRecords = results.filter((r) => r.record && heldDistances.has(r.distance));
	const lastRecord = heldRecords.length ? heldRecords[0] : null;
	const recordLine = lastRecord
		? `${esc(lastRecord.distance)} · ${esc(lastRecord.time ?? "")} · ${longDate(lastRecord.date)}`
		: "Season in progress";

	const pbs: string[] = [];
	for (const d of DISTANCES) {
		const rows = results.filter((r) => r.distance === d && r.time);
		if (!rows.length) continue;
		const best = Math.min(...rows.map((r) => timeToSecs(r.time)));
		const holders = rows.filter((r) => timeToSecs(r.time) === best).sort((x, y) => (x.date < y.date ? 1 : -1));
		const pb = holders[0];
		pbs.push(`${d} — <strong>${esc(pb.time ?? "")}</strong> (${longDate(pb.date)})`);
	}

	const tableRows = results
		.map(
			(r) =>
				`<tr><td>${esc(r.date)}</td><td>${esc(r.distance)}</td><td><strong>${esc(r.time ?? "")}</strong></td><td>${esc(r.level)}</td><td>${r.place}</td><td>${fmt(r.points)}</td></tr>`,
		)
		.join("");

	const calendar = await getCompetitionCalendar(db, 80);
	const nextRaces = calendar
		.filter((e) => e.event_date)
		.slice(0, 3)
		.map((e) => `${esc(e.title)} — ${longDate(e.event_date ?? "")}`)
		.join("<br>");

	const content = `
  <div class="page-head"><div class="wrap">
    <div class="kicker">Athlete Cabinet</div>
    <h1>${esc(a.name)}</h1>
    <p>${license ? `${esc(license)} holder · ` : ""}Season 2026 · NWANA Open Series</p>
  </div></div>
  <div class="section"><div class="wrap">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:14px">
      <div class="card" style="text-align:center"><div class="meta">Season points</div><div style="font-size:30px;font-weight:800">${fmt(a.points)}</div><p>${breakdown}</p></div>
      <div class="card" style="text-align:center"><div class="meta">Verified finishes</div><div style="font-size:30px;font-weight:800">${a.finishes}</div><p>Season 2026</p></div>
      <div class="card" style="text-align:center"><div class="meta">First in level</div><div style="font-size:30px;font-weight:800">${a.firsts}</div><p>of ${a.finishes} starts</p></div>
      <div class="card" style="text-align:center"><div class="meta">Series records</div><div style="font-size:30px;font-weight:800">${heldDistances.size}</div><p>${recordLine}</p></div>
    </div>
    <div class="card">
      <div class="kicker">My season</div>
      <h3 style="margin-top:4px">Personal bests</h3>
      <p style="font-size:15px">${pbs.join(" · ")}</p>
      <h3 style="margin-top:18px">All results, Season 2026</h3>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="text-align:left;border-bottom:2px solid #071627"><th style="padding:6px 8px">Date</th><th style="padding:6px 8px">Distance</th><th style="padding:6px 8px">Time</th><th style="padding:6px 8px">Level</th><th style="padding:6px 8px">Place in level</th><th style="padding:6px 8px">Points</th></tr>
        ${tableRows}
      </table></div>
      <p style="font-size:13px;color:#667;margin-top:10px">Points: 1,000 for first place in the performance level, 999 for second, and so on, the same rule as the public season standings.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px">
      <div class="card">
        <div class="kicker">Championships</div>
        <h3 style="margin-top:4px">2027–2028 Championships</h3>
        <p style="font-size:15px">The inaugural U.S. and North American Nordic Walking Championships are in preparation, with Priority Lists open for licensed athletes.</p>
        <p style="margin-top:10px"><a class="card-link" href="https://uschamp.nwaofna.org">U.S. Championships →</a> · <a class="card-link" href="https://nachamp.nwaofna.org">North American Championships →</a></p>
      </div>
      <div class="card">
        <div class="kicker">Coming up</div>
        <h3 style="margin-top:4px">Next Series races</h3>
        <p style="font-size:15px">${nextRaces}</p>
        <p style="margin-top:10px"><a class="card-link" href="/calendar">Competition calendar →</a></p>
      </div>
    </div>
    <p style="margin-top:16px"><a class="card-link" href="/cabinet">← Find your cabinet</a></p>
  </div></div>`;
	return layout(
		`Athlete Cabinet — ${a.name}`,
		"cabinet",
		content,
		`Season results, points and personal bests of ${a.name} in the NWANA Open Series.`,
	);
}
