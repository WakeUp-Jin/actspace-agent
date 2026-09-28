import { stat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { canonicalizeFileResource, type ToolBodyResult, type ToolExecutionContext, type SessionArtifactResolver } from "@actspace/tools-runtime";
import type { ToolPorts } from "./plugin.js";
const READ_FILE_DEFAULT_LIMIT = 200;
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
  return Object.freeze({ read_file: (args, context) => readFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot), cache, options.resolveArtifact), list_directory: (args, context) => listDirectoryTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)) });
}
function contextWorkspaceRoot(context: ToolExecutionContext, fallback: string): string {
  return resolve(context.workspaceRoot || fallback);
}

async function readFileTool(
  args: Readonly<Record<string, RuntimeV2JsonValue>>,
  context: ToolExecutionContext,
  workspaceRoot: string,
  cache: Map<string, { readonly size: number; readonly mtimeMs: number }>,
  resolveArtifact?: SessionArtifactResolver,
): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  if (!pathArg) return failure("INVALID_ARGUMENTS", "path is required");
  try {
    const filePath = await resolveReadablePath(pathArg, workspaceRoot, context.sessionId, resolveArtifact, context);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return failure("NOT_A_FILE", `Path is not a regular file: ${pathArg}`);
    const mimeType = IMAGE_MIME_BY_EXT[extname(filePath).toLowerCase()];
    if (mimeType !== undefined) {
      const bytes = await readFile(filePath);
      const artifact = await context.createArtifact({ bytes, mediaType: mimeType });
      const summary = `Read image ${displayPath(filePath, workspaceRoot)} (${fileStat.size} bytes).`;
      return { status: "completed", summary, modelOutput: [{ type: "text", text: summary }, { type: "artifact", artifact, label: "Image" }], artifacts: [artifact] };
    }
    const offset = integerArg(args, "offset", 1);
    const limit = integerArg(args, "limit", READ_FILE_DEFAULT_LIMIT);
    const cacheKey = `${filePath}\0${offset}\0${limit}`;
    const cached = cache.get(cacheKey);
    if (args.force !== true && cached?.size === fileStat.size && cached.mtimeMs === fileStat.mtimeMs) {
      const text = "File unchanged since the previous read of this exact path and range. Reuse the earlier numbered lines, or pass force=true.";
      return completed(text);
    }
    const raw = await readFile(filePath, "utf8");
    const lines = raw.split("\n");
    const start = Math.max(0, offset - 1);
    const end = Math.min(lines.length, start + limit);
    let text = lines.slice(start, end).map((line, index) => `${String(start + index + 1).padStart(6)}|${line}`).join("\n");
    if (end < lines.length) text += `\n\n[Showing lines ${offset}-${end} of ${lines.length}. Use offset/limit to read more.]`;
    cache.set(cacheKey, { size: fileStat.size, mtimeMs: fileStat.mtimeMs });
    return completed(text || "(empty file)", `Read ${displayPath(filePath, workspaceRoot)}`);
  } catch (error) {
    return ioFailure("read file", pathArg, error);
  }
}

async function listDirectoryTool(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, workspaceRoot: string): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  if (!pathArg) return failure("INVALID_ARGUMENTS", "path is required");
  try {
    const directory = await resolveExistingPath(pathArg, workspaceRoot, context, "read");
    const info = await stat(directory);
    if (!info.isDirectory()) return failure("NOT_A_DIRECTORY", `Path is not a directory: ${pathArg}`);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    const text = entries.length === 0 ? "(empty directory)" : entries.map((entry) => `${entry.isDirectory() ? "[dir]  " : "[file] "}${entry.name}`).join("\n");
    return completed(text, `Listed ${displayPath(directory, workspaceRoot)}`);
  } catch (error) {
    return ioFailure("list directory", pathArg, error);
  }
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
  const nested = relative(resolve(root), resolve(candidate));
  return nested === "" || (!nested.startsWith("..") && !isAbsolute(nested));
}

function completed(text: string, summary = text.split("\n", 1)[0] || "Tool completed.", detail?: RuntimeV2JsonValue): ToolBodyResult {
  return { status: "completed", modelOutput: [{ type: "text", text }], summary, ...(detail === undefined ? {} : { detail: [{ label: "result", value: detail }] }) };
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

function stringArg(args: Readonly<Record<string, RuntimeV2JsonValue>>, key: string): string { return typeof args[key] === "string" ? args[key] : ""; }
function integerArg(args: Readonly<Record<string, RuntimeV2JsonValue>>, key: string, fallback: number): number { const value = args[key]; return typeof value === "number" && Number.isInteger(value) ? Math.max(1, value) : fallback; }
function displayPath(path: string, workspaceRoot: string): string { const nested = relative(workspaceRoot, path); return nested && !nested.startsWith("..") && !isAbsolute(nested) ? nested : path; }
