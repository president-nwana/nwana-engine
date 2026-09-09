import {
	DetachedTimestampFile,
	OpSHA256,
	StreamDeserializationContext,
	Timestamp,
	hexToBytes,
} from "@otskit/core";

export interface BuiltOtsProof {
	proofBytes: Uint8Array;
	proofBase64: string;
	proofSize: number;
	hash: string;
	hasBitcoinAttestation: boolean;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

export function buildDetachedOtsProof(
	hash: string,
	calendarResponseBytes: Uint8Array,
): BuiltOtsProof {
	const digest = hexToBytes(hash);

	if (digest.length !== 32) {
		throw new Error("SHA-256 digest must be exactly 32 bytes");
	}

	const calendarContext =
		new StreamDeserializationContext(calendarResponseBytes);

	const calendarTimestamp =
		Timestamp.deserialize(calendarContext, digest);

	const detached =
		DetachedTimestampFile.fromHash(
			new OpSHA256(),
			digest,
		);

	detached.timestamp.merge(calendarTimestamp);

	const proofBytes =
		detached.serializeToBytes();

	return {
		proofBytes,
		proofBase64: bytesToBase64(proofBytes),
		proofSize: proofBytes.length,
		hash,
		hasBitcoinAttestation:
			detached.timestamp.hasBitcoinAttestation(),
	};
}