import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import mermaidExtension from "../src/index.ts";

interface RegisteredMermaidTool {
	name: string;
	promptGuidelines?: string[];
	execute(
		toolCallId: string,
		params: { source: string },
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		context: { mode: "print" },
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
	assert.match(registered.promptGuidelines?.join("\n") ?? "", /Do not send native C4Context/);

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

	assert.ok(sessionStart);
	sessionStart();
	assert.deepEqual(activeTools, ["read", "render_mermaid"]);
});
