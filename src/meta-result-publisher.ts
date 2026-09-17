const GRAPH_VERSION = "v23.0";

export const RESULT_DESTINATIONS = {
	facebookNwana: {
		ledgerKey: "FACEBOOK_NWANA",
		pageId: "595301193675669",
		name: "NWANA",
	},
	instagramNwanaOfficial: {
		ledgerKey: "INSTAGRAM_NWANA_OFFICIAL",
		accountId: "17841474409019986",
		name: "nwana.official",
	},
	facebookNordicWalkingSport: {
		ledgerKey: "FACEBOOK_NORDIC_WALKING_SPORT",
		pageId: "103190499173992",
		name: "Nordic Walking Sport",
	},
	instagramNwSport: {
		ledgerKey: "INSTAGRAM_N_W_SPORT",
		accountId: "17841455094791338",
		name: "n_w_sport",
	},
} as const;

type FetchLike = typeof fetch;

async function graphJson(
	url: string,
	init: RequestInit | undefined,
	fetcher: FetchLike,
): Promise<Record<string, unknown>> {
	const response = await fetcher(url, init);
	const data = await response.json() as Record<string, unknown>;
	if (!response.ok || data.error) {
		throw new Error(`Meta request failed (${response.status})`);
	}
	return data;
}

export async function getFacebookPageToken(
	userToken: string,
	pageId: string,
	fetcher: FetchLike = fetch,
): Promise<string> {
	const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
	url.searchParams.set("fields", "id,name,access_token");
	url.searchParams.set("access_token", userToken);
	const data = await graphJson(url.toString(), undefined, fetcher);
	const pages = Array.isArray(data.data) ? data.data : [];
	const page = pages.find((value) =>
		value !== null && typeof value === "object" &&
		String((value as Record<string, unknown>).id) === pageId
	) as Record<string, unknown> | undefined;
	const token = page?.access_token;
	if (typeof token !== "string" || token.length === 0) {
		throw new Error(`Facebook Page token was not returned by Meta for page ${pageId}`);
	}
	return token;
}

export async function publishFacebookResult(params: {
	pageId: string;
	message: string;
	imageUrl: string;
	pageToken: string;
	fetcher?: FetchLike;
}) {
	const body = new URLSearchParams({
		message: params.message,
		url: params.imageUrl,
		access_token: params.pageToken,
	});
	const data = await graphJson(
		`https://graph.facebook.com/${GRAPH_VERSION}/${params.pageId}/photos`,
		{ method: "POST", body },
		params.fetcher ?? fetch,
	);
	if (typeof data.id !== "string") throw new Error("Meta did not return a Facebook post ID");
	return { external_id: data.id };
}

export async function publishInstagramResult(params: {
	accountId: string;
	caption: string;
	imageUrl: string;
	userToken: string;
	fetcher?: FetchLike;
}) {
	const fetcher = params.fetcher ?? fetch;
	const container = await graphJson(
		`https://graph.facebook.com/${GRAPH_VERSION}/${params.accountId}/media`,
		{ method: "POST", body: new URLSearchParams({
			image_url: params.imageUrl,
			caption: params.caption,
			access_token: params.userToken,
		}) },
		fetcher,
	);
	if (typeof container.id !== "string") throw new Error("Meta did not create an Instagram media container");
	await new Promise((resolve) => setTimeout(resolve, 3000));
	const published = await graphJson(
		`https://graph.facebook.com/${GRAPH_VERSION}/${params.accountId}/media_publish`,
		{ method: "POST", body: new URLSearchParams({
			creation_id: container.id,
			access_token: params.userToken,
		}) },
		fetcher,
	);
	if (typeof published.id !== "string") throw new Error("Meta did not return an Instagram media ID");
	return { external_id: published.id };
}
