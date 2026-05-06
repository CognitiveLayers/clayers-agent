import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_FILE_SIZE_BYTES = Number(process.env.CLAYERS_GENERATOR_MAX_FILE_SIZE ?? 512 * 1024);
const MAX_FILES = Number(process.env.CLAYERS_GENERATOR_MAX_FILES ?? 250);

const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".clayers",
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
  "target",
  "clayers"
]);

const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".md",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);

const IMPORTANT_FILENAMES = new Set([
  "Dockerfile",
  "Makefile",
  "README",
  "LICENSE",
  "AGENTS.md",
  "CLAUDE.md",
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "requirements.txt",
  "go.mod"
]);

export interface GeneratedModel {
  specDir: string;
  projectName: string;
  filesModeled: number;
  filesOmitted: number;
  filesWritten: string[];
}

interface RepoFile {
  path: string;
  absolutePath: string;
  size: number;
  lines: number;
  extension: string;
  language: string;
  category: string;
  nodeId: string;
}

interface GitInfo {
  revision: string;
  branch: string;
  remote: string;
}

/**
 * Creates or refreshes a deterministic Clayers model for a repository.
 *
 * This is intentionally mechanical: it extracts repository structure, file
 * metadata, artifact mappings, and generated LLM descriptions. It does not
 * claim to infer hidden product intent. Future core or hosted semantic sync can
 * replace this implementation behind the same orchestrator contract.
 */
export async function generateRepositoryModel(repoPath: string): Promise<GeneratedModel> {
  const projectName = sanitizeProjectName(path.basename(repoPath));
  const specDir = path.join(repoPath, "clayers", projectName);
  await mkdir(specDir, { recursive: true });

  const allFiles = await discoverFiles(repoPath);
  const files = allFiles.slice(0, MAX_FILES);
  const filesOmitted = Math.max(0, allFiles.length - files.length);
  const now = new Date().toISOString();
  const gitInfo = gitRepositoryInfo(repoPath);
  const artifactPathBase = artifactPathBaseFor(repoPath);

  const indexXml = renderIndex(projectName);
  const revisionXml = renderRevision(projectName, now, hashText(indexXml));
  const overviewXml = renderOverview(projectName, files, filesOmitted, gitInfo);
  const artifactsXml = renderArtifacts(projectName, files, gitInfo.revision, artifactPathBase);

  const writes = new Map<string, string>([
    ["index.xml", indexXml],
    ["revision.xml", revisionXml],
    ["overview.xml", overviewXml],
    ["artifacts.xml", artifactsXml]
  ]);

  const filesWritten: string[] = [];
  for (const [name, contents] of writes) {
    const target = path.join(specDir, name);
    await writeFile(target, contents, "utf8");
    filesWritten.push(target);
  }

  return {
    specDir,
    projectName,
    filesModeled: files.length,
    filesOmitted,
    filesWritten
  };
}

/**
 * Writes a self-contained, dependency-free HTML view of the generated model.
 *
 * Clayers core remains the preferred documentation renderer. This fallback is
 * used when the local machine cannot run the core renderer, for example when
 * Saxon is not installed. It keeps the repo -> model -> docs loop usable for a
 * first local install.
 */
export async function writeFallbackDocs(specDir: string, outputPath: string): Promise<void> {
  const entries = await readdir(specDir, { withFileTypes: true });
  const xmlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".xml"))
    .map((entry) => entry.name)
    .sort((left, right) => {
      const order = ["overview.xml", "artifacts.xml", "revision.xml", "index.xml"];
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex)
        || left.localeCompare(right);
    });

  const files = await Promise.all(xmlFiles.map(async (name) => {
    const contents = await readFile(path.join(specDir, name), "utf8");
    return { name, contents };
  }));

  const title = titleFromXml(files.find((file) => file.name === "overview.xml")?.contents)
    ?? `${path.basename(specDir)} Clayers Model`;
  const generatedAt = new Date().toISOString();
  const sections = files.map((file) => `      <section class="model-file">
        <h2>${html(file.name)}</h2>
        <pre><code>${html(file.contents)}</code></pre>
      </section>`).join("\n");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    body {
      margin: 0;
      color: #172026;
      background: #f7f8fa;
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    header {
      border-bottom: 1px solid #d8dee6;
      margin-bottom: 24px;
      padding-bottom: 18px;
    }
    h1 {
      font-size: 28px;
      margin: 0 0 8px;
      letter-spacing: 0;
    }
    h2 {
      font-size: 18px;
      margin: 0 0 10px;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: #51606d;
    }
    .model-file {
      background: #ffffff;
      border: 1px solid #d8dee6;
      border-radius: 8px;
      margin: 16px 0;
      padding: 16px;
      overflow: hidden;
    }
    pre {
      margin: 0;
      max-height: 620px;
      overflow: auto;
      background: #111827;
      color: #e5e7eb;
      border-radius: 6px;
      padding: 14px;
      font-size: 13px;
    }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }
    @media (prefers-color-scheme: dark) {
      body {
        color: #e8edf2;
        background: #0d1117;
      }
      header {
        border-color: #30363d;
      }
      p {
        color: #a7b2bd;
      }
      .model-file {
        background: #161b22;
        border-color: #30363d;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${html(title)}</h1>
      <p>Fallback Clayers documentation generated at ${html(generatedAt)} because the core documentation renderer was unavailable.</p>
    </header>
${sections || "    <p>No XML model files were found.</p>"}
  </main>
</body>
</html>
`, "utf8");
}

async function discoverFiles(repoPath: string): Promise<RepoFile[]> {
  const candidates: RepoFile[] = [];
  await collectFiles(repoPath, repoPath, candidates);
  return candidates.sort(compareFiles);
}

async function collectFiles(root: string, dir: string, files: RepoFile[]): Promise<void> {
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
    if (info.size > MAX_FILE_SIZE_BYTES) continue;
    if (!(await isReadableTextFile(absolutePath, entry.name))) continue;

    const extension = path.extname(entry.name).toLowerCase();
    const contents = await readFile(absolutePath, "utf8");
    files.push({
      path: relativePath,
      absolutePath,
      size: info.size,
      lines: countLines(contents),
      extension,
      language: languageFor(entry.name),
      category: categoryFor(relativePath),
      nodeId: nodeIdForPath(relativePath)
    });
  }
}

function renderIndex(projectName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by Clayers Agent deterministic sync. -->
<spec:clayers xmlns:spec="urn:clayers:spec"
       xmlns="urn:clayers:index"
       spec:spec="${xml(projectName)}"
       spec:version="0.1.0">

  <file href="overview.xml"/>
  <file href="artifacts.xml"/>
  <file href="revision.xml" layer="urn:clayers:revision"/>
</spec:clayers>
`;
}

function renderRevision(projectName: string, timestamp: string, indexHash: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated revision anchor for the repository model. -->
<spec:clayers xmlns:spec="urn:clayers:spec"
           xmlns="urn:clayers:revision"
           spec:spec="${xml(projectName)}">

  <revision name="draft-1"
            timestamp="${xml(timestamp)}"
            index="index.xml"
            index-hash="${xml(indexHash)}">
    <note>Generated repository model snapshot.</note>
  </revision>
</spec:clayers>
`;
}

function renderOverview(
  projectName: string,
  files: RepoFile[],
  filesOmitted: number,
  gitInfo: GitInfo
): string {
  const inventoryRows = files.length > 0
    ? files.map((file) => `          <pr:tr>
            <pr:td><pr:code>${xml(file.path)}</pr:code></pr:td>
            <pr:td>${xml(file.category)}</pr:td>
            <pr:td>${xml(file.language)}</pr:td>
            <pr:td>${file.lines}</pr:td>
          </pr:tr>`).join("\n")
    : `          <pr:tr>
            <pr:td>No modeled files</pr:td>
            <pr:td>none</pr:td>
            <pr:td>none</pr:td>
            <pr:td>0</pr:td>
          </pr:tr>`;

  const fileSections = files.map(renderFileSection).join("\n\n");
  const orgNodes = [
    `  <org:concept ref="repo-overview">
    <org:purpose>Entry point for understanding the generated repository model.</org:purpose>
  </org:concept>`,
    `  <org:reference ref="repo-file-inventory">
    <org:purpose>Generated file inventory for review, query, and drift checks.</org:purpose>
  </org:reference>`,
    ...files.map((file) => `  <org:reference ref="${xml(file.nodeId)}">
    <org:purpose>Generated reference node for ${xml(file.path)}.</org:purpose>
  </org:reference>`)
  ].join("\n\n");

  const llmNodes = [
    `  <llm:node ref="repo-overview">Generated overview for ${xml(projectName)} at revision ${xml(gitInfo.revision)} on branch ${xml(gitInfo.branch)}.</llm:node>`,
    `  <llm:node ref="repo-file-inventory">Generated inventory of ${files.length} repository files${filesOmitted > 0 ? ` with ${filesOmitted} omitted by size or count limits` : ""}.</llm:node>`,
    ...files.map((file) => `  <llm:node ref="${xml(file.nodeId)}">${xml(file.path)} is a ${xml(file.category)} file using ${xml(file.language)}. It has ${file.lines} line${file.lines === 1 ? "" : "s"} and is tracked by an artifact mapping.</llm:node>`)
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated repository overview. Edit source files, then rerun Clayers sync. -->
<spec:clayers xmlns:spec="urn:clayers:spec"
       xmlns:pr="urn:clayers:prose"
       xmlns:org="urn:clayers:organization"
       xmlns:llm="urn:clayers:llm"
       spec:index="index.xml">

  <pr:section id="repo-${xml(projectName)}">
    <pr:title>${xml(projectName)} Repository</pr:title>
    <pr:shortdesc>Repository identity used by generated artifact mappings.</pr:shortdesc>
    <pr:p>Generated repository identity for artifact mappings. Remote: <pr:code>${xml(gitInfo.remote)}</pr:code>.</pr:p>
  </pr:section>

  <pr:section id="repo-overview">
    <pr:title>${xml(projectName)} Repository Model</pr:title>
    <pr:shortdesc>Generated Clayers model for the local repository.</pr:shortdesc>
    <pr:p>This model was generated from repository files for project <pr:code>${xml(projectName)}</pr:code>.</pr:p>
    <pr:p>Repository revision: <pr:code>${xml(gitInfo.revision)}</pr:code>. Branch: <pr:code>${xml(gitInfo.branch)}</pr:code>.</pr:p>
    <pr:p>The generator modeled ${files.length} file${files.length === 1 ? "" : "s"}${filesOmitted > 0 ? ` and omitted ${filesOmitted} file${filesOmitted === 1 ? "" : "s"} by size or count limits` : ""}.</pr:p>
  </pr:section>

  <pr:section id="repo-file-inventory">
    <pr:title>Repository File Inventory</pr:title>
    <pr:shortdesc>Generated inventory of source, configuration, documentation, and test files.</pr:shortdesc>
    <pr:table>
      <pr:thead>
        <pr:tr>
          <pr:th>Path</pr:th>
          <pr:th>Category</pr:th>
          <pr:th>Language</pr:th>
          <pr:th>Lines</pr:th>
        </pr:tr>
      </pr:thead>
      <pr:tbody>
${inventoryRows}
      </pr:tbody>
    </pr:table>
  </pr:section>

${fileSections}

${orgNodes}

${llmNodes}
</spec:clayers>
`;
}

function renderFileSection(file: RepoFile): string {
  return `  <pr:section id="${xml(file.nodeId)}">
    <pr:title>${xml(file.path)}</pr:title>
    <pr:shortdesc>${xml(file.category)} file using ${xml(file.language)}.</pr:shortdesc>
    <pr:p>Generated from repository artifact <pr:code>${xml(file.path)}</pr:code>.</pr:p>
    <pr:p>Size: ${file.size} bytes. Lines: ${file.lines}.</pr:p>
  </pr:section>`;
}

function renderArtifacts(
  projectName: string,
  files: RepoFile[],
  repoRevision: string,
  artifactPathBase: string
): string {
  const mappings = files.map((file) => `  <art:mapping id="map-${xml(file.nodeId)}">
    <art:spec-ref node="${xml(file.nodeId)}"
              revision="draft-1"
              node-hash="sha256:placeholder"/>
    <art:artifact repo="repo-${xml(projectName)}"
              repo-revision="${xml(repoRevision)}"
              path="${xml(artifactPathFor(file.path, artifactPathBase))}">
      <art:range hash="sha256:placeholder"/>
    </art:artifact>
    <art:coverage>full</art:coverage>
    <art:note>Generated file-level mapping.</art:note>
  </art:mapping>`).join("\n\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated artifact mappings. Hashes are refreshed through Clayers core. -->
<spec:clayers xmlns:spec="urn:clayers:spec"
       xmlns:art="urn:clayers:artifact"
       spec:index="index.xml">

${mappings}
</spec:clayers>
`;
}

function compareFiles(left: RepoFile, right: RepoFile): number {
  return scoreFile(right.path) - scoreFile(left.path) || left.path.localeCompare(right.path);
}

function scoreFile(filePath: string): number {
  const name = path.basename(filePath);
  let score = 0;
  if (IMPORTANT_FILENAMES.has(name)) score += 100;
  if (filePath.startsWith("src/") || filePath.includes("/src/")) score += 40;
  if (filePath.startsWith("lib/") || filePath.includes("/lib/")) score += 35;
  if (filePath.startsWith("test/") || filePath.includes("/test") || filePath.includes("/spec")) score += 20;
  if (filePath.startsWith("docs/") || filePath.endsWith(".md")) score += 15;
  return score;
}

function shouldIgnore(relativePath: string, name: string, isDirectory: boolean): boolean {
  if (IGNORED_DIRS.has(name)) return true;
  if (!isDirectory && (name === ".DS_Store" || name.endsWith(".clayers.html") || name.endsWith("~"))) return true;
  return relativePath.split("/").some((segment) => IGNORED_DIRS.has(segment));
}

async function isReadableTextFile(filePath: string, name: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    return false;
  }

  if (IMPORTANT_FILENAMES.has(name) || TEXT_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    return true;
  }

  const sample = await readFile(filePath);
  return !sample.subarray(0, 1024).includes(0);
}

function countLines(contents: string): number {
  if (contents.length === 0) return 0;
  return contents.split(/\r?\n/).length - (contents.endsWith("\n") ? 1 : 0);
}

function categoryFor(filePath: string): string {
  const name = path.basename(filePath);
  if (name.toLowerCase().includes("readme") || filePath.endsWith(".md")) return "documentation";
  if (filePath.includes("test") || filePath.includes("spec")) return "test";
  if (filePath.includes(".github/") || name.includes("config") || [".json", ".toml", ".yaml", ".yml"].includes(path.extname(name).toLowerCase())) return "configuration";
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".rb", ".swift", ".kt", ".cs", ".c", ".cpp"].includes(path.extname(name).toLowerCase())) return "source";
  return "artifact";
}

function languageFor(name: string): string {
  const extension = path.extname(name).toLowerCase();
  const table: Record<string, string> = {
    ".c": "C",
    ".cc": "C++",
    ".cpp": "C++",
    ".cs": "C#",
    ".css": "CSS",
    ".go": "Go",
    ".h": "C/C++ header",
    ".hpp": "C++ header",
    ".html": "HTML",
    ".java": "Java",
    ".js": "JavaScript",
    ".jsx": "JavaScript JSX",
    ".json": "JSON",
    ".kt": "Kotlin",
    ".md": "Markdown",
    ".mjs": "JavaScript module",
    ".py": "Python",
    ".rb": "Ruby",
    ".rs": "Rust",
    ".sh": "Shell",
    ".sql": "SQL",
    ".swift": "Swift",
    ".toml": "TOML",
    ".ts": "TypeScript",
    ".tsx": "TypeScript JSX",
    ".txt": "Text",
    ".xml": "XML",
    ".yaml": "YAML",
    ".yml": "YAML"
  };
  if (name === "Dockerfile") return "Dockerfile";
  if (name === "Makefile") return "Makefile";
  return table[extension] ?? "text";
}

function nodeIdForPath(filePath: string): string {
  const normalized = filePath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `file-${normalized || "artifact"}-${hashText(filePath).slice("sha256:".length, "sha256:".length + 8)}`;
}

function sanitizeProjectName(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "repository";
}

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function gitOutput(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

function gitRepositoryInfo(repoPath: string): GitInfo {
  const topLevel = gitOutput(repoPath, ["rev-parse", "--show-toplevel"]);
  if (!topLevel || path.resolve(topLevel) !== path.resolve(repoPath)) {
    return {
      revision: "WORKTREE",
      branch: "local",
      remote: localRepositoryUri(repoPath)
    };
  }

  return {
    revision: gitOutput(repoPath, ["rev-parse", "--short", "HEAD"]) ?? "WORKTREE",
    branch: gitOutput(repoPath, ["branch", "--show-current"]) ?? "local",
    remote: gitOutput(repoPath, ["remote", "get-url", "origin"]) ?? localRepositoryUri(repoPath)
  };
}

function localRepositoryUri(repoPath: string): string {
  return `file://local/${sanitizeProjectName(path.basename(repoPath))}`;
}

function artifactPathBaseFor(repoPath: string): string {
  const topLevel = gitOutput(repoPath, ["rev-parse", "--show-toplevel"]);
  if (!topLevel) return "";

  const relative = toPosixPath(path.relative(topLevel, repoPath));
  return relative && !relative.startsWith("..") ? relative : "";
}

function artifactPathFor(filePath: string, base: string): string {
  return base ? `${base}/${filePath}` : filePath;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function html(value: string): string {
  return xml(value);
}

function titleFromXml(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<pr:title>([^<]+)<\/pr:title>/);
  return match?.[1]?.trim() ? unescapeBasicXml(match[1].trim()) : null;
}

function unescapeBasicXml(value: string): string {
  return value
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
