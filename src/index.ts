import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { grokHtmlToPlainLines, loadGrokRenderer } from "./grok-renderer.ts";
import { MermaidComponent } from "./mermaid-component.ts";

const MAX_SOURCE_LENGTH = 20_000;
const MAX_SOURCE_LINES = 400;

interface MermaidDetails {
	source: string;
}

// renderShell "self" renderers apply Pi's outputPad setting themselves. Hosts before Pi 1.1 do not
// pass it; keep the unpadded layout they always had instead of Text's default padding of 1.
function outputPad(context: { outputPad?: number }): number {
	return context.outputPad ?? 0;
}

export default function mermaidExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "render_mermaid",
		label: "Mermaid",
		description:
			"Render Mermaid source as a Unicode box-drawing diagram directly in the Pi TUI. Supports graph/flowchart, sequence, state, class, and ER diagrams. Flowcharts honor TB/TD, BT, LR, and RL directions; state and class diagrams honor direction statements. C4-style views use ordinary flat flowcharts rather than native Mermaid C4 syntax.",
		promptSnippet: "Render Mermaid diagrams inline as terminal-native Unicode art",
		promptGuidelines: [
			"Use render_mermaid instead of emitting a raw Mermaid code fence when a diagram would clarify the answer.",
			"When the user requests a diagram orientation, encode it in the render_mermaid source: use flowchart TB for vertical or flowchart LR for horizontal flowcharts, and direction TB or direction LR inside state and class diagrams.",
			"When the user does not request an orientation, prefer vertical flowcharts for branching or potentially wide diagrams and horizontal flowcharts for short linear flows.",
			"For C4-style architecture views, use render_mermaid with ordinary flat flowchart syntax; use one global flowchart direction, keep labels concise, encode architectural ownership in node labels rather than subgraphs, use the exact label prefixes Person:, System:, Container:, Component:, or External:, and label relationships by intent or data flow.",
			"Do not send native C4Context, C4Container, C4Component, C4Dynamic, C4Deployment, or any other native Mermaid C4 syntax to render_mermaid; show only the changed architectural elements and their directly affected neighbors, usually 5–15 nodes.",
		],
		parameters: Type.Object({
			source: Type.String({
				description: "Complete Mermaid diagram source without Markdown fences",
				minLength: 1,
				maxLength: MAX_SOURCE_LENGTH,
			}),
		}),
		renderShell: "self",
		// The diagram is only visible as this tool's own transcript row. Nested calls from codemode
		// scripts get no row, so keep the tool out of scripts and declared directly to the model.
		exposure: "model-only",

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const source = params.source.trim();
			if (!source) throw new Error("Mermaid source is empty");
			if (source.length > MAX_SOURCE_LENGTH) {
				throw new Error(`Mermaid source exceeds ${MAX_SOURCE_LENGTH} characters`);
			}
			if (source.split("\n").length > MAX_SOURCE_LINES) {
				throw new Error(`Mermaid source exceeds ${MAX_SOURCE_LINES} lines`);
			}
			if (signal?.aborted) throw new Error("Mermaid rendering was cancelled");

			const renderer = await loadGrokRenderer();
			if (signal?.aborted) throw new Error("Mermaid rendering was cancelled");
			const validationHtml = renderer.renderHtml(source, 0);
			if (!validationHtml) throw new Error("Mermaid renderer returned no output");

			const content =
				ctx.mode === "tui"
					? "Mermaid output is shown in the TUI, with source fallback for unsupported syntax or insufficient width."
					: grokHtmlToPlainLines(renderer.renderHtml(source, 100)).join("\n");
			return {
				content: [{ type: "text" as const, text: content }],
				details: { source } satisfies MermaidDetails,
			};
		},

		renderCall(_args, theme, context) {
			return new Text(theme.fg("toolTitle", theme.bold("Mermaid diagram")), outputPad(context), 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			const paddingX = outputPad(context);
			if (isPartial) return new Text(theme.fg("dim", "Preparing diagram..."), paddingX, 0);
			const details = result.details as MermaidDetails | undefined;
			if (!details?.source) {
				const content = result.content.find((item) => item.type === "text");
				return new Text(content?.type === "text" ? content.text : "Mermaid diagram unavailable", paddingX, 0);
			}
			return new MermaidComponent({
				source: details.source,
				showSource: expanded,
				theme,
				paddingX,
				onReady: context.invalidate,
			});
		},
	});

	pi.on("session_start", () => {
		const activeTools = pi.getActiveTools();
		if (!activeTools.includes("render_mermaid")) {
			pi.setActiveTools([...activeTools, "render_mermaid"]);
		}
	});
}
