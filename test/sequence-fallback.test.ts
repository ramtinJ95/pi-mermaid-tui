import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { grokHtmlToPlainLines, loadGrokRenderer } from "../src/grok-renderer.ts";
import { MermaidComponent } from "../src/mermaid-component.ts";

const reportedSource = await readFile(new URL("./fixtures/sequence-issue-7.mmd", import.meta.url), "utf8");
// The exact report hits the syntax fallback: the renderer treats the unquoted
// semicolon as a statement separator. Change only that label to exercise layout.
const layoutSource = reportedSource.replace("public; apply SQL", "public and apply SQL");

function assertFits(lines: string[], width: number): void {
	assert.ok(lines.length > 0);
	for (const line of lines) {
		assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} > ${width}: ${line}`);
		assert.ok(!line.includes("\0"), "canvas sentinel must not leak into output");
	}
}

test("the exact issue #7 source uses a bounded, intact framed-source fallback", async () => {
	const renderer = await loadGrokRenderer();
	for (const width of [1, 4, 24, 40, 80, 120, 200]) {
		const lines = grokHtmlToPlainLines(renderer.renderHtml(reportedSource, width));
		assertFits(lines, width);
		if (width >= 40) assert.match(lines[0]!, /mermaid: sequenceDiagram/);
		if (width >= 80) {
			assert.equal(new Set(lines.map(visibleWidth)).size, 1, "fallback frame must be rectangular");
			const body = lines.slice(1, -1).map((line) => line.slice(2, -2).trimEnd());
			assert.deepEqual(body, reportedSource.trimEnd().split("\n"));
		}
	}
});

test("nested sequence layout falls back below its required width and renders when it fits", async () => {
	const renderer = await loadGrokRenderer();
	const natural = grokHtmlToPlainLines(renderer.renderHtml(layoutSource, 0));
	const requiredWidth = Math.max(...natural.map(visibleWidth));
	assert.ok(requiredWidth > 120, "the stress fixture must exceed a normal terminal width");
	assert.doesNotMatch(natural.join("\n"), /mermaid: sequenceDiagram/);
	for (const label of ["loop each selected source", "loop each included table", "alt any exception", "strip UNIQUE and NOT NULL"]) {
		assert.ok(natural.join("\n").includes(label), label);
	}
	for (const width of [40, 80, 120, requiredWidth - 1, requiredWidth, requiredWidth + 1]) {
		const lines = grokHtmlToPlainLines(renderer.renderHtml(layoutSource, width));
		assertFits(lines, width);
		if (width < requiredWidth) {
			assert.match(lines[0]!, /mermaid: sequenceDiagram/);
			assert.match(lines.join(" "), /This diagram is too wide/);
		} else {
			assert.deepEqual(lines, natural);
		}
	}
});

const theme = {
	fg(_color: string, text: string) { return `\x1b[37m${text}\x1b[39m`; },
	bold(text: string) { return `\x1b[1m${text}\x1b[22m`; },
	italic(text: string) { return `\x1b[3m${text}\x1b[23m`; },
} as Theme;

test("the themed TUI component switches between sequence art and fallback on resize", async () => {
	const renderer = await loadGrokRenderer();
	for (const source of [reportedSource, layoutSource]) {
		for (const showSource of [false, true]) {
			const component = new MermaidComponent({ source, showSource, theme, paddingX: 0, onReady() {} });
			for (const width of [200, 120, 80, 40, 24, 12, 4, 1, 80, 200]) {
				const lines = component.render(width);
				assertFits(lines, width);
				const plain = lines.map(stripVTControlCharacters);
				const expected = grokHtmlToPlainLines(renderer.renderHtml(source, width));
				assert.deepEqual(plain.slice(0, expected.length), expected);
				assert.doesNotMatch(plain.join("\n"), /Mermaid renderer error/);
				assert.strictEqual(component.render(width), lines, "same-width renders use the cache");
				component.invalidate();
				assert.deepEqual(component.render(width), lines, "invalidation preserves output");
			}
		}
	}
});
