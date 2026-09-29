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
import { previewSeries2026ResultPublications } from "./series-2026-results";
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
}

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
	if (existing?.status === "PUBLISHED") {
		return {
			ok: true,
			publication_key: input.publicationKey,
			status: "PUBLISHED",
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
	const preview = await previewSeries2026ResultPublications(
		input.runSignupToken,
		{ raceId },
	);
	const draft = preview.drafts.find(
		(value) => value.publication_key === input.publicationKey,
	);
	if (!draft || !draft.ready_for_editorial_review || !draft.editorial_draft.ready_for_approval) {
		throw new Error("Publication draft is missing or not ready");
	}

	await db.prepare(`
		INSERT INTO result_publication_history (
			publication_key, series, status, race_id, event_id, result_set_id, metadata
		) VALUES (?, 'SERIES_2026', 'APPROVED', ?, ?, ?, ?)
		ON CONFLICT(publication_key) DO UPDATE SET
			status = CASE WHEN status = 'PUBLISHED' THEN status ELSE 'APPROVED' END,
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

	await db.prepare(`
		UPDATE result_publication_history
		SET status = 'PUBLISHED', updated_at = CURRENT_TIMESTAMP
		WHERE publication_key = ?
	`).bind(draft.publication_key).run();

	// Engine-side news auto-publish (ADR-0011): the authorization above
	// covers one winner announcement on the public site's news feed.
	// Internal D1 write only; nothing external is sent.
	const siteNews = await autoPublishWinnerNews(db, {
		publicationKey: draft.publication_key,
		series: "SERIES_2026",
		raceId: draft.source.race_id,
		eventId: draft.source.event_id,
	});

	// Next-race promo auto-publish (ADR-0013): the same authorization
	// covers one promo for the next not-yet-run event of the same
	// series and distance. Internal D1 write only; skips with a reported
	// reason when there is no upcoming event, never failing the publication.
	const nextRaceNews = await autoPublishNextRacePromo(db, {
		publicationKey: draft.publication_key,
		series: "SERIES_2026",
		raceId: draft.source.race_id,
		eventId: draft.source.event_id,
	});

	// Audit: publication is a consequential action; record what authorized
	// it so the Activity feed shows what was published, where, and why.
	await db.prepare(`
		INSERT INTO audit_events (audit_id, object_id, action, module, status, details)
		VALUES (?, ?, 'RESULT_PUBLISHED', 'RESULTS', 'PUBLISHED', ?)
	`).bind(
		`AUDIT-${crypto.randomUUID()}`,
		draft.publication_key,
		JSON.stringify({
			publication_key: draft.publication_key,
			authorized_by: input.authorizedBy,
			destinations: Object.keys(result),
			site_news: siteNews,
			next_race_news: nextRaceNews,
		}),
	).run();

	return {
		ok: true,
		publication_key: draft.publication_key,
		status: "PUBLISHED",
		deliveries: result,
		site_news: siteNews,
		next_race_news: nextRaceNews,
	};
}
