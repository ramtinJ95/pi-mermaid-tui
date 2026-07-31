# Third-party notices

## Grok Mermaid renderer

`grok-mermaid.wasm` and the buildable source under `grok-mermaid/` come from Simon Willison's [`simonw/tools`](https://github.com/simonw/tools/tree/main/grok-mermaid) repository at commit:

```text
724c6b18dd1de27e7dc8ec2c6331b4c7f48cebc8
```

Artifact SHA-256:

```text
3be3717f94d23fae553aa33fe3e328f51e3bac2044422568f29d7576b2cd3e05
```

Simon Willison's project packages the Mermaid terminal renderer from [`xai-org/grok-build`](https://github.com/xai-org/grok-build), changes two `ratatui` import lines to use a local shim, and adds the WebAssembly wrapper. This repository additionally preserves a closed set of semantic code-change classes through flowchart/state parsing, canvas rendering, and HTML serialization, as documented in [`grok-mermaid/README.md`](grok-mermaid/README.md). The renderer is copyright 2023-2026 SpaceXAI. The renderer, shim, and wrapper are licensed under Apache License 2.0; the complete license and modification notice are retained in [`grok-mermaid/LICENSE`](grok-mermaid/LICENSE) and the source headers.

This package is independent and is not affiliated with or endorsed by xAI, SpaceXAI, Grok Build, or Simon Willison.

## unicode-width

The WebAssembly module statically includes [`unicode-width`](https://github.com/unicode-rs/unicode-width) version 0.2.2, distributed under `MIT OR Apache-2.0`. Its original copyright notice and both license choices are included under [`licenses/`](licenses/).
