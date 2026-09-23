# NWANA Website Content Audit: Old Site vs New Staging Site

Date: 2026-09-22
Old site (current production): https://www.nwaofna.org/ (mirror: https://ticketsignup.io/w/nwaofna)
New site (staging): https://nwana-site.nwana-engine.workers.dev

Method: read-only crawl. Both old-site homepages were fetched in full; the new site was inventoried from its homepage, calendar page, and its source code (routes, nav, footer). No subpage URLs could be extracted from the old site's homepage text (it renders as a long single-page site and the sitemap fetch failed), so the old-site inventory below is section-level. A follow-up pass with a live browser clicking through the old nav and footer is recommended before final migration.

---

## 1. Old-site inventory

### A. nwaofna.org (homepage, fetched in full)
1. `https://www.nwaofna.org/` - Long single-page homepage with sections:
   - Media & Insights: embedded YouTube briefing "Nordic Walking: The Future of Sport"
   - Our Sport System: Licensing; Sanctioned Events; Results & Rankings
   - Our Nonprofit Mission: 501(c)(3) public charity mission statement
   - Choose Your Path: Athletes; Coaches & Judges; Events; Operators (National and Interim Regional Operators)
   - Governance & Integrity: Board of Directors and Advisory Council; Conflict of Interest, Ethics, and Compliance policies; SafeSport & Athlete Protection framework; documented financial accountability
   - Impact & Growth: regional operator development, coach/judge education, youth and community access, international pathways
   - Partners & Support: why organizations support NWANA
   - Elite Athletes Club: prestige listing for verified international achievements
   - Start Here: two first actions for new visitors

### B. ticketsignup.io/w/nwaofna (mirror homepage, fetched in full)
1. `https://ticketsignup.io/w/nwaofna` - Homepage with sections:
   - Intro: 501(c)(3) public charity, continental governing and sanctioning body
   - Discover Nordic Walking: free introductory course
   - 5,000 Free Instructor Opportunities: sponsored Beginner Instructor Course waitlist
   - Explore NWANA: Academy; Nordic Walking Groups; Nordic Walking Sport; Choose Your Role
   - Current NWANA Competitions: virtual series explainer plus "Races this week" and "Races next week" cards
   - Work with NWANA: Partners; Sponsors; Events and Competitions; Donations and Funds
   - Governance, Safety, and Public Trust: governance, legal terms, participant conduct, Safe Sport, Anti-Doping, safety standards, privacy, financial participation
   - The Future of the Sport: education first, community second, competition systems third
   - Contact: "Any questions? Contact us today!" button

Stale-data warning: the mirror lists the September 27 race as 15K. The verified 2026 calendar says September 27 is 5K. Do not migrate race data from the mirror; the new site calendar is the source of truth.

---

## 2. New-site inventory (staging)

Pages (routes confirmed in source):
1. `/` Home: hero ("Every generation gets its fitness movement"), live stats (6 distances, 5 performance levels, 51 verified finishes, 7 athletes), three doors (Compete, Learn, Belong), next 3 races, latest winner, latest news, donate band
2. `/about` About NWANA: federation story, six pillars of the sport system, five steps (how it works), founder Albert Fatikhov, elite athletes (small roster note), board of directors (4 cards: Liene Visocka, Maris Vainovskis, Leonids Reinholds, Albert Tazetdinov, with emails and RunSignup profile links), public benefit and integrity, Candid seal
3. `/results` Results: per-event results tables across all five performance levels plus season standings, auto-synced from the engine
4. `/calendar` Calendar: every upcoming race Sep 26 to Dec 27, 2026, each with a RunSignup register link
5. `/winners` Winners: winner congratulations feed
6. `/news` News: news feed plus individual article pages
7. `/health` Health check endpoint (technical, not user content)

Global elements:
- Topbar: "NWANA is a 501(c)(3) nonprofit public charity. EIN 33-2444142." plus Donate and Academy links
- Header nav: Home, About, Results, Calendar, Winners, News, plus a Network dropdown (Series 2026 Hub, Race Registration, Tickets and Fundraising, NWANA Academy, NWANA Health, Federation Home marked "launching soon")
- Donate links point to the RunSignup donation page (https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT)
- Footer: Our Network links, Get Involved (race calendar, donate, become an instructor, news), Candid transparency seal, copyright line. No legal/policy links in the footer.

---

## 3. Gap analysis: on the old site, missing on the new site

Recommendation key: MIGRATE = copy the content into the new site as its own page or section. LINK = a button on the new site pointing to the existing old page is enough.

1. Privacy Policy (referenced under Governance resources on the mirror; no equivalent on the new site). Recommendation: MIGRATE. A main federation site needs its own privacy policy page linked from the footer. Verify the actual policy text on the old site before copying.
2. Terms of Use / legal terms (referenced on the mirror). Recommendation: MIGRATE as a short footer legal page.
3. SafeSport and Athlete Protection framework (old homepage section plus mirror resources). Recommendation: MIGRATE as a dedicated integrity page. This is core trust content for a sport federation and donors check for it.
4. Anti-Doping policy (referenced on the mirror). Recommendation: MIGRATE, can live as a section of the integrity page above.
5. Participant code of conduct (referenced on the mirror). Recommendation: MIGRATE, can live as a section of the integrity page above.
6. Conflict of Interest, Ethics, and Compliance policies (mentioned on the old homepage). Recommendation: LINK. These are board governance documents; link to the document files rather than building full pages, with a short summary paragraph on the integrity page.
7. Advisory Council (old homepage names "Board of Directors and Advisory Council"; new /about shows the board only). Recommendation: MIGRATE. Add an Advisory Council section to /about.
8. Contact page (mirror has a contact section; new site has no contact page, only board member emails). Recommendation: MIGRATE. Simple Contact page with info@nwaofna.org and the mailing address (7901 4th St N 23228, St. Petersburg, FL 33702).
9. Partners and Sponsors page (old homepage "Partners & Support"; mirror "Partners / Sponsors / Events and Competitions"). Recommendation: MIGRATE as a Partners page. This is revenue-critical and currently absent from the new site.
10. Donate / Ways to Give page (mirror "Donations and Funds"; new site only has donate buttons pointing to the RunSignup form). Recommendation: MIGRATE. Build a /donate page from the existing draft (~/workspace/your_files/ways-to-give-page.md): DAF route, Benevity, mail-in, Candid seal.
11. NW Groups section (mirror "Nordic Walking Groups"; the new site's Belong door currently links to series.nwaofna.org, which looks like a placeholder or wrong link). Recommendation: LINK. Groups live on RunSignup (runsignup.com/MemberOrg/NWANANWGroups); fix the Belong door to point there.
12. 5,000 Free Instructor Opportunities waitlist (mirror section; not on the new site). Recommendation: LINK. A button to the TicketSignup waitlist signup.
13. Discover Nordic Walking / free intro course (mirror section). Recommendation: LINK. Already effectively covered by the Learn door pointing to the Academy; keep one clear button.
14. Media briefing video "Nordic Walking: The Future of Sport" (old homepage YouTube embed). Recommendation: LINK. Feature it as an embedded video in a news post or on /about.
15. Organizers and sanctioned events entry point (old homepage "Choose Your Path" covers Events and Operators with sanctioning info; new site has no organizer path). Recommendation: MIGRATE. Add an organizers/sanctioning entry point, even a compact one, since sanctioned events are a core federation function.
16. "The Future of the Sport" narrative (mirror section: education first, community second, competitions third). Recommendation: MIGRATE, low priority. Fold a shortened version into /about or publish as a news article.

Already covered on the new site, no action needed:
- Elite Athletes Club: covered by the elite athletes section on /about.
- Races this week / next week: covered by /calendar.
- Nonprofit mission and 501(c)(3) status: covered in the topbar, footer, and /about.
- Academy, Series hub, race registration, health site: covered by Network dropdown and door links.

Open issue noticed during the audit (not a content gap): the Belong door on the new homepage reads "Start or join a local NWANA Group" but its button says "Explore the Series" and points to series.nwaofna.org. The label, text, and destination do not match; it should point to the NW Groups pages.


## Old-site page audit via live browser (2026-09-22)

Domain confirmation: https://www.nwaofna.org/ serves the same TicketSignup/RunSignup website-builder site as https://runsignup.com/w/nwaofna (custom domain mapped to the builder site). Nav: HOME | ABOUT | NW SPORT | NW GROUPS | Professional Pathways | NW ACADEMY | More. Footer (12 links, duplicated in More dropdown): Competition Calendar, Choose Your Path, FAQ, Events, Elite Athletes, Support/Funds, Partners, Sponsors, Governance & Policies, SafeSport, Contact, Ways to Give.

### B2B pages (sponsors / partners / press)

- SPONSORS — https://www.nwaofna.org/w/nwaofna/Page/SPONSORS. Pitch deck: why sponsor, 8 tiers (National, Sport Development, Instructor Growth, Community Program, Challenge/Series, Health & Wellness, Youth & Family, Event), visibility benefits, sponsor-vs-partner distinction. No pricing. Contact: info@nwaofna.org, subject "Sponsorship Inquiry". Recommendation: migrate (pricing deliberately absent; keep that).
- PARTNERS (footer link target) — https://runsignup.com/Race/FL/SP/NWANAPartnerNetwork. B2B partner hub: Info, Network Distribution, Sponsors & Funding, Become a Partner, Contact Us. For employers, clubs, community orgs. Recommendation: migrate.
- PARTNERS (standalone page) — https://www.nwaofna.org/w/nwaofna/Page/PARTNERS. NOT PUBLISHED (page shows "not published"). Linked from Sponsors ("Partner With NWANA") and Events ("Partner an Event") pages. Recommendation: do not migrate; fix the two dead links to point at the Partner Network page instead.
- UMBRELLA NW GROUPS — https://runsignup.com/w/nwaofna/Page/UMBRELLA-NW-GROUPS. B2B: form umbrella groups for employers/sponsors; CTAs for HR/wellness leaders. Recommendation: migrate.
- PRESS KIT — https://www.nwaofna.org/w/nwaofna/Page/Press-Kit. 16 sections: media contacts, boilerplate, logo rules, interview topics, request process. Contact info@nwaofna.org, subject "Press / Media Request". Recommendation: migrate.
- CONTACT FOR MEDIA / PARTNERS — https://www.nwaofna.org/w/nwaofna/Page/Contact-for-media-partners. 7 sections, contact routing; info@nwaofna.org, subject "Media / Partner Inquiry"; org location Saint Petersburg, FL 33702 US. Recommendation: merge into Press Kit or a single Contact page; link.
- LOGOS & BRAND ASSETS — https://www.nwaofna.org/w/nwaofna/Page/Logos-brand-assets. 17 sections, usage rules and approval process; info@nwaofna.org, subject "Brand Assets Request". Recommendation: migrate.

### Legal / governance

- GOVERNANCE & POLICIES hub — https://www.nwaofna.org/w/nwaofna/Page/Governance-Policies. Hub linking Privacy Policy, Terms of Use, Terms & Conditions, Code of Conduct, SafeSport, Anti-Doping, Safety Standards, Downloads & Reports, Forms, Logos & Brand Assets, Press Kit, Contact for Media/Partners. Recommendation: migrate (hub + every policy).
- PRIVACY POLICY — https://www.nwaofna.org/w/nwaofna/Page/Privacy-Policy. NWANA's own policy, effective Aug 9, 2026, 18 sections; info@nwaofna.org, subject "Privacy Policy Question". Flag: the footer "Privacy Policy" link points to the TicketSignup PLATFORM policy (https://www.ticketsignup.io/About-Us/Privacy-Policy), not NWANA's own policy. Recommendation: migrate; fix footer link.
- TERMS OF USE — https://www.nwaofna.org/w/nwaofna/Page/Terms-of-Use. Effective Aug 10, 2026, 22 sections. Recommendation: migrate.
- TERMS & CONDITIONS — https://www.nwaofna.org/w/nwaofna/Page/Terms-Conditions. Effective Aug 10, 2026, 25 sections (events, licenses, donations, sponsorships, fees/refunds, IP). Recommendation: migrate.
- CODE OF CONDUCT — https://www.nwaofna.org/w/nwaofna/Page/Code-of-Conduct. Effective Aug 10, 2026, 18 sections. Recommendation: migrate.
- SAFESPORT — https://www.nwaofna.org/w/nwaofna/Page/Safe-Sport. Effective Aug 10, 2026, 16 sections; info@nwaofna.org, subject "Safe Sport Concern". Recommendation: migrate.
- ANTI-DOPING — https://www.nwaofna.org/w/nwaofna/Page/Anti-Doping. Effective Aug 10, 2026, 16 sections; WADA Play True Quiz / ADEL links; not a WADA affiliate; info@nwaofna.org, subject "Anti-Doping Question". Recommendation: migrate.
- SAFETY STANDARDS — https://www.nwaofna.org/w/nwaofna/Page/Safety-Standards. Effective Aug 10, 2026, 21 sections. Recommendation: migrate.
- DOWNLOADS & REPORTS — https://www.nwaofna.org/w/nwaofna/Page/Downloads-Reports. Document repository index, effective Aug 10, 2026, 13 sections. Recommendation: migrate.
- FORMS — https://www.nwaofna.org/w/nwaofna/Page/Forms. Forms catalog, effective Aug 10, 2026, 7 sections (General, Instructor/Coach, Event/Program Proposal, Sponsor/Partner Inquiry, Volunteer, Safety/Incident, Media Request, Document/Brand Asset, Correction). Recommendation: migrate.

### Other pages

- ABOUT — https://www.nwaofna.org/w/nwaofna/Page/ABOUT. Org profile; leadership listed: President Albert Fatikhov (albert.fatikhov@nwaofna.org), Liene Visocka (lv@nwaofna.org), Maris Vainovskis (mv@nwaofna.org), Leonids Reinholds (leonids.reinholds@nwaofna.org), CEO Albert Tazetdinov (albert.tazetdinov@nwaofna.org). Scope: US base, Canada/Mexico/wider North America (development pending). Note: no phone numbers on the About page. Recommendation: reconcile with staging About (board emails + profiles).
- NW SPORT — https://sport.nwaofna.org/. Sport/competition platform (Calendar, Results, Winners Circle, Competition System license, Competition Rules, professional pathways, sponsor CTAs, Donate). Recommendation: link/keep as subdomain; do not rebuild on the apex site.
- NW GROUPS — https://groups.nwaofna.org/. Individual licenses $20/year prorated (5% competition discount); group creation free; recognized NW Group $200/year; License Lookup. Recommendation: link/keep as subdomain.
- PROFESSIONAL PATHWAYS — https://pathways.nwaofna.org/. Instructor/Coach/Judge/Race Director licensing system; eligibility-review process; licenses valid through Dec 31, prorated. Recommendation: link/keep as subdomain.
- NW ACADEMY — https://academy.nwaofna.org/ (Moodle, stays on Hostinger). Pricing: Instructor Beginner $95 (launch), L1 $149, L2 $199, L3 $249; Coach L1 $249, L2 $349, L3 $449; Judge L1 $149, L2 $199, L3 $249; Technical Official $249; Race Director $249. Free intro course; free Safe Sport course. Recommendation: link/keep as subdomain; surface this pricing on the staging site where relevant.
- COMPETITION CALENDAR — https://series.nwaofna.org/Race/NWANANWSeries/Page/COMPETITION-CALENDAR. 2026 series hub. Recommendation: keep series hub; staging /calendar stays engine-backed (source of truth).
- CHOOSE YOUR PATH — https://www.nwaofna.org/w/nwaofna/Page/Choose-Your-Path. 7 persona pathways. Recommendation: migrate.
- FAQ — https://www.nwaofna.org/w/nwaofna/Page/FAQ. ~40 questions, 17 sections. Recommendation: migrate.
- EVENTS — https://www.nwaofna.org/w/nwaofna/Page/EVENTS. 7 sections; sponsor-an-event / partner-an-event CTAs; 5% athlete discounts; series points. Recommendation: migrate content; fix "Partner an Event" dead link.
- ELITE ATHLETES — https://www.nwaofna.org/w/nwaofna/Page/ELITE-ATHLETES. 14 sections, elite profiles. Recommendation: migrate; cross-check against the verified small roster (do not overstate).
- SUPPORT / FUNDS — https://www.nwaofna.org/w/nwaofna/Page/SUPPORT-FUNDS. Fundraising case, priority Instructor Growth Fund; Donate link https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT; matching gifts; 501(c)(3). Recommendation: migrate (dedicated funds page missing on staging).
- WAYS TO GIVE — https://www.nwaofna.org/w/nwaofna/Page/Ways-to-Give. Online donate, DAF, mailed checks ("Nordic Walking Association of North America"/"NWANA", 7901 4th St N 23228, St. Petersburg, FL 33702), EIN 33-2444142, employer matching (Benevity), wire/stock via info@nwaofna.org, Candid profile. Recommendation: migrate.
- CONTACT — https://www.nwaofna.org/w/nwaofna/Page/Contact. Contact form; info@nwaofna.org; Saint Petersburg, FL 33702 US. Recommendation: migrate (contact page missing on staging).

### Convention observed across the old site

All B2B, media, legal, and donor pages route through info@nwaofna.org with distinct subject lines. No president phone anywhere on the site; the only presidential email is albert.fatikhov@nwaofna.org listed on the About page. The staging /sellers CTA was aligned to this convention (info@nwaofna.org) on 2026-09-22.

### Key flags for migration

1. Two published pages link to the unpublished /Page/PARTNERS (dead page) — fix links to the Partner Network page instead.
2. Footer "Privacy Policy" links to the TicketSignup platform policy, not NWANA's own Privacy-Policy page — fix.
3. Staging site has no equivalents for: Sponsors, Partner Network, Umbrella NW Groups, Press Kit, Media contact, Logos & Brand Assets, Governance & Policies hub, Privacy Policy, Terms of Use, Terms & Conditions, Code of Conduct, SafeSport, Anti-Doping, Safety Standards, Downloads & Reports, Forms, FAQ, Choose Your Path, Contact, Support/Funds, Ways to Give. These are the migration backlog for the apex site.
4. Do not migrate race schedules from the ticketsignup.io mirror (known stale: listed Sep 27 as 15K; verified 5K). Engine-backed /calendar is the source of truth.
