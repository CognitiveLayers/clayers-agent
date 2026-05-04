---
name: clayers-adopt
description: Bootstrap Clayers in the current local repository without doing a full generation pass. Use when the user asks to adopt a repo, initialize Clayers, prepare a project for Clayers specs, or install the local Clayers tool.
---

# Clayers Adopt

Prepare the current checkout for Clayers.

## Flow

1. Run preflight:

   ```bash
   clayers-preflight
   ```

   If `clayers-preflight` is not on `PATH`, run `scripts/clayers-preflight` from this plugin.

2. Ensure core Clayers is installed through the plugin bootstrap:

   ```bash
   clayers-bootstrap --install
   ```

   If `clayers-bootstrap` is not on `PATH`, run `scripts/clayers-bootstrap` from this plugin.

3. Run adoption:

   ```bash
   clayers adopt .
   ```

   If the project is already adopted and the user asked to update adoption scaffolding, run:

   ```bash
   clayers adopt . --update
   ```

4. Determine the spec directory and validate it:

   ```bash
   clayers validate clayers/<project>/
   ```

5. Report what adoption created or updated:

   - `.clayers/schemas/`
   - `.gitignore` managed block
   - `clayers/<project>/`
   - `AGENTS.md` or `CLAUDE.md` workflow section

## Boundaries

- Do not generate architecture, terminology, or artifact mappings in this skill.
- If the user wants generation, use `clayers-generate`.
- Do not commit automatically unless the user asks.
