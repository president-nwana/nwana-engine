// Operating Center — Academy section (Summary / Actions / Details pattern).
//
// Eight functions: Courses, Students, Certifications, Instructor licenses,
// Education partners, Academy operations, Academy performance, Promotion.
//
// Every function renders an HONEST empty state: there are no academy API
// routes in src/index.ts and Moodle at academy.nwaofna.org is NOT connected.
// Nothing here invents numbers, courses, students, or dates.
//
// Content rules: Summary = management summary only (what the function is,
// current state, what needs attention). Actions = real manual owner actions
// that exist in the API today — zero exist here, so an honest note plus a
// disabled "Connect Moodle" placeholder; Promotion is the one exception and
// shows real navigation links into Marketing. Details = what will live here
// and the data source.
//
// Cost rule: this file adds UI only — no API routes, no new services, no new
// runtime cost ($0).

import { ocFunction, ocSectionShell, ocViewScript } from "./oc-shell";

/** Honest Actions view: no academy API routes exist, so no manual action can be run. */
function acaActionsNote(): string {
	return `<section class="panel"><h2>Actions</h2>
		<p class="unavailable">There are no manual actions here yet — the Engine has no academy API routes, so nothing can be run from this screen.</p>
		<div class="row"><button type="button" disabled>Connect Moodle</button></div>
		<p class="meta">Next step: the owner connects Moodle at academy.nwaofna.org and grants the Machine read access; courses, students and certifications then appear automatically. This button is a placeholder — no integration is faked.</p>
	</section>`;
}

/** Honest Details view: what will live here and the data source. */
function acaDetailsNote(title: string, what: string): string {
	return `<section class="panel"><h2>${title}</h2>
		<p class="meta">What will live here: ${what}.</p>
		<p class="meta">Data source: Moodle at academy.nwaofna.org (not connected).</p>
	</section>`;
}

/** Per-tab view loaders — panels are static honest content, so loaders are no-ops. */
function acaBootFns(tabId: string): string {
	return ["summary", "actions", "details"]
		.map((v) => `async function boot_${tabId}_${v}(){ /* static panel; nothing to load yet */ }`)
		.join("\n");
}

// View-routing script, appended exactly once (first tab). Also wires
// [data-aca-goto="<tab>|<view>"] buttons for cross-view navigation.
const ACA_VIEW_SCRIPT =
	ocViewScript("aca", [
		"courses",
		"students",
		"certifications",
		"licenses",
		"edpartners",
		"academyops",
		"performance",
		"promotion",
	]) +
	`
document.querySelector('#app').addEventListener('click',function(e){
	var g=e.target.closest('[data-aca-goto]');
	if(g){var parts=String(g.getAttribute('data-aca-goto')).split('|');__acaSetView(parts[0],parts[1]||'summary',true);}
});
`;

// ---------------------------------------------------------------------------
// 1. Courses
// ---------------------------------------------------------------------------

const COURSES_PANELS = ocFunction(
	"courses",
	"The NWANA Academy course catalog: instructor and coach training programs. The catalog is empty — Moodle is not connected.",
	`<section class="panel"><h2>Courses summary</h2>
		<p><strong>The course catalog</strong> lists every NWANA Academy training program for instructors and coaches.</p>
		<p class="unavailable">Current state: no catalog — Moodle at academy.nwaofna.org is not connected.</p>
		<p><strong>Needs attention:</strong> connect Moodle so the catalog flows into the Academy automatically.</p>
		<button type="button" class="secondary" data-aca-goto="courses|details">What will live here</button>
	</section>`,
	acaActionsNote(),
	acaDetailsNote(
		"Courses — details",
		"the full course catalog: program name, level, language, format, duration, prerequisites, and enrollment status",
	),
);

// ---------------------------------------------------------------------------
// 2. Students
// ---------------------------------------------------------------------------

const STUDENTS_PANELS = ocFunction(
	"students",
	"Course enrollments and the student roster. No roster yet — Moodle is not connected.",
	`<section class="panel"><h2>Students summary</h2>
		<p><strong>The student roster</strong> covers everyone enrolled in Academy courses.</p>
		<p class="unavailable">Current state: no roster — Moodle at academy.nwaofna.org is not connected.</p>
		<p><strong>Needs attention:</strong> connect Moodle so enrollments flow into the Academy automatically.</p>
		<button type="button" class="secondary" data-aca-goto="students|details">What will live here</button>
	</section>`,
	acaActionsNote(),
	acaDetailsNote(
		"Students — details",
		"the student roster: enrollments per course, progress, and completion records",
	),
);

// ---------------------------------------------------------------------------
// 3. Certifications
// ---------------------------------------------------------------------------

const CERTIFICATIONS_PANELS = ocFunction(
	"certifications",
	"Issued certificates and certification records for Academy graduates. No records yet — Moodle is not connected.",
	`<section class="panel"><h2>Certifications summary</h2>
		<p><strong>Certification records</strong> track every certificate the Academy issues to graduates.</p>
		<p class="unavailable">Current state: no records — Moodle at academy.nwaofna.org is not connected.</p>
		<p><strong>Needs attention:</strong> connect Moodle so completions and certificates flow in automatically.</p>
		<button type="button" class="secondary" data-aca-goto="certifications|details">What will live here</button>
	</section>`,
	acaActionsNote(),
	acaDetailsNote(
		"Certifications — details",
		"issued certificates: holder, program, level, issue date, and verification reference",
	),
);

// ---------------------------------------------------------------------------
// 4. Instructor licenses
// ---------------------------------------------------------------------------

const LICENSES_PANELS = ocFunction(
	"licenses",
	"Instructor license records with expiry tracking. No licenses yet — Moodle is not connected.",
	`<section class="panel"><h2>Instructor licenses summary</h2>
		<p><strong>Instructor licenses</strong> record which certified graduates hold an active NWANA instructor license and when it expires.</p>
		<p class="unavailable">Current state: no license records — Moodle at academy.nwaofna.org is not connected.</p>
		<p><strong>Needs attention:</strong> connect Moodle so certification data arrives first; licenses are issued on top of it.</p>
		<button type="button" class="secondary" data-aca-goto="licenses|details">What will live here</button>
	</section>`,
	acaActionsNote(),
	acaDetailsNote(
		"Instructor licenses — details",
		"license records: holder, license type, issue date, expiry date, and renewal status",
	),
);

// ---------------------------------------------------------------------------
// 5. Education partners
// ---------------------------------------------------------------------------

const EDPARTNERS_PANELS = ocFunction(
	"edpartners",
	"Education partner organizations and their agreements. No partners yet — Moodle is not connected.",
	`<section class="panel"><h2>Education partners summary</h2>
		<p><strong>Education partners</strong> are organizations that deliver or co-deliver Academy programs.</p>
		<p class="unavailable">Current state: no partner records — Moodle at academy.nwaofna.org is not connected.</p>
		<p><strong>Needs attention:</strong> connect Moodle so Academy data starts flowing; partner agreements are then recorded here.</p>
		<button type="button" class="secondary" data-aca-goto="edpartners|details">What will live here</button>
	</section>`,
	acaActionsNote(),
	acaDetailsNote(
		"Education partners — details",
		"partner organizations, their agreements, and the programs they deliver or co-deliver",
	),
);

// ---------------------------------------------------------------------------
// 6. Academy operations
// ---------------------------------------------------------------------------

const ACADEMYOPS_PANELS = ocFunction(
	"academyops",
	"The operational summary of the Academy — courses, students and certifications in one view. No data yet — Moodle is not connected.",
	`<section class="panel"><h2>Academy operations summary</h2>
		<p><strong>Academy operations</strong> is the one-screen state of the Academy: catalog, enrollments, and certifications together.</p>
		<p class="unavailable">Current state: no data — Moodle at academy.nwaofna.org is not connected.</p>
		<p><strong>Needs attention:</strong> connect Moodle so every Academy function starts receiving data automatically.</p>
		<button type="button" class="secondary" data-aca-goto="academyops|details">What will live here</button>
	</section>`,
	acaActionsNote(),
	acaDetailsNote(
		"Academy operations — details",
		"the consolidated operational snapshot: catalog size, active students, completions, certifications issued, and licenses active",
	),
);

// ---------------------------------------------------------------------------
// 7. Academy performance — operational-outcome pipeline (never money)
// ---------------------------------------------------------------------------

const PERFORMANCE_PANELS = ocFunction(
	"performance",
	"The operational outcome pipeline: funded places → students → completions → certifications → instructors. No outcome data yet — Moodle is not connected.",
	`<section class="panel"><h2>Academy performance summary</h2>
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
		<p class="unavailable">Current state: no outcome data — Moodle at academy.nwaofna.org is not connected.</p>
		<p><strong>Needs attention:</strong> connect Moodle so the outcome pipeline fills automatically.</p>
	</section>`,
	`<section class="panel"><h2>Actions</h2>
		<p class="unavailable">There are no manual actions here — outcome data arrives automatically once Moodle is connected.</p>
		<p class="meta">Funded places are handled in the Growth section (Instructor Growth Fund); Academy only reports the operational outcome.</p>
	</section>`,
	`<section class="panel"><h2>Academy performance — details</h2>
		<p class="meta"><strong>Funded places</strong> — training places funded by the Instructor Growth Fund (Growth section). Academy tracks only that they exist, never the money.</p>
		<p class="meta"><strong>Students</strong> — enrollments in Academy courses. Data source: Moodle at academy.nwaofna.org.</p>
		<p class="meta"><strong>Course completions</strong> — students who finished a course. Data source: Moodle at academy.nwaofna.org.</p>
		<p class="meta"><strong>Certifications</strong> — certificates issued to graduates. Data source: Moodle at academy.nwaofna.org.</p>
		<p class="meta"><strong>Instructors</strong> — certified graduates who received an instructor license. Data source: Moodle at academy.nwaofna.org.</p>
	</section>`,
);

// ---------------------------------------------------------------------------
// 8. Promotion — runs through Marketing
// ---------------------------------------------------------------------------

const PROMOTION_PANELS = ocFunction(
	"promotion",
	"Academy promotion is executed through Marketing. Nothing to promote yet — the catalog is empty until Moodle is connected.",
	`<section class="panel"><h2>Promotion summary</h2>
		<p><strong>Academy promotion</strong> (courses, certifications, the instructor pathway) is planned and executed through the Marketing section — Ads, Social, Media, and Sites.</p>
		<p class="unavailable">Status: no promotion running — there is nothing to promote yet; the course catalog is empty until Moodle is connected.</p>
		<p><strong>Needs attention:</strong> connect Moodle so courses appear; promotion starts from Marketing once the catalog exists.</p>
	</section>`,
	`<section class="panel"><h2>Promotion actions</h2>
		<p class="meta">Academy has no promotion actions of its own — promotion runs through the Marketing section. These are the only real actions here:</p>
		<div class="row">
			<a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/marketing?tab=ads&view=summary">Ads</a>
			<a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/marketing?tab=social&view=summary">Social</a>
			<a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/marketing?tab=media&view=summary">Media</a>
			<a class="oc-view-btn" style="text-decoration:none;display:inline-block" href="/operating-center/marketing?tab=sites&view=summary">Sites</a>
		</div>
	</section>`,
	`<section class="panel"><h2>Promotion — details</h2>
		<p class="meta">How Academy promotion will work once courses exist: the Academy flags what needs promotion (new courses, new certifications, the instructor pathway); the Machine prepares the campaign or content in the Marketing section; the owner publishes it. All promotion statistics stay in Marketing.</p>
		<p class="meta">Data source for what to promote: the Academy course catalog — Moodle at academy.nwaofna.org (not connected).</p>
	</section>`,
);

export function renderAcademySectionHtml(): string {
	return ocSectionShell({
		section: "academy",
		title: "Academy",
		subtitle: "NWANA Academy — courses, students, certifications, instructor licenses.",
		queryTabs: true,
		tabs: [
			{ id: "courses", label: "Courses", panelsHtml: COURSES_PANELS, script: acaBootFns("courses") + ACA_VIEW_SCRIPT },
			{ id: "students", label: "Students", panelsHtml: STUDENTS_PANELS, script: acaBootFns("students") },
			{ id: "certifications", label: "Certifications", panelsHtml: CERTIFICATIONS_PANELS, script: acaBootFns("certifications") },
			{ id: "licenses", label: "Instructor licenses", panelsHtml: LICENSES_PANELS, script: acaBootFns("licenses") },
			{ id: "edpartners", label: "Education partners", panelsHtml: EDPARTNERS_PANELS, script: acaBootFns("edpartners") },
			{ id: "academyops", label: "Academy operations", panelsHtml: ACADEMYOPS_PANELS, script: acaBootFns("academyops") },
			{ id: "performance", label: "Academy performance", panelsHtml: PERFORMANCE_PANELS, script: acaBootFns("performance") },
			{ id: "promotion", label: "Promotion", panelsHtml: PROMOTION_PANELS, script: acaBootFns("promotion") },
		],
	});
}
