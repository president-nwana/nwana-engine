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
import { applySeries2026PublicationHistory, previewSeries2026ResultPublications, buildPublicationDraftFromD1, SERIES_2026_SOURCES } from "./series-2026-results";
import { getDistanceProgression } from "./series-2026-progression-data";
import { getEventApprovals, recordResultApproval } from "./series-2026-approvals";
import {
	clearResultDecision,
	getEventDisqualifications,
	recordResultDisqualification,
} from "./series-2026-decisions";
import {
	autoProcessEvent,
	evaluateEventTrigger,
	fetchLiveEventResults,
	getAthletePipeline,
	isEventPublished,
} from "./series-2026-auto-process";
import {
	confirmRaceLifecyclePrep,
	getRaceLifecycleView,
	getRaceResultsView,
	RACE_LIFECYCLE_SERIES,
	syncRaceLifecycleDistance,
	testSeries2026WriteAccess,
} from "./race-lifecycle";
import { applySeries2026Levels, AUTO_APPROVED_CONFIRMATION } from "./series-2026-apply";
import {
	diagnoseRegistrationAccess,
	getRaceEventIds,
	getSeries2026ParticipationOverview,
	syncSeries2026Registrations,
} from "./series-2026-registrations";
import { getFacebookPageToken, publishFacebookResult, publishInstagramResult, RESULT_DESTINATIONS } from "./meta-result-publisher";
import { getMetaSocialOverview } from "./meta-reads";
import {
	buildAudienceExport,
	defaultExportPeriod,
	liveAudienceAdapters,
	type AudienceExportEnv,
} from "./audience-export";
import { buildResultCardSvg, isResultCardDesignReady, RESULT_CARD_DESIGN_BLOCKER } from "./result-card";
import { rasterizeSvgToPng } from "./svg-raster";
import { executeResultPublication } from "./result-publication-core";
import {
        getConversionActions,
        getGoogleAdsMetrics,
        getGoogleAdsStatus,
        googleAdsAuthorizationUrl,
        handleGoogleAdsCallback,
} from "./google-ads";
import {
        getYouTubeStatus,
        getYouTubeChannelMetrics,
        youTubeAuthorizationUrl,
        handleYouTubeCallback,
        uploadVideo,
        publishVideo,
} from "./youtube";
import {
        getGoogleAnalyticsStatus,
        googleAnalyticsAuthorizationUrl,
        handleGoogleAnalyticsCallback,
        getGa4TrafficOverview,
        getGa4AudienceReport,
        GA4_DATE_PRESETS,
        type Ga4DatePreset,
} from "./google-analytics";
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
import { getBoardDigest } from "./board-digest";
import {
	createBoardSubmission,
	createInitiative,
	extractOperatingCenterKey,
	getOperatingCenterOverview,
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
import { renderNewsReviewHtml } from "./operating-center-news-review";
import { approveNewsReview, getNewsReview, markDistributionSent, publishNewsToFacebook, publishNewsToInstagram, registerManualPack, deleteInstagramPost, deleteFacebookPost } from "./news-review";
import { generateAutoNews, listAutoNewsQueue, autoNewsTypeLabel, AUTO_NEWS_TYPES } from "./auto-news";
import { linkedInConnectUrl, threadsConnectUrl, handleLinkedInCallback, handleThreadsCallback, isSocialConnected, postToLinkedIn, postToThreads } from "./social-oauth";
import { getExecutiveMoneyView } from "./operating-center-money";
import {
	getMoneySyncState,
	inspectDonationRecordShape,
	listMoneyEvents,
	listMoneyTransactions,
	reconcileRunSignupDonations,
	syncRunSignupDonations,
	syncRunSignupRegistrations,
	syncMemberOrgMemberships,
	backfillRunSignupDonations,
	backfillRunSignupRegistrations,
} from "./lib/money-ingestion";
import {
	ACTION_STATUSES,
	REVENUE_OBJECT_TYPES,
	REVENUE_SYSTEMS,
	getRevenueObject,
	listRevenueObjects,
	recordRevenueAction,
} from "./lib/revenue-inventory";
import {
	createBusinessUnit,
	createTenant,
	getBusinessUnitDetail,
	getTenant,
	listBusinessUnits,
	listTenants,
} from "./lib/tenants";
import {
	bootstrapClosed,
	bootstrapFirstAdmin,
	createLoginUser,
	listAllUsers,
	mintBootstrapGrant,
	reactivateLoginUser,
	revokeLoginUser,
	setUserPassword,
	timingSafeEqual,
	createPreviewToken,
	createSessionToken,
	createTenantUser,
	findUserByEmail,
	getPortalSession,
	getPortalUnit,
	hashPassword,
	listTenantUsers,
	resolveIdentity,
	revokeTenantUser,
	verifyPassword,
} from "./lib/tenant-access";
import { renderPortalLandingHtml, renderPortalUnitHtml } from "./oc-portal";
import { renderLoginHtml } from "./oc-login";
import { renderSponsorshipHtml } from "./operating-center-sponsorship";
import { renderActivityHtml } from "./operating-center-activity";
import { renderBoardHtml } from "./operating-center-board";
import { renderUploadsHtml } from "./operating-center-uploads";
import { renderCreationHtml, renderCreationPacketHtml } from "./operating-center-creation";
// Operating Center sections (rebuild 2026-09-28; Organizations added 2026-10-01): one renderer per section.
import { renderOverviewSectionHtml } from "./oc-overview";
import { renderMarketingSectionHtml } from "./oc-marketing";
import { OC_ICON_1024_BASE64 } from "./assets/oc-icon-1024";
import { OC_ICON_180_BASE64 } from "./assets/oc-icon-180";
import { OC_ICON_180_ROUND_BASE64 } from "./assets/oc-icon-180-round";
import { renderGrowthSectionHtml } from "./oc-growth";
import { renderSportSectionHtml } from "./oc-sport";
import { renderAcademySectionHtml } from "./oc-academy";
import { renderBoardSectionHtml } from "./oc-board";
import { renderOperationsSectionHtml } from "./oc-operations";
import { renderAdminLandingHtml, renderUsersSectionHtml, renderVenturesSectionHtml } from "./oc-admin";
import {
	renderBusinessUnitSectionHtml,
	renderOrganizationsSectionHtml,
	renderTenantSectionHtml,
} from "./oc-organizations";
import { renderMyProjectsSectionHtml } from "./oc-my-projects";
import { renderWorkspaceSectionHtml } from "./oc-workspace";
import {
	getAthleteProfile,
	listAthleteProfiles,
	refreshAllAthleteStats,
	refreshAthleteStats,
} from "./athletes";
import {
	createCreationPacket,
	listCreationPackets,
	getCreationPacket,
	buildWritePlan,
	probeRunSignupCredentials,
	saveProbeResult,
	linkRunSignupRace,
	applyCreationStep,
	completeManualStep,
	setPacketApiFields,
} from "./object-creation";
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
	getDistributionPacks,
	getAdsOverview,
	getSellersOverview,
	getPartnersOverview,
	updateSellerStage,
	updatePartnerStage,
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
	GOOGLE_YOUTUBE_CLIENT_ID?: string;
	GOOGLE_YOUTUBE_CLIENT_SECRET?: string;
	GOOGLE_YOUTUBE_TOKEN_KEY?: string;
	GOOGLE_YOUTUBE_REDIRECT_URI?: string;
	LINKEDIN_CLIENT_ID?: string;
	LINKEDIN_CLIENT_SECRET?: string;
	THREADS_CLIENT_ID?: string;
	THREADS_CLIENT_SECRET?: string;
	OPERATING_CENTER_ENABLED?: string;
	OPERATING_CENTER_KEY?: string;
	PUBLIC_BASE_URL?: string;
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

/**
 * Platform-operator gate for privileged routes (2026-10-02 cleanup).
 * Accepts the emergency owner key OR a platform_admin unified-login session.
 * Returns null when authorized; otherwise a 401 (no/invalid credential —
 * the client signs out, correctly) or 403 (valid sign-in, insufficient
 * privilege — the client shows the message and STAYS signed in).
 */
async function requirePlatformOperator(
	request: Request,
	env: Env,
): Promise<Response | null> {
	const presented = extractOperatingCenterKey(request);
	if (!presented) return json({ ok: false, error: "Sign-in required" }, 401);
	// Fast path: the emergency owner key never touches the database.
	if (env.OPERATING_CENTER_KEY && timingSafeEqual(presented, env.OPERATING_CENTER_KEY)) {
		return null;
	}
	let identity: Awaited<ReturnType<typeof resolveIdentity>> = null;
	try {
		identity = await resolveIdentity(env.nwana_engine_db, presented, env.OPERATING_CENTER_KEY);
	} catch {
		identity = null;
	}
	if (!identity) return json({ ok: false, error: "Sign-in required" }, 401);
	const isOperator =
		identity.kind === "platform_admin" ||
		(identity.kind === "session" && identity.role === "platform_admin");
	if (!isOperator) {
		return json(
			{ ok: false, error: "Only the platform administrator can perform this action." },
			403,
		);
	}
	return null;
}

/** Serve a base64-encoded PNG (app icon / favicon). Static, public, cacheable. */
function pngFromBase64(b64: string): Response {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new Response(bytes, {
		headers: {
			"content-type": "image/png",
			"cache-control": "public, max-age=86400",
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
		{ distance },
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
	const raceId = Number(publicationKey.split(":")[2]);
	if (!Number.isInteger(raceId)) {
		return json({ ok: false, error: "Invalid result publication key" }, 400);
	}
	// Architectural rule: use D1 canonical snapshot first (no RunSignup
	// needed for finalized events). Fall back to live RunSignup only if
	// D1 has no finalized snapshot.
	let draft = await buildPublicationDraftFromD1(env.nwana_engine_db, publicationKey);
	if (!draft) {
		const preview = await previewSeries2026ResultPublications(
			env.RUNSIGNUP_ACCESS_TOKEN,
			{ raceId },
		);
		draft = preview.drafts.find(
			(value) => value.publication_key === publicationKey,
		) ?? null;
	}
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
			series_record: (row as { series_record?: boolean }).series_record ?? false,
		}));
	let logoUrl: string | undefined;
	// Embed logo as data URL for reliable WASM rendering.
	{
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
	// Root cause of 9412: Cloudflare Images cannot parse SVG input.
	// resvg-wasm rasterizes in-process ($0, Worker-compatible).
	// PNG is accepted by Meta; no JPEG conversion needed.
	const pngBytes = await rasterizeSvgToPng(svg, { width: 1080 });
	return new Response(pngBytes, {
		headers: {
			"content-type": "image/png",
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


async function publishSeries2026Result(
	request: Request,
	env: Env,
): Promise<Response> {
	// Platform-operator gate: external publication (Meta + site news) requires
	// the owner key or a platform_admin session. The confirmation token
	// alone is not enough.
	const operatorGate = await requirePlatformOperator(request, env);
	if (operatorGate) return operatorGate;
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
	// History first: already_published short-circuits before any external
	// call or credential requirement (idempotent re-entry).
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
	if (!isResultCardDesignReady()) {
		return json({
			ok: false,
			status: "VISUAL_DESIGN_NOT_APPROVED",
			execution_allowed: false,
			error: RESULT_CARD_DESIGN_BLOCKER,
		}, 409);
	}
	let imageUrl: URL;
	// If caller provides an explicit image_url, use it (must be HTTPS).
	// Otherwise, generate and verify the card directly (see preflight below).
	if (body.image_url) {
		try {
			imageUrl = new URL(body.image_url);
			if (imageUrl.protocol !== "https:") throw new Error("HTTPS required");
		} catch {
			return json({
				ok: false,
				error: "Publication requires a valid public HTTPS card URL",
			}, 400);
		}
	}
	if (!env.NWANA_META_TOKEN) {
		return json({ ok: false, error: "NWANA_META_TOKEN is not configured" }, 503);
	}
	if (!env.RUNSIGNUP_ACCESS_TOKEN) {
		return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
	}

	const raceId = Number(body.publication_key.split(":")[2]);
	if (!Number.isInteger(raceId)) {
		return json({ ok: false, error: "Invalid result publication key" }, 400);
	}

	// Preflight: the card PNG must be generatable and return valid PNG bytes.
	// No Meta publication starts until the raster asset is confirmed.
	// NOTE: We call getSeries2026ResultCard directly instead of fetch()ing
	// the public URL — a Worker cannot reliably fetch its own public URL
	// (Cloudflare edge/bot protection returns 404 for self-fetch).
	// This still satisfies the "real HTTP 200 + image/png" requirement:
	// we verify the actual generated PNG bytes and content-type.
	let cardPngBytes: Uint8Array | undefined;
	try {
		const cardResponse = await getSeries2026ResultCard(
			body.publication_key,
			"jpeg", // "jpeg" format actually returns PNG bytes via WASM rasterizer
			env,
		);
		if (!cardResponse.ok) {
			return json({
				ok: false,
				status: "CARD_NOT_READY",
				error: `Card generation failed (HTTP ${cardResponse.status}).`,
			}, 409);
		}
		const contentType = cardResponse.headers.get("content-type") ?? "";
		if (!contentType.includes("image/png")) {
			return json({
				ok: false,
				status: "CARD_NOT_READY",
				error: `Card image has wrong content-type: ${contentType}`,
			}, 409);
		}
		// Verify it's actually PNG bytes (magic number)
		const cardBytes = await cardResponse.arrayBuffer();
		const bytes = new Uint8Array(cardBytes);
		const isPng = bytes.length > 8 &&
			bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
		if (!isPng) {
			return json({
				ok: false,
				status: "CARD_NOT_READY",
				error: "Card bytes are not valid PNG",
			}, 409);
		}
		// Keep bytes for direct upload (bypasses Meta's URL fetcher)
		cardPngBytes = bytes;
		// Card is valid; use the public PNG URL for Meta (Meta fetches it externally)
		// Note: Facebook will use direct bytes upload; Instagram uses this URL.
		const encodedKey = encodeURIComponent(body.publication_key);
		imageUrl = new URL(`/result-publications/card/${encodedKey}.png`, request.url);
	} catch (error) {
		return json({
			ok: false,
			status: "CARD_NOT_READY",
			error: `Card image check failed: ${error instanceof Error ? error.message : "unknown"}`,
		}, 502);
	}

	// The core checks publication history first (idempotent: already_published
	// short-circuits before any external call), then resolves the preview.
	//
	// Note: We do NOT pass imageBytes to Facebook. The 3K (Sep 27) used
	// imageUrl with URLSearchParams successfully. The direct bytes upload
	// via FormData (added Sep 29) caused the caption to lose real newlines.
	// Meta's crawler can fetch the workers.dev PNG URL (verified 200 OK).
	try {
		const published = await executeResultPublication({
			db: env.nwana_engine_db,
			runSignupToken: env.RUNSIGNUP_ACCESS_TOKEN,
			metaToken: env.NWANA_META_TOKEN,
			publicationKey: body.publication_key,
			imageUrl: imageUrl.toString(),
			authorizedBy: { kind: "owner_publish_confirmation" },
		});
		return json(published);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Publication failed";
		const status = /missing or not ready|cannot be published as new|Invalid result publication key/.test(message) ? 409 : 500;
		return json({ ok: false, error: message }, status);
	}
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

		// Legacy top-level shortcuts → their new section tabs (rebuild
		// 2026-09-28). Public 301s; these paths never existed as routes in
		// this worker, so nothing else claims them.
		if (request.method === "GET") {
			const legacyTop: Record<string, string> = {
				"/results": "/operating-center/sport#results",
				"/funds": "/operating-center/growth#funds",
				"/media": "/operating-center/marketing?tab=media&view=summary",
				"/uploads": "/operating-center/board#uploads",
				"/sponsorship": "/operating-center/growth#sponsorship",
				"/activity": "/operating-center/operations#activity",
				"/sites": "/operating-center/marketing?tab=sites&view=summary",
				"/social": "/operating-center/marketing?tab=social&view=summary",
				"/ads": "/operating-center/marketing?tab=ads&view=summary",
				"/sellers": "/operating-center/growth#sellers",
				"/partners": "/operating-center/growth#partners",
				"/fundraising": "/operating-center/growth#fundraising",
				"/groups": "/operating-center/sport#groups",
				"/meetings": "/operating-center/board#meetings",
				"/creation": "/operating-center/sport#creation",
			};
			const legacyTarget = legacyTop[url.pathname];
			if (legacyTarget) {
				return Response.redirect(new URL(legacyTarget, url).toString(), 301);
			}
		}

		const operatingCenterRoute =
			url.pathname === "/operating-center" ||
			url.pathname.startsWith("/operating-center/") ||
			url.pathname === "/admin" ||
			url.pathname.startsWith("/admin/") ||
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

		// Public page shells: every GET page under /operating-center* and
		// /admin* renders its shell (session-gated client-side); data routes
		// (/api/operating-center/*, /api/board/*) stay server-gated.
		// (Rebuild 2026-09-28; /admin shells added 2026-10-02.)
		const isPageShell =
			request.method === "GET" &&
			!url.pathname.startsWith("/api/") &&
			(url.pathname.startsWith("/operating-center") || url.pathname.startsWith("/admin"));
		const operatingCenterApiRoute = operatingCenterRoute && !isPageShell;

		// ADR-0047 role-based navigation: every /api/portal/* data route is
		// tenant-user only. The tenant comes from the token, never the URL.
		const portalApiRoute = url.pathname.startsWith("/api/portal/");

		// Platform admin API (2026-10-02): /api/admin/* user/tenant
		// management. Identity must resolve here too (not OC-gated).
		const adminApiRoute = url.pathname.startsWith("/api/admin/");

		// Resolve the request identity once. Owner key -> platform_admin
		// (no DB lookup); anything else -> scoped tenant_users lookup.
		const presentedKey =
			operatingCenterApiRoute || portalApiRoute || adminApiRoute
				? extractOperatingCenterKey(request)
				: "";
		const identity = presentedKey
			? await resolveIdentity(env.nwana_engine_db, presentedKey, env.OPERATING_CENTER_KEY)
			: null;

		// Operating Center API access (2026-10-02): the NWANA Workspace is
		// the NWANA tenant's operations environment. Access is granted to:
		//   - the owner key (platform_admin, emergency recovery/bootstrap);
		//   - a platform_admin session (platform operator);
		//   - NWANA tenant sessions (tenant_owner, tenant_admin,
		//     business_unit_user) — the /api/operating-center/* routes are
		//     inherently NWANA-scoped by their data model.
		// demo_user and other-tenant sessions are portal-only (403 here).
		// demo_user sessions are read-only everywhere (403 on non-GET).
		if (operatingCenterApiRoute) {
			// Tenant gate (2026-10-02): NWANA is no longer special-cased.
			// Any active tenant's owner/admin/user may use the operating center;
			// data isolation is enforced per-query by tenant_id.
			let ocAllowed = identity?.kind === "platform_admin";
			if (!ocAllowed && identity?.kind === "session") {
				if (identity.role === "platform_admin") {
					ocAllowed = true;
				} else if (
					identity.role === "tenant_owner" ||
					identity.role === "tenant_admin" ||
					identity.role === "business_unit_user"
				) {
					const t = await env.nwana_engine_db
						.prepare(`SELECT status FROM tenants WHERE tenant_id = ?`)
						.bind(identity.tenant_id)
						.first<{ status: string }>();
					ocAllowed = t?.status === "active";
				}
			}
			if (!ocAllowed) {
				return json({
					ok: false,
					error: "Operating center access requires sign-in",
				}, 401);
			}
			const ocReadOnly =
				identity?.kind === "session" && identity.role === "demo_user";
			if (ocReadOnly && request.method !== "GET") {
				return json({ ok: false, error: "Demo sessions are read-only" }, 403);
			}
			// Board routes are NWANA-governance specific (2026-10-02):
			// not available to other tenants.
			if (url.pathname.startsWith("/api/board/")) {
				const boardAllowed = identity?.kind === "platform_admin" ||
					(identity?.kind === "session" &&
						(identity.role === "platform_admin" || identity.tenant_id === "nwana"));
				if (!boardAllowed) {
					return json({ ok: false, error: "Not available for this tenant" }, 403);
				}
			}
			// NWANA-operational APIs (2026-10-02): activity, social, operations,
			// fund, race lifecycle, overview counts are NWANA-specific.
			// Other tenants get empty responses (never NWANA's data).
			const nwanaOnlyApis = [
				"/api/operating-center/activity",
				"/api/operating-center/social/",
				"/api/operating-center/operations/",
				"/api/operating-center/fund",
				"/api/operating-center/race-lifecycle",
				"/api/operating-center/overview",
			];
			if (nwanaOnlyApis.some((pfx) => url.pathname.startsWith(pfx))) {
				const nwanaAllowed = identity?.kind === "platform_admin" ||
					(identity?.kind === "session" &&
						(identity.role === "platform_admin" || identity.tenant_id === "nwana"));
				if (!nwanaAllowed) {
					return json({ ok: true, counts: {}, meetings: [], work_items: [], submissions: [] });
				}
			}
		}
		if (portalApiRoute) {
			if (!identity) {
				return json({
					ok: false,
					error: "Portal access requires a tenant access key",
				}, 401);
			}
			if (identity.kind !== "tenant_user" && identity.kind !== "preview" && identity.kind !== "session") {
				return json({
					ok: false,
					error: "The tenant portal is for tenant access keys; platform admins use the Operating Center",
				}, 403);
			}
			// ADR-0048: preview sessions are strictly read-only. Admin mode
			// is the Operating Center itself (Exit Preview); there is no
			// in-preview privilege switch.
			// demo_user sessions are likewise read-only (2026-10-02).
			const readOnlyKind = identity.kind === "preview" ||
				(identity.kind === "session" && identity.role === "demo_user");
			if (readOnlyKind && request.method !== "GET") {
				return json({
					ok: false,
					error: identity.kind === "preview" ? "Preview sessions are read-only" : "Demo sessions are read-only",
				}, 403);
			}
		}
		// Narrowed portal identity for the handlers below: tenant users and
		// ADR-0048 previews share the same tenant-scoped code paths.
		const tenantIdentity =
			portalApiRoute && (identity?.kind === "tenant_user" || identity?.kind === "preview" || identity?.kind === "session")
				? identity
				: null;

		// Operating Center (rebuild 2026-09-28; Organizations added 2026-10-01). Canonical GET pages.
		const htmlPage = (render: () => string) =>
			new Response(render(), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		if (request.method === "GET" && url.pathname === "/operating-center") {
			// Platform admin can preview a tenant workspace via ?tenant= (2026-10-02).
			const previewTenant = url.searchParams.get("tenant");
			if (previewTenant && (identity?.kind === "platform_admin" ||
				(identity?.kind === "session" && identity.role === "platform_admin"))) {
				// Validate tenant exists
			const t = await env.nwana_engine_db
				.prepare(`SELECT tenant_id FROM tenants WHERE tenant_id = ?`)
				.bind(previewTenant)
				.first();
				if (t) {
					// Render with tenant override via a preview token in URL
				// For now, redirect to a preview URL that the frontend handles
				return Response.redirect(url.origin + "/operating-center?preview_tenant=" + encodeURIComponent(previewTenant), 302);
				}
			}
			return htmlPage(renderOverviewSectionHtml);
		}
		// Operating Center app icon + favicon (static, public, cacheable).
		if (request.method === "GET" && url.pathname === "/operating-center/icon-1024.png")
			return pngFromBase64(OC_ICON_1024_BASE64);
		if (request.method === "GET" && url.pathname === "/operating-center/icon-180.png")
			return pngFromBase64(OC_ICON_180_BASE64);
		// Round transparent NWANA logo favicon, v2 (cache-busted path).
		if (request.method === "GET" && url.pathname === "/operating-center/icon-180.v2.png")
			return pngFromBase64(OC_ICON_180_ROUND_BASE64);
		if (request.method === "GET" && url.pathname === "/favicon.ico")
			return pngFromBase64(OC_ICON_180_ROUND_BASE64);
		// Public social images (Instagram/Facebook artwork). Served from D1.
		if (request.method === "GET" && url.pathname.startsWith("/api/public/social-image/")) {
			const slug = decodeURIComponent(url.pathname.slice("/api/public/social-image/".length)).trim();
			if (!slug || slug.includes("/") || slug.includes("..")) return json({ ok: false, error: "Not found" }, 404);
			const row = await env.nwana_engine_db
				.prepare(`SELECT jpeg_b64, content_type FROM social_images WHERE slug = ? LIMIT 1`)
				.bind(slug)
				.first<{ jpeg_b64: string; content_type: string }>();
			if (!row?.jpeg_b64) return json({ ok: false, error: "Not found" }, 404);
			const bytes = Uint8Array.from(atob(row.jpeg_b64), (c) => c.charCodeAt(0));
			return new Response(bytes, {
				headers: {
					"content-type": row.content_type || "image/jpeg",
					"cache-control": "public, max-age=86400",
				},
			});
		}
		if (request.method === "GET" && url.pathname === "/operating-center/marketing") return htmlPage(renderMarketingSectionHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/growth") return htmlPage(renderGrowthSectionHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/sport") return htmlPage(renderSportSectionHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/academy") return htmlPage(renderAcademySectionHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/board") return htmlPage(renderBoardSectionHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/operations") return htmlPage(renderOperationsSectionHtml);
		if (request.method === "GET" && url.pathname === "/operating-center/workspace") return htmlPage(renderWorkspaceSectionHtml);
		// Multi-tenant Organizations (ADR-0046): tenant list -> tenant ->
		// business unit. Exact path first, then the two parameterized levels.
		if (request.method === "GET" && url.pathname === "/operating-center/organizations") {
			return htmlPage(renderOrganizationsSectionHtml);
		}
		if (
			request.method === "GET" &&
			url.pathname.startsWith("/operating-center/organizations/")
		) {
			const rest = url.pathname.slice("/operating-center/organizations/".length);
			const parts = rest.split("/").filter((p) => p.length > 0);
			const validId = (p: string) => /^[a-z0-9][a-z0-9-]{1,60}$/.test(p);
			if (parts.length === 1 && validId(parts[0])) {
				const tenantId = parts[0];
				return htmlPage(() => renderTenantSectionHtml(tenantId));
			}
			if (parts.length === 2 && parts.every(validId)) {
				const tenantId = parts[0];
				const unitId = parts[1];
				return htmlPage(() => renderBusinessUnitSectionHtml(tenantId, unitId));
			}
		}

		// Platform Admin (2026-10-02): platform/SaaS administration workspace.
		// Split from the NWANA Operating Center per owner decision. The
		// Organizations renderer moved here from /operating-center/organizations.
		if (request.method === "GET" && url.pathname === "/admin") {
			return htmlPage(renderAdminLandingHtml);
		}
		if (request.method === "GET" && url.pathname === "/admin/organizations") {
			return htmlPage(renderOrganizationsSectionHtml);
		}
		// My Projects — founder's personal dashboard (2026-10-02)
		if (request.method === "GET" && url.pathname === "/my-projects") {
			return new Response(renderMyProjectsSectionHtml(), {
				headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
			});
		}
		if (request.method === "GET" && url.pathname === "/admin/ventures") {
			return htmlPage(renderVenturesSectionHtml);
		}
		if (request.method === "GET" && url.pathname === "/admin/users") {
			return htmlPage(renderUsersSectionHtml);
		}

		// Platform admin user management (2026-10-02): UI-driven, no curl.
		// All routes require platform_admin (session or owner-key bootstrap).
		if (url.pathname === "/api/admin/users" && request.method === "GET") {
			if (identity?.kind !== "platform_admin") {
				// Session-based platform admin also qualifies.
				const sess = identity?.kind === "session" && identity.role === "platform_admin" ? identity : null;
				if (!sess) return json({ ok: false, error: "Platform admin required" }, 403);
			}
			const users = await listAllUsers(env.nwana_engine_db);
			// Never expose password hashes or token hashes.
			const safe = users.map((u) => ({
				user_id: u.user_id, tenant_id: u.tenant_id, display_name: u.display_name,
				email: u.email, role: u.role, unit_ids: u.unit_ids,
				status: u.status, created_at: u.created_at, note: u.note,
				has_password: undefined, // not exposed; client infers from email presence
			}));
			return json({ ok: true, users: safe });
		}
		if (url.pathname === "/api/admin/users" && request.method === "POST") {
			const isAdmin = identity?.kind === "platform_admin" ||
				(identity?.kind === "session" && identity.role === "platform_admin");
			if (!isAdmin) return json({ ok: false, error: "Platform admin required" }, 403);
			let body: Record<string, unknown> = {};
			try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }
			try {
				const created = await createLoginUser(env.nwana_engine_db, String(body.tenant_id ?? ""), {
					email: String(body.email ?? ""),
					password: String(body.password ?? ""),
					display_name: String(body.display_name ?? ""),
					role: String(body.role ?? "business_unit_user") as import("./lib/tenant-access").UserRole,
					unit_ids: Array.isArray(body.unit_ids) ? body.unit_ids.filter((x): x is string => typeof x === "string") : [],
					note: typeof body.note === "string" ? body.note : null,
				});
				return json({ ok: true, user: {
					user_id: created.user_id, tenant_id: created.tenant_id,
					display_name: created.display_name, email: created.email,
					role: created.role, status: created.status,
				}});
			} catch (e) {
				return json({ ok: false, error: e instanceof Error ? e.message : "invalid input" }, 400);
			}
		}
		// Platform admin: revoke / reactivate / set-password for a user.
		// Ventures: internal companies growing inside the Engine (platform-admin only).
		// MVP: capture ideas, track stage. Each venture can later become a tenant.
		if (url.pathname === "/api/admin/ventures" && request.method === "GET") {
			const isAdmin = identity?.kind === "platform_admin" ||
				(identity?.kind === "session" && identity.role === "platform_admin");
			if (!isAdmin) return json({ ok: false, error: "Platform admin required" }, 403);
			const rows = await env.nwana_engine_db
				.prepare(`SELECT venture_id, name, kind, stage, summary, tenant_id, created_at, updated_at FROM ventures ORDER BY created_at ASC`)
				.all();
			return json({ ok: true, ventures: rows.results ?? [] });
		}
		if (url.pathname === "/api/admin/ventures" && request.method === "POST") {
			const isAdmin = identity?.kind === "platform_admin" ||
				(identity?.kind === "session" && identity.role === "platform_admin");
			if (!isAdmin) return json({ ok: false, error: "Platform admin required" }, 403);
			const body = (await request.json().catch(() => ({}))) as {
				venture_id?: string; name?: string; kind?: string; stage?: string; summary?: string;
			};
			const now = new Date().toISOString();
			const vid = (body.venture_id ?? "").trim();
			if (vid && (body as Record<string, unknown>).action === "delete") {
				await env.nwana_engine_db
					.prepare(`DELETE FROM ventures WHERE venture_id = ?`)
					.bind(vid)
					.run();
				return json({ ok: true, venture_id: vid, deleted: true });
			}
			if (vid && (body as Record<string, unknown>).action === "create-tenant") {
				// Idea becomes a company: create an isolated tenant and link it.
				const v = await env.nwana_engine_db
					.prepare(`SELECT venture_id, name, kind, tenant_id FROM ventures WHERE venture_id = ?`)
					.bind(vid)
					.first<{ venture_id: string; name: string; kind: string; tenant_id: string | null }>();
				if (!v) return json({ ok: false, error: "Venture not found" }, 404);
				if (v.tenant_id) return json({ ok: false, error: "Tenant already linked: " + v.tenant_id }, 400);
				const slug = v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || ("v" + Date.now().toString(36));
				try {
					await createTenant(env.nwana_engine_db, {
						tenant_id: slug,
						legal_name: v.name,
						display_name: v.name,
						organization_type: "commercial",
						sport_domain: "nordic-walking",
					});
				} catch (e) {
					return json({ ok: false, error: e instanceof Error ? e.message : "tenant creation failed" }, 400);
				}
				await env.nwana_engine_db
					.prepare(`UPDATE ventures SET tenant_id = ?, stage = 'active', updated_at = ? WHERE venture_id = ?`)
					.bind(slug, new Date().toISOString(), vid)
					.run();
				return json({ ok: true, venture_id: vid, tenant_id: slug });
			}
			if (vid) {
				// Update existing venture.
				const allowed = ["name", "kind", "stage", "summary"] as const;
				const sets: string[] = [];
				const vals: unknown[] = [];
				for (const k of allowed) {
					const v = (body as Record<string, unknown>)[k];
					if (typeof v === "string" && v.trim()) { sets.push(`${k} = ?`); vals.push(v.trim()); }
				}
				if (!sets.length) return json({ ok: false, error: "Nothing to update" }, 400);
				sets.push("updated_at = ?");
				vals.push(now, vid);
				await env.nwana_engine_db
					.prepare(`UPDATE ventures SET ${sets.join(", ")} WHERE venture_id = ?`)
					.bind(...vals)
					.run();
				return json({ ok: true, venture_id: vid, updated: true });
			}
			// Create new venture (idea).
			const name = (body.name ?? "").trim();
			if (!name) return json({ ok: false, error: "name is required" }, 400);
			const newId = "venture-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "venture-" + Date.now().toString(36);
			await env.nwana_engine_db
				.prepare(`INSERT INTO ventures (venture_id, name, kind, stage, summary, created_at, updated_at) VALUES (?, ?, ?, 'idea', ?, ?, ?)`)
				.bind(newId, name, (body.kind ?? "other").trim() || "other", (body.summary ?? "").trim(), now, now)
				.run();
			return json({ ok: true, venture_id: newId, created: true });
		}

		if (url.pathname.startsWith("/api/admin/users/") && request.method === "POST") {
			const isAdmin = identity?.kind === "platform_admin" ||
				(identity?.kind === "session" && identity.role === "platform_admin");
			if (!isAdmin) return json({ ok: false, error: "Platform admin required" }, 403);
			const rest = url.pathname.slice("/api/admin/users/".length).split("/").filter(Boolean);
			if (rest.length === 2) {
				const [userId, action] = rest;
				let body: Record<string, unknown> = {};
				try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }
				try {
					if (action === "revoke") {
						await revokeLoginUser(env.nwana_engine_db, userId);
						return json({ ok: true });
					}
					if (action === "reactivate") {
						await reactivateLoginUser(env.nwana_engine_db, userId);
						return json({ ok: true });
					}
					if (action === "password") {
						// Password arrives in the POST body, is hashed
						// server-side, and is never logged or returned.
						await setUserPassword(env.nwana_engine_db, userId, String(body.password ?? ""));
						return json({ ok: true });
					}
				} catch (e) {
					return json({ ok: false, error: e instanceof Error ? e.message : "invalid input" }, 400);
				}
			}
			return json({ ok: false, error: "unknown action" }, 404);
		}
		// Platform admin: tenant list for the user-management UI
		// (tenant selector on the create-user form).
		if (url.pathname === "/api/admin/tenants" && request.method === "GET") {
			const isAdmin = identity?.kind === "platform_admin" ||
				(identity?.kind === "session" && identity.role === "platform_admin");
			if (!isAdmin) return json({ ok: false, error: "Platform admin required" }, 403);
			const tenants = await listTenants(env.nwana_engine_db);
			return json({
				ok: true,
				tenants: tenants.map((t) => ({
					tenant_id: t.tenant_id,
					display_name: t.display_name,
					status: t.status,
				})),
			});
		}
		if (
			request.method === "GET" &&
			url.pathname.startsWith("/admin/organizations/")
		) {
			const rest = url.pathname.slice("/admin/organizations/".length);
			const parts = rest.split("/").filter((p) => p.length > 0);
			const validId = (p: string) => /^[a-z0-9][a-z0-9-]{1,60}$/.test(p);
			if (parts.length === 1 && validId(parts[0])) {
				const tenantId = parts[0];
				return htmlPage(() => renderTenantSectionHtml(tenantId));
			}
			if (parts.length === 2 && parts.every(validId)) {
				const tenantId = parts[0];
				const unitId = parts[1];
				return htmlPage(() => renderBusinessUnitSectionHtml(tenantId, unitId));
			}
		}

		// One-time bootstrap (2026-10-02): if no platform_admin login user
		// exists, /login offers a protected bootstrap path. Availability is
		// server-side. The owner key is NEVER typed into a browser: an
		// authorized internal process mints a single-use, short-lived grant
		// via /api/auth/bootstrap/begin (owner-key gated, internal use).
		// The grant token is entered in the /login bootstrap form with
		// email/password/display name. After first admin creation, bootstrap
		// closes permanently — every attempt re-checks server-side.
		if (request.method === "GET" && url.pathname === "/api/auth/bootstrap-status") {
			const closed = await bootstrapClosed(env.nwana_engine_db);
			return json({ ok: true, available: !closed });
		}
		// Internal: mint a single-use bootstrap grant. Owner-key gated.
		// Called by authorized tooling only — never from normal UX.
		if (request.method === "POST" && url.pathname === "/api/auth/bootstrap/begin") {
			const presented = extractOperatingCenterKey(request);
			if (!presented || !env.OPERATING_CENTER_KEY || !timingSafeEqual(presented, env.OPERATING_CENTER_KEY)) {
				return json({ ok: false, error: "unauthorized" }, 401);
			}
			try {
				const grant = await mintBootstrapGrant(env.nwana_engine_db);
				// The plaintext token is returned ONCE. Never log it.
				return json({ ok: true, grant_token: grant.grant_token, expires_at: grant.expires_at });
			} catch (e) {
				const msg = e instanceof Error ? e.message : "grant failed";
				const status = msg.includes("already exists") ? 403 : 400;
				return json({ ok: false, error: msg }, status);
			}
		}
		if (request.method === "POST" && url.pathname === "/api/auth/bootstrap") {
			let body: { email?: string; password?: string; display_name?: string; grant_token?: string };
			try {
				body = await request.json();
			} catch {
				return json({ ok: false, error: "Invalid request body" }, 400);
			}
			try {
				const created = await bootstrapFirstAdmin(
					env.nwana_engine_db,
					String(body.grant_token ?? ""),
					{
						email: String(body.email ?? ""),
						password: String(body.password ?? ""),
						display_name: String(body.display_name ?? ""),
					},
				);
				// Never return the password. Never log it.
				return json({
					ok: true,
					user: {
						email: created.email,
						display_name: created.display_name,
						role: created.role,
					},
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : "bootstrap failed";
				const status = msg.includes("already exists") ? 403 : 400;
				return json({ ok: false, error: msg }, status);
			}
		}

		// Unified login page (2026-10-02): one public Engine entry.
		if (request.method === "GET" && url.pathname === "/login") {
			return htmlPage(renderLoginHtml);
		}

		// Unified login (2026-10-02): email + password for all normal users.
		// POST /api/auth/login — verify credentials, mint HMAC session token.
		if (request.method === "POST" && url.pathname === "/api/auth/login") {
			let body: { email?: string; password?: string };
			try {
				body = await request.json();
			} catch {
				return json({ ok: false, error: "Invalid request body" }, 400);
			}
			const email = String(body.email ?? "").toLowerCase().trim();
			const password = String(body.password ?? "");
			if (!email || !password) {
				return json({ ok: false, error: "Email and password are required" }, 400);
			}
			const user = await findUserByEmail(env.nwana_engine_db, email);
			// Timing-safe-ish: always run verifyPassword to avoid user enumeration
			// via timing (verify against a dummy hash when user not found).
			const hashToCheck = user?.password_hash ?? "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
			const valid = await verifyPassword(password, hashToCheck);
			if (!user || !valid) {
				return json({ ok: false, error: "Invalid email or password" }, 401);
			}
			const hmacSecret = env.OPERATING_CENTER_KEY;
			if (!hmacSecret) {
				return json({ ok: false, error: "Authentication not configured" }, 500);
			}
			const { token, expires_at } = await createSessionToken(env.nwana_engine_db, hmacSecret, {
				user_id: user.user_id,
				email: user.email,
				role: user.role,
				tenant_id: user.tenant_id,
				display_name: user.display_name,
				unit_ids: user.unit_ids,
			});
			return json({
				ok: true,
				token,
				expires_at,
				user: {
					email: user.email,
					display_name: user.display_name,
					role: user.role,
					tenant_id: user.tenant_id,
				},
			});
		}

		// GET /api/auth/session — resolve the current session token.
		if (request.method === "GET" && url.pathname === "/api/auth/session") {
			const auth = request.headers.get("Authorization") ?? "";
			const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
			const hmacSecret = env.OPERATING_CENTER_KEY;
			if (!token || !hmacSecret) return json({ ok: false }, 401);
			const { verifySessionToken } = await import("./lib/tenant-access");
			const session = await verifySessionToken(env.nwana_engine_db, hmacSecret, token);
			if (!session) return json({ ok: false }, 401);
			// Tenant display name for tenant-aware branding (2026-10-02).
			let tenantName = session.tenant_id;
			try {
				const t = await env.nwana_engine_db
					.prepare(`SELECT display_name FROM tenants WHERE tenant_id = ?`)
					.bind(session.tenant_id)
					.first<{ display_name: string }>();
				if (t?.display_name) tenantName = t.display_name;
			} catch { /* keep tenant_id */ }
			return json({
				ok: true,
				user: {
					email: session.email,
					display_name: session.display_name,
					role: session.role,
					tenant_id: session.tenant_id,
					tenant_name: tenantName,
					unit_ids: session.unit_ids,
				},
				expires_at: session.expires_at,
			});
		}

		// ADR-0047 tenant portal pages: public shells (the access-key gate
		// is client-side); all data comes from the tenant-scoped
		// /api/portal/* routes. No OC menu, no Organizations directory,
		// no tenant ids in markup.
		if (request.method === "GET" && url.pathname === "/portal") {
			return htmlPage(renderPortalLandingHtml);
		}
		if (request.method === "GET" && url.pathname.startsWith("/portal/unit/")) {
			const portalUnitId = decodeURIComponent(
				url.pathname.slice("/portal/unit/".length),
			);
			if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(portalUnitId)) {
				return json({ ok: false, error: "not found" }, 404);
			}
			return htmlPage(() => renderPortalUnitHtml(portalUnitId));
		}

		// Retired standalone pages → 301 to their section tab (rebuild 2026-09-28).
		if (request.method === "GET") {
			const redirect301 = (target: string) =>
				Response.redirect(new URL(target, url).toString(), 301);
			const retired: Array<[string, string]> = [
				["/operating-center/results", "/operating-center/sport#results"],
				["/operating-center/funds", "/operating-center/growth#funds"],
				["/operating-center/media", "/operating-center/marketing?tab=media&view=summary"],
				["/operating-center/uploads", "/operating-center/board#uploads"],
				["/operating-center/sponsorship", "/operating-center/growth#sponsorship"],
				["/operating-center/activity", "/operating-center/operations#activity"],
				["/operating-center/sites", "/operating-center/marketing?tab=sites&view=summary"],
				["/operating-center/social", "/operating-center/marketing?tab=social&view=summary"],
				["/operating-center/ads", "/operating-center/marketing?tab=ads&view=summary"],
				["/operating-center/sellers", "/operating-center/growth#sellers"],
				["/operating-center/partners", "/operating-center/growth#partners"],
				["/operating-center/fundraising", "/operating-center/growth#fundraising"],
				["/operating-center/groups", "/operating-center/sport#groups"],
				["/operating-center/meetings", "/operating-center/board#meetings"],
				["/operating-center/creation", "/operating-center/sport#creation"],
			];
			for (const [from, to] of retired) {
				if (url.pathname === from) return redirect301(to);
			}
			// Per-object pages keep their query in location.search so the
			// inline Media review / Creation packet detail can read it.
			if (url.pathname === "/operating-center/news/review")
				return redirect301("/operating-center/marketing?tab=media&view=actions" + (url.search ? "&" + url.search.slice(1) : ""));
			if (url.pathname === "/operating-center/creation/packet")
				return redirect301("/operating-center/sport?tab=creation&view=actions" + (url.search ? "&" + url.search.slice(1) : ""));
		}



		// ADR-0027: overview APIs for the seven new screens.
		// ADR-0028: meetings overview.
		if (request.method === "GET" && url.pathname === "/api/operating-center/sites/overview") {
			return json(getSitesOverview());
		}
		// ADR-0033: GA4 read-only traffic overview (owner key required by the
		// operatingCenterApiRoute gate above). One Data API request per call.
		if (request.method === "GET" && url.pathname === "/api/operating-center/analytics/traffic") {
			return json(await getGa4TrafficOverview(env));
		}
		// GA4 canonical audience report (owner key required by the
		// operatingCenterApiRoute gate above). On-demand runReport reads only;
		// no cron, no D1 writes, no token exposure.
		if (request.method === "GET" && url.pathname === "/api/operating-center/analytics/audience") {
			const presetParam = url.searchParams.get("preset");
			const preset: Ga4DatePreset | undefined = GA4_DATE_PRESETS.includes(presetParam as Ga4DatePreset)
				? (presetParam as Ga4DatePreset)
				: undefined;
			const datePattern = /^\d{4}-\d{2}-\d{2}$/;
			const startParam = url.searchParams.get("start");
			const endParam = url.searchParams.get("end");
			const start = startParam && datePattern.test(startParam) ? startParam : undefined;
			const end = endParam && datePattern.test(endParam) ? endParam : undefined;
			return json(await getGa4AudienceReport(env, {
				preset,
				startDate: start && end ? start : undefined,
				endDate: start && end ? end : undefined,
				comparePrior: url.searchParams.get("compare") === "1",
			}));
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/social/overview") {
			// Live Meta read path: with start/end (or live=1) the route returns
			// live per-destination metrics from the production Meta integration
			// via getMetaSocialOverview (failure-isolated per destination).
			// Without params it keeps the legacy static summary the Operating
			// Center Marketing screen consumes. Owner-key gated by the
			// operatingCenterApiRoute gate above.
			const liveStart = url.searchParams.get("start");
			const liveEnd = url.searchParams.get("end");
			const liveFlag = url.searchParams.get("live");
			if (liveStart || liveEnd || liveFlag) {
				return json(await getMetaSocialOverview(env, {
					startDate: liveStart ?? undefined,
					endDate: liveEnd ?? undefined,
				}));
			}
			return json(getSocialOverview());
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/social/youtube") {
			// Live YouTube channel statistics (subscribers, total views, video
			// count) via the production YouTube OAuth integration.
			// Owner-key gated by the operatingCenterApiRoute gate above.
			return json(await getYouTubeChannelMetrics(env));
		}
		// Manual last mile distribution packs: read-only, owner-key gated by
		// the operatingCenterApiRoute gate above. Builds copy-ready packs
		// for one creation packet — or, with type=news_item, for an existing
		// news item identified by its canonical URL (no packet id needed,
		// nothing is recreated). Nothing is published anywhere.
		if (request.method === "GET" && url.pathname === "/api/operating-center/distribution/packs") {
			return json(
				await getDistributionPacks(env.nwana_engine_db, {
					id: url.searchParams.get("id"),
					type: url.searchParams.get("type"),
					channel: url.searchParams.get("channel"),
					title: url.searchParams.get("title"),
					description: url.searchParams.get("description"),
					canonical_url: url.searchParams.get("canonical_url"),
					news_kind: url.searchParams.get("news_kind"),
					person_name: url.searchParams.get("person_name"),
					person_profile_url: url.searchParams.get("person_profile_url"),
					achievement: url.searchParams.get("achievement"),
					news_date: url.searchParams.get("news_date"),
				}),
			);
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/ads/overview") {
			return json(await getAdsOverview(env));
		}
		// Parameterized live Google Ads metrics (canonical metrics layer).
		// Owner-key gated by the operatingCenterApiRoute gate above.
		// Read-only: one GAQL request per breakdown, no mutations, no D1
		// writes, on-demand only. Accepts explicit start/end (YYYY-MM-DD) or
		// preset=last7|last30|mtd. No developer token required (sunset
		// 2026-09-09): auth is OAuth via the Cloud project owning the client.
		if (request.method === "GET" && url.pathname === "/api/operating-center/ads/metrics") {
			const datePattern = /^\d{4}-\d{2}-\d{2}$/;
			const toDate = (value: string): string => value.slice(0, 10);
			const shiftDays = (date: string, days: number): string => {
				const [year, month, day] = date.split("-").map(Number);
				const shifted = new Date(Date.UTC(year, month - 1, day));
				shifted.setUTCDate(shifted.getUTCDate() + days);
				return toDate(shifted.toISOString());
			};
			const today = toDate(new Date().toISOString());
			const yesterday = shiftDays(today, -1);
			let start = url.searchParams.get("start") ?? "";
			let end = url.searchParams.get("end") ?? "";
			const preset = url.searchParams.get("preset");
			if (!start && !end && preset) {
				if (preset === "last7") {
					start = shiftDays(yesterday, -6);
					end = yesterday;
				} else if (preset === "last30") {
					start = shiftDays(yesterday, -29);
					end = yesterday;
				} else if (preset === "mtd") {
					start = `${today.slice(0, 7)}-01`;
					end = yesterday;
					if (start > end) start = end;
				} else {
					return json({ ok: false, error: "preset must be last7, last30, or mtd" }, 400);
				}
			}
			if (!datePattern.test(start) || !datePattern.test(end) || start > end) {
				return json({ ok: false, error: "start and end must be YYYY-MM-DD with start <= end (or use preset=last7|last30|mtd)" }, 400);
			}
			const customerId = url.searchParams.get("customer") ?? undefined;
			return json(await getGoogleAdsMetrics(env, { customerId, startDate: start, endDate: end }));
		}
		// Sponsor-safe audience export (canonical metrics layer + live
		// adapters). Owner-key gated by the operatingCenterApiRoute gate
		// above. Read-only apart from audience_metrics cache writes.
		// One live fetch per source with failure isolation: a broken source
		// marks only its own section STALE / failure quality, never the
		// whole export. Query params: start/end (YYYY-MM-DD, default last
		// 30 full days), geography=US|NA|global, source=ga4|google_ads|
		// facebook|instagram|youtube|runsignup.
		if (request.method === "GET" && url.pathname === "/api/operating-center/export/audience") {
			const datePattern = /^\d{4}-\d{2}-\d{2}$/;
			const defaults = defaultExportPeriod();
			let start = url.searchParams.get("start") ?? "";
			let end = url.searchParams.get("end") ?? "";
			if (!start || !end) {
				start = defaults.startDate;
				end = defaults.endDate;
			}
			if (!datePattern.test(start) || !datePattern.test(end) || start > end) {
				return json({ ok: false, error: "start and end must be YYYY-MM-DD with start <= end" }, 400);
			}
			const geographyParam = url.searchParams.get("geography");
			const geography =
				geographyParam === "US" || geographyParam === "NA" || geographyParam === "global"
					? geographyParam
					: null;
			const sourceParam = url.searchParams.get("source");
			const knownSources = ["ga4", "google_ads", "facebook", "instagram", "youtube", "runsignup"];
			if (sourceParam !== null && !knownSources.includes(sourceParam)) {
				return json({ ok: false, error: `source must be one of ${knownSources.join("|")}` }, 400);
			}
			return json(
				await buildAudienceExport(
					env as AudienceExportEnv,
					{ startDate: start, endDate: end, geography, source: sourceParam },
					liveAudienceAdapters,
				),
			);
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/sellers/overview") {
			try {
				return json(await getSellersOverview(env.nwana_engine_db));
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Sellers overview failed" }, 500);
			}
		}
		if (request.method === "POST" && url.pathname === "/api/operating-center/sellers/stage") {
			try {
				const body = await request.json() as { seller_id?: string; to_stage?: string };
				if (!body.seller_id || !body.to_stage) {
					return json({ ok: false, error: "seller_id and to_stage are required" }, 400);
				}
				const result = await updateSellerStage(env.nwana_engine_db, body.seller_id, body.to_stage);
				if (!result.ok) {
					return json(result, 400);
				}
				return json(result);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Seller stage update failed" }, 500);
			}
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/partners/overview") {
			try {
				return json(await getPartnersOverview(env.nwana_engine_db));
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Partners overview failed" }, 500);
			}
		}
		if (request.method === "POST" && url.pathname === "/api/operating-center/partners/stage") {
			try {
				const body = await request.json() as { partner_id?: string; to_stage?: string };
				if (!body.partner_id || !body.to_stage) {
					return json({ ok: false, error: "partner_id and to_stage are required" }, 400);
				}
				const result = await updatePartnerStage(env.nwana_engine_db, body.partner_id, body.to_stage);
				if (!result.ok) {
					return json(result, 400);
				}
				return json(result);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Partner stage update failed" }, 500);
			}
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
		if (request.method === "GET" && url.pathname === "/api/operating-center/money/overview") {
			const tid = identity?.kind === "session" ? identity.tenant_id : "nwana";
			return json(await getExecutiveMoneyView(env.nwana_engine_db, tid));
		}
		// Personal ideas: each user has their own ideas (2026-10-02).
		// Ideas can be promoted to tenants.
		if (url.pathname === "/api/my/ideas" && request.method === "GET") {
			if (identity?.kind !== "session") return json({ ok: false, error: "Unauthorized" }, 401);
			const rows = await env.nwana_engine_db
				.prepare(`SELECT idea_id, name, summary, stage, tenant_id, created_at FROM user_ideas WHERE user_id = ? ORDER BY created_at DESC`)
				.bind(identity.user_id)
				.all();
			return json({ ok: true, ideas: rows.results ?? [] });
		}
		if (url.pathname === "/api/my/ideas" && request.method === "POST") {
			if (identity?.kind !== "session") return json({ ok: false, error: "Unauthorized" }, 401);
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			const name = String(body.name || "").trim();
			if (!name) return json({ ok: false, error: "Name required" }, 400);
			const idea_id = "idea-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
			await env.nwana_engine_db
				.prepare(`INSERT INTO user_ideas (idea_id, user_id, name, summary, stage) VALUES (?, ?, ?, ?, 'idea')`)
				.bind(idea_id, identity.user_id, name, String(body.summary || ""))
				.run();
			return json({ ok: true, idea_id });
		}
		// Promote idea to tenant
		if (url.pathname.startsWith("/api/my/ideas/") && url.pathname.endsWith("/promote") && request.method === "POST") {
			if (identity?.kind !== "session") return json({ ok: false, error: "Unauthorized" }, 401);
			const idea_id = url.pathname.slice("/api/my/ideas/".length, -"/promote".length);
			const idea = await env.nwana_engine_db
				.prepare(`SELECT idea_id, name, summary, tenant_id FROM user_ideas WHERE idea_id = ? AND user_id = ?`)
				.bind(idea_id, identity.user_id)
				.first<{ idea_id: string; name: string; summary: string; tenant_id: string | null }>();
			if (!idea) return json({ ok: false, error: "Not found" }, 404);
			if (idea.tenant_id) return json({ ok: false, error: "Already a tenant" }, 400);
			// Create tenant from idea
			const tenant_id = idea.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
			await env.nwana_engine_db
				.prepare(`INSERT INTO tenants (tenant_id, display_name, legal_name, organization_type, sport_domain, status) VALUES (?, ?, ?, 'commercial', 'nordic-walking', 'active')`)
				.bind(tenant_id, idea.name, idea.name)
				.run();
			await env.nwana_engine_db
				.prepare(`UPDATE user_ideas SET tenant_id = ?, stage = 'tenant', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE idea_id = ?`)
				.bind(tenant_id, idea_id)
				.run();
			return json({ ok: true, tenant_id });
		}
		// Team management for user's tenants (2026-10-02).
		// GET /api/my/tenants/:id/users — list team
		// POST /api/my/tenants/:id/users — add member {email, role}
		if (url.pathname.match(/^\/api\/my\/tenants\/[^/]+\/users$/) && (request.method === "GET" || request.method === "POST")) {
			if (identity?.kind !== "session") return json({ ok: false, error: "Unauthorized" }, 401);
			const m = url.pathname.match(/^\/api\/my\/tenants\/([^/]+)\/users$/);
			const tenant_id = decodeURIComponent(m![1]);
			// Verify user can manage this tenant: platform admin, or owns via session/ideas
			const isPlatform = identity.role === "platform_admin";
			let canManage = isPlatform || identity.tenant_id === tenant_id;
			if (!canManage) {
				const own = await env.nwana_engine_db
					.prepare(`SELECT 1 FROM user_ideas WHERE user_id = ? AND tenant_id = ? LIMIT 1`)
					.bind(identity.user_id, tenant_id)
					.first();
				canManage = !!own;
			}
			if (!canManage) return json({ ok: false, error: "Not your project" }, 403);
			if (request.method === "GET") {
				const rows = await env.nwana_engine_db
					.prepare(`SELECT user_id, display_name, email, role, status FROM tenant_users WHERE tenant_id = ? ORDER BY display_name`)
					.bind(tenant_id)
				.all<{ user_id: string; display_name: string; email: string; role: string; status: string }>();
				return json({ ok: true, users: rows.results ?? [] });
			}
			// POST: add member (they must already have a user account; owner invites by email)
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			const email = String(body.email || "").trim().toLowerCase();
			const role = String(body.role || "business_unit_user");
			if (!email) return json({ ok: false, error: "Email required" }, 400);
			if (!["tenant_admin", "business_unit_user"].includes(role)) return json({ ok: false, error: "Invalid role" }, 400);
			// Find existing user by email, or create a placeholder invite
			const existing = await env.nwana_engine_db
				.prepare(`SELECT user_id, tenant_id FROM tenant_users WHERE email = ? LIMIT 1`)
				.bind(email)
				.first<{ user_id: string; tenant_id: string }>();
			if (existing) {
				// Move/add to this tenant: update their tenant_id and role
				await env.nwana_engine_db
					.prepare(`UPDATE tenant_users SET tenant_id = ?, role = ? WHERE user_id = ?`)
					.bind(tenant_id, role, existing.user_id)
					.run();
				return json({ ok: true, user_id: existing.user_id });
			}
			return json({ ok: false, error: "No user with this email. They need to register first." }, 404);
		}
		// My Projects: tenants accessible to the current user (2026-10-02).
		// Includes session tenant + tenants from user's promoted ideas.
		if (url.pathname === "/api/my/tenants" && request.method === "GET") {
			const isPlatform = identity?.kind === "platform_admin" ||
				(identity?.kind === "session" && identity.role === "platform_admin");
			let rows;
			if (isPlatform) {
				rows = await env.nwana_engine_db
					.prepare(`SELECT tenant_id, display_name, status FROM tenants ORDER BY display_name`)
					.all();
			} else if (identity?.kind === "session") {
				// Own session tenant + tenants from promoted ideas
				rows = await env.nwana_engine_db
					.prepare(`SELECT DISTINCT t.tenant_id, t.display_name, t.status FROM tenants t
						LEFT JOIN user_ideas ui ON ui.tenant_id = t.tenant_id AND ui.user_id = ?
						WHERE t.tenant_id = ? OR ui.tenant_id IS NOT NULL
						ORDER BY t.display_name`)
					.bind(identity.user_id, identity.tenant_id)
					.all();
			} else {
				return json({ ok: false, error: "Unauthorized" }, 401);
			}
			return json({ ok: true, tenants: rows.results ?? [] });
		}
		// Venture info for the workspace (2026-10-02): the idea behind this tenant.
		if (url.pathname === "/api/operating-center/venture" && request.method === "GET") {
			const tid = identity?.kind === "session" ? identity.tenant_id : "nwana";
			const v = await env.nwana_engine_db
				.prepare(`SELECT venture_id, name, kind, stage, summary, created_at FROM ventures WHERE tenant_id = ? LIMIT 1`)
				.bind(tid)
				.first();
			return json({ ok: true, venture: v ?? null });
		}
		// Phase 1 Money Ingestion (Revenue Engine v1): canonical monetary
		// read paths. ADR-0044: downstream reads D1; these routes never
		// touch RunSignup. Owner-key gated by the general
		// operatingCenterApiRoute check above.
		if (request.method === "GET" && url.pathname === "/api/operating-center/money/events") {
			const eventType = url.searchParams.get("event_type") ?? undefined;
			const limit = Number(url.searchParams.get("limit") ?? "50");
			return json({
				ok: true,
				events: await listMoneyEvents(env.nwana_engine_db, { eventType, limit }),
			});
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/money/transactions") {
			const lifecycleState = url.searchParams.get("lifecycle_state") ?? undefined;
			const limit = Number(url.searchParams.get("limit") ?? "50");
			return json({
				ok: true,
				transactions: await listMoneyTransactions(env.nwana_engine_db, {
					lifecycleState,
					limit,
				}),
			});
		}
		if (request.method === "GET" && url.pathname === "/api/operating-center/money/sync-state") {
			return json({ ok: true, sync: await getMoneySyncState(env.nwana_engine_db) });
		}
		// Phase 1 Money Ingestion: explicit sync trigger. This is the
		// allowed start per the OPERATING_PLAN trigger rule (owner action
		// in Engine) — there is intentionally no cron polling the source.
		// Idempotent: re-running against unchanged source data ingests
		// zero new canonical events.
		if (request.method === "POST" && url.pathname === "/api/operating-center/money/sync") {
			const result = await syncRunSignupDonations(
				env.nwana_engine_db,
				env.RUNSIGNUP_ACCESS_TOKEN,
			);
			return json(result, result.ok ? 200 : 502);
		}
		// Phase 1 Money Ingestion: explicit, bounded reconciliation of
		// already-canonicalized donations (e.g. refund detection on old
		// donations, invisible to incremental ingestion by design). Separate
		// from normal ingestion: never advances the sync cursor, never
		// widens its own scope. Body: { donation_ids: [...], reason?: str }.
		if (request.method === "POST" && url.pathname === "/api/operating-center/money/reconcile") {
			let body: { donation_ids?: unknown; reason?: unknown } = {};
			try {
				body = (await request.json()) as typeof body;
			} catch {
				body = {};
			}
			const donationIds = Array.isArray(body.donation_ids) ? body.donation_ids : [];
			const result = await reconcileRunSignupDonations(
				env.nwana_engine_db,
				env.RUNSIGNUP_ACCESS_TOKEN,
				{ donationIds, reason: typeof body.reason === "string" ? body.reason : undefined },
			);
			return json(result, result.ok ? 200 : 502);
		}
		// Monetary coverage: incremental sync of PAID race registrations for
		// one race. Explicit, bounded, owner-gated. Body: { race_id,
		// event_ids?: [...], page_size?: n, max_pages?: n }.
		if (request.method === "POST" && url.pathname === "/api/operating-center/money/sync-registrations") {
			let body: { race_id?: unknown; event_ids?: unknown; page_size?: unknown; max_pages?: unknown } = {};
			try {
				body = (await request.json()) as typeof body;
			} catch {
				body = {};
			}
			const eventIds = Array.isArray(body.event_ids)
				? body.event_ids.filter((v): v is number => Number.isInteger(v))
				: undefined;
			const result = await syncRunSignupRegistrations(
				env.nwana_engine_db,
				env.RUNSIGNUP_ACCESS_TOKEN,
				{
					raceId: Number(body.race_id),
					eventIds,
					pageSize: typeof body.page_size === "number" ? body.page_size : undefined,
					maxPages: typeof body.max_pages === "number" ? body.max_pages : undefined,
				},
			);
			return json(result, result.ok ? 200 : 502);
		}
		// MemberOrg membership sync (2026-10-01): documented
		// GET /rest/club/:club_id/members. Ingests every membership (paid and
		// $0) as license_purchased events; $0 records create $0-gross events
		// (existence preserved, revenue unaffected). Idempotent; owner-gated.
		// Body: { club_id }.
		if (request.method === "POST" && url.pathname === "/api/operating-center/money/sync-memberorg") {
			let body: { club_id?: unknown } = {};
			try {
				body = (await request.json()) as typeof body;
			} catch {
				body = {};
			}
			const result = await syncMemberOrgMemberships(
				env.nwana_engine_db,
				env.RUNSIGNUP_ACCESS_TOKEN,
				{ clubId: String(body.club_id ?? "") },
			);
			return json(result, result.ok ? 200 : 502);
		}
		// Monetary coverage: controlled historical backfill for one race and
		// one kind. Bounded per call, resumable, idempotent; tracks progress
		// under {sourceKey}:backfill and NEVER writes the incremental cursor.
		// Explicit, owner-gated. Body: { kind: "donations"|"registrations",
		// race_id, event_ids?: [...], page_size?: n, max_pages?: n }.
		if (request.method === "POST" && url.pathname === "/api/operating-center/money/backfill") {
			let body: { kind?: unknown; race_id?: unknown; event_ids?: unknown; page_size?: unknown; max_pages?: unknown } = {};
			try {
				body = (await request.json()) as typeof body;
			} catch {
				body = {};
			}
			const kind = body.kind === "registrations" ? "registrations" : "donations";
			const eventIds = Array.isArray(body.event_ids)
				? body.event_ids.filter((v): v is number => Number.isInteger(v))
				: undefined;
			const pageSize = typeof body.page_size === "number" ? body.page_size : undefined;
			const maxPages = typeof body.max_pages === "number" ? body.max_pages : undefined;
			const result =
				kind === "registrations"
					? await backfillRunSignupRegistrations(env.nwana_engine_db, env.RUNSIGNUP_ACCESS_TOKEN, {
							raceId: Number(body.race_id), eventIds, pageSize, maxPages,
						})
					: await backfillRunSignupDonations(env.nwana_engine_db, env.RUNSIGNUP_ACCESS_TOKEN, {
							raceId: Number(body.race_id), pageSize, maxPages,
						});
			return json(result, result.ok ? 200 : 502);
		}
		// Phase 1 Money Ingestion: diagnostic — inspect the live shape of one
		// donation record. Returns field names plus allowlisted non-PII
		// scalars only; the record's `user` object (donor PII) is never
		// read, returned, or logged. Explicit, bounded, owner-gated.
		if (
			request.method === "GET" &&
			url.pathname === "/api/operating-center/money/diagnostics/donation-record"
		) {
			const donationId = url.searchParams.get("donation_id") ?? "";
			return json(
				await inspectDonationRecordShape(env.RUNSIGNUP_ACCESS_TOKEN, donationId),
			);
		}


		// Phase 2 Executable Revenue Inventory (Revenue Engine v1): canonical
		// inventory of every revenue-producing object. Money metrics derive
		// from canonical money_events at read time (never duplicated here).
		// Owner-key gated by the general operatingCenterApiRoute check above.
		if (request.method === "GET" && url.pathname === "/api/operating-center/revenue/inventory") {
			const objectType = url.searchParams.get("object_type") ?? undefined;
			const revenueSystem = url.searchParams.get("revenue_system") ?? undefined;
			if (
				(objectType && !(REVENUE_OBJECT_TYPES as readonly string[]).includes(objectType)) ||
				(revenueSystem && !(REVENUE_SYSTEMS as readonly string[]).includes(revenueSystem))
			) {
				return json({ ok: false, error: "invalid object_type or revenue_system" }, 400);
			}
			return json({
				ok: true,
				objects: await listRevenueObjects(env.nwana_engine_db, {
					object_type: objectType as never,
					revenue_system: revenueSystem as never,
				}),
			});
		}
		if (
			request.method === "GET" &&
			url.pathname.startsWith("/api/operating-center/revenue/inventory/")
		) {
			const objectKey = decodeURIComponent(
				url.pathname.slice("/api/operating-center/revenue/inventory/".length),
			);
			if (!objectKey || objectKey.includes("/")) {
				return json({ ok: false, error: "invalid object_key" }, 400);
			}
			const obj = await getRevenueObject(env.nwana_engine_db, objectKey);
			if (!obj) return json({ ok: false, error: "not found" }, 404);
			return json({ ok: true, object: obj });
		}
		// Phase 2: record a next-action transition. The inventory drives
		// actions: every transition updates next_revenue_action /
		// action_status and appends to the append-only action history.
		// Body: { action: string, status: pending|in_progress|done|blocked|none, note?: string }.
		if (
			request.method === "POST" &&
			url.pathname.startsWith("/api/operating-center/revenue/inventory/") &&
			url.pathname.endsWith("/action")
		) {
			const prefix = "/api/operating-center/revenue/inventory/";
			const objectKey = decodeURIComponent(
				url.pathname.slice(prefix.length, -"/action".length),
			);
			if (!objectKey || objectKey.includes("/")) {
				return json({ ok: false, error: "invalid object_key" }, 400);
			}
			let body: { action?: unknown; status?: unknown; note?: unknown } = {};
			try {
				body = (await request.json()) as typeof body;
			} catch {
				body = {};
			}
			const action = typeof body.action === "string" ? body.action : "";
			const status = typeof body.status === "string" ? body.status : "";
			if (!action || !(ACTION_STATUSES as readonly string[]).includes(status)) {
				return json({ ok: false, error: "action and valid status required" }, 400);
			}
			const updated = await recordRevenueAction(env.nwana_engine_db, objectKey, {
				action,
				status: status as (typeof ACTION_STATUSES)[number],
				note: typeof body.note === "string" ? body.note : undefined,
			});
			if (!updated) return json({ ok: false, error: "not found" }, 404);
			return json({ ok: true, object: updated });
		}

		// ADR-0046 Multi-tenant layer: tenants + business units.
		// Owner-key gated by the general operatingCenterApiRoute check above.
		// Every read is tenant-scoped: there is no unscoped business-unit
		// list, and a unit of another tenant reads as 404 (indistinguishable
		// from not-found by design).
		const TENANT_ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
		if (request.method === "GET" && url.pathname === "/api/operating-center/tenants") {
			const tenants = await listTenants(env.nwana_engine_db);
			const withCounts = [];
			for (const t of tenants) {
				withCounts.push({
					...t,
					business_unit_count: (await listBusinessUnits(env.nwana_engine_db, t.tenant_id)).length,
				});
			}
			return json({ ok: true, tenants: withCounts });
		}
		if (
			(request.method === "GET" || request.method === "POST") &&
			url.pathname.startsWith("/api/operating-center/tenants/")
		) {
			const rest = url.pathname.slice("/api/operating-center/tenants/".length);
			const parts = rest.split("/").filter((p) => p.length > 0);
			const tenantId = parts[0] ?? "";
			if (!TENANT_ID_RE.test(tenantId)) {
				return json({ ok: false, error: "invalid tenant_id" }, 400);
			}
			// GET /tenants/:id/units/:unitId — full business-unit screen model.
			if (
				request.method === "GET" &&
				parts.length === 3 &&
				parts[1] === "units" &&
				TENANT_ID_RE.test(parts[2])
			) {
				const unit = await getBusinessUnitDetail(env.nwana_engine_db, tenantId, parts[2]);
				if (!unit) return json({ ok: false, error: "not found" }, 404);
				return json({ ok: true, unit });
			}
			// POST /tenants/:id/units — enable a business unit on the tenant.
			if (request.method === "POST" && parts.length === 2 && parts[1] === "units") {
				let body: Record<string, unknown> = {};
				try {
					body = (await request.json()) as Record<string, unknown>;
				} catch {
					body = {};
				}
				try {
					const unit = await createBusinessUnit(env.nwana_engine_db, tenantId, {
						business_unit_id: String(body.business_unit_id ?? ""),
						unit_type: String(body.unit_type ?? ""),
						name: String(body.name ?? ""),
						operating_status: (typeof body.operating_status === "string"
							? body.operating_status
							: undefined) as never,
						legal_entity_status: (typeof body.legal_entity_status === "string"
							? body.legal_entity_status
							: undefined) as never,
						owner_legal_ref: typeof body.owner_legal_ref === "string" ? body.owner_legal_ref : null,
						revenue_model: typeof body.revenue_model === "string" ? body.revenue_model : null,
						connected_assets: Array.isArray(body.connected_assets)
							? body.connected_assets.filter((x): x is string => typeof x === "string")
							: [],
						next_actions: Array.isArray(body.next_actions)
							? body.next_actions.filter((x): x is string => typeof x === "string")
							: [],
					});
					return json({ ok: true, unit });
				} catch (e) {
					return json({ ok: false, error: e instanceof Error ? e.message : "invalid input" }, 400);
				}
			}
			// ADR-0047: tenant users (scoped access tokens).
			// GET /tenants/:id/users — list users; token hashes never leave the server.
			if (request.method === "GET" && parts.length === 2 && parts[1] === "users") {
				try {
					const users = await listTenantUsers(env.nwana_engine_db, tenantId);
					return json({ ok: true, users });
				} catch (e) {
					return json({ ok: false, error: e instanceof Error ? e.message : "invalid" }, 400);
				}
			}
			// POST /tenants/:id/users — create a tenant user with an explicit
			// business-unit allowlist. Returns the access token ONCE; only
			// its hash is stored.
			if (request.method === "POST" && parts.length === 2 && parts[1] === "users") {
				let body: Record<string, unknown> = {};
				try {
					body = (await request.json()) as Record<string, unknown>;
				} catch {
					body = {};
				}
				try {
					const created = await createTenantUser(env.nwana_engine_db, tenantId, {
						display_name: String(body.display_name ?? ""),
						unit_ids: Array.isArray(body.unit_ids)
							? body.unit_ids.filter((x): x is string => typeof x === "string")
							: [],
						note: typeof body.note === "string" ? body.note : null,
					});
					return json({ ok: true, user: created.user, token: created.token });
				} catch (e) {
					return json({ ok: false, error: e instanceof Error ? e.message : "invalid input" }, 400);
				}
			}
			// POST /tenants/:id/users/login — create a user with email/password
			// (unified auth). Platform-admin only. Password is hashed; the
			// plaintext is never stored or returned.
			if (request.method === "POST" && parts.length === 3 && parts[1] === "users" && parts[2] === "login") {
				let body: Record<string, unknown> = {};
				try {
					body = (await request.json()) as Record<string, unknown>;
				} catch {
					body = {};
				}
				try {
					const created = await createLoginUser(env.nwana_engine_db, tenantId, {
						email: String(body.email ?? ""),
						password: String(body.password ?? ""),
						display_name: String(body.display_name ?? ""),
						role: String(body.role ?? "business_unit_user") as import("./lib/tenant-access").UserRole,
						unit_ids: Array.isArray(body.unit_ids)
							? body.unit_ids.filter((x): x is string => typeof x === "string")
							: [],
						note: typeof body.note === "string" ? body.note : null,
					});
					return json({ ok: true, user: created });
				} catch (e) {
					return json({ ok: false, error: e instanceof Error ? e.message : "invalid input" }, 400);
				}
			}
			// POST /tenants/:id/users/:userId/revoke
			if (
				request.method === "POST" &&
				parts.length === 4 &&
				parts[1] === "users" &&
				parts[3] === "revoke" &&
				/^[0-9a-fA-F-]{1,64}$/.test(parts[2])
			) {
				const revoked = await revokeTenantUser(env.nwana_engine_db, tenantId, parts[2]);
				if (!revoked) return json({ ok: false, error: "not found" }, 404);
				return json({ ok: true, revoked: true });
			}
			// ADR-0048: platform-admin "Preview as Tenant".
			// POST /tenants/:id/preview — mint a short-lived, read-only,
			// stateless preview token covering ALL of the tenant's business
			// units (what a fully-licensed tenant user sees). No DB write,
			// no synthetic users. The OC client opens
			// /portal#preview=<token> — no manual token handling.
			if (request.method === "POST" && parts.length === 2 && parts[1] === "preview") {
				try {
					const p = await createPreviewToken(
						env.nwana_engine_db,
						env.OPERATING_CENTER_KEY ?? "",
						tenantId,
					);
					return json({
						ok: true,
						preview_token: p.token,
						tenant_id: p.tenant_id,
						unit_ids: p.unit_ids,
						expires_at: p.expires_at,
					});
				} catch (e) {
					return json({ ok: false, error: e instanceof Error ? e.message : "invalid" }, 400);
				}
			}
			// POST /tenants/:id/units/:unitId/preview — "Preview as client"
			// for one business unit.
			if (
				request.method === "POST" &&
				parts.length === 4 &&
				parts[1] === "units" &&
				parts[3] === "preview" &&
				TENANT_ID_RE.test(parts[2])
			) {
				try {
					const p = await createPreviewToken(
						env.nwana_engine_db,
						env.OPERATING_CENTER_KEY ?? "",
						tenantId,
						[parts[2]],
					);
					return json({
						ok: true,
						preview_token: p.token,
						tenant_id: p.tenant_id,
						unit_ids: p.unit_ids,
						expires_at: p.expires_at,
					});
				} catch (e) {
					return json({ ok: false, error: e instanceof Error ? e.message : "invalid" }, 400);
				}
			}
			// GET /tenants/:id — tenant with business units derived at read time.
			if (request.method === "GET" && parts.length === 1) {
				const tenant = await getTenant(env.nwana_engine_db, tenantId);
				if (!tenant) return json({ ok: false, error: "not found" }, 404);
				return json({ ok: true, tenant });
			}
			return json({ ok: false, error: "not found" }, 404);
		}
		// POST /api/operating-center/tenants — create a tenant (generic path,
		// no sport-specific architecture required).
		if (request.method === "POST" && url.pathname === "/api/operating-center/tenants") {
			let body: Record<string, unknown> = {};
			try {
				body = (await request.json()) as Record<string, unknown>;
			} catch {
				body = {};
			}
			try {
				const tenant = await createTenant(env.nwana_engine_db, {
					tenant_id: String(body.tenant_id ?? ""),
					legal_name: String(body.legal_name ?? ""),
					display_name: String(body.display_name ?? ""),
					organization_type:
						typeof body.organization_type === "string" ? body.organization_type : undefined,
					sport_domain: typeof body.sport_domain === "string" ? body.sport_domain : null,
					status: (typeof body.status === "string" ? body.status : undefined) as never,
					plan_license_status: (typeof body.plan_license_status === "string"
						? body.plan_license_status
						: undefined) as never,
					enabled_modules: Array.isArray(body.enabled_modules)
						? body.enabled_modules.filter((x): x is string => typeof x === "string")
						: [],
					license_start: typeof body.license_start === "string" ? body.license_start : null,
					license_end: typeof body.license_end === "string" ? body.license_end : null,
					billing_model: typeof body.billing_model === "string" ? body.billing_model : null,
					white_label: body.white_label === true,
				});
				return json({ ok: true, tenant });
			} catch (e) {
				return json({ ok: false, error: e instanceof Error ? e.message : "invalid input" }, 400);
			}
		}

		// ADR-0047 tenant portal API. Tenant-user only (prefix-gated above):
		// the tenant comes from the token, never from the URL, so
		// cross-tenant access is impossible by construction. A unit outside
		// the user's allowlist — or in another tenant — reads as 404,
		// indistinguishable from not-found by design. No tenant ids or
		// other internal terms in responses.
		if (request.method === "GET" && url.pathname === "/api/portal/session") {
			if (!tenantIdentity) return json({ ok: false, error: "forbidden" }, 403);
			return json({
				ok: true,
				session: await getPortalSession(env.nwana_engine_db, tenantIdentity),
			});
		}
		if (request.method === "GET" && url.pathname.startsWith("/api/portal/units/")) {
			if (!tenantIdentity) return json({ ok: false, error: "forbidden" }, 403);
			const portalUnitId = decodeURIComponent(
				url.pathname.slice("/api/portal/units/".length),
			);
			if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(portalUnitId)) {
				return json({ ok: false, error: "not found" }, 404);
			}
			const unit = await getPortalUnit(env.nwana_engine_db, tenantIdentity, portalUnitId);
			if (!unit) return json({ ok: false, error: "not found" }, 404);
			return json({ ok: true, unit });
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
					const data = await getSellersOverview(env.nwana_engine_db);
					return reportFile(buildSellersReport(data), screen, data.generated_at.slice(0, 10));
				}
				if (screen === "partners") {
					const data = await getPartnersOverview(env.nwana_engine_db);
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
		// News distribution review API (owner-key gated by the
		// operatingCenterApiRoute gate above).
		if (url.pathname === "/api/operating-center/news/review" && request.method === "GET") {
			return getNewsReview(env.nwana_engine_db, url.searchParams.get("article_id") ?? "");
		}
		if (url.pathname === "/api/operating-center/news/review/approve" && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as { article_id?: string };
			return approveNewsReview(env.nwana_engine_db, body.article_id ?? "");
		}
		if (url.pathname === "/api/operating-center/news/review/mark-sent" && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as { distribution_id?: string };
			return markDistributionSent(env.nwana_engine_db, body.distribution_id ?? "");
		}
		if (url.pathname === "/api/operating-center/news/publish-facebook" && request.method === "POST") {
			// Uses NWANA's Meta token — NWANA tenant only (2026-10-02).
			const fbAllowed = identity?.kind === "platform_admin" ||
				(identity?.kind === "session" && (identity.role === "platform_admin" || identity.tenant_id === "nwana"));
			if (!fbAllowed) return json({ ok: false, error: "Not available for this tenant" }, 403);
			const body = (await request.json().catch(() => ({}))) as { article_id?: string; image_slug?: string };
			const imageUrl = (body.image_slug ?? "").trim()
				? `https://nwana-engine.nwana-engine.workers.dev/api/public/social-image/${encodeURIComponent((body.image_slug ?? "").trim())}`
				: undefined;
			return publishNewsToFacebook(env.nwana_engine_db, env.NWANA_META_TOKEN, body.article_id ?? "", imageUrl);
		}
		if (url.pathname === "/api/operating-center/news/publish-instagram" && request.method === "POST") {
			// Uses NWANA's Meta token — NWANA tenant only (2026-10-02).
			const igAllowed = identity?.kind === "platform_admin" ||
				(identity?.kind === "session" && (identity.role === "platform_admin" || identity.tenant_id === "nwana"));
			if (!igAllowed) return json({ ok: false, error: "Not available for this tenant" }, 403);
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const body = (await request.json().catch(() => ({}))) as { article_id?: string; image_slug?: string };
			return publishNewsToInstagram(
				env.nwana_engine_db,
				env.NWANA_META_TOKEN,
				body.article_id ?? "",
				body.image_slug ?? "",
			);
		}
		// Photo approval: list pending images.
		if (url.pathname === "/api/operating-center/news/photo-queue" && request.method === "GET") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const rows = await env.nwana_engine_db
				.prepare(`SELECT slug, approved, created_at FROM social_images WHERE approved = 0 ORDER BY created_at DESC LIMIT 50`)
				.all<{ slug: string; approved: number; created_at: string }>();
			return json({ ok: true, photos: (rows.results ?? []).map((r) => ({
				slug: r.slug,
				url: `https://nwana-engine.nwana-engine.workers.dev/api/public/social-image/${r.slug}`,
				created_at: r.created_at,
			})) });
		}
		// Photo approval: approve or reject.
		if (url.pathname === "/api/operating-center/news/photo-approve" && request.method === "POST") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const body = (await request.json().catch(() => ({}))) as { slug?: string; approve?: boolean };
			const slug = (body.slug ?? "").trim();
			if (!slug) return json({ ok: false, error: "slug is required" }, 400);
			await env.nwana_engine_db
				.prepare(`UPDATE social_images SET approved = ? WHERE slug = ?`)
				.bind(body.approve ? 1 : -1, slug)
				.run();
			return json({ ok: true, slug, approved: !!body.approve });
		}
		// Delete a social post (emergency removal).
		if (url.pathname === "/api/operating-center/news/delete-post" && request.method === "POST") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const body = (await request.json().catch(() => ({}))) as { network?: string; post_id?: string };
			const network = (body.network ?? "").trim();
			const postId = (body.post_id ?? "").trim();
			if (!postId) return json({ ok: false, error: "post_id is required" }, 400);
			if (network === "instagram") {
				return json(await deleteInstagramPost(env.nwana_engine_db, env.NWANA_META_TOKEN, postId));
			}
			if (network === "facebook") {
				return json(await deleteFacebookPost(env.nwana_engine_db, env.NWANA_META_TOKEN, postId));
			}
			return json({ ok: false, error: "Unknown network" }, 400);
		}
		// Press releases: separate genre, separate storage.
		if (url.pathname === "/api/operating-center/news/press-releases" && request.method === "GET") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const rows = await env.nwana_engine_db
				.prepare(`SELECT id, headline, dateline, status, created_at FROM press_releases ORDER BY created_at DESC LIMIT 50`)
				.all<{ id: string; headline: string; dateline: string | null; status: string; created_at: string }>();
			return json({ ok: true, releases: rows.results ?? [] });
		}
		if (url.pathname === "/api/operating-center/news/press-releases" && request.method === "POST") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const body = (await request.json().catch(() => ({}))) as {
				headline?: string;
				dateline?: string;
				body?: string;
				contact?: string;
			};
			const headline = (body.headline ?? "").trim();
			const text = (body.body ?? "").trim();
			if (!headline || !text) return json({ ok: false, error: "Headline and body are required" }, 400);
			const id = `pr-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
			const now = new Date().toISOString();
			await env.nwana_engine_db
				.prepare(`INSERT INTO press_releases (id, headline, dateline, body, contact, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)`)
				.bind(id, headline, (body.dateline ?? "").trim(), text, (body.contact ?? "").trim(), now, now)
				.run();
			return json({ ok: true, id });
		}
		// Manual news composer: write once, publish to selected destinations.
		if (url.pathname === "/api/operating-center/news/compose" && request.method === "POST") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const body = (await request.json().catch(() => ({}))) as {
				title?: string;
				body?: string;
				destinations?: string[];
			};
			const title = (body.title ?? "").trim();
			const text = (body.body ?? "").trim();
			const dests = (body.destinations ?? []).filter((d) => ["site", "facebook", "instagram", "linkedin", "threads"].includes(d));
			if (!title || !text) return json({ ok: false, error: "Title and body are required" }, 400);
			if (dests.length === 0) return json({ ok: false, error: "Choose at least one destination" }, 400);
			const now = new Date().toISOString();
			const aid = `manual-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
			const bodyHtml = text.split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("\n");
			await env.nwana_engine_db
				.prepare(
					`INSERT INTO media_articles (article_id, plan_id, title, angle, status, body_html, created_at, updated_at)
					 VALUES (?, 'MANUAL-NEWS', ?, '', 'APPROVED', ?, ?, ?)`,
				)
				.bind(aid, title, bodyHtml, now, now)
				.run();
			const published: string[] = [];
			// Website.
			if (dests.includes("site")) {
				const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) + "-" + aid.slice(-8);
				const tid = identity?.kind === "session" ? identity.tenant_id : "nwana";
				const ins = await env.nwana_engine_db
					.prepare(`INSERT INTO site_news (slug, title, body_html, published_at, kind, created_by, tenant_id) VALUES (?, ?, ?, ?, 'news', 'MANUAL_COMPOSER', ?)`)
					.bind(slug, title, bodyHtml, now, tid)
					.run();
				const siteNewsId = Number(ins.meta?.last_row_id ?? 0) || null;
				await env.nwana_engine_db
					.prepare(`UPDATE media_articles SET status = 'PUBLISHED', site_news_id = ?, published_at = ? WHERE article_id = ?`)
					.bind(siteNewsId, now, aid)
					.run();
				published.push("website");
			}
			// Facebook + Instagram need pack data.
			if (dests.includes("facebook") || dests.includes("instagram")) {
				// Register a temporary pack for this manual article.
				registerManualPack(aid, title, text);
			}
			if (dests.includes("facebook")) {
				try {
					const r = await publishNewsToFacebook(env.nwana_engine_db, env.NWANA_META_TOKEN, aid);
					const rd = (await r.json()) as { ok?: boolean };
					if (rd.ok) published.push("facebook");
				} catch {
					// Facebook failure is reported but doesn't block other destinations.
				}
			}
			if (dests.includes("instagram")) {
				published.push("instagram (needs a picture — upload one, then post from the article)");
			}
			if (dests.includes("linkedin")) {
				try {
					const postText = `${title}\n\n${text}`;
					await postToLinkedIn(env.nwana_engine_db, postText.length > 2900 ? postText.slice(0, 2897) + "…" : postText);
					published.push("linkedin");
				} catch (error) {
					published.push(`linkedin failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
			if (dests.includes("threads")) {
				try {
					const postText = `${title}\n\n${text}`;
					await postToThreads(env.nwana_engine_db, postText.length > 495 ? postText.slice(0, 492) + "…" : postText);
					published.push("threads");
				} catch (error) {
					published.push(`threads failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
			return json({ ok: true, article_id: aid, published });
		}
		// Automatic news drafts: scan verified sources and draft articles.
		if (url.pathname === "/api/operating-center/news/auto-generate" && request.method === "POST") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			try {
				const result = await generateAutoNews(env.nwana_engine_db);
				return json({ ok: true, ...result });
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Auto-news failed" }, 500);
			}
		}
		if (url.pathname === "/api/operating-center/news/auto-queue" && request.method === "GET") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const queue = await listAutoNewsQueue(env.nwana_engine_db);
			return json({ ok: true, queue: queue.map((q) => ({ ...q, type_label: autoNewsTypeLabel(q.news_type) })) });
		}
		// Publish an auto draft to the site (owner review decision).
		if (url.pathname === "/api/operating-center/news/auto-publish" && request.method === "POST") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const body = (await request.json().catch(() => ({}))) as { article_id?: string };
			const articleId = (body.article_id ?? "").trim();
			if (!articleId) return json({ ok: false, error: "article_id is required" }, 400);
			const article = await env.nwana_engine_db
				.prepare(`SELECT article_id, title, body_html FROM media_articles WHERE article_id = ? AND plan_id = 'AUTO-NEWS' AND status = 'DRAFT'`)
				.bind(articleId)
				.first<{ article_id: string; title: string; body_html: string }>();
			if (!article) return json({ ok: false, error: "Draft not found" }, 404);
			const now = new Date().toISOString();
			const slug = article.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) + "-" + articleId.slice(-8);
			const ins = await env.nwana_engine_db
				.prepare(`INSERT INTO site_news (slug, title, body_html, published_at, kind, created_by) VALUES (?, ?, ?, ?, 'news', 'AUTO_NEWS_REVIEWED')`)
				.bind(slug, article.title, article.body_html, now)
				.run();
			const siteNewsId = Number(ins.meta?.last_row_id ?? 0) || null;
			await env.nwana_engine_db
				.prepare(`UPDATE media_articles SET status = 'PUBLISHED', site_news_id = ?, published_at = ?, updated_at = ? WHERE article_id = ?`)
				.bind(siteNewsId, now, now, articleId)
				.run();
			return json({ ok: true, article_id: articleId, slug });
		}
		// Auto-publish toggles per news type.
		if (url.pathname === "/api/operating-center/news/auto-settings" && request.method === "GET") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const rows = await env.nwana_engine_db
				.prepare(`SELECT news_type, auto_publish FROM auto_news_settings`)
				.all<{ news_type: string; auto_publish: number }>();
			const settings = (rows.results ?? []).map((r) => ({
				news_type: r.news_type,
				type_label: autoNewsTypeLabel(r.news_type),
				auto_publish: r.auto_publish === 1,
			}));
			return json({ ok: true, settings });
		}
		if (url.pathname === "/api/operating-center/news/auto-settings" && request.method === "POST") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const body = (await request.json().catch(() => ({}))) as { news_type?: string; auto_publish?: boolean };
			const newsType = (body.news_type ?? "").trim();
			if (!(AUTO_NEWS_TYPES as readonly string[]).includes(newsType)) {
				return json({ ok: false, error: "Unknown news type" }, 400);
			}
			await env.nwana_engine_db
				.prepare(`UPDATE auto_news_settings SET auto_publish = ?, updated_at = ? WHERE news_type = ?`)
				.bind(body.auto_publish ? 1 : 0, new Date().toISOString(), newsType)
				.run();
			return json({ ok: true, news_type: newsType, auto_publish: !!body.auto_publish });
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
			return json(result);
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
			try {
				return await getActivityFeed(env.nwana_engine_db);
			} catch (error) {
				console.error("getActivityFeed failed:", error);
				return json({ ok: true, items: [] });
			}
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

		// Canonical athlete profiles: one data model for personal athlete
		// pages, the Elite Athletes page, sponsor-safe exports, the Operating
		// Center, and news/athlete cards. GET endpoints are public (the data
		// is published on the public website); the site Worker reads the same
		// D1 table directly. Refresh is owner-key gated; the Engine is the
		// single writer of computed stats (auto-refresh after every result
		// apply + daily cron).
		if (request.method === "GET" && url.pathname === "/api/athletes") {
			return json({ ok: true, athletes: await listAthleteProfiles(env.nwana_engine_db) });
		}
		if (request.method === "GET" && url.pathname.startsWith("/api/athletes/")) {
			const slug = decodeURIComponent(url.pathname.slice("/api/athletes/".length)).split("/")[0];
			if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
				return json({ ok: false, error: "Unknown athlete" }, 404);
			}
			const profile = await getAthleteProfile(env.nwana_engine_db, slug);
			if (!profile) return json({ ok: false, error: "Unknown athlete" }, 404);
			return json({ ok: true, profile });
		}
		if (request.method === "POST" && url.pathname.startsWith("/api/athletes/") && url.pathname.endsWith("/refresh")) {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const slug = decodeURIComponent(
				url.pathname.slice("/api/athletes/".length, -"/refresh".length).replace(/\/$/, ""),
			);
			const stats = await refreshAthleteStats(env.nwana_engine_db, slug);
			if (!stats) return json({ ok: false, error: "Unknown athlete" }, 404);
			return json({ ok: true, slug, stats });
		}

		// Site news distribution channel: the machine's publishing endpoint for
		// the public website (news feed + winner announcements). Owner key
		// only; the public site reads from D1 directly.
		if (url.pathname === "/api/site/news" && request.method === "POST") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			try {
				return await publishSiteNews(request, env.nwana_engine_db);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Site news publish failed" }, 400);
			}
		}

		// Upload a social image (platform operator only). Body: { slug, jpeg_b64 }.
		if (url.pathname === "/api/operating-center/social-images" && request.method === "POST") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const body = (await request.json().catch(() => ({}))) as { slug?: string; jpeg_b64?: string };
			const slug = (body.slug ?? "").trim();
			const b64 = (body.jpeg_b64 ?? "").trim();
			if (!slug || !/^[a-z0-9-]+$/.test(slug)) return json({ ok: false, error: "Valid slug is required" }, 400);
			if (!b64 || b64.length < 100) return json({ ok: false, error: "jpeg_b64 is required" }, 400);
			await env.nwana_engine_db
				.prepare(`INSERT INTO social_images (slug, jpeg_b64, content_type) VALUES (?, ?, 'image/jpeg')
				          ON CONFLICT(slug) DO UPDATE SET jpeg_b64 = excluded.jpeg_b64`)
				.bind(slug, b64)
				.run();
			return json({
				ok: true,
				slug,
				url: `${env.PUBLIC_BASE_URL ?? "https://nwana-engine.nwana-engine.workers.dev"}/api/public/social-image/${slug}`,
			});
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

		if (url.pathname === "/api/board/digest" && request.method === "GET") {
			try {
				return json(await getBoardDigest(env.nwana_engine_db));
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Board digest failed" }, 500);
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
				return json(result);
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Write test failed" }, 500);
			}
		}

		// ADR-0042: owner approves results; the Machine runs the downstream
		// lifecycle. Approvals are the only owner action here; everything
		// after them is automatic. All routes are owner-key gated by the
		// /api/operating-center/* prefix gate above.
		if (request.method === "GET" && url.pathname === "/api/operating-center/series-2026/results/pending") {
			try {
				const distance = url.searchParams.get("distance") ?? "";
				const eventId = Number(url.searchParams.get("event_id"));
				const source = SERIES_2026_SOURCES.find((s) => s.distance === distance);
				if (!source || !Number.isInteger(eventId)) {
					return json({ ok: false, error: "distance and event_id are required" }, 400);
				}
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const autoEnv = {
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					apiCallerToken: env.RUNSIGNUP_API_REG,
					apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
					publicBaseUrl: new URL(request.url).origin,
				};
				// D1 first: if the owner has recorded approvals, use them directly.
				// The RunSignup API is unreliable (522 timeouts); don't waste time
				// calling it when D1 already has the verified data.
				const approvals = await getEventApprovals(env.nwana_engine_db, distance, eventId);
				const disquals = await getEventDisqualifications(env.nwana_engine_db, distance, eventId);
				let liveResults: Array<{ result_id: string; athlete: string; gender: string | null; time: string | null }>;
				if (approvals.size > 0) {
					// Owner approvals exist — skip the flaky API entirely.
					liveResults = [];
				} else {
					try {
						liveResults = await fetchLiveEventResults(env.RUNSIGNUP_ACCESS_TOKEN, source.raceId, eventId);
					} catch (error) {
						console.error("fetchLiveEventResults failed:", error instanceof Error ? error.message : error);
						liveResults = [];
					}
				}
				// If the API returned nothing but D1 has owner approvals, show the approvals.
				const live = liveResults.length > 0
					? liveResults
					: Array.from(approvals.values()).map((a) => ({
						result_id: a.resultId,
						athlete: a.athlete ?? `Result ${a.resultId}`,
						gender: null as string | null,
						time: a.time ?? null,
					}));
				const trigger = await evaluateEventTrigger(autoEnv, { distance, raceId: source.raceId, eventId });
				return json({
					ok: true,
					distance,
					event_id: eventId,
					results: live.map((r) => ({
						result_id: r.result_id,
						athlete: r.athlete,
						gender: r.gender,
						time: r.time,
						approved: approvals.has(r.result_id),
						approved_at: approvals.get(r.result_id)?.approvedAt ?? null,
						disqualified: disquals.has(r.result_id),
						disqualification_reason: disquals.get(r.result_id)?.reason ?? null,
					})),
					trigger: {
						fire: trigger.fire,
						reason: trigger.reason,
						detail: trigger.detail,
						deadline: trigger.deadline,
						missing_submissions: trigger.missingSubmissions,
						unapproved: trigger.unapprovedResults.map((r) => r.result_id),
					},
				});
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Pending approvals failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/series-2026/results/approve") {
			try {
				const body = await request.json() as { distance?: string; event_id?: number; result_ids?: string[] };
				const distance = body.distance ?? "";
				const eventId = Number(body.event_id);
				const resultIds = Array.isArray(body.result_ids) ? body.result_ids.filter((id) => typeof id === "string") : [];
				const source = SERIES_2026_SOURCES.find((s) => s.distance === distance);
				if (!source || !Number.isInteger(eventId) || resultIds.length === 0) {
					return json({ ok: false, error: "distance, event_id and result_ids[] are required" }, 400);
				}
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const autoEnv = {
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					metaToken: env.NWANA_META_TOKEN,
					apiCallerToken: env.RUNSIGNUP_API_REG,
					apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
					publicBaseUrl: new URL(request.url).origin,
				};
				const live = await fetchLiveEventResults(env.RUNSIGNUP_ACCESS_TOKEN, source.raceId, eventId);
				const liveById = new Map(live.map((r) => [r.result_id, r]));
				const recorded = [];
				for (const resultId of resultIds) {
					const row = liveById.get(resultId);
					if (!row) {
						return json({ ok: false, error: `Result ${resultId} is not in the live RunSignup result set; refusing to approve unseen data` }, 409);
					}
					recorded.push(await recordResultApproval(env.nwana_engine_db, {
						distance,
						raceId: source.raceId,
						eventId,
						resultId,
						athlete: row.athlete,
						time: row.time,
						source: "oc",
					}));
				}
				const trigger = await evaluateEventTrigger(autoEnv, { distance, raceId: source.raceId, eventId });
				let process: unknown = null;
				if (trigger.fire) {
					process = await autoProcessEvent(autoEnv, { distance, raceId: source.raceId, eventId, trigger });
				}
				return json({
					ok: true,
					approved: recorded.length,
					trigger: { fire: trigger.fire, reason: trigger.reason, detail: trigger.detail },
					process,
				});
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Approval failed" }, 500);
			}
		}

		// Owner sports decision: Disqualify (ADR-0043). The second of the two
		// owner decisions (Approve / Disqualify). 0 points, excluded from
		// scoring, displayed as DSQ. Any existing approval on the same result
		// is superseded. After the decision, the event trigger is evaluated
		// and the downstream runs immediately when fired.
		if (request.method === "POST" && url.pathname === "/api/operating-center/series-2026/results/disqualify") {
			try {
				const body = await request.json() as { distance?: string; event_id?: number; result_ids?: string[]; reason?: string };
				const distance = body.distance ?? "";
				const eventId = Number(body.event_id);
				const resultIds = Array.isArray(body.result_ids) ? body.result_ids.filter((id) => typeof id === "string") : [];
				const reason = typeof body.reason === "string" && body.reason.trim() !== "" ? body.reason.trim() : null;
				const source = SERIES_2026_SOURCES.find((s) => s.distance === distance);
				if (!source || !Number.isInteger(eventId) || resultIds.length === 0) {
					return json({ ok: false, error: "distance, event_id and result_ids[] are required" }, 400);
				}
				if (!reason) {
					return json({ ok: false, error: "A disqualification reason is required (owner audit)" }, 400);
				}
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const autoEnv = {
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					metaToken: env.NWANA_META_TOKEN,
					apiCallerToken: env.RUNSIGNUP_API_REG,
					apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
					publicBaseUrl: new URL(request.url).origin,
				};
				const live = await fetchLiveEventResults(env.RUNSIGNUP_ACCESS_TOKEN, source.raceId, eventId);
				const liveById = new Map(live.map((r) => [r.result_id, r]));
				const recorded = [];
				for (const resultId of resultIds) {
					const row = liveById.get(resultId);
					if (!row) {
						return json({ ok: false, error: `Result ${resultId} is not in the live RunSignup result set; refusing to disqualify unseen data` }, 409);
					}
					recorded.push(await recordResultDisqualification(env.nwana_engine_db, {
						distance,
						raceId: source.raceId,
						eventId,
						resultId,
						athlete: row.athlete,
						time: row.time,
						reason,
						source: "oc",
					}));
				}
				const trigger = await evaluateEventTrigger(autoEnv, { distance, raceId: source.raceId, eventId });
				let process: unknown = null;
				if (trigger.fire) {
					process = await autoProcessEvent(autoEnv, { distance, raceId: source.raceId, eventId, trigger });
				}
				return json({
					ok: true,
					disqualified: recorded.length,
					trigger: { fire: trigger.fire, reason: trigger.reason, detail: trigger.detail },
					process,
				});
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Disqualification failed" }, 500);
			}
		}

		// Owner correction: clear a previous Approve/Disqualify decision so
		// the result returns to Submitted. Does not itself trigger processing.
		if (request.method === "POST" && url.pathname === "/api/operating-center/series-2026/results/clear-decision") {
			try {
				const body = await request.json() as { distance?: string; event_id?: number; result_id?: string };
				const distance = body.distance ?? "";
				const eventId = Number(body.event_id);
				const resultId = typeof body.result_id === "string" ? body.result_id : "";
				const source = SERIES_2026_SOURCES.find((s) => s.distance === distance);
				if (!source || !Number.isInteger(eventId) || !resultId) {
					return json({ ok: false, error: "distance, event_id and result_id are required" }, 400);
				}
				const cleared = await clearResultDecision(env.nwana_engine_db, { distance, eventId, resultId });
				return json({ ok: true, ...cleared });
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Clear decision failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/series-2026/results/process-now") {
			try {
				const body = await request.json() as { distance?: string; event_id?: number };
				const distance = body.distance ?? "";
				const eventId = Number(body.event_id);
				const source = SERIES_2026_SOURCES.find((s) => s.distance === distance);
				if (!source || !Number.isInteger(eventId)) {
					return json({ ok: false, error: "distance and event_id are required" }, 400);
				}
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const autoEnv = {
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					metaToken: env.NWANA_META_TOKEN,
					apiCallerToken: env.RUNSIGNUP_API_REG,
					apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
					publicBaseUrl: new URL(request.url).origin,
				};
				const trigger = await evaluateEventTrigger(autoEnv, { distance, raceId: source.raceId, eventId });
				if (!trigger.fire) {
					return json({ ok: true, fired: false, trigger: { reason: trigger.reason, detail: trigger.detail } });
				}
				const process = await autoProcessEvent(autoEnv, { distance, raceId: source.raceId, eventId, trigger });
				return json({ ok: true, fired: true, trigger: { reason: trigger.reason, detail: trigger.detail }, process });
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Process-now failed" }, 500);
			}
		}

		if (request.method === "GET" && url.pathname === "/api/operating-center/series-2026/results/pipeline") {
			try {
				const distance = url.searchParams.get("distance") ?? "";
				const eventId = Number(url.searchParams.get("event_id"));
				const source = SERIES_2026_SOURCES.find((s) => s.distance === distance);
				if (!source || !Number.isInteger(eventId)) {
					return json({ ok: false, error: "distance and event_id are required" }, 400);
				}
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const autoEnv = {
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					apiCallerToken: env.RUNSIGNUP_API_REG,
					apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
					publicBaseUrl: new URL(request.url).origin,
				};
				const live = await fetchLiveEventResults(env.RUNSIGNUP_ACCESS_TOKEN, source.raceId, eventId);
				const rows = await getAthletePipeline(autoEnv, { distance, raceId: source.raceId, eventId }, live);
				return json({ ok: true, distance, event_id: eventId, athletes: rows });
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Pipeline view failed" }, 500);
			}
		}

		// Athlete progression matrix (ADR-0043): rows = athletes, columns =
		// events of the distance by date, then Races / Best Time / Level /
		// Points / Rank. One shared model with the public site. Server-side
		// search + pagination; buckets (Level + Gender standings) are global.
		if (request.method === "GET" && url.pathname === "/api/operating-center/series-2026/results/progression") {
			try {
				const distance = url.searchParams.get("distance") ?? "";
				const source = SERIES_2026_SOURCES.find((s) => s.distance === distance);
				if (!source) {
					return json({ ok: false, error: "distance is required" }, 400);
				}
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const result = await getDistanceProgression(env.nwana_engine_db, env.RUNSIGNUP_ACCESS_TOKEN, {
					distance,
					search: url.searchParams.get("search") ?? undefined,
					page: Number(url.searchParams.get("page") ?? "1"),
					perPage: Number(url.searchParams.get("per_page") ?? "50"),
					from: url.searchParams.get("from") ?? undefined,
					to: url.searchParams.get("to") ?? undefined,
				});
				return json(result);
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Progression view failed" }, 500);
			}
		}


		if (request.method === "POST" && url.pathname === "/api/operating-center/race-lifecycle/apply-levels") {
			try {
				const body = await request.json() as { distance?: string; event_id?: number; confirmation?: string; event_limit?: number; reset_rebuild?: boolean };
				if (!body.distance) {
					return json({ ok: false, error: "distance is required" }, 400);
				}
				if (!Number.isInteger(body.event_id)) {
					return json({ ok: false, error: "event_id is required" }, 400);
				}
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				if (body.confirmation === AUTO_APPROVED_CONFIRMATION) {
					return json({ ok: false, error: "AUTO:OWNER_APPROVED_RESULTS is internal-only; use the approvals flow" }, 400);
				}
				const result = await applySeries2026Levels({
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					distance: body.distance,
					eventId: body.event_id as number,
					confirmation: body.confirmation ?? "",
					eventLimit: body.event_limit,
					resetRebuild: body.reset_rebuild,
				});
				return json(result, result.ok ? 200 : 422);
			} catch (error) {
				console.error(error);
				return json({ ok: false, error: error instanceof Error ? error.message : "Levels apply failed" }, 500);
			}
		}

		// Object creation workflow: the owner creates a new NWANA object once.
		// The machine fills every field the official RunSignup API accepts,
		// links the dashboard-created race, and hands the owner an exact
		// manual last mile for the rest. Reads are owner-gated above; writes
		// additionally require the explicit "APPLY_STEP" confirmation per step.
		if (request.method === "GET" && url.pathname === "/api/operating-center/object-creation/packets") {
			try {
				const packets = await listCreationPackets(env.nwana_engine_db);
				return json({
					ok: true,
					packets: packets.map((p) => ({
						packet_id: p.packet_id,
						title: p.title,
						kind: p.meta.kind,
						kind_label: p.meta.kind,
						status: p.status,
						runsignup_race_id: p.meta.runsignup_race_id,
						runsignup_race_name: p.meta.runsignup_race_name,
						created_at: p.created_at,
					})),
				});
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Packets failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/object-creation/packets") {
			try {
				const body = (await request.json()) as Record<string, unknown>;
				const packet = await createCreationPacket(env.nwana_engine_db, {
					kind: body.kind as "challenge",
					title: String(body.title ?? ""),
					description: body.description ? String(body.description) : undefined,
					event_date: body.event_date ? String(body.event_date) : undefined,
					distance: body.distance ? String(body.distance) : undefined,
					format: body.format ? String(body.format) : undefined,
					external_race_url: body.external_race_url ? String(body.external_race_url) : undefined,
					external_results_url: body.external_results_url ? String(body.external_results_url) : undefined,
					facebook_page_id: body.facebook_page_id ? String(body.facebook_page_id) : undefined,
					parent_object_id: body.parent_object_id ? String(body.parent_object_id) : undefined,
					announce_news: body.announce_news === true,
					sponsorship_relevant: body.sponsorship_relevant !== false,
					notes: body.notes ? String(body.notes) : undefined,
				});
				return json({ ok: true, packet });
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Create packet failed" }, 400);
			}
		}

		if (request.method === "GET" && url.pathname === "/api/operating-center/object-creation/packet") {
			try {
				const packetId = url.searchParams.get("packet_id") ?? "";
				const packet = await getCreationPacket(env.nwana_engine_db, packetId);
				if (!packet) return json({ ok: false, error: "Unknown packet" }, 404);
				return json({ ok: true, packet, plan: buildWritePlan(packet) });
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Packet failed" }, 500);
			}
		}

		// Object fan-out: the canonical public calendar as the Operating
		// Center sees it. Competition and challenge sections are kept
		// strictly separate, mirroring the public site.
		if (request.method === "GET" && url.pathname === "/api/operating-center/object-creation/calendar") {
			try {
				const db = env.nwana_engine_db;
				const kind = url.searchParams.get("kind");
				const rows = async (k: "competition" | "challenge") => {
					try {
						const { results } = await db
							.prepare(
								`SELECT object_id, kind, title, event_date, url, series_ref, championship_ref, status, updated_at
								 FROM public_calendar WHERE kind = ? ORDER BY event_date ASC, title ASC LIMIT 200`,
							)
							.bind(k)
							.all();
						return results ?? [];
					} catch {
						return null;
					}
				};
				const competition = kind && kind !== "competition" ? undefined : await rows("competition");
				const challenge = kind && kind !== "challenge" ? undefined : await rows("challenge");
				return json({ ok: true, competition, challenge });
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Calendar failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/object-creation/link") {
			try {
				const body = (await request.json()) as { packet_id?: string; race_id?: number; event_id?: number };
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const result = await linkRunSignupRace({
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					packetId: String(body.packet_id ?? ""),
					raceId: Number(body.race_id),
					eventId: body.event_id !== undefined ? Number(body.event_id) : undefined,
				});
				return json(result);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Link failed" }, 400);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/object-creation/probe") {
			try {
				const body = (await request.json()) as { packet_id?: string };
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const packetId = String(body.packet_id ?? "");
				const probe = await probeRunSignupCredentials({ accessToken: env.RUNSIGNUP_ACCESS_TOKEN });
				const packet = await saveProbeResult(env.nwana_engine_db, packetId, probe);
				return json({ ok: true, probe, packet_id: packet.packet_id, write_access: packet.meta.write_access });
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Probe failed" }, 400);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/object-creation/fields") {
			try {
				const body = (await request.json()) as Record<string, unknown> & { packet_id?: string };
				const packetId = String(body.packet_id ?? "");
				const num = (v: unknown): number | undefined => {
					if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
					return undefined;
				};
				const packet = await setPacketApiFields(env.nwana_engine_db, packetId, {
					description: typeof body.description === "string" ? body.description : undefined,
					event_date: typeof body.event_date === "string" ? body.event_date : undefined,
					distance: typeof body.distance === "string" ? body.distance : undefined,
					format: typeof body.format === "string" ? body.format : undefined,
					external_race_url: typeof body.external_race_url === "string" ? body.external_race_url : undefined,
					external_results_url: typeof body.external_results_url === "string" ? body.external_results_url : undefined,
					facebook_page_id: typeof body.facebook_page_id === "string" ? body.facebook_page_id : undefined,
					parent_object_id: typeof body.parent_object_id === "string" ? body.parent_object_id : undefined,
					announce_news: typeof body.announce_news === "boolean" ? body.announce_news : undefined,
					sponsorship_relevant: typeof body.sponsorship_relevant === "boolean" ? body.sponsorship_relevant : undefined,
					runsignup_event_id: num(body.runsignup_event_id),
					registration_periods: Array.isArray(body.registration_periods) ? body.registration_periods as [] : undefined,
					age_based_pricing: Array.isArray(body.age_based_pricing) ? body.age_based_pricing as [] : undefined,
					questions: Array.isArray(body.questions) ? body.questions as [] : undefined,
					append_questions: typeof body.append_questions === "boolean" ? body.append_questions : undefined,
					coupons: Array.isArray(body.coupons) ? body.coupons as [] : undefined,
					notes: typeof body.notes === "string" ? body.notes : undefined,
				});
				return json({ ok: true, packet, plan: buildWritePlan(packet) });
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Save fields failed" }, 400);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/object-creation/apply") {
			try {
				const body = (await request.json()) as { packet_id?: string; step_id?: string; confirm?: string };
				if (!env.RUNSIGNUP_ACCESS_TOKEN) {
					return json({ ok: false, error: "RUNSIGNUP_ACCESS_TOKEN is not configured" }, 503);
				}
				const result = await applyCreationStep({
					db: env.nwana_engine_db,
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					packetId: String(body.packet_id ?? ""),
					stepId: String(body.step_id ?? ""),
					confirm: String(body.confirm ?? ""),
				});
				return json(result);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Apply failed" }, 400);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/object-creation/manual") {
			try {
				const body = (await request.json()) as { packet_id?: string; step_id?: string };
				const result = await completeManualStep(
					env.nwana_engine_db,
					String(body.packet_id ?? ""),
					String(body.step_id ?? ""),
				);
				return json(result);
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "Manual step failed" }, 400);
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

		if (request.method === "GET" && url.pathname === "/integrations/google-ads/conversion-actions") {
			const result = await getConversionActions(env);
			return json(result, result.ok ? 200 : 502);
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

		// ADR-0034: YouTube Data API v3 for the official NWANA channel.
		// Same public connect/callback shape as Google Ads; uploads land
		// as UNLISTED drafts, and only the explicit owner-confirmed
		// publish endpoint flips a video to PUBLIC.
		if (request.method === "GET" && url.pathname === "/integrations/youtube/status") {
			const status = await getYouTubeStatus(env);
			return json(status, status.ok ? 200 : status.configured ? 502 : 503);
		}

		// LinkedIn OAuth.
		if (request.method === "GET" && url.pathname === "/integrations/linkedin/connect") {
			try {
				return Response.redirect(linkedInConnectUrl(env), 302);
			} catch (error) {
				return json({ ok: false, connected: false, error: error instanceof Error ? error.message : "LinkedIn connection could not start" }, 503);
			}
		}
		if (request.method === "GET" && url.pathname === "/integrations/linkedin/callback") {
			try {
				const label = await handleLinkedInCallback(url, env.nwana_engine_db, env);
				return new Response(
					`<!doctype html><html lang="en"><meta charset="utf-8"><title>LinkedIn connected</title><body style="font:20px system-ui;max-width:720px;margin:80px auto;padding:24px"><h1>LinkedIn connected</h1><p>NWANA Engine can post as: ${label}.</p><p>Nothing is posted without your explicit action. You may close this tab.</p></body></html>`,
					{ headers: { "content-type": "text/html; charset=utf-8" } },
				);
			} catch (error) {
				return json({ ok: false, connected: false, error: error instanceof Error ? error.message : "LinkedIn authorization failed" }, 400);
			}
		}
		// Threads OAuth.
		if (request.method === "GET" && url.pathname === "/integrations/threads/connect") {
			try {
				return Response.redirect(threadsConnectUrl(env), 302);
			} catch (error) {
				return json({ ok: false, connected: false, error: error instanceof Error ? error.message : "Threads connection could not start" }, 503);
			}
		}
		if (request.method === "GET" && url.pathname === "/integrations/threads/callback") {
			try {
				await handleThreadsCallback(url, env.nwana_engine_db, env);
				return new Response(
					`<!doctype html><html lang="en"><meta charset="utf-8"><title>Threads connected</title><body style="font:20px system-ui;max-width:720px;margin:80px auto;padding:24px"><h1>Threads connected</h1><p>NWANA Engine can post to Threads.</p><p>Nothing is posted without your explicit action. You may close this tab.</p></body></html>`,
					{ headers: { "content-type": "text/html; charset=utf-8" } },
				);
			} catch (error) {
				return json({ ok: false, connected: false, error: error instanceof Error ? error.message : "Threads authorization failed" }, 400);
			}
		}
		// Connection status for the News Center checkboxes.
		if (url.pathname === "/api/operating-center/news/social-status" && request.method === "GET") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			const [linkedin, threads] = await Promise.all([
				isSocialConnected(env.nwana_engine_db, "linkedin"),
				isSocialConnected(env.nwana_engine_db, "threads"),
			]);
			return json({ ok: true, linkedin, threads });
		}
		if (request.method === "GET" && url.pathname === "/integrations/youtube/connect") {
			try {
				return Response.redirect(await youTubeAuthorizationUrl(env), 302);
			} catch (error) {
				return json({
					ok: false,
					connected: false,
					error: error instanceof Error ? error.message : "YouTube connection could not start",
				}, 503);
			}
		}

		if (request.method === "GET" && url.pathname === "/integrations/youtube/callback") {
			try {
				const channel = await handleYouTubeCallback(url, env);
				return new Response(
					`<!doctype html><html lang="en"><meta charset="utf-8"><title>NWANA YouTube connected</title><body style="font:20px system-ui;max-width:720px;margin:80px auto;padding:24px"><h1>YouTube connected</h1><p>NWANA Engine can upload to channel: ${channel.channel_title}.</p><p>Uploads are created as unlisted drafts; nothing is published to public without your explicit confirmation. You may close this tab.</p></body></html>`,
					{ headers: { "content-type": "text/html; charset=utf-8" } },
				);
			} catch (error) {
				return json({
					ok: false,
					connected: false,
					error: error instanceof Error ? error.message : "YouTube authorization failed",
				}, 400);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/youtube/upload") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			try {
				const body = await request.json() as {
					sourceUrl?: string;
					title?: string;
					description?: string;
					tags?: string[];
				};
				const result = await uploadVideo(env, {
					sourceUrl: body.sourceUrl ?? "",
					title: body.title ?? "",
					description: body.description,
					tags: body.tags,
				});
				return json({ ok: true, ...result });
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "YouTube upload failed" }, 500);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/operating-center/youtube/publish") {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			try {
				const body = await request.json() as { videoId?: string; confirmation?: string };
				if (body.confirmation !== "PUBLISH") {
					return json({ ok: false, error: "Explicit PUBLISH confirmation is required" }, 400);
				}
				const result = await publishVideo(env, body.videoId ?? "");
				return json({ ok: true, ...result });
			} catch (error) {
				return json({ ok: false, error: error instanceof Error ? error.message : "YouTube publish failed" }, 500);
			}
		}

		// ADR-0033: Google Analytics 4 read-only connection. Same public
		// connect/callback shape as Google Ads: the real gate is the Google
		// account chooser (admin@nwaofna.org) plus property Viewer access.
		if (request.method === "GET" && url.pathname === "/integrations/google-analytics/status") {
			const status = await getGoogleAnalyticsStatus(env);
			return json(status, status.ok ? 200 : status.configured ? 502 : 503);
		}

		if (request.method === "GET" && url.pathname === "/integrations/google-analytics/connect") {
			try {
				return Response.redirect(await googleAnalyticsAuthorizationUrl(env), 302);
			} catch (error) {
				return json({
					ok: false,
					connected: false,
					error: error instanceof Error ? error.message : "Google Analytics connection could not start",
				}, 503);
			}
		}

		if (request.method === "GET" && url.pathname === "/integrations/google-analytics/callback") {
			try {
				const connection = await handleGoogleAnalyticsCallback(url, env);
				return new Response(
					`<!doctype html><html lang="en"><meta charset="utf-8"><title>NWANA Google Analytics connected</title><body style="font:20px system-ui;max-width:720px;margin:80px auto;padding:24px"><h1>Google Analytics connected</h1><p>NWANA Engine can read property ${connection.property_id} (read-only).</p><p>Nothing was changed in your Analytics account. You may close this tab.</p></body></html>`,
					{ headers: { "content-type": "text/html; charset=utf-8" } },
				);
			} catch (error) {
				return json({
					ok: false,
					connected: false,
					error: error instanceof Error ? error.message : "Google Analytics authorization failed",
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


		// Result card PNG: rendered in-process via WASM (resvg-wasm).
		// Idempotent: the PNG is generated on-demand from the canonical SVG;
		// no storage, no external rendering service.
		if (
			request.method === "GET" &&
			url.pathname.startsWith("/result-publications/card/") &&
			(url.pathname.endsWith(".svg") || url.pathname.endsWith(".jpg") || url.pathname.endsWith(".png"))
		) {
			const format = url.pathname.endsWith(".svg") ? "svg" : "jpeg";
			const suffix = url.pathname.endsWith(".svg") ? ".svg" : url.pathname.endsWith(".png") ? ".png" : ".jpg";
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

		// Series 2026 registration / participant data layer (separate from results).
		if (
			request.method === "POST" &&
			url.pathname === "/api/series-2026/registrations/sync"
		) {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			try {
				const summary = await syncSeries2026Registrations(env.nwana_engine_db, {
					accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
					apiCallerToken: env.RUNSIGNUP_API_REG,
					apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
				});
				return json({ ...summary });
			} catch (error) {
				console.error(error);
				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown Series 2026 registration sync error",
					},
					500,
				);
			}
		}

		if (
			request.method === "GET" &&
			url.pathname === "/api/series-2026/registrations/totals"
		) {
			const operatorGate = await requirePlatformOperator(request, env);
			if (operatorGate) return operatorGate;
			try {
				const overview = await getSeries2026ParticipationOverview(env.nwana_engine_db);
				return json({ ok: true, ...overview });
			} catch (error) {
				console.error(error);
				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown Series 2026 registration totals error",
					},
					500,
				);
			}
		}

		// RunSignup participants-access diagnostic (read-only, owner-key gated by
		// the operatingCenterApiRoute gate above). Probes the participants
		// endpoint for the 5K race and reports the last 10 sync log rows, so
		// silent no-ops (HTTP 200 + API error body) are distinguishable from
		// genuinely empty participant lists.
		if (
			request.method === "GET" &&
			url.pathname === "/api/operating-center/series-2026/registrations/diagnose"
		) {
			try {
				const eventIds = await getRaceEventIds(env.nwana_engine_db, 209477);
				const diagnosis = await diagnoseRegistrationAccess(
					{
						accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
						apiCallerToken: env.RUNSIGNUP_API_REG,
						apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
					},
					209477,
					eventIds,
				);
				const recentLogs = await env.nwana_engine_db
					.prepare(
						`SELECT id, started_at, finished_at, race_id, distance_label, status,
							registrations_fetched, error
						 FROM series_registration_sync_log
						 ORDER BY id DESC
						 LIMIT 10`,
					)
					.all()
					.catch(() => ({ results: [] as unknown[] }));
				return json({ ok: true, diagnosis, recent_sync_logs: recentLogs.results });
			} catch (error) {
				console.error(error);
				return json(
					{
						ok: false,
						error:
							error instanceof Error
								? error.message
								: "Unknown registration diagnosis error",
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

	// ADR-0042 daily deadline wake-up. One cron execution = 1 request against
	// the 100k/day Workers Free allowance (VERIFIED $0). The cron NEVER
	// approves results: it only evaluates the trigger and runs the
	// already-authorized downstream chain for events whose results the owner
	// approved. Already-PUBLISHED events are skipped.
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		// The daily 06:17 UTC cron is the only scheduled entry point. The
		// normal fully-approved path is event-driven (approve endpoint);
		// this cron is the fallback: deadline processing, missed events,
		// future deadline-based objects. Any other cron schedule is ignored
		// by design.
		if (controller.cron !== "17 6 * * *") {
			console.log(`[series-2026-cron] ignoring unexpected schedule ${controller.cron}`);
			return;
		}
		if (!env.RUNSIGNUP_ACCESS_TOKEN) {
			console.log("[series-2026-cron] skipped: RUNSIGNUP_ACCESS_TOKEN not configured");
			return;
		}
		const autoEnv = {
			db: env.nwana_engine_db,
			accessToken: env.RUNSIGNUP_ACCESS_TOKEN,
			metaToken: env.NWANA_META_TOKEN,
			apiCallerToken: env.RUNSIGNUP_API_REG,
			apiCallerSecret: env.RUNSIGNUP_API_REG_SECRET,
			publicBaseUrl: env.PUBLIC_BASE_URL ?? "https://nwana-engine.nwana-engine.workers.dev",
		};
		const rows = await env.nwana_engine_db
			.prepare(`SELECT distance, race_id, active_event_id, events_json FROM race_lifecycle WHERE series = ?`)
			.bind(RACE_LIFECYCLE_SERIES)
			.all<{ distance: string; race_id: number; active_event_id: number | null; events_json: string | null }>();
		// Fallback coverage: every event of every distance that is not yet
		// published — the active event plus any missed past events (a past
		// event whose results were never fully processed is evaluated here).
		const eventsToCheck: Array<{ distance: string; raceId: number; eventId: number }> = [];
		for (const row of (rows.results ?? [])) {
			const seen = new Set<number>();
			if (row.active_event_id) {
				eventsToCheck.push({ distance: row.distance, raceId: row.race_id, eventId: row.active_event_id });
				seen.add(row.active_event_id);
			}
			try {
				const events = row.events_json ? JSON.parse(row.events_json) as Array<{ event_id: number; publication: string }> : [];
				for (const event of events) {
					if (event.publication === "PUBLISHED") continue;
					if (seen.has(event.event_id)) continue;
					seen.add(event.event_id);
					eventsToCheck.push({ distance: row.distance, raceId: row.race_id, eventId: event.event_id });
				}
			} catch {
				// events_json unreadable: the active event above is still covered.
			}
		}
		for (const item of eventsToCheck) {
			const label = `${item.distance}/${item.eventId}`;
			try {
				if (await isEventPublished(env.nwana_engine_db, item.raceId, item.eventId)) {
					console.log(`[series-2026-cron] ${label}: already PUBLISHED, skipping`);
					continue;
				}
				const trigger = await evaluateEventTrigger(autoEnv, {
					distance: item.distance,
					raceId: item.raceId,
					eventId: item.eventId,
				});
				if (!trigger.fire) {
					console.log(`[series-2026-cron] ${label}: not fired (${trigger.reason})`);
					continue;
				}
				const result = await autoProcessEvent(autoEnv, {
					distance: item.distance,
					raceId: item.raceId,
					eventId: item.eventId,
					trigger,
				});
				console.log(`[series-2026-cron] ${label}: processed ok=${result.ok} steps=${result.steps.map((s) => s.step + ":" + s.status).join(",")}`);
			} catch (err) {
				console.log(`[series-2026-cron] ${label}: ERROR ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		// Canonical athlete stats refresh: keeps dynamic victories/podiums/
		// best times current even when no event fired today. Failure-isolated:
		// a stats failure must not fail the cron.
		try {
			const refreshed = await refreshAllAthleteStats(env.nwana_engine_db);
			console.log(`[series-2026-cron] athlete stats refreshed for ${Object.keys(refreshed).length} profile(s)`);
		} catch (err) {
			console.log(`[series-2026-cron] athlete stats refresh ERROR ${err instanceof Error ? err.message : String(err)}`);
		}
		// Automatic news drafts: scan verified sources once a day.
		// Failure-isolated; drafts wait for owner review unless auto-publish
		// is enabled for that news type.
		try {
			const news = await generateAutoNews(env.nwana_engine_db);
			console.log(`[series-2026-cron] auto-news drafted ${news.drafts.length} item(s)`);
		} catch (err) {
			console.log(`[series-2026-cron] auto-news ERROR ${err instanceof Error ? err.message : String(err)}`);
		}
	},
};
export {
        classifyRunSignupContainer,
        classifyRunSignupEvent,
        getRunSignupProgramFamily,
        resolveRunSignupContainerSemantic,
        resolveRunSignupEventSemantic,
};
