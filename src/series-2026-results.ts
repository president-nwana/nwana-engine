export interface Series2026Source {
	distance: string;
	raceId: number;
	raceSeriesId: number;
	raceSeriesYearId: number;
}

export const SERIES_2026_SOURCES: readonly Series2026Source[] = [
	{ distance: "1K", raceId: 209980, raceSeriesId: 1444, raceSeriesYearId: 2110 },
	{ distance: "3K", raceId: 210000, raceSeriesId: 1447, raceSeriesYearId: 2112 },
	{ distance: "5K", raceId: 209477, raceSeriesId: 1439, raceSeriesYearId: 2102 },
	{ distance: "10K", raceId: 210018, raceSeriesId: 1449, raceSeriesYearId: 2114 },
	{ distance: "15K", raceId: 210016, raceSeriesId: 1448, raceSeriesYearId: 2113 },
	{ distance: "20K", raceId: 210020, raceSeriesId: 1450, raceSeriesYearId: 2115 },
] as const;

export interface Series2026LevelDefinition {
	name: "Elite" | "High Performance" | "Performance" | "Competitive" | "Open";
	threshold: string;
}

const SERIES_2026_THRESHOLDS: Readonly<Record<string, readonly string[]>> = {
	"1K": ["6:00", "6:30", "7:00", "7:30"],
	"3K": ["20:00", "21:00", "22:00", "23:00"],
	"5K": ["33:00", "35:00", "37:00", "40:00"],
	"10K": ["1:05:00", "1:10:00", "1:15:00", "1:20:00"],
	"15K": ["1:40:00", "1:50:00", "2:00:00", "2:10:00"],
	"20K": ["2:20:00", "2:30:00", "2:40:00", "2:50:00"],
};

export function getSeries2026LevelDefinitions(
	distance: string,
): readonly Series2026LevelDefinition[] {
	const thresholds = SERIES_2026_THRESHOLDS[distance];
	if (!thresholds) throw new Error(`Unknown Series 2026 distance: ${distance}`);
	return [
		{ name: "Elite", threshold: `< ${thresholds[0]}` },
		{ name: "High Performance", threshold: `< ${thresholds[1]}` },
		{ name: "Performance", threshold: `< ${thresholds[2]}` },
		{ name: "Competitive", threshold: `< ${thresholds[3]}` },
		{ name: "Open", threshold: `${thresholds[3]}+` },
	];
}

type UnknownRecord = Record<string, unknown>;

export interface Series2026ResultSetInput {
	source: Series2026Source;
	eventId: number;
	eventName: string | null;
	resultSetId: number;
	resultSet: UnknownRecord;
	resultsPageUrl?: string | null;
}

function asRecord(value: unknown): UnknownRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as UnknownRecord
		: null;
}

function text(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const normalized = String(value).trim();
	return normalized.length > 0 ? normalized : null;
}

function headerLabel(value: unknown): string | null {
	const direct = text(value);
	if (direct && typeof value !== "object") return direct;
	const record = asRecord(value);
	if (!record) return null;
	return text(record.column_text ?? record.label ?? record.name ?? record.field_name);
}

function findHeaderKey(headers: unknown, expectedLabel: string): string | null {
	const record = asRecord(headers);
	if (!record) return null;
	const wanted = expectedLabel.toLowerCase();
	for (const [key, value] of Object.entries(record)) {
		if (headerLabel(value)?.toLowerCase() === wanted) return key;
	}
	return null;
}

function resultValue(result: UnknownRecord, headerKey: string | null): string | null {
	if (!headerKey) return null;
	return text(result[headerKey]);
}

const LEVEL_ORDER = [
	"Elite",
	"High Performance",
	"Performance",
	"Competitive",
	"Open",
] as const;

function levelOrder(value: string | null): number {
	if (!value) return LEVEL_ORDER.length;
	const index = LEVEL_ORDER.findIndex((level) => value.startsWith(level));
	return index === -1 ? LEVEL_ORDER.length : index;
}

function genderLabel(value: string | null): string {
	switch (value?.toUpperCase()) {
		case "M": return "Men";
		case "F": return "Women";
		case "X": return "Non-binary";
		default: return value ?? "Division";
	}
}

export function buildSeries2026PublicationDraft(input: Series2026ResultSetInput) {
	const headers = input.resultSet.results_headers;
	const levelKey = findHeaderKey(headers, "Performance Level");
	const levelPlaceKey = findHeaderKey(headers, "Level Place");
	const rawResults = Array.isArray(input.resultSet.results)
		? input.resultSet.results
		: [];
	const rows = rawResults
		.map(asRecord)
		.filter((result): result is UnknownRecord => result !== null)
		.map((result) => ({
			result_id: text(result.result_id),
			athlete: [text(result.first_name), text(result.last_name)].filter(Boolean).join(" "),
			gender: text(result.gender),
			time: text(result.chip_time) ?? text(result.clock_time),
			performance_level: resultValue(result, levelKey),
			level_place: resultValue(result, levelPlaceKey),
		}));

	const finalized =
		rows.length > 0 &&
		levelKey !== null &&
		levelPlaceKey !== null &&
		rows.every((row) => row.performance_level !== null && row.level_place !== null);
	const fullResultsUrl =
		text(input.resultSet.results_source_url) ??
		text(input.resultsPageUrl);
	const winners = rows
		.filter((row) => row.level_place === "1")
		.sort((left, right) => {
			const levelDifference =
				levelOrder(left.performance_level) - levelOrder(right.performance_level);
			return levelDifference !== 0
				? levelDifference
				: (left.gender ?? "").localeCompare(right.gender ?? "");
		});
	const winnerLines = winners.map((winner) =>
		`${winner.performance_level} — ${genderLabel(winner.gender)}: ${winner.athlete}${winner.time ? ` — ${winner.time}` : ""}`
	);
	const postText = [
		"Official Results",
		input.eventName ?? `NWANA Open ${input.source.distance} Series`,
		"",
		...(winnerLines.length > 0
			? ["Level winners:", ...winnerLines]
			: []),
		...(fullResultsUrl
			? ["", `Full results: ${fullResultsUrl}`]
			: []),
	].join("\n");

	const sourceKey = [
		"runsignup",
		"series-2026",
		input.source.raceId,
		input.eventId,
		input.resultSetId,
	].join(":");

	return {
		publication_key: sourceKey,
		status: "DRAFT" as const,
		mode: "PLAN_ONLY" as const,
		execution_allowed: false as const,
		requires_review: true as const,
		ready_for_editorial_review: finalized,
		source: {
			platform: "RUNSIGNUP" as const,
			season: 2026,
			distance: input.source.distance,
			race_id: input.source.raceId,
			race_series_id: input.source.raceSeriesId,
			race_series_year_id: input.source.raceSeriesYearId,
			event_id: input.eventId,
			result_set_id: input.resultSetId,
		},
		editorial_draft: {
			status: "DRAFT" as const,
			title: input.eventName
				? `${input.eventName} — Official Results`
				: `NWANA Open ${input.source.distance} Series — Official Results`,
			post_text: postText,
			link_url: fullResultsUrl,
			image_url: null,
			winner_count: winners.length,
			ready_for_approval: finalized && fullResultsUrl !== null,
			blocking_reasons: [
				...(!finalized ? ["RESULTS_NOT_FINALIZED"] : []),
				...(fullResultsUrl === null ? ["RESULTS_URL_REQUIRED"] : []),
			],
		},
		content: {
			title: input.eventName
				? `${input.eventName} — Results`
				: `NWANA Open ${input.source.distance} Series — Results`,
			content_scope: "SERIES_2026_RESULTS" as const,
			results: rows,
		},
		verification: {
			result_count: rows.length,
			performance_level_field_found: levelKey !== null,
			level_place_field_found: levelPlaceKey !== null,
			all_results_finalized: finalized,
		},
	};
}

function resultTimeSeconds(value: string | null): number | null {
	if (!value) return null;
	const parts = value.split(":").map(Number);
	if (
		(parts.length !== 2 && parts.length !== 3) ||
		parts.some((part) => !Number.isFinite(part) || part < 0)
	) return null;
	return parts.length === 2
		? parts[0] * 60 + parts[1]
		: parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function annotateSeries2026Records(
	drafts: ReturnType<typeof buildSeries2026PublicationDraft>[],
) {
	const fastest = new Map<string, number>();
	for (const draft of drafts) {
		if (!draft.ready_for_editorial_review) continue;
		for (const row of draft.content.results) {
			const seconds = resultTimeSeconds(row.time);
			if (seconds === null || !row.gender) continue;
			const key = `${draft.source.distance}:${row.gender.toUpperCase()}`;
			const current = fastest.get(key);
			if (current === undefined || seconds < current) fastest.set(key, seconds);
		}
	}

	return drafts.map((draft) => {
		const results = draft.content.results.map((row) => {
			const seconds = resultTimeSeconds(row.time);
			const key = row.gender
				? `${draft.source.distance}:${row.gender.toUpperCase()}`
				: null;
			return {
				...row,
				series_record:
					draft.ready_for_editorial_review &&
					seconds !== null &&
					key !== null &&
					fastest.get(key) === seconds,
			};
		});
		const winners = results.filter((row) => row.level_place === "1");
		const winnerNames = [...new Set(winners.map((row) => row.athlete).filter(Boolean))];
		const eventTitle = draft.content.title.replace(/\\s+— Results$/, "");
		const congratulations = winnerNames.length === 1
			? `Congratulations to ${winnerNames[0]} on an outstanding performance in the ${eventTitle}!`
			: winnerNames.length > 1
				? `Congratulations to ${winnerNames.join(", ")} on their outstanding performances in the ${eventTitle}!`
				: `Congratulations to everyone who completed the ${eventTitle}!`;
		const recordLines = winners
			.filter((row) => row.series_record)
			.map((row) =>
				`${genderLabel(row.gender)}'s Series Record: ${row.athlete}${row.time ? ` — ${row.time}` : ""}`
			);
		const winnerLines = winners.map((row) =>
			`${row.performance_level} — ${genderLabel(row.gender)}: ${row.athlete}${row.time ? ` — ${row.time}` : ""}`
		);
		const postText = [
			congratulations,
			...(recordLines.length > 0 ? ["", ...recordLines] : []),
			...(winnerLines.length > 0 ? ["", "Level winners:", ...winnerLines] : []),
			...(draft.editorial_draft.link_url
				? ["", `Full results: ${draft.editorial_draft.link_url}`]
				: []),
		].join("\\n");

		return {
			...draft,
			editorial_draft: {
				...draft.editorial_draft,
				post_text: postText,
			},
			content: {
				...draft.content,
				results,
			},
		};
	});
}

async function getJson(
	url: URL,
	accessToken: string,
	apiCallerToken?: string,
	apiCallerSecret?: string,
): Promise<UnknownRecord> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${accessToken}`,
	};
	if (apiCallerToken && apiCallerSecret) {
		url.searchParams.set("rsu_api_reg", apiCallerToken);
		headers["X-RSU-API-REG-SECRET"] = apiCallerSecret;
	}
	const response = await fetch(url, { headers });
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`RunSignup request failed: ${response.status} ${response.statusText} for ${url.pathname} :: ${body.slice(0, 500)}`,
		);
	}
	return await response.json() as UnknownRecord;
}

export interface Series2026PreviewOptions {
	distance?: string;
	raceId?: number;
	apiCallerToken?: string;
	apiCallerSecret?: string;
}

export async function previewSeries2026ResultPublications(
	accessToken: string,
	options: Series2026PreviewOptions = {},
) {
	const drafts = [];
	const sources = SERIES_2026_SOURCES.filter((source) =>
		(options.distance === undefined || source.distance === options.distance) &&
		(options.raceId === undefined || source.raceId === options.raceId)
	);
	if (sources.length === 0) {
		throw new Error("Unknown Series 2026 source filter");
	}
	for (const source of sources) {
		const raceUrl = new URL(`https://api.runsignup.com/rest/race/${source.raceId}`);
		raceUrl.searchParams.set("format", "json");
		raceUrl.searchParams.set("events", "T");
		const raceResponse = await getJson(raceUrl, accessToken, options.apiCallerToken, options.apiCallerSecret);
		const race = asRecord(raceResponse.race);
		const events = race && Array.isArray(race.events) ? race.events : [];
		const raceResultsPageUrl = text(race?.url)
			? `${text(race?.url)?.replace(/\/$/, "")}/Results`
			: null;

		for (const rawEvent of events) {
			const event = asRecord(rawEvent);
			const eventId = Number(event?.event_id);
			if (!event || !Number.isInteger(eventId)) continue;

			const setsUrl = new URL(`https://api.runsignup.com/rest/race/${source.raceId}/results/get-result-sets`);
			setsUrl.searchParams.set("format", "json");
			setsUrl.searchParams.set("event_id", String(eventId));
			const setsResponse = await getJson(setsUrl, accessToken, options.apiCallerToken, options.apiCallerSecret);
			const sets = Array.isArray(setsResponse.individual_results_sets)
				? setsResponse.individual_results_sets
				: [];

			for (const rawSet of sets) {
				const set = asRecord(rawSet);
				const resultSetId = Number(set?.individual_result_set_id);
				if (!set || !Number.isInteger(resultSetId)) continue;

				const resultsUrl = new URL(`https://api.runsignup.com/rest/race/${source.raceId}/results/get-results`);
				resultsUrl.searchParams.set("format", "json");
				resultsUrl.searchParams.set("event_id", String(eventId));
				resultsUrl.searchParams.set("individual_result_set_id", String(resultSetId));
				resultsUrl.searchParams.set("results_per_page", "1000");
				const resultsResponse = await getJson(resultsUrl, accessToken, options.apiCallerToken, options.apiCallerSecret);
				const resultSets = Array.isArray(resultsResponse.individual_results_sets)
					? resultsResponse.individual_results_sets
					: [];
				const resultSet = asRecord(resultSets[0]);
				if (!resultSet) continue;

				drafts.push(buildSeries2026PublicationDraft({
					source,
					eventId,
					eventName: text(event.name),
					resultSetId,
					resultSet,
					resultsPageUrl:
						text(resultSet.results_source_url) ??
						raceResultsPageUrl,
				}));
			}
		}
	}

	const draftsWithRecords = annotateSeries2026Records(drafts);
	return {
		ok: true,
		mode: "PLAN_ONLY" as const,
		execution_allowed: false as const,
		legacy_publisher_allowed: false as const,
		drafts: draftsWithRecords,
		summary: {
			result_sets: draftsWithRecords.length,
			ready_for_editorial_review: draftsWithRecords.filter((draft) => draft.ready_for_editorial_review).length,
		},
	};
}


export function applySeries2026PublicationHistory(
	drafts: ReturnType<typeof buildSeries2026PublicationDraft>[],
	historyKeys: ReadonlySet<string>,
) {
	return drafts.map((draft) => {
		const historical = historyKeys.has(draft.publication_key);
		return {
			...draft,
			publication_status: historical
				? "LEGACY_BASELINE" as const
				: "NEW" as const,
			publication_required:
				draft.ready_for_editorial_review && !historical,
		};
	});
}
