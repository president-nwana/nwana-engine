// Operating Center — Academy section (Summary / Actions / Details pattern).
//
// One wired function: Overview. The overview tab reads the Engine's
// Academy sync snapshot (academy_instructor_snapshot), fed by the Moodle
// read-only sync, and renders aggregates only: students enrolled,
// certified instructors, per-course counts and the last sync time.
// Individual Academy records and names are never shown here.
//
// The remaining function panels below (Courses, Students, Certifications,
// Instructor licenses, Education partners, Academy operations, Academy
// performance, Promotion) are unwired placeholders kept for a later phase;
// their copy predates the sync snapshot and is left untouched.
//
// Content rules: Summary = management summary only. Actions = honest
// text only (no Academy mutation exists from this screen). Details = the
// data source note. Nothing here invents numbers, courses, students, or
// dates: every number comes from the sync snapshot endpoint.
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
		"overview",
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
			{ id: "overview", label: "Overview", panelsHtml: ACADEMY_OVERVIEW_PANELS, script: ACADEMY_OVERVIEW_SCRIPT + ACA_VIEW_SCRIPT },
		],
	});
}

const ACADEMY_OVERVIEW_SCRIPT = `
	async function boot_overview_summary(){
		const stats=document.querySelector('#aca-ov-stats');
		const courses=document.querySelector('#aca-ov-courses');
		try{
			const data=await api('/api/operating-center/education/overview');
			const byCourse=data.by_course||[];
			if(stats){
				stats.innerHTML=
					'<div class="stat"><strong>'+esc(data.students||0)+'</strong><span>Students enrolled</span></div>'+
					'<div class="stat"><strong>'+esc(data.certified||0)+'</strong><span>Certified instructors</span></div>'+
					'<div class="stat"><strong>'+esc(byCourse.length)+'</strong><span>Courses in the snapshot</span></div>'+
					'<div class="stat"><strong>'+esc(data.last_sync?humanDate(data.last_sync):'never')+'</strong><span>Last sync</span></div>';
			}
			if(courses){
				courses.innerHTML=(data.connected===false?'<div class="unavailable">'+esc(data.note||'The Academy sync snapshot is empty.')+'</div>':'')+
					(byCourse.length?'<table class="data"><thead><tr><th>Course</th><th>Enrolled</th><th>Certified</th></tr></thead><tbody>'+byCourse.map(c=>'<tr><td>'+esc(c.course_id)+'</td><td>'+esc(c.enrolled||0)+'</td><td>'+esc(c.certified||0)+'</td></tr>').join('')+'</tbody></table>':'<div class="unavailable">No courses in the snapshot yet.</div>');
			}
		}catch(err){if(stats)stats.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>';if(courses)courses.innerHTML=''}
	}
	async function boot_overview_actions(){ /* static panel: honest text only, nothing to load */ }
	async function boot_overview_details(){
		const box=document.querySelector('#aca-ov-source');
		if(!box)return;
		try{
			const data=await api('/api/operating-center/education/overview');
			box.innerHTML='<div class="detail"><b>Source:</b> '+esc(data.source||'Moodle read-only sync')+'</div>'+
				'<div class="detail"><b>Last sync:</b> '+esc(data.last_sync||'never')+'</div>'+
				(data.note?'<div class="detail">'+esc(data.note)+'</div>':'')+
				'<p class="meta">The Engine reads Academy aggregates from its sync snapshot (academy_instructor_snapshot), fed by the Moodle read-only sync. Aggregates only: no individual records and no names are ever shown in the Operating Center.</p>';
		}catch(err){box.innerHTML='<div class="unavailable">'+esc(err.message)+'</div>'}
	}
`;

const ACADEMY_OVERVIEW_PANELS = ocFunction(
	"overview",
	"Academy aggregates from the Engine sync snapshot: students enrolled, certified instructors, and per-course counts. Aggregates only - no individual records, no names.",
	`<section class="stats" id="aca-ov-stats"><div class="stat"><strong>…</strong><span>Loading Academy aggregates</span></div></section>
	<section class="panel" style="margin-top:20px"><h2>Students and certifications by course</h2>
		<div id="aca-ov-courses">Loading…</div>
		<p class="meta">Aggregates only. Individual Academy records are never shown in the Operating Center.</p>
	</section>`,
	`<section class="panel"><h2>Actions</h2>
		<p>Individual Academy records are never shown here, and there is no Academy action to run from this screen: the sync is read-only and aggregates arrive automatically.</p>
		<p class="meta">Certification assignment to territory roles appears in the Overview People tab when appointments exist: <a href="/operating-center/overview?tab=people&view=summary">Open Overview - People</a>.</p>
	</section>`,
	`<section class="panel"><h2>Data source</h2>
		<div id="aca-ov-source">Loading…</div>
	</section>`,
);
