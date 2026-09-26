// NWANA Engine — object fan-out.
//
// Owner's rule: create an object ONCE in the Machine; it then appears in
// every internal and public surface where it belongs, with no repeated
// manual entry.
//
// Fan-out runs automatically at the moment a creation packet is linked to
// its RunSignup race (inside linkRunSignupRace). Everything it writes is
// the machine's own D1 — it never writes to RunSignup — so no extra owner
// confirmation is needed beyond the link action itself. The operation is
// idempotent: re-linking the same packet re-materializes the same rows.
//
// Downstream-readiness map (no distribution code here by design — that
// comes after Create is complete):
// - distribution / marketing / social / email / press / ads: read
//   public_calendar + objects + relationships.
// - sponsorship / sellers / partners: read sponsorship_assets + objects.
// - analytics / reporting / Board summaries: read audit_events + objects
//   + the operating-center overview counts.
// - public site (nwana-site, same shared D1): reads public_calendar
//   (competition and challenge kept strictly separate), site_news, and
//   objects for series/championship pages.

import { generateSponsorshipAsset } from "./sponsorship-asset";
import type {
	CreationPacket,
	CreationPacketMeta,
	ObjectCreationKind,
} from "./object-creation";

export type CalendarKind = "competition" | "challenge";

// Canonical mapping: which creation kinds get a public calendar row, and
// which public view they belong to. Kinds not listed here (fundraising,
// membership, volunteer, store, website) are internal-only and get no
// calendar row.
export const KIND_TO_CALENDAR: Record<ObjectCreationKind, CalendarKind | null> = {
	challenge: "challenge",
	series: "competition",
	championship: "competition",
	race: "competition",
	fundraising: null,
	membership: null,
	volunteer: null,
	store: null,
	website: null,
};

// Sponsorship drafts are generated only for properties the owner can sell.
const SPONSORSHIP_KINDS: ObjectCreationKind[] = ["series", "championship", "challenge"];

export interface FanoutSummary {
	ran_at: string;
	calendar: { kind: CalendarKind; object_id: string } | null;
	parent_relationship: string | null;
	news: { slug: string } | null;
	sponsorship_asset: { id: string; generated: boolean } | null;
	activity: boolean;
}

function nowIso(): string {
	return new Date().toISOString();
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
}

function kindLabel(kind: ObjectCreationKind): string {
	switch (kind) {
		case "series":
			return "Series";
		case "championship":
			return "Championship";
		case "challenge":
			return "Challenge";
		case "race":
			return "Competition event";
		default:
			return kind;
	}
}

/**
 * Materialize the linked packet's object across every internal and public
 * surface: calendar projection, parent relationship, activity log, optional
 * news, optional sponsorship draft. Idempotent.
 */
export async function fanoutLinkedObject(
	db: D1Database,
	packet: CreationPacket,
	canonicalObjectId: string,
): Promise<FanoutSummary> {
	const meta: CreationPacketMeta = packet.meta;
	const calendarKind = KIND_TO_CALENDAR[meta.kind];
	const ranAt = nowIso();

	// 1. Parent relationship first, so the calendar row can reference the
	// parent's series/championship scope. Parent object type comes from the
	// objects table — never inferred from titles or URLs.
	let parentRelationship: string | null = null;
	let seriesRef: string | null = null;
	let championshipRef: string | null = null;
	if (meta.parent_object_id) {
		const parent = await db
			.prepare(`SELECT object_type FROM objects WHERE object_id = ? LIMIT 1`)
			.bind(meta.parent_object_id)
			.first<{ object_type: string }>();
		if (parent?.object_type === "series") seriesRef = meta.parent_object_id;
		if (parent?.object_type === "championship") championshipRef = meta.parent_object_id;
		const relId = `REL-${canonicalObjectId}-PARTOF-${meta.parent_object_id}`;
		await db
			.prepare(
				`INSERT INTO relationships (relationship_id, subject_object_id, relationship_type, target_object_id, created_at, updated_at)
				 VALUES (?, ?, 'part_of', ?, ?, ?)
				 ON CONFLICT (relationship_id) DO UPDATE SET updated_at = excluded.updated_at`,
			)
			.bind(relId, canonicalObjectId, meta.parent_object_id, ranAt, ranAt)
			.run();
		parentRelationship = relId;
	}

	// 2. Public calendar projection (own D1, shared with nwana-site).
	let calendar: FanoutSummary["calendar"] = null;
	if (calendarKind) {
		const eventDate = meta.event_date ?? null;
		if (meta.kind === "series") seriesRef = canonicalObjectId;
		if (meta.kind === "championship") championshipRef = canonicalObjectId;
		await db
			.prepare(
				`INSERT INTO public_calendar (object_id, kind, title, event_date, url, series_ref, championship_ref, status, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
				 ON CONFLICT (object_id, kind) DO UPDATE SET
				   title = excluded.title,
				   event_date = excluded.event_date,
				   url = excluded.url,
				   series_ref = excluded.series_ref,
				   championship_ref = excluded.championship_ref,
				   status = CASE WHEN public_calendar.status = 'cancelled' THEN 'cancelled' ELSE excluded.status END,
				   updated_at = excluded.updated_at`,
			)
			.bind(
				canonicalObjectId,
				calendarKind,
				packet.title,
				eventDate,
				meta.external_race_url ?? null,
				seriesRef,
				championshipRef,
				ranAt,
			)
			.run();
		calendar = { kind: calendarKind, object_id: canonicalObjectId };
	}

	// 3. Activity log (existing audit_events — no new activity table).
	await db
		.prepare(
			`INSERT INTO audit_events (audit_id, object_id, action, module, status, details, created_at)
			 VALUES (?, ?, 'OBJECT_LINKED', 'OBJECT_CREATION', 'SUCCESS', ?, ?)`,
		)
		.bind(
			`AUDIT-OBJECT-LINKED-${packet.packet_id}`,
			canonicalObjectId,
			JSON.stringify({
				kind: meta.kind,
				kind_label: kindLabel(meta.kind),
				title: packet.title,
				runsignup_race_id: meta.runsignup_race_id ?? null,
			}),
			ranAt,
		)
		.run();

	// 4. Public news — only when the packet explicitly asked for it.
	let news: FanoutSummary["news"] = null;
	if (meta.announce_news) {
		const baseSlug = `new-${slugify(kindLabel(meta.kind))}-${slugify(packet.packet_id)}`;
		let slug = baseSlug;
		let attempt = 0;
		while (true) {
			const existing = await db
				.prepare(`SELECT id FROM site_news WHERE slug = ? LIMIT 1`)
				.bind(slug)
				.first<{ id: number }>();
			if (!existing) break;
			attempt += 1;
			slug = `${baseSlug}-${attempt}`;
			if (attempt > 5) throw new Error("Unable to generate unique news slug");
		}
		await db
			.prepare(
				`INSERT INTO site_news (slug, title, body_html, published_at, kind, created_by)
				 VALUES (?, ?, ?, ?, 'announcement', 'engine:object-fanout')`,
			)
			.bind(
				slug,
				`New ${kindLabel(meta.kind)}: ${packet.title}`,
				`<p>NWANA has added a new ${kindLabel(meta.kind).toLowerCase()}: <strong>${packet.title}</strong>. Full details are on the way.</p>`,
				ranAt,
			)
			.run();
		news = { slug };
	}

	// 5. Sponsorship draft — only for sellable properties, and only when the
	// packet is sponsorship-relevant (default yes for these kinds).
	let sponsorshipAsset: FanoutSummary["sponsorship_asset"] = null;
	if (SPONSORSHIP_KINDS.includes(meta.kind) && meta.sponsorship_relevant !== false) {
		const result = await generateSponsorshipAsset(db, meta.kind, canonicalObjectId);
		if (result.ok) {
			sponsorshipAsset = { id: result.asset.id, generated: result.generated };
		}
	}

	return {
		ran_at: ranAt,
		calendar,
		parent_relationship: parentRelationship,
		news,
		sponsorship_asset: sponsorshipAsset,
		activity: true,
	};
}
