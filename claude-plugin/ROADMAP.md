# Roadmap

## Phase 1: Local-First Plugin

Goal: make Clayers feel like one Claude Code command in an existing checkout.

- Add installable Claude Code plugin manifest.
- Add `/clayers:generate`, `/clayers:adopt`, and `/clayers:review` skills.
- Add local preflight helper.
- Keep all Clayers-generated XML in the repo for review and version control.
- Do not author knowledge models inside Claude; invoke Clayers-owned local or hosted capabilities.

## Phase 2: Local Watcher

Goal: provide near-realtime local status without involving a hosted service.

- Add `clayers-orchestrator watch` for debounced filesystem-triggered jobs.
- Reuse Clayers core state and safety primitives: `.clayers.db`, artifact hashes, read-only drift detection, validation, coverage, and connectivity.
- Keep watcher status as process-local state only, not a new authoritative state store.
- Report drift and Clayers sync status; do not silently rewrite specs in the plugin background.
- Optionally regenerate docs when specs change.

Implemented files:

- `orchestrator/src/watcher.ts`
- `orchestrator/src/client.ts`
- `bin/clayers-orchestrator`

## Phase 3: Plugin Hooks

Goal: make quality checks automatic after relevant edits.

- Add opt-in hooks for `PostToolUse` on `Write` and `Edit`.
- Detect whether a change touched Clayers specs or mapped source files.
- Run lightweight checks first: `validate`, then targeted `drift`.
- Avoid surprise expensive work; hooks should be configurable and quiet when no Clayers spec exists.

Candidate files:

- `hooks/hooks.json`
- `bin/clayers-hook-check`

## Phase 4: Local MCP Server

Goal: expose Clayers as structured tools instead of shell-command parsing.

- Bundle a plugin MCP server.
- Provide tools:
  - `clayers.preflight`
  - `clayers.adopt`
  - `clayers.sync`
  - `clayers.validate`
  - `clayers.check_drift`
  - `clayers.coverage`
  - `clayers.connectivity`
  - `clayers.query`
  - `clayers.generate_docs`
- Keep the MCP server local by default.

Candidate files:

- `.mcp.json`
- `mcp/server`

## Phase 5: Hosted Specs API

Goal: support "give repo URL and Clayers does its thing" without local cloning.

- Add orchestration API with `specs` naming.
- Run generation jobs in containers.
- Stream job events via SSE first; consider WebSockets for bidirectional control.
- Store Clayers-generated specs and docs as artifacts.
- Leave pull requests to a separate integration or agent that consumes Clayers-produced artifacts.
