---
description: Bootstrap Clayers in the current local repository without doing a full generation pass. Use when the user asks to adopt a repo, initialize Clayers, or prepare a project for Clayers specs.
argument-hint: "[--update]"
allowed-tools:
  - Bash(git *)
  - Bash(clayers *)
  - Bash(clayers-bootstrap)
  - Bash(clayers-bootstrap *)
  - Bash(./claude-plugin/bin/clayers-bootstrap *)
  - Bash(claude-plugin/bin/clayers-bootstrap *)
  - Bash(clayers-preflight)
  - Bash(clayers-preflight *)
  - Bash(./claude-plugin/bin/clayers-preflight *)
  - Bash(claude-plugin/bin/clayers-preflight *)
---

# Adopt Repository

Prepare the current checkout for Clayers.

This skill is intentionally narrower than `/clayers:generate`: it installs or verifies the local Clayers tool, runs adoption, and validates the starter spec. It should not attempt to fully model the codebase.

## Flow

1. Run preflight:

   ```bash
   clayers-preflight
   ```

2. Ensure core Clayers is installed through the plugin bootstrap:

   ```bash
   clayers-bootstrap --install
   ```

3. Run adoption:

   ```bash
   clayers adopt .
   ```

   If the project is already adopted and the user passed `--update`, run:

   ```bash
   clayers adopt . --update
   ```

4. Determine the spec directory and validate:

   ```bash
   clayers validate clayers/<project>/
   ```

5. Report what adoption created:

   - `.clayers/schemas/`
   - `.gitignore` managed block
   - `clayers/<project>/`
   - `AGENTS.md` or `CLAUDE.md` workflow section

## Boundaries

- Do not generate architecture, terminology, or artifact mappings in this skill.
- If the user wants generation, hand off to `/clayers:generate`.
