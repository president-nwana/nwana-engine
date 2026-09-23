import { buildDetachedOtsProof } from "./ots-proof";
import { ensurePendingProofAnchor } from "./trust";
import { getDefaultProofProvider, getProofProvider } from "./proof-providers";
import { RunSignupSource } from "./sources/runsignup-source";
import {
        buildDistributionPlan,
        type DistributionAction,
        type DistributionAudience,
        type DistributionCapability,
        type DistributionObject,
        type DistributionRule,
} from "./distribution-planner";
import { applySeries2026PublicationHistory, previewSeries2026ResultPublications } from "./series-2026-results";
import {
	confirmRaceLifecyclePrep,
	getRaceLifecycleView,
	getRaceResultsView,
	syncRaceLifecycleDistance,
	testSeries2026WriteAccess,
} from "./race-lifecycle";
import { getFacebookPageToken, publishFacebookResult, publishInstagramResult, RESULT_DESTINATIONS } from "./meta-result-publisher";
import { buildResultCardSvg, isResultCardDesignReady, RESULT_CARD_DESIGN_BLOCKER } from "./result-card";
import { SEP_12_2026_3K_RESULT_CARD_JPEG_BASE64 } from "./assets/sep-12-2026-3k-result-card";
import {
        getGoogleAdsStatus,
        googleAdsAuthorizationUrl,
        handleGoogleAdsCallback,
} from "./google-ads";
import { buildDesiredState } from "./google-ads-current";
import {
	advanceFundProspect,
	getFundView,
	seedBridgeSprintFund,
} from "./fund";
import {
	advanceSponsorshipAsset,
	generateSponsorshipAsset,
	getSponsorshipAssetsView,
} from "./sponsorship-asset";
import {
	advanceBoardWorkItem,
	advanceInitiative,
	closeBoardMeeting,
	createBoardMeeting,
	getBoardMeetingDetail,
	listBoardMeetings,
	listBoardWorkItems,
	openBoardMeeting,
	recordBoardDecision,
	triageAgenda,
} from "./board";
import {
	createBoardSubmission,
	createInitiative,
	getOperatingCenterOverview,
	isOperatingCenterAuthorized,
	listBoardSubmissions,
	listInitiatives,
	publishSiteNews,
	autoPublishWinnerNews,
	autoPublishNextRacePromo,
	renderOperatingCenterHtml,
	renderRaceResultsHtml,
	getActivityFeed,
	acknowledgeRead,
} from "./operating-center";
import { renderFundsHtml } from "./operating-center-funds";
import { renderMediaHtml } from "./operating-center-media";
import { renderSponsorshipHtml } from "./operating-center-sponsorship";
import { renderActivityHtml } from "./operating-center-activity";
import { renderBoardHtml } from "./operating-center-board";
import { renderUploadsHtml } from "./operating-center-uploads";
import {
	renderSitesHtml,
	renderSocialHtml,
	renderAdsHtml,
	renderSellersHtml,
	renderPartnersHtml,
	renderFundraisingHtml,
	renderGroupsHtml,
	getSitesOverview,
	getSocialOverview,
	getAdsOverview,
	getSellersOverview,
	getPartnersOverview,
	getFundraisingOverview,
	getGroupsOverview,
	getMeetingsOverview,
	renderMeetingsHtml,
	getOperationsOverview,
	renderOperationsHtml,
	buildSitesReport,
	buildSocialReport,
	buildAdsReport,
	buildSellersReport,
	buildPartnersReport,
	buildFundraisingReport,
	buildGroupsReport,
	buildMeetingsReport,
	buildOperationsReport,
} from "./operating-center-screens";
import {
	createMediaPlan,
	composeMediaPlan,
	listMediaPlans,
	getMediaPlan,
	approveMediaPlan,
	addMediaArticle,
	saveArticleBody,
	approveArticle,
	publishArticle,
	distributeArticle,
	listArticleDistributions,
	getMediaOverview,
} from "./media-plan";
import {
	formWeeklyProtocol,
	reconcileProtocolIfDue,
	processProtocol,
	handleUpload,
	listUploads,
	getStagedCsv,
	ensureUpcomingMeeting,
	getBoardCadence,
} from "./board-protocol";

interface Env {
        nwana_engine_db: D1Database;
        RUNSIGNUP_ACCESS_TOKEN: string;
        RUNSIGNUP_API_REG?: string;
        RUNSIGNUP_API_REG_SECRET?: string;
        NWANA_META_TOKEN: string;
	GOOGLE_ADS_CLIENT_ID?: string;
	GOOGLE_ADS_CLIENT_SECRET?: string;
	GOOGLE_ADS_TOKEN_KEY?: string;
	OPERATING_CENTER_ENABLED?: string;
	OPERATING_CENTER_KEY?: string;
	IMAGES: ImagesBinding;
}

interface CreateObjectRequest {
	object_type: string;
	title?: string;
	source?: string;
	source_type?: string;
	source_id?: string;
	status?: string;
	parent_object_id?: string;
        season?: number | null;
        program_family?: string | null;
        commercial_role?: string | null;
	metadata?: unknown;
	content?: unknown;
	created_by?: string;
}

interface CreateVersionRequest {
	content?: unknown;
	title?: string;
	metadata?: unknown;
	version_number?: string;
	created_by?: string;
	reason_for_change?: string;
}

interface CreateRelationshipRequest {
	subject_object_id: string;
	relationship_type: string;
	target_object_id: string;
	metadata?: unknown;
}

interface TimestampJobRow {
	job_id: string;
	trust_id: string;
	object_id: string;
	version_id: string | null;
	hash: string;
	provider: string;
	status: string;
	attempts: number;
}

const OTS_AGGREGATORS = [
	"https://a.pool.opentimestamps.org/digest",
	"https://b.pool.opentimestamps.org/digest",
	"https://a.pool.eternitywall.com/digest",
];

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "content-type",
			"access-control-allow-methods": "GET, POST, OPTIONS",
		},
	});
}

function safeJson(value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
	}

	return JSON.stringify(value);
}

function normalizeObjectType(value: string): string {
	return value
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeRelationshipType(value: string): string {
	return value
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

async function sha256(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);

	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function hexToBytes(hex: string): Uint8Array {
	if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
		throw new Error("Expected a 32-byte SHA-256 hex digest");
	}

	const bytes = new Uint8Array(hex.length / 2);

	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	}

	return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";

	const chunkSize = 0x8000;

	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(
			i,
			Math.min(i + chunkSize, bytes.length),
		);

		binary += String.fromCharCode(...chunk);
	}

	return btoa(binary);
}

async function nextObjectId(
	db: D1Database,
	objectType: string,
): Promise<string> {
	const result = await db
		.prepare(`
			INSERT INTO system_counters (object_type, last_number)
			VALUES (?, 1)
			ON CONFLICT(object_type)
			DO UPDATE SET last_number = last_number + 1
			RETURNING last_number
		`)
		.bind(objectType)
		.first<{ last_number: number }>();

	if (!result) {
		throw new Error("Unable to generate object number");
	}

	return `NWANA-${objectType}-${String(result.last_number).padStart(6, "0")}`;
}

function nextMinorVersion(currentVersion: string): string {
	const parts = currentVersion.split(".");

	const major = Number(parts[0] ?? "1");
	const minor = Number(parts[1] ?? "0");

	if (!Number.isInteger(major) || !Number.isInteger(minor)) {
		return "1.1";
	}

	return `${major}.${minor + 1}`;
}

async function objectExists(
	db: D1Database,
	objectId: string,
): Promise<boolean> {
	const result = await db
		.prepare(`
			SELECT object_id
			FROM objects
			WHERE object_id = ?
		`)
		.bind(objectId)
		.first();

	return Boolean(result);
}

function createTimestampJobStatement(
	db: D1Database,
	params: {
		trustId: string;
		objectId: string;
		versionId: string;
		hash: string;
	},
) {
	const jobId = `NWANA-TS-${crypto.randomUUID()}`;

	return {
		jobId,
		statement: db
			.prepare(`
				INSERT INTO timestamp_jobs (
					job_id,
					trust_id,
					object_id,
					version_id,
					hash,
					provider,
					status
				)
				VALUES (?, ?, ?, ?, ?, 'opentimestamps-bitcoin', 'pending')
			`)
			.bind(
				jobId,
				params.trustId,
				params.objectId,
				params.versionId,
				params.hash,
			),
	};
}


function createGenericProofJobStatement(
        db: D1Database,
        params: {
                timestampJobId: string;
                objectId: string;
                versionId: string;
        },
) {
        const jobId =
                `JOB-${crypto.randomUUID()}`;

        return {
                jobId,
                statement: db
                        .prepare(`
                                INSERT INTO jobs (
                                        job_id,
                                        job_type,
                                        module,
                                        object_id,
                                        version_id,
                                        status,
                                        priority,
                                        payload,
                                        next_run_at
                                )
                                VALUES (
                                        ?,
                                        'PROOF_PROCESS',
                                        'proof',
                                        ?,
                                        ?,
                                        'pending',
                                        100,
                                        ?,
                                        CURRENT_TIMESTAMP
                                )
                        `)
                        .bind(
                                jobId,
                                params.objectId,
                                params.versionId,
                                JSON.stringify({
                                        timestamp_job_id:
                                                params.timestampJobId,
                                }),
                        ),
        };
}
async function submitHashToOpenTimestamps(
	hash: string,
): Promise<{
		ok: boolean;
		calendar?: string;
		proofBase64?: string;
                calendarResponseBytes?: Uint8Array;
		attempts: Array<{
			url: string;
			ok: boolean;
			status?: number;
			error?: string;
		}>;
	}> {
	const digestBytes = hexToBytes(hash);

	const attempts: Array<{
		url: string;
		ok: boolean;
		status?: number;
		error?: string;
	}> = [];

	for (const url of OTS_AGGREGATORS) {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/octet-stream",
					accept: "application/vnd.opentimestamps.v1",
				},
				body: digestBytes,
			});

			if (!response.ok) {
				attempts.push({
					url,
					ok: false,
					status: response.status,
				});

				continue;
			}

			const buffer = await response.arrayBuffer();
			const proofBytes = new Uint8Array(buffer);

			if (proofBytes.length === 0) {
				attempts.push({
					url,
					ok: false,
					status: response.status,
					error: "Empty calendar response",
				});

				continue;
			}

			attempts.push({
				url,
				ok: true,
				status: response.status,
			});

			return {
				ok: true,
				calendar: url,
				proofBase64: bytesToBase64(proofBytes),
                                calendarResponseBytes: proofBytes,
				attempts,
			};
		} catch (error) {
			attempts.push({
				url,
				ok: false,
				error:
					error instanceof Error
						? error.message
						: "Unknown network error",
			});
		}
	}

	return {
		ok: false,
		attempts,
	};
}

async function processTimestampJob(
	jobId: string,
	env: Env,
): Promise<Response> {
	const db = env.nwana_engine_db;

	const job = await db
		.prepare(`
			SELECT
				job_id,
				trust_id,
				object_id,
				version_id,
				hash,
				provider,
				status,
				attempts
			FROM timestamp_jobs
			WHERE job_id = ?
		`)
		.bind(jobId)
		.first<TimestampJobRow>();

	if (!job) {
		return json(
			{
				ok: false,
				error: "Timestamp job not found",
			},
			404,
		);
	}

	if (
		job.status === "submitted" ||
		job.status === "anchored" ||
		job.status === "confirmed"
	) {
		return json({
			ok: true,
			job_id: job.job_id,
			status: job.status,
			message: "Timestamp job has already been submitted",
		});
	}

	const now = new Date().toISOString();

	await db
		.prepare(`
			UPDATE timestamp_jobs
			SET
				status = 'processing',
				attempts = attempts + 1,
				requested_at = ?,
				updated_at = CURRENT_TIMESTAMP
			WHERE job_id = ?
		`)
		.bind(now, job.job_id)
		.run();
        const proofProvider = getDefaultProofProvider();

        let providerResult;

        try {
                providerResult = await proofProvider.createProof({
                        subject: {
                                subjectId: job.object_id,
                                versionId: job.version_id,
                                hash: job.hash,
                        },
                });
        } catch (error) {
                const errorText =
                        error instanceof Error
                                ? error.message
                                : "Unknown proof provider error";

                await db.batch([
                        db
                                .prepare(`
                                        UPDATE timestamp_jobs
                                        SET
                                                status = 'failed',
                                                last_error = ?,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                `)
                                .bind(errorText, job.job_id),

                        db
                                .prepare(`
                                        INSERT INTO audit_events (
                                                audit_id,
                                                object_id,
                                                action,
                                                module,
                                                status,
                                                details
                                        )
                                        VALUES (?, ?, 'timestamp_submission_failed', 'trust', 'failed', ?)
                                `)
                                .bind(
                                        `NWANA-AUDIT-${crypto.randomUUID()}`,
                                        job.object_id,
                                        JSON.stringify({
                                                job_id: job.job_id,
                                                provider: proofProvider.id,
                                                error: errorText,
                                        }),
                                ),
                ]);

                return json(
                        {
                                ok: false,
                                job_id: job.job_id,
                                status: "failed",
                                provider: proofProvider.id,
                                error: errorText,
                        },
                        502,
                );
        }

        const providerMetadata =
                providerResult.providerMetadata ?? {};

        const calendar =
                typeof providerMetadata.calendar === "string"
                        ? providerMetadata.calendar
                        : null;

        const proofSize =
                typeof providerMetadata.proofSize === "number"
                        ? providerMetadata.proofSize
                        : null;

        const hasBitcoinAttestation =
                providerMetadata.hasBitcoinAttestation === true;

        const proofPayload = JSON.stringify({
                format: providerResult.proofType,
                encoding: "base64",
                hash_algorithm: "SHA-256",
                hash: job.hash,
                provider: providerResult.provider,
                network: providerResult.network ?? null,
                calendar,
                proof_base64: providerResult.proofPayload ?? null,
                proof_bytes: proofSize,
                bitcoin_attestation: hasBitcoinAttestation,
                submitted_at: now,
                provider_metadata: providerMetadata,
        });


	await ensurePendingProofAnchor(db, {
                trustId: job.trust_id,
                jobId: job.job_id,
                objectId: job.object_id,
                versionId: job.version_id,
                provider: providerResult.provider,
                network: providerResult.network ?? null,
                anchorType: "timestamp-anchor",
                proofData: proofPayload,
                providerMetadata,
        });
	await db.batch([
		db
			.prepare(`
				UPDATE timestamp_jobs
				SET
					status = 'submitted',
					last_error = NULL,
					completed_at = ?,
					updated_at = CURRENT_TIMESTAMP
				WHERE job_id = ?
			`)
			.bind(now, job.job_id),

		db
			.prepare(`
				UPDATE trust_records
				SET
					timestamp_request = ?,
					proof_location = 'd1:inline',
					verification_status = 'pending',
					updated_at = CURRENT_TIMESTAMP
				WHERE trust_id = ?
			`)
			.bind(
				proofPayload,
				job.trust_id,
			),

		db
			.prepare(`
				INSERT INTO audit_events (
					audit_id,
					object_id,
					action,
					module,
					status,
					details
				)
				VALUES (?, ?, 'timestamp_submitted', 'trust', 'success', ?)
			`)
			.bind(
				`NWANA-AUDIT-${crypto.randomUUID()}`,
				job.object_id,
				JSON.stringify({
					job_id: job.job_id,
					trust_id: job.trust_id,
					calendar: calendar,
					attempts: providerMetadata.attempts,
					verification_status: "pending",
				}),
			),
	]);

	return json({
		ok: true,
		job_id: job.job_id,
		object_id: job.object_id,
		version_id: job.version_id,
		hash: job.hash,
		status: "submitted",
		trust_status: "pending",
		calendar: calendar,
		message:
			"Hash accepted by OpenTimestamps calendar. Bitcoin anchoring is still pending.",
	});
}

async function upgradeTimestampJob(
        jobId: string,
        env: Env,
): Promise<Response> {
        const db = env.nwana_engine_db;

        const row = await db
                .prepare(`
                        SELECT
                                j.job_id,
                                j.trust_id,
                                j.object_id,
                                j.version_id,
                                j.hash,
                                j.provider,
                                j.status,
                                t.timestamp_request
                        FROM timestamp_jobs j
                        JOIN trust_records t
                                ON t.trust_id = j.trust_id
                        WHERE j.job_id = ?
                        LIMIT 1
                `)
                .bind(jobId)
                .first<{
                        job_id: string;
                        trust_id: string;
                        object_id: string;
                        version_id: string | null;
                        hash: string;
                        provider: string;
                        status: string;
                        timestamp_request: string | null;
                }>();

        if (!row) {
                return json(
                        {
                                ok: false,
                                error: "Timestamp job not found",
                        },
                        404,
                );
        }

        if (!row.timestamp_request) {
                return json(
                        {
                                ok: false,
                                job_id: row.job_id,
                                error: "No OpenTimestamps proof stored for this job",
                        },
                        409,
                );
        }

        let payload: {
                format?: string;
                proof_base64?: string;
                proof_bytes?: number;
                bitcoin_attestation?: boolean;
                [key: string]: unknown;
        };

        try {
                payload = JSON.parse(row.timestamp_request);
        } catch {
                return json(
                        {
                                ok: false,
                                job_id: row.job_id,
                                error: "Stored timestamp proof metadata is invalid JSON",
                        },
                        500,
                );
        }

        if (
                payload.format === "opentimestamps-calendar-response" &&
                typeof payload.response_base64 === "string" &&
                typeof payload.hash === "string"
        ) {
                try {
                        const binary = atob(
                                payload.response_base64,
                        );

                        const calendarBytes =
                                new Uint8Array(
                                        binary.length,
                                );

                        for (
                                let i = 0;
                                i < binary.length;
                                i++
                        ) {
                                calendarBytes[i] =
                                        binary.charCodeAt(i);
                        }

                        const detached =
                                buildDetachedOtsProof(
                                        payload.hash,
                                        calendarBytes,
                                );

                        payload = {
                                ...payload,
                                format:
                                        "opentimestamps-detached-proof",
                                proof_base64:
                                        detached.proofBase64,
                                proof_bytes:
                                        detached.proofSize,
                                bitcoin_attestation:
                                        detached.hasBitcoinAttestation,
                                migrated_from:
                                        "opentimestamps-calendar-response",
                                migrated_at:
                                        new Date().toISOString(),
                        };
                } catch (error) {
                        return json(
                                {
                                        ok: false,
                                        job_id: row.job_id,
                                        error:
                                                error instanceof Error
                                                        ? `Legacy OpenTimestamps migration failed: ${error.message}`
                                                        : "Legacy OpenTimestamps migration failed",
                                },
                                500,
                        );
                }
        }

        if (
                payload.format !== "opentimestamps-detached-proof" ||
                typeof payload.proof_base64 !== "string"
        ) {
                return json(
                        {
                                ok: false,
                                job_id: row.job_id,
                                error: "Stored detached OpenTimestamps proof is missing",
                        },
                        409,
                );
        }

        try {
                const proofProvider =
                        getProofProvider(row.provider);

                if (!proofProvider.upgradeProof) {
                        throw new Error(
                                "Proof provider does not support proof upgrade",
                        );
                }

                const upgraded =
                        await proofProvider.upgradeProof({
                                proofPayload:
                                        payload.proof_base64,
                        });

                const now = new Date().toISOString();

                const anchorStatus =
                        upgraded.status === "anchored"
                                ? "anchored"
                                : "pending";

                const jobStatus =
                        upgraded.status;

                const updatedPayload = JSON.stringify({
                        ...payload,
                        provider:
                                upgraded.provider,
                        network:
                                upgraded.network,
                        proof_base64:
                                upgraded.proofPayload,
                        proof_bytes:
                                Number(
                                        upgraded.providerMetadata
                                                ?.proofSize ?? 0,
                                ),
                        bitcoin_attestation:
                                upgraded.status === "anchored",
                        provider_metadata:
                                upgraded.providerMetadata ?? {},
                        upgraded_at: now,
                });
                await db.batch([
                        db
                                .prepare(`
                                        UPDATE trust_records
                                        SET
                                                timestamp_request = ?,
                                                verification_status = ?,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE trust_id = ?
                                `)
                                .bind(
                                        updatedPayload,
                                        anchorStatus,
                                        row.trust_id,
                                ),

                        db
                                .prepare(`
                                        UPDATE timestamp_jobs
                                        SET
                                                status = ?,
                                                last_error = NULL,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                `)
                                .bind(
                                        jobStatus,
                                        row.job_id,
                                ),

                        db
                                .prepare(`
                                        UPDATE proof_anchors
                                        SET
                                                status = ?,
                                                proof_data = ?,
                                                provider_metadata = ?,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                        AND provider = ?
                                `)
                                .bind(
                                        anchorStatus,
                                        updatedPayload,
                                        JSON.stringify(
                                                upgraded.providerMetadata ?? {},
                                        ),
                                        row.job_id,
                                        proofProvider.id,
                                ),

                        db
                                .prepare(`
                                        INSERT INTO audit_events (
                                                audit_id,
                                                object_id,
                                                action,
                                                module,
                                                status,
                                                details
                                        )
                                        VALUES (
                                                ?,
                                                ?,
                                                'timestamp_upgrade',
                                                'trust',
                                                'success',
                                                ?
                                        )
                                `)
                                .bind(
                                        `NWANA-AUDIT-${crypto.randomUUID()}`,
                                        row.object_id,
                                        JSON.stringify({
                                                job_id: row.job_id,
                                                upgraded:
                                                        Boolean(upgraded.providerMetadata?.upgraded),
                                                bitcoin_attestation:
                                                        upgraded.status === "anchored",
                                                calendars_checked:
                                                        upgraded.providerMetadata?.calendarsChecked ?? [],
                                        }),
                                ),
                ]);

                return json({
                        ok: true,
                        job_id: row.job_id,
                        object_id: row.object_id,
                        status: jobStatus,
                        upgraded: Boolean(upgraded.providerMetadata?.upgraded),
                        bitcoin_attestation:
                                upgraded.status === "anchored",
                        proof_bytes:
                                Number(upgraded.providerMetadata?.proofSize ?? 0),
                        calendars_checked:
                                upgraded.providerMetadata?.calendarsChecked ?? [],
                        message:
                                upgraded.status === "anchored"
                                        ? "Bitcoin attestation found. Cryptographic verification is still required."
                                        : "Proof checked. Bitcoin attestation is still pending.",
                });
        } catch (error) {
                const errorText =
                        error instanceof Error
                                ? `${error.name}: ${error.message}`
                                : String(error);

                return json(
                        {
                                ok: false,
                                job_id: row.job_id,
                                status: row.status,
                                error: errorText,
                        },
                        502,
                );
        }
}
async function verifyTimestampJob(
        jobId: string,
        env: Env,
): Promise<Response> {
        const db = env.nwana_engine_db;

        const row = await db
                .prepare(`
                        SELECT
                                j.job_id,
                                j.trust_id,
                                j.object_id,
                                j.version_id,
                                j.hash,
                                j.provider,
                                j.status,
                                t.timestamp_request
                        FROM timestamp_jobs j
                        JOIN trust_records t
                                ON t.trust_id = j.trust_id
                        WHERE j.job_id = ?
                        LIMIT 1
                `)
                .bind(jobId)
                .first<{
                        job_id: string;
                        trust_id: string;
                        object_id: string;
                        version_id: string | null;
                        hash: string;
                        provider: string;
                        status: string;
                        timestamp_request: string | null;
                }>();

        if (!row) {
                return json(
                        {
                                ok: false,
                                error: "Timestamp job not found",
                        },
                        404,
                );
        }

        if (!row.timestamp_request) {
                return json(
                        {
                                ok: false,
                                job_id: row.job_id,
                                error: "No OpenTimestamps proof stored for this job",
                        },
                        409,
                );
        }

        let payload: {
                format?: string;
                proof_base64?: string;
                bitcoin_attestation?: boolean;
                [key: string]: unknown;
        };

        try {
                payload = JSON.parse(row.timestamp_request);
        } catch {
                return json(
                        {
                                ok: false,
                                job_id: row.job_id,
                                error: "Stored timestamp proof metadata is invalid JSON",
                        },
                        500,
                );
        }

        if (
                payload.format !== "opentimestamps-detached-proof" ||
                typeof payload.proof_base64 !== "string"
        ) {
                return json(
                        {
                                ok: false,
                                job_id: row.job_id,
                                error: "Stored detached OpenTimestamps proof is missing",
                        },
                        409,
                );
        }

        if (payload.bitcoin_attestation !== true) {
                return json(
                        {
                                ok: false,
                                job_id: row.job_id,
                                status: row.status,
                                error: "Bitcoin attestation has not been found yet. Upgrade the proof first.",
                        },
                        409,
                );
        }

        const proofProvider =
                getProofProvider(row.provider);

        try {
                const verified =
                        await proofProvider.verifyProof({
                                proofPayload:
                                        payload.proof_base64,
                                providerMetadata:
                                        typeof payload.provider_metadata === "object" &&
                                        payload.provider_metadata !== null &&
                                        !Array.isArray(payload.provider_metadata)
                                                ? payload.provider_metadata as Record<string, unknown>
                                                : undefined,
                        });

                if (!verified.verified) {
                        throw new Error(
                                "Proof provider did not verify the proof",
                        );
                }

                const providerMetadata =
                        verified.providerMetadata ?? {};

                const blockHeight =
                        Number(providerMetadata.blockHeight ?? 0);

                const blockHash =
                        String(
                                verified.externalAnchorId ??
                                        providerMetadata.blockHash ??
                                        "",
                        );

                const blockTime =
                        Number(providerMetadata.blockTime ?? 0);

                const confirmations =
                        Number(providerMetadata.confirmations ?? 0);

                if (!blockHash || blockHeight <= 0 || blockTime <= 0) {
                        throw new Error(
                                "Verified proof is missing required anchor metadata",
                        );
                }

                const now = verified.verifiedAt;

                const attestationTime =
                        new Date(
                                blockTime * 1000,
                        ).toISOString();

                const updatedPayload = JSON.stringify({
                        ...payload,
                        provider:
                                verified.provider,
                        network:
                                verified.network,
                        bitcoin_verified:
                                verified.verified,
                        block_height:
                                blockHeight,
                        block_hash:
                                blockHash,
                        attestation_time:
                                attestationTime,
                        confirmations:
                                confirmations,
                        provider_metadata:
                                providerMetadata,
                        verified_at:
                                now,
                });
                await db.batch([
                        db
                                .prepare(`
                                        UPDATE trust_records
                                        SET
                                                timestamp_request = ?,
                                                timestamp_verified = 1,
                                                blockchain_anchor = ?,
                                                verification_status = 'verified',
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE trust_id = ?
                                `)
                                .bind(
                                        updatedPayload,
                                        blockHash,
                                        row.trust_id,
                                ),

                        db
                                .prepare(`
                                        UPDATE timestamp_jobs
                                        SET
                                                status = 'confirmed',
                                                last_error = NULL,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                `)
                                .bind(
                                        row.job_id,
                                ),

                        db
                                .prepare(`
                                        UPDATE proof_anchors
                                        SET
                                                status = 'confirmed',
                                                external_anchor_id = ?,
                                                anchored_at = ?,
                                                verified_at = ?,
                                                proof_data = ?,
                                                provider_metadata = ?,
                                                last_error = NULL,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                        AND provider = ?
                                `)
                                .bind(
                                        blockHash,
                                        attestationTime,
                                        now,
                                        updatedPayload,
                                        JSON.stringify(
                                                providerMetadata,
                                        ),
                                        row.job_id,
                                        proofProvider.id,
                                ),

                        db
                                .prepare(`
                                        INSERT INTO audit_events (
                                                audit_id,
                                                object_id,
                                                action,
                                                module,
                                                status,
                                                details
                                        )
                                        VALUES (
                                                ?,
                                                ?,
                                                'bitcoin_verified',
                                                'trust',
                                                'success',
                                                ?
                                        )
                                `)
                                .bind(
                                        `NWANA-AUDIT-${crypto.randomUUID()}`,
                                        row.object_id,
                                        JSON.stringify({
                                                job_id:
                                                        row.job_id,
                                                trust_id:
                                                        row.trust_id,
                                                block_height:
                                                        blockHeight,
                                                block_hash:
                                                        blockHash,
                                                attestation_time:
                                                        attestationTime,
                                                confirmations:
                                                        confirmations,
                                        }),
                                ),
                ]);

                return json({
                        ok: true,
                        job_id: row.job_id,
                        object_id: row.object_id,
                        status: "confirmed",
                        verification_status: "verified",
                        bitcoin_verified: true,
                        block_height:
                                blockHeight,
                        block_hash:
                                blockHash,
                        attestation_time:
                                attestationTime,
                        confirmations:
                                confirmations,
                        verified_at: now,
                        message:
                                "OpenTimestamps proof was cryptographically verified against the Bitcoin blockchain.",
                });
        } catch (error) {
                const errorText =
                        error instanceof Error
                                ? `${error.name}: ${error.message}`
                                : String(error);

                await db
                        .prepare(`
                                UPDATE proof_anchors
                                SET
                                        last_error = ?,
                                        updated_at = CURRENT_TIMESTAMP
                                WHERE job_id = ?
                                AND provider = ?
                        `)
                        .bind(
                                errorText,
                                row.job_id,
                                proofProvider.id,
                        )
                        .run();

                return json(
                        {
                                ok: false,
                                job_id: row.job_id,
                                status: row.status,
                                verification_status: "failed",
                                error: errorText,
                        },
                        502,
                );
        }
}
async function processNextTimestampJob(
        env: Env,
): Promise<Response> {
        const job = await env.nwana_engine_db
                .prepare(`
                        SELECT
                                job_id,
                                status
                        FROM timestamp_jobs
                        WHERE status IN (
                                'pending',
                                'failed',
                                'submitted',
                                'anchored'
                        )
                        ORDER BY
                                CASE status
                                        WHEN 'anchored' THEN 1
                                        WHEN 'submitted' THEN 2
                                        WHEN 'pending' THEN 3
                                        WHEN 'failed' THEN 4
                                        ELSE 5
                                END,
                                id ASC
                        LIMIT 1
                `)
                .first<{
                        job_id: string;
                        status: string;
                }>();

        if (!job) {
                return json({
                        ok: true,
                        status: "idle",
                        message: "No timestamp jobs require processing",
                });
        }

        if (
                job.status === "pending" ||
                job.status === "failed"
        ) {
                return processTimestampJob(
                        job.job_id,
                        env,
                );
        }

        if (job.status === "submitted") {
                return upgradeTimestampJob(
                        job.job_id,
                        env,
                );
        }

        if (job.status === "anchored") {
                return verifyTimestampJob(
                        job.job_id,
                        env,
                );
        }

        return json(
                {
                        ok: false,
                        job_id: job.job_id,
                        status: job.status,
                        error: "Unsupported timestamp job state",
                },
                409,
        );
}


function proofRetryDelayMinutes(attempts: number): number {
        if (attempts <= 1) return 15;
        if (attempts === 2) return 30;
        if (attempts === 3) return 60;
        return 180;
}

async function processProofGenericJob(
        genericJobId: string,
        timestampJobId: string,
        attempts: number,
        env: Env,
): Promise<{
        status: "completed" | "retry" | "failed";
        nextRunAt?: string;
        detail?: unknown;
}> {
        const timestampJob = await env.nwana_engine_db
                .prepare(`
                        SELECT
                                job_id,
                                status
                        FROM timestamp_jobs
                        WHERE job_id = ?
                        LIMIT 1
                `)
                .bind(timestampJobId)
                .first<{
                        job_id: string;
                        status: string;
                }>();

        if (!timestampJob) {
                return {
                        status: "failed",
                        detail: "Proof job target was not found",
                };
        }

        let response: Response;

        if (
                timestampJob.status === "pending" ||
                timestampJob.status === "failed"
        ) {
                response = await processTimestampJob(
                        timestampJobId,
                        env,
                );
        } else if (
                timestampJob.status === "submitted"
        ) {
                response = await upgradeTimestampJob(
                        timestampJobId,
                        env,
                );
        } else if (
                timestampJob.status === "anchored"
        ) {
                response = await verifyTimestampJob(
                        timestampJobId,
                        env,
                );
        } else if (
                timestampJob.status === "confirmed"
        ) {
                return {
                        status: "completed",
                        detail: {
                                timestamp_job_id:
                                        timestampJobId,
                                timestamp_status:
                                        "confirmed",
                        },
                };
        } else {
                return {
                        status: "failed",
                        detail: {
                                timestamp_job_id:
                                        timestampJobId,
                                timestamp_status:
                                        timestampJob.status,
                        },
                };
        }

        let result: {
                ok?: boolean;
                status?: string;
                error?: string;
                [key: string]: unknown;
        };

        try {
                result = await response
                        .clone()
                        .json<typeof result>();
        } catch {
                result = {
                        ok: response.ok,
                        status: timestampJob.status,
                };
        }

        if (
                response.ok &&
                (
                        result.status === "confirmed" ||
                        result.verification_status === "verified"
                )
        ) {
                return {
                        status: "completed",
                        detail: result,
                };
        }

        if (
                response.ok &&
                result.status === "anchored"
        ) {
                return {
                        status: "retry",
                        nextRunAt:
                                new Date(
                                        Date.now() + 60 * 1000,
                                ).toISOString(),
                        detail: result,
                };
        }

        if (
                response.ok &&
                result.status === "submitted"
        ) {
                const delayMinutes =
                        proofRetryDelayMinutes(
                                attempts,
                        );

                return {
                        status: "retry",
                        nextRunAt:
                                new Date(
                                        Date.now() +
                                                delayMinutes *
                                                        60 *
                                                        1000,
                                ).toISOString(),
                        detail: result,
                };
        }

        return {
                status: "retry",
                nextRunAt:
                        new Date(
                                Date.now() +
                                        proofRetryDelayMinutes(
                                                attempts,
                                        ) *
                                                60 *
                                                1000,
                        ).toISOString(),
                detail: result,
        };
}

async function processNextGenericJob(
        env: Env,
): Promise<Response> {
        const db = env.nwana_engine_db;

        const job = await db
                .prepare(`
                        SELECT
                                job_id,
                                job_type,
                                module,
                                payload,
                                attempts,
                                max_attempts
                        FROM jobs
                        WHERE status IN (
                                'pending',
                                'retry'
                        )
                        AND attempts < max_attempts
                        AND (
                                next_run_at IS NULL
                                OR next_run_at <= CURRENT_TIMESTAMP
                        )
                        ORDER BY
                                priority ASC,
                                id ASC
                        LIMIT 1
                `)
                .first<{
                        job_id: string;
                        job_type: string;
                        module: string;
                        payload: string | null;
                        attempts: number;
                        max_attempts: number;
                }>();

        if (!job) {
                return json({
                        ok: true,
                        status: "idle",
                        message:
                                "No due generic jobs",
                });
        }

        const attempts =
                job.attempts + 1;

        await db
                .prepare(`
                        UPDATE jobs
                        SET
                                status = 'running',
                                attempts = ?,
                                updated_at = CURRENT_TIMESTAMP
                        WHERE job_id = ?
                `)
                .bind(
                        attempts,
                        job.job_id,
                )
                .run();

        try {
                let payload: {
                        timestamp_job_id?: string;
                        [key: string]: unknown;
                } = {};

                if (job.payload) {
                        payload =
                                JSON.parse(
                                        job.payload,
                                );
                }

                let outcome: {
                        status:
                                | "completed"
                                | "retry"
                                | "failed";
                        nextRunAt?: string;
                        detail?: unknown;
                };

                if (
                        job.job_type ===
                                "PROOF_PROCESS" &&
                        job.module === "proof"
                ) {
                        if (
                                typeof payload.timestamp_job_id !==
                                "string"
                        ) {
                                outcome = {
                                        status: "failed",
                                        detail:
                                                "PROOF_PROCESS payload is missing timestamp_job_id",
                                };
                        } else {
                                outcome =
                                        await processProofGenericJob(
                                                job.job_id,
                                                payload.timestamp_job_id,
                                                attempts,
                                                env,
                                        );
                        }
                } else {
                        outcome = {
                                status: "failed",
                                detail:
                                        `Unsupported job type: ${job.job_type}`,
                        };
                }

                if (
                        outcome.status === "completed"
                ) {
                        await db
                                .prepare(`
                                        UPDATE jobs
                                        SET
                                                status = 'completed',
                                                next_run_at = NULL,
                                                last_error = NULL,
                                                completed_at = CURRENT_TIMESTAMP,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                `)
                                .bind(job.job_id)
                                .run();
                } else if (
                        outcome.status === "retry"
                ) {
                        await db
                                .prepare(`
                                        UPDATE jobs
                                        SET
                                                status = 'retry',
                                                next_run_at = ?,
                                                last_error = NULL,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                `)
                                .bind(
                                        outcome.nextRunAt ??
                                                new Date(
                                                        Date.now() +
                                                                60 *
                                                                        60 *
                                                                        1000,
                                                ).toISOString(),
                                        job.job_id,
                                )
                                .run();
                } else {
                        await db
                                .prepare(`
                                        UPDATE jobs
                                        SET
                                                status = 'failed',
                                                next_run_at = NULL,
                                                last_error = ?,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                `)
                                .bind(
                                        JSON.stringify(
                                                outcome.detail ??
                                                        "Job failed",
                                        ),
                                        job.job_id,
                                )
                                .run();
                }

                return json({
                        ok:
                                outcome.status !==
                                "failed",
                        job_id: job.job_id,
                        job_type: job.job_type,
                        module: job.module,
                        status: outcome.status,
                        next_run_at:
                                outcome.nextRunAt ??
                                null,
                        detail:
                                outcome.detail ??
                                null,
                });
        } catch (error) {
                const errorText =
                        error instanceof Error
                                ? `${error.name}: ${error.message}`
                                : String(error);

                const exhausted =
                        attempts >=
                        job.max_attempts;

                await db
                        .prepare(`
                                UPDATE jobs
                                SET
                                        status = ?,
                                        next_run_at = ?,
                                        last_error = ?,
                                        updated_at = CURRENT_TIMESTAMP
                                WHERE job_id = ?
                        `)
                        .bind(
                                exhausted
                                        ? "failed"
                                        : "retry",
                                exhausted
                                        ? null
                                        : new Date(
                                                Date.now() +
                                                        proofRetryDelayMinutes(
                                                                attempts,
                                                        ) *
                                                                60 *
                                                                1000,
                                        ).toISOString(),
                                errorText,
                                job.job_id,
                        )
                        .run();

                return json(
                        {
                                ok: false,
                                job_id:
                                        job.job_id,
                                status:
                                        exhausted
                                                ? "failed"
                                                : "retry",
                                error:
                                        errorText,
                        },
                        exhausted
                                ? 500
                                : 202,
                );
        }
}
async function createObject(
	request: Request,
	env: Env,
): Promise<Response> {
	let body: CreateObjectRequest;

	try {
		body = await request.json<CreateObjectRequest>();
	} catch {
		return json(
			{
				ok: false,
				error: "Request body must be valid JSON",
			},
			400,
		);
	}

  return registerObject(body, env);
}

async function ingestSourceObject(
        body: CreateObjectRequest,
        env: Env,
): Promise<Response> {
        const source =
                body.source?.trim() ?? "";

        const sourceType =
                body.source_type?.trim() || "generic";

        const sourceId =
                body.source_id?.trim() ?? "";

        if (!source || !sourceId) {
                return registerObject(body, env);
        }

        const existing =
                await env.nwana_engine_db
                        .prepare(`
                                SELECT
                                        o.object_id,
                                        o.object_type,
                                        o.title,
                                        o.source,
                                        o.source_type,
                                        o.source_id,
                                        o.status,
                                        o.current_version,
                                        o.season,
                                        o.program_family,
                                        o.commercial_role,
                                        o.metadata,
                                        ov.content_snapshot
                                FROM objects o
                                LEFT JOIN object_versions ov
                                        ON ov.object_id = o.object_id
                                        AND ov.version_number = o.current_version
                                WHERE o.source = ?
                                AND o.source_type = ?
                                AND o.source_id = ?
                                LIMIT 1
                        `)
                        .bind(
                                source,
                                sourceType,
                                sourceId,
                        )
                        .first<{
                                object_id: string;
                                object_type: string;
                                title: string | null;
                                source: string | null;
                                source_type: string | null;
                                source_id: string | null;
                                status: string;
                                current_version: string;
                                season: number | null;
                                program_family: string | null;
                                commercial_role: string | null;
                                metadata: string | null;
                                content_snapshot: string | null;
                        }>();

        if (!existing) {
                return registerObject(body, env);
        }

        const incomingObjectType =
                normalizeObjectType(body.object_type);

        if (
                incomingObjectType &&
                existing.object_type !== incomingObjectType
        ) {
                return json(
                        {
                                ok: false,
                                conflict: true,
                                requires_object_type_migration: true,
                                source,
                                source_type: sourceType,
                                source_id: sourceId,
                                object_id: existing.object_id,
                                existing_object_type:
                                        existing.object_type,
                                incoming_object_type:
                                        incomingObjectType,
                                message:
                                        "Existing Registry object has a different semantic object type.",
                        },
                        409,
                );
        }

        const incomingTitle =
                body.title ?? null;

        const incomingStatus =
                body.status ?? "active";

        const incomingSeason =
                body.season === undefined
                        ? existing.season
                        : body.season;

        const incomingProgramFamily =
                body.program_family === undefined
                        ? existing.program_family
                        : body.program_family?.trim() || null;

        const incomingCommercialRole =
                body.commercial_role === undefined
                        ? existing.commercial_role
                        : body.commercial_role?.trim() || null;

        const incomingMetadata =
                safeJson(body.metadata);

        const incomingSnapshot =
                safeJson(
                        body.content ?? {
                                title: incomingTitle,
                                metadata: body.metadata ?? null,
                                season: incomingSeason,
                                program_family: incomingProgramFamily,
                                commercial_role: incomingCommercialRole,
                        },
                );

        const changed =
                existing.title !== incomingTitle ||
                existing.status !== incomingStatus ||
                existing.season !== incomingSeason ||
                existing.program_family !== incomingProgramFamily ||
                existing.commercial_role !== incomingCommercialRole ||
                existing.metadata !== incomingMetadata ||
                existing.content_snapshot !== incomingSnapshot;

        if (!changed) {
                return json({
                        ok: true,
                        created: false,
                        changed: false,
                        object: existing,
                });
        }

        const versionRequest = new Request(
                "http://internal/object-version",
                {
                        method: "POST",
                        headers: {
                                "content-type": "application/json",
                        },
                        body: JSON.stringify({
                                title: incomingTitle,
                                metadata: body.metadata ?? null,
                                content:
                                        body.content ?? {
                                                title: incomingTitle,
                                                metadata: body.metadata ?? null,
                                                season: incomingSeason,
                                                program_family: incomingProgramFamily,
                                                commercial_role: incomingCommercialRole,
                                        },
                                created_by:
                                        body.created_by ??
                                        "NWANA Source Adapter",
                                reason_for_change:
                                        `Source ${source} object ${sourceId} changed`,
                        }),
                },
        );

        const versionResponse =
                await createVersion(
                        existing.object_id,
                        versionRequest,
                        env,
                );

        const versionResult =
                await versionResponse.json() as {
                        version?: {
                                version_number?: string;
                        } | null;
                };

        if (!versionResponse.ok) {
                return versionResponse;
        }

        await env.nwana_engine_db
                .prepare(`
                        UPDATE objects
                        SET
                                status = ?,
                                season = ?,
                                program_family = ?,
                                commercial_role = ?,
                                updated_at = CURRENT_TIMESTAMP
                        WHERE object_id = ?
                `)
                .bind(
                        incomingStatus,
                        incomingSeason,
                        incomingProgramFamily,
                        incomingCommercialRole,
                        existing.object_id,
                )
                .run();

        return json({
                ok: true,
                created: false,
                changed: true,
                object: {
                        object_id: existing.object_id,
                        object_type: existing.object_type,
                        title: incomingTitle,
                        source,
                        source_type: sourceType,
                        source_id: sourceId,
                        status: incomingStatus,
                        season: incomingSeason,
                        program_family: incomingProgramFamily,
                        commercial_role: incomingCommercialRole,
                        current_version:
                                versionResult.version?.version_number ??
                                existing.current_version,
                },
                version:
                        versionResult.version ?? null,
        });
}
function extractRunSignupSeason(
        title: string | null | undefined,
): number | null {
        const match =
                (title ?? "").match(
                        /\b(20\d{2})\b/,
                );

        if (!match) {
                return null;
        }

        const season =
                Number(match[1]);

        return Number.isInteger(season)
                ? season
                : null;
}
function getRunSignupProgramFamily(
        classification: string,
        title: string | null | undefined = null,
        inheritedProgramFamily: string | null = null,
): string | null {
        if (
                inheritedProgramFamily !== null &&
                inheritedProgramFamily.trim().length > 0
        ) {
                return inheritedProgramFamily;
        }

        switch (classification) {
                case "COMPETITION_SERIES_HUB":
                case "COMPETITION_DISTANCE_SERIES":
                        return "OPEN_SERIES";

                case "COMPETITION_PROPERTY":
                        return "COMPETITION_PROGRAM";

                case "COMPETITION_EVENT":
                        return null;

                case "FUNDRAISING_ASSET":
                        return "INSTRUCTOR_GROWTH_FUND";

                case "SPORT_ASSET":
                        return "NWANA_SPORT";

                case "PARTNER_NETWORK":
                        return "PARTNER_NETWORK";

                case "ATHLETE_ASSET":
                        return "ATHLETE_PROPERTY";

                default:
                        return null;
        }
}
function getRunSignupCommercialRole(
        classification: string,
): string | null {
        switch (classification) {
                case "COMPETITION_EVENT":
                        return "PARTICIPATION";

                case "COMPETITION_SERIES_HUB":
                case "COMPETITION_DISTANCE_SERIES":
                case "COMPETITION_PROPERTY":
                case "FUNDRAISING_ASSET":
                case "SPORT_ASSET":
                case "PARTNER_NETWORK":
                case "ATHLETE_ASSET":
                        return "SELLABLE";

                default:
                        return null;
        }
}
interface SemanticProfileRow {
        source: string;
        source_type: string;
        source_id: string;
        object_type: string | null;
        program_family: string | null;
        commercial_role: string | null;
        metadata: string | null;
}

interface ResolvedSemanticMeaning {
        classification: string;
        program_family: string | null;
        commercial_role: string | null;
        semantic_profile_applied: boolean;
}

function explicitSemanticValue(
        value: string | null | undefined,
): string | null {
        const normalized =
                (value ?? "").trim();

        return normalized.length > 0
                ? normalized
                : null;
}

async function getSemanticProfile(
        db: D1Database,
        source: string,
        sourceType: string,
        sourceId: string | null | undefined,
): Promise<SemanticProfileRow | null> {
        if (
                sourceId === null ||
                sourceId === undefined ||
                String(sourceId).trim().length === 0
        ) {
                return null;
        }

        return await db
                .prepare(`
                        SELECT
                                source,
                                source_type,
                                source_id,
                                object_type,
                                program_family,
                                commercial_role,
                                metadata
                        FROM semantic_profiles
                        WHERE source = ?
                          AND source_type = ?
                          AND source_id = ?
                        LIMIT 1
                `)
                .bind(
                        source,
                        sourceType,
                        String(sourceId),
                )
                .first<SemanticProfileRow>();
}

async function resolveRunSignupContainerSemantic(
        db: D1Database,
        source: string,
        sourceType: string,
        sourceId: string | null | undefined,
        title: string | null | undefined,
        events: unknown[],
): Promise<ResolvedSemanticMeaning> {
        const fallbackClassification =
                classifyRunSignupContainer(
                        title,
                        events,
                );

        const profile =
                await getSemanticProfile(
                        db,
                        source,
                        sourceType,
                        sourceId,
                );

        const classification =
                explicitSemanticValue(
                        profile?.object_type,
                ) ??
                fallbackClassification;

        const programFamily =
                explicitSemanticValue(
                        profile?.program_family,
                ) ??
                getRunSignupProgramFamily(
                        classification,
                        title,
                );

        const commercialRole =
                explicitSemanticValue(
                        profile?.commercial_role,
                ) ??
                getRunSignupCommercialRole(
                        classification,
                );

        return {
                classification,
                program_family:
                        programFamily,
                commercial_role:
                        commercialRole,
                semantic_profile_applied:
                        profile !== null,
        };
}

async function resolveRunSignupEventSemantic(
        db: D1Database,
        event: Record<string, unknown>,
        inheritedProgramFamily: string | null,
): Promise<ResolvedSemanticMeaning> {
        const fallbackClassification =
                classifyRunSignupEvent(event);

        const eventId =
                event.event_id;

        const profile =
                await getSemanticProfile(
                        db,
                        "runsignup",
                        "event",
                        eventId === null ||
                        eventId === undefined
                                ? null
                                : String(eventId),
                );

        const classification =
                explicitSemanticValue(
                        profile?.object_type,
                ) ??
                fallbackClassification;

        const title =
                typeof event.name === "string"
                        ? event.name
                        : null;

        const programFamily =
                explicitSemanticValue(
                        profile?.program_family,
                ) ??
                getRunSignupProgramFamily(
                        classification,
                        title,
                        inheritedProgramFamily,
                );

        const commercialRole =
                explicitSemanticValue(
                        profile?.commercial_role,
                ) ??
                getRunSignupCommercialRole(
                        classification,
                );

        return {
                classification,
                program_family:
                        programFamily,
                commercial_role:
                        commercialRole,
                semantic_profile_applied:
                        profile !== null,
        };
}
interface ObjectCapabilitySpec {
        capability_type: string;
        available: boolean;
        configured: boolean;
        read_state: string;
        write_state: string;
        permission_state: string;
        distribution_eligible: boolean;
        source_platform: string | null;
        metadata?: unknown;
}

export function getRunSignupCapabilitySpecs(
        classification: string,
): ObjectCapabilitySpec[] {
        switch (classification) {
                case "COMPETITION_SERIES_HUB":
                        return [
                                {
                                        capability_type: "PUBLIC_WEBSITE",
                                        available: true,
                                        configured: true,
                                        read_state: "available",
                                        write_state: "permission-dependent",
                                        permission_state: "pending",
                                        distribution_eligible: true,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "verified-public-hub",
                                        },
                                },
                                {
                                        capability_type: "REGISTRATION",
                                        available: true,
                                        configured: false,
                                        read_state: "available",
                                        write_state: "permission-dependent",
                                        permission_state: "pending",
                                        distribution_eligible: false,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "platform-capability",
                                                public_visibility:
                                                        "hidden",
                                                operational_use:
                                                        false,
                                        },
                                },
                                {
                                        capability_type: "RESULTS",
                                        available: false,
                                        configured: false,
                                        read_state: "unavailable",
                                        write_state: "unavailable",
                                        permission_state: "not_applicable",
                                        distribution_eligible: false,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "verified-not-results-container",
                                        },
                                },
                                {
                                        capability_type: "SPONSORSHIP",
                                        available: true,
                                        configured: false,
                                        read_state: "unknown",
                                        write_state: "unknown",
                                        permission_state: "unknown",
                                        distribution_eligible: true,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "platform-capability",
                                                configuration_detection:
                                                        "not-yet-connected",
                                        },
                                },
                        ];

                case "COMPETITION_DISTANCE_SERIES":
                case "COMPETITION_PROPERTY":
                        return [
                                {
                                        capability_type: "REGISTRATION",
                                        available: true,
                                        configured: true,
                                        read_state: "available",
                                        write_state: "permission-dependent",
                                        permission_state: "pending",
                                        distribution_eligible: true,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "runsignup-property",
                                        },
                                },
                                {
                                        capability_type: "SPONSORSHIP",
                                        available: true,
                                        configured: true,
                                        read_state: "unknown",
                                        write_state: "unknown",
                                        permission_state: "unknown",
                                        distribution_eligible: true,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "business-capability",
                                                configuration_detection:
                                                        "not-yet-connected",
                                        },
                                },
                        ];

                case "COMPETITION_EVENT":
                        return [
                                {
                                        capability_type: "PARTICIPATION",
                                        available: true,
                                        configured: true,
                                        read_state: "available",
                                        write_state: "permission-dependent",
                                        permission_state: "pending",
                                        distribution_eligible: true,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "runsignup-event",
                                        },
                                },
                                {
                                        capability_type: "RESULTS",
                                        available: true,
                                        configured: true,
                                        read_state: "available",
                                        write_state: "available",
                                        permission_state: "authorized",
                                        distribution_eligible: true,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "existing-nwana-results-flow",
                                        },
                                },
                        ];

                case "FUNDRAISING_ASSET":
                        return [
                                {
                                        capability_type: "FUNDRAISING",
                                        available: true,
                                        configured: true,
                                        read_state: "available",
                                        write_state: "unknown",
                                        permission_state: "unknown",
                                        distribution_eligible: true,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "runsignup-property",
                                        },
                                },
                                {
                                        capability_type: "SPONSORSHIP",
                                        available: true,
                                        configured: true,
                                        read_state: "unknown",
                                        write_state: "unknown",
                                        permission_state: "unknown",
                                        distribution_eligible: true,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "business-capability",
                                                configuration_detection:
                                                        "not-yet-connected",
                                        },
                                },
                        ];

                case "SPORT_ASSET":
                case "PARTNER_NETWORK":
                case "ATHLETE_ASSET":
                        return [
                                {
                                        capability_type: "SPONSORSHIP",
                                        available: true,
                                        configured: true,
                                        read_state: "unknown",
                                        write_state: "unknown",
                                        permission_state: "unknown",
                                        distribution_eligible: true,
                                        source_platform: "runsignup",
                                        metadata: {
                                                evidence:
                                                        "business-capability",
                                                configuration_detection:
                                                        "not-yet-connected",
                                        },
                                },
                        ];

                default:
                        return [];
        }
}

async function upsertObjectCapability(
        db: D1Database,
        objectId: string,
        capability: ObjectCapabilitySpec,
): Promise<void> {
        const capabilityType =
                capability.capability_type
                        .trim()
                        .toUpperCase()
                        .replace(/[^A-Z0-9]+/g, "_")
                        .replace(/^_+|_+$/g, "");

        if (!capabilityType) {
                throw new Error(
                        "Capability type is required",
                );
        }

        const metadataJson =
                safeJson(capability.metadata);

        await db
                .prepare(`
                        INSERT INTO object_capabilities (
                                object_id,
                                capability_type,
                                available,
                                configured,
                                read_state,
                                write_state,
                                permission_state,
                                distribution_eligible,
                                source_platform,
                                metadata
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(object_id, capability_type)
                        DO UPDATE SET
                                available = excluded.available,
                                configured = excluded.configured,
                                read_state = excluded.read_state,
                                write_state = excluded.write_state,
                                permission_state = excluded.permission_state,
                                distribution_eligible =
                                        excluded.distribution_eligible,
                                source_platform =
                                        excluded.source_platform,
				metadata = excluded.metadata,
				updated_at = CURRENT_TIMESTAMP
			WHERE object_capabilities.available IS NOT excluded.available
				OR object_capabilities.configured IS NOT excluded.configured
				OR object_capabilities.read_state IS NOT excluded.read_state
				OR object_capabilities.write_state IS NOT excluded.write_state
				OR object_capabilities.permission_state IS NOT excluded.permission_state
				OR object_capabilities.distribution_eligible IS NOT excluded.distribution_eligible
				OR object_capabilities.source_platform IS NOT excluded.source_platform
				OR object_capabilities.metadata IS NOT excluded.metadata
                `)
                .bind(
                        objectId,
                        capabilityType,
                        capability.available ? 1 : 0,
                        capability.configured ? 1 : 0,
                        capability.read_state,
                        capability.write_state,
                        capability.permission_state,
                        capability.distribution_eligible ? 1 : 0,
                        capability.source_platform,
                        metadataJson,
                )
                .run();
}

async function upsertRunSignupCapabilities(
        db: D1Database,
        objectId: string,
        classification: string,
): Promise<number> {
        const capabilities =
                getRunSignupCapabilitySpecs(
                        classification,
                );

        for (const capability of capabilities) {
                await upsertObjectCapability(
                        db,
                        objectId,
                        capability,
                );
        }

        return capabilities.length;
}
function isRunSignupCompetitionContainer(
        classification: string,
): boolean {
        switch (classification) {
                case "COMPETITION_DISTANCE_SERIES":
                case "COMPETITION_PROPERTY":
                        return true;

                default:
                        return false;
        }
}

function classifyRunSignupContainer(
        title: string | null | undefined,
        events: unknown[],
): string {
        const normalizedTitle =
                (title ?? "").trim().toLowerCase();

        const season =
                extractRunSignupSeason(title);

        const hasCompetitionEvents =
                events.some((event) => {
                        if (
                                !event ||
                                typeof event !== "object"
                        ) {
                                return false;
                        }

                        const value =
                                event as Record<
                                        string,
                                        unknown
                                >;

                        return (
                                typeof value.distance === "string" &&
                                value.distance.trim().length > 0
                        );
                });

        if (
                season !== null &&
                normalizedTitle ===
                        `${season} nwana open nordic walking series`
        ) {
                return "COMPETITION_SERIES_HUB";
        }

        if (
                normalizedTitle.includes(
                        "instructor growth fund",
                )
        ) {
                return "FUNDRAISING_ASSET";
        }

        if (
                normalizedTitle.includes(
                        "nordic walking sport",
                )
        ) {
                return "SPORT_ASSET";
        }

        if (
                normalizedTitle.includes(
                        "partner network",
                )
        ) {
                return "PARTNER_NETWORK";
        }

        if (
                normalizedTitle.includes(
                        "| nordic walking",
                )
        ) {
                return "ATHLETE_ASSET";
        }

        if (
                hasCompetitionEvents &&
                season !== null &&
                normalizedTitle.startsWith(
                        `${season} nwana open `,
                ) &&
                normalizedTitle.endsWith(
                        " nordic walking series",
                )
        ) {
                return "COMPETITION_DISTANCE_SERIES";
        }

        if (hasCompetitionEvents) {
                return "COMPETITION_PROPERTY";
        }

        return "GENERIC_CONTAINER";
}
function classifyRunSignupEvent(
        event: Record<string, unknown>,
): string {
        if (
                typeof event.distance === "string" &&
                event.distance.trim().length > 0
        ) {
                return "COMPETITION_EVENT";
        }

        return "GENERIC_EVENT";
}
async function discoverRunSignup(
        env: Env,
): Promise<Response> {
        const source = new RunSignupSource({
                accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
                apiCallerToken: env.RUNSIGNUP_API_REG,
                apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
        });

        const discovery =
                await source.fetchChanges(null);

        const candidates =
                await Promise.all(
                        discovery.items.map(async (item) => {
                                const raw =
                                        item.raw &&
                                        typeof item.raw === "object"
                                                ? item.raw as Record<string, unknown>
                                                : {};

                                const events =
                                        Array.isArray(raw.events)
                                                ? raw.events
                                                : [];

                                const semantic =
                                        await resolveRunSignupContainerSemantic(
                                                env.nwana_engine_db,
                                                item.source,
                                                item.sourceType,
                                                item.sourceId,
                                                item.title,
                                                events,
                                        );

                                return {
                                        item,
                                        events,
                                        classification:
                                                semantic.classification,
                                        program_family:
                                                semantic.program_family,
                                        commercial_role:
                                                semantic.commercial_role,
                                        semantic_profile_applied:
                                                semantic.semantic_profile_applied,
                                        season:
                                                extractRunSignupSeason(
                                                        item.title,
                                                ),
                                };
                        }),
                );

        const seriesHubsBySeason =
                new Map<
                        number,
                        (typeof candidates)[number]
                >();

        for (const candidate of candidates) {
                if (
                        candidate.classification ===
                                "COMPETITION_SERIES_HUB" &&
                        candidate.season !== null
                ) {
                        seriesHubsBySeason.set(
                                candidate.season,
                                candidate,
                        );
                }
        }

        const distanceSeriesBySeason =
                new Map<
                        number,
                        Array<(typeof candidates)[number]>
                >();

        for (const candidate of candidates) {
                if (
                        candidate.classification !==
                                "COMPETITION_DISTANCE_SERIES" ||
                        candidate.season === null
                ) {
                        continue;
                }

                const existing =
                        distanceSeriesBySeason.get(
                                candidate.season,
                        ) ?? [];

                existing.push(candidate);

                distanceSeriesBySeason.set(
                        candidate.season,
                        existing,
                );
        }

        const containers =
                candidates.map((candidate) => {
                        const {
                                item,
                                events,
                                classification,
                                season,
                        } = candidate;

                        const relationships: Array<
                                Record<string, unknown>
                        > = [];

                        if (
                                classification ===
                                        "COMPETITION_SERIES_HUB" &&
                                season !== null
                        ) {
                                const children =
                                        distanceSeriesBySeason.get(
                                                season,
                                        ) ?? [];

                                for (const child of children) {
                                        relationships.push({
                                                relationship:
                                                        "CONTAINS_DISTANCE_SERIES",
                                                target_source:
                                                        child.item.source,
                                                target_source_type:
                                                        child.item.sourceType,
                                                target_source_id:
                                                        child.item.sourceId,
                                                target_classification:
                                                        child.classification,
                                                season,
                                        });
                                }
                        }

                        if (
                                classification ===
                                        "COMPETITION_DISTANCE_SERIES" &&
                                season !== null
                        ) {
                                const seriesHub =
                                        seriesHubsBySeason.get(
                                                season,
                                        );

                                if (seriesHub) {
                                        relationships.push({
                                                relationship:
                                                        "BELONGS_TO_SERIES_HUB",
                                                target_source:
                                                        seriesHub.item.source,
                                                target_source_type:
                                                        seriesHub.item.sourceType,
                                                target_source_id:
                                                        seriesHub.item.sourceId,
                                                target_classification:
                                                        seriesHub.classification,
                                                season,
                                        });
                                }

                                for (const event of events) {
                                        if (
                                                !event ||
                                                typeof event !== "object"
                                        ) {
                                                continue;
                                        }

                                        const eventValue =
                                                event as Record<
                                                        string,
                                                        unknown
                                                >;

                                        if (
                                                classifyRunSignupEvent(
                                                        eventValue,
                                                ) !==
                                                "COMPETITION_EVENT"
                                        ) {
                                                continue;
                                        }

                                        relationships.push({
                                                relationship:
                                                        "CONTAINS_COMPETITION_EVENT",
                                                target_source:
                                                        "runsignup",
                                                target_source_type:
                                                        "event",
                                                target_source_id:
                                                        eventValue.event_id ??
                                                        null,
                                                target_classification:
                                                        "COMPETITION_EVENT",
                                                season,
                                        });
                                }
                        }

                        return {
                                source:
                                        item.source,
                                source_type:
                                        item.sourceType,
                                source_id:
                                        item.sourceId,
                                title:
                                        item.title ?? null,
                                status:
                                        item.status ?? null,
                                last_modified:
                                        item.metadata?.lastModified ??
                                        null,
                                classification,
                                season,
                                relationships,
                                event_count:
                                        events.length,
                                events:
                                        events.map((event) => {
                                                if (
                                                        !event ||
                                                        typeof event !==
                                                                "object"
                                                ) {
                                                        return {
                                                                raw:
                                                                        event,
                                                        };
                                                }

                                                const value =
                                                        event as Record<
                                                                string,
                                                                unknown
                                                        >;

                                                const eventClassification =
                                                        classifyRunSignupEvent(
                                                                value,
                                                        );

                                                return {
                                                        classification:
                                                                eventClassification,
                                                        season,
                                                        relationships:
                                                                eventClassification ===
                                                                "COMPETITION_EVENT"
                                                                        ? [
                                                                                {
                                                                                        relationship:
                                                                                                "BELONGS_TO_DISTANCE_SERIES",
                                                                                        target_source:
                                                                                                item.source,
                                                                                        target_source_type:
                                                                                                item.sourceType,
                                                                                        target_source_id:
                                                                                                item.sourceId,
                                                                                        target_classification:
                                                                                                classification,
                                                                                        season,
                                                                                },
                                                                        ]
                                                                        : [],
                                                        event_id:
                                                                value.event_id ??
                                                                null,
                                                        name:
                                                                value.name ??
                                                                null,
                                                        event_type:
                                                                value.event_type ??
                                                                null,
                                                        distance:
                                                                value.distance ??
                                                                null,
                                                        start_time:
                                                                value.start_time ??
                                                                null,
                                                        end_time:
                                                                value.end_time ??
                                                                null,
                                                };
                                        }),
                        };
                });

        return json({
                ok: true,
                source: source.id,
                mode: "discovery",
                writes_to_registry: false,
                season_scoped: true,
                seasons:
                        Array.from(
                                seriesHubsBySeason.keys(),
                        ).sort(),
                container_count:
                        containers.length,
                containers,
                next_cursor:
                        discovery.nextCursor ?? null,
        });
}
async function previewRunSignupEvents(
        env: Env,
): Promise<Response> {
        const source = new RunSignupSource({
                accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
                apiCallerToken: env.RUNSIGNUP_API_REG,
                apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
        });

        const discovery =
                await source.fetchChanges(null);

        const events: Array<Record<string, unknown>> = [];

        for (const item of discovery.items) {
                const raw =
                        item.raw &&
                        typeof item.raw === "object"
                                ? item.raw as Record<string, unknown>
                                : {};

                const rawEvents =
                        Array.isArray(raw.events)
                                ? raw.events
                                : [];

                const containerSemantic =
                        await resolveRunSignupContainerSemantic(
                                env.nwana_engine_db,
                                item.source,
                                item.sourceType,
                                item.sourceId,
                                item.title,
                                rawEvents,
                        );

                const containerClassification =
                        containerSemantic.classification;

                if (
                        !isRunSignupCompetitionContainer(
                                containerClassification,
                        )
                ) {
                        continue;
                }

                for (const rawEvent of rawEvents) {
                        if (
                                !rawEvent ||
                                typeof rawEvent !== "object"
                        ) {
                                continue;
                        }

                        const event =
                                rawEvent as Record<string, unknown>;

                        const eventSemantic =
                                await resolveRunSignupEventSemantic(
                                        env.nwana_engine_db,
                                        event,
                                        containerSemantic.program_family,
                                );

                        const classification =
                                eventSemantic.classification;

                        if (
                                classification !==
                                "COMPETITION_EVENT"
                        ) {
                                continue;
                        }

                        events.push({
                                source: "runsignup",
                                source_type: "event",
                                source_id:
                                        event.event_id ?? null,
                                classification,
                                program_family:
                                        eventSemantic.program_family,
                                commercial_role:
                                        eventSemantic.commercial_role,
                                semantic_profile_applied:
                                        eventSemantic.semantic_profile_applied,
                                title:
                                        event.name ?? null,
                                distance:
                                        event.distance ?? null,
                                start_time:
                                        event.start_time ?? null,
                                end_time:
                                        event.end_time ?? null,
                                parent: {
                                        source:
                                                item.source,
                                        source_type:
                                                item.sourceType,
                                        source_id:
                                                item.sourceId,
                                        title:
                                                item.title ?? null,
                                        classification:
                                                containerClassification,
                                        program_family:
                                                containerSemantic.program_family,
                                        commercial_role:
                                                containerSemantic.commercial_role,
                                        semantic_profile_applied:
                                                containerSemantic.semantic_profile_applied,
                                },
                        });
                }
        }

        return json({
                ok: true,
                source: source.id,
                mode: "event-preview",
                writes_to_registry: false,
                writes_events: false,
                writes_relationships: false,
                event_count: events.length,
                events,
        });
}
async function ingestRunSignupEvents(
        env: Env,
): Promise<Response> {
        const source = new RunSignupSource({
                accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
                apiCallerToken: env.RUNSIGNUP_API_REG,
                apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
        });

        const discovery =
                await source.fetchChanges(null);

        const results: Array<Record<string, unknown>> = [];

        let discovered = 0;
        let processed = 0;
        let created = 0;
        let updated = 0;
        let unchanged = 0;
        let skipped = 0;
        let conflicts = 0;
        let failed = 0;

        for (const item of discovery.items) {
                const raw =
                        item.raw &&
                        typeof item.raw === "object"
                                ? item.raw as Record<string, unknown>
                                : {};

                const rawEvents =
                        Array.isArray(raw.events)
                                ? raw.events
                                : [];

                const containerSemantic =
                        await resolveRunSignupContainerSemantic(
                                env.nwana_engine_db,
                                item.source,
                                item.sourceType,
                                item.sourceId,
                                item.title,
                                rawEvents,
                        );

                const containerClassification =
                        containerSemantic.classification;

                if (
                        !isRunSignupCompetitionContainer(
                                containerClassification,
                        )
                ) {
                        continue;
                }

                for (const rawEvent of rawEvents) {
                        discovered += 1;

                        if (
                                !rawEvent ||
                                typeof rawEvent !== "object"
                        ) {
                                skipped += 1;
                                continue;
                        }

                        const event =
                                rawEvent as Record<string, unknown>;

                        const eventSemantic =
                                await resolveRunSignupEventSemantic(
                                        env.nwana_engine_db,
                                        event,
                                        containerSemantic.program_family,
                                );

                        const classification =
                                eventSemantic.classification;

                        if (
                                classification !==
                                "COMPETITION_EVENT"
                        ) {
                                skipped += 1;
                                continue;
                        }

                        const season =
                                extractRunSignupSeason(
                                        item.title,
                                );

                        const parentProgramFamily =
                                containerSemantic.program_family;

                        const programFamily =
                                eventSemantic.program_family;

                        const commercialRole =
                                eventSemantic.commercial_role;

                        const eventId =
                                event.event_id;

                        if (
                                eventId === null ||
                                eventId === undefined
                        ) {
                                skipped += 1;

                                results.push({
                                        classification,
                                        status: "skipped",
                                        reason:
                                                "RunSignup event has no event_id.",
                                });

                                continue;
                        }

                        processed += 1;

                        const response =
                                await ingestSourceObject(
                                        {
                                                object_type:
                                                        classification,
                                                title:
                                                        typeof event.name ===
                                                        "string"
                                                                ? event.name
                                                                : undefined,
                                                source:
                                                        "runsignup",
                                                source_type:
                                                        "event",
                                                source_id:
                                                        String(eventId),
                                                status:
                                                        "active",
                                                parent_object_id:
                                                        undefined,
                                                season,
                                                program_family:
                                                        programFamily,
                                                commercial_role:
                                                        commercialRole,
                                                metadata: {
                                                        classification,
                                                        registry_ingest:
                                                                "runsignup-event-ingest",
                                                        distance:
                                                                event.distance ??
                                                                null,
                                                        start_time:
                                                                event.start_time ??
                                                                null,
                                                        end_time:
                                                                event.end_time ??
                                                                null,
                                                        parent_source:
                                                                item.source,
                                                        parent_source_type:
                                                                item.sourceType,
                                                        parent_source_id:
                                                                item.sourceId,
                                                        parent_title:
                                                                item.title ??
                                                                null,
                                                        parent_classification:
                                                                containerClassification,
                                                },
                                                content: {
                                                        source_content:
                                                                rawEvent,
                                                        season,
                                                        program_family:
                                                                programFamily,
                                                        commercial_role:
                                                                commercialRole,
                                                },
                                                created_by:
                                                        "RunSignup Event Ingest",
                                        },
                                        env,
                                );

                        let result: Record<string, unknown>;

                        try {
                                result =
                                        await response.json() as Record<
                                                string,
                                                unknown
                                        >;
                        } catch {
                                result = {
                                        ok: false,
                                        error:
                                                "Event Registry ingest returned invalid JSON.",
                                };
                        }

                        let capabilitiesUpserted = 0;

                        if (response.ok) {
                                const objectResult =
                                        result.object;

                                if (
                                        objectResult &&
                                        typeof objectResult === "object"
                                ) {
                                        const objectId =
                                                (
                                                        objectResult as Record<
                                                                string,
                                                                unknown
                                                        >
                                                ).object_id;

                                        if (
                                                typeof objectId === "string" &&
                                                objectId.length > 0
                                        ) {
                                                capabilitiesUpserted =
                                                        await upsertRunSignupCapabilities(
                                                                env.nwana_engine_db,
                                                                objectId,
                                                                classification,
                                                        );
                                        }
                                }
                        }

                        if (response.status === 409) {
                                conflicts += 1;
                        } else if (!response.ok) {
                                failed += 1;
                        } else if (result.created === true) {
                                created += 1;
                        } else if (result.changed === true) {
                                updated += 1;
                        } else {
                                unchanged += 1;
                        }

                        results.push({
                                source:
                                        "runsignup",
                                source_type:
                                        "event",
                                source_id:
                                        String(eventId),
                                title:
                                        event.name ?? null,
                                classification,
                                capabilities_upserted:
                                        capabilitiesUpserted,
                                parent_source:
                                        item.source,
                                parent_source_type:
                                        item.sourceType,
                                parent_source_id:
                                        item.sourceId,
                                http_status:
                                        response.status,
                                result,
                        });
                }
        }

        return json({
                ok: failed === 0,
                source: source.id,
                mode: "event-registry-ingest",
                writes_to_registry: true,
                writes_events: true,
                writes_relationships: false,
                discovered,
                processed,
                created,
                updated,
                unchanged,
                skipped,
                conflicts,
                failed,
                results,
        });
}
async function ingestRunSignupDiscovery(
        env: Env,
): Promise<Response> {
        const source = new RunSignupSource({
                accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
                apiCallerToken: env.RUNSIGNUP_API_REG,
                apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
        });

        const discovery =
                await source.fetchChanges(null);

        const results: Array<Record<string, unknown>> = [];

        let processed = 0;
        let created = 0;
        let updated = 0;
        let unchanged = 0;
        let skipped = 0;
        let conflicts = 0;
        let failed = 0;

        for (const item of discovery.items) {
                const raw =
                        item.raw &&
                        typeof item.raw === "object"
                                ? item.raw as Record<string, unknown>
                                : {};

                const events =
                        Array.isArray(raw.events)
                                ? raw.events
                                : [];

                const semantic =
                        await resolveRunSignupContainerSemantic(
                                env.nwana_engine_db,
                                item.source,
                                item.sourceType,
                                item.sourceId,
                                item.title,
                                events,
                        );

                const classification =
                        semantic.classification;

                const season =
                        extractRunSignupSeason(
                                item.title,
                        );

                const programFamily =
                        semantic.program_family;

                const commercialRole =
                        semantic.commercial_role;

                if (
                        classification ===
                        "GENERIC_CONTAINER"
                ) {
                        skipped += 1;

                        results.push({
                                source: item.source,
                                source_type: item.sourceType,
                                source_id: item.sourceId,
                                title: item.title ?? null,
                                classification,
                                status: "skipped",
                                reason:
                                        "Container is not yet semantically classified.",
                        });

                        continue;
                }

                processed += 1;

                const response =
                        await ingestSourceObject(
                                {
                                        object_type:
                                                classification,
                                        title:
                                                item.title ??
                                                undefined,
                                        source:
                                                item.source,
                                        source_type:
                                                item.sourceType,
                                        source_id:
                                                item.sourceId,
                                        status:
                                                item.status ??
                                                "active",
                                        season,
                                        program_family:
                                                programFamily,
                                        commercial_role:
                                                commercialRole,
                                        metadata: {
                                                ...(
                                                        item.metadata ??
                                                        {}
                                                ),
                                                classification,
                                                semantic_profile_applied:
                                                        semantic.semantic_profile_applied,
                                                registry_ingest:
                                                        "runsignup-discovery",
                                        },
                                        content: {
                                                source_content:
                                                        item.raw ??
                                                        item.metadata ??
                                                        null,
                                                season,
                                                program_family:
                                                        programFamily,
                                                commercial_role:
                                                        commercialRole,
                                        },
                                        created_by:
                                                "RunSignup Discovery Ingest",
                                },
                                env,
                        );

                let result: Record<string, unknown>;

                try {
                        result =
                                await response.json() as Record<
                                        string,
                                        unknown
                                >;
                } catch {
                        result = {
                                ok: false,
                                error:
                                        "Registry ingest returned invalid JSON.",
                        };
                }

                let capabilitiesUpserted = 0;

                if (response.ok) {
                        const objectResult =
                                result.object;

                        if (
                                objectResult &&
                                typeof objectResult === "object"
                        ) {
                                const objectId =
                                        (
                                                objectResult as Record<
                                                        string,
                                                        unknown
                                                >
                                        ).object_id;

                                if (
                                        typeof objectId === "string" &&
                                        objectId.length > 0
                                ) {
                                        capabilitiesUpserted =
                                                await upsertRunSignupCapabilities(
                                                        env.nwana_engine_db,
                                                        objectId,
                                                        classification,
                                                );
                                }
                        }
                }

                if (response.status === 409) {
                        conflicts += 1;
                } else if (!response.ok) {
                        failed += 1;
                } else if (result.created === true) {
                        created += 1;
                } else if (result.changed === true) {
                        updated += 1;
                } else {
                        unchanged += 1;
                }

                results.push({
                        source: item.source,
                        source_type: item.sourceType,
                        source_id: item.sourceId,
                        title: item.title ?? null,
                        classification,
                        capabilities_upserted:
                                capabilitiesUpserted,
                        http_status: response.status,
                        result,
                });
        }

        return json({
                ok: failed === 0,
                source: source.id,
                mode: "registry-ingest",
                writes_to_registry: true,
                writes_events: false,
                writes_relationships: false,
                discovered:
                        discovery.items.length,
                processed,
                created,
                updated,
                unchanged,
                skipped,
                conflicts,
                failed,
                results,
                next_cursor:
                        discovery.nextCursor ?? null,
        });
}

async function syncRunSignup(
        env: Env,
): Promise<Response> {
        const source = new RunSignupSource({
                accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
                apiCallerToken: env.RUNSIGNUP_API_REG,
                apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
        });

        const item = await source.fetchRace(209464);

        const raw =
                item.raw &&
                typeof item.raw === "object"
                        ? item.raw as Record<string, unknown>
                        : {};

        const events =
                Array.isArray(raw.events)
                        ? raw.events
                        : [];

        const classification =
                classifyRunSignupContainer(
                        item.title,
                        events,
                );

        const season =
                extractRunSignupSeason(
                        item.title,
                );

        const programFamily =
                getRunSignupProgramFamily(
                        classification,
                );

        const commercialRole =
                getRunSignupCommercialRole(
                        classification,
                );

        const response = await ingestSourceObject(
                {
                        object_type: classification,
                        title: item.title ?? undefined,
                        source: item.source,
                        source_type: item.sourceType,
                        source_id: item.sourceId,
                        status: item.status ?? "active",
                        season,
                        program_family:
                                programFamily,
                        commercial_role:
                                commercialRole,
                        metadata: item.metadata ?? undefined,
                        content: {
                                source_content:
                                        item.raw ??
                                        item.metadata ??
                                        null,
                                season,
                                program_family:
                                        programFamily,
                                commercial_role:
                                        commercialRole,
                        },
                        created_by: "RunSignup Source Adapter",
                },
                env,
        );

        const result = await response.json();

        return json({
                ok: true,
                source: source.id,
                fetched: 1,
                processed: 1,
                results: [result],
        });
}
async function registerObject(
  body: CreateObjectRequest,
  env: Env,
): Promise<Response> {
  if (!body.object_type || typeof body.object_type !== "string") {
		return json(
			{
				ok: false,
				error: "object_type is required",
			},
			400,
		);
	}

	const objectType = normalizeObjectType(body.object_type);

	if (!objectType) {
		return json(
			{
				ok: false,
				error: "Invalid object_type",
			},
			400,
		);
	}

	const db = env.nwana_engine_db;

	const objectId = await nextObjectId(db, objectType);
	const versionNumber = "1.0";
	const versionId = `${objectId}-V${versionNumber}`;

	const auditId = `NWANA-AUDIT-${crypto.randomUUID()}`;
	const trustId = `NWANA-TRUST-${crypto.randomUUID()}`;

	const metadataJson = safeJson(body.metadata);

    const season =
            typeof body.season === "number" &&
            Number.isInteger(body.season)
                    ? body.season
                    : null;

    const programFamily =
            typeof body.program_family === "string"
                    ? body.program_family.trim() || null
                    : null;

    const commercialRole =
            typeof body.commercial_role === "string"
                    ? body.commercial_role.trim() || null
                    : null;

	const contentSnapshot = safeJson(
		body.content ?? {
			title: body.title ?? null,
			metadata: body.metadata ?? null,
                    season,
                    program_family: programFamily,
                    commercial_role: commercialRole,
		},
	);

	const hashInput = JSON.stringify({
		object_id: objectId,
		object_type: objectType,
		version: versionNumber,
		title: body.title ?? null,
		source: body.source ?? "manual",
		source_type: body.source_type ?? "generic",
		source_id: body.source_id ?? null,
		parent_object_id: body.parent_object_id ?? null,
            season,
            program_family: programFamily,
            commercial_role: commercialRole,
		metadata: body.metadata ?? null,
		content: body.content ?? null,
	});

	const hash = await sha256(hashInput);

	const timestampJob = createTimestampJobStatement(db, {
		trustId,
		objectId,
		versionId,
		hash,
	});


	const genericProofJob =

	        createGenericProofJobStatement(

	                db,

	                {

	                        timestampJobId:

	                                timestampJob.jobId,

	                        objectId,

	                        versionId,

	                },

	        );

	await db.batch([
		db
			.prepare(`
				INSERT INTO objects (
					object_id,
					object_type,
					title,
					source,
					source_type,
					source_id,
					status,
					current_version,
					parent_object_id,
                                        season,
                                        program_family,
                                        commercial_role,
                                        metadata
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`)
			.bind(
				objectId,
				objectType,
				body.title ?? null,
				body.source ?? "manual",
				body.source_type ?? "generic",
				body.source_id ?? null,
				body.status ?? "active",
				versionNumber,
				body.parent_object_id ?? null,
                                season,
                                programFamily,
                                commercialRole,
				metadataJson,
			),

		db
			.prepare(`
				INSERT INTO object_versions (
					version_id,
					object_id,
					version_number,
					content_snapshot,
					hash,
					created_by
				)
				VALUES (?, ?, ?, ?, ?, ?)
			`)
			.bind(
				versionId,
				objectId,
				versionNumber,
				contentSnapshot,
				hash,
				body.created_by ?? "NWANA Engine",
			),

		db
			.prepare(`
				INSERT INTO trust_records (
					trust_id,
					object_id,
					version_id,
					hash_algorithm,
					hash,
					verification_status
				)
				VALUES (?, ?, ?, 'SHA-256', ?, 'pending')
			`)
			.bind(
				trustId,
				objectId,
				versionId,
				hash,
			),

		timestampJob.statement,

		genericProofJob.statement,
		db
			.prepare(`
				INSERT INTO audit_events (
					audit_id,
					object_id,
					action,
					module,
					status,
					details
				)
				VALUES (?, ?, 'object_registered', 'registry', 'success', ?)
			`)
			.bind(
				auditId,
				objectId,
				JSON.stringify({
					object_type: objectType,
					version_id: versionId,
					trust_id: trustId,
					timestamp_job_id: timestampJob.jobId,
					source: body.source ?? "manual",
				}),
			),
	]);

	return json(
		{
			ok: true,
                    created: true,
			object: {
				object_id: objectId,
				object_type: objectType,
				title: body.title ?? null,
                                season,
                                program_family: programFamily,
                                commercial_role: commercialRole,
				version: versionNumber,
				version_id: versionId,
				hash_algorithm: "SHA-256",
				hash,
				trust_id: trustId,
				trust_status: "pending",
				timestamp_job_id: timestampJob.jobId,
				timestamp_status: "pending",
			},
		},
		201,
	);
}

async function createVersion(
	objectId: string,
	request: Request,
	env: Env,
): Promise<Response> {
	let body: CreateVersionRequest;

	try {
		body = await request.json<CreateVersionRequest>();
	} catch {
		return json(
			{
				ok: false,
				error: "Request body must be valid JSON",
			},
			400,
		);
	}

	const db = env.nwana_engine_db;

	const object = await db
		.prepare(`
			SELECT *
			FROM objects
			WHERE object_id = ?
		`)
		.bind(objectId)
		.first<{
			object_id: string;
			object_type: string;
			title: string | null;
			current_version: string;
			metadata: string | null;
		}>();

	if (!object) {
		return json(
			{
				ok: false,
				error: "Object not found",
			},
			404,
		);
	}

	const versionNumber =
		body.version_number?.trim() ||
		nextMinorVersion(object.current_version);

	const existingVersion = await db
		.prepare(`
			SELECT version_id
			FROM object_versions
			WHERE object_id = ?
			AND version_number = ?
		`)
		.bind(objectId, versionNumber)
		.first();

	if (existingVersion) {
		return json(
			{
				ok: false,
				error: `Version ${versionNumber} already exists`,
			},
			409,
		);
	}

	const previousVersionId =
		`${objectId}-V${object.current_version}`;

	const versionId =
		`${objectId}-V${versionNumber}`;

	const trustId =
		`NWANA-TRUST-${crypto.randomUUID()}`;

	const auditId =
		`NWANA-AUDIT-${crypto.randomUUID()}`;

	let existingMetadata: unknown = null;

	if (object.metadata) {
		try {
			existingMetadata = JSON.parse(object.metadata);
		} catch {
			existingMetadata = object.metadata;
		}
	}

	const title =
		body.title !== undefined
			? body.title
			: object.title;

	const metadata =
		body.metadata !== undefined
			? body.metadata
			: existingMetadata;

	const contentSnapshot = safeJson(
		body.content ?? {
			title,
			metadata,
		},
	);

	const hashInput = JSON.stringify({
		object_id: objectId,
		object_type: object.object_type,
		version: versionNumber,
		title,
		metadata,
		content: body.content ?? null,
		previous_version_id: previousVersionId,
	});

	const hash = await sha256(hashInput);

	const timestampJob = createTimestampJobStatement(db, {
		trustId,
		objectId,
		versionId,
		hash,
	});


	const genericProofJob =

	        createGenericProofJobStatement(

	                db,

	                {

	                        timestampJobId:

	                                timestampJob.jobId,

	                        objectId,

	                        versionId,

	                },

	        );

	await db.batch([
		db
			.prepare(`
				INSERT INTO object_versions (
					version_id,
					object_id,
					version_number,
					content_snapshot,
					hash,
					created_by,
					previous_version_id,
					reason_for_change
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`)
			.bind(
				versionId,
				objectId,
				versionNumber,
				contentSnapshot,
				hash,
				body.created_by ?? "NWANA Engine",
				previousVersionId,
				body.reason_for_change ?? null,
			),

		db
			.prepare(`
				INSERT INTO trust_records (
					trust_id,
					object_id,
					version_id,
					hash_algorithm,
					hash,
					verification_status
				)
				VALUES (?, ?, ?, 'SHA-256', ?, 'pending')
			`)
			.bind(
				trustId,
				objectId,
				versionId,
				hash,
			),

		timestampJob.statement,

		genericProofJob.statement,
		db
			.prepare(`
				UPDATE objects
				SET
					title = ?,
					metadata = ?,
					current_version = ?,
					updated_at = CURRENT_TIMESTAMP
				WHERE object_id = ?
			`)
			.bind(
				title ?? null,
				safeJson(metadata),
				versionNumber,
				objectId,
			),

		db
			.prepare(`
				INSERT INTO audit_events (
					audit_id,
					object_id,
					action,
					module,
					status,
					details
				)
				VALUES (?, ?, 'version_created', 'version', 'success', ?)
			`)
			.bind(
				auditId,
				objectId,
				JSON.stringify({
					version_id: versionId,
					version_number: versionNumber,
					previous_version_id: previousVersionId,
					trust_id: trustId,
					timestamp_job_id: timestampJob.jobId,
					reason_for_change:
						body.reason_for_change ?? null,
				}),
			),
	]);

	return json(
		{
			ok: true,
			version: {
				object_id: objectId,
				version_id: versionId,
				version_number: versionNumber,
				previous_version_id: previousVersionId,
				hash_algorithm: "SHA-256",
				hash,
				trust_id: trustId,
				trust_status: "pending",
				timestamp_job_id: timestampJob.jobId,
				timestamp_status: "pending",
			},
		},
		201,
	);
}

async function ingestRunSignupRelationships(
        env: Env,
): Promise<Response> {
        const source = new RunSignupSource({
                accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
                apiCallerToken: env.RUNSIGNUP_API_REG,
                apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
        });

        const discovery =
                await source.fetchChanges(null);

        const candidates =
                discovery.items.map((item) => {
                        const raw =
                                item.raw &&
                                typeof item.raw === "object"
                                        ? item.raw as Record<string, unknown>
                                        : {};

                        const events =
                                Array.isArray(raw.events)
                                        ? raw.events
                                        : [];

                        return {
                                item,
                                events,
                                classification:
                                        classifyRunSignupContainer(
                                                item.title,
                                                events,
                                        ),
                                season:
                                        extractRunSignupSeason(
                                                item.title,
                                        ),
                        };
                });

        const hubs =
                candidates.filter(
                        (candidate) =>
                                candidate.classification ===
                                        "COMPETITION_SERIES_HUB" &&
                                candidate.season !== null,
                );

        const hubBySeason =
                new Map<
                        number,
                        (typeof candidates)[number]
                >();

        for (const hub of hubs) {
                hubBySeason.set(
                        hub.season as number,
                        hub,
                );
        }

        const distanceSeries =
                candidates.filter(
                        (candidate) =>
                                candidate.classification ===
                                        "COMPETITION_DISTANCE_SERIES" &&
                                candidate.season !== null,
                );

        const db =
                env.nwana_engine_db;

        const resolveObjectId =
                async (
                        sourceName: string,
                        sourceType: string,
                        sourceId: string,
                ): Promise<string | null> => {
                        const row =
                                await db
                                        .prepare(`
                                                SELECT object_id
                                                FROM objects
                                                WHERE source = ?
                                                AND source_type = ?
                                                AND source_id = ?
                                                LIMIT 1
                                        `)
                                        .bind(
                                                sourceName,
                                                sourceType,
                                                sourceId,
                                        )
                                        .first<{
                                                object_id: string;
                                        }>();

                        return row?.object_id ?? null;
                };

        const relationships: Array<{
                subject_object_id: string;
                relationship_type: string;
                target_object_id: string;
                metadata: Record<string, unknown>;
        }> = [];

        const skippedItems: Array<
                Record<string, unknown>
        > = [];

        const seasonSummaries =
                new Map<
                        number,
                        {
                                hub_source_id: string;
                                distance_series: number;
                                competition_events: number;
                                desired_relationships: number;
                        }
                >();

        for (const distance of distanceSeries) {
                const season =
                        distance.season as number;

                const seriesHub =
                        hubBySeason.get(season);

                if (!seriesHub) {
                        skippedItems.push({
                                source:
                                        distance.item.source,
                                source_type:
                                        distance.item.sourceType,
                                source_id:
                                        distance.item.sourceId,
                                season,
                                reason:
                                        "No competition series hub exists for this season.",
                        });

                        continue;
                }

                const hubObjectId =
                        await resolveObjectId(
                                seriesHub.item.source,
                                seriesHub.item.sourceType,
                                String(
                                        seriesHub.item.sourceId,
                                ),
                        );

                if (!hubObjectId) {
                        skippedItems.push({
                                source:
                                        seriesHub.item.source,
                                source_type:
                                        seriesHub.item.sourceType,
                                source_id:
                                        seriesHub.item.sourceId,
                                season,
                                reason:
                                        "Season series hub is missing from the Object Registry.",
                        });

                        continue;
                }

                const distanceObjectId =
                        await resolveObjectId(
                                distance.item.source,
                                distance.item.sourceType,
                                String(
                                        distance.item.sourceId,
                                ),
                        );

                if (!distanceObjectId) {
                        skippedItems.push({
                                source:
                                        distance.item.source,
                                source_type:
                                        distance.item.sourceType,
                                source_id:
                                        distance.item.sourceId,
                                season,
                                reason:
                                        "Distance series is missing from the Object Registry.",
                        });

                        continue;
                }

                const summary =
                        seasonSummaries.get(
                                season,
                        ) ?? {
                                hub_source_id:
                                        String(
                                                seriesHub.item.sourceId,
                                        ),
                                distance_series: 0,
                                competition_events: 0,
                                desired_relationships: 0,
                        };

                summary.distance_series += 1;

                relationships.push({
                        subject_object_id:
                                hubObjectId,
                        relationship_type:
                                "CONTAINS_DISTANCE_SERIES",
                        target_object_id:
                                distanceObjectId,
                        metadata: {
                                source:
                                        "runsignup",
                                ingest:
                                        "runsignup-relationship-ingest",
                                season,
                        },
                });

                relationships.push({
                        subject_object_id:
                                distanceObjectId,
                        relationship_type:
                                "BELONGS_TO_SERIES_HUB",
                        target_object_id:
                                hubObjectId,
                        metadata: {
                                source:
                                        "runsignup",
                                ingest:
                                        "runsignup-relationship-ingest",
                                season,
                        },
                });

                summary.desired_relationships +=
                        2;

                for (const rawEvent of distance.events) {
                        if (
                                !rawEvent ||
                                typeof rawEvent !==
                                        "object"
                        ) {
                                skippedItems.push({
                                        parent_source_id:
                                                distance.item.sourceId,
                                        season,
                                        reason:
                                                "RunSignup event is not an object.",
                                });

                                continue;
                        }

                        const event =
                                rawEvent as Record<
                                        string,
                                        unknown
                                >;

                        if (
                                classifyRunSignupEvent(
                                        event,
                                ) !==
                                "COMPETITION_EVENT"
                        ) {
                                continue;
                        }

                        const eventId =
                                event.event_id;

                        if (
                                eventId === null ||
                                eventId === undefined
                        ) {
                                skippedItems.push({
                                        parent_source_id:
                                                distance.item.sourceId,
                                        season,
                                        reason:
                                                "Competition event has no event_id.",
                                });

                                continue;
                        }

                        const eventObjectId =
                                await resolveObjectId(
                                        "runsignup",
                                        "event",
                                        String(eventId),
                                );

                        if (!eventObjectId) {
                                skippedItems.push({
                                        source:
                                                "runsignup",
                                        source_type:
                                                "event",
                                        source_id:
                                                String(eventId),
                                        parent_source_id:
                                                distance.item.sourceId,
                                        season,
                                        reason:
                                                "Competition event is missing from the Object Registry.",
                                });

                                continue;
                        }

                        relationships.push({
                                subject_object_id:
                                        distanceObjectId,
                                relationship_type:
                                        "CONTAINS_COMPETITION_EVENT",
                                target_object_id:
                                        eventObjectId,
                                metadata: {
                                        source:
                                                "runsignup",
                                        ingest:
                                                "runsignup-relationship-ingest",
                                        season,
                                },
                        });

                        relationships.push({
                                subject_object_id:
                                        eventObjectId,
                                relationship_type:
                                        "BELONGS_TO_DISTANCE_SERIES",
                                target_object_id:
                                        distanceObjectId,
                                metadata: {
                                        source:
                                                "runsignup",
                                        ingest:
                                                "runsignup-relationship-ingest",
                                        season,
                                },
                        });

                        summary.competition_events +=
                                1;

                        summary.desired_relationships +=
                                2;
                }

                seasonSummaries.set(
                        season,
                        summary,
                );
        }

        let created = 0;
        let unchanged = 0;
        let failed = 0;

        const results: Array<
                Record<string, unknown>
        > = [];

        for (const relationship of relationships) {
                const relationshipRequest =
                        new Request(
                                "http://internal/relationships",
                                {
                                        method:
                                                "POST",
                                        headers: {
                                                "content-type":
                                                        "application/json",
                                        },
                                        body:
                                                JSON.stringify(
                                                        relationship,
                                                ),
                                },
                        );

                const response =
                        await createRelationship(
                                relationshipRequest,
                                env,
                        );

                let result: Record<
                        string,
                        unknown
                >;

                try {
                        result =
                                await response.json() as Record<
                                        string,
                                        unknown
                                >;
                } catch {
                        result = {
                                ok: false,
                                error:
                                        "Relationship creation returned invalid JSON.",
                        };
                }

                if (!response.ok) {
                        failed += 1;

                        results.push({
                                status:
                                        "failed",
                                relationship:
                                        relationship.relationship_type,
                                subject_object_id:
                                        relationship.subject_object_id,
                                target_object_id:
                                        relationship.target_object_id,
                                result,
                        });

                        continue;
                }

                if (result.created === true) {
                        created += 1;
                } else {
                        unchanged += 1;
                }

                results.push({
                        status:
                                result.created === true
                                        ? "created"
                                        : "unchanged",
                        relationship:
                                relationship.relationship_type,
                        subject_object_id:
                                relationship.subject_object_id,
                        target_object_id:
                                relationship.target_object_id,
                });
        }

        return json({
                ok:
                        failed === 0,
                source:
                        source.id,
                mode:
                        "relationship-registry-ingest",
                season_scoped:
                        true,
                seasons:
                        Array.from(
                                seasonSummaries.entries(),
                        )
                                .sort(
                                        ([a], [b]) =>
                                                a - b,
                                )
                                .map(
                                        ([
                                                season,
                                                summary,
                                        ]) => ({
                                                season,
                                                ...summary,
                                        }),
                                ),
                desired_relationships:
                        relationships.length,
                processed:
                        relationships.length,
                created,
                unchanged,
                skipped:
                        skippedItems.length,
                failed,
                skipped_items:
                        skippedItems,
                results,
        });
}
async function createRelationship(
	request: Request,
	env: Env,
): Promise<Response> {
	let body: CreateRelationshipRequest;

	try {
		body =
			await request.json<CreateRelationshipRequest>();
	} catch {
		return json(
			{
				ok: false,
				error: "Request body must be valid JSON",
			},
			400,
		);
	}

	if (
		!body.subject_object_id ||
		!body.relationship_type ||
		!body.target_object_id
	) {
		return json(
			{
				ok: false,
				error:
					"subject_object_id, relationship_type and target_object_id are required",
			},
			400,
		);
	}

	const db = env.nwana_engine_db;

	const subjectExists = await objectExists(
		db,
		body.subject_object_id,
	);

	const targetExists = await objectExists(
		db,
		body.target_object_id,
	);

	if (!subjectExists) {
		return json(
			{
				ok: false,
				error: `Subject object not found: ${body.subject_object_id}`,
			},
			404,
		);
	}

	if (!targetExists) {
		return json(
			{
				ok: false,
				error: `Target object not found: ${body.target_object_id}`,
			},
			404,
		);
	}

	const relationshipType =
		normalizeRelationshipType(
			body.relationship_type,
		);

	if (!relationshipType) {
		return json(
			{
				ok: false,
				error: "Invalid relationship_type",
			},
			400,
		);
	}

	const existingRelationship =
		await db
			.prepare(`
				SELECT
					relationship_id,
					subject_object_id,
					relationship_type,
					target_object_id,
					metadata,
					created_at
				FROM relationships
				WHERE subject_object_id = ?
				AND relationship_type = ?
				AND target_object_id = ?
				LIMIT 1
			`)
			.bind(
				body.subject_object_id,
				relationshipType,
				body.target_object_id,
			)
			.first<{
				relationship_id: string;
				subject_object_id: string;
				relationship_type: string;
				target_object_id: string;
				metadata: string | null;
				created_at: string;
			}>();

	if (existingRelationship) {
		return json({
			ok: true,
			created: false,
			relationship: existingRelationship,
		});
	}
	const relationshipId =
		`NWANA-REL-${crypto.randomUUID()}`;

	const auditId =
		`NWANA-AUDIT-${crypto.randomUUID()}`;

	await db.batch([
		db
			.prepare(`
				INSERT INTO relationships (
					relationship_id,
					subject_object_id,
					relationship_type,
					target_object_id,
					metadata
				)
				VALUES (?, ?, ?, ?, ?)
			`)
			.bind(
				relationshipId,
				body.subject_object_id,
				relationshipType,
				body.target_object_id,
				safeJson(body.metadata),
			),

		db
			.prepare(`
				INSERT INTO audit_events (
					audit_id,
					object_id,
					action,
					module,
					status,
					details
				)
				VALUES (?, ?, 'relationship_created', 'relationships', 'success', ?)
			`)
			.bind(
				auditId,
				body.subject_object_id,
				JSON.stringify({
					relationship_id: relationshipId,
					relationship_type: relationshipType,
					target_object_id:
						body.target_object_id,
				}),
			),
	]);

	return json(
		{
			ok: true,
			created: true,
			relationship: {
				relationship_id: relationshipId,
				subject_object_id:
					body.subject_object_id,
				relationship_type:
					relationshipType,
				target_object_id:
					body.target_object_id,
			},
		},
		201,
	);
}

async function getObject(
	objectId: string,
	env: Env,
): Promise<Response> {
	const db = env.nwana_engine_db;

	const object = await db
		.prepare(`
			SELECT *
			FROM objects
			WHERE object_id = ?
		`)
		.bind(objectId)
		.first();

	if (!object) {
		return json(
			{
				ok: false,
				error: "Object not found",
			},
			404,
		);
	}

	const versions = await db
		.prepare(`
			SELECT *
			FROM object_versions
			WHERE object_id = ?
			ORDER BY id ASC
		`)
		.bind(objectId)
		.all();

	const trust = await db
		.prepare(`
			SELECT *
			FROM trust_records
			WHERE object_id = ?
			ORDER BY id ASC
		`)
		.bind(objectId)
		.all();

	const timestampJobs = await db
		.prepare(`
			SELECT *
			FROM timestamp_jobs
			WHERE object_id = ?
			ORDER BY id ASC
		`)
		.bind(objectId)
		.all();

	const outgoingRelationships = await db
		.prepare(`
			SELECT *
			FROM relationships
			WHERE subject_object_id = ?
			ORDER BY id ASC
		`)
		.bind(objectId)
		.all();

	const incomingRelationships = await db
		.prepare(`
			SELECT *
			FROM relationships
			WHERE target_object_id = ?
			ORDER BY id ASC
		`)
		.bind(objectId)
		.all();

	const audit = await db
		.prepare(`
			SELECT *
			FROM audit_events
			WHERE object_id = ?
			ORDER BY id ASC
		`)
		.bind(objectId)
		.all();

	return json({
		ok: true,
		object,
		versions: versions.results,
		trust: trust.results,
		timestamp_jobs: timestampJobs.results,
		relationships: {
			outgoing:
				outgoingRelationships.results,
			incoming:
				incomingRelationships.results,
		},
		audit: audit.results,
	});
}

async function listRelationships(
	objectId: string,
	env: Env,
): Promise<Response> {
	const exists = await objectExists(
		env.nwana_engine_db,
		objectId,
	);

	if (!exists) {
		return json(
			{
				ok: false,
				error: "Object not found",
			},
			404,
		);
	}

	const outgoing =
		await env.nwana_engine_db
			.prepare(`
				SELECT *
				FROM relationships
				WHERE subject_object_id = ?
				ORDER BY id ASC
			`)
			.bind(objectId)
			.all();

	const incoming =
		await env.nwana_engine_db
			.prepare(`
				SELECT *
				FROM relationships
				WHERE target_object_id = ?
				ORDER BY id ASC
			`)
			.bind(objectId)
			.all();

	return json({
		ok: true,
		object_id: objectId,
		outgoing: outgoing.results,
		incoming: incoming.results,
	});
}


async function getDistributionPlan(
        objectId: string,
        env: Env,
): Promise<Response> {
        const db = env.nwana_engine_db;
        const object = await db
                .prepare(`
                        SELECT object_id, object_type, title, status,
                               program_family, commercial_role
                        FROM objects
                        WHERE object_id = ?
                        LIMIT 1
                `)
                .bind(objectId)
                .first<DistributionObject>();

        if (!object) {
                return json(
                        { ok: false, error: "Object not found", object_id: objectId },
                        404,
                );
        }

        const [capabilities, rules, audiences, actions] = await Promise.all([
                db.prepare(`
                        SELECT capability_type, available, configured,
                               read_state, write_state, permission_state,
                               distribution_eligible, source_platform
                        FROM object_capabilities
                        WHERE object_id = ?
                        ORDER BY capability_type ASC
                `).bind(objectId).all<DistributionCapability>(),
                db.prepare(`
                        SELECT rule_id, name, priority, match_object_type,
                               match_program_family, match_commercial_role,
                               match_capability_type, match_status
                        FROM rules
                        WHERE enabled = 1
                        ORDER BY priority ASC, id ASC
                `).all<DistributionRule>(),
                db.prepare(`
                        SELECT audience_id, rule_id, audience_type, enabled
                        FROM rule_audiences
                        WHERE enabled = 1
                        ORDER BY id ASC
                `).all<DistributionAudience>(),
                db.prepare(`
                        SELECT action_id, rule_id, audience_id, action_type,
                               channel, destination, execution_mode, priority, enabled,
                               metadata
                        FROM rule_actions
                        WHERE enabled = 1
                        ORDER BY priority ASC, id ASC
                `).all<DistributionAction>(),
        ]);

        return json({
                ok: true,
                ...buildDistributionPlan({
                        object,
                        capabilities: capabilities.results,
                        rules: rules.results,
                        audiences: audiences.results,
                        actions: actions.results,
                }),
        });
}


interface ResultPublicationHistoryRow {
	publication_key: string;
}

async function getSeries2026ResultPublicationPreview(
	env: Env,
	distance?: string,
): Promise<Response> {
	const preview = await previewSeries2026ResultPublications(
		env.RUNSIGNUP_ACCESS_TOKEN,
		{ distance, apiCallerToken: env.RUNSIGNUP_API_REG, apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET },
	);
	const history = await env.nwana_engine_db
		.prepare(`
			SELECT publication_key
			FROM result_publication_history
			WHERE series = 'SERIES_2026'
		`)
		.all<ResultPublicationHistoryRow>();
	const historyKeys = new Set(
		history.results.map((row) => row.publication_key),
	);
	const drafts = applySeries2026PublicationHistory(
		preview.drafts,
		historyKeys,
	);

	return json({
		...preview,
		drafts,
		summary: {
			...preview.summary,
			historical_baseline:
				drafts.filter((draft) =>
					draft.publication_status === "LEGACY_BASELINE"
				).length,
			new_ready_for_editorial_review:
				drafts.filter((draft) =>
					draft.publication_required
				).length,
		},
	});
}


async function getSeries2026ResultCard(
	publicationKey: string,
	format: "svg" | "jpeg",
	env: Env,
): Promise<Response> {
	if (!isResultCardDesignReady()) {
		return json({
			ok: false,
			status: "VISUAL_DESIGN_NOT_APPROVED",
			execution_allowed: false,
			error: RESULT_CARD_DESIGN_BLOCKER,
		}, 409);
	}
	if (
		format === "jpeg" &&
		publicationKey === "runsignup:series-2026:210000:1178567:666098"
	) {
		const binary = atob(SEP_12_2026_3K_RESULT_CARD_JPEG_BASE64);
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

		return new Response(bytes, {
			headers: {
				"content-type": "image/jpeg",
				"cache-control": "public, max-age=86400, immutable",
			},
		});
	}
	const raceId = Number(publicationKey.split(":")[2]);
	if (!Number.isInteger(raceId)) {
		return json({ ok: false, error: "Invalid result publication key" }, 400);
	}
	const preview = await previewSeries2026ResultPublications(
		env.RUNSIGNUP_ACCESS_TOKEN,
		{ raceId, apiCallerToken: env.RUNSIGNUP_API_REG, apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET },
	);
	const draft = preview.drafts.find(
		(value) => value.publication_key === publicationKey,
	);
	if (!draft) {
		return json({ ok: false, error: "Result publication draft not found" }, 404);
	}
	if (!draft.ready_for_editorial_review) {
		return json({ ok: false, error: "Results are not finalized" }, 409);
	}
	const winners = draft.content.results
		.filter((row) => row.level_place === "1")
		.map((row) => ({
			athlete: row.athlete,
			gender: row.gender === "M"
				? "Men"
				: row.gender === "F"
					? "Women"
					: row.gender ?? "Division",
			time: row.time,
			performance_level: row.performance_level,
			series_record: row.series_record,
		}));
	let logoUrl: string | undefined;
	if (format === "jpeg") {
		const logoResponse = await fetch(
			"https://d368g9lw5ileu7.cloudfront.net/uploads/generic/genericImage-websiteLogo-281959-1788823407.1047-0.bQN0DV.jpg",
		);
		if (!logoResponse.ok) {
			throw new Error("Official NWANA logo could not be loaded");
		}
		const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
		logoUrl = `data:image/jpeg;base64,${bytesToBase64(logoBytes)}`;
	}
	const svg = buildResultCardSvg({
		publicationKey: draft.publication_key,
		title: draft.editorial_draft.title,
		distance: draft.source.distance,
		winners,
		logoUrl,
	});
	if (format === "svg") {
		return new Response(svg, {
			headers: {
				"content-type": "image/svg+xml; charset=utf-8",
				"cache-control": "public, max-age=3600",
			},
		});
	}
	const svgStream = new Response(svg, {
		headers: { "content-type": "image/svg+xml" },
	}).body;
	if (!svgStream) {
		throw new Error("Result card stream could not be created");
	}
	const output = await env.IMAGES
		.input(svgStream)
		.output({ format: "image/jpeg", quality: 90 });
	return output.response({
		headers: {
			"Cache-Control":
				"public, max-age=3600, stale-while-revalidate=86400",
		},
	});
}

async function establishSeries2026ResultPublicationBaseline(
	env: Env,
	distance?: string,
): Promise<Response> {
	const preview = await previewSeries2026ResultPublications(
		env.RUNSIGNUP_ACCESS_TOKEN,
		{ distance, apiCallerToken: env.RUNSIGNUP_API_REG, apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET },
	);
	const readyDrafts = preview.drafts.filter(
		(draft) => draft.ready_for_editorial_review,
	);
	const statements = readyDrafts.map((draft) =>
		env.nwana_engine_db
			.prepare(`
				INSERT OR IGNORE INTO result_publication_history (
					publication_key,
					series,
					status,
					race_id,
					event_id,
					result_set_id,
					metadata
				)
				VALUES (?, 'SERIES_2026', 'LEGACY_BASELINE', ?, ?, ?, ?)
			`)
			.bind(
				draft.publication_key,
				draft.source.race_id,
				draft.source.event_id,
				draft.source.result_set_id,
				JSON.stringify({
					title: draft.content.title,
					result_count:
						draft.verification.result_count,
					reason:
						"Accepted existing finalized results as the pre-Engine publication baseline.",
				}),
			),
	);
	if (statements.length > 0) {
		await env.nwana_engine_db.batch(statements);
	}
	const baseline = await env.nwana_engine_db
		.prepare(`
			SELECT COUNT(*) AS count
			FROM result_publication_history
			WHERE series = 'SERIES_2026'
			  AND status = 'LEGACY_BASELINE'
		`)
		.first<{ count: number }>();

	return json({
		ok: true,
		mode: "BASELINE_ONLY",
		execution_allowed: false,
		published: 0,
		legacy_baseline_count: baseline?.count ?? 0,
		message:
			"Existing finalized Series 2026 result sets will not be proposed as new publications.",
	});
}


interface ResultDeliveryRow {
	destination: string;
	status: string;
	external_id: string | null;
}

async function getMetaConnectionStatus(env: Env): Promise<Response> {
	if (!env.NWANA_META_TOKEN) {
		return json({ ok: false, connected: false, error: "NWANA_META_TOKEN is not configured" }, 503);
	}
	await Promise.all([
		getFacebookPageToken(
			env.NWANA_META_TOKEN,
			RESULT_DESTINATIONS.facebookNwana.pageId,
		),
		getFacebookPageToken(
			env.NWANA_META_TOKEN,
			RESULT_DESTINATIONS.facebookNordicWalkingSport.pageId,
		),
	]);
	return json({
		ok: true,
		connected: true,
		destinations: [
			{ channel: "FACEBOOK", name: RESULT_DESTINATIONS.facebookNwana.name },
			{ channel: "INSTAGRAM", name: RESULT_DESTINATIONS.instagramNwanaOfficial.name },
			{ channel: "FACEBOOK", name: RESULT_DESTINATIONS.facebookNordicWalkingSport.name },
			{ channel: "INSTAGRAM", name: RESULT_DESTINATIONS.instagramNwSport.name },
		],
		execution_allowed: false,
	});
}

async function saveResultDelivery(
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

async function publishSeries2026Result(
	request: Request,
	env: Env,
): Promise<Response> {
	const body = await request.json() as {
		publication_key?: string;
		confirmation?: string;
		image_url?: string;
	};
	if (body.confirmation !== "PUBLISH") {
		return json({ ok: false, error: "Explicit PUBLISH confirmation is required" }, 400);
	}
	if (!body.publication_key) {
		return json({ ok: false, error: "publication_key is required" }, 400);
	}
	if (!isResultCardDesignReady()) {
		return json({
			ok: false,
			status: "VISUAL_DESIGN_NOT_APPROVED",
			execution_allowed: false,
			error: RESULT_CARD_DESIGN_BLOCKER,
		}, 409);
	}
	let imageUrl: URL;
	try {
		const generatedImageUrl = new URL(
			`/result-publications/card/${encodeURIComponent(body.publication_key)}.jpg`,
			request.url,
		);
		imageUrl = new URL(body.image_url ?? generatedImageUrl.toString());
		if (imageUrl.protocol !== "https:") throw new Error("HTTPS required");
	} catch {
		return json({
			ok: false,
			error: "Publication requires the deployed public HTTPS JPEG card",
		}, 400);
	}
	if (!env.NWANA_META_TOKEN) {
		return json({ ok: false, error: "NWANA_META_TOKEN is not configured" }, 503);
	}

	const existing = await env.nwana_engine_db.prepare(`
		SELECT status FROM result_publication_history
		WHERE publication_key = ? LIMIT 1
	`).bind(body.publication_key).first<{ status: string }>();
	if (existing?.status === "LEGACY_BASELINE") {
		return json({ ok: false, error: "Historical baseline results cannot be published as new" }, 409);
	}
	if (existing?.status === "PUBLISHED") {
		return json({ ok: true, already_published: true, publication_key: body.publication_key });
	}

	const raceId = Number(body.publication_key.split(":")[2]);
	if (!Number.isInteger(raceId)) {
		return json({ ok: false, error: "Invalid result publication key" }, 400);
	}
	const preview = await previewSeries2026ResultPublications(
		env.RUNSIGNUP_ACCESS_TOKEN,
		{ raceId, apiCallerToken: env.RUNSIGNUP_API_REG, apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET },
	);
	const draft = preview.drafts.find((value) => value.publication_key === body.publication_key);
	if (!draft || !draft.ready_for_editorial_review || !draft.editorial_draft.ready_for_approval) {
		return json({ ok: false, error: "Publication draft is missing or not ready" }, 409);
	}

	await env.nwana_engine_db.prepare(`
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
		JSON.stringify({ editorial_draft: draft.editorial_draft, image_url: imageUrl.toString() }),
	).run();

	const deliveryResult = await env.nwana_engine_db.prepare(`
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
			env.NWANA_META_TOKEN,
			destination.pageId,
		);
		const published = await publishFacebookResult({
			pageId: destination.pageId,
			message: draft.editorial_draft.post_text,
			imageUrl: imageUrl.toString(),
			pageToken,
		});
		await saveResultDelivery(
			env.nwana_engine_db,
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
		const published = await publishInstagramResult({
			accountId: destination.accountId,
			caption: draft.editorial_draft.post_text,
			imageUrl: imageUrl.toString(),
			userToken: env.NWANA_META_TOKEN,
		});
		await saveResultDelivery(
			env.nwana_engine_db,
			draft.publication_key,
			destination.ledgerKey,
			published.external_id,
		);
		result[destination.ledgerKey] = published;
	}

	await env.nwana_engine_db.prepare(`
		UPDATE result_publication_history
		SET status = 'PUBLISHED', updated_at = CURRENT_TIMESTAMP
		WHERE publication_key = ?
	`).bind(draft.publication_key).run();

	// Engine-side news auto-publish (ADR-0011): the owner's explicit PUBLISH
	// confirmation above authorizes one winner announcement on the public
	// site's news feed. Internal D1 write only; nothing external is sent.
	const siteNews = await autoPublishWinnerNews(env.nwana_engine_db, {
		publicationKey: draft.publication_key,
		series: "SERIES_2026",
		raceId: draft.source.race_id,
		eventId: draft.source.event_id,
	});

	// Next-race promo auto-publish (ADR-0013): the same PUBLISH confirmation
	// authorizes one promo for the next not-yet-run event of the same
	// series and distance, closing the publication -> next event loop.
	// Internal D1 write only; skips with a reported reason when there is
	// no upcoming event, never failing the publication.
	const nextRaceNews = await autoPublishNextRacePromo(env.nwana_engine_db, {
		publicationKey: draft.publication_key,
		series: "SERIES_2026",
		raceId: draft.source.race_id,
		eventId: draft.source.event_id,
	});

	return json({
		ok: true,
		publication_key: draft.publication_key,
		status: "PUBLISHED",
		deliveries: result,
		site_news: siteNews,
		next_race_news: nextRaceNews,
	});
}

export default {
	async fetch(
		request: Request,
		env: Env,
	): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"access-control-allow-origin": "*",
					"access-control-allow-headers":
						"content-type",
					"access-control-allow-methods":
						"GET, POST, OPTIONS",
				},
			});
		}

		const url = new URL(request.url);
		const operatingCenterRoute =
			url.pathname === "/operating-center" ||
			url.pathname.startsWith("/operating-center/") ||
			url.pathname.startsWith("/api/operating-center/") ||
			url.pathname === "/api/initiatives" ||
			url.pathname === "/api/initiatives/advance" ||
			url.pathname.startsWith("/api/board/");

		if (operatingCenterRoute && env.OPERATING_CENTER_ENABLED !== "true") {
			return json({
				ok: false,
				error: "Operating center is not enabled",
			}, 503);
		}

		const operatingCenterApiRoute =
			operatingCenterRoute &&
			!(
				request.method === "GET" &&
				(url.pathname === "/operating-center" ||
					url.pathname === "/operating-center/results" ||
					url.pathname === "/operating-center/funds" ||
					url.pathname === "/operating-center/media" ||
					url.pathname === "/operating-center/board" ||
					url.pathname === "/operating-center/uploads" ||
					url.pathname === "/operating-center/sponsorship" ||
					url.pathname === "/operating-center/activity" ||
					url.pathname === "/operating-center/sites" ||
					url.pathname === "/operating-center/social" ||
					url.pathname === "/operating-center/ads" ||
					url.pathname === "/operating-center/sellers" ||
					url.pathname === "/operating-center/partners" ||
					url.pathname === "/operating-center/fundraising" ||
					url.pathname === "/operating-center/groups" ||
					url.pathname === "/operating-center/meetings")
			);

		if (operatingCenterApiRoute && !isOperatingCenterAuthorized(request, env.OPERATING_CENTER_KEY)) {
			return json({
				ok: false,
				error: "Operating center access requires the owner key",
			}, 401);
		}

		if (request.method === "GET" && url.pathname === "/operating-center") {
			return new Response(renderOperatingCenterHtml(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		if (request.method === "GET" && url.pathname === "/operating-center/results") {
			return new Response(renderRaceResultsHtml(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		// ADR-0022: Funds live on their own page, like race results.
		if (request.method === "GET" && url.pathname === "/operating-center/funds") {
			return new Response(renderFundsHtml(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		// ADR-0021: the media plan workspace lives on its own page.
		if (request.method === "GET" && url.pathname === "/operating-center/media") {
			return new Response(renderMediaHtml(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		// Board workspace: intake, meetings, work items (full workspace; the
		// overview shows only a compact summary).
		if (request.method === "GET" && url.pathname === "/operating-center/board") {
			return new Response(renderBoardHtml(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		// Board uploads: upload form and routed uploads list (full workspace;
		// the overview shows only a compact summary).
		if (request.method === "GET" && url.pathname === "/operating-center/uploads") {
			return new Response(renderUploadsHtml(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		// ADR-0026: sponsorship assets live on their own page (the overview
		// shows only a compact summary card).
		if (request.method === "GET" && url.pathname === "/operating-center/sponsorship") {
			return new Response(renderSponsorshipHtml(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		// ADR-0026: the activity feed lives on its own page (the overview
		// shows only a compact summary card).
		if (request.method === "GET" && url.pathname === "/operating-center/activity") {
			return new Response(renderActivityHtml(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		// ADR-0027: seven new screens, each with a downloadable report.
		const htmlPage = (render: () => string) =>
			new Response(render(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		if (request.method === "GET" && url.pathname === "/operating-center/sites") return htmlPage(renderSitesHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/social") return htmlPage(renderSocialHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/ads") return htmlPage(renderAdsHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/sellers") return htmlPage(renderSellersHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/partners") return htmlPage(renderPartnersHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/fundraising") return htmlPage(renderFundraisingHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/groups") return htmlPage(renderGroupsHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/meetings") return htmlPage(renderMeetingsHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/operations") return htmlPage(renderOperationsHtml);

		// ADR-0027: overview APIs for the seven new screens.
		// ADR-0028: meetings overview.
		if (request.method === "GET" && url.pathname === "/api/operating-center/sites/overview") {
			return json(getSitesOverview());
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/social/overview") {
			return json(getSocialOverview());
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/ads/overview") {
			return json(await getAdsOverview(env));
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/sellers/overview") {
			return json(getSellersOverview());
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/partners/overview") {
			return json(getPartnersOverview());
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/fundraising/overview") {
			return json(await getFundraisingOverview(env.nwana_engine_db));
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/groups/overview") {
			return json(getGroupsOverview());
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/meetings/overview") {
			return json(await getMeetingsOverview(env.nwana_engine_db));
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/operations/overview") {
			return json(await getOperationsOverview(env));
		}

		// ADR-0027: downloadable external-ready reports. Owner-key protected
		// like every other /api/operating-center route; the content itself is
		// external-safe (no keys, no internal notes, no email addresses).
		// ADR-0028: meetings report joins the same pattern.
		const reportFile = (html: string, screen: string, date: string) =>
			new Response(html, {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"content-disposition": `attachment; filename="nwana-${screen}-report-${date}.html"`,
					"cache-control": "no-store",
				},
			});
		{
			const m = url.pathname.match(/^\/api\/operating-center\/report\/(sites|social|ads|sellers|partners|fundraising|groups|meetings|operations)$/);
			if (m && request.method === "GET") {
				const screen = m[1];
				if (screen === "sites") {
					const data = getSitesOverview();
					return reportFile(buildSitesReport(data), screen, data.generated_at.slice(0, 10));
				}
				if (screen === "social") {
					const data = getSocialOverview();
					return reportFile(buildSocialReport(data), screen, data.generated_at.slice(0, 10));
				}
				if (screen === "ads") {
					const data = await getAdsOverview(env);
					return reportFile(buildAdsReport(data), screen, data.generated_at.slice(0, 10));
				}
				if (screen === "sellers") {
					const data = getSellersOverview();
					return reportFile(buildSellersReport(data), screen, data.generated_at.slice(0, 10));
				}
				if (screen === "partners") {
					const data = getPartnersOverview();
					return reportFile(buildPartnersReport(data), screen, data.generated_at.slice(0, 10));
				}
				if (screen === "fundraising") {
					const data = await getFundraisingOverview(env.nwana_engine_db);
					return reportFile(buildFundraisingReport(data), screen, data.generated_at.slice(0, 10));
				}
				if (screen === "meetings") {
					const data = await getMeetingsOverview(env.nwana_engine_db);
					return reportFile(buildMeetingsReport(data), screen, data.generated_at.slice(0, 10));
				}
				if (screen === "operations") {
					const data = await getOperationsOverview(env);
					return reportFile(buildOperationsReport(data), screen, data.generated_at.slice(0, 10));
				}
				const data = getGroupsOverview();
				return reportFile(buildGroupsReport(data), screen, data.generated_at.slice(0, 10));
			}
		}

		// ADR-0021: media plan API.
		if (url.pathname === "/api/operating-center/media/overview" && request.method === "GET") {
			return getMediaOverview(env.nwana_engine_db);
		}
		if (url.pathname === "/api/operating-center/media/plans" && request.method === "GET") {
			return listMediaPlans(env.nwana_engine_db);
		}
		if (url.pathname === "/api/operating-center/media/plans" && request.method === "POST") {
			return createMediaPlan(request, env.nwana_engine_db);
		}
		if (url.pathname === "/api/operating-center/media/plans/compose" && request.method === "POST") {
			return composeMediaPlan(env.nwana_engine_db);
		}
		{
			const m = url.pathname.match(/^\/api\/operating-center\/media\/plans\/([^/]+)$/);
			if (m && request.method === "GET") return getMediaPlan(env.nwana_engine_db, m[1]);
		}
		{
			const m = url.pathname.match(/^\/api\/operating-center\/media\/plans\/([^/]+)\/approve$/);
			if (m && request.method === "POST") return approveMediaPlan(env.nwana_engine_db, m[1]);
		}
		{
			const m = url.pathname.match(/^\/api\/operating-center\/media\/plans\/([^/]+)\/articles$/);
			if (m && request.method === "POST") {
				return addMediaArticle(request, env.nwana_engine_db, m[1]);
			}
		}
		{
			const m = url.pathname.match(/^\/api\/operating-center\/media\/articles\/([^/]+)\/body$/);
			if (m && request.method === "POST") {
				return saveArticleBody(request, env.nwana_engine_db, m[1]);
			}
		}
		{
			const m = url.pathname.match(/^\/api\/operating-center\/media\/articles\/([^/]+)\/approve$/);
			if (m && request.method === "POST") return approveArticle(env.nwana_engine_db, m[1]);
		}
		{
			const m = url.pathname.match(/^\/api\/operating-center\/media\/articles\/([^/]+)\/publish$/);
			if (m && request.method === "POST") return publishArticle(env.nwana_engine_db, m[1]);
		}
		{
			const m = url.pathname.match(/^\/api\/operating-center\/media\/articles\/([^/]+)\/distribute$/);
			if (m && request.method === "POST") return distributeArticle(request, env.nwana_engine_db, m[1]);
		}
		{
			const m = url.pathname.match(/^\/api\/operating-center\/media\/articles\/([^/]+)\/distributions$/);
			if (m && request.method === "GET") return listArticleDistributions(env.nwana_engine_db, m[1]);
		}

		// ADR-0023: Board protocol, uploads, activity.
		if (url.pathname === "/api/board/protocol/form" && request.method === "POST") {
			return formWeeklyProtocol(env.nwana_engine_db);
		}
		if (url.pathname === "/api/board/protocol/process" && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as { meeting_id?: string };
			const result = await processProtocol(env.nwana_engine_db, String(body.meeting_id ?? ""));
			return json({ ok: true, ...result });
		}
		if (url.pathname === "/api/operating-center/uploads" && request.method === "POST") {
			return handleUpload(request, env.nwana_engine_db);
		}
		if (url.pathname === "/api/operating-center/uploads" && request.method === "GET") {
			return listUploads(env.nwana_engine_db);
		}
		{
			const m = url.pathname.match(/^\/api\/operating-center\/uploads\/([^/]+)\/staged-contacts\.csv$/);
			if (m && request.method === "GET") return getStagedCsv(env.nwana_engine_db, m[1]);
		}
		if (url.pathname === "/api/operating-center/activity" && request.method === "GET") {
			return getActivityFeed(env.nwana_engine_db);
		}
		if (url.pathname === "/api/operating-center/activity/acknowledge" && request.method === "POST") {
			return acknowledgeRead(request, env.nwana_engine_db);
		}

		if (request.method === "GET" && url.pathname === "/api/operating-center/race-results") {
			try {
				return json(await getRaceResultsView(env.nwana_engine_db));
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Race results view failed" }, 500);
			}
		}

		if (request.method === "GET" && url.pathname === "/api/operating-center/overview") {
			try {
				// ADR-0023: event-driven weekly protocol reconciliation. The
				// overview call is the owner's own activity; on the first
				// visit of the week it ensures the coming Sunday meeting
				// exists and its protocol is formed. No timers, no cron.
				const reconciliation = await reconcileProtocolIfDue(env.nwana_engine_db);
				const overviewRes = await getOperatingCenterOverview(env.nwana_engine_db);
				if (reconciliation) {
					const body = (await overviewRes.json()) as Record<string, unknown>;
					return json({ ...body, protocol_reconciliation: reconciliation });
				}
				return overviewRes;
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Operating center overview failed" }, 500);
			}
		}

		if (url.pathname === "/api/initiatives" && request.method === "GET") {
			try {
				return await listInitiatives(env.nwana_engine_db);
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Initiative list failed" }, 500);
			}
		}

		if (url.pathname === "/api/initiatives" && request.method === "POST") {
			try {
				return await createInitiative(request, env.nwana_engine_db);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Initiative submission failed" }, 400);
			}
		}

		// Site news distribution channel: the machine's publishing endpoint for
		// the public website (news feed + winner announcements). Owner key
		// only; the public site reads from D1 directly.
		if (url.pathname === "/api/site/news" && request.method === "POST") {
			if (!isOperatingCenterAuthorized(request, env.OPERATING_CENTER_KEY)) {
				return json({ ok: false, error: "Site news publishing requires the owner key" }, 401);
			}
			try {
				return await publishSiteNews(request, env.nwana_engine_db);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Site news publish failed" }, 400);
			}
		}

		if (url.pathname === "/api/board/submissions" && request.method === "GET") {
			try {
				return await listBoardSubmissions(env.nwana_engine_db);
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Board queue failed" }, 500);
			}
		}

		if (url.pathname === "/api/board/submissions" && request.method === "POST") {
			try {
				return await createBoardSubmission(request, env.nwana_engine_db);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Board submission failed" }, 400);
			}
		}

		// Board meeting loop (ADR-0019): meetings, agenda triage, decisions,
		// work items. All under /api/board/* so the owner-key gate above applies.
		if (url.pathname === "/api/board/meetings" && request.method === "POST") {
			try {
				return await createBoardMeeting(request, env.nwana_engine_db);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Board meeting creation failed" }, 400);
			}
		}

		if (url.pathname === "/api/board/meetings" && request.method === "GET") {
			try {
				// Standing-meeting guarantee: the next meeting's date always
				// stands, with no manual "Create meeting" step. Never throws.
				try {
					await ensureUpcomingMeeting(env.nwana_engine_db);
				} catch (ensureError) {
					console.error("ensureUpcomingMeeting failed:", ensureError instanceof Error ? ensureError.message : ensureError);
				}
				return await listBoardMeetings(env.nwana_engine_db);
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Board meetings list failed" }, 500);
			}
		}

		if (url.pathname === "/api/board/cadence" && request.method === "GET") {
			try {
				const cadence = await getBoardCadence(env.nwana_engine_db);
				return json({ ok: true, cadence });
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Board cadence read failed" }, 500);
			}
		}

		if (url.pathname === "/api/board/decisions" && request.method === "POST") {
			try {
				return await recordBoardDecision(request, env.nwana_engine_db);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Board decision failed" }, 400);
			}
		}

		if (url.pathname === "/api/board/work-items" && request.method === "GET") {
			try {
				return await listBoardWorkItems(env.nwana_engine_db);
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Work items list failed" }, 500);
			}
		}

		if (url.pathname === "/api/board/work-items/advance" && request.method === "POST") {
			try {
				return await advanceBoardWorkItem(request, env.nwana_engine_db);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Work item advance failed" }, 400);
			}
		}

		if (url.pathname === "/api/initiatives/advance" && request.method === "POST") {
			try {
				return await advanceInitiative(request, env.nwana_engine_db);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Initiative advance failed" }, 400);
			}
		}

		const boardMeetingPath = url.pathname.match(/^\/api\/board\/meetings\/([^/]+)(?:\/(open|agenda|close))?$/);
		if (boardMeetingPath) {
			const meetingId = decodeURIComponent(boardMeetingPath[1]);
			const action = boardMeetingPath[2];
			try {
				if (request.method === "GET" && !action) {
					return await getBoardMeetingDetail(env.nwana_engine_db, meetingId);
				}
				if (request.method === "POST" && action === "open") {
					return await openBoardMeeting(request, env.nwana_engine_db, meetingId);
				}
				if (request.method === "POST" && action === "agenda") {
					return await triageAgenda(request, env.nwana_engine_db, meetingId);
				}
				if (request.method === "POST" && action === "close") {
					return await closeBoardMeeting(request, env.nwana_engine_db, meetingId);
				}
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Board meeting action failed" }, 400);
			}
		}

		if (request.method === "GET" && url.pathname === "/api/operating-center/race-lifecycle") {
			try {
				return json(await getRaceLifecycleView(env.nwana_engine_db));
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Race lifecycle view failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/race-lifecycle/sync") {
			try {
				const distance = url.searchParams.get("distance");
				if (!distance) {
					return json({ ok: false, error: "A distance query parameter is required (one distance per sync keeps each request inside the Worker limit)" }, 400);
				}
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const state = await syncRaceLifecycleDistance({
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					apiCallerToken: env.RUNSIGNUP_API_REG,
					apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
					distance,
				});
				return json({ ok: true, ...state });
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Race lifecycle sync failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/race-lifecycle/prep-confirm") {
			try {
				const body = await request.json() as { distance?: string };
				if (!body.distance) {
					return json({ ok: false, error: "distance is required" }, 400);
				}
				return json(await confirmRaceLifecyclePrep(env.nwana_engine_db, body.distance));
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Prep confirmation failed" }, 400);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/race-lifecycle/write-test") {
			try {
				const body = await request.json() as { distance?: string; confirm?: string };
				if (!body.distance) {
					return json({ ok: false, error: "distance is required" }, 400);
				}
				if (body.confirm !== "TEST_WRITE") {
					return json({ ok: false, error: 'Explicit confirm: "TEST_WRITE" is required before any RunSignup write attempt' }, 400);
				}
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const result = await testSeries2026WriteAccess({
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					distance: body.distance,
				});
				return json({ ok: true, ...result });
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Write test failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/fund/seed") {
			try {
				return json(await seedBridgeSprintFund(env.nwana_engine_db));
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Fund seed failed" }, 500);
			}
		}

		if (request.method === "GET" && url.pathname === "/api/operating-center/fund") {
			try {
				return json(await getFundView(env.nwana_engine_db));
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Fund view failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/fund/prospect/advance") {
			try {
				const body = await request.json() as { prospect_id?: string; to_stage?: string };
				if (!body.prospect_id || !body.to_stage) {
					return json({ ok: false, error: "prospect_id and to_stage are required" }, 400);
				}
				const result = await advanceFundProspect(env.nwana_engine_db, body.prospect_id, body.to_stage);
				if (!result.ok) {
					return json(result, 400);
				}
				return json(result);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Prospect advance failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/sponsorship-assets/generate") {
			try {
				const body = await request.json() as { object_type?: string; object_id?: string };
				const result = await generateSponsorshipAsset(env.nwana_engine_db, body.object_type ?? "", body.object_id ?? "");
				if (!result.ok) {
					return json(result, 400);
				}
				return json(result);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Sponsorship asset generation failed" }, 500);
			}
		}

		if (request.method === "GET" && url.pathname === "/api/operating-center/sponsorship-assets") {
			try {
				return json(await getSponsorshipAssetsView(env.nwana_engine_db));
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Sponsorship assets view failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/sponsorship-assets/advance") {
			try {
				const body = await request.json() as { asset_id?: string; to_stage?: string };
				if (!body.asset_id || !body.to_stage) {
					return json({ ok: false, error: "asset_id and to_stage are required" }, 400);
				}
				const result = await advanceSponsorshipAsset(env.nwana_engine_db, body.asset_id, body.to_stage);
				if (!result.ok) {
					return json(result, 400);
				}
				return json(result);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Sponsorship asset advance failed" }, 500);
			}
		}

		if (request.method === "GET" && url.pathname === "/api/operating-center/google-ads/desired-state") {
			try {
				return json({ ok: true, ...(await buildDesiredState(env.nwana_engine_db)) });
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Desired state failed" }, 500);
			}
		}

		if (
			request.method === "GET" &&
			url.pathname === "/"
		) {
			return json({
				ok: true,
				system:
					"NWANA Automation & Distribution Engine",
				module: "Core Registry",
				status: "running",
				capabilities: [
					"objects",
					"versions",
					"relationships",
					"trust",
					"timestamp_jobs",
					"opentimestamps_submission",
					"audit",
				],
			});
		}

		if (request.method === "GET" && url.pathname === "/integrations/google-ads/status") {
			const status = await getGoogleAdsStatus(env);
			return json(status, status.ok ? 200 : status.configured ? 502 : 503);
		}

		if (request.method === "GET" && url.pathname === "/integrations/google-ads/connect") {
			try {
				return Response.redirect(await googleAdsAuthorizationUrl(env), 302);
			} catch (error) {
				return json({
					ok: false,
					connected: false,
					error: error instanceof Error ? error.message : "Google Ads connection could not start",
				}, 503);
			}
		}

		if (request.method === "GET" && url.pathname === "/integrations/google-ads/callback") {
			try {
				const connection = await handleGoogleAdsCallback(url, env);
				return new Response(
					`<!doctype html><html lang="en"><meta charset="utf-8"><title>NWANA Google Ads connected</title><body style="font:20px system-ui;max-width:720px;margin:80px auto;padding:24px"><h1>Google Ads connected</h1><p>NWANA Engine can access ${connection.customers.length} Google Ads account(s).</p><p>No campaign was created or changed. You may close this tab.</p></body></html>`,
					{ headers: { "content-type": "text/html; charset=utf-8" } },
				);
			} catch (error) {
				return json({
					ok: false,
					connected: false,
					error: error instanceof Error ? error.message : "Google Ads authorization failed",
				}, 400);
			}
		}

		if (request.method === "GET" && url.pathname === "/integrations/meta/status") {
			try {
				return await getMetaConnectionStatus(env);
			} catch (error) {
				return json({ ok: false, connected: false, error: error instanceof Error ? error.message : "Meta connection failed" }, 502);
			}
		}


		if (
			request.method === "GET" &&
			url.pathname.startsWith("/result-publications/card/") &&
			(url.pathname.endsWith(".svg") || url.pathname.endsWith(".jpg"))
		) {
			const format = url.pathname.endsWith(".jpg") ? "jpeg" : "svg";
			const suffix = format === "jpeg" ? ".jpg" : ".svg";
			const publicationKey = decodeURIComponent(
				url.pathname.slice(
					"/result-publications/card/".length,
					-suffix.length,
				),
			);
			try {
				return await getSeries2026ResultCard(
					publicationKey,
					format,
					env,
				);
			} catch (error) {
				console.error(error);
				return json({
					ok: false,
					error: error instanceof Error
						? error.message
						: "Result card generation failed",
				}, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/result-publications/publish") {
			try {
				return await publishSeries2026Result(request, env);
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Result publication failed" }, 500);
			}
		}

		if (
			request.method === "GET" &&
			url.pathname === "/health"
		) {
			return json({
				ok: true,
				status: "healthy",
				timestamp:
					new Date().toISOString(),
			});
		}

		if (
			request.method === "POST" &&
			url.pathname === "/sources/runsignup/series-2026/results-baseline"
		) {
			try {
				return await establishSeries2026ResultPublicationBaseline(
					env,
					url.searchParams.get("distance") ?? undefined,
				);
			} catch (error) {
				console.error(error);
				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown Series 2026 baseline error",
					},
					500,
				);
			}
		}

		if (
			request.method === "GET" &&
			url.pathname === "/sources/runsignup/series-2026/results-preview"
		) {
			try {
				return await getSeries2026ResultPublicationPreview(
					env,
					url.searchParams.get("distance") ?? undefined,
				);
			} catch (error) {
				console.error(error);
				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown Series 2026 result preview error",
					},
					500,
				);
			}
		}

		if (
			request.method === "GET" &&
			url.pathname.startsWith("/distribution/plan/")
		) {
			const objectId = decodeURIComponent(
				url.pathname.slice("/distribution/plan/".length),
			);

			if (!objectId) {
				return json(
					{ ok: false, error: "Object ID is required" },
					400,
				);
			}

			try {
				return await getDistributionPlan(objectId, env);
			} catch (error) {
				console.error(error);
				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown distribution planning error",
					},
					500,
				);
			}
		}

		if (
			request.method === "POST" &&
			url.pathname === "/objects"
		) {
			try {
				return await createObject(
					request,
					env,
				);
			} catch (error) {
				console.error(error);

				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown error",
					},
					500,
				);
			}
		}

		if (
			request.method === "GET" &&
			url.pathname === "/sources/runsignup/discovery"
		) {
                        try {
                                return await discoverRunSignup(env);
                        } catch (error) {
                                console.error(error);

                                return json(
                                        {
                                                ok: false,
                                                error:
                                                        error instanceof Error
                                                                ? error.message
                                                                : "Unknown RunSignup discovery error",
                                        },
                                        500,
                                );
                        }
                }
                if (
                        request.method === "GET" &&
                        url.pathname === "/sources/runsignup/events-preview"
                ) {
                        try {
                                return await previewRunSignupEvents(
                                        env,
                                );
                        } catch (error) {
                                console.error(error);

                                return json(
                                        {
                                                ok: false,
                                                error:
                                                        error instanceof Error
                                                                ? error.message
                                                                : "Unknown RunSignup event preview error",
                                        },
                                        500,
                                );
                        }
                }
                if (
                        request.method === "POST" &&
                        url.pathname === "/sources/runsignup/events-ingest"
                ) {
                        try {
                                return await ingestRunSignupEvents(
                                        env,
                                );
                        } catch (error) {
                                console.error(error);

                                return json(
                                        {
                                                ok: false,
                                                error:
                                                        error instanceof Error
                                                                ? error.message
                                                                : "Unknown RunSignup event Registry ingest error",
                                        },
                                        500,
                                );
                        }
                }
                if (
                        request.method === "POST" &&
                        url.pathname === "/sources/runsignup/ingest"
                ) {
                        try {
                                return await ingestRunSignupDiscovery(
                                        env,
                                );
                        } catch (error) {
                                console.error(error);

                                return json(
                                        {
                                                ok: false,
                                                error:
                                                        error instanceof Error
                                                                ? error.message
                                                                : "Unknown RunSignup Registry ingest error",
                                        },
                                        500,
                                );
                        }
                }

if (
                    request.method === "POST" &&
                    url.pathname === "/sources/runsignup/sync"
            ) {
                    try {
                            return await syncRunSignup(env);
                    } catch (error) {
                            console.error(error);

                            return json(
                                    {
                                            ok: false,
                                            error:
                                                    error instanceof Error
                                                            ? error.message
                                                            : "Unknown RunSignup sync error",
                                    },
                                    500,
                            );
                    }
            }
                if (
                        request.method === "POST" &&
                        url.pathname === "/sources/runsignup/relationships-ingest"
                ) {
                        try {
                                return await ingestRunSignupRelationships(
                                        env,
                                );
                        } catch (error) {
                                console.error(error);

                                return json(
                                        {
                                                ok: false,
                                                error:
                                                        error instanceof Error
                                                                ? error.message
                                                                : "Unknown RunSignup relationship Registry ingest error",
                                        },
                                        500,
                                );
                        }
                }
                if (
			request.method === "POST" &&
			url.pathname === "/relationships"
		) {
			try {
				return await createRelationship(
					request,
					env,
				);
			} catch (error) {
				console.error(error);

				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown error",
					},
					500,
				);
			}
		}

                if (
                        request.method === "POST" &&
                        url.pathname === "/jobs/process-next"
                ) {
                        try {
                                return await processNextGenericJob(env);
                        } catch (error) {
                                console.error(error);

                                return json(
                                        {
                                                ok: false,
                                                error:
                                                        error instanceof Error
                                                                ? error.message
                                                                : "Unknown error",
                                        },
                                        500,
                                );
                        }
                }

		if (
			request.method === "POST" &&
			url.pathname === "/trust/process-next"
		) {
			try {
				return await processNextTimestampJob(env);
			} catch (error) {
				console.error(error);

				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown error",
					},
					500,
				);
			}
		}

		const parts = url.pathname
			.split("/")
			.filter(Boolean);
                if (
                        parts.length === 4 &&
                        parts[0] === "trust" &&
                        parts[1] === "jobs" &&
                        parts[3] === "verify" &&
                        request.method === "POST"
                ) {
                        try {
                                return await verifyTimestampJob(
                                        decodeURIComponent(parts[2]),
                                        env,
                                );
                        } catch (error) {
                                console.error(error);

                                return json(
                                        {
                                                ok: false,
                                                error:
                                                        error instanceof Error
                                                                ? error.message
                                                                : "Unknown error",
                                        },
                                        500,
                                );
                        }
                }
                if (
                        parts.length === 4 &&
                        parts[0] === "trust" &&
                        parts[1] === "jobs" &&
                        parts[3] === "upgrade" &&
                        request.method === "POST"
                ) {
                        try {
                                return await upgradeTimestampJob(
                                        decodeURIComponent(parts[2]),
                                        env,
                                );
                        } catch (error) {
                                console.error(error);

                                return json(
                                        {
                                                ok: false,
                                                error:
                                                        error instanceof Error
                                                                ? error.message
                                                                : "Unknown error",
                                        },
                                        500,
                                );
                        }
                }

		if (
			parts.length === 3 &&
			parts[0] === "trust" &&
			parts[1] === "jobs" &&
			request.method === "POST"
		) {
			try {
				return await processTimestampJob(
					decodeURIComponent(parts[2]),
					env,
				);
			} catch (error) {
				console.error(error);

				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown error",
					},
					500,
				);
			}
		}

		if (
			parts.length === 3 &&
			parts[0] === "objects" &&
			parts[2] === "versions" &&
			request.method === "POST"
		) {
			try {
				return await createVersion(
					decodeURIComponent(parts[1]),
					request,
					env,
				);
			} catch (error) {
				console.error(error);

				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown error",
					},
					500,
				);
			}
		}

		if (
			parts.length === 3 &&
			parts[0] === "objects" &&
			parts[2] === "relationships" &&
			request.method === "GET"
		) {
			return listRelationships(
				decodeURIComponent(parts[1]),
				env,
			);
		}

		if (
			parts.length === 2 &&
			parts[0] === "objects" &&
			request.method === "GET"
		) {
			return getObject(
				decodeURIComponent(parts[1]),
				env,
			);
		}

		return json(
			{
				ok: false,
				error: "Route not found",
			},
			404,
		);
	},
};
export {
        classifyRunSignupContainer,
        classifyRunSignupEvent,
        getRunSignupProgramFamily,
        resolveRunSignupContainerSemantic,
        resolveRunSignupEventSemantic,
};
