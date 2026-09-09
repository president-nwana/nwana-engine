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

export interface UpgradedOtsProof extends BuiltOtsProof {
        upgraded: boolean;
        calendarsChecked: string[];
}

function base64ToBytes(value: string): Uint8Array {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
        }

        return bytes;
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
export async function upgradeDetachedOtsProof(
        proofBase64: string,
): Promise<UpgradedOtsProof> {
        const proofBytes = base64ToBytes(proofBase64);
        const detached = DetachedTimestampFile.deserialize(proofBytes);

        const pending = detached.timestamp
                .allAttestations()
                .filter(({ attestation }) => attestation.kind === "pending");

        const calendarsChecked: string[] = [];
        let upgraded = false;

        for (const { msg, attestation } of pending) {
                if (attestation.kind !== "pending") {
                        continue;
                }

                const calendarUrl = attestation.uri.replace(/\/+$/, "");
                const commitmentHex = Array.from(msg)
                        .map((byte) => byte.toString(16).padStart(2, "0"))
                        .join("");

                const timestampUrl =
                        `${calendarUrl}/timestamp/${commitmentHex}`;

                calendarsChecked.push(calendarUrl);

                const response = await fetch(timestampUrl, {
                        method: "GET",
                        headers: {
                                accept: "application/vnd.opentimestamps.v1",
                        },
                });

                if (!response.ok) {
                        continue;
                }

                const bytes =
                        new Uint8Array(await response.arrayBuffer());

                if (bytes.length === 0) {
                        continue;
                }

                const context =
                        new StreamDeserializationContext(bytes);

                const upgradedTimestamp =
                        Timestamp.deserialize(context, msg);

                const matchingNodes =
                        detached.timestamp.allAttestations();

                for (const item of matchingNodes) {
                        if (
                                item.msg.length === msg.length &&
                                item.msg.every(
                                        (value, index) =>
                                                value === msg[index],
                                )
                        ) {
                                const node =
                                        detached.timestamp
                                                .directlyVerified()
                                                .find((candidate) => {
                                                        const digest =
                                                                candidate.getDigest();

                                                        return (
                                                                digest.length === msg.length &&
                                                                digest.every(
                                                                        (value, index) =>
                                                                                value === msg[index],
                                                                )
                                                        );
                                                });

                                if (node) {
                                        node.merge(upgradedTimestamp);
                                        upgraded = true;
                                        break;
                                }
                        }
                }
        }

        const updatedBytes =
                detached.serializeToBytes();

        return {
                proofBytes: updatedBytes,
                proofBase64: bytesToBase64(updatedBytes),
                proofSize: updatedBytes.length,
                hash: Array.from(detached.fileDigest())
                        .map((byte) => byte.toString(16).padStart(2, "0"))
                        .join(""),
                hasBitcoinAttestation:
                        detached.timestamp.hasBitcoinAttestation(),
                upgraded,
                calendarsChecked,
        };
}
export interface VerifiedOtsProof {
        verified: boolean;
        blockHeight: number;
        blockHash: string;
        blockTime: number;
        confirmations: number;
}

export async function verifyDetachedOtsProof(
        proofBase64: string,
): Promise<VerifiedOtsProof> {
        const proofBytes = base64ToBytes(proofBase64);
        const detached =
                DetachedTimestampFile.deserialize(proofBytes);

        const bitcoinAttestation =
                detached.timestamp
                        .getAttestations()
                        .find(
                                (attestation) =>
                                        attestation.kind === "bitcoin",
                        );

        if (
                !bitcoinAttestation ||
                bitcoinAttestation.kind !== "bitcoin"
        ) {
                throw new Error(
                        "OpenTimestamps proof has no Bitcoin attestation",
                );
        }

        const blockHeight =
                bitcoinAttestation.height;

        const esploraBase =
                "https://blockstream.info/api";

        let verifiedBlockHash = "";

        const provider = {
                async getBlockHeader(
                        height: number,
                ): Promise<Uint8Array> {
                        const hashResponse = await fetch(
                                `${esploraBase}/block-height/${height}`,
                        );

                        if (!hashResponse.ok) {
                                throw new Error(
                                        `Could not resolve Bitcoin block ${height}: HTTP ${hashResponse.status}`,
                                );
                        }

                        const blockHash =
                                (await hashResponse.text()).trim();

                        if (
                                !/^[0-9a-fA-F]{64}$/.test(blockHash)
                        ) {
                                throw new Error(
                                        "Bitcoin explorer returned invalid block hash",
                                );
                        }

                        verifiedBlockHash = blockHash;

                        const statusResponse = await fetch(
                                `${esploraBase}/block/${blockHash}/status`,
                        );

                        if (!statusResponse.ok) {
                                throw new Error(
                                        `Could not read Bitcoin block status: HTTP ${statusResponse.status}`,
                                );
                        }

                        const status =
                                await statusResponse.json<{
                                        in_best_chain: boolean;
                                }>();

                        if (!status.in_best_chain) {
                                throw new Error(
                                        "Bitcoin attestation block is not in the best chain",
                                );
                        }

                        const headerResponse = await fetch(
                                `${esploraBase}/block/${blockHash}/header`,
                        );

                        if (!headerResponse.ok) {
                                throw new Error(
                                        `Could not read Bitcoin block header: HTTP ${headerResponse.status}`,
                                );
                        }

                        const headerHex =
                                (await headerResponse.text()).trim();

                        if (
                                !/^[0-9a-fA-F]{160}$/.test(headerHex)
                        ) {
                                throw new Error(
                                        "Bitcoin explorer returned invalid 80-byte block header",
                                );
                        }

                        return hexToBytes(headerHex);
                },
        };

        const blockTime =
                await detached.timestamp.verifyBitcoin(
                        provider,
                );

        if (!verifiedBlockHash) {
                throw new Error(
                        "Bitcoin block hash was not resolved during verification",
                );
        }

        const tipResponse = await fetch(
                `${esploraBase}/blocks/tip/height`,
        );

        if (!tipResponse.ok) {
                throw new Error(
                        `Could not read Bitcoin tip height: HTTP ${tipResponse.status}`,
                );
        }

        const tipHeight =
                Number((await tipResponse.text()).trim());

        if (!Number.isInteger(tipHeight)) {
                throw new Error(
                        "Bitcoin explorer returned invalid tip height",
                );
        }

        const confirmations =
                Math.max(
                        0,
                        tipHeight - blockHeight + 1,
                );

        return {
                verified: true,
                blockHeight,
                blockHash: verifiedBlockHash,
                blockTime,
                confirmations,
        };
}