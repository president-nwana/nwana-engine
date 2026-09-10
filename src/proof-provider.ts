export type ProofProviderId = string;

export type ProofStatus =
	| "pending"
	| "submitted"
	| "anchored"
	| "verified"
	| "failed";

export interface ProofSubject {
	subjectId: string;
	versionId?: string | null;
	hash: string;
}

export interface ProofCreateRequest {
	subject: ProofSubject;
}

export interface ProofCreateResult {
	provider: ProofProviderId;
	network?: string | null;
	proofType: string;
	status: ProofStatus;
	proofPayload?: string | null;
	externalAnchorId?: string | null;
	providerMetadata?: Record<string, unknown> | null;
	createdAt: string;
	anchoredAt?: string | null;
	verifiedAt?: string | null;
}

export interface ProofUpgradeRequest {
	proofPayload: string;
	providerMetadata?: Record<string, unknown> | null;
}

export interface ProofUpgradeResult {
	provider: ProofProviderId;
	network?: string | null;
	proofType: string;
	status: ProofStatus;
	proofPayload: string;
	externalAnchorId?: string | null;
	providerMetadata?: Record<string, unknown> | null;
	anchoredAt?: string | null;
}

export interface ProofVerifyRequest {
	proofPayload: string;
	providerMetadata?: Record<string, unknown> | null;
}

export interface ProofVerifyResult {
	provider: ProofProviderId;
	network?: string | null;
	proofType: string;
	verified: boolean;
	status: ProofStatus;
	externalAnchorId?: string | null;
	providerMetadata?: Record<string, unknown> | null;
	verifiedAt: string;
}

export interface ProofProvider {
	readonly id: ProofProviderId;
	readonly network?: string | null;
	readonly proofType: string;

	createProof(request: ProofCreateRequest): Promise<ProofCreateResult>;

	upgradeProof?(
		request: ProofUpgradeRequest,
	): Promise<ProofUpgradeResult>;

	verifyProof(
		request: ProofVerifyRequest,
	): Promise<ProofVerifyResult>;
}