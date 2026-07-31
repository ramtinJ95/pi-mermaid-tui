import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";
import { grokHtmlToPlainLines, loadGrokRenderer } from "../src/grok-renderer.ts";

interface GoldenCase {
	name: string;
	width: number;
	source: string;
}

const cases: GoldenCase[] = [
	{
		name: "flowchart-tb-40",
		width: 40,
		source:
			"flowchart TB\n  Request[Request] --> Valid{Valid?}\n  Valid -->|yes| Handle[Handle]\n  Valid -->|no| Reject[Reject]",
	},
	{
		name: "flowchart-tb-80",
		width: 80,
		source:
			"flowchart TB\n  Request[Request] --> Valid{Valid?}\n  Valid -->|yes| Handle[Handle]\n  Valid -->|no| Reject[Reject]",
	},
	{
		name: "flowchart-tb-120",
		width: 120,
		source:
			"flowchart TB\n  Request[Request] --> Valid{Valid?}\n  Valid -->|yes| Handle[Handle]\n  Valid -->|no| Reject[Reject]",
	},
	{
		name: "flowchart-labeled-fan-in-80",
		width: 80,
		source:
			"flowchart TB\n  Start[Start]\n  Old[Old]\n  New[New]\n  Shared[Shared]\n  Start -.->|old route| Old\n  Start -->|new route| New\n  Old -.->|old call| Shared\n  New -->|new call| Shared",
	},
	{
		name: "flowchart-lr-40",
		width: 40,
		source: "flowchart LR\n  Read[Read] --> Parse[Parse] --> Validate[Validate] --> Write[Write]",
	},
	{
		name: "flowchart-lr-80",
		width: 80,
		source: "flowchart LR\n  Read[Read] --> Parse[Parse] --> Validate[Validate] --> Write[Write]",
	},
	{
		name: "flowchart-lr-120",
		width: 120,
		source: "flowchart LR\n  Read[Read] --> Parse[Parse] --> Validate[Validate] --> Write[Write]",
	},
	{
		name: "sequence-80",
		width: 80,
		source:
			"sequenceDiagram\n  participant Client\n  participant API\n  Client->>API: Request\n  API-->>Client: Response",
	},
	{
		name: "state-80",
		width: 80,
		source:
			"stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> Idle: stop\n  Running --> [*]: finish",
	},
	{
		name: "class-80",
		width: 80,
		source:
			"classDiagram\n  class Session {\n    +String id\n    +isValid() bool\n  }\n  Session --> Token",
	},
	{
		name: "er-80",
		width: 80,
		source:
			"erDiagram\n  USER ||--o{ SESSION : has\n  USER {\n    uuid id\n  }\n  SESSION {\n    uuid id\n  }",
	},
	{
		name: "unicode-label-40",
		width: 40,
		source: "flowchart TB\n  Start[開始 🚀] --> Check{確認?}\n  Check --> Done[完了 ✓]",
	},
	{
		name: "too-wide-fallback-24",
		width: 24,
		source:
			"flowchart LR\n  Alpha[Alpha service] --> Beta[Beta service] --> Gamma[Gamma service]",
	},
	{
		name: "c4-context-80",
		width: 80,
		source:
			"flowchart TB\n  Reviewer[Person: Reviewer]\n  Portal[Container: Review portal — System: Product]:::changed\n  GitHub[External: GitHub]\n  Reviewer -->|reviews changes| Portal\n  Portal -->|reads pull requests| GitHub",
	},
	{
		name: "c4-components-120",
		width: 120,
		source:
			"flowchart TB\n  Handler[Component: Handler — Container: API — System: Product]:::same\n  Service[Component: Service — Container: API — System: Product]:::changed\n  Queue[External: Queue]\n  Worker[Container: Worker — System: Product]:::added\n  Handler -->|calls| Service\n  Service -->|publishes Job| Queue\n  Queue -->|delivers Job| Worker",
	},
];

const goldenDirectory = fileURLToPath(new URL("./fixtures/terminal-goldens/", import.meta.url));
const updateGoldens = process.env.UPDATE_GOLDENS === "1";

function withFinalNewline(lines: string[]): string {
	return `${lines.map((line) => line.trimEnd()).join("\n")}\n`;
}

for (const golden of cases) {
	test(`matches the ${golden.name} terminal golden`, async () => {
		const renderer = await loadGrokRenderer();
		const lines = grokHtmlToPlainLines(renderer.renderHtml(golden.source, golden.width));
		for (const line of lines) {
			assert.ok(
				visibleWidth(line) <= golden.width,
				`${golden.name} produced a ${visibleWidth(line)}-column line at width ${golden.width}: ${line}`,
			);
		}

		const actual = withFinalNewline(lines);
		const goldenPath = `${goldenDirectory}${golden.name}.txt`;
		if (updateGoldens) {
			await mkdir(goldenDirectory, { recursive: true });
			await writeFile(goldenPath, actual, "utf8");
			return;
		}

		let expected: string;
		try {
			expected = await readFile(goldenPath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				assert.fail(`Missing terminal golden ${goldenPath}; run npm run test:update-goldens`);
			}
			throw error;
		}
		assert.equal(actual, expected, `${golden.name} changed; review the output before updating goldens`);
	});
}
