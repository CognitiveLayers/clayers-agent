import { spawn, spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";
import type { JobStore } from "./job-store.js";
import type { Job, StepOptions, StepResult } from "./types.js";
import { generateRepositoryModel, writeFallbackDocs } from "./model-generator.js";
import { runLocalQuery } from "./local-query.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../..");

/**
 * Runs a Clayers job by preparing a repository and invoking Clayers core.
 *
 * The orchestration layer never authors Clayers XML. It only runs commands
 * exposed by the installed core and streams each step back to the job store.
 */
export async function runClayersJob(store: JobStore, job: Job): Promise<void> {
  store.setStatus(job.id, "running");

  try {
    const repoPath = await prepareRepository(store, job);
    const clayersBin = await resolveClayersBin(store, job);
    const capabilities = detectCapabilities(clayersBin);

    store.addEvent(job.id, "core.capabilities", {
      clayersBin,
      commands: capabilities.commands
    });

    const existingSpecDir = await findSpecDir(repoPath);
    if ((job.input.mode === "adopt" || job.input.mode === "sync") && !existingSpecDir) {
      await runStep(store, job, {
        name: "clayers.adopt",
        command: clayersBin,
        args: ["adopt", "."],
        cwd: repoPath
      });
    } else if (job.input.mode === "adopt" || job.input.mode === "sync") {
      store.addEvent(job.id, "clayers.adopt.skipped", {
        reason: "Existing Clayers spec detected.",
        specDir: existingSpecDir
      });
    }

    if (job.input.mode === "sync") {
      if (capabilities.commands.includes("sync")) {
        await runStep(store, job, {
          name: "clayers.sync",
          command: clayersBin,
          args: ["sync", "."],
          cwd: repoPath
        });
      } else {
        store.addEvent(job.id, "core.capability.missing", {
          command: "sync",
          message: "Installed Clayers core does not expose autonomous sync yet; using deterministic Clayers Agent generator."
        });
        const generated = await generateRepositoryModel(repoPath);
        store.addEvent(job.id, "clayers.generate.local", {
          specDir: generated.specDir,
          projectName: generated.projectName,
          filesModeled: generated.filesModeled,
          filesOmitted: generated.filesOmitted,
          filesWritten: generated.filesWritten.map((file) => path.relative(repoPath, file))
        });
      }
    }

    const specDir = await findSpecDir(repoPath);
    if (!specDir) {
      store.addEvent(job.id, "spec.missing", {
        message: "No clayers/<project>/index.xml spec directory found after core commands."
      });
    } else {
      store.addEvent(job.id, "spec.detected", { specDir });
      if (job.input.mode === "sync") {
        await refreshGeneratedArtifacts(store, job, clayersBin, repoPath, specDir);
      }
      await runQualitySuite(store, job, clayersBin, repoPath, specDir);
    }

    const finalStatus = job.issueCount > 0 ? "completed_with_issues" : "completed";
    store.setStatus(job.id, finalStatus, { issueCount: job.issueCount });
  } catch (error) {
    store.addEvent(job.id, "job.error", {
      message: error instanceof Error ? error.message : String(error)
    });
    store.setStatus(job.id, "failed");
  }
}

async function refreshGeneratedArtifacts(
  store: JobStore,
  job: Job,
  clayersBin: string,
  repoPath: string,
  specDir: string
): Promise<void> {
  const relativeSpecDir = path.relative(repoPath, specDir) || specDir;
  await runStep(store, job, {
    name: "clayers.fix-node-hash",
    command: clayersBin,
    args: ["artifact", "--fix-node-hash", relativeSpecDir],
    cwd: repoPath
  });
  await runStep(store, job, {
    name: "clayers.fix-artifact-hash",
    command: clayersBin,
    args: ["artifact", "--fix-artifact-hash", relativeSpecDir],
    cwd: repoPath
  });

  const projectName = path.basename(specDir);
  const docsPath = path.join(relativeSpecDir, `${projectName}.clayers.html`);
  const docsResult = await runStep(store, job, {
    name: "clayers.docs",
    command: clayersBin,
    args: ["doc", "--self-contained", "-o", docsPath, relativeSpecDir],
    cwd: repoPath,
    allowNonZero: true,
    markIssueOnNonZero: false
  });
  const docsAbsolutePath = path.join(repoPath, docsPath);

  if (docsResult.code !== 0 || !(await pathExists(docsAbsolutePath))) {
    await writeFallbackDocs(specDir, docsAbsolutePath);
    store.addEvent(job.id, "clayers.docs.fallback", {
      path: docsPath,
      reason: docsResult.code !== 0 ? "core doc renderer failed" : "core doc renderer did not write output"
    });
  }

  store.addEvent(job.id, "clayers.docs.generated", {
    path: docsPath
  });

  const queryResult = await runStep(store, job, {
    name: "clayers.query-summary",
    command: clayersBin,
    args: ["query", "--count", "//*[@id]", relativeSpecDir],
    cwd: repoPath,
    allowNonZero: true,
    markIssueOnNonZero: false
  });

  if (queryResult.code !== 0) {
    try {
      const fallback = await runLocalQuery(specDir, "//*[@id]", { count: true });
      store.addEvent(job.id, "clayers.query-summary.fallback", {
        query: "//*[@id]",
        count: fallback.count
      });
    } catch (error) {
      store.addEvent(job.id, "clayers.query-summary.fallback_failed", {
        message: error instanceof Error ? error.message : String(error)
      });
      store.markIssue(job.id);
    }
  }

}

async function prepareRepository(store: JobStore, job: Job): Promise<string> {
  if (job.input.path) {
    if (process.env.CLAYERS_ORCHESTRATOR_ALLOW_LOCAL_PATHS === "0") {
      throw new Error("Local path jobs are disabled by CLAYERS_ORCHESTRATOR_ALLOW_LOCAL_PATHS=0.");
    }
    const repoPath = path.resolve(job.input.path);
    const info = await stat(repoPath);
    if (!info.isDirectory()) {
      throw new Error(`Path is not a directory: ${repoPath}`);
    }
    store.addEvent(job.id, "repo.local", { path: repoPath });
    return repoPath;
  }

  if (!job.input.repoUrl) {
    throw new Error("Job requires either path or repoUrl.");
  }

  const workspaceRoot = process.env.CLAYERS_ORCHESTRATOR_WORKDIR
    ? path.resolve(process.env.CLAYERS_ORCHESTRATOR_WORKDIR)
    : path.join(os.tmpdir(), "clayers-orchestrator");
  const jobRoot = path.join(workspaceRoot, job.id);
  const repoPath = path.join(jobRoot, "repo");

  await mkdir(jobRoot, { recursive: true });
  await runStep(store, job, {
    name: "git.clone",
    command: "git",
    args: ["clone", "--depth", "1", job.input.repoUrl, repoPath],
    cwd: jobRoot
  });
  store.addEvent(job.id, "repo.cloned", { path: repoPath });
  return repoPath;
}

export async function resolveClayersBin(store: JobStore, job: Job): Promise<string> {
  if (process.env.CLAYERS_BIN) {
    return process.env.CLAYERS_BIN;
  }

  const bootstrap = process.env.CLAYERS_BOOTSTRAP ?? path.join(repoRoot, "claude-plugin/bin/clayers-bootstrap");
  if (await fileIsExecutable(bootstrap)) {
    store.addEvent(job.id, "core.bootstrap", { bootstrap });
    const result = spawnSync(bootstrap, ["--install", "--print-bin"], {
      encoding: "utf8",
      cwd: repoRoot,
      env: process.env
    });
    if (result.status === 0 && result.stdout.trim()) {
      const lines = result.stdout.trim().split(/\r?\n/);
      const last = lines.at(-1);
      if (last) return last;
    }
    throw new Error(`Unable to resolve Clayers through bootstrap: ${result.stderr || result.stdout}`);
  }

  return "clayers";
}

function detectCapabilities(clayersBin: string): { commands: string[] } {
  const result = spawnSync(clayersBin, ["--help"], {
    encoding: "utf8",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`Unable to run ${clayersBin} --help: ${result.stderr || result.stdout}`);
  }

  const commands: string[] = [];
  let inCommands = false;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.trim() === "Commands:") {
      inCommands = true;
      continue;
    }
    if (inCommands && line.trim() === "") break;
    if (inCommands) {
      const match = line.match(/^\s{2}([a-z][a-z0-9-]*)\s/);
      if (match?.[1]) commands.push(match[1]);
    }
  }
  return { commands };
}

async function runQualitySuite(
  store: JobStore,
  job: Job,
  clayersBin: string,
  repoPath: string,
  specDir: string
): Promise<void> {
  const relativeSpecDir = path.relative(repoPath, specDir) || specDir;
  const checks: Array<[string, string[]]> = [
    ["clayers.validate", ["validate", relativeSpecDir]],
    ["clayers.drift", ["artifact", "--drift", relativeSpecDir]],
    ["clayers.coverage", ["artifact", "--coverage", relativeSpecDir]],
    ["clayers.connectivity", ["connectivity", relativeSpecDir]]
  ];

  for (const [name, args] of checks) {
    await runStep(store, job, {
      name,
      command: clayersBin,
      args,
      cwd: repoPath,
      allowNonZero: true
    });
  }
}

async function findSpecDir(repoPath: string): Promise<string | null> {
  const clayersRoot = path.join(repoPath, "clayers");
  try {
    const entries = await readdir(clayersRoot, { withFileTypes: true });
    const candidates: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(clayersRoot, entry.name);
      try {
        await access(path.join(candidate, "index.xml"), fsConstants.R_OK);
        candidates.push(candidate);
      } catch {
        // Not a spec directory.
      }
    }

    if (candidates.length === 0) return null;
    const expected = path.join(clayersRoot, path.basename(repoPath));
    return candidates.includes(expected) ? expected : candidates[0] ?? null;
  } catch {
    return null;
  }
}

async function fileIsExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function runStep(store: JobStore, job: Job, options: StepOptions): Promise<StepResult> {
  const { name, command, args, cwd, allowNonZero = false, markIssueOnNonZero = true } = options;
  const startedAt = Date.now();

  store.addEvent(job.id, "step.started", {
    name,
    command,
    args,
    cwd
  });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.on("error", (error) => {
      store.addEvent(job.id, "step.error", {
        name,
        message: error.message
      });
      reject(error);
    });

    pipeLines(child.stdout, (line) => {
      store.addEvent(job.id, "step.output", { name, stream: "stdout", line });
    });
    pipeLines(child.stderr, (line) => {
      store.addEvent(job.id, "step.output", { name, stream: "stderr", line });
    });

    child.on("close", (code, signal) => {
      const durationMs = Date.now() - startedAt;
      store.addEvent(job.id, "step.completed", {
        name,
        code,
        signal,
        durationMs
      });

      if (code === 0 || allowNonZero) {
        if (code !== 0 && markIssueOnNonZero) store.markIssue(job.id);
        resolve({ code, signal });
      } else {
        reject(new Error(`${name} failed with exit code ${code}`));
      }
    });
  });
}

function pipeLines(stream: Readable, onLine: (line: string) => void): void {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      if (line) onLine(line);
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
  });
  stream.on("end", () => {
    const line = buffer.replace(/\r$/, "");
    if (line) onLine(line);
  });
}
