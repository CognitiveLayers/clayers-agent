import path from "node:path";
import { watchRepository, type WatchChange, type WatchReason } from "./watcher.js";

const DEFAULT_HOST = "http://127.0.0.1:8787";

interface CommonOptions {
  host: string;
  rest: string[];
}

interface SubmitOptions {
  host: string;
  mode: "sync" | "review" | "adopt";
  stream: boolean;
  path?: string;
  repoUrl?: string;
}

interface WatchOptions {
  host: string;
  mode: "sync" | "review" | "adopt";
  path: string;
  stream: boolean;
  intervalMs: number;
  debounceMs: number;
  runInitial: boolean;
  once: boolean;
}

interface SubmittedJob {
  id: string;
  status: string;
  eventsUrl: string;
}

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv.slice(2);
  if (!command || command === "-h" || command === "--help") {
    usage();
    return;
  }

  if (command === "submit") {
    await submit(args);
    return;
  }

  if (command === "watch") {
    await watch(args);
    return;
  }

  if (command === "status") {
    await status(args);
    return;
  }

  if (command === "health") {
    const { host } = parseCommon(args);
    await printJson(`${host}/health`);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

async function submit(args: string[]): Promise<void> {
  const options = parseSubmit(args);
  const job = await createJob(options);

  console.log(JSON.stringify(job, null, 2));
  if (options.stream) {
    const status = await streamJob(options.host, job.id);
    if (status === "failed") process.exitCode = 1;
  }
}

async function watch(args: string[]): Promise<void> {
  const options = parseWatch(args);
  const controller = new AbortController();

  process.once("SIGINT", () => {
    console.log("[watch] stopping");
    controller.abort();
  });
  process.once("SIGTERM", () => {
    console.log("[watch] stopping");
    controller.abort();
  });

  await watchRepository({
    path: options.path,
    intervalMs: options.intervalMs,
    debounceMs: options.debounceMs,
    runInitial: options.runInitial,
    once: options.once,
    signal: controller.signal,
    log: (line) => console.log(line),
    onRun: async (context) => {
      await runWatchedJob(options, context.reason, context.change);
    }
  });
}

async function runWatchedJob(
  options: WatchOptions,
  reason: WatchReason,
  change: WatchChange
): Promise<void> {
  const changed = change.total > 0 ? ` after ${change.total} changed file${change.total === 1 ? "" : "s"}` : "";
  console.log(`[watch] submitting ${options.mode} job (${reason}${changed})`);
  const job = await createJob({
    host: options.host,
    mode: options.mode,
    stream: options.stream,
    path: options.path
  });
  console.log(`[watch] job ${job.id} accepted (${job.status}); events: ${job.eventsUrl}`);
  if (options.stream) {
    const status = await streamJob(options.host, job.id);
    if (status === "failed") process.exitCode = 1;
    console.log(`[watch] job ${job.id} finished: ${status}`);
  } else {
    console.log(JSON.stringify(job, null, 2));
  }
}

async function status(args: string[]): Promise<void> {
  const { host, rest } = parseCommon(args);
  const id = rest[0];
  if (!id) throw new Error("status requires JOB_ID");
  await printJson(`${host}/v1/jobs/${id}`);
}

async function createJob(options: SubmitOptions): Promise<SubmittedJob> {
  const response = await fetch(`${options.host}/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: options.mode,
      path: options.path,
      repoUrl: options.repoUrl
    })
  });

  const job = await response.json() as SubmittedJob & { error?: string };
  if (!response.ok) {
    throw new Error(job.error ?? `request failed with ${response.status}`);
  }
  return job;
}

async function printJson(url: string): Promise<void> {
  const response = await fetch(url);
  const body = await response.text();
  process.stdout.write(body);
  if (!response.ok) process.exitCode = 1;
}

async function streamJob(host: string, id: string): Promise<string> {
  const response = await fetch(`${host}/v1/jobs/${id}/events`);
  if (!response.ok || !response.body) {
    throw new Error(`event stream failed with ${response.status}`);
  }

  let status = "running";
  let buffer = "";
  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseFrame(frame);
      if (event) {
        status = printEvent(event, status);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  return status;
}

function parseSseFrame(frame: string): Record<string, unknown> | null {
  if (!frame || frame.startsWith(":")) return null;
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("data: ")) {
      data.push(line.slice(6));
    }
  }
  if (data.length === 0) return null;
  return JSON.parse(data.join("\n")) as Record<string, unknown>;
}

function printEvent(event: Record<string, unknown>, currentStatus: string): string {
  const type = String(event.type ?? "");
  const time = String(event.time ?? "");
  const data = event.data as Record<string, unknown> | undefined;

  if (type === "step.output" && data) {
    console.log(`[${time}] ${String(data.name)} ${String(data.stream)}: ${String(data.line)}`);
  } else {
    console.log(`[${time}] ${type} ${JSON.stringify(data ?? {})}`);
  }

  if (type.startsWith("job.")) {
    return type.slice("job.".length);
  }
  return currentStatus;
}

function parseSubmit(args: string[]): SubmitOptions {
  const common = parseCommon(args);
  const options: SubmitOptions = {
    host: common.host,
    mode: "sync",
    stream: false
  };

  for (let i = 0; i < common.rest.length; i += 1) {
    const arg = common.rest[i];
    if (arg === "--path") {
      options.path = requiredArg(common.rest, ++i, "--path");
      delete options.repoUrl;
    } else if (arg === "--repo-url") {
      options.repoUrl = requiredArg(common.rest, ++i, "--repo-url");
      delete options.path;
    } else if (arg === "--mode") {
      options.mode = parseMode(requiredArg(common.rest, ++i, "--mode"));
    } else if (arg === "--stream") {
      options.stream = true;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }

  if (!options.path && !options.repoUrl) {
    options.path = process.cwd();
  }
  return options;
}

function parseWatch(args: string[]): WatchOptions {
  const common = parseCommon(args);
  const options: WatchOptions = {
    host: common.host,
    mode: "sync",
    path: process.cwd(),
    stream: true,
    intervalMs: 1000,
    debounceMs: 1500,
    runInitial: true,
    once: false
  };

  for (let i = 0; i < common.rest.length; i += 1) {
    const arg = common.rest[i];
    if (arg === "--path") {
      options.path = path.resolve(requiredArg(common.rest, ++i, "--path"));
    } else if (arg === "--mode") {
      options.mode = parseMode(requiredArg(common.rest, ++i, "--mode"));
    } else if (arg === "--interval-ms") {
      options.intervalMs = parsePositiveInt(requiredArg(common.rest, ++i, "--interval-ms"), "--interval-ms");
    } else if (arg === "--debounce-ms") {
      options.debounceMs = parsePositiveInt(requiredArg(common.rest, ++i, "--debounce-ms"), "--debounce-ms");
    } else if (arg === "--no-initial") {
      options.runInitial = false;
    } else if (arg === "--stream") {
      options.stream = true;
    } else if (arg === "--no-stream") {
      options.stream = false;
    } else if (arg === "--once") {
      options.once = true;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }

  return options;
}

function parseMode(value: string): SubmitOptions["mode"] {
  if (value === "sync" || value === "review" || value === "adopt") return value;
  throw new Error("mode must be one of: sync, review, adopt");
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseCommon(args: string[]): CommonOptions {
  const rest: string[] = [];
  let host = process.env.CLAYERS_ORCHESTRATOR_URL ?? process.env.CLAYERS_API_URL ?? DEFAULT_HOST;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--host") {
      host = requiredArg(args, ++i, "--host");
    } else {
      const value = args[i];
      if (value) rest.push(value);
    }
  }
  return { host: host.replace(/\/$/, ""), rest };
}

function requiredArg(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function usage(): void {
  console.log(`Usage:
  clayers-orchestrator health [--host URL]
  clayers-orchestrator submit [--host URL] [--path PATH | --repo-url URL] [--mode sync|review|adopt] [--stream]
  clayers-orchestrator watch [--host URL] [--path PATH] [--mode sync|review|adopt] [--interval-ms N] [--debounce-ms N] [--no-initial] [--no-stream]
  clayers-orchestrator status [--host URL] JOB_ID

Environment:
  CLAYERS_ORCHESTRATOR_URL  Base URL for the orchestration service
  CLAYERS_API_URL           Fallback base URL
`);
}

main(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
