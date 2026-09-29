// NWANA Engine — result publication core (ADR-0042).
//
// The publication core (Meta delivery + winner news + next-race promo) is
// shared by two authorization paths:
//   1. The owner's explicit PUBLISH confirmation via POST /result-publications/publish.
//   2. The Machine's autonomous downstream run after owner approval of all
//      event results (ADR-0042) — authorizedBy: "owner_result_approvals".
//
// The core itself never approves anything; it executes publication for an
// already-authorized publication key. Every run is idempotent (deliveries
// are skipped as duplicates; history flips to PUBLISHED once) and audited.

import {
	RESULT_DESTINATIONS,
	getFacebookPageToken,
	publishFacebookResult,
	publishInstagramResult,
} from "./meta-result-publisher";
import { previewSeries2026ResultPublications, buildPublicationDraftFromD1 } from "./series-2026-results";
import {
	autoPublishNextRacePromo,
	autoPublishWinnerNews,
} from "./operating-center";

export interface ResultDeliveryRow {
	destination: string;
	status: string;
	external_id: string | null;
}

export type PublicationAuthorization =
	| { kind: "owner_publish_confirmation" }
	| { kind: "owner_result_approvals"; distance: string; eventId: number };

export interface ExecutePublicationInput {
	db: D1Database;
	runSignupToken: string;
	metaToken: string;
	publicationKey: string;
	imageUrl: string;
	/** PNG bytes for direct upload (bypasses Meta's URL fetcher when the
	 * image host blocks Meta's crawler). If provided, Facebook uses multipart
	 * upload; Instagram still uses imageUrl. */
	imageBytes?: Uint8Array;
	authorizedBy: PublicationAuthorization;
}

export interface ExecutePublicationResult {
	ok: boolean;
	publication_key: string;
	status: string;
	already_published?: boolean;
	deliveries: Record<string, unknown>;
	site_news: unknown;
	next_race_news: unknown;
	/** Per-step factual statuses. Each mandatory downstream step reports its own
	 * outcome; the overall status is not PUBLISHED_COMPLETE unless every
	 * mandatory step succeeded. */
	step_statuses?: Record<string, StepStatus>;
}

/** Factual status for one mandatory downstream step. */
export type StepStatus =
	| { status: "PUBLISHED"; detail?: string }
	| { status: "FAILED"; error: string }
	| { status: "EXCEPTION"; error: string }
	| { status: "SKIPPED_WITH_REASON"; reason: string };

export async function saveResultDelivery(
	db: D1Database,
	publicationKey: string,
	destination: string,
	externalId: string,
): Promise<void> {
	await db.prepare(`
		INSERT INTO result_publication_deliveries (
			publication_key, destination, status, external_id, published_at
		) VALUES (?, ?, 'PUBLISHED', ?, CURRENT_TIMESTAMP)
		ON CONFLICT(publication_key, destination) DO UPDATE SET
			status = 'PUBLISHED',
			external_id = excluded.external_id,
			last_error = NULL,
			published_at = CURRENT_TIMESTAMP,
			updated_at = CURRENT_TIMESTAMP
	`).bind(publicationKey, destination, externalId).run();
}

export async function executeResultPublication(
	input: ExecutePublicationInput,
): Promise<ExecutePublicationResult> {
	const { db } = input;

	const existing = await db.prepare(`
		SELECT status FROM result_publication_history
		WHERE publication_key = ? LIMIT 1
	`).bind(input.publicationKey).first<{ status: string }>();
	if (existing?.status === "LEGACY_BASELINE") {
		throw new Error("Historical baseline results cannot be published as new");
	}
	if (existing?.status === "PUBLISHED" || existing?.status === "PUBLISHED_COMPLETE" || existing?.status === "PUBLISHED_PARTIAL") {
		return {
			ok: true,
			publication_key: input.publicationKey,
			status: existing.status,
			already_published: true,
			deliveries: {},
			site_news: null,
			next_race_news: null,
		};
	}

	const raceId = Number(input.publicationKey.split(":")[2]);
	if (!Number.isInteger(raceId)) {
		throw new Error("Invalid result publication key");
	}
	// Architectural rule (Albert, 2026-09-28): for an already approved/finalized
	// event, publication must NOT re-fetch from RunSignup. Use the D1 canonical
	// finalized snapshot. RunSignup outage must not block publication.
	// Fall back to live RunSignup only if D1 has no finalized snapshot
	// (for new/unprocessed events).
	let draft = await buildPublicationDraftFromD1(db, input.publicationKey);
	if (!draft) {
		const preview = await previewSeries2026ResultPublications(
			input.runSignupToken,
			{ raceId },
		);
		draft = preview.drafts.find(
			(value) => value.publication_key === input.publicationKey,
		) ?? null;
	}
	if (!draft || !draft.ready_for_editorial_review || !draft.editorial_draft.ready_for_approval) {
		throw new Error("Publication draft is missing or not ready");
	}

	await db.prepare(`
		INSERT INTO result_publication_history (
			publication_key, series, status, race_id, event_id, result_set_id, metadata
		) VALUES (?, 'SERIES_2026', 'APPROVED', ?, ?, ?, ?)
		ON CONFLICT(publication_key) DO UPDATE SET
			status = CASE WHEN status IN ('PUBLISHED', 'PUBLISHED_COMPLETE', 'PUBLISHED_PARTIAL') THEN status ELSE 'APPROVED' END,
			metadata = excluded.metadata,
			updated_at = CURRENT_TIMESTAMP
	`).bind(
		draft.publication_key,
		draft.source.race_id,
		draft.source.event_id,
		draft.source.result_set_id,
		JSON.stringify({ editorial_draft: draft.editorial_draft, image_url: input.imageUrl }),
	).run();

	const deliveryResult = await db.prepare(`
		SELECT destination, status, external_id
		FROM result_publication_deliveries
		WHERE publication_key = ?
	`).bind(draft.publication_key).all<ResultDeliveryRow>();
	const delivered = new Map(deliveryResult.results.map((row) => [row.destination, row]));
	const result: Record<string, unknown> = {};

	const facebookDestinations = [
		RESULT_DESTINATIONS.facebookNwana,
		RESULT_DESTINATIONS.facebookNordicWalkingSport,
	] as const;
	for (const destination of facebookDestinations) {
		if (delivered.get(destination.ledgerKey)?.status === "PUBLISHED") {
			result[destination.ledgerKey] = {
				skipped_duplicate: true,
				external_id: delivered.get(destination.ledgerKey)?.external_id,
			};
			continue;
		}
		const pageToken = await getFacebookPageToken(
			input.metaToken,
			destination.pageId,
		);
		const published = await publishFacebookResult({
			pageId: destination.pageId,
			message: draft.editorial_draft.post_text,
			imageUrl: input.imageUrl,
			imageBytes: input.imageBytes,
			pageToken,
		});
		await saveResultDelivery(
			db,
			draft.publication_key,
			destination.ledgerKey,
			published.external_id,
		);
		result[destination.ledgerKey] = published;
	}

	const instagramDestinations = [
		RESULT_DESTINATIONS.instagramNwanaOfficial,
		RESULT_DESTINATIONS.instagramNwSport,
	] as const;
	for (const destination of instagramDestinations) {
		if (delivered.get(destination.ledgerKey)?.status === "PUBLISHED") {
			result[destination.ledgerKey] = {
				skipped_duplicate: true,
				external_id: delivered.get(destination.ledgerKey)?.external_id,
			};
			continue;
		}
		// Instagram requires an image; if the card is unavailable, skip
		// gracefully instead of failing the entire publication.
		if (!input.imageUrl) {
			result[destination.ledgerKey] = { skipped_no_image: true } as unknown as { external_id: string };
			continue;
		}
		try {
			const published = await publishInstagramResult({
				accountId: destination.accountId,
				caption: draft.editorial_draft.post_text,
				imageUrl: input.imageUrl,
				userToken: input.metaToken,
			});
			await saveResultDelivery(
				db,
				draft.publication_key,
				destination.ledgerKey,
				published.external_id,
			);
			result[destination.ledgerKey] = published;
		} catch (error) {
			// Log and continue; Facebook + site news should still go out.
			console.error(`Instagram publish failed for ${destination.ledgerKey}:`, error instanceof Error ? error.message : error);
			result[destination.ledgerKey] = { skipped_error: error instanceof Error ? error.message : "unknown" } as unknown as { external_id: string };
		}
	}

	// Determine publication status based on delivery results.
	// PUBLISHED_COMPLETE: all destinations succeeded.
	// PUBLISHED_PARTIAL: at least one succeeded, at least one failed/skipped.
	// META_DELIVERY_FAILED: all Meta deliveries failed.
	const deliveryEntries = Object.entries(result);
	const succeeded = deliveryEntries.filter(([_, v]) => {
		const r = v as { external_id?: string; skipped_duplicate?: boolean; skipped_error?: string };
		return r.external_id !== undefined || r.skipped_duplicate === true;
	});
	const failed = deliveryEntries.filter(([_, v]) => {
		const r = v as { skipped_error?: string };
		return r.skipped_error !== undefined;
	});
	let finalStatus: string;
	if (succeeded.length > 0 && failed.length === 0) {
		finalStatus = "PUBLISHED_COMPLETE";
	} else if (succeeded.length > 0 && failed.length > 0) {
		finalStatus = "PUBLISHED_PARTIAL";
	} else {
		finalStatus = "META_DELIVERY_FAILED";
	}

	// Per-step factual statuses. The overall publication is not complete
	// unless every mandatory downstream step succeeded. A Meta success
	// alone does not mask a site-news or promo failure.
	const stepStatuses: Record<string, StepStatus> = {};

	// Meta step status from delivery outcomes.
	if (finalStatus === "PUBLISHED_COMPLETE") {
		stepStatuses.meta = { status: "PUBLISHED" };
	} else if (finalStatus === "PUBLISHED_PARTIAL") {
		const failedKeys = failed.map(([k]) => k).join(", ");
		stepStatuses.meta = { status: "PUBLISHED", detail: `partial: failed ${failedKeys}` };
	} else {
		stepStatuses.meta = { status: "FAILED", error: "all Meta deliveries failed" };
	}

	// Engine-side news auto-publish (ADR-0011): the authorization above
	// covers one winner announcement on the public site's news feed.
	// Internal D1 write only; nothing external is sent.
	// Wrapped so a news failure is recorded as a step failure, not silent.
	let siteNews: unknown;
	try {
		siteNews = await autoPublishWinnerNews(db, {
			publicationKey: draft.publication_key,
			series: "SERIES_2026",
			raceId: draft.source.race_id,
			eventId: draft.source.event_id,
		});
		const outcome = siteNews as { published?: boolean; skipped?: string; slug?: string };
		if (outcome.published) {
			stepStatuses.site_news = { status: "PUBLISHED", detail: outcome.slug };
		} else {
			stepStatuses.site_news = { status: "SKIPPED_WITH_REASON", reason: outcome.skipped ?? "unknown" };
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : "unknown";
		siteNews = { published: false, error: msg };
		stepStatuses.site_news = { status: "EXCEPTION", error: msg };
	}

	// Next-race promo auto-publish (ADR-0013): the same authorization
	// covers one promo for the next not-yet-run event of the same
	// series and distance. Internal D1 write only; skips with a reported
	// reason when there is no upcoming event, never failing the publication.
	let nextRaceNews: unknown;
	try {
		nextRaceNews = await autoPublishNextRacePromo(db, {
			publicationKey: draft.publication_key,
			series: "SERIES_2026",
			raceId: draft.source.race_id,
			eventId: draft.source.event_id,
		});
		const outcome = nextRaceNews as { published?: boolean; skipped?: string; slug?: string };
		if (outcome.published) {
			stepStatuses.next_race_promo = { status: "PUBLISHED", detail: outcome.slug };
		} else {
			stepStatuses.next_race_promo = { status: "SKIPPED_WITH_REASON", reason: outcome.skipped ?? "unknown" };
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : "unknown";
		nextRaceNews = { published: false, error: msg };
		stepStatuses.next_race_promo = { status: "EXCEPTION", error: msg };
	}

	// Overall status: PUBLISHED_COMPLETE only if every mandatory step
	// published. Any FAILED/EXCEPTION downgrades the overall status so a
	// Meta-only success cannot hide a downstream failure.
	const stepValues = Object.values(stepStatuses);
	const hasFailed = stepValues.some((s) => s.status === "FAILED" || s.status === "EXCEPTION");
	const hasSkipped = stepValues.some((s) => s.status === "SKIPPED_WITH_REASON");
	if (hasFailed) {
		finalStatus = "PUBLISHED_PARTIAL";
	} else if (hasSkipped && finalStatus === "PUBLISHED_COMPLETE") {
		// Meta complete but a downstream step skipped with reason: still
		// partial, with the reason visible in step_statuses.
		finalStatus = "PUBLISHED_PARTIAL";
	}

	await db.prepare(`
		UPDATE result_publication_history
		SET status = ?, metadata = json_patch(
			COALESCE(metadata, '{}'),
		 json(?)
		), updated_at = CURRENT_TIMESTAMP
		WHERE publication_key = ?
	`).bind(finalStatus, JSON.stringify({ step_statuses: stepStatuses }), draft.publication_key).run();

	// Audit: publication is a consequential action; record what authorized
	// it so the Activity feed shows what was published, where, and why.
	// The audit status reflects the true overall outcome, not a hardcoded
	// PUBLISHED.
	await db.prepare(`
		INSERT INTO audit_events (audit_id, object_id, action, module, status, details)
		VALUES (?, ?, 'RESULT_PUBLISHED', 'RESULTS', ?, ?)
	`).bind(
		`AUDIT-${crypto.randomUUID()}`,
		draft.publication_key,
		finalStatus,
		JSON.stringify({
			publication_key: draft.publication_key,
			authorized_by: input.authorizedBy,
			destinations: Object.keys(result),
			step_statuses: stepStatuses,
			site_news: siteNews,
			next_race_news: nextRaceNews,
		}),
	).run();

	return {
		ok: finalStatus !== "META_DELIVERY_FAILED",
		publication_key: draft.publication_key,
		status: finalStatus,
		deliveries: result,
		site_news: siteNews,
		next_race_news: nextRaceNews,
		step_statuses: stepStatuses,
	};
}
