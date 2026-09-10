import { hexToBytes } from "@otskit/core";

import type {
	ProofCreateRequest,
	ProofCreateResult,
	ProofProvider,
	ProofUpgradeRequest,
	ProofUpgradeResult,
	ProofVerifyRequest,
	ProofVerifyResult,
} from "./proof-provider";

import {
	buildDetachedOtsProof,
	upgradeDetachedOtsProof,
	verifyDetachedOtsProof,
} from "./ots-proof";

const OTS_AGGREGATORS = [
	"https://a.pool.opentimestamps.org/digest",
	"https://b.pool.opentimestamps.org/digest",
	"https://a.pool.eternitywall.com/digest",
];

interface OtsSubmissionAttempt {
	url: string;
	ok: boolean;
	status?: number;
	error?: string;
}

interface OtsSubmissionResult {
	ok: boolean;
	calendar?: string;
	calendarResponseBytes?: Uint8Array;
	attempts: OtsSubmissionAttempt[];
}

async function submitHashToOpenTimestamps(
	hash: string,
): Promise<OtsSubmissionResult> {
	const digestBytes = hexToBytes(hash);

	if (digestBytes.length !== 32) {
		throw new Error("SHA-256 digest must be exactly 32 bytes");
	}

	const attempts: OtsSubmissionAttempt[] = [];

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

			const calendarResponseBytes = new Uint8Array(
				await response.arrayBuffer(),
			);

			if (calendarResponseBytes.length === 0) {
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
				calendarResponseBytes,
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

export class OpenTimestampsBitcoinProvider implements ProofProvider {
	readonly id = "opentimestamps-bitcoin";
	readonly network = "bitcoin";
	readonly proofType = "opentimestamps-detached-proof";

	async createProof(
		request: ProofCreateRequest,
	): Promise<ProofCreateResult> {
		const submission = await submitHashToOpenTimestamps(
			request.subject.hash,
		);

		if (
			!submission.ok ||
			!submission.calendar ||
			!submission.calendarResponseBytes
		) {
			throw new Error(
				"OpenTimestamps submission failed: " +
					JSON.stringify(submission.attempts),
			);
		}

		const proof = buildDetachedOtsProof(
			request.subject.hash,
			submission.calendarResponseBytes,
		);

		return {
			provider: this.id,
			network: this.network,
			proofType: this.proofType,
			status: proof.hasBitcoinAttestation
				? "anchored"
				: "submitted",
			proofPayload: proof.proofBase64,
			providerMetadata: {
				calendar: submission.calendar,
				attempts: submission.attempts,
				proofSize: proof.proofSize,
				hasBitcoinAttestation:
					proof.hasBitcoinAttestation,
			},
			createdAt: new Date().toISOString(),
		};
	}

	async upgradeProof(
		request: ProofUpgradeRequest,
	): Promise<ProofUpgradeResult> {
		const upgraded = await upgradeDetachedOtsProof(
			request.proofPayload,
		);

		return {
			provider: this.id,
			network: this.network,
			proofType: this.proofType,
			status: upgraded.hasBitcoinAttestation
				? "anchored"
				: "submitted",
			proofPayload: upgraded.proofBase64,
			providerMetadata: {
				...(request.providerMetadata ?? {}),
				calendarsChecked: upgraded.calendarsChecked,
				upgraded: upgraded.upgraded,
				proofSize: upgraded.proofSize,
				hasBitcoinAttestation:
					upgraded.hasBitcoinAttestation,
			},
			anchoredAt: upgraded.hasBitcoinAttestation
				? new Date().toISOString()
				: null,
		};
	}

	async verifyProof(
		request: ProofVerifyRequest,
	): Promise<ProofVerifyResult> {
		const verified = await verifyDetachedOtsProof(
			request.proofPayload,
		);

		return {
			provider: this.id,
			network: this.network,
			proofType: this.proofType,
			verified: verified.verified,
			status: verified.verified
				? "verified"
				: "anchored",
			externalAnchorId: verified.blockHash,
			providerMetadata: {
				...(request.providerMetadata ?? {}),
				blockHeight: verified.blockHeight,
				blockHash: verified.blockHash,
				blockTime: verified.blockTime,
				confirmations: verified.confirmations,
			},
			verifiedAt: new Date().toISOString(),
		};
	}
}