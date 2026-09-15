import { describe, expect, it } from "vitest";
import {
        classifyRunSignupContainer,
        getRunSignupProgramFamily,
        resolveRunSignupContainerSemantic,
        resolveRunSignupEventSemantic,
} from "../src/index";

type TestSemanticProfile = {
        source: string;
        source_type: string;
        source_id: string;
        object_type: string | null;
        program_family: string | null;
        commercial_role: string | null;
        metadata: string | null;
};

function createSemanticProfileDb(
        profiles: TestSemanticProfile[],
): D1Database {
        return {
                prepare() {
                        return {
                                bind(
                                        source: string,
                                        sourceType: string,
                                        sourceId: string,
                                ) {
                                        return {
                                                async first<T>() {
                                                        const profile =
                                                                profiles.find(
                                                                        (value) =>
                                                                                value.source === source &&
                                                                                value.source_type === sourceType &&
                                                                                value.source_id === sourceId,
                                                                ) ?? null;

                                                        return profile as T | null;
                                                },
                                        };
                                },
                        };
                },
        } as unknown as D1Database;
}

describe("Stage 7 semantic registry", () => {
        it("keeps the existing NWANA Open distance series classified as OPEN_SERIES", () => {
                const classification =
                        classifyRunSignupContainer(
                                "2026 NWANA Open 5K Nordic Walking Series",
                                [
                                        {
                                                distance: "5K",
                                        },
                                ],
                        );

                expect(classification).toBe(
                        "COMPETITION_DISTANCE_SERIES",
                );

                expect(
                        getRunSignupProgramFamily(
                                classification,
                                "2026 NWANA Open 5K Nordic Walking Series",
                        ),
                ).toBe("OPEN_SERIES");
        });

        it("classifies an unknown race with distance events as a neutral COMPETITION_PROPERTY", () => {
                const classification =
                        classifyRunSignupContainer(
                                "Community Autumn Race",
                                [
                                        {
                                                distance: "5K",
                                        },
                                ],
                        );

                expect(classification).toBe(
                        "COMPETITION_PROPERTY",
                );

                expect(
                        getRunSignupProgramFamily(
                                classification,
                                "Community Autumn Race",
                        ),
                ).toBe("COMPETITION_PROGRAM");
        });

        it("lets an explicit semantic profile override fallback NWANA meaning", async () => {
                const db =
                        createSemanticProfileDb([
                                {
                                        source: "runsignup",
                                        source_type: "race",
                                        source_id: "12345",
                                        object_type:
                                                "COMPETITION_PROPERTY",
                                        program_family:
                                                "US_CHAMPIONSHIP",
                                        commercial_role:
                                                "SELLABLE",
                                        metadata: null,
                                },
                        ]);

                const semantic =
                        await resolveRunSignupContainerSemantic(
                                db,
                                "runsignup",
                                "race",
                                "12345",
                                "Community Autumn Race",
                                [
                                        {
                                                distance: "5K",
                                        },
                                ],
                        );

                expect(semantic).toEqual({
                        classification:
                                "COMPETITION_PROPERTY",
                        program_family:
                                "US_CHAMPIONSHIP",
                        commercial_role:
                                "SELLABLE",
                        semantic_profile_applied:
                                true,
                });
        });

        it("makes a competition event inherit the resolved program family of its parent", async () => {
                const db =
                        createSemanticProfileDb([]);

                const semantic =
                        await resolveRunSignupEventSemantic(
                                db,
                                {
                                        event_id: 67890,
                                        name: "Championship 5K",
                                        distance: "5K",
                                },
                                "US_CHAMPIONSHIP",
                        );

                expect(semantic.classification).toBe(
                        "COMPETITION_EVENT",
                );

                expect(semantic.program_family).toBe(
                        "US_CHAMPIONSHIP",
                );

                expect(
                        semantic.semantic_profile_applied,
                ).toBe(false);
        });
});