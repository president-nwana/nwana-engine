// National Program & Strategy 2027-2030 page (added 2026-11-20).
// Publishes the two approved English documents as PDF downloads:
// the National Program (what NWANA creates) and the Strategic Plan
// (how NWANA implements it). PDF bytes are embedded in program-docs.ts
// and served through the /downloads/ routes in forms-downloads.ts.

import { layout } from "./views";

export async function nationalProgramPage(): Promise<string> {
	const content = `
  <div class="page-head"><div class="wrap"><div class="kicker" style="color:var(--gold-2)">National Program &amp; Strategy 2027–2030</div><h1>The National Program and the Strategic Plan, 2027–2030</h1><p>NWANA publishes the two documents that define its work for 2027–2030. The National Program sets out the Nordic Walking system NWANA is building in North America. The Strategic Plan sets out how the federation implements the program.</p></div></div>
  <div class="section"><div class="wrap">
    <div class="kicker">The documents</div>
    <h2>Two documents, one system</h2>
    <div class="grid cols-2" style="margin-top:22px">
      <div class="card"><h3>National Program 2027–2030</h3><p>The National Program for the Development of Nordic Walking in North America defines what NWANA creates: a continental system across ten directions, including sport, education, training centers, regional development, organizational development and institutional programs.</p><p style="margin-top:14px"><a class="btn btn-navy" href="/downloads/nwana-national-program-2027-2030.pdf">Download the Program (PDF)</a></p></div>
      <div class="card"><h3>NWANA Strategic Plan 2027–2030</h3><p>The Strategic Plan is the implementation plan for the National Program. It follows the same ten directions in the same order and sets out the operating steps, the decisions and the sequence for each part of the system.</p><p style="margin-top:14px"><a class="btn btn-navy" href="/downloads/nwana-strategic-plan-2027-2030.pdf">Download the Strategic Plan (PDF)</a></p></div>
    </div>
  </div></div>
  <div class="section alt"><div class="wrap">
    <div class="kicker">Edition</div>
    <h2>Published edition</h2>
    <p>Edition of November 2026. NWANA publishes the program documents in English and updates them as the system develops. Organizations that would like to take part in the program are welcome to contact the federation office at <a href="mailto:info@nwaofna.org">info@nwaofna.org</a>.</p>
  </div></div>`;
	return layout("National Program & Strategy 2027–2030", "", content, "The National Program for the Development of Nordic Walking in North America and the NWANA Strategic Plan, 2027–2030: the two program documents of NWANA, published as PDF downloads.");
}
