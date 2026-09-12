import type {
        SourceAdapter,
        SourceFetchResult,
        SourceObject,
        SourceSyncCursor,
} from "./source-adapter";

interface RunSignupSourceOptions {
        accessToken: string;
        resultsPerPage?: number;
}

interface RunSignupRace {
        race_id: number;
        name: string;
        last_modified?: string | null;
        next_date?: string | null;
        next_end_date?: string | null;
        is_draft_race?: string | null;
        is_private_race?: string | null;
        is_registration_open?: string | null;
        url?: string | null;
        events?: unknown[];
        [key: string]: unknown;
}

interface RunSignupRaceWrapper {
        race: RunSignupRace;
}

interface RunSignupRacesResponse {
        races?: RunSignupRaceWrapper[];
}
interface RunSignupRaceResponse {
        race: RunSignupRace;
}

export class RunSignupSource implements SourceAdapter {
        readonly id = "runsignup";

        private readonly accessToken: string;
        private readonly resultsPerPage: number;

        constructor(options: RunSignupSourceOptions) {
                this.accessToken = options.accessToken;
                this.resultsPerPage =
                        Math.min(
                                Math.max(
                                        options.resultsPerPage ?? 100,
                                        1,
                                ),
                                1000,
                        );
        }

        async fetchRace(
                raceId: number,
        ): Promise<SourceObject> {
                const url = new URL(
                        `https://api.runsignup.com/rest/race/${raceId}`,
                );
                url.searchParams.set(
                        "format",
                        "json",
                );

                url.searchParams.set(
                        "events",
                        "T",
                );

                const response = await fetch(
                        url.toString(),
                        {
                                headers: {
                                        Authorization:
                                                `Bearer ${this.accessToken}`,
                                },
                        },
                );

                if (!response.ok) {
                        throw new Error(
                                `RunSignup race request failed: ${response.status} ${response.statusText}`,
                        );
                }

                const data =
                        await response.json() as RunSignupRaceResponse;

                if (!data || typeof data !== "object" || !("race" in data)) {
                        throw new Error(
                                `Unexpected RunSignup race response: ${JSON.stringify(data).slice(0, 2000)}`,
                        );
                }

                const race = data.race;

                return {
                        source: this.id,
                        sourceType: "race",
                        sourceId:
                                String(race.race_id),
                        title:
                                race.name ?? null,
                        status:
                                race.is_draft_race === "T"
                                        ? "draft"
                                        : "active",
                        metadata: {
                                nextDate:
                                        race.next_date ?? null,
                                nextEndDate:
                                        race.next_end_date ?? null,
                                registrationOpen:
                                        race.is_registration_open === "T",
                                private:
                                        race.is_private_race === "T",
                                url:
                                        race.url ?? null,
                                lastModified:
                                        race.last_modified ?? null,
                                events:
                                        Array.isArray(race.events)
                                                ? race.events
                                                : [],
                        },
                        raw: race,
                };
        }

        async fetchChanges(
                cursor?: SourceSyncCursor | null,
        ): Promise<SourceFetchResult> {
                const url = new URL(
                        "https://api.runsignup.com/rest/races",
                );
                url.searchParams.set(
                        "format",
                        "json",
                );

                url.searchParams.set(
                        "events",
                        "T",
                );

                url.searchParams.set(
                        "results_per_page",
                        String(this.resultsPerPage),
                );

                url.searchParams.set(
                        "sort",
                        "date ASC",
                );

                if (cursor?.value) {
                        url.searchParams.set(
                                "modified_since",
                                cursor.value,
                        );
                }

                const response = await fetch(
                        url.toString(),
                        {
                                headers: {
                                        Authorization:
                                                `Bearer ${this.accessToken}`,
                                },
                        },
                );

                if (!response.ok) {
                        throw new Error(
                                `RunSignup races request failed: ${response.status} ${response.statusText}`,
                        );
                }

                const data =
                        await response.json() as RunSignupRacesResponse;

                const races =
                        Array.isArray(data.races)
                                ? data.races
                                : [];

                const items: SourceObject[] =
                        races.map(({ race }) => ({
                                source: this.id,
                                sourceType: "race",
                                sourceId:
                                        String(race.race_id),
                                title:
                                        race.name ?? null,
                                status:
                                        race.is_draft_race === "T"
                                                ? "draft"
                                                : "active",
                                metadata: {
                                        nextDate:
                                                race.next_date ?? null,
                                        nextEndDate:
                                                race.next_end_date ?? null,
                                        registrationOpen:
                                                race.is_registration_open === "T",
                                        private:
                                                race.is_private_race === "T",
                                        url:
                                                race.url ?? null,
                                        lastModified:
                                                race.last_modified ?? null,
                                        events:
                                                Array.isArray(race.events)
                                                        ? race.events
                                                        : [],
                                },
                                raw: race,
                        }));

                const modifiedDates =
                        items
                                .map((item) =>
                                        item.metadata?.lastModified,
                                )
                                .filter(
                                        (value): value is string =>
                                                typeof value === "string" &&
                                                value.length > 0,
                                )
                                .sort();

                const nextCursor =
                        modifiedDates.length > 0
                                ? {
                                          value:
                                                  modifiedDates[
                                                          modifiedDates.length - 1
                                                  ],
                                  }
                                : cursor ?? null;

                return {
                        items,
                        nextCursor,
                };
        }
}