import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

interface GrokWasmExports extends WebAssembly.Exports {
	memory: WebAssembly.Memory;
	wasm_alloc(length: number): number;
	wasm_render_html(pointer: number, length: number, maxWidth: number): number;
	wasm_result_ptr(): number;
}

export interface GrokRenderer {
	renderHtml(source: string, maxWidth: number): string;
}

const WASM_URL = new URL("../grok-mermaid.wasm", import.meta.url);
let loadedRenderer: GrokRenderer | undefined;
let rendererPromise: Promise<GrokRenderer> | undefined;

function getExports(instance: WebAssembly.Instance): GrokWasmExports {
	const exports = instance.exports as Partial<GrokWasmExports>;
	if (
		!(exports.memory instanceof WebAssembly.Memory) ||
		typeof exports.wasm_alloc !== "function" ||
		typeof exports.wasm_render_html !== "function" ||
		typeof exports.wasm_result_ptr !== "function"
	) {
		throw new Error("grok-mermaid.wasm does not expose the expected rendering API");
	}
	return exports as GrokWasmExports;
}

async function createRenderer(): Promise<GrokRenderer> {
	const bytes = await readFile(fileURLToPath(WASM_URL));
	const module = await WebAssembly.compile(bytes);
	let instance = new WebAssembly.Instance(module, {});

	return {
		renderHtml(source: string, maxWidth: number): string {
			try {
				const exports = getExports(instance);
				const input = new TextEncoder().encode(source);
				const pointer = exports.wasm_alloc(input.length);
				new Uint8Array(exports.memory.buffer, pointer, input.length).set(input);
				const resultLength = exports.wasm_render_html(pointer, input.length, maxWidth);
				const resultPointer = getExports(instance).wasm_result_ptr();
				return new TextDecoder().decode(
					new Uint8Array(getExports(instance).memory.buffer, resultPointer, resultLength),
				);
			} catch (error) {
				// A WebAssembly trap can poison the instance. Replace it so later renders recover.
				instance = new WebAssembly.Instance(module, {});
				throw error;
			}
		},
	};
}

export function getLoadedGrokRenderer(): GrokRenderer | undefined {
	return loadedRenderer;
}

export function loadGrokRenderer(): Promise<GrokRenderer> {
	if (loadedRenderer) return Promise.resolve(loadedRenderer);
	if (!rendererPromise) {
		rendererPromise = createRenderer()
			.then((renderer) => {
				loadedRenderer = renderer;
				return renderer;
			})
			.catch((error) => {
				rendererPromise = undefined;
				throw error;
			});
	}
	return rendererPromise;
}

function decodeHtmlText(text: string): string {
	return text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

export interface GrokSpan {
	classes: string[];
	text: string;
}

export function parseGrokHtmlLine(line: string): GrokSpan[] {
	const spans: GrokSpan[] = [];
	const pattern = /<span class="([^"]+)">([^<]*)<\/span>/g;
	let offset = 0;
	for (const match of line.matchAll(pattern)) {
		const index = match.index ?? 0;
		if (index > offset) {
			const plain = line.slice(offset, index);
			if (plain.includes("<")) throw new Error("Unexpected markup from grok-mermaid");
			spans.push({ classes: [], text: decodeHtmlText(plain) });
		}
		spans.push({
			classes: (match[1] ?? "").split(/\s+/).filter(Boolean),
			text: decodeHtmlText(match[2] ?? ""),
		});
		offset = index + match[0].length;
	}
	if (offset < line.length) {
		const plain = line.slice(offset);
		if (plain.includes("<")) throw new Error("Unexpected markup from grok-mermaid");
		spans.push({ classes: [], text: decodeHtmlText(plain) });
	}
	return spans;
}

export function grokHtmlToPlainLines(html: string): string[] {
	const lines = html.split("\n");
	if (lines.at(-1) === "") lines.pop();
	return lines.map((line) => parseGrokHtmlLine(line).map((span) => span.text).join(""));
}
