import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".wrangler",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".pytest_cache",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "target"
]);

const IGNORED_FILES = new Set([".DS_Store", ".clayers.db"]);

export type WatchReason = "initial" | "change";

export interface WatchChange {
  total: number;
  paths: string[];
}

export interface WatchRunContext {
  root: string;
  reason: WatchReason;
  change: WatchChange;
}

export interface WatchRepositoryOptions {
  path: string;
  intervalMs: number;
  debounceMs: number;
  runInitial: boolean;
  once: boolean;
  signal?: AbortSignal;
  onRun: (context: WatchRunContext) => Promise<void>;
  log?: (line: string) => void;
}

interface FileSignature {
  size: number;
  mtimeMs: number;
}

interface Snapshot {
  fingerprint: string;
  files: Map<string, FileSignature>;
}

/**
 * Watches a local repository by polling file metadata and running a debounced
 * callback whenever the snapshot changes.
 *
 * The watcher deliberately does not write Clayers files itself. Its only job is
 * to trigger the orchestrator after local changes settle. After each run it
 * refreshes the baseline snapshot, which prevents Clayers-generated outputs
 * from causing a tight self-trigger loop.
 */
export async function watchRepository(options: WatchRepositoryOptions): Promise<void> {
  const root = path.resolve(options.path);
  const info = await stat(root);
  if (!info.isDirectory()) {
    throw new Error(`watch path is not a directory: ${root}`);
  }

  options.log?.(
    `[watch] monitoring ${root} (interval=${options.intervalMs}ms debounce=${options.debounceMs}ms)`
  );

  let baseline = await createSnapshot(root);
  let runs = 0;

  const run = async (reason: WatchReason, change: WatchChange): Promise<boolean> => {
    await options.onRun({ root, reason, change });
    baseline = await createSnapshot(root);
    runs += 1;
    return !(options.once && runs >= 1);
  };

  if (options.runInitial) {
    const shouldContinue = await run("initial", { total: 0, paths: [] });
    if (!shouldContinue) return;
  }

  while (!options.signal?.aborted) {
    const result = await waitForStableChange(root, baseline, options);
    if (!result) return;
    const shouldContinue = await run("change", result.change);
    if (!shouldContinue) return;
  }
}

async function waitForStableChange(
  root: string,
  baseline: Snapshot,
  options: WatchRepositoryOptions
): Promise<{ snapshot: Snapshot; change: WatchChange } | null> {
  let candidate: Snapshot | null = null;
  let candidateChange: WatchChange = { total: 0, paths: [] };
  let lastChangedAt = 0;

  while (!options.signal?.aborted) {
    try {
      await delay(options.intervalMs, undefined, { signal: options.signal });
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    }

    const next = await createSnapshot(root);
    if (next.fingerprint === baseline.fingerprint) {
      candidate = null;
      candidateChange = { total: 0, paths: [] };
      lastChangedAt = 0;
      continue;
    }

    if (!candidate || next.fingerprint !== candidate.fingerprint) {
      candidate = next;
      candidateChange = diffSnapshots(baseline, next);
      lastChangedAt = Date.now();
      options.log?.(formatChange(candidateChange));
      continue;
    }

    if (Date.now() - lastChangedAt >= options.debounceMs) {
      return { snapshot: candidate, change: candidateChange };
    }
  }

  return null;
}

async function createSnapshot(root: string): Promise<Snapshot> {
  const files = new Map<string, FileSignature>();
  await collectFiles(root, root, files);

  const lines = [...files.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, signature]) => `${file}\0${signature.size}\0${Math.trunc(signature.mtimeMs)}`);

  return {
    fingerprint: lines.join("\n"),
    files
  };
}

async function collectFiles(
  root: string,
  dir: string,
  files: Map<string, FileSignature>
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    const absolutePath = path.join(dir, entry.name);
    const relativePath = toPosixPath(path.relative(root, absolutePath));
    if (shouldIgnore(relativePath, entry.name, entry.isDirectory())) continue;

    if (entry.isDirectory()) {
      await collectFiles(root, absolutePath, files);
      continue;
    }

    if (!entry.isFile()) continue;
    const info = await stat(absolutePath);
    files.set(relativePath, {
      size: info.size,
      mtimeMs: info.mtimeMs
    });
  }
}

function shouldIgnore(relativePath: string, name: string, isDirectory: boolean): boolean {
  if (IGNORED_DIRS.has(name)) return true;
  if (!isDirectory && IGNORED_FILES.has(name)) return true;
  if (!isDirectory && name.endsWith(".clayers.html")) return true;
  if (!isDirectory && name.endsWith("~")) return true;

  const segments = relativePath.split("/");
  return segments.some((segment) => IGNORED_DIRS.has(segment));
}

function diffSnapshots(before: Snapshot, after: Snapshot): WatchChange {
  const paths = new Set<string>();

  for (const [file, signature] of after.files) {
    const previous = before.files.get(file);
    if (!previous || previous.size !== signature.size || previous.mtimeMs !== signature.mtimeMs) {
      paths.add(file);
    }
  }

  for (const file of before.files.keys()) {
    if (!after.files.has(file)) paths.add(file);
  }

  const sorted = [...paths].sort();
  return {
    total: sorted.length,
    paths: sorted.slice(0, 12)
  };
}

function formatChange(change: WatchChange): string {
  const suffix = change.total > change.paths.length ? `, +${change.total - change.paths.length} more` : "";
  const files = change.paths.length > 0 ? `: ${change.paths.join(", ")}${suffix}` : "";
  return `[watch] change detected (${change.total} file${change.total === 1 ? "" : "s"})${files}`;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
