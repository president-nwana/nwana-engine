/**
 * SVG → PNG rasterization for Cloudflare Workers using @resvg/resvg-wasm.
 *
 * Root cause of the 9412 failure: Cloudflare Images binding cannot parse SVG
 * input (IMAGES_TRANSFORM_ERROR 9412). resvg-wasm runs entirely in-process,
 * $0, no external service.
 *
 * WASM is initialized lazily once per isolate (~93ms), subsequent renders
 * ~56-82ms for card-sized images.
 */

import { initWasm, Resvg } from "@resvg/resvg-wasm";
// @ts-expect-error - WASM module import via wrangler CompiledWasm rule
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { getFontBuffers } from "./assets/fonts";

let wasmInitialized = false;

async function ensureWasmInitialized(): Promise<void> {
	if (wasmInitialized) return;
	await initWasm(resvgWasm);
	wasmInitialized = true;
}

export interface RasterizeOptions {
	/** Target width in pixels. Height scales proportionally. */
	width?: number;
}

/**
 * Convert an SVG string to PNG bytes.
 * Throws on invalid SVG or render failure — caller decides the
 * publication status (IMAGE_GENERATION_FAILED, not silent fallback).
 */
export async function rasterizeSvgToPng(
	svg: string,
	options: RasterizeOptions = {},
): Promise<Uint8Array> {
	await ensureWasmInitialized();

	const resvg = new Resvg(svg, {
		fitTo: options.width
			? { mode: "width", value: options.width }
			: undefined,
		// Background is part of the card design (embedded JPEG), so no
		// extra background fill needed.
		//
		// Fonts: resvg-wasm has no system fonts in Workers. We bundle
		// Liberation Sans (metric-compatible with Arial) to render SVG
		// <text> elements. Without this, text is silently dropped.
		font: {
			fontBuffers: getFontBuffers(),
			defaultFontFamily: "Liberation Sans",
			// Map Arial/Helvetica to Liberation Sans (metric-compatible)
			loadSystemFonts: false,
		},
	});

	const rendered = resvg.render();
	const pngBytes = rendered.asPng();

	// resvg.render() returns a RenderedImage; asPng() gives Uint8Array.
	// Copy to a fresh buffer so the caller owns the memory.
	return new Uint8Array(pngBytes);
}
