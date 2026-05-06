import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Document as XmlDocument, Node as XmlNode } from "@xmldom/xmldom";
import * as xpath from "xpath";

const NAMESPACE_MAP: Record<string, string> = {
  spec: "urn:clayers:spec",
  idx: "urn:clayers:index",
  rev: "urn:clayers:revision",
  pr: "urn:clayers:prose",
  trm: "urn:clayers:terminology",
  org: "urn:clayers:organization",
  rel: "urn:clayers:relation",
  dec: "urn:clayers:decision",
  src: "urn:clayers:source",
  pln: "urn:clayers:plan",
  art: "urn:clayers:artifact",
  llm: "urn:clayers:llm",
  py: "urn:clayers:python",
  vcs: "urn:clayers:vcs",
  cnt: "urn:clayers:content",
  tst: "urn:clayers:testing",
  lyr: "urn:clayers:layer",
  cmb: "urn:clayers:combined",
  xmi: "http://www.omg.org/spec/XMI/20131001",
  uml: "http://www.omg.org/spec/UML/20131001",
  xml: "http://www.w3.org/XML/1998/namespace",
  xsi: "http://www.w3.org/2001/XMLSchema-instance"
};

export interface LocalQueryOptions {
  count?: boolean;
  text?: boolean;
}

export interface LocalQueryResult {
  stdout: string;
  stderr: string;
  count?: number;
}

/**
 * Executes the API query fallback against an assembled Clayers XML document.
 *
 * Clayers core remains the preferred query engine. This fallback keeps the
 * local API usable when a specific installed core build cannot parse its own
 * assembled output. It intentionally supports the XPath 1.0 subset covered by
 * the `xpath` package, which is enough for discovery queries such as
 * `//*[@id]`, `//pr:section`, and `//art:mapping/@id`.
 */
export async function runLocalQuery(
  specDir: string,
  expression: string,
  options: LocalQueryOptions = {}
): Promise<LocalQueryResult> {
  const document = await assembleSpecDocument(specDir);
  const select = xpath.useNamespaces(NAMESPACE_MAP);
  const raw = select(expression, document as unknown as Node);
  const values = Array.isArray(raw) ? raw : raw === null ? [] : [raw];

  if (options.count) {
    const count = Array.isArray(raw) ? raw.length : raw === null ? 0 : Number(raw);
    const safeCount = Number.isFinite(count) ? count : values.length;
    return {
      stdout: `${safeCount}\n`,
      stderr: "",
      count: safeCount
    };
  }

  const stdout = values
    .map((value) => options.text ? textValue(value) : xmlValue(value))
    .filter((value) => value.length > 0)
    .join("\n");

  return {
    stdout: stdout.length > 0 ? `${stdout}\n` : "",
    stderr: ""
  };
}

async function assembleSpecDocument(specDir: string): Promise<XmlDocument> {
  const indexPath = path.join(specDir, "index.xml");
  const filePaths = await discoverIndexedFiles(indexPath);
  const namespaceAttributes = Object.entries(NAMESPACE_MAP)
    .map(([prefix, uri]) => `xmlns:${prefix}="${escapeAttribute(uri)}"`)
    .join(" ");
  const combined = parseXml(
    `<cmb:spec ${namespaceAttributes}></cmb:spec>`,
    "combined Clayers query document"
  );
  const root = combined.documentElement;
  if (!root) throw new Error("Unable to create combined Clayers query document.");

  for (const filePath of filePaths) {
    const source = parseXml(await readFile(filePath, "utf8"), filePath);
    const sourceRoot = source.documentElement;
    if (!sourceRoot) throw new Error(`Invalid XML in ${filePath}: missing document element`);
    for (let child = sourceRoot.firstChild; child; child = child.nextSibling) {
      root.appendChild(combined.importNode(child, true));
    }
  }

  return combined;
}

async function discoverIndexedFiles(indexPath: string): Promise<string[]> {
  const specDir = path.dirname(indexPath);
  const indexDocument = parseXml(await readFile(indexPath, "utf8"), indexPath);
  const select = xpath.useNamespaces(NAMESPACE_MAP);
  const refs = select("//idx:file/@href", indexDocument as unknown as Node);
  const indexed = Array.isArray(refs)
    ? refs
        .map((node) => textValue(node))
        .filter((href) => href.length > 0)
        .map((href) => path.resolve(specDir, href))
    : [];

  return [...new Set([...indexed, indexPath])];
}

function parseXml(contents: string, label: string): XmlDocument {
  const errors: string[] = [];
  const parser = new DOMParser({
    onError(level, message) {
      if (level !== "warning") errors.push(`${level}: ${message}`);
    }
  });
  const document = parser.parseFromString(contents, "application/xml");
  if (errors.length > 0) {
    throw new Error(`Invalid XML in ${label}: ${errors.join("; ")}`);
  }
  return document;
}

function textValue(value: xpath.SelectedValue): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (!value) return "";
  return value.textContent ?? "";
}

function xmlValue(value: xpath.SelectedValue): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (!value) return "";
  if (value.nodeType === 2) return textValue(value);
  return new XMLSerializer().serializeToString(value as unknown as XmlNode);
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
