import { lstat, open, stat, readdir, realpath } from "node:fs/promises";
import * as nodePath from "node:path";
import { basename, extname, isAbsolute, resolve } from "node:path";
import { isLexicallyInside, relativePathInside } from "@actspace/shared";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { canonicalizeFileResource, TOOL_OUTPUT_LINE_CHARS, TOOL_OUTPUT_TEXT_CHARS, type ToolBodyResult, type ToolExecutionContext, type SessionArtifactResolver } from "@actspace/tool-runtime";
import type { ToolPorts } from "./plugin.js";
import { PRESENT_MAX_FILES } from "./manifest.js";
import { readNumberedRange, type NumberedLines } from "./line-range.js";
const READ_FILE_DEFAULT_LIMIT = 200;
/** 图片整个进内存再存成 artifact；和其它图片工具用同一个上限。 */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const TEXT_LIMIT_LABEL = `${TOOL_OUTPUT_TEXT_CHARS.toLocaleString("en-US")}-character output limit`;
const IMAGE_MIME_BY_EXT: Readonly<Record<string, string>> = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
});
export type NodeToolPortsOptions = { readonly workspaceRoot: string; readonly resolveArtifact?: SessionArtifactResolver };
export function createNodeToolPorts(options: NodeToolPortsOptions): ToolPorts {
  const cache = new Map<string, { readonly size: number; readonly mtimeMs: number }>();
  return Object.freeze({ read_file: (args, context) => readFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot), cache, options.resolveArtifact), list_directory: (args, context) => listDirectoryTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)), present: (args, context) => presentTool(args, contextWorkspaceRoot(context, options.workspaceRoot)) });
}
function contextWorkspaceRoot(context: ToolExecutionContext, fallback: string): string {
  return resolve(context.workspaceRoot || fallback);
}

async function readFileTool(
  args: Readonly<Record<string, RuntimeJsonValue>>,
  context: ToolExecutionContext,
  workspaceRoot: string,
  cache: Map<string, { readonly size: number; readonly mtimeMs: number }>,
  resolveArtifact?: SessionArtifactResolver,
): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  if (!pathArg) return failure("INVALID_ARGUMENTS", "path is required");
  try {
    const filePath = await resolveReadablePath(pathArg, workspaceRoot, context.sessionId, resolveArtifact, context);
    // 先 open 再用同一句柄 stat 和读：stat 与读取之间文件不会被换掉。
    const handle = await open(filePath, "r");
    try {
      const fileStat = await handle.stat();
      if (!fileStat.isFile()) return failure("NOT_A_FILE", `Path is not a regular file: ${pathArg}`);
      const mimeType = IMAGE_MIME_BY_EXT[extname(filePath).toLowerCase()];
      if (mimeType !== undefined) {
        if (fileStat.size > MAX_IMAGE_BYTES) return failure("IMAGE_TOO_LARGE", `Image exceeds ${MAX_IMAGE_BYTES} bytes: ${pathArg} is ${fileStat.size} bytes.`);
        const bytes = await handle.readFile();
        const artifact = await context.createArtifact({ bytes, mediaType: mimeType });
        const summary = `Read image ${displayPath(filePath, workspaceRoot)} (${fileStat.size} bytes).`;
        return { status: "completed", summary, modelOutput: [{ type: "text", text: summary }, { type: "artifact", artifact, label: "Image" }], artifacts: [artifact], detail: [{ label: "actspace.context.file", value: { path: filePath, kind: "file", operation: "read" } }] };
      }
      const offset = integerArg(args, "offset", 1);
      const limit = integerArg(args, "limit", READ_FILE_DEFAULT_LIMIT);
      const cacheKey = `${context.sessionId}\0${context.contextGeneration ?? 0}\0${filePath}\0${offset}\0${limit}`;
      const cached = cache.get(cacheKey);
      if (args.force !== true && cached?.size === fileStat.size && cached.mtimeMs === fileStat.mtimeMs) {
        const text = "File unchanged since the previous read of this exact path and range. Reuse the earlier numbered lines, or pass force=true.";
        return completed(text, undefined, { path: filePath, kind: "file", operation: "read" });
      }
      const range = await readNumberedRange(handle, fileStat.size, offset, limit, context.signal);
      if (range.kind === "binary") return failure("BINARY_FILE", `Cannot read ${pathArg} as text: it looks like a binary file (${fileStat.size} bytes). If its contents matter, inspect it with a shell command.`);
      cache.set(cacheKey, { size: fileStat.size, mtimeMs: fileStat.mtimeMs });
      return completed(range.kind === "empty" ? "(empty file)" : numberedText(range, offset, fileStat.size), `Read ${displayPath(filePath, workspaceRoot)}`, { path: filePath, kind: "file", operation: "read" });
    } finally {
      await handle.close();
    }
  } catch (error) {
    // 中止不是读取失败：抛出去，由 tool-runtime 记成 TOOL_ABORTED。
    if (context.signal.aborted) throw error;
    return ioFailure("read file", pathArg, error);
  }
}

/** 行号文本加尾注；尾注告诉模型下一次从哪一行接着读。 */
function numberedText(range: NumberedLines, offset: number, size: number): string {
  if (range.lastLine === 0) return `[No lines at offset ${offset}: the file has ${range.totalLines ?? 0} line${range.totalLines === 1 ? "" : "s"}.]`;
  const notes: string[] = [];
  if (range.more) {
    const scope = range.totalLines === null ? `; the file is ${size} bytes, so its lines were not counted` : ` of ${range.totalLines}`;
    notes.push(`[Showing lines ${offset}-${range.lastLine}${scope}${range.budgetExhausted ? ` (stopped at the ${TEXT_LIMIT_LABEL})` : ""}. Use offset=${range.lastLine + 1} to continue.]`);
  }
  if (range.cutLines > 0) notes.push(`[${range.cutLines} line${range.cutLines === 1 ? " was" : "s were"} cut at ${TOOL_OUTPUT_LINE_CHARS.toLocaleString("en-US")} characters. To read more of a long line, search it with grep or slice it with a shell command.]`);
  return notes.length === 0 ? range.text : `${range.text}\n\n${notes.join("\n")}`;
}

async function listDirectoryTool(args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext, workspaceRoot: string): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  if (!pathArg) return failure("INVALID_ARGUMENTS", "path is required");
  try {
    const directory = await resolveExistingPath(pathArg, workspaceRoot, context, "read");
    const info = await stat(directory);
    if (!info.isDirectory()) return failure("NOT_A_DIRECTORY", `Path is not a directory: ${pathArg}`);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    const shown: string[] = [];
    let chars = 0;
    for (const entry of entries) {
      const rendered = `${entry.isDirectory() ? "[dir]  " : "[file] "}${entry.name}`;
      const cost = rendered.length + (shown.length === 0 ? 0 : 1);
      if (shown.length > 0 && chars + cost > TOOL_OUTPUT_TEXT_CHARS) break;
      shown.push(rendered);
      chars += cost;
    }
    const listing = entries.length === 0 ? "(empty directory)" : shown.join("\n");
    const text = shown.length < entries.length ? `${listing}\n\n[Showing first ${shown.length} of ${entries.length} entries (stopped at the ${TEXT_LIMIT_LABEL}). Use glob with a pattern, or list a subdirectory, to see the rest.]` : listing;
    // 界面上的条目数读这里，不从给模型的文本里数。
    return { status: "completed", modelOutput: [{ type: "text", text }], summary: `Listed ${displayPath(directory, workspaceRoot)}`, detail: [{ label: "result", value: { entryCount: entries.length, shownCount: shown.length } }] };
  } catch (error) {
    return ioFailure("list directory", pathArg, error);
  }
}

/** Declared deliverables stay at their workspace paths; the result records them for the turn-tail cards. */
async function presentTool(args: Readonly<Record<string, RuntimeJsonValue>>, workspaceRoot: string): Promise<ToolBodyResult> {
  const entries = Array.isArray(args.files) ? args.files : [];
  if (entries.length === 0 || entries.length > PRESENT_MAX_FILES) return failure("INVALID_ARGUMENTS", `present accepts 1 to ${PRESENT_MAX_FILES} files`);
  const files: { path: string; description?: string }[] = [];
  for (const entry of entries) {
    const file = entry !== null && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
    const pathArg = typeof file.path === "string" ? file.path : "";
    if (!pathArg.trim()) return failure("INVALID_ARGUMENTS", "present requires a non-empty file path");
    try {
      // lstat rejects a symlink itself; resolveExistingPath rejects targets that escape through parent links.
      const info = await lstat(resolveWorkspacePath(pathArg, workspaceRoot));
      if (!info.isFile()) return failure("NOT_A_FILE", `Cannot present ${pathArg}: not a regular file`);
      const filePath = await resolveExistingPath(pathArg, workspaceRoot);
      const description = typeof file.description === "string" ? file.description.trim() : "";
      files.push({ path: displayPath(filePath, await realpath(workspaceRoot)), ...(description ? { description } : {}) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT")) return failure("FILE_NOT_FOUND", `Cannot present ${pathArg}: file not found. Check the path, create the file if needed, and retry.`);
      return ioFailure("present file", pathArg, error);
    }
  }
  const text = files.map((file) => `Presented ${file.path}`).join("\n");
  return { status: "completed", modelOutput: [{ type: "text", text }], summary: `Presented ${files.length} file${files.length === 1 ? "" : "s"}`, detail: [{ label: "present", value: { files } }] };
}

async function resolveReadablePath(input: string, workspaceRoot: string, sessionId: string, resolveArtifact?: SessionArtifactResolver, context?: ToolExecutionContext): Promise<string> {
  const candidate = isAbsolute(input) ? resolve(input) : resolve(workspaceRoot, input);
  if (context?.admittedResources?.length) return resolveExistingPath(input, workspaceRoot, context, "read");
  if (isWithin(workspaceRoot, candidate)) return resolveExistingPath(input, workspaceRoot);
  if (resolveArtifact && isAbsolute(input) && /^[0-9a-f-]{36}$/i.test(basename(candidate))) {
    const artifact = await resolveArtifact(sessionId, basename(candidate));
    if (await realpath(candidate) === artifact.path) return artifact.path;
  }
  throw new Error(`Path escapes workspace boundary: ${input}`);
}

async function resolveExistingPath(input: string, workspaceRoot: string, context?: ToolExecutionContext, access: "read" | "delete" = "read"): Promise<string> {
  if (context?.admittedResources?.length) return recheckAdmittedFile(input, access, workspaceRoot, context);
  const candidate = resolveWorkspacePath(input, workspaceRoot);
  const [realRoot, realCandidate] = await Promise.all([realpath(workspaceRoot), realpath(candidate)]);
  if (!isWithin(realRoot, realCandidate)) throw new Error(`Path escapes workspace boundary: ${input}`);
  return realCandidate;
}

async function recheckAdmittedFile(input: string, access: "read" | "write" | "delete", workspaceRoot: string, context: ToolExecutionContext): Promise<string> {
  const expected = context.admittedResources?.find((resource) => resource.kind === "file" && resource.access === access);
  if (expected?.kind !== "file") throw new Error("No admitted file resource matches this operation.");
  const actual = await canonicalizeFileResource(input, access, workspaceRoot);
  if (actual.canonicalPath !== expected.canonicalPath || actual.targetKind !== expected.targetKind) throw new Error("File scope changed after permission admission.");
  return actual.canonicalPath;
}

function resolveWorkspacePath(input: string, workspaceRoot: string): string {
  const candidate = isAbsolute(input) ? resolve(input) : resolve(workspaceRoot, input);
  if (!isWithin(workspaceRoot, candidate)) throw new Error(`Path escapes workspace boundary: ${input}`);
  return candidate;
}

function isWithin(root: string, candidate: string): boolean {
  return isLexicallyInside(nodePath, root, candidate, { includeRoot: true });
}

function completed(text: string, summary = text.split("\n", 1)[0] || "Tool completed.", detail?: RuntimeJsonValue): ToolBodyResult {
  return { status: "completed", modelOutput: [{ type: "text", text }], summary, ...(detail === undefined ? {} : { detail: [{ label: "actspace.context.file", value: detail }] }) };
}

function failure(code: string, message: string, retryable = false): ToolBodyResult {
  return { status: "failed", modelOutput: [{ type: "text", text: message }], summary: message, failure: { code, message, retryable } };
}

function ioFailure(action: string, path: string, error: unknown): ToolBodyResult {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ENOENT")) return failure("FILE_NOT_FOUND", `Path not found: ${path}`);
  if (message.includes("EISDIR")) return failure("NOT_A_FILE", `Path is a directory, not a file: ${path}`);
  return failure("IO_ERROR", `Failed to ${action}: ${message}`);
}

function stringArg(args: Readonly<Record<string, RuntimeJsonValue>>, key: string): string { return typeof args[key] === "string" ? args[key] : ""; }
function integerArg(args: Readonly<Record<string, RuntimeJsonValue>>, key: string, fallback: number): number { const value = args[key]; return typeof value === "number" && Number.isInteger(value) ? Math.max(1, value) : fallback; }
function displayPath(path: string, workspaceRoot: string): string { return relativePathInside(nodePath, workspaceRoot, path) || path; }
