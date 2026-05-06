# Roadmap

## Phase 1: Local-First Plugin

Goal: make Clayers feel like one Claude Code command in an existing checkout.

- Installable Claude Code plugin manifest.
- `/clayers:generate`, `/clayers:adopt`, and `/clayers:review` skills.
- Local preflight helper.
- Clayers-generated XML kept in the repo for review and version control.
- Claude does not author knowledge models; it invokes Clayers core or Clayers Agent Orchestrator.

## Phase 2: Local Watcher

Goal: provide near-realtime local status without involving a hosted service.

- `clayers-orchestrator watch` for debounced filesystem-triggered sync jobs.
- Clayers core state and safety primitives: `.clayers.db`, artifact hashes, drift detection, validation, coverage, connectivity, query, and docs.
- Watcher status remains process-local state only, not a new authoritative state store.
- Generated outputs refresh through orchestrator sync and the watcher baseline is refreshed after each run.

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
