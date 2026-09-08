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

async function submitHashToOpenTimestamps(
	hash: string,
): Promise<{
		ok: boolean;
		calendar?: string;
		proofBase64?: string;
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

	if (!result.ok || !result.calendar || !result.proofBase64) {
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

	const proofPayload = JSON.stringify({
		format: "opentimestamps-calendar-response",
		calendar: result.calendar,
		hash_algorithm: "SHA-256",
		hash: job.hash,
		response_base64: result.proofBase64,
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

async function processNextTimestampJob(
	env: Env,
): Promise<Response> {
	const job = await env.nwana_engine_db
		.prepare(`
			SELECT job_id
			FROM timestamp_jobs
			WHERE status IN ('pending', 'failed')
			ORDER BY id ASC
			LIMIT 1
		`)
		.first<{ job_id: string }>();

	if (!job) {
		return json({
			ok: true,
			status: "idle",
			message: "No pending timestamp jobs",
		});
	}

	return processTimestampJob(job.job_id, env);
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