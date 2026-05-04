# Local Watcher

The local watcher is implemented by the TypeScript orchestrator CLI:

```bash
clayers-orchestrator watch --path /path/to/repo --mode sync
```

It observes local filesystem changes, debounces them, submits a Clayers job to the local Orchestrator, streams progress, and refreshes its baseline after each run. It does not use WebSockets or a hosted service, and it does not author Clayers XML itself.
