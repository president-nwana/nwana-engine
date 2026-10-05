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
// WASM module imported as ES module (Cloudflare Workers CompiledWasm).
// Wrangler handles this via [[rules]] type="CompiledWasm".
// For script-upload API, the .wasm file must be uploaded as a separate module.
// @ts-expect-error - WASM module import
import resvgWasm from "./resvg.wasm";
import { getFontBuffers } from "./assets/fonts";

let wasmInitialized = false;
let wasmModule: WebAssembly.Module | null = null;

/**
 * Set a pre-compiled WASM module (from Workers wasm_module binding).
 * Call this before rasterizeSvgToPng if using the binding approach.
 * If not set, falls back to the bundled import (which may fail on Workers
 * if the bundle embedded raw bytes instead of a pre-compiled module).
 */
async function ensureWasmInitialized(): Promise<void> {
	if (wasmInitialized) return;
	// resvgWasm is a pre-compiled WebAssembly.Module (via CompiledWasm rule).
	// No runtime compilation needed.
	await initWasm(resvgWasm as unknown as WebAssembly.Module);
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
	try {
		await ensureWasmInitialized();
	} catch (error) {
		throw new Error(`WASM_INIT_FAILED: ${error instanceof Error ? error.message : String(error)}`);
	}

	let fontBuffers: Uint8Array[];
	try {
		fontBuffers = getFontBuffers();
	} catch (error) {
		throw new Error(`FONT_LOAD_FAILED: ${error instanceof Error ? error.message : String(error)}`);
	}

	let resvg: InstanceType<typeof Resvg>;
	try {
		resvg = new Resvg(svg, {
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
				fontBuffers,
				defaultFontFamily: "Liberation Sans",
				// Map Arial/Helvetica to Liberation Sans (metric-compatible)
				loadSystemFonts: false,
			},
		});
	} catch (error) {
		throw new Error(`RESVG_CONSTRUCT_FAILED: ${error instanceof Error ? error.message : String(error)}`);
	}

	let rendered: ReturnType<InstanceType<typeof Resvg>["render"]>;
	try {
		rendered = resvg.render();
	} catch (error) {
		throw new Error(`RESVG_RENDER_FAILED: ${error instanceof Error ? error.message : String(error)}`);
	}

	let pngBytes: Uint8Array;
	try {
		pngBytes = rendered.asPng();
	} catch (error) {
		throw new Error(`PNG_ENCODE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
	}

	// resvg.render() returns a RenderedImage; asPng() gives Uint8Array.
	// Copy to a fresh buffer so the caller owns the memory.
	return new Uint8Array(pngBytes);
}
