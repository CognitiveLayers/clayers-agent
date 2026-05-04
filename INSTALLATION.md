# Installation

## Requirements

- Git
- Claude Code or Codex, depending on the plugin
- Cargo or Python for first-run installation of core Clayers, unless `clayers` is already installed

Both plugins pin core Clayers through `CLAYERS_VERSION`. The current pinned version is `0.2.1`.

## Claude Code

### Install From GitHub Marketplace

After this repository is pushed to GitHub:

```text
/plugin marketplace add CognitiveLayers/clayers
/plugin install clayers@clayers-plugins
```

If the marketplace is published from a different repository, replace `CognitiveLayers/clayers` with that repository.

### Local Development Install

From this repository root:

```bash
claude --plugin-dir ./claude-plugin
```

Then try:

```text
/clayers:adopt
/clayers:generate
/clayers:review
```

`/clayers:generate` requests Clayers-owned sync/generation. If the installed Clayers core does not expose autonomous sync yet, the plugin reports that boundary and runs read-only quality checks for any existing spec.

Claude Code also supports local marketplace testing:

```text
/plugin marketplace add ./path/to/this/repo
/plugin install clayers@clayers-plugins
```

## Codex

The Codex plugin lives at:

```text
plugins/clayers
```

The publishable Codex marketplace catalog for this repo layout is:

```text
codex-marketplace.json
```

For local development environments that use the repo-root `.agents/plugins/marketplace.json` convention, copy the contents of `codex-marketplace.json` into `.agents/plugins/marketplace.json` in the release checkout.

You can do that with:

```bash
scripts/sync-codex-marketplace
```

The plugin exposes these skills:

- `clayers-adopt`
- `clayers-generate` to request Clayers-owned sync/generation
- `clayers-review`

Current `codex-cli 0.125.0-alpha.3` exposes marketplace add/upgrade/remove. It does not expose a separate plugin install/list command, so the release smoke test verifies marketplace ingestion and the generated Codex config entry.

## Core Clayers Bootstrap

Both plugins resolve core Clayers in this order:

1. `CLAYERS_BIN`, if set
2. Plugin-managed install under `${CLAYERS_PLUGIN_HOME:-$XDG_DATA_HOME/clayers-plugin}/clayers-<version>`
3. `clayers` on `PATH`

Manual check:

```bash
claude-plugin/bin/clayers-bootstrap --check
plugins/clayers/scripts/clayers-bootstrap --check
```

Install or repair the pinned managed copy:

```bash
claude-plugin/bin/clayers-bootstrap --install
plugins/clayers/scripts/clayers-bootstrap --install
```

## Troubleshooting

If bootstrap says Clayers is unavailable, check whether Cargo or Python is installed. Cargo is preferred; Python installs through a venv fallback.

If Codex marketplace metadata appears stale in `.agents/plugins/marketplace.json`, regenerate it from `codex-marketplace.json` with `scripts/sync-codex-marketplace`. In this local workspace, `.agents/` may be managed by the Codex desktop app and can be read-only to automation.

If plugin commands fail after an update, rerun:

```bash
scripts/check-release
```

To verify local Claude Code and Codex marketplace ingestion end to end:

```bash
scripts/smoke-install
```

## Local Orchestrator

Run the realtime orchestration service:

```bash
cd orchestrator
npm ci
npm start
```

Then point plugins or local clients at it:

```bash
export CLAYERS_ORCHESTRATOR_URL=http://127.0.0.1:8787
clayers-orchestrator submit --path /path/to/repo --mode sync --stream
```

Run the local background watcher for a checkout:

```bash
clayers-orchestrator watch --path /path/to/repo --mode sync
```

The watcher is local-only. It observes filesystem changes, debounces them, submits a Clayers job to the local Orchestrator, streams progress, and refreshes its baseline after each run to avoid loops from generated outputs.

For Cloudflare deployment, use the Worker and container package:

```bash
cd orchestrator/cloudflare
npm ci
npm run check
npm run deploy
```

To create a clean publishable checkout from this development workspace:

```bash
scripts/build-release-repo /tmp/clayers-plugins-release
```
