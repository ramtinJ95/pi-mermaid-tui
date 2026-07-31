import assert from "node:assert/strict";
import test from "node:test";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { loadGrokRenderer } from "../src/grok-renderer.ts";
import { MermaidComponent } from "../src/mermaid-component.ts";

test("maps code-change classes to Pi theme colors", async () => {
	await loadGrokRenderer();
	const theme = {
		fg(color: ThemeColor, text: string) {
			return `<${color}>${text}</${color}>`;
		},
		bold(text: string) {
			return text;
		},
		italic(text: string) {
			return text;
		},
	} as Theme;
	const component = new MermaidComponent({
		source:
			"flowchart TD\n  A[Same]:::same --> B[Added]:::added\n  B --> C[Removed]:::removed\n  D[Changed]\n  class D changed",
		showSource: false,
		theme,
		onReady() {},
	});
	const output = component.render(120).join("\n");

	for (const color of ["toolDiffContext", "toolDiffAdded", "toolDiffRemoved", "warning"]) {
		assert.match(output, new RegExp(`<${color}>`));
	}
});
