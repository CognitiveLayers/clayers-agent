# Roadmap

## v0.1 Local Skills

- Adopt a local repository into Clayers.
- Request Clayers-owned sync/generation from repo context when the installed core or hosted service exposes it.
- Review validation, drift, coverage, connectivity, and mapping status.
- Bootstrap the pinned core Clayers CLI without asking users to clone Clayers manually.
- Run `clayers-orchestrator watch` for debounced local filesystem-triggered Clayers jobs.

## v0.2 Local Watcher

- Implemented in the shared TypeScript orchestrator.
- Tracks local file changes and submits debounced jobs to the local Orchestrator.
- Keeps watcher status as process-local state only, not a new authoritative state store.
- Does not silently rewrite specs in the plugin background.

## v0.3 Plugin Hooks

- Add Codex hooks for pre-commit or pre-final-response drift reminders.
- Keep hooks opt-in so normal Codex work is not slowed down.

## v0.4 Local MCP Server

- Expose local Clayers actions as MCP tools.
- Start with local filesystem operations only: adopt, validate, drift, coverage, connectivity, docs, query.
- Keep hosted API integration as a separate transport rather than a plugin requirement.
