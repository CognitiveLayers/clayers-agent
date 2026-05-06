# Clayers Agent Plugins

Local-first agent plugins for invoking Clayers-owned repository knowledge workflows.

This repository packages Clayers for agent interfaces without requiring users to clone and build Clayers manually. The plugins bootstrap the pinned core Clayers CLI, run local preflight checks, adopt repositories, invoke the Clayers Agent Orchestrator for sync/generation, and report docs, query, validation, drift, coverage, and connectivity.

## Layout

- `clayers-core/` - clean upstream Clayers checkout. Run core Clayers development commands from this directory.
- `claude-plugin/` - Claude Code plugin.
- `.claude-plugin/marketplace.json` - Claude Code marketplace catalog.
- `plugins/clayers/` - Codex plugin.
- `orchestrator/` - TypeScript Clayers orchestration service, Cloudflare Worker control plane, and runner container.
- `codex-marketplace.json` - publishable Codex marketplace catalog for this repo layout.
- `.github/workflows/plugin-release.yml` - CI for plugin release checks.
- `scripts/build-release-repo` - materializes a clean publishable repo from this workspace.
- `scripts/check-release` - local release validation.
- `scripts/smoke-install` - local Claude Code and Codex marketplace smoke test.
- `scripts/sync-codex-marketplace` - copies the canonical Codex marketplace catalog into `.agents/plugins/marketplace.json` when the local environment allows it.

This is the intended open-source repository shape for the first release. Do not publish from the stale outer git metadata left over from the original Clayers clone; initialize or push a clean release repository with this layout.

To materialize that clean repo:

```bash
scripts/build-release-repo /tmp/clayers-plugins-release
```

## Release Channel

Current target: `v0.1.0`.

The plugins are local-first and do not require hosted Clayers APIs. The orchestrator provides on-demand Clayers jobs, a deterministic local model generator when core `sync` is not available, generated docs, query/review APIs, realtime event streams, and a local background watcher that reruns Clayers jobs after debounced filesystem changes. It can run locally or as a Cloudflare Worker plus Cloudflare Container for remote repo jobs. Plugin hooks and MCP servers remain roadmap items.

## Quick Install

See `INSTALLATION.md` for Claude Code, Codex, and development install instructions.

## Release Checks

Run:

```bash
scripts/check-release
```

The check validates marketplace manifests, plugin manifests, shell scripts, skill files, pinned Clayers version alignment, bootstrap behavior, and the Clayers quality suite against `clayers-core/clayers/clayers`.
