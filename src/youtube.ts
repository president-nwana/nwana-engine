// YouTube Data API v3 integration for the NWANA official channel.
//
// Two-step publication by design (owner approval rules):
//   1. uploadVideo() creates the video as UNLISTED (draft).
//   2. publishVideo() flips it to PUBLIC — only ever called from the
//      explicit owner-confirmed /api/operating-center/youtube/publish
//      endpoint. Nothing in this module publishes to public on its own.
//
// OAuth pattern mirrors src/google-ads.ts: authorization URL -> callback
// -> code exchange -> refresh token encrypted with AES-GCM in D1
// (integration_credentials, provider "YOUTUBE"). Client id/secret/token
// key fall back to the shared GOOGLE_ADS_* values so the existing Google
// Cloud project can be reused; GOOGLE_YOUTUBE_REDIRECT_URI overrides the
// default callback URL.

export interface YouTubeEnv {
	nwana_engine_db: D1Database;
	GOOGLE_ADS_CLIENT_ID?: string;
	GOOGLE_ADS_CLIENT_SECRET?: string;
	GOOGLE_ADS_TOKEN_KEY?: string;
	GOOGLE_YOUTUBE_CLIENT_ID?: string;
	GOOGLE_YOUTUBE_CLIENT_SECRET?: string;
	GOOGLE_YOUTUBE_TOKEN_KEY?: string;
	GOOGLE_YOUTUBE_REDIRECT_URI?: string;
}

const PROVIDER = "YOUTUBE";
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
export const YOUTUBE_TITLE_LIMIT = 100;
export const GOOGLE_YOUTUBE_DEFAULT_REDIRECT_URI =
	"https://nwana-engine.nwana-engine.workers.dev/integrations/youtube/callback";
// YouTube resumable-upload chunks must be multiples of 256 KB; 8 MB keeps
// memory bounded while streaming the source through the Worker.
export const YOUTUBE_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;
// Safety cap when the source length is unknown and must be buffered.
const MAX_BUFFERED_BYTES = 512 * 1024 * 1024;
// YouTube category "Sports".
const YOUTUBE_CATEGORY_SPORTS = "17";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
	return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function keyBytes(secret: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest("SHA-256", encoder.encode(secret));
}

async function sign(value: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		await keyBytes(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return base64Url(new Uint8Array(
		await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
	));
}

function safeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

async function createState(secret: string): Promise<string> {
	const payload = base64Url(encoder.encode(JSON.stringify({
		issued_at: Date.now(),
		nonce: crypto.randomUUID(),
	})));
	return `${payload}.${await sign(payload, secret)}`;
}

async function verifyState(state: string, secret: string): Promise<boolean> {
	const [payload, signature, extra] = state.split(".");
	if (!payload || !signature || extra) return false;
	if (!safeEqual(signature, await sign(payload, secret))) return false;
	try {
		const parsed = JSON.parse(decoder.decode(fromBase64Url(payload))) as {
			issued_at?: number;
		};
		return typeof parsed.issued_at === "number" &&
			Date.now() - parsed.issued_at >= 0 &&
			Date.now() - parsed.issued_at <= 10 * 60 * 1000;
	} catch {
		return false;
	}
}

export async function encryptRefreshToken(
	refreshToken: string,
	secret: string,
): Promise<{ encrypted: string; iv: string }> {
	const key = await crypto.subtle.importKey(
		"raw",
		await keyBytes(secret),
		"AES-GCM",
		false,
		["encrypt"],
	);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		encoder.encode(refreshToken),
	);
	return {
		encrypted: base64Url(new Uint8Array(encrypted)),
		iv: base64Url(iv),
	};
}

async function decryptRefreshToken(
	encrypted: string,
	iv: string,
	secret: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		await keyBytes(secret),
		"AES-GCM",
		false,
		["decrypt"],
	);
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: fromBase64Url(iv) },
		key,
		fromBase64Url(encrypted),
	);
	return decoder.decode(decrypted);
}

function resolveClientId(env: YouTubeEnv): string | undefined {
	return env.GOOGLE_YOUTUBE_CLIENT_ID ?? env.GOOGLE_ADS_CLIENT_ID;
}

function resolveClientSecret(env: YouTubeEnv): string | undefined {
	return env.GOOGLE_YOUTUBE_CLIENT_SECRET ?? env.GOOGLE_ADS_CLIENT_SECRET;
}

function resolveTokenKey(env: YouTubeEnv): string | undefined {
	return env.GOOGLE_YOUTUBE_TOKEN_KEY ?? env.GOOGLE_ADS_TOKEN_KEY;
}

export function resolveYouTubeRedirectUri(env: YouTubeEnv): string {
	return env.GOOGLE_YOUTUBE_REDIRECT_URI ?? GOOGLE_YOUTUBE_DEFAULT_REDIRECT_URI;
}

function missingConfiguration(env: YouTubeEnv): string[] {
	const missing: string[] = [];
	if (!resolveClientId(env)) missing.push("GOOGLE_YOUTUBE_CLIENT_ID");
	if (!resolveClientSecret(env)) missing.push("GOOGLE_YOUTUBE_CLIENT_SECRET");
	if (!resolveTokenKey(env)) missing.push("GOOGLE_YOUTUBE_TOKEN_KEY");
	return missing;
}

export async function youTubeAuthorizationUrl(
	env: YouTubeEnv,
): Promise<string> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		throw new Error(`YouTube configuration is missing: ${missing.join(", ")}`);
	}
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.searchParams.set("client_id", resolveClientId(env)!);
	url.searchParams.set("redirect_uri", resolveYouTubeRedirectUri(env));
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", YOUTUBE_SCOPE);
	url.searchParams.set("access_type", "offline");
	url.searchParams.set("prompt", "consent");
	url.searchParams.set("state", await createState(resolveTokenKey(env)!));
	return url.toString();
}

async function exchangeAuthorizationCode(
	code: string,
	env: YouTubeEnv,
): Promise<{ access_token: string; refresh_token?: string }> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: resolveClientId(env)!,
			client_secret: resolveClientSecret(env)!,
			redirect_uri: resolveYouTubeRedirectUri(env),
			grant_type: "authorization_code",
		}),
	});
	const payload = await response.json() as {
		access_token?: string;
		refresh_token?: string;
		error?: string;
		error_description?: string;
	};
	if (!response.ok || !payload.access_token) {
		throw new Error(
			payload.error_description ?? payload.error ?? `OAuth token exchange failed (${response.status})`,
		);
	}
	return {
		access_token: payload.access_token,
		refresh_token: payload.refresh_token,
	};
}

async function refreshAccessToken(
	refreshToken: string,
	env: YouTubeEnv,
): Promise<string> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: resolveClientId(env)!,
			client_secret: resolveClientSecret(env)!,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
	});
	const payload = await response.json() as {
		access_token?: string;
		error?: string;
		error_description?: string;
	};
	if (!response.ok || !payload.access_token) {
		throw new Error(
			payload.error_description ?? payload.error ?? `OAuth refresh failed (${response.status})`,
		);
	}
	return payload.access_token;
}

async function readStoredRefreshToken(env: YouTubeEnv): Promise<string> {
	const credential = await env.nwana_engine_db.prepare(`
		SELECT encrypted_refresh_token, iv
		FROM integration_credentials
		WHERE provider = ?
		LIMIT 1
	`).bind(PROVIDER).first<{
		encrypted_refresh_token: string;
		iv: string;
	}>();
	if (!credential) {
		throw new Error("YouTube is not connected: no OAuth credential stored yet");
	}
	return decryptRefreshToken(
		credential.encrypted_refresh_token,
		credential.iv,
		resolveTokenKey(env)!,
	);
}

async function youTubeAccessToken(env: YouTubeEnv): Promise<string> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		throw new Error(`YouTube configuration is missing: ${missing.join(", ")}`);
	}
	const refreshToken = await readStoredRefreshToken(env);
	return refreshAccessToken(refreshToken, env);
}

export interface YouTubeChannel {
	channel_id: string;
	channel_title: string;
}

async function fetchOwnChannel(accessToken: string): Promise<YouTubeChannel> {
	const response = await fetch(
		"https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
		{ headers: { Authorization: `Bearer ${accessToken}` } },
	);
	const payload = await response.json() as {
		items?: Array<{ id?: string; snippet?: { title?: string } }>;
		error?: { message?: string };
	};
	if (!response.ok) {
		throw new Error(payload.error?.message ?? `YouTube channels request failed (${response.status})`);
	}
	const item = payload.items?.[0];
	if (!item?.id) {
		throw new Error("No YouTube channel is associated with the authorized Google account");
	}
	return { channel_id: item.id, channel_title: item.snippet?.title ?? "" };
}

export async function handleYouTubeCallback(
	url: URL,
	env: YouTubeEnv,
): Promise<YouTubeChannel> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		throw new Error(`YouTube configuration is missing: ${missing.join(", ")}`);
	}
	const error = url.searchParams.get("error");
	if (error) throw new Error(`Google authorization was not completed: ${error}`);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (!code || !state || !(await verifyState(state, resolveTokenKey(env)!))) {
		throw new Error("YouTube OAuth callback is missing a valid code or state");
	}
	const tokens = await exchangeAuthorizationCode(code, env);
	if (!tokens.refresh_token) {
		throw new Error("Google did not return a refresh token; reconnect and grant consent");
	}
	const channel = await fetchOwnChannel(tokens.access_token);
	const protectedToken = await encryptRefreshToken(
		tokens.refresh_token,
		resolveTokenKey(env)!,
	);
	await env.nwana_engine_db.prepare(`
		INSERT INTO integration_credentials (
			provider, encrypted_refresh_token, iv, metadata
		) VALUES (?, ?, ?, ?)
		ON CONFLICT(provider) DO UPDATE SET
			encrypted_refresh_token = excluded.encrypted_refresh_token,
			iv = excluded.iv,
			metadata = excluded.metadata,
			updated_at = CURRENT_TIMESTAMP
	`).bind(
		PROVIDER,
		protectedToken.encrypted,
		protectedToken.iv,
		JSON.stringify({
			scope: YOUTUBE_SCOPE,
			channel_id: channel.channel_id,
			channel_title: channel.channel_title,
			connected_by: "admin@nwaofna.org",
		}),
	).run();
	return channel;
}

export async function getYouTubeStatus(env: YouTubeEnv): Promise<{
	ok: boolean;
	connected: boolean;
	configured: boolean;
	channel_id?: string;
	channel_title?: string;
	missing_configuration?: string[];
	error?: string;
}> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		return {
			ok: false,
			connected: false,
			configured: false,
			missing_configuration: missing,
		};
	}
	try {
		const accessToken = await youTubeAccessToken(env);
		const channel = await fetchOwnChannel(accessToken);
		return {
			ok: true,
			connected: true,
			configured: true,
			channel_id: channel.channel_id,
			channel_title: channel.channel_title,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "YouTube connection failed";
		const notConnected = message.startsWith("YouTube is not connected");
		return {
			ok: notConnected,
			connected: false,
			configured: true,
			...(notConnected ? {} : { error: message }),
		};
	}
}

// ---------------------------------------------------------------------------
// Resumable upload. Pure helpers are exported for tests; the network flow
// streams the source through the Worker in 8 MB chunks and never publishes
// anything to public — every upload starts as unlisted.
// ---------------------------------------------------------------------------

export function truncateYouTubeTitle(title: string): string {
	const trimmed = title.trim();
	return trimmed.length <= YOUTUBE_TITLE_LIMIT
		? trimmed
		: trimmed.slice(0, YOUTUBE_TITLE_LIMIT);
}

export function buildContentRange(start: number, endInclusive: number, total: number): string {
	return `bytes ${start}-${endInclusive}/${total}`;
}

/** Inclusive [start, end] byte ranges covering `total` bytes in `chunkSize` pieces. */
export function chunkRanges(total: number, chunkSize: number): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	for (let start = 0; start < total; start += chunkSize) {
		ranges.push([start, Math.min(start + chunkSize, total) - 1]);
	}
	return ranges;
}

export interface YouTubeUploadInput {
	sourceUrl: string;
	title: string;
	description?: string;
	tags?: string[];
}

export interface YouTubeUploadResult {
	video_id: string;
	url: string;
	privacy_status: "unlisted";
}

async function probeSourceLength(sourceUrl: string): Promise<number | null> {
	try {
		const head = await fetch(sourceUrl, { method: "HEAD" });
		if (head.ok) {
			const length = head.headers.get("content-length");
			if (length) {
				const parsed = Number(length);
				if (Number.isFinite(parsed) && parsed > 0) return parsed;
			}
		}
	} catch {
		// Fall through to the buffered path below.
	}
	return null;
}

async function startResumableSession(
	accessToken: string,
	input: YouTubeUploadInput,
	contentLength: number,
	contentType: string,
): Promise<string> {
	const response = await fetch(
		"https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=status,snippet",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"content-type": "application/json; charset=UTF-8",
				"X-Upload-Content-Length": String(contentLength),
				"X-Upload-Content-Type": contentType,
			},
			body: JSON.stringify({
				snippet: {
					title: truncateYouTubeTitle(input.title),
					description: input.description ?? "",
					tags: input.tags ?? [],
					categoryId: YOUTUBE_CATEGORY_SPORTS,
				},
				status: { privacyStatus: "unlisted" },
			}),
		},
	);
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`YouTube upload session failed (${response.status}): ${text.slice(0, 200)}`);
	}
	const sessionUri = response.headers.get("location");
	if (!sessionUri) {
		throw new Error("YouTube did not return a resumable upload session URI");
	}
	return sessionUri;
}

async function putChunk(
	sessionUri: string,
	chunk: Uint8Array,
	start: number,
	endInclusive: number,
	total: number,
	contentType: string,
): Promise<{ done: boolean; videoId?: string }> {
	const response = await fetch(sessionUri, {
		method: "PUT",
		headers: {
			"content-type": contentType,
			"Content-Range": buildContentRange(start, endInclusive, total),
			"Content-Length": String(chunk.byteLength),
		},
		body: chunk as unknown as BodyInit,
	});
	if (response.status === 308) return { done: false };
	if (response.ok) {
		const payload = await response.json() as { id?: string; error?: { message?: string } };
		if (!payload.id) {
			throw new Error("YouTube upload finished without a video id");
		}
		return { done: true, videoId: payload.id };
	}
	const text = await response.text().catch(() => "");
	throw new Error(`YouTube chunk upload failed (${response.status}): ${text.slice(0, 200)}`);
}

async function readAllBytes(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array> {
	const parts: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			parts.push(value);
			total += value.byteLength;
			if (total > MAX_BUFFERED_BYTES) {
				throw new Error(`Source video exceeds the ${MAX_BUFFERED_BYTES} byte buffered limit`);
			}
		}
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

export async function uploadVideo(
	env: YouTubeEnv,
	input: YouTubeUploadInput,
): Promise<YouTubeUploadResult> {
	if (!input.sourceUrl) throw new Error("sourceUrl is required");
	if (!input.title || !input.title.trim()) throw new Error("title is required");
	const accessToken = await youTubeAccessToken(env);

	const headLength = await probeSourceLength(input.sourceUrl);
	const sourceResponse = await fetch(input.sourceUrl);
	if (!sourceResponse.ok || !sourceResponse.body) {
		throw new Error(`Could not read source video (${sourceResponse.status})`);
	}
	const contentType =
		sourceResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
		"video/mp4";

	let total: number;
	let chunkedBody: Uint8Array | null = null;
	let streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	if (headLength !== null) {
		total = headLength;
		streamReader = sourceResponse.body.getReader();
	} else {
		// Unknown length: buffer once (bounded), then chunk from memory.
		chunkedBody = await readAllBytes(sourceResponse.body.getReader());
		total = chunkedBody.byteLength;
		if (total === 0) throw new Error("Source video is empty");
	}

	const sessionUri = await startResumableSession(accessToken, input, total, contentType);
	const ranges = chunkRanges(total, YOUTUBE_UPLOAD_CHUNK_SIZE);

	if (chunkedBody) {
		for (const [start, end] of ranges) {
			const chunk = chunkedBody.subarray(start, end + 1);
			const result = await putChunk(sessionUri, chunk, start, end, total, contentType);
			if (result.done) {
				return {
					video_id: result.videoId!,
					url: `https://www.youtube.com/watch?v=${result.videoId}`,
					privacy_status: "unlisted",
				};
			}
		}
	} else {
		let pending = new Uint8Array(0);
		let rangeIndex = 0;
		const reader = streamReader!;
		for (;;) {
			const { done, value } = await reader.read();
			if (value) {
				const merged = new Uint8Array(pending.byteLength + value.byteLength);
				merged.set(pending, 0);
				merged.set(value, pending.byteLength);
				pending = merged;
			}
			while (rangeIndex < ranges.length) {
				const [start, end] = ranges[rangeIndex];
				const need = end - start + 1;
				const isLast = rangeIndex === ranges.length - 1;
				if (pending.byteLength < need && !(done && isLast)) break;
				const chunk = pending.subarray(0, need);
				const result = await putChunk(sessionUri, chunk, start, end, total, contentType);
				pending = pending.subarray(need);
				rangeIndex += 1;
				if (result.done) {
					return {
						video_id: result.videoId!,
						url: `https://www.youtube.com/watch?v=${result.videoId}`,
						privacy_status: "unlisted",
					};
				}
			}
			if (done) break;
		}
	}
	throw new Error("YouTube upload ended without a completed video resource");
}

/**
 * Flip an unlisted draft to public. This is the ONLY path to public in
 * this module and is wired exclusively to the owner-confirmed publish
 * endpoint — never called automatically after upload.
 */
export async function publishVideo(
	env: YouTubeEnv,
	videoId: string,
): Promise<{ video_id: string; privacy_status: "public" }> {
	if (!videoId || !videoId.trim()) throw new Error("videoId is required");
	const accessToken = await youTubeAccessToken(env);
	const response = await fetch(
		"https://www.googleapis.com/youtube/v3/videos?part=status",
		{
			method: "PUT",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"content-type": "application/json; charset=UTF-8",
			},
			body: JSON.stringify({
				id: videoId,
				status: { privacyStatus: "public" },
			}),
		},
	);
	const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
	if (!response.ok) {
		throw new Error(payload.error?.message ?? `YouTube publish failed (${response.status})`);
	}
	return { video_id: videoId, privacy_status: "public" };
}
