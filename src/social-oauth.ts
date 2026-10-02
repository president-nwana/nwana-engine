// NWANA Engine — LinkedIn and Threads OAuth + posting.
//
// Both use the standard OAuth 2.0 authorization-code flow:
//   GET /integrations/linkedin/connect  → redirect to LinkedIn
//   GET /integrations/linkedin/callback → exchange code, store token
//   GET /integrations/threads/connect   → redirect to Meta (Threads)
//   GET /integrations/threads/callback  → exchange code, store token
//
// Tokens live in the `social_oauth_tokens` table (D1). Posting functions
// use the stored tokens.

export interface SocialToken {
	provider: string;
	access_token: string;
	refresh_token: string | null;
	expires_at: string | null;
	account_label: string | null;
	updated_at: string;
}

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
// Posting as the authorized member: w_member_social scope.
const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"].join(" ");

const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_SCOPES = ["threads_basic", "threads_content_publish"].join(",");

function baseUrl(env: { PUBLIC_BASE_URL?: string }): string {
	return env.PUBLIC_BASE_URL ?? "https://nwana-engine.nwana-engine.workers.dev";
}

export function linkedInConnectUrl(env: {
	LINKEDIN_CLIENT_ID?: string;
	PUBLIC_BASE_URL?: string;
}): string {
	const clientId = env.LINKEDIN_CLIENT_ID;
	if (!clientId) throw new Error("LINKEDIN_CLIENT_ID is not configured");
	const redirect = `${baseUrl(env)}/integrations/linkedin/callback`;
	const params = new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: redirect,
		scope: LINKEDIN_SCOPES,
	});
	return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

export function threadsConnectUrl(env: {
	THREADS_CLIENT_ID?: string;
	PUBLIC_BASE_URL?: string;
}): string {
	const clientId = env.THREADS_CLIENT_ID;
	if (!clientId) throw new Error("THREADS_CLIENT_ID is not configured");
	const redirect = `${baseUrl(env)}/integrations/threads/callback`;
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirect,
		scope: THREADS_SCOPES,
		response_type: "code",
	});
	return `${THREADS_AUTH_URL}?${params.toString()}`;
}

async function storeToken(
	db: D1Database,
	provider: string,
	accessToken: string,
	accountLabel: string | null,
	expiresIn: number | null,
): Promise<void> {
	const expiresAt = expiresIn
		? new Date(Date.now() + expiresIn * 1000).toISOString()
		: null;
	await db
		.prepare(
			`INSERT INTO social_oauth_tokens (provider, access_token, refresh_token, expires_at, account_label, updated_at)
			 VALUES (?, ?, NULL, ?, ?, ?)
			 ON CONFLICT(provider) DO UPDATE SET
			   access_token = excluded.access_token,
			   expires_at = excluded.expires_at,
			   account_label = excluded.account_label,
			   updated_at = excluded.updated_at`,
		)
		.bind(provider, accessToken, expiresAt, accountLabel, new Date().toISOString())
		.run();
}

export async function handleLinkedInCallback(
	url: URL,
	db: D1Database,
	env: { LINKEDIN_CLIENT_ID?: string; LINKEDIN_CLIENT_SECRET?: string; PUBLIC_BASE_URL?: string },
): Promise<string> {
	const code = url.searchParams.get("code");
	if (!code) throw new Error("LinkedIn authorization was not granted");
	const clientId = env.LINKEDIN_CLIENT_ID;
	const clientSecret = env.LINKEDIN_CLIENT_SECRET;
	if (!clientId || !clientSecret) throw new Error("LinkedIn app credentials are not configured");
	const redirect = `${baseUrl(env)}/integrations/linkedin/callback`;
	const resp = await fetch(LINKEDIN_TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirect,
		}),
	});
	const data = (await resp.json()) as Record<string, unknown>;
	if (!resp.ok || typeof data.access_token !== "string") {
		throw new Error(`LinkedIn token exchange failed: ${JSON.stringify(data).slice(0, 200)}`);
	}
	// Get the member's name for the label.
	let label: string | null = null;
	try {
		const me = await fetch("https://api.linkedin.com/v2/userinfo", {
			headers: { authorization: `Bearer ${data.access_token}` },
		});
		const meData = (await me.json()) as Record<string, unknown>;
		if (typeof meData.name === "string") label = meData.name;
	} catch {
		// Label is nice-to-have.
	}
	await storeToken(db, "linkedin", data.access_token as string, label, typeof data.expires_in === "number" ? data.expires_in : null);
	return label ?? "LinkedIn";
}

export async function handleThreadsCallback(
	url: URL,
	db: D1Database,
	env: { THREADS_CLIENT_ID?: string; THREADS_CLIENT_SECRET?: string; PUBLIC_BASE_URL?: string },
): Promise<string> {
	const code = url.searchParams.get("code");
	if (!code) throw new Error("Threads authorization was not granted");
	const clientId = env.THREADS_CLIENT_ID;
	const clientSecret = env.THREADS_CLIENT_SECRET;
	if (!clientId || !clientSecret) throw new Error("Threads app credentials are not configured");
	const redirect = `${baseUrl(env)}/integrations/threads/callback`;
	const resp = await fetch(THREADS_TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "authorization_code",
			redirect_uri: redirect,
			code,
		}),
	});
	const data = (await resp.json()) as Record<string, unknown>;
	if (!resp.ok || typeof data.access_token !== "string") {
		throw new Error(`Threads token exchange failed: ${JSON.stringify(data).slice(0, 200)}`);
	}
	await storeToken(db, "threads", data.access_token as string, null, typeof data.expires_in === "number" ? data.expires_in : null);
	return "Threads";
}

export async function getSocialToken(db: D1Database, provider: string): Promise<SocialToken | null> {
	const row = await db
		.prepare(`SELECT provider, access_token, refresh_token, expires_at, account_label, updated_at FROM social_oauth_tokens WHERE provider = ? LIMIT 1`)
		.bind(provider)
		.first<SocialToken>();
	return row ?? null;
}

export async function isSocialConnected(db: D1Database, provider: string): Promise<boolean> {
	const token = await getSocialToken(db, provider);
	if (!token) return false;
	if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) return false;
	return true;
}

/** Post text to LinkedIn as the connected member. */
export async function postToLinkedIn(db: D1Database, text: string): Promise<{ id: string }> {
	const token = await getSocialToken(db, "linkedin");
	if (!token) throw new Error("LinkedIn is not connected");
	// Get the member URN.
	const me = await fetch("https://api.linkedin.com/v2/userinfo", {
		headers: { authorization: `Bearer ${token.access_token}` },
	});
	const meData = (await me.json()) as Record<string, unknown>;
	const sub = meData.sub;
	if (typeof sub !== "string") throw new Error("Could not identify the LinkedIn member");
	const resp = await fetch("https://api.linkedin.com/v2/ugcPosts", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token.access_token}`,
			"content-type": "application/json",
			"X-Restli-Protocol-Version": "2.0.0",
		},
		body: JSON.stringify({
			author: `urn:li:person:${sub}`,
			lifecycleState: "PUBLISHED",
			specificContent: {
				"com.linkedin.ugc.ShareContent": {
					shareCommentary: { text },
					shareMediaCategory: "NONE",
				},
			},
			visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
		}),
	});
	const data = (await resp.json()) as Record<string, unknown>;
	if (!resp.ok || typeof data.id !== "string") {
		throw new Error(`LinkedIn post failed (${resp.status}): ${JSON.stringify(data).slice(0, 200)}`);
	}
	return { id: data.id as string };
}

/** Post text to Threads. Two steps: create container, then publish. */
export async function postToThreads(db: D1Database, text: string): Promise<{ id: string }> {
	const token = await getSocialToken(db, "threads");
	if (!token) throw new Error("Threads is not connected");
	// Step 1: get the user ID.
	const meResp = await fetch(`https://graph.threads.net/v1.0/me?fields=id&access_token=${encodeURIComponent(token.access_token)}`);
	const meData = (await meResp.json()) as Record<string, unknown>;
	const userId = meData.id;
	if (typeof userId !== "string") throw new Error("Could not identify the Threads user");
	// Step 2: create the text container.
	const createResp = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			media_type: "TEXT",
			text,
			access_token: token.access_token,
		}),
	});
	const createData = (await createResp.json()) as Record<string, unknown>;
	const creationId = createData.id;
	if (!createResp.ok || typeof creationId !== "string") {
		throw new Error(`Threads container failed (${createResp.status}): ${JSON.stringify(createData).slice(0, 200)}`);
	}
	// Step 3: publish.
	const pubResp = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ creation_id: creationId, access_token: token.access_token }),
	});
	const pubData = (await pubResp.json()) as Record<string, unknown>;
	if (!pubResp.ok || typeof pubData.id !== "string") {
		throw new Error(`Threads publish failed (${pubResp.status}): ${JSON.stringify(pubData).slice(0, 200)}`);
	}
	return { id: pubData.id as string };
}
