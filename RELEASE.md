# Release Checklist

## Release Target

Current release target: `v0.1.0`.

This is suitable for an open-source local-first plugin release after local generation, watcher, docs/query/review, and marketplace smoke tests pass.

## Repository Shape

Publish this layout intentionally:

- `clayers-core/`
- `claude-plugin/`
- `.claude-plugin/marketplace.json`
- `plugins/clayers/`
- `orchestrator/`
- `orchestrator/cloudflare/`
- `codex-marketplace.json`
- `INSTALLATION.md`
- `scripts/check-release`
- `.github/workflows/plugin-release.yml`

The local `clayers-core/` checkout has its own clean git history. The outer workspace may still contain stale git metadata from the original Clayers clone; do not push from the outer `.git` until it has been reinitialized or pointed at the intended release repository.

For release, publish a clean repository with this shape. Treat `codex-marketplace.json` as the canonical Codex marketplace manifest; materialize `.agents/plugins/marketplace.json` from it only in environments that expect that path.

This workspace can materialize the clean publishable repo with:

```bash
scripts/build-release-repo /tmp/clayers-plugins-release
```

## Preflight

Run:

```bash
scripts/check-release
```

Expected results:

- JSON manifests are valid.
- Shell scripts pass `bash -n`.
- Orchestrator TypeScript, Cloudflare Worker TypeScript, shell scripts, sync smoke, docs endpoint, query endpoint, review endpoint, and watcher smoke pass.
- Codex skill files validate.
- Claude and Codex bootstrap scripts locate usable core Clayers.
- Pinned plugin versions match the core Clayers crate version.
- `clayers-core/clayers/clayers` validates with no drift.

## End-To-End Install Smoke Tests

Claude Code local marketplace smoke test:

```bash
tmp="$(mktemp -d /tmp/clayers-release-smoke.XXXXXX)"
home="$(mktemp -d /tmp/clayers-claude-home.XXXXXX)"
project="$(mktemp -d /tmp/clayers-claude-project.XXXXXX)"
mkdir -p "$tmp/.claude-plugin" "$tmp/plugins"
cp -R claude-plugin "$tmp/claude-plugin"
cp .claude-plugin/marketplace.json "$tmp/.claude-plugin/marketplace.json"
cd "$project"
HOME="$home" claude plugin marketplace add "$tmp"
HOME="$home" claude plugin install clayers@clayers-plugins --scope local
HOME="$home" claude plugin list
```

When preserving the same temporary `HOME`, `claude plugin list` should show:

```text
clayers@clayers-plugins
Version: 0.1.0
Status: enabled
```

Codex local marketplace smoke test:

```bash
tmp="$(mktemp -d /tmp/clayers-release-smoke.XXXXXX)"
home="$(mktemp -d /tmp/clayers-codex-home.XXXXXX)"
mkdir -p "$tmp/.agents/plugins" "$tmp/plugins"
cp -R plugins/clayers "$tmp/plugins/clayers"
cp codex-marketplace.json "$tmp/.agents/plugins/marketplace.json"
HOME="$home" codex plugin marketplace add "$tmp"
```

The current `codex-cli 0.125.0-alpha.3` exposes marketplace add/upgrade/remove, but not plugin install/list. A successful add writes `marketplaces.clayers-local` to the isolated Codex config.

## CI

GitHub Actions runs `.github/workflows/plugin-release.yml` on pushes and pull requests. It installs the pinned Clayers CLI from PyPI and runs `scripts/check-release`.

For local client smoke tests, run:

```bash
scripts/smoke-install
```

The orchestrator smoke test also verifies that the Claude helper can start a temporary local Orchestrator and complete `repo -> Clayers model -> docs/query/review` without a pre-running service.

## GitHub Publish

For Claude Code distribution, the GitHub repo must include:

```text
.claude-plugin/marketplace.json
claude-plugin/.claude-plugin/plugin.json
claude-plugin/skills/
claude-plugin/bin/
```

Users install with:

```text
/plugin marketplace add CognitiveLayers/clayers
/plugin install clayers@clayers-plugins
```

For Codex distribution, keep:

```text
plugins/clayers/.codex-plugin/plugin.json
plugins/clayers/skills/
plugins/clayers/scripts/
codex-marketplace.json
```

If the release environment expects `.agents/plugins/marketplace.json`, copy `codex-marketplace.json` there as part of packaging.

```bash
scripts/sync-codex-marketplace
```

## Version Bump

For plugin-only changes, bump:

- `claude-plugin/.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `plugins/clayers/.codex-plugin/plugin.json`
- `codex-marketplace.json` if marketplace versioning is added

For core Clayers changes, update:

- `clayers-core/crates/clayers/Cargo.toml`
- `claude-plugin/CLAYERS_VERSION`
- `plugins/clayers/CLAYERS_VERSION`

## Not Yet In Scope

- Plugin hooks
- Local MCP server
