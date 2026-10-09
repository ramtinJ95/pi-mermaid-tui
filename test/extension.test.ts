import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { ExtensionAPI, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { loadGrokRenderer } from "../src/grok-renderer.ts";
import mermaidExtension from "../src/index.ts";

interface RegisteredMermaidTool {
	name: string;
	promptGuidelines?: string[];
	execute(
		toolCallId: string,
		params: { source: string },
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		context: { mode: "print" | "tui" },
	): Promise<{
		content: Array<{ type: "text"; text: string }>;
		details: { source: string };
		terminate?: boolean;
	}>;
}

test("registers a composable tool and renders plain output outside the TUI", async () => {
	let registered: RegisteredMermaidTool | undefined;
	let sessionStart: (() => void) | undefined;
	let activeTools = ["read"];
	const api = {
		registerTool(tool: RegisteredMermaidTool) {
			registered = tool;
		},
		on(event: string, handler: () => void) {
			if (event === "session_start") sessionStart = handler;
		},
		getActiveTools() {
			return activeTools;
		},
		setActiveTools(tools: string[]) {
			activeTools = tools;
		},
	} as unknown as ExtensionAPI;

	mermaidExtension(api);
	assert.ok(registered);
	assert.equal(registered.name, "render_mermaid");
	assert.match(registered.promptGuidelines?.join("\n") ?? "", /raw Mermaid code fence/);
	assert.match(registered.promptGuidelines?.join("\n") ?? "", /flowchart TB/);
	assert.match(registered.promptGuidelines?.join("\n") ?? "", /flowchart LR/);
	assert.match(registered.promptGuidelines?.join("\n") ?? "", /C4-style architecture/);
	assert.match(
		registered.promptGuidelines?.join("\n") ?? "",
		/Person:.*System:.*Container:.*Component:.*External:/,
	);
	assert.match(registered.promptGuidelines?.join("\n") ?? "", /one global flowchart direction/);
	assert.match(registered.promptGuidelines?.join("\n") ?? "", /keep labels concise/);
	assert.match(
		registered.promptGuidelines?.join("\n") ?? "",
		/Do not send native C4Context, C4Container, C4Component, C4Dynamic, C4Deployment, or any other native Mermaid C4 syntax/,
	);

	const result = await registered.execute(
		"call-1",
		{ source: "flowchart LR\n  Start --> End" },
		undefined,
		undefined,
		{ mode: "print" },
	);
	assert.match(result.content[0]?.text ?? "", /Start/);
	assert.match(result.content[0]?.text ?? "", /End/);
	assert.equal(result.terminate, undefined);

	const source = await readFile(new URL("./fixtures/sequence-issue-7.mmd", import.meta.url), "utf8");
	const tuiResult = await registered.execute("call-2", { source }, undefined, undefined, { mode: "tui" });
	assert.equal(tuiResult.details.source, source.trim());
	assert.match(tuiResult.content[0]?.text ?? "", /source fallback/);
	assert.doesNotMatch(tuiResult.content[0]?.text ?? "", /Rendered Mermaid diagram/);
	assert.equal(tuiResult.terminate, undefined);

	const fallback = await registered.execute("call-3", { source }, undefined, undefined, { mode: "print" });
	assert.match(fallback.content[0]?.text ?? "", /mermaid: sequenceDiagram/);
	assert.match(fallback.content[0]?.text ?? "", /DROP\/CREATE public; apply SQL/);

	assert.ok(sessionStart);
	sessionStart();
	assert.deepEqual(activeTools, ["read", "render_mermaid"]);
});

test("self-rendered call and result honor the outputPad setting", async () => {
	await loadGrokRenderer();
	let registered: ToolDefinition | undefined;
	mermaidExtension({
		registerTool(tool: ToolDefinition) {
			registered = tool;
		},
		on() {},
	} as unknown as ExtensionAPI);
	assert.ok(registered?.renderCall && registered.renderResult);

	const theme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
	} as Theme;
	const result = { content: [], details: { source: "flowchart LR\n  Start --> End" } };
	type RenderContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
	// Hosts before Pi 1.1 omit outputPad.
	const render = (outputPad: number | undefined, width: number) => {
		const context = { outputPad, invalidate() {} } as RenderContext;
		return {
			call: registered!.renderCall!({}, theme, context).render(width),
			result: registered!.renderResult!(result, { expanded: false, isPartial: false }, theme, context).render(width),
		};
	};
	const diagramRow = (lines: string[]) => lines.find((line) => line.includes("│ Start ├"));

	const flush = render(0, 40);
	const padded = render(1, 40);
	assert.equal(flush.call[0]?.trimEnd(), "Mermaid diagram");
	assert.equal(padded.call[0]?.trimEnd(), " Mermaid diagram");
	assert.match(diagramRow(flush.result) ?? "", /^│ Start/);
	assert.match(diagramRow(padded.result) ?? "", /^ │ Start/);
	assert.deepEqual(render(undefined, 40), flush);

	// The padded diagram needs two more columns before it fits instead of falling back to source.
	const naturalWidth = Math.max(...flush.result.map(visibleWidth));
	assert.ok(diagramRow(render(0, naturalWidth).result));
	assert.equal(diagramRow(render(1, naturalWidth).result), undefined);
	assert.match(diagramRow(render(1, naturalWidth + 2).result) ?? "", /^ │ Start/);

	assert.deepEqual(render(1, 0).result, []);
	for (const width of [1, 2, 3]) {
		const { call, result: lines } = render(1, width);
		assert.ok(lines.length > 0);
		for (const line of [...call, ...lines]) {
			assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} > ${width}: ${JSON.stringify(line)}`);
		}
	}
});
