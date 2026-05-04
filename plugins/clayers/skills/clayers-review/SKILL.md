---
name: clayers-review
description: Report Clayers-owned quality status for an existing Clayers knowledge model. Use when checking validation, drift, coverage, connectivity, artifact mappings, generated docs, or spec quality.
---

# Clayers Review

Assess the current repository's Clayers spec through Clayers-owned checks.

Use this after generation, before a commit, or when code changed and the spec may have drifted. This skill is read-only by default. Codex must not improve coverage, add mappings, adjust line ranges, add relations, rewrite prose, or resolve semantic drift itself.

## Baseline

1. Identify the spec directory. Prefer the existing `clayers/<project>/` directory. If multiple specs exist, inspect their `index.xml` files and choose the one that maps to the current repo.

2. Run read-only quality checks:

   ```bash
   clayers-quality-suite --no-fix clayers/<project>/
   ```

   If the helper script is unavailable, run:

   ```bash
   clayers validate clayers/<project>/
   clayers artifact --drift clayers/<project>/
   clayers artifact --coverage clayers/<project>/
   clayers connectivity clayers/<project>/
   ```

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
- Do not substitute Codex-authored fixes for Clayers-owned generation/sync.
- Do not claim the spec is updated unless a Clayers command updated it.

## Final Report

End with validation, drift, coverage, connectivity, Clayers commands run, changes made by Clayers if any, and whether Clayers-owned sync/generation is needed next.
