export interface PendingBitcoinAnchorInput {
trustId: string;
jobId: string;
objectId: string;
versionId: string | null;
proofData: string;
}

export interface BlockchainAnchorRecord {
anchor_id: string;
trust_id: string;
job_id: string;
object_id: string;
version_id: string | null;
blockchain: string;
status: string;
block_height: number | null;
block_hash: string | null;
transaction_id: string | null;
attestation_time: string | null;
verified_at: string | null;
confirmations: number;
proof_data: string | null;
last_error: string | null;
created_at: string;
updated_at: string;
}

export async function ensurePendingBitcoinAnchor(
db: D1Database,
input: PendingBitcoinAnchorInput,
): Promise<{
anchorId: string;
status: string;
created: boolean;
}> {
const existing = await db
.prepare(`
SELECT anchor_id, status
FROM blockchain_anchors
WHERE job_id = ?
AND blockchain = 'bitcoin'
ORDER BY id ASC
LIMIT 1
`)
.bind(input.jobId)
.first<{
anchor_id: string;
status: string;
}>();

if (existing) {
return {
anchorId: existing.anchor_id,
status: existing.status,
created: false,
};
}

const anchorId =
`NWANA-ANCHOR-${crypto.randomUUID()}`;

await db
.prepare(`
INSERT INTO blockchain_anchors (
anchor_id,
trust_id,
job_id,
object_id,
version_id,
blockchain,
status,
proof_data
)
VALUES (?, ?, ?, ?, ?, 'bitcoin', 'pending', ?)
`)
.bind(
anchorId,
input.trustId,
input.jobId,
input.objectId,
input.versionId,
input.proofData,
)
.run();

return {
anchorId,
status: "pending",
created: true,
};
}

export async function getBlockchainAnchorsForObject(
db: D1Database,
objectId: string,
): Promise<BlockchainAnchorRecord[]> {
const result = await db
.prepare(`
SELECT *
FROM blockchain_anchors
WHERE object_id = ?
ORDER BY id ASC
`)
.bind(objectId)
.all<BlockchainAnchorRecord>();

return result.results;
}

export interface PendingProofAnchorInput {
trustId: string;
jobId: string;
objectId: string;
versionId: string | null;
provider: string;
network?: string | null;
anchorType: string;
proofData: string;
providerMetadata?: Record<string, unknown> | null;
}

export interface ProofAnchorRecord {
anchor_id: string;
trust_id: string;
job_id: string | null;
object_id: string;
version_id: string | null;
provider: string;
network: string | null;
anchor_type: string;
status: string;
external_anchor_id: string | null;
anchored_at: string | null;
verified_at: string | null;
proof_data: string | null;
provider_metadata: string | null;
last_error: string | null;
created_at: string;
updated_at: string;
}

export async function ensurePendingProofAnchor(
db: D1Database,
input: PendingProofAnchorInput,
): Promise<{
anchorId: string;
status: string;
created: boolean;
}> {
const existing = await db
.prepare(`
SELECT anchor_id, status
FROM proof_anchors
WHERE job_id = ?
AND provider = ?
AND (
network = ?
OR (network IS NULL AND ? IS NULL)
)
AND anchor_type = ?
ORDER BY id ASC
LIMIT 1
`)
.bind(
input.jobId,
input.provider,
input.network ?? null,
input.network ?? null,
input.anchorType,
)
.first<{
anchor_id: string;
status: string;
}>();

if (existing) {
return {
anchorId: existing.anchor_id,
status: existing.status,
created: false,
};
}

const anchorId =
`NWANA-PROOF-${crypto.randomUUID()}`;

await db
.prepare(`
INSERT INTO proof_anchors (
anchor_id,
trust_id,
job_id,
object_id,
version_id,
provider,
network,
anchor_type,
status,
proof_data,
provider_metadata
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
`)
.bind(
anchorId,
input.trustId,
input.jobId,
input.objectId,
input.versionId,
input.provider,
input.network ?? null,
input.anchorType,
input.proofData,
input.providerMetadata
? JSON.stringify(input.providerMetadata)
: null,
)
.run();

return {
anchorId,
status: "pending",
created: true,
};
}

export async function getProofAnchorsForObject(
db: D1Database,
objectId: string,
): Promise<ProofAnchorRecord[]> {
const result = await db
.prepare(`
SELECT *
FROM proof_anchors
WHERE object_id = ?
ORDER BY id ASC
`)
.bind(objectId)
.all<ProofAnchorRecord>();

return result.results;
}