---
description: Report Clayers-owned quality status for an existing Clayers spec. Use when checking validation, drift, coverage, connectivity, artifact mappings, generated docs, or spec quality.
argument-hint: "[--fix-mechanical | --coverage | --drift]"
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
  - Bash(./claude-plugin/bin/clayers-preflight *)
  - Bash(claude-plugin/bin/clayers-preflight *)
  - Bash(./claude-plugin/bin/clayers-quality-suite *)
  - Bash(claude-plugin/bin/clayers-quality-suite *)
---

# Review Clayers Status

Assess the current repository's Clayers spec through Clayers-owned checks.

Use this after generation, before a commit, or when code changed and the spec may have drifted. This skill is read-only by default. Claude must not improve coverage, add mappings, adjust line ranges, add relations, rewrite prose, or resolve semantic drift itself.

## Baseline

1. Identify the spec directory. Prefer the existing `clayers/<project>/` directory. If multiple specs exist, inspect their `index.xml` files and choose the one that maps to the current repo.

2. Run quality checks:

   ```bash
   clayers-quality-suite --no-fix clayers/<project>/
   ```

   If the helper script is unavailable, run `clayers validate`, `clayers artifact --drift`, `clayers artifact --coverage`, and `clayers connectivity` directly.

3. Record:

   - Validation errors.
   - Drifted mappings.
   - Mapped, unmapped, and exempt nodes.
   - Low-coverage files.
   - Isolated nodes and weak relation areas.

## Mechanical Fix Mode

Only if the user explicitly asks for mechanical fixes, run the Clayers-owned hash maintenance workflow:

```bash
clayers-quality-suite clayers/<project>/
```

Do not manually refresh hashes, adjust mappings, change ranges, or edit XML. If drift indicates semantic disagreement, report it as requiring Clayers-owned sync or hosted orchestration.

## Boundaries

- Do not edit Clayers XML manually.
- Do not improve coverage by adding mappings or relations yourself.
- Do not reinterpret drift beyond what Clayers reports.
- Do not substitute Claude-authored fixes for Clayers-owned generation/sync.
- Do not claim the spec is updated unless a Clayers command updated it.

## Final Report

End with:

- Validation status.
- Drift status.
- Coverage status.
- Connectivity status.
- Clayers commands run.
- Changes made by Clayers, if any.
- Whether Clayers-owned sync/generation is needed next.
