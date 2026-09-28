/**
 * Read-only Meta (Facebook + Instagram) metrics layer.
 *
 * The Meta integration used to be publish-only. NWANA_META_TOKEN is a 60-day
 * Meta user token stored as a Worker secret (PROVEN working in production:
 * GET /v23.0/me/accounts succeeds). This module adds read paths — page
 * followers, Page Insights, Instagram account and media insights — normalised
 * into CanonicalMetric records for the Operating Center and exports.
 *
 * Read-only: never publishes, never mutates anything. On-demand only, no cron.
 * API errors are classified into data-quality states and never thrown; each
 * destination in the overview is failure-isolated from the others.
 */

import { RESULT_DESTINATIONS } from "./meta-result-publisher";

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface MetaEnv {
	NWANA_META_TOKEN?: string;
}

export type MetaDataQuality =
	| "LIVE_VERIFIED"
	| "LIVE_PARTIAL"
	| "SOURCE_API_ERROR"
	| "SOURCE_AUTH_ERROR"
	| "OWNER_ACTION_REQUIRED";

export interface CanonicalMetric {
	metric_name: string;
	source: "facebook" | "instagram";
	source_account: string;
	value: number;
	unit: "count" | "percent";
	scope?: string;
	geography?: string;
	period_start: string;
	period_end: string;
	fetched_at: string;
	data_quality: MetaDataQuality;
	quality_note?: string;
}

export interface MetaReadRange {
	startDate?: string;
	endDate?: string;
}

export interface MetaDestinationResult {
	id: string;
	name: string;
	platform: "facebook" | "instagram";
	metrics: CanonicalMetric[];
	data_quality: MetaDataQuality;
	error?: string;
}

export interface MetaSocialOverview {
	ok: boolean;
	period: { start: string; end: string };
	generated_at: string;
	destinations: MetaDestinationResult[];
	error?: string;
}

type FetchLike = typeof fetch;

interface GraphApiError {
	code?: number;
	error_subcode?: number;
	message?: string;
	type?: string;
}

type GraphResult =
	| { ok: true; data: Record<string, unknown> }
	| { ok: false; error: GraphApiError; httpStatus: number };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET a Graph API URL, preserving the structured error payload instead of throwing. */
async function graphGet(url: string, fetcher: FetchLike): Promise<GraphResult> {
	let response: Response;
	try {
		response = await fetcher(url);
	} catch (error) {
		return {
			ok: false,
			error: { message: error instanceof Error ? error.message : "Network request failed" },
			httpStatus: 0,
		};
	}
	let data: Record<string, unknown>;
	try {
		data = (await response.json()) as Record<string, unknown>;
	} catch {
		return {
			ok: false,
			error: { message: `Meta returned a non-JSON response (HTTP ${response.status})` },
			httpStatus: response.status,
		};
	}
	const apiError = data.error as GraphApiError | undefined;
	if (!response.ok || apiError) {
		return {
			ok: false,
			error: {
				code: apiError?.code,
				error_subcode: apiError?.error_subcode,
				message: apiError?.message ?? `Meta request failed (HTTP ${response.status})`,
				type: apiError?.type,
			},
			httpStatus: response.status,
		};
	}
	return { ok: true, data };
}

function classifyGraphError(error: GraphApiError): { data_quality: MetaDataQuality; note: string } {
	const code = error.code;
	if (code === 190) {
		return {
			data_quality: "SOURCE_AUTH_ERROR",
			note: "Meta OAuth token invalid or expired (Graph error 190). The 60-day NWANA_META_TOKEN user token must be refreshed by the owner before reads can resume.",
		};
	}
	if (code === 10 || code === 200) {
		return {
			data_quality: "OWNER_ACTION_REQUIRED",
			note: `Meta denied the read (Graph error ${code}): the token lacks the required permission. Grant read_insights and pages_read_engagement for the NWANA Facebook Page / connected Instagram business account, then retry. Detail: ${error.message ?? "none"}`,
		};
	}
	return {
		data_quality: "SOURCE_API_ERROR",
		note: error.message
			? `Meta API error${code !== undefined ? ` (code ${code})` : ""}: ${error.message}`
			: "Meta API error (no message returned)",
	};
}

/**
 * Page-token derivation replicating the getFacebookPageToken pattern from
 * meta-result-publisher.ts, but returning the structured API error instead of
 * throwing so callers can classify it into a data-quality state.
 */
async function derivePageToken(
	userToken: string,
	pageId: string,
	fetcher: FetchLike,
): Promise<{ token: string } | { error: GraphApiError }> {
	const url = new URL(`${GRAPH_BASE}/me/accounts`);
	url.searchParams.set("fields", "id,name,access_token");
	url.searchParams.set("access_token", userToken);
	const result = await graphGet(url.toString(), fetcher);
	if (!result.ok) return { error: result.error };
	const pages = Array.isArray(result.data.data) ? result.data.data : [];
	const page = pages.find((value) =>
		value !== null && typeof value === "object" &&
		String((value as Record<string, unknown>).id) === pageId
	) as Record<string, unknown> | undefined;
	const token = page?.access_token;
	if (typeof token !== "string" || token.length === 0) {
		return { error: { message: `Facebook Page token was not returned by Meta for page ${pageId}` } };
	}
	return { token };
}

function toNumber(value: unknown): number | null {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

/** Sum the numeric day values of one insights entry; non-numeric breakdowns are skipped. */
function sumInsightValues(entry: Record<string, unknown>): number | null {
	const values = Array.isArray(entry.values) ? entry.values : [];
	let total = 0;
	let seen = 0;
	for (const item of values) {
		if (item !== null && typeof item === "object") {
			const n = toNumber((item as Record<string, unknown>).value);
			if (n !== null) {
				total += n;
				seen += 1;
			}
		}
	}
	return seen > 0 ? total : null;
}

function findInsightEntry(data: Record<string, unknown>, metric: string): Record<string, unknown> | null {
	const entries = Array.isArray(data.data) ? data.data : [];
	for (const entry of entries) {
		if (entry !== null && typeof entry === "object" &&
			(entry as Record<string, unknown>).name === metric) {
			return entry as Record<string, unknown>;
		}
	}
	return null;
}

function shiftDate(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function resolveRange(range: MetaReadRange): { start: string; end: string } {
	const today = new Date().toISOString().slice(0, 10);
	const end = range.endDate && DATE_RE.test(range.endDate) ? range.endDate : today;
	const start = range.startDate && DATE_RE.test(range.startDate) ? range.startDate : shiftDate(end, -6);
	if (start > end) return { start: end, end: start };
	return { start, end };
}

function buildMetric(params: {
	metric_name: string;
	source: "facebook" | "instagram";
	source_account: string;
	value: number;
	unit?: "count" | "percent";
	scope?: string;
	geography?: string;
	period_start: string;
	period_end: string;
	fetched_at: string;
	data_quality: MetaDataQuality;
	quality_note?: string;
}): CanonicalMetric {
	return {
		metric_name: params.metric_name,
		source: params.source,
		source_account: params.source_account,
		value: params.value,
		unit: params.unit ?? "count",
		scope: params.scope,
		geography: params.geography,
		period_start: params.period_start,
		period_end: params.period_end,
		fetched_at: params.fetched_at,
		data_quality: params.data_quality,
		quality_note: params.quality_note,
	};
}

const DESTINATION_INDEX: Record<string, { name: string; platform: "facebook" | "instagram" }> = {
	[RESULT_DESTINATIONS.facebookNwana.pageId]: {
		name: RESULT_DESTINATIONS.facebookNwana.name,
		platform: "facebook",
	},
	[RESULT_DESTINATIONS.facebookNordicWalkingSport.pageId]: {
		name: RESULT_DESTINATIONS.facebookNordicWalkingSport.name,
		platform: "facebook",
	},
	[RESULT_DESTINATIONS.instagramNwanaOfficial.accountId]: {
		name: `@${RESULT_DESTINATIONS.instagramNwanaOfficial.name}`,
		platform: "instagram",
	},
	[RESULT_DESTINATIONS.instagramNwSport.accountId]: {
		name: `@${RESULT_DESTINATIONS.instagramNwSport.name}`,
		platform: "instagram",
	},
};

function destinationInfo(id: string): { name: string; platform: "facebook" | "instagram" } {
	return DESTINATION_INDEX[id] ?? { name: id, platform: "facebook" };
}

const MISSING_TOKEN_NOTE =
	"NWANA_META_TOKEN is not configured. Store the 60-day Meta user token as the Worker secret NWANA_META_TOKEN, then retry.";

/**
 * [apiMetric, canonicalName] pairs for Page Insights (period=day, summed over
 * the range). Verified against the Graph API changelog 2026-09-28: the
 * legacy page_impressions/page_reach/page_engaged_users family was REMOVED
 * by Meta in June 2026 (v26.0 applies to all versions; requests return
 * (#100)). Current replacements below.
 * Requires a Page access token + read_insights + pages_read_engagement.
 */
const PAGE_INSIGHT_DEFS: Array<[string, string]> = [
	["page_total_media_view_unique", "reach"],
	["page_media_view", "views"],
	["page_post_engagements", "post_engagements"],
	["page_total_actions", "page_actions"],
	["page_fan_adds_by_paid_non_paid_unique", "new_followers"],
];

function insightsUrl(objectId: string, metric: string, token: string, start: string, end: string): string {
	const url = new URL(`${GRAPH_BASE}/${objectId}/insights`);
	url.searchParams.set("metric", metric);
	url.searchParams.set("period", "day");
	url.searchParams.set("since", start);
	url.searchParams.set("until", end);
	url.searchParams.set("access_token", token);
	return url.toString();
}

/**
 * Read one Facebook Page: follower/like snapshot plus Page Insights summed
 * over the requested range. Never throws for API errors — they become
 * data-quality states on the destination result.
 */
export async function getMetaPageInsights(
	env: MetaEnv,
	pageId: string,
	range: MetaReadRange = {},
	fetcher: FetchLike = fetch,
): Promise<MetaDestinationResult> {
	const { start, end } = resolveRange(range);
	const fetchedAt = new Date().toISOString();
	const info = destinationInfo(pageId);
	const failed = (data_quality: MetaDataQuality, note: string): MetaDestinationResult => ({
		id: pageId,
		name: info.name,
		platform: "facebook",
		metrics: [],
		data_quality,
		error: note,
	});
	if (!env.NWANA_META_TOKEN) return failed("OWNER_ACTION_REQUIRED", MISSING_TOKEN_NOTE);

	const tokenResult = await derivePageToken(env.NWANA_META_TOKEN, pageId, fetcher);
	if ("error" in tokenResult) {
		const classified = classifyGraphError(tokenResult.error);
		return failed(classified.data_quality, classified.note);
	}
	const pageToken = tokenResult.token;

	// Point-in-time page snapshot.
	const fieldsUrl = new URL(`${GRAPH_BASE}/${pageId}`);
	fieldsUrl.searchParams.set("fields", "fan_count,followers_count,name");
	fieldsUrl.searchParams.set("access_token", pageToken);
	const fieldsResult = await graphGet(fieldsUrl.toString(), fetcher);
	if (!fieldsResult.ok) {
		const classified = classifyGraphError(fieldsResult.error);
		return failed(classified.data_quality, classified.note);
	}
	const accountName = typeof fieldsResult.data.name === "string" && fieldsResult.data.name.length > 0
		? fieldsResult.data.name
		: info.name;
	const metrics: CanonicalMetric[] = [];
	const partialNotes: string[] = [];
	const followers = toNumber(fieldsResult.data.followers_count);
	if (followers !== null) {
		metrics.push(buildMetric({
			metric_name: "followers",
			source: "facebook",
			source_account: accountName,
			value: followers,
			scope: "page_total",
			period_start: start,
			period_end: end,
			fetched_at: fetchedAt,
			data_quality: "LIVE_VERIFIED",
			quality_note: "Point-in-time page follower count.",
		}));
	} else {
		partialNotes.push("followers_count was not returned by Meta");
	}
	const likes = toNumber(fieldsResult.data.fan_count);
	if (likes !== null) {
		metrics.push(buildMetric({
			metric_name: "page_likes",
			source: "facebook",
			source_account: accountName,
			value: likes,
			scope: "page_total",
			period_start: start,
			period_end: end,
			fetched_at: fetchedAt,
			data_quality: "LIVE_VERIFIED",
			quality_note: "Point-in-time page like count.",
		}));
	}

	// Page Insights: try one batched call first, then fall back per metric so
	// a single retired/unknown metric degrades to LIVE_PARTIAL instead of
	// failing the whole destination.
	const readOneMetric = async (apiMetric: string): Promise<GraphResult> =>
		graphGet(insightsUrl(pageId, apiMetric, pageToken, start, end), fetcher);

	const batchResult = await graphGet(
		insightsUrl(pageId, PAGE_INSIGHT_DEFS.map(([api]) => api).join(","), pageToken, start, end),
		fetcher,
	);
	if (batchResult.ok) {
		for (const [apiMetric, canonical] of PAGE_INSIGHT_DEFS) {
			const entry = findInsightEntry(batchResult.data, apiMetric);
			const total = entry ? sumInsightValues(entry) : null;
			if (total !== null) {
				metrics.push(buildMetric({
					metric_name: canonical,
					source: "facebook",
					source_account: accountName,
					value: total,
					scope: "period_total",
					period_start: start,
					period_end: end,
					fetched_at: fetchedAt,
					data_quality: "LIVE_VERIFIED",
				}));
			} else {
				partialNotes.push(`${apiMetric}: no numeric values returned`);
			}
		}
	} else {
		const classified = classifyGraphError(batchResult.error);
		if (classified.data_quality === "SOURCE_AUTH_ERROR" || classified.data_quality === "OWNER_ACTION_REQUIRED") {
			return failed(classified.data_quality, classified.note);
		}
		// Non-auth batch failure: retry each metric individually.
		let anyMetricOk = false;
		for (const [apiMetric, canonical] of PAGE_INSIGHT_DEFS) {
			const single = await readOneMetric(apiMetric);
			if (single.ok) {
				const entry = findInsightEntry(single.data, apiMetric);
				const total = entry ? sumInsightValues(entry) : null;
				if (total !== null) {
					anyMetricOk = true;
					metrics.push(buildMetric({
						metric_name: canonical,
						source: "facebook",
						source_account: accountName,
						value: total,
						scope: "period_total",
						period_start: start,
						period_end: end,
						fetched_at: fetchedAt,
						data_quality: "LIVE_VERIFIED",
					}));
					continue;
				}
			}
			partialNotes.push(`${apiMetric}: ${single.ok ? "no numeric values returned" : (single.error.message ?? "request failed")}`);
		}
		if (!anyMetricOk && metrics.length === 0) {
			// Insights fully failed but the page snapshot is live; keep the
			// snapshot metrics and mark partial rather than erroring out.
			if (partialNotes.length > 0 && followers === null && likes === null) {
				return failed("SOURCE_API_ERROR", `Page Insights unavailable: ${partialNotes.join("; ")}`);
			}
		}
	}

	const data_quality: MetaDataQuality = partialNotes.length > 0 ? "LIVE_PARTIAL" : "LIVE_VERIFIED";
	for (const metric of metrics) {
		if (partialNotes.length > 0 && metric.data_quality === "LIVE_VERIFIED" && metric.scope === "period_total") {
			metric.data_quality = "LIVE_PARTIAL";
			metric.quality_note = `Some Page Insights metrics were unavailable: ${partialNotes.join("; ")}`;
		}
	}
	return {
		id: pageId,
		name: accountName,
		platform: "facebook",
		metrics,
		data_quality,
		error: partialNotes.length > 0 ? `Partial: ${partialNotes.join("; ")}` : undefined,
	};
}

/**
 * [apiMetric, canonicalName] pairs for Instagram Insights (period=day, summed
 * over the range). Verified 2026-09-28: `impressions` was deprecated in
 * v22.0 and removed 2026-04-21 — the official replacement is `views`.
 * Requires instagram_basic + instagram_manage_insights on a
 * Business/Creator account.
 */
const IG_INSIGHT_DEFS: Array<[string, string]> = [
	["reach", "reach"],
	["views", "views"],
	["accounts_engaged", "accounts_engaged"],
	["total_interactions", "total_interactions"],
	["follows_and_unfollows", "follows_and_unfollows"],
	["profile_links_taps", "profile_links_taps"],
];

/**
 * Read one Instagram business account: follower/media snapshot plus
 * Instagram Insights summed over the requested range. Instagram reads use
 * the user token directly (no page token). Never throws for API errors.
 */
export async function getInstagramInsights(
	env: MetaEnv,
	igAccountId: string,
	range: MetaReadRange = {},
	fetcher: FetchLike = fetch,
): Promise<MetaDestinationResult> {
	const { start, end } = resolveRange(range);
	const fetchedAt = new Date().toISOString();
	const info = destinationInfo(igAccountId);
	const failed = (data_quality: MetaDataQuality, note: string): MetaDestinationResult => ({
		id: igAccountId,
		name: info.name,
		platform: "instagram",
		metrics: [],
		data_quality,
		error: note,
	});
	if (!env.NWANA_META_TOKEN) return failed("OWNER_ACTION_REQUIRED", MISSING_TOKEN_NOTE);
	const userToken = env.NWANA_META_TOKEN;

	const infoUrl = new URL(`${GRAPH_BASE}/${igAccountId}`);
	infoUrl.searchParams.set("fields", "followers_count,media_count,username");
	infoUrl.searchParams.set("access_token", userToken);
	const infoResult = await graphGet(infoUrl.toString(), fetcher);
	if (!infoResult.ok) {
		const classified = classifyGraphError(infoResult.error);
		return failed(classified.data_quality, classified.note);
	}
	const handle = typeof infoResult.data.username === "string" && infoResult.data.username.length > 0
		? `@${infoResult.data.username}`
		: info.name;
	const metrics: CanonicalMetric[] = [];
	const partialNotes: string[] = [];
	const followers = toNumber(infoResult.data.followers_count);
	if (followers !== null) {
		metrics.push(buildMetric({
			metric_name: "followers",
			source: "instagram",
			source_account: handle,
			value: followers,
			scope: "account_total",
			period_start: start,
			period_end: end,
			fetched_at: fetchedAt,
			data_quality: "LIVE_VERIFIED",
			quality_note: "Point-in-time follower count.",
		}));
	} else {
		partialNotes.push("followers_count was not returned by Meta");
	}
	const mediaCount = toNumber(infoResult.data.media_count);
	if (mediaCount !== null) {
		metrics.push(buildMetric({
			metric_name: "posts",
			source: "instagram",
			source_account: handle,
			value: mediaCount,
			scope: "account_total",
			period_start: start,
			period_end: end,
			fetched_at: fetchedAt,
			data_quality: "LIVE_VERIFIED",
			quality_note: "Point-in-time media count.",
		}));
	}

	const batchResult = await graphGet(
		insightsUrl(igAccountId, IG_INSIGHT_DEFS.map(([api]) => api).join(","), userToken, start, end),
		fetcher,
	);
	const readOneMetric = async (apiMetric: string): Promise<GraphResult> =>
		graphGet(insightsUrl(igAccountId, apiMetric, userToken, start, end), fetcher);

	if (batchResult.ok) {
		for (const [apiMetric, canonical] of IG_INSIGHT_DEFS) {
			const entry = findInsightEntry(batchResult.data, apiMetric);
			const total = entry ? sumInsightValues(entry) : null;
			if (total !== null) {
				metrics.push(buildMetric({
					metric_name: canonical,
					source: "instagram",
					source_account: handle,
					value: total,
					scope: "period_total",
					period_start: start,
					period_end: end,
					fetched_at: fetchedAt,
					data_quality: "LIVE_VERIFIED",
				}));
			} else {
				partialNotes.push(`${apiMetric}: no numeric values returned`);
			}
		}
	} else {
		const classified = classifyGraphError(batchResult.error);
		if (classified.data_quality === "SOURCE_AUTH_ERROR" || classified.data_quality === "OWNER_ACTION_REQUIRED") {
			return failed(classified.data_quality, classified.note);
		}
		let anyMetricOk = false;
		for (const [apiMetric, canonical] of IG_INSIGHT_DEFS) {
			const single = await readOneMetric(apiMetric);
			if (single.ok) {
				const entry = findInsightEntry(single.data, apiMetric);
				const total = entry ? sumInsightValues(entry) : null;
				if (total !== null) {
					anyMetricOk = true;
					metrics.push(buildMetric({
						metric_name: canonical,
						source: "instagram",
						source_account: handle,
						value: total,
						scope: "period_total",
						period_start: start,
						period_end: end,
						fetched_at: fetchedAt,
						data_quality: "LIVE_VERIFIED",
					}));
					continue;
				}
			}
			partialNotes.push(`${apiMetric}: ${single.ok ? "no numeric values returned" : (single.error.message ?? "request failed")}`);
		}
		if (!anyMetricOk && followers === null && mediaCount === null) {
			return failed("SOURCE_API_ERROR", `Instagram Insights unavailable: ${partialNotes.join("; ")}`);
		}
	}

	const data_quality: MetaDataQuality = partialNotes.length > 0 ? "LIVE_PARTIAL" : "LIVE_VERIFIED";

	// Instagram follower demographics by country (official replacement for
	// the removed audience geography; needs >=100 followers). Separate call,
	// failure-isolated: never breaks the metrics above.
	try {
		const demoUrl = new URL(`${GRAPH_BASE}/${igAccountId}/insights`);
		demoUrl.searchParams.set("metric", "follower_demographics");
		demoUrl.searchParams.set("metric_type", "total_value");
		demoUrl.searchParams.set("period", "lifetime");
		demoUrl.searchParams.set("timeframe", "this_month");
		demoUrl.searchParams.set("breakdown", "country");
		demoUrl.searchParams.set("access_token", userToken);
		const demoResult = await graphGet(demoUrl.toString(), fetcher);
		if (demoResult.ok) {
			const entry = findInsightEntry(demoResult.data, "follower_demographics");
			const breakdowns = entry && typeof entry.total_value === "object" && entry.total_value !== null
				? (entry.total_value as Record<string, unknown>).breakdowns
				: null;
			const countries = Array.isArray(breakdowns) && breakdowns.length > 0
				? (breakdowns[0] as Record<string, unknown>).results
				: null;
			if (Array.isArray(countries)) {
				for (const c of countries) {
					const rec = c as Record<string, unknown>;
					const country = typeof rec.dimension_values === "object" && rec.dimension_values !== null
						? String((rec.dimension_values as Record<string, unknown>).country ?? "")
						: "";
					const value = toNumber(rec.value);
					if (country && value !== null) {
						metrics.push(buildMetric({
							metric_name: "follower_country",
							source: "instagram",
							source_account: handle,
							value,
							scope: "followers",
							geography: country,
							period_start: start,
							period_end: end,
							fetched_at: fetchedAt,
							data_quality: "LIVE_VERIFIED",
							quality_note: "Follower demographics by country (this month).",
						}));
					}
				}
			} else {
				partialNotes.push("follower_demographics: no country breakdown returned");
			}
		} else {
			partialNotes.push(`follower_demographics: ${demoResult.error.message ?? "request failed"}`);
		}
	} catch (error) {
		partialNotes.push(`follower_demographics: ${error instanceof Error ? error.message : "failed"}`);
	}

	for (const metric of metrics) {
		if (partialNotes.length > 0 && metric.data_quality === "LIVE_VERIFIED" && metric.scope === "period_total") {
			metric.data_quality = "LIVE_PARTIAL";
			metric.quality_note = `Some Instagram Insights metrics were unavailable: ${partialNotes.join("; ")}`;
		}
	}
	return {
		id: igAccountId,
		name: handle,
		platform: "instagram",
		metrics,
		data_quality,
		error: partialNotes.length > 0 ? `Partial: ${partialNotes.join("; ")}` : undefined,
	};
}

/**
 * Aggregate all four Meta destinations (2 Facebook Pages + 2 Instagram
 * accounts). Each destination is failure-isolated: one destination failing
 * never breaks the others.
 */
export async function getMetaSocialOverview(
	env: MetaEnv,
	range: MetaReadRange = {},
	fetcher: FetchLike = fetch,
): Promise<MetaSocialOverview> {
	const { start, end } = resolveRange(range);
	const generatedAt = new Date().toISOString();
	if (!env.NWANA_META_TOKEN) {
		return {
			ok: false,
			period: { start, end },
			generated_at: generatedAt,
			destinations: [],
			error: MISSING_TOKEN_NOTE,
		};
	}
	const tasks: Array<Promise<MetaDestinationResult>> = [
		getMetaPageInsights(env, RESULT_DESTINATIONS.facebookNwana.pageId, range, fetcher),
		getMetaPageInsights(env, RESULT_DESTINATIONS.facebookNordicWalkingSport.pageId, range, fetcher),
		getInstagramInsights(env, RESULT_DESTINATIONS.instagramNwanaOfficial.accountId, range, fetcher),
		getInstagramInsights(env, RESULT_DESTINATIONS.instagramNwSport.accountId, range, fetcher),
	];
	const fallback: Array<{ id: string; name: string; platform: "facebook" | "instagram" }> = [
		{ id: RESULT_DESTINATIONS.facebookNwana.pageId, ...destinationInfo(RESULT_DESTINATIONS.facebookNwana.pageId) },
		{ id: RESULT_DESTINATIONS.facebookNordicWalkingSport.pageId, ...destinationInfo(RESULT_DESTINATIONS.facebookNordicWalkingSport.pageId) },
		{ id: RESULT_DESTINATIONS.instagramNwanaOfficial.accountId, ...destinationInfo(RESULT_DESTINATIONS.instagramNwanaOfficial.accountId) },
		{ id: RESULT_DESTINATIONS.instagramNwSport.accountId, ...destinationInfo(RESULT_DESTINATIONS.instagramNwSport.accountId) },
	];
	const settled = await Promise.allSettled(tasks);
	const destinations = settled.map((entry, index) => {
		if (entry.status === "fulfilled") return entry.value;
		const info = fallback[index] ?? { id: "unknown", name: "unknown", platform: "facebook" as const };
		return {
			id: info.id,
			name: info.name,
			platform: info.platform,
			metrics: [],
			data_quality: "SOURCE_API_ERROR" as MetaDataQuality,
			error: entry.reason instanceof Error ? entry.reason.message : "Destination read failed unexpectedly",
		};
	});
	return {
		ok: destinations.some((d) => d.metrics.length > 0),
		period: { start, end },
		generated_at: generatedAt,
		destinations,
	};
}
