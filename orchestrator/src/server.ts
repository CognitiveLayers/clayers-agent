import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { JobStore, snapshotJob } from "./job-store.js";
import { runLocalQuery } from "./local-query.js";
import { resolveClayersBin, runClayersJob } from "./runner.js";
import type { Job, JobInput, JobMode, JobStatus } from "./types.js";

const store = new JobStore();

/**
 * Creates the HTTP API used by local plugins and Cloudflare Containers.
 *
 * The API is intentionally small: job creation, job lookup, and SSE event
 * streaming. All Clayers execution is delegated to runner.ts.
 */
export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, service: "clayers-orchestrator" });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/jobs") {
        sendJson(res, 200, { jobs: store.list() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/jobs") {
        const input = normalizeJobInput(await readJson(req));
        const job = store.create(input);
        queueMicrotask(() => void runClayersJob(store, job));
        sendJson(res, 202, {
          id: job.id,
          status: job.status,
          eventsUrl: `/v1/jobs/${job.id}/events`
        });
        return;
      }

      const docsMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/docs$/);
      if (req.method === "GET" && docsMatch?.[1]) {
        await sendJobDocs(res, docsMatch[1]);
        return;
      }

      const queryMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/query$/);
      if (req.method === "POST" && queryMatch?.[1]) {
        await runJobQuery(req, res, queryMatch[1]);
        return;
      }

      const reviewMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/review$/);
      if ((req.method === "GET" || req.method === "POST") && reviewMatch?.[1]) {
        sendJobReview(res, reviewMatch[1]);
        return;
      }

      const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
      if (req.method === "GET" && jobMatch?.[1]) {
        const job = store.get(jobMatch[1]);
        if (!job) {
          sendJson(res, 404, { error: "job not found" });
          return;
        }
        sendJson(res, 200, snapshotJob(job));
        return;
      }

      const eventsMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/events$/);
      if (req.method === "GET" && eventsMatch?.[1]) {
        streamEvents(res, eventsMatch[1]);
        return;
      }

      sendJson(res, 404, { error: "not found" });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function sendJobDocs(res: ServerResponse, jobId: string): Promise<void> {
  const job = store.get(jobId);
  if (!job) {
    sendJson(res, 404, { error: "job not found" });
    return;
  }

  const repoPath = repoPathForJob(job);
  const docsPath = docsPathForJob(job);
  if (!repoPath || !docsPath) {
    sendJson(res, 404, { error: "docs not generated for this job" });
    return;
  }

  try {
    const html = await readFile(path.resolve(repoPath, docsPath), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch {
    sendJson(res, 404, { error: "docs file is not available", path: docsPath });
  }
}

async function runJobQuery(req: IncomingMessage, res: ServerResponse, jobId: string): Promise<void> {
  const job = store.get(jobId);
  if (!job) {
    sendJson(res, 404, { error: "job not found" });
    return;
  }

  const body = await readJson(req);
  const query = typeof body.query === "string" ? body.query : body.xpath;
  if (typeof query !== "string" || query.trim().length === 0) {
    sendJson(res, 400, { error: "query requires a non-empty query or xpath string" });
    return;
  }
  if (query.trim().startsWith("-")) {
    sendJson(res, 400, { error: "query must be an XPath expression, not a command option" });
    return;
  }

  const repoPath = repoPathForJob(job);
  const specDir = specDirForJob(job);
  if (!repoPath || !specDir) {
    sendJson(res, 404, { error: "spec not available for this job" });
    return;
  }

  const count = body.count === true;
  const relativeSpecDir = path.relative(repoPath, specDir) || specDir;
  const clayersBin = await resolveClayersBin(store, job);
  const args = ["query", ...(count ? ["--count"] : []), query, relativeSpecDir];
  const result = spawnSync(clayersBin, args, {
    cwd: repoPath,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 5 * 1024 * 1024
  });

  store.addEvent(job.id, "clayers.query.api", {
    query,
    count,
    code: result.status
  });

  if (result.status === 0) {
    sendJson(res, 200, {
      code: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      engine: "clayers-core"
    });
    return;
  }

  try {
    const fallback = await runLocalQuery(specDir, query, { count });
    store.addEvent(job.id, "clayers.query.api.fallback", {
      query,
      count,
      coreCode: result.status,
      fallbackCount: fallback.count
    });
    sendJson(res, 200, {
      code: 0,
      signal: null,
      stdout: fallback.stdout,
      stderr: fallback.stderr,
      engine: "local-fallback",
      core: {
        code: result.status,
        signal: result.signal,
        stderr: result.stderr
      }
    });
    return;
  } catch (error) {
    store.addEvent(job.id, "clayers.query.api.fallback_failed", {
      query,
      count,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  sendJson(res, 422, {
    code: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    engine: "clayers-core"
  });
}

function sendJobReview(res: ServerResponse, jobId: string): void {
  const job = store.get(jobId);
  if (!job) {
    sendJson(res, 404, { error: "job not found" });
    return;
  }

  const reviewSteps = new Set([
    "clayers.fix-node-hash",
    "clayers.fix-artifact-hash",
    "clayers.docs",
    "clayers.query-summary",
    "clayers.validate",
    "clayers.drift",
    "clayers.coverage",
    "clayers.connectivity"
  ]);
  const outputs = new Map<string, string[]>();
  const steps: Array<Record<string, unknown>> = [];

  for (const event of job.events) {
    if (event.type === "step.output" && typeof event.data.name === "string") {
      const name = event.data.name;
      if (!reviewSteps.has(name)) continue;
      const lines = outputs.get(name) ?? [];
      if (typeof event.data.line === "string") lines.push(event.data.line);
      outputs.set(name, lines.slice(-20));
    }

    if (event.type === "step.completed" && typeof event.data.name === "string") {
      const name = event.data.name;
      if (!reviewSteps.has(name)) continue;
      steps.push({
        name,
        code: event.data.code,
        signal: event.data.signal,
        durationMs: event.data.durationMs,
        output: outputs.get(name) ?? []
      });
    }
  }

  sendJson(res, 200, {
    jobId: job.id,
    status: job.status,
    issueCount: job.issueCount,
    specDir: specDirForJob(job),
    docsPath: docsPathForJob(job),
    steps
  });
}

function streamEvents(res: ServerResponse, jobId: string): void {
  const job = store.get(jobId);
  if (!job) {
    sendJson(res, 404, { error: "job not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(": connected\n\n");

  for (const event of job.events) {
    writeSse(res, event);
  }

  if (isTerminal(job.status)) {
    res.end();
    return;
  }

  const unsubscribe = store.subscribe(jobId, (event) => {
    writeSse(res, event);
    const latest = store.get(jobId);
    if (latest && isTerminal(latest.status)) {
      unsubscribe();
      res.end();
    }
  });

  res.on("close", unsubscribe);
}

function writeSse(res: ServerResponse, event: unknown & { id?: number; type?: string }): void {
  const typed = event as { id: number; type: string };
  res.write(`id: ${typed.id}\n`);
  res.write(`event: ${typed.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function isTerminal(status: JobStatus): boolean {
  return ["completed", "completed_with_issues", "failed"].includes(status);
}

function repoPathForJob(job: Job): string | null {
  const event = [...job.events].reverse().find((item) => {
    return (item.type === "repo.local" || item.type === "repo.cloned")
      && typeof item.data.path === "string";
  });
  return typeof event?.data.path === "string" ? event.data.path : null;
}

function specDirForJob(job: Job): string | null {
  const event = [...job.events].reverse().find((item) => {
    return item.type === "spec.detected" && typeof item.data.specDir === "string";
  });
  return typeof event?.data.specDir === "string" ? event.data.specDir : null;
}

function docsPathForJob(job: Job): string | null {
  const event = [...job.events].reverse().find((item) => {
    return item.type === "clayers.docs.generated" && typeof item.data.path === "string";
  });
  return typeof event?.data.path === "string" ? event.data.path : null;
}

function normalizeJobInput(input: Record<string, unknown>): JobInput {
  const mode = (input.mode ?? "sync") as JobMode;
  if (!["sync", "review", "adopt"].includes(mode)) {
    throw new Error("mode must be one of: sync, review, adopt");
  }

  const hasPath = typeof input.path === "string" && input.path.trim();
  const hasRepoUrl = typeof input.repoUrl === "string" && input.repoUrl.trim();
  if (Boolean(hasPath) === Boolean(hasRepoUrl)) {
    throw new Error("provide exactly one of path or repoUrl");
  }

  const normalized: JobInput = { mode };
  if (hasPath) normalized.path = input.path as string;
  if (hasRepoUrl) normalized.repoUrl = input.repoUrl as string;
  return normalized;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > 1024 * 1024) {
      throw new Error("request body too large");
    }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(body) as Record<string, unknown>;
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function parseListenArgs(argv: string[]): { host: string; port: number } {
  let host = process.env.HOST ?? "127.0.0.1";
  let port = Number(process.env.PORT ?? "8787");
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--host") {
      host = requiredArg(argv, ++i, "--host");
    } else if (argv[i] === "--port") {
      port = Number(requiredArg(argv, ++i, "--port"));
    } else if (argv[i] === "-h" || argv[i] === "--help") {
      console.log("Usage: node dist/server.js [--host HOST] [--port PORT]");
      process.exit(0);
    } else {
      throw new Error(`unexpected argument: ${argv[i]}`);
    }
  }
  return { host, port };
}

function requiredArg(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

const { host, port } = parseListenArgs(process.argv);
const server = createServer();
server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`clayers-orchestrator listening http://${host}:${actualPort}`);
});
