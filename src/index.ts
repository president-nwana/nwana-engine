import { buildDetachedOtsProof, upgradeDetachedOtsProof, verifyDetachedOtsProof } from "./ots-proof";
import { ensurePendingBitcoinAnchor } from "./trust";

interface Env {
	nwana_engine_db: D1Database;
}

interface CreateObjectRequest {
	object_type: string;
	title?: string;
	source?: string;
	source_id?: string;
	status?: string;
	parent_object_id?: string;
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
				VALUES (?, ?, ?, ?, ?, 'opentimestamps', 'pending')
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

	const result = await submitHashToOpenTimestamps(job.hash);

	if (!result.ok || !result.calendar || !result.calendarResponseBytes) {
		const errorText = JSON.stringify(result.attempts);

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
						attempts: result.attempts,
					}),
				),
		]);

		return json(
			{
				ok: false,
				job_id: job.job_id,
				status: "failed",
				attempts: result.attempts,
			},
			502,
		);
	}

	const detachedProof = buildDetachedOtsProof(
                job.hash,
                result.calendarResponseBytes,
        );

        const proofPayload = JSON.stringify({
                format: "opentimestamps-detached-proof",
                encoding: "base64",
                hash_algorithm: "SHA-256",
                hash: job.hash,
                calendar: result.calendar,
                proof_base64: detachedProof.proofBase64,
                proof_bytes: detachedProof.proofSize,
                bitcoin_attestation:
                        detachedProof.hasBitcoinAttestation,
                submitted_at: now,
        });

	await ensurePendingBitcoinAnchor(db, {
		trustId: job.trust_id,
		jobId: job.job_id,
		objectId: job.object_id,
		versionId: job.version_id,
		proofData: proofPayload,
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
					calendar: result.calendar,
					attempts: result.attempts,
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
		calendar: result.calendar,
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
                const upgraded =
                        await upgradeDetachedOtsProof(
                                payload.proof_base64,
                        );

                const now = new Date().toISOString();

                const anchorStatus =
                        upgraded.hasBitcoinAttestation
                                ? "anchored"
                                : "pending";

                const jobStatus =
                        upgraded.hasBitcoinAttestation
                                ? "anchored"
                                : "submitted";

                const updatedPayload = JSON.stringify({
                        ...payload,
                        proof_base64:
                                upgraded.proofBase64,
                        proof_bytes:
                                upgraded.proofSize,
                        bitcoin_attestation:
                                upgraded.hasBitcoinAttestation,
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
                                        UPDATE blockchain_anchors
                                        SET
                                                status = ?,
                                                proof_data = ?,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                        AND blockchain = 'bitcoin'
                                `)
                                .bind(
                                        anchorStatus,
                                        updatedPayload,
                                        row.job_id,
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
                                                        upgraded.upgraded,
                                                bitcoin_attestation:
                                                        upgraded.hasBitcoinAttestation,
                                                calendars_checked:
                                                        upgraded.calendarsChecked,
                                        }),
                                ),
                ]);

                return json({
                        ok: true,
                        job_id: row.job_id,
                        object_id: row.object_id,
                        status: jobStatus,
                        upgraded: upgraded.upgraded,
                        bitcoin_attestation:
                                upgraded.hasBitcoinAttestation,
                        proof_bytes:
                                upgraded.proofSize,
                        calendars_checked:
                                upgraded.calendarsChecked,
                        message:
                                upgraded.hasBitcoinAttestation
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

        try {
                const verified =
                        await verifyDetachedOtsProof(
                                payload.proof_base64,
                        );

                const now = new Date().toISOString();

                const attestationTime =
                        new Date(
                                verified.blockTime * 1000,
                        ).toISOString();

                const updatedPayload = JSON.stringify({
                        ...payload,
                        bitcoin_verified: true,
                        block_height:
                                verified.blockHeight,
                        block_hash:
                                verified.blockHash,
                        attestation_time:
                                attestationTime,
                        confirmations:
                                verified.confirmations,
                        verified_at: now,
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
                                        verified.blockHash,
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
                                        UPDATE blockchain_anchors
                                        SET
                                                status = 'confirmed',
                                                block_height = ?,
                                                block_hash = ?,
                                                attestation_time = ?,
                                                verified_at = ?,
                                                confirmations = ?,
                                                proof_data = ?,
                                                last_error = NULL,
                                                updated_at = CURRENT_TIMESTAMP
                                        WHERE job_id = ?
                                        AND blockchain = 'bitcoin'
                                `)
                                .bind(
                                        verified.blockHeight,
                                        verified.blockHash,
                                        attestationTime,
                                        now,
                                        verified.confirmations,
                                        updatedPayload,
                                        row.job_id,
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
                                                        verified.blockHeight,
                                                block_hash:
                                                        verified.blockHash,
                                                attestation_time:
                                                        attestationTime,
                                                confirmations:
                                                        verified.confirmations,
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
                                verified.blockHeight,
                        block_hash:
                                verified.blockHash,
                        attestation_time:
                                attestationTime,
                        confirmations:
                                verified.confirmations,
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
                                UPDATE blockchain_anchors
                                SET
                                        last_error = ?,
                                        updated_at = CURRENT_TIMESTAMP
                                WHERE job_id = ?
                                AND blockchain = 'bitcoin'
                        `)
                        .bind(
                                errorText,
                                row.job_id,
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

	const contentSnapshot = safeJson(
		body.content ?? {
			title: body.title ?? null,
			metadata: body.metadata ?? null,
		},
	);

	const hashInput = JSON.stringify({
		object_id: objectId,
		object_type: objectType,
		version: versionNumber,
		title: body.title ?? null,
		source: body.source ?? "manual",
		source_id: body.source_id ?? null,
		parent_object_id: body.parent_object_id ?? null,
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
					source_id,
					status,
					current_version,
					parent_object_id,
					metadata
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`)
			.bind(
				objectId,
				objectType,
				body.title ?? null,
				body.source ?? "manual",
				body.source_id ?? null,
				body.status ?? "active",
				versionNumber,
				body.parent_object_id ?? null,
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
			object: {
				object_id: objectId,
				object_type: objectType,
				title: body.title ?? null,
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
        async scheduled(
                _controller: ScheduledController,
                env: Env,
        ): Promise<void> {
                try {
                        const response =
                                await processNextGenericJob(env);

                        const result =
                                await response.clone().text();

                        console.log(
                                "Scheduled NWANA Engine job run:",
                                response.status,
                                result,
                        );
                } catch (error) {
                        console.error(
                                "Scheduled NWANA Engine job run failed:",
                                error,
                        );
                }
        },
};