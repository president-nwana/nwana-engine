// NWANA Engine — manual last mile distribution packs.
//
// Pure functions: object data in, copy-ready pack out. No I/O, no network,
// no D1. The machine prepares; the owner posts manually on each channel.
//
// Hard rule: never invent facts. Every dynamic value comes from the
// caller-supplied PackObjectData. A missing value becomes a
// "[NEEDS: field label]" placeholder in the text and an entry in
// missingFields — never a hallucinated name, date, or number.

export type PackObjectType =
	| "series_results"
	| "competition_event"
	| "championship"
	| "challenge"
	| "news_item";

/**
 * News sub-kind. "elite_athlete_joined" shapes the congratulatory frame;
 * any other value falls back to the generic NWANA news frame. The kind is
 * a caller-supplied label — the machine never derives it from a URL.
 */
export type NewsKind = "elite_athlete_joined" | string;

export type PackChannel =
	| "threads"
	| "linkedin"
	| "youtube"
	| "eventbrite"
	| "generic";

export interface PackTopEntry {
	name: string;
	detail?: string | null;
}

export interface PackObjectData {
	title?: string | null;
	description?: string | null;
	eventDate?: string | null;
	location?: string | null;
	distance?: string | null;
	format?: string | null;
	registrationUrl?: string | null;
	resultsUrl?: string | null;
	top3?: PackTopEntry[] | null;
	deadline?: string | null;
	mechanics?: string | null;
	selectionNote?: string | null;
	// --- news_item fields -------------------------------------------------
	/** Canonical URL of the already-published news item. Never recreated. */
	canonicalUrl?: string | null;
	/** News sub-kind, e.g. "elite_athlete_joined". */
	newsKind?: string | null;
	/** Person the news is about (elite_athlete_joined). */
	personName?: string | null;
	/** Link to the person's profile page, if one exists. */
	personProfileUrl?: string | null;
	/** One-line factual achievement summary (verified, caller-supplied). */
	achievement?: string | null;
	/** Publication date of the news item, display form. */
	newsDate?: string | null;
}

export interface PackImageSpec {
	kind: "result_card" | "event_poster" | "announcement";
	headline: string;
	subline: string;
	brand: "NWANA";
}

export interface DistributionPack {
	objectType: PackObjectType;
	channel: PackChannel;
	/** YouTube video title / Eventbrite event name. Null on other channels. */
	title: string | null;
	/** The copy-ready post body (Eventbrite: event description). */
	text: string;
	hashtags: string[];
	targetUrl: string | null;
	imageSpec: PackImageSpec;
	truncated: boolean;
	missingFields: string[];
}

const BASE_HASHTAGS = ["#NordicWalking", "#NWANA", "#NordicWalkingUSA"];

const TYPE_HASHTAGS: Record<PackObjectType, string[]> = {
	series_results: ["#OpenSeries"],
	competition_event: ["#OpenSeries"],
	championship: ["#Championships"],
	challenge: ["#Challenge"],
	news_item: [],
};

/** Extra hashtags per news sub-kind. */
const NEWS_KIND_HASHTAGS: Record<string, string[]> = {
	elite_athlete_joined: ["#EliteAthletes"],
};

const OBJECT_TYPE_LABEL: Record<PackObjectType, string> = {
	series_results: "Series results",
	competition_event: "Competition event",
	championship: "Championship",
	challenge: "Challenge",
	news_item: "NWANA news",
};

// Max characters for the full post text (body + hashtags), per channel.
const TEXT_LIMIT: Record<PackChannel, number> = {
	threads: 500,
	linkedin: 3000,
	youtube: 4000,
	eventbrite: 4000,
	generic: 4000,
};

// Max characters for the title field where the channel has one.
const TITLE_LIMIT: Partial<Record<PackChannel, number>> = {
	youtube: 100,
	eventbrite: 75,
};

interface Builder {
	missing: Set<string>;
}

function need(b: Builder, value: string | null | undefined, fieldLabel: string): string {
	const v = (value ?? "").trim();
	if (v.length > 0) return v;
	b.missing.add(fieldLabel);
	return `[NEEDS: ${fieldLabel}]`;
}

function optional(value: string | null | undefined): string | null {
	const v = (value ?? "").trim();
	return v.length > 0 ? v : null;
}

function fit(text: string, limit: number): { text: string; truncated: boolean } {
	if (text.length <= limit) return { text, truncated: false };
	const cut = text.lastIndexOf(" ", limit - 1);
	const head = (cut > limit * 0.5 ? text.slice(0, cut) : text.slice(0, limit - 1)).trimEnd();
	return { text: head + "…", truncated: true };
}

interface BodyParts {
	lines: string[];
	imageKind: PackImageSpec["kind"];
	imageHeadline: string;
	imageSubline: string;
	targetUrl: string | null;
}

function buildBody(
	objectType: PackObjectType,
	channel: PackChannel,
	data: PackObjectData,
	b: Builder,
): BodyParts {
	switch (objectType) {
		case "series_results":
			return bodySeriesResults(channel, data, b);
		case "competition_event":
			return bodyCompetitionEvent(channel, data, b);
		case "championship":
			return bodyChampionship(channel, data, b);
		case "challenge":
			return bodyChallenge(channel, data, b);
		case "news_item":
			return bodyNewsItem(channel, data, b);
	}
	// Unreachable: exhaustive switch over PackObjectType.
	throw new Error(`Unknown pack object type: ${objectType}`);
}

function introFor(channel: PackChannel, objectType: PackObjectType, newsKind?: string | null): string | null {
	// LinkedIn is the B2B channel (sponsors, insurers, cities, partners);
	// give it an angle the athlete-facing channels do not need.
	if (channel !== "linkedin") return null;
	switch (objectType) {
		case "series_results":
			return "The NWANA Open Series keeps growing — and the results keep getting faster.";
		case "competition_event":
			return "NWANA is bringing sanctioned Nordic Walking competition to more cities.";
		case "championship":
			return "North America is getting its own Nordic Walking championship infrastructure.";
		case "challenge":
			return "NWANA Challenges turn everyday walkers into committed participants.";
		case "news_item":
			return newsKind === "elite_athlete_joined"
				? "World-class athletes keep choosing NWANA — our Elite Athletes Club is growing."
				: "NWANA news: one more step for Nordic Walking in North America.";
	}
}

function bodySeriesResults(channel: PackChannel, data: PackObjectData, b: Builder): BodyParts {
	const title = need(b, data.title, "event title");
	const distance = need(b, data.distance, "distance");
	const resultsUrl = need(b, data.resultsUrl, "results URL");
	const lines: string[] = [];
	const intro = introFor(channel, "series_results");
	if (intro) lines.push(intro, "");
	lines.push(`🏆 ${title} — ${distance} results are in!`, "");
	const top = (data.top3 ?? []).filter((e) => e && e.name.trim().length > 0);
	const medals = ["🥇", "🥈", "🥉"];
	if (top.length === 0) {
		b.missing.add("top-3 finishers");
		for (let i = 0; i < 3; i++) lines.push(`${medals[i]} [NEEDS: finisher ${i + 1} name]`);
	} else {
		for (let i = 0; i < 3; i++) {
			const entry = top[i];
			if (!entry) {
				b.missing.add("top-3 finishers");
				lines.push(`${medals[i]} [NEEDS: finisher ${i + 1} name]`);
			} else {
				const detail = optional(entry.detail);
				lines.push(`${medals[i]} ${entry.name}${detail ? ` — ${detail}` : ""}`);
			}
		}
	}
	lines.push("", `Full standings: ${resultsUrl}`);
	const desc = optional(data.description);
	if (desc) lines.push("", desc);
	return {
		lines,
		imageKind: "result_card",
		imageHeadline: title,
		imageSubline: `${distance} — results`,
		targetUrl: optional(data.resultsUrl),
	};
}

function bodyCompetitionEvent(channel: PackChannel, data: PackObjectData, b: Builder): BodyParts {
	const title = need(b, data.title, "event title");
	const eventDate = need(b, data.eventDate, "event date");
	const location = need(b, data.location, "location");
	const distance = need(b, data.distance, "distances");
	const registrationUrl = need(b, data.registrationUrl, "registration URL");
	const lines: string[] = [];
	const intro = introFor(channel, "competition_event");
	if (intro) lines.push(intro, "");
	lines.push(`📍 ${title}`, `📅 ${eventDate}`, `📌 ${location}`, `🏁 Distances: ${distance}`, "");
	const desc = optional(data.description);
	if (desc) lines.push(desc, "");
	const format = optional(data.format);
	if (format) lines.push(`Format: ${format}`, "");
	lines.push(`Register: ${registrationUrl}`);
	return {
		lines,
		imageKind: "event_poster",
		imageHeadline: title,
		imageSubline: `${eventDate} · ${location}`,
		targetUrl: optional(data.registrationUrl),
	};
}

function bodyChampionship(channel: PackChannel, data: PackObjectData, b: Builder): BodyParts {
	const title = need(b, data.title, "championship title");
	const eventDate = need(b, data.eventDate, "event date");
	const location = need(b, data.location, "location");
	const selectionNote = need(b, data.selectionNote, "qualification / selection details");
	const registrationUrl = need(b, data.registrationUrl, "registration URL");
	const lines: string[] = [];
	const intro = introFor(channel, "championship");
	if (intro) lines.push(intro, "");
	lines.push(
		`🏆 ${title}`,
		"The first North American Nordic Walking championship — continental titles on the line.",
		"",
		`📅 ${eventDate}`,
		`📌 ${location}`,
		"",
		`Qualification: ${selectionNote}`,
		"",
	);
	const desc = optional(data.description);
	if (desc) lines.push(desc, "");
	lines.push(`Register: ${registrationUrl}`);
	return {
		lines,
		imageKind: "event_poster",
		imageHeadline: title,
		imageSubline: "North American Championship",
		targetUrl: optional(data.registrationUrl),
	};
}

function bodyChallenge(channel: PackChannel, data: PackObjectData, b: Builder): BodyParts {
	const title = need(b, data.title, "challenge title");
	const mechanics = need(b, data.mechanics, "challenge mechanics (how it works)");
	const deadline = need(b, data.deadline, "deadline");
	const registrationUrl = need(b, data.registrationUrl, "join / registration URL");
	const lines: string[] = [];
	const intro = introFor(channel, "challenge");
	if (intro) lines.push(intro, "");
	lines.push(`💪 ${title}`, "", mechanics, "", `⏳ Deadline: ${deadline}`, "");
	const desc = optional(data.description);
	if (desc) lines.push(desc, "");
	lines.push(`Join: ${registrationUrl}`);
	return {
		lines,
		imageKind: "announcement",
		imageHeadline: title,
		imageSubline: `Deadline ${deadline}`,
		targetUrl: optional(data.registrationUrl),
	};
}

/**
 * NWANA news item. The canonical news page already exists (site or
 * site_news); the pack points at its canonical URL and never recreates it.
 * Copy is congratulatory, factual only: every dynamic value comes from the
 * caller-supplied PackObjectData. Missing values become "[NEEDS: …]"
 * placeholders, never invented achievements.
 */
function bodyNewsItem(channel: PackChannel, data: PackObjectData, b: Builder): BodyParts {
	const title = need(b, data.title, "news headline");
	const canonicalUrl = need(b, data.canonicalUrl, "canonical news URL");
	const lines: string[] = [];
	const intro = introFor(channel, "news_item", data.newsKind);
	if (intro) lines.push(intro, "");
	const kind = (data.newsKind ?? "").trim();
	if (kind === "elite_athlete_joined") {
		const person = need(b, data.personName, "athlete name");
		const achievement = optional(data.achievement);
		lines.push(`🎉 ${person} joins the NWANA Elite Athletes Club!`, "");
		if (achievement) lines.push(achievement, "");
		const profile = optional(data.personProfileUrl);
		if (profile) lines.push(`Athlete profile: ${profile}`, "");
		lines.push(`Full story: ${canonicalUrl}`);
		return {
			lines,
			imageKind: "announcement",
			imageHeadline: person,
			imageSubline: "NWANA Elite Athletes Club",
			targetUrl: optional(data.canonicalUrl),
		};
	}
	// Generic NWANA news frame.
	const desc = optional(data.description);
	lines.push(`📰 ${title}`, "");
	if (desc) lines.push(desc, "");
	lines.push(`Read more: ${canonicalUrl}`);
	return {
		lines,
		imageKind: "announcement",
		imageHeadline: title,
		imageSubline: "NWANA news",
		targetUrl: optional(data.canonicalUrl),
	};
}

function buildTitle(
	channel: PackChannel,
	data: PackObjectData,
	b: Builder,
): string | null {
	const limit = TITLE_LIMIT[channel];
	if (!limit) return null;
	const raw = need(b, data.title, "event title");
	const fitted = fit(raw, limit);
	return fitted.text;
}

/**
 * Build one manual last mile pack: copy-ready text for a single channel.
 * Pure: no I/O. Missing data becomes "[NEEDS: …]" placeholders.
 */
export function buildPack(
	objectType: PackObjectType,
	data: PackObjectData,
	channel: PackChannel,
): DistributionPack {
	const b: Builder = { missing: new Set<string>() };
	const body = buildBody(objectType, channel, data, b);
	const hashtags = [
		...BASE_HASHTAGS,
		...TYPE_HASHTAGS[objectType],
		...(NEWS_KIND_HASHTAGS[(data.newsKind ?? "").trim()] ?? []),
	];
	const rawText = body.lines.join("\n") + "\n\n" + hashtags.join(" ");
	const fitted = fit(rawText, TEXT_LIMIT[channel]);
	return {
		objectType,
		channel,
		title: buildTitle(channel, data, b),
		text: fitted.text,
		hashtags,
		targetUrl: body.targetUrl,
		imageSpec: {
			kind: body.imageKind,
			headline: body.imageHeadline,
			subline: body.imageSubline,
			brand: "NWANA",
		},
		truncated: fitted.truncated,
		missingFields: [...b.missing],
	};
}

/**
 * Build packs for every channel for one object. Convenience wrapper for
 * the owner UI; still pure. A news item is not an event listing, so the
 * eventbrite channel is skipped for news_item.
 */
export function buildAllPacks(
	objectType: PackObjectType,
	data: PackObjectData,
): Record<PackChannel, DistributionPack> {
	const channels: PackChannel[] =
		objectType === "news_item"
			? ["threads", "linkedin", "youtube", "generic"]
			: ["threads", "linkedin", "youtube", "eventbrite", "generic"];
	const out = {} as Record<PackChannel, DistributionPack>;
	for (const channel of channels) out[channel] = buildPack(objectType, data, channel);
	return out;
}

export function packObjectTypeLabel(objectType: PackObjectType): string {
	return OBJECT_TYPE_LABEL[objectType];
}

export const PACK_CHANNELS: readonly PackChannel[] = [
	"threads",
	"linkedin",
	"youtube",
	"eventbrite",
	"generic",
];

export const PACK_OBJECT_TYPES: readonly PackObjectType[] = [
	"series_results",
	"competition_event",
	"championship",
	"challenge",
	"news_item",
];
