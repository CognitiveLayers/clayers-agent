# Clayers Codex Plugin

Local-first Codex plugin for invoking Clayers-owned local workflows.

This plugin gives Codex reusable Clayers workflows:

- `clayers-generate` - adopt the current repo if needed, request Clayers-owned sync/generation, and run quality checks when a spec exists.
- `clayers-adopt` - bootstrap Clayers in the current repo without doing a full generation pass.
- `clayers-review` - report Clayers validation, drift, coverage, connectivity, and mapping status.

The first release works in the user's checkout and leaves normal Clayers files in the repo so changes are inspectable, diffable, and commit-friendly. The plugin does not author Clayers XML itself.

## Requirements

- Codex with local plugins enabled
- Git
- A local project checkout
- Cargo or Python for first-run installation of core Clayers, unless `clayers` is already available

The plugin owns core Clayers bootstrapping through `scripts/clayers-bootstrap`. It installs the pinned Clayers version from `CLAYERS_VERSION` into a plugin-managed user directory:

```text
${CLAYERS_PLUGIN_HOME:-$XDG_DATA_HOME/clayers-plugin}/clayers-<version>
```

Resolution order is `CLAYERS_BIN`, then the plugin-managed install, then `clayers` on `PATH`.

For continuous local status, run the Orchestrator watcher from a release checkout with the orchestrator service running:

```bash
clayers-orchestrator watch --path /path/to/repo --mode sync
```

## Local Marketplace

This repo includes a publishable Codex marketplace manifest at:

```text
codex-marketplace.json
```

It points at:

```text
./plugins/clayers
```

For local development environments that expect `.agents/plugins/marketplace.json`, copy the contents of `codex-marketplace.json` into that file in the release checkout.

See `../../INSTALLATION.md` for the full release and troubleshooting guide.

## Product Boundary

This plugin does not require hosted Clayers APIs. It wraps local Clayers CLI behavior first.

Hosted repo URL ingestion can come later as a Clayers-owned orchestration API. The plugin should keep talking to stable local commands or MCP tools so Clayers core can evolve independently.
