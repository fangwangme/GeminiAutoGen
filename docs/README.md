# Technical Docs Index

This folder contains implementation-focused documentation.

## Start Here

- `ARCHITECTURE.md`: high-level architecture overview and module map.
- Operational baseline: use locked existing conversation with at least one generated image (avoid fresh `new conversation` threads for stable runs).

## Detailed Business Logic

- `flow-sidepanel-task-lifecycle.md`: run orchestration, retries, tab recreation, watchdog.
- `flow-content-execution.md`: per-task content script flow on Gemini page.
- `flow-background-download-pipeline.md`: download detection, stabilization, validation, rename/move.
- `timeout-and-retry-model.md`: all timeout sources and retry behavior by layer.
- `protocol-message-contracts.md`: runtime message protocol, payload schemas, and error semantics.
- `state-machines.md`: sidepanel/content/background state transitions and stop conditions.
- `config-and-storage-contracts.md`: storage keys, defaults, and cross-module ownership.
- `selectors-and-dom-contracts.md`: critical DOM selectors and invariants used for Gemini interaction.

## Engineering Operations

- `testing-and-quality.md`: current automated coverage and validation commands.
- `troubleshooting-playbook.md`: practical diagnosis checklist for common stuck/failure scenarios.
- release notes generator (stdout by default): `npm run release:notes -- --help`
