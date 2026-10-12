/**
 * SVG → PNG rasterization for Cloudflare Workers using @resvg/resvg-wasm.
 *
 * Root cause of the 9412 failure: Cloudflare Images binding cannot parse SVG
 * input (IMAGES_TRANSFORM_ERROR 9412). resvg-wasm runs entirely in-process,
 * $0, no external service.
 *
 * WASM is initialized lazily once per isolate (~93ms), subsequent renders
 * ~56-82ms for card-sized images.
 *
 * The WASM module arrives as a pre-compiled WebAssembly.Module via ES module
 * import. The deployment uploads resvg.wasm as a SEPARATE module (not bundled
 * by esbuild — see --external:*.wasm in the build); Cloudflare resolves the
 * import at deploy time and pre-compiles it. No runtime compilation happens,
 * which Workers forbids ("Wasm code generation disallowed by embedder").
 * There is deliberately NO bundled-bytes path: esbuild inlining .wasm as
 * bytes and compiling at runtime always fails in production.
 */

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { getFontBuffers } from "./assets/fonts";
// WASM import: resolved at deploy time to a pre-compiled WebAssembly.Module.
// The build MUST mark *.wasm as external; the deploy MUST upload resvg.wasm
// as a separate part named "resvg.wasm".
// @ts-expect-error - WASM module import
import resvgWasm from "./resvg.wasm";

let wasmInitialized = false;
let wasmOverride: WebAssembly.Module | null = null;

/**
 * Override the WASM module (e.g. in tests, or if a binding provides it).
 * If not called, the ES module import above is used.
 */
export function setWasmModule(mod: WebAssembly.Module): void {
	wasmOverride = mod;
	wasmInitialized = false;
}

async function ensureWasmInitialized(): Promise<void> {
	if (wasmInitialized) return;
	// Prefer an explicitly provided module; otherwise use the deploy-time
	// import (pre-compiled WebAssembly.Module). initWasm accepts the module
	// directly — no compilation happens here.
	const mod = (wasmOverride ?? resvgWasm) as WebAssembly.Module;
	await initWasm(mod);
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
