# Cloudflare Deployment

This directory contains the Cloudflare-native control plane for Clayers orchestration.

It uses:

- a Worker for public HTTP, auth, CORS, and request routing
- a container-enabled Durable Object for the Clayers runner
- `../Dockerfile` for the Linux runner image that can execute Git and the Clayers CLI

The Worker does not run Clayers. It forwards `/v1/jobs` and `/v1/jobs/{job_id}/events` to the container instance.

## Local Check

```bash
cd orchestrator/cloudflare
npm ci
npm run check
```

## Deploy

```bash
cd orchestrator/cloudflare
npm ci
npm run deploy
```

Set an API token before exposing this publicly:

```bash
wrangler secret put API_TOKEN
```

Clients then call:

```bash
curl -N \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"mode":"sync","repoUrl":"https://github.com/org/repo"}' \
  https://<worker-host>/v1/jobs
```
