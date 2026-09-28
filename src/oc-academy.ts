// Operating Center — Academy section (NEW; no Academy screens existed before).
//
// Every tab renders an HONEST empty state: there are no academy/course/student/
// certification/license operational tables in migrations (0007/0008 are asset
// seeds only) and no academy API routes in src/index.ts. Nothing here invents
// numbers, courses, students, or dates.
//
// Cost rule: this file adds UI only — no API routes, no new services, no new
// runtime cost ($0).

import { ocSectionShell } from "./oc-shell";

/** Standard honest empty state: Moodle at academy.nwaofna.org is not connected. */
function emptyState(title: string, whatWillLiveHere: string): string {
	return `<section class="panel"><h2>${title}</h2><p class="unavailable">No data yet — Moodle is not connected.</p><p class="meta">What will live here: ${whatWillLiveHere}. Data source: Moodle at academy.nwaofna.org.</p><button type="button" disabled>Подключить Moodle</button><p class="meta">Next step: the owner connects Moodle (academy.nwaofna.org) and grants the Machine read access; courses, students and certifications then appear here automatically. This button is a placeholder — no integration is faked.</p></section>`;
}

/** Minimal per-tab boot function — the shell requires `async function boot_<tabid>()`. Panels are static. */
function noopScript(tabId: string): string {
	return `async function boot_${tabId}(){ /* static panels; nothing to load yet */ }`;
}

export function renderAcademySectionHtml(): string {
	return ocSectionShell({
		section: "academy",
		title: "Academy",
		subtitle: "NWANA Academy — courses, students, certifications, instructor licenses.",
		tabs: [
			{
				id: "courses",
				label: "Courses",
				panelsHtml: emptyState("Courses", "the NWANA Academy course catalog"),
				script: noopScript("courses"),
			},
			{
				id: "students",
				label: "Students",
				panelsHtml: emptyState("Students", "course enrollments and the student roster"),
				script: noopScript("students"),
			},
			{
				id: "certifications",
				label: "Certifications",
				panelsHtml: emptyState("Certifications", "issued certificates and certification records"),
				script: noopScript("certifications"),
			},
			{
				id: "licenses",
				label: "Instructor licenses",
				panelsHtml: emptyState("Instructor licenses", "instructor license records with expiry tracking"),
				script: noopScript("licenses"),
			},
			{
				id: "edpartners",
				label: "Education partners",
				panelsHtml: emptyState("Education partners", "education partner organizations and their agreements"),
				script: noopScript("edpartners"),
			},
			{
				id: "academyops",
				label: "Academy operations",
				panelsHtml: emptyState("Academy operations", "the operational summary of the Academy"),
				script: noopScript("academyops"),
			},
			{
				id: "performance",
				label: "Academy performance",
				panelsHtml: `
					<section class="panel"><h2>Academy performance</h2>
						<div class="pipeline">
							<div class="pstep"><strong>—</strong><span>Funded places</span><p class="unavailable">no data yet</p></div>
							<div class="parrow">→</div>
							<div class="pstep"><strong>—</strong><span>Students</span><p class="unavailable">no data yet</p></div>
							<div class="parrow">→</div>
							<div class="pstep"><strong>—</strong><span>Course completions</span><p class="unavailable">no data yet</p></div>
							<div class="parrow">→</div>
							<div class="pstep"><strong>—</strong><span>Certifications</span><p class="unavailable">no data yet</p></div>
							<div class="parrow">→</div>
							<div class="pstep"><strong>—</strong><span>Instructors</span><p class="unavailable">no data yet</p></div>
						</div>
						<p class="meta">Funded places originate from the Instructor Growth Fund (Growth section); Academy shows only the operational outcome, never money.</p>
						<p class="unavailable">No data yet — Moodle is not connected. Data source: Moodle at academy.nwaofna.org.</p>
					</section>`,
				script: noopScript("performance"),
			},
			{
				id: "promotion",
				label: "Promotion",
				panelsHtml: `
					<section class="panel"><h2>Promotion</h2>
						<p>Academy promotion (courses, certifications, instructor pathway) is executed through the Marketing section. Nothing to promote yet — the course catalog is empty until Moodle is connected.</p>
						<p class="meta">Status: no promotion running. When courses exist, promotion is planned and launched from Marketing.</p>
						<a class="oc-menu-btn" href="/operating-center/marketing#ads">Ads</a>
						<a class="oc-menu-btn" href="/operating-center/marketing#social">Social</a>
						<a class="oc-menu-btn" href="/operating-center/marketing#media">Media</a>
						<a class="oc-menu-btn" href="/operating-center/marketing#sites">Sites</a>
					</section>`,
				script: noopScript("promotion"),
			},
		],
	});
}
