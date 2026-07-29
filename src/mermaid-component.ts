import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
	getLoadedGrokRenderer,
	grokHtmlToPlainLines,
	loadGrokRenderer,
	parseGrokHtmlLine,
	type GrokRenderer,
	type GrokSpan,
} from "./grok-renderer.ts";

interface MermaidComponentOptions {
	source: string;
	showSource: boolean;
	theme: Theme;
	onReady: () => void;
}

function styleSpan(span: GrokSpan, theme: Theme): string {
	let text = span.text;
	const classes = new Set(span.classes);
	if (classes.has("t")) text = theme.fg("toolTitle", theme.bold(text));
	else if (classes.has("el")) text = theme.fg("accent", text);
	else if (classes.has("n")) text = theme.fg("text", text);
	else if (classes.has("b")) text = theme.fg("borderAccent", text);
	else if (classes.has("e")) text = theme.fg("muted", text);
	if (classes.has("i")) text = theme.italic(text);
	return text;
}

export class MermaidComponent implements Component {
	private readonly source: string;
	private readonly showSource: boolean;
	private readonly theme: Theme;
	private renderer: GrokRenderer | undefined;
	private loadError: string | undefined;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor({ source, showSource, theme, onReady }: MermaidComponentOptions) {
		this.source = source;
		this.showSource = showSource;
		this.theme = theme;
		this.renderer = getLoadedGrokRenderer();
		if (!this.renderer) {
			void loadGrokRenderer().then(
				(renderer) => {
					this.renderer = renderer;
					this.invalidate();
					onReady();
				},
				(error) => {
					this.loadError = error instanceof Error ? error.message : String(error);
					this.invalidate();
					onReady();
				},
			);
		}
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private renderSource(width: number): string[] {
		const lines = [this.theme.fg("dim", "Mermaid source")];
		for (const sourceLine of this.source.split("\n")) {
			const styled = this.theme.fg("mdCodeBlock", sourceLine || " ");
			lines.push(...wrapTextWithAnsi(styled, width));
		}
		return lines;
	}

	private renderFailure(width: number, message: string): string[] {
		const heading = truncateToWidth(this.theme.fg("error", `Mermaid renderer error: ${message}`), width);
		return [heading, "", ...this.renderSource(width)];
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		let lines: string[];
		if (this.loadError) {
			lines = this.renderFailure(width, this.loadError);
		} else if (!this.renderer) {
			lines = [truncateToWidth(this.theme.fg("dim", "Loading Mermaid renderer..."), width)];
		} else {
			try {
				const html = this.renderer.renderHtml(this.source, width);
				const plainLines = grokHtmlToPlainLines(html);
				const overWidth = plainLines.find((line) => visibleWidth(line) > width);
				if (overWidth !== undefined) {
					lines = this.renderFailure(width, `output exceeded the available width (${width} columns)`);
				} else {
					const htmlLines = html.split("\n");
					if (htmlLines.at(-1) === "") htmlLines.pop();
					lines = htmlLines.map((line) =>
						parseGrokHtmlLine(line).map((span) => styleSpan(span, this.theme)).join(""),
					);
					if (this.showSource) lines.push("", ...this.renderSource(width));
				}
			} catch (error) {
				lines = this.renderFailure(width, error instanceof Error ? error.message : String(error));
			}
		}

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}
