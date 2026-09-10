import type {
        ProofProvider,
        ProofProviderId,
} from "./proof-provider";

import {
        OpenTimestampsBitcoinProvider,
} from "./opentimestamps-bitcoin-provider";

const proofProviders = new Map<ProofProviderId, ProofProvider>([
        [
                "opentimestamps-bitcoin",
                new OpenTimestampsBitcoinProvider(),
        ],
]);

export function getProofProvider(
        providerId: ProofProviderId,
): ProofProvider {
        const provider = proofProviders.get(providerId);

        if (!provider) {
                throw new Error(
                        `Unknown proof provider: ${providerId}`,
                );
        }

        return provider;
}

export function getDefaultProofProvider(): ProofProvider {
        return getProofProvider(
                "opentimestamps-bitcoin",
        );
}