// NWANA Engine — Series 2026 result card generation (shared module).
//
// getSeries2026ResultCard used to live in src/index.ts, but the automatic
// result pipeline (series-2026-auto-process.ts) needs the same preflight
// WITHOUT an HTTP self-fetch: a Worker cannot reliably fetch its own
// public URL (Cloudflare edge/bot protection answers 404 to self-fetch),
// and the public card route only serves GET, so a HEAD probe always fails
// and the automatic pipeline used to die with IMAGE_GENERATION_FAILED.
// Both the manual publish path and the automatic path now call this
// function directly and validate the generated PNG bytes. No circular
// imports: this module only depends on leaf modules (result-card,
// series-2026-results, svg-raster).

import {
	buildResultCardSvg,
	isResultCardDesignReady,
	RESULT_CARD_DESIGN_BLOCKER,
} from "./result-card";
import {
	buildPublicationDraftFromD1,
	previewSeries2026ResultPublications,
} from "./series-2026-results";
import { rasterizeSvgToPng } from "./svg-raster";

/**
 * Minimal env surface the card generator needs. The worker Env is
 * structurally assignable; the automatic pipeline maps its AutoProcessEnv
 * onto this shape (db -> nwana_engine_db, accessToken ->
 * RUNSIGNUP_ACCESS_TOKEN, ...).
 */
export interface ResultCardEnv {
	nwana_engine_db: D1Database;
	RUNSIGNUP_ACCESS_TOKEN: string;
	RUNSIGNUP_API_REG?: string;
	RUNSIGNUP_API_REG_SECRET?: string;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
		},
	});
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";

	const chunkSize = 0x8000;

	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(
			i,
			Math.min(i + chunkSize, bytes.length),
		);

		binary += String.fromCharCode(...chunk);
	}

	return btoa(binary);
}

export async function getSeries2026ResultCard(
	publicationKey: string,
	format: "svg" | "jpeg",
	env: ResultCardEnv,
): Promise<Response> {
	if (!isResultCardDesignReady()) {
		return json({
			ok: false,
			status: "VISUAL_DESIGN_NOT_APPROVED",
			execution_allowed: false,
			error: RESULT_CARD_DESIGN_BLOCKER,
		}, 409);
	}
	const raceId = Number(publicationKey.split(":")[2]);
	if (!Number.isInteger(raceId)) {
		return json({ ok: false, error: "Invalid result publication key" }, 400);
	}
	// Architectural rule: use D1 canonical snapshot first (no RunSignup
	// needed for finalized events). Fall back to live RunSignup only if
	// D1 has no finalized snapshot.
	let draft = await buildPublicationDraftFromD1(env.nwana_engine_db, publicationKey);
	if (!draft) {
		const preview = await previewSeries2026ResultPublications(
			env.RUNSIGNUP_ACCESS_TOKEN,
			{ raceId },
		);
		draft = preview.drafts.find(
			(value) => value.publication_key === publicationKey,
		) ?? null;
	}
	if (!draft) {
		return json({ ok: false, error: "Result publication draft not found" }, 404);
	}
	if (!draft.ready_for_editorial_review) {
		return json({ ok: false, error: "Results are not finalized" }, 409);
	}
	const winners = draft.content.results
		.filter((row) => row.level_place === "1")
		.map((row) => ({
			athlete: row.athlete,
			gender: row.gender === "M"
				? "Men"
				: row.gender === "F"
					? "Women"
					: row.gender ?? "Division",
			time: row.time,
			performance_level: row.performance_level,
			series_record: (row as { series_record?: boolean }).series_record ?? false,
		}));
	let logoUrl: string | undefined;
	// Embed logo as data URL for reliable WASM rendering.
	{
		const logoResponse = await fetch(
			"https://d368g9lw5ileu7.cloudfront.net/uploads/generic/genericImage-websiteLogo-281959-1788823407.1047-0.bQN0DV.jpg",
		);
		if (!logoResponse.ok) {
			throw new Error("Official NWANA logo could not be loaded");
		}
		const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
		logoUrl = `data:image/jpeg;base64,${bytesToBase64(logoBytes)}`;
	}
	const svg = buildResultCardSvg({
		publicationKey: draft.publication_key,
		title: draft.editorial_draft.title,
		distance: draft.source.distance,
		winners,
		logoUrl,
	});
	if (format === "svg") {
		return new Response(svg, {
			headers: {
				"content-type": "image/svg+xml; charset=utf-8",
				"cache-control": "public, max-age=3600",
			},
		});
	}
	// Root cause of 9412: Cloudflare Images cannot parse SVG input.
	// resvg-wasm rasterizes in-process ($0, Worker-compatible).
	// PNG is accepted by Meta; no JPEG conversion needed.
	const pngBytes = await rasterizeSvgToPng(svg, { width: 1080 });
	return new Response(pngBytes, {
		headers: {
			"content-type": "image/png",
			"Cache-Control":
				"public, max-age=3600, stale-while-revalidate=86400",
		},
	});
}
