# Clayers Claude Code Plugin

Local-first Claude Code plugin for invoking Clayers-owned local workflows.

This plugin gives Claude Code a namespaced Clayers workflow:

- `/clayers:generate` - adopt the current repo if needed, request Clayers-owned sync/generation, and run quality checks when a spec exists.
- `/clayers:adopt` - bootstrap Clayers in the current repo without doing a full generation pass.
- `/clayers:review` - report Clayers validation, drift, coverage, connectivity, and mapping status.

The first release is intentionally local-first. It works in the user's checkout and leaves normal Clayers files in the repo so changes are inspectable, diffable, and commit-friendly. The plugin does not author Clayers XML inside Claude; generation runs through Clayers core or the Clayers Agent Orchestrator.

## Install For Development

From the repository root:

```bash
claude --plugin-dir ./claude-plugin
```

Then run:

```text
/clayers:generate
```

## Install From A Marketplace

Once this repository is pushed, users can add it as a Claude Code marketplace:

```text
/plugin marketplace add CognitiveLayers/clayers
/plugin install clayers@clayers-plugins
```

For development from a local checkout:

```text
/plugin marketplace add ./path/to/clayers
/plugin install clayers@clayers-plugins
```

See `../INSTALLATION.md` for the full release and troubleshooting guide.

## Requirements

- Claude Code
- Git
- A local project checkout
- Cargo or Python for first-run installation of core Clayers, unless `clayers` is already available

The plugin owns core Clayers bootstrapping through `bin/clayers-bootstrap`. It installs the pinned Clayers version from `CLAYERS_VERSION` into a plugin-managed user directory:

```text
${CLAYERS_PLUGIN_HOME:-$XDG_DATA_HOME/clayers-plugin}/clayers-<version>
```

Resolution order is `CLAYERS_BIN`, then the plugin-managed install, then `clayers` on `PATH`.

The helper script `bin/clayers-preflight` checks the local environment without modifying files. When the plugin is enabled, Claude Code adds plugin `bin/` executables to the Bash tool's `PATH`, so skills can call `clayers-bootstrap`, `clayers-preflight`, and `clayers-quality-suite` directly.

For continuous local status, run the Orchestrator watcher from a release checkout:

```bash
clayers-orchestrator watch --path /path/to/repo --mode sync
```

If no `CLAYERS_ORCHESTRATOR_URL` or `CLAYERS_API_URL` is configured and no local service is already reachable, the helper starts a temporary local Orchestrator from the release checkout.

## Product Boundary

This plugin does not require Clayers APIs or a hosted service. It runs locally first.

Hosted repo URL ingestion can come later as a Clayers-owned orchestration API. That API should use `specs` terminology, for example:

```http
POST /v1/jobs
GET  /v1/jobs/{job_id}
GET  /v1/jobs/{job_id}/events
GET  /v1/specs/{spec_id}
GET  /v1/specs/{spec_id}/docs
POST /v1/specs/{spec_id}/query
```

Pull requests should be handled by a separate integration or agent using Clayers-produced artifacts, not by the plugin boundary itself.

## Roadmap

See `ROADMAP.md`.
