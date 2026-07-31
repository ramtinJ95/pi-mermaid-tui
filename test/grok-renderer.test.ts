import assert from "node:assert/strict";
import test from "node:test";
import { grokHtmlToPlainLines, loadGrokRenderer, parseGrokHtmlLine } from "../src/grok-renderer.ts";

const diagramFamilies = [
	{
		name: "flowchart",
		source: "flowchart LR\n  Start[Start] --> End[End]",
		labels: ["Start", "End"],
	},
	{
		name: "sequence",
		source: "sequenceDiagram\n  Browser->>Server: Request\n  Server-->>Browser: Response",
		labels: ["Browser", "Server", "Request", "Response"],
	},
	{
		name: "state",
		source: "stateDiagram-v2\n  Idle --> Running: start\n  Running --> Idle: stop",
		labels: ["Idle", "Running", "start", "stop"],
	},
	{
		name: "class",
		source: "classDiagram\n  class User\n  User : +String name\n  User : +login()",
		labels: ["User", "name", "login"],
	},
	{
		name: "entity relationship",
		source: 'erDiagram\n  USER ||--o{ POST : writes\n  USER {\n    string name\n  }',
		labels: ["USER", "POST", "writes", "name"],
	},
] as const;

test("renders a flowchart through the vendored Grok WASM", async () => {
	const renderer = await loadGrokRenderer();
	const html = renderer.renderHtml("graph LR\n  A[Start] --> B[End]", 80);
	const plain = grokHtmlToPlainLines(html).join("\n");
	assert.match(html, /class="[bn]"/);
	assert.match(plain, /Start/);
	assert.match(plain, /End/);
	assert.match(plain, /[▶▼]/);
});

for (const diagram of diagramFamilies) {
	test(`renders the ${diagram.name} family`, async () => {
		const renderer = await loadGrokRenderer();
		const plain = grokHtmlToPlainLines(renderer.renderHtml(diagram.source, 120)).join("\n");
		for (const label of diagram.labels) assert.match(plain, new RegExp(label));
	});
}

test("honors a width cap by returning output that fits", async () => {
	const renderer = await loadGrokRenderer();
	const html = renderer.renderHtml("graph LR\n  A[Alpha] --> B[Beta] --> C[Gamma]", 24);
	const lines = grokHtmlToPlainLines(html);
	assert.ok(lines.length > 0);
	for (const line of lines) assert.ok(line.length <= 24, `${line.length}: ${line}`);
});

test("decodes the renderer's controlled HTML spans", () => {
	assert.deepEqual(parseGrokHtmlLine('<span class="n i">a &amp; b</span>'), [
		{ classes: ["n", "i"], text: "a & b" },
	]);
});

test("uses the upstream framed-source fallback for unsupported diagram families", async () => {
	const renderer = await loadGrokRenderer();
	const plain = grokHtmlToPlainLines(renderer.renderHtml('pie title Pets\n  "Dogs" : 3', 80)).join("\n");
	assert.match(plain, /mermaid: pie/i);
	assert.match(plain, /Dogs/);
});

test("preserves code-change classes through the bundled WASM", async () => {
	const renderer = await loadGrokRenderer();
	const html = renderer.renderHtml(
		"flowchart TD\n  A[Same]:::same --> B[Added]:::added\n  B -.-> C[Removed]:::removed\n  D[Changed]\n  class D changed\n  linkStyle 1 stroke:#cf222e,stroke-dasharray:5",
		120,
	);
	for (const semanticClass of ["same", "added", "removed", "changed"]) {
		assert.match(html, new RegExp(`class=\"[bn] ${semanticClass}\"`));
	}
	assert.match(html, /class="e removed"/);

	const stateHtml = renderer.renderHtml(
		"stateDiagram-v2\n  Idle:::same --> Running:::added\n  Failed\n  class Failed removed",
		120,
	);
	assert.match(stateHtml, /class="b same"/);
	assert.match(stateHtml, /class="b added"/);
	assert.match(stateHtml, /class="b removed"/);
});

test("renders a C4-style component view through flowchart conventions", async () => {
	const renderer = await loadGrokRenderer();
	const html = renderer.renderHtml(
		"flowchart TB\n  Reviewer[Person: Reviewer]\n  subgraph Product[System: Product]\n    API[Container: API]:::changed\n    Worker[Component: Worker]:::added\n  end\n  Queue[External: Queue]\n  Reviewer -->|reviews behavior| API\n  API -->|publishes Job| Queue\n  Queue -->|delivers Job| Worker",
		120,
	);
	const plain = grokHtmlToPlainLines(html).join("\n");
	for (const label of ["Person: Reviewer", "System: Product", "Container: API", "Component: Worker", "External: Queue"]) {
		assert.match(plain, new RegExp(label));
	}
	assert.doesNotMatch(plain, /mermaid: flowchart/i);
});
