# Clayers Orchestrator

TypeScript orchestration service for Clayers jobs with realtime event streams and local background watching.

The orchestrator does not generate or edit the knowledge model itself. It accepts a local path or repo URL, prepares a worktree, invokes Clayers core commands, and streams job events so a UI, plugin, or development console can watch progress in real time. The local watcher observes filesystem changes and submits debounced jobs back to the Orchestrator.

## Run Locally

```bash
cd orchestrator
npm ci
npm start
```

Submit the current repo and stream updates:

```bash
node dist/client.js submit --path .. --mode sync --stream
```

Submit the orchestrator itself to Clayers and watch the realtime event stream:

```bash
npm run clayers:self-sync
```

Watch a local repo continuously:

```bash
node dist/client.js watch --path /path/to/repo --mode sync
```

Useful watcher options:

```bash
node dist/client.js watch --path /path/to/repo --mode review --interval-ms 1000 --debounce-ms 1500 --no-initial
```

Check the orchestrator's own Clayers spec:

```bash
npm run clayers:check
```

For a remote repository:

```bash
node dist/client.js submit --repo-url https://github.com/CognitiveLayers/clayers --mode sync --stream
```

## API

```http
GET  /health
GET  /v1/jobs
POST /v1/jobs
GET  /v1/jobs/{job_id}
GET  /v1/jobs/{job_id}/events
```

Create a job:

```json
{
  "mode": "sync",
  "path": "/absolute/path/to/repo"
}
```

or:

```json
{
  "mode": "sync",
  "repoUrl": "https://github.com/org/repo"
}
```

Modes:

- `adopt` runs `clayers adopt .`
- `review` runs Clayers validation, drift, coverage, and connectivity when a spec exists
- `sync` runs adoption, then `clayers sync .` if the installed core exposes it, then quality checks

Realtime events use Server-Sent Events:

```bash
curl -N http://127.0.0.1:8787/v1/jobs/job_123/events
```

## Runtime Boundary

This service must run where Git and the Clayers CLI can execute. A Cloudflare Worker can be a control-plane/API edge later, but the Clayers runner needs a process or container that can clone repositories and run the core binary.

The Cloudflare deployment lives in `cloudflare/`. It uses a Worker for the public API and a container-enabled Durable Object backed by `Dockerfile` for the runner process.

## Environment

- `CLAYERS_BIN` - explicit Clayers binary
- `CLAYERS_BOOTSTRAP` - bootstrap script used to locate or install Clayers
- `CLAYERS_ORCHESTRATOR_WORKDIR` - workspace for cloned repos
- `CLAYERS_ORCHESTRATOR_ALLOW_LOCAL_PATHS=0` - disable local path jobs
- `HOST` / `PORT` - server bind address

## Checks

```bash
npm run build
npm run check
npm run smoke
```
