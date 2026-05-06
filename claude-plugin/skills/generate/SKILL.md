---
description: Ask Clayers to sync or generate the current local repository through Clayers-owned core or hosted orchestration. Use when the user says to generate Clayers, create a knowledge model, index a repo, sync a repo, or update a Clayers spec after code changes.
argument-hint: "[--local | --hosted | --resume]"
allowed-tools:
  - Bash(git *)
  - Bash(clayers *)
  - Bash(clayers-bootstrap)
  - Bash(clayers-bootstrap *)
  - Bash(./claude-plugin/bin/clayers-bootstrap *)
  - Bash(claude-plugin/bin/clayers-bootstrap *)
  - Bash(clayers-preflight)
  - Bash(clayers-preflight *)
  - Bash(clayers-quality-suite)
  - Bash(clayers-quality-suite *)
  - Bash(clayers-orchestrator)
  - Bash(clayers-orchestrator *)
  - Bash(./claude-plugin/bin/clayers-preflight *)
  - Bash(claude-plugin/bin/clayers-preflight *)
  - Bash(./claude-plugin/bin/clayers-quality-suite *)
  - Bash(claude-plugin/bin/clayers-quality-suite *)
  - Bash(./claude-plugin/bin/clayers-orchestrator *)
  - Bash(claude-plugin/bin/clayers-orchestrator *)
---

# Request Clayers Sync

Ask Clayers to turn the current checkout into a Clayers-backed knowledge model.

This skill is only an interface to Clayers. Claude must not author the knowledge model, rewrite Clayers XML, invent mappings, or resolve semantic drift itself. Use Clayers core or the Clayers Orchestrator for generation; if the Orchestrator reports a deterministic local generation fallback, report it as Clayers Agent output rather than Claude-authored XML.

## Operating Principles

- Clayers core and Clayers Agent Orchestrator own generation, sync, drift interpretation, mappings, relations, and spec edits.
- Claude owns orchestration: preflight, bootstrap, command invocation, and reporting.
- Treat Clayers files as source. Do not overwrite or manually patch them unless a Clayers command produced the change.
- Do not claim generation or sync happened unless Clayers core or hosted orchestration actually performed it.

## Flow

1. Run local preflight:

   ```bash
   clayers-preflight
   ```

   If the script is unavailable because the plugin is installed elsewhere, do equivalent checks manually:

   ```bash
   git rev-parse --show-toplevel
   git status --short
   clayers --help
   ```

2. Ensure core Clayers is installed through the plugin bootstrap:

   ```bash
   clayers-bootstrap --install
   ```

   This installs the pinned version from the plugin's `CLAYERS_VERSION` file into the plugin-managed user directory. Do not hand-roll separate Cargo or pip commands unless bootstrap fails and the user asks for manual recovery.

3. Determine the project slug:

   ```bash
   basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
   ```

   Use `clayers/<project>/` as the expected spec directory unless the repo already has exactly one Clayers spec directory.

4. Adopt the project if needed:

   ```bash
   clayers adopt .
   ```

5. Request Clayers-owned sync/generation through the Orchestrator first.

   Submit the current repo to the Clayers Orchestrator and stream job events:

   ```bash
   clayers-orchestrator submit --path . --mode sync --stream
   ```

   If the helper script is unavailable because the plugin is installed elsewhere, run `./claude-plugin/bin/clayers-orchestrator submit --path . --mode sync --stream`.

   The helper talks to `CLAYERS_ORCHESTRATOR_URL` or `CLAYERS_API_URL` when configured. Otherwise it can run the local TypeScript Orchestrator from the release checkout. The Orchestrator adopts the repo, asks core Clayers for `sync` when available, falls back to deterministic local model generation when core `sync` is unavailable, refreshes hashes through Clayers core, generates docs, runs query, and runs review checks.

6. For emergency local execution without an Orchestrator package, check whether the installed core exposes a sync command:

   ```bash
   clayers sync --help
   ```

   If supported, run the command exactly as Clayers documents it. Prefer the current repo as the target:

   ```bash
   clayers sync .
   ```

   Only use hosted orchestration when the configured service exposes the documented `/v1/jobs` and `/v1/jobs/{job_id}/events` contract. Do not invent a different API contract inside the skill.

7. If neither the Orchestrator nor core sync is available, stop at the Clayers boundary.

   Run read-only quality checks when a spec already exists:

   ```bash
   clayers-quality-suite --no-fix clayers/<project>/
   ```

   Then report that sync/generation could not run because neither the Orchestrator nor core sync is available. Do not build a repo model or write XML manually.

8. If Clayers changed or created a spec, validate it:

   ```bash
   clayers-quality-suite clayers/<project>/
   ```

   If the helper script is unavailable, run the equivalent commands:

   ```bash
   clayers artifact --fix-node-hash clayers/<project>/
   clayers artifact --fix-artifact-hash clayers/<project>/
   clayers validate clayers/<project>/
   clayers artifact --drift clayers/<project>/
   clayers artifact --coverage clayers/<project>/
   clayers connectivity clayers/<project>/
   ```

9. Generate docs only when validation passes and only through Clayers or Orchestrator output:

   ```bash
   clayers doc clayers/<project>/
   ```

10. Finish with a concise report:

   - Spec directory.
   - Clayers command used.
   - Files created or updated by Clayers, if any.
   - Validation result.
   - Drift result.
   - Coverage summary.
   - Connectivity summary.
   - Whether autonomous sync/generation was available.
   - Whether the Orchestrator used core sync or deterministic local generation.
   - Whether changes are ready to commit.

## Resume Mode

If invoked with `--resume`, do not start over. Ask Clayers to continue through its supported resume/sync command if one exists. Otherwise run read-only checks and report the unsupported gap.

## Boundaries

- Do not build a codebase model independently.
- Do not write or rewrite Clayers XML manually.
- Do not add artifact mappings, relations, terminology, or prose yourself.
- Do not repair semantic drift yourself.
- Do not silently refresh hashes when the code and spec disagree semantically.

## Commit Policy

Do not commit automatically unless the user asks. If asked to commit, include Clayers spec changes and any related source changes in the same logical commit.
