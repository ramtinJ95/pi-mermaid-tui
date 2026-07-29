# Agent guide

This repository is the canonical source for `@ramtinj95/pi-mermaid-tui`.

- Keep the Pi tool integration in `src/` separate from the Rust renderer in `grok-mermaid/`.
- `grok-mermaid/` is pinned upstream source; document local renderer changes and retain Apache-2.0 notices.
- Do not edit `grok-mermaid.wasm` directly. Rebuild it from `grok-mermaid/` and verify its checksum.
- Run `npm run check` after changes; it type-checks, tests TypeScript and Rust, and verifies npm package contents.
