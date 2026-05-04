<!-- clayers:adopt -->
## Clayers Development Workflow

This project uses [clayers](https://github.com/inferaldata/clayers) for
structured, layered specifications with machine-verifiable traceability.

**Clayers first, code second.** Before and after orchestrator changes, run the
local Clayers loop so the event stream shows what Clayers core currently knows.

1. **Run realtime Clayers self-sync**: `npm run clayers:self-sync`
2. **Implement** the code
3. **Run Clayers checks**: `npm run clayers:check`
4. **Commit** Clayers-visible changes and code together

The orchestrator must not substitute Claude/Codex-authored XML for Clayers-owned
generation. If Clayers core does not expose autonomous `sync`, the expected
output is adoption freshness, validation, drift, coverage, connectivity, and a
clear `core.capability.missing` event.

Install: `cargo install clayers`, or use the plugin bootstrap from the parent
repository.

See [clayers documentation](https://github.com/inferaldata/clayers) for
the full layer reference (prose, terminology, organization, relation,
decision, source, plan, artifact, llm, revision).
<!-- /clayers:adopt -->
