import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { canonicalizeFileResource, type ToolBodyResult, type ToolExecutionContext, type SessionArtifactResolver } from "@actspace/tools-runtime";
import type { CoreToolHandler, CoreToolPorts } from "./plugin.js";
import { createNodeBashToolPorts } from "./bash/node-bash-ports.js";
import { createNodeWebToolPorts, type WebSearchCredentials } from "./web/node-web-ports.js";
import { createNodeImageToolPorts, type ImageGenerationCredential, type ImageInspector, type SessionArtifactReader } from "./image/node-image-ports.js";

const READ_FILE_DEFAULT_LIMIT = 200;
const MAX_SEARCH_OUTPUT_CHARS = 128_000;
const MAX_GREP_RESULTS = 100;
const MAX_GLOB_RESULTS = 200;
const RG_TIMEOUT_MS = 15_000;

const IMAGE_MIME_BY_EXT: Readonly<Record<string, string>> = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
});

export type NodeCoreToolPortsOptions = {
  readonly resolveArtifact?: SessionArtifactResolver;
  readonly workspaceRoot: string;
  readonly ripgrepPath?: string;
  readonly tmpRoot?: string;
  readonly sandboxBash?: boolean;
  readonly searchCredentials?: WebSearchCredentials;
  readonly fetchImpl?: typeof fetch;
  readonly resolveHostname?: (hostname: string) => Promise<readonly string[]>;
  readonly imageGeneration?: ImageGenerationCredential;
  readonly readArtifact?: SessionArtifactReader;
  readonly inspectImage?: ImageInspector;
};

export function createNodeCoreToolPorts(options: NodeCoreToolPortsOptions): CoreToolPorts {
  const readCache = new Map<string, { readonly size: number; readonly mtimeMs: number }>();
  const bash = options.tmpRoot === undefined ? undefined : createNodeBashToolPorts({ workspaceRoot: resolve(options.workspaceRoot), tmpRoot: options.tmpRoot, sandbox: options.sandboxBash });
  const web = createNodeWebToolPorts({ credentials: options.searchCredentials, fetchImpl: options.fetchImpl, resolveHostname: options.resolveHostname });
  const image = createNodeImageToolPorts({ generation: options.imageGeneration, readArtifact: options.readArtifact, inspect: options.inspectImage, fetchImpl: options.fetchImpl, resolveHostname: options.resolveHostname });
  return Object.freeze({
    read_file: (args, context) => readFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot), readCache, options.resolveArtifact),
    list_directory: (args, context) => listDirectoryTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)),
    grep: (args, context) => grepTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot), options.ripgrepPath, options.resolveArtifact),
    glob: (args, context) => globTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot), options.ripgrepPath),
    edit_file: (args, context) => editFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)),
    write_file: (args, context) => writeFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)),
    delete_file: (args, context) => deleteFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)),
    ...(bash === undefined ? {} : { bash: bash.bash, bash_output: bash.bash_output, bash_kill: bash.bash_kill, dispose: bash.dispose }),
    web: web.web,
    web_search: web.web_search,
    web_fetch: web.web_fetch,
    generate_image: image.generate_image,
    inspect_image: image.inspect_image,
    dispose: async () => { await Promise.all([bash?.dispose(), web.dispose()]); },
  });
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

async function grepTool(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, workspaceRoot: string, ripgrepPath?: string, resolveArtifact?: SessionArtifactResolver): Promise<ToolBodyResult> {
  const pattern = stringArg(args, "pattern");
  if (!pattern) return failure("INVALID_ARGUMENTS", "pattern is required");
  const pathArg = stringArg(args, "path") || ".";
  try {
    const searchPath = await resolveReadablePath(pathArg, workspaceRoot, context.sessionId, resolveArtifact, context);
    const rgArgs = ["--line-number", "--no-heading", "--color", "never", "--max-count", String(MAX_GREP_RESULTS), ...(isWithin(workspaceRoot, searchPath) ? ["--max-filesize", "1M"] : [])];
    const glob = stringArg(args, "glob");
    if (glob) rgArgs.push("--glob", glob);
    rgArgs.push("--", pattern, searchPath);
    const result = await runRipgrep(ripgrepPath, rgArgs, workspaceRoot, context.signal);
    if (result.exitCode === 1 || !result.stdout.trim()) return completed(`No matches found for pattern "${pattern}"`);
    if (result.exitCode !== 0) return failure("SEARCH_FAILED", result.error || `ripgrep exited with code ${result.exitCode}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const normalized = lines.map((line) => normalizeSearchLine(line, workspaceRoot)).join("\n");
    const suffix = result.truncated ? "\n\n[Output truncated by ripgrep runner]" : "";
    return completed(`Found ${lines.length} match${lines.length === 1 ? "" : "es"}:\n\n${normalized}${suffix}`, `Found ${lines.length} matches`);
  } catch (error) {
    return ioFailure("search", pathArg, error);
  }
}

async function globTool(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, workspaceRoot: string, ripgrepPath?: string): Promise<ToolBodyResult> {
  const pattern = stringArg(args, "pattern");
  if (!pattern) return failure("INVALID_ARGUMENTS", "pattern is required");
  const pathArg = stringArg(args, "path") || ".";
  try {
    const searchRoot = await resolveExistingPath(pathArg, workspaceRoot, context, "read");
    const globPattern = pattern.startsWith("**/") || pattern.includes("/") || pattern.startsWith("!") ? pattern : `**/${pattern}`;
    const result = await runRipgrep(ripgrepPath, ["--files", "--glob", globPattern, "--color", "never", searchRoot], workspaceRoot, context.signal);
    if (result.exitCode === 1 || !result.stdout.trim()) return completed(`No files found matching "${pattern}"`);
    if (result.exitCode !== 0) return failure("SEARCH_FAILED", result.error || `ripgrep exited with code ${result.exitCode}`);
    const paths = result.stdout.trim().split("\n").filter(Boolean);
    const entries = await Promise.all(paths.map(async (item) => {
      const absolute = isAbsolute(item) ? item : resolve(searchRoot, item);
      try {
        const fileStat = await stat(absolute);
        return { path: displayPath(absolute, workspaceRoot), size: fileStat.size, mtimeMs: fileStat.mtimeMs };
      } catch {
        return { path: displayPath(absolute, workspaceRoot), size: -1, mtimeMs: 0 };
      }
    }));
    entries.sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path));
    const limited = entries.slice(0, MAX_GLOB_RESULTS);
    const text = limited.map((entry) => `${entry.path} | size: ${entry.size < 0 ? "unknown" : formatBytes(entry.size)} | modified: ${entry.mtimeMs > 0 ? new Date(entry.mtimeMs).toISOString() : "unknown"}`).join("\n");
    const suffix = entries.length > MAX_GLOB_RESULTS ? `\n\n[Showing first ${MAX_GLOB_RESULTS} of ${entries.length} files.]` : result.truncated ? "\n\n[Output truncated by ripgrep runner]" : "";
    return completed(`Found ${entries.length} file${entries.length === 1 ? "" : "s"} matching "${pattern}":\n\n${text}${suffix}`, `Found ${entries.length} files`);
  } catch (error) {
    return ioFailure("glob", pathArg, error);
  }
}

async function writeFileTool(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, workspaceRoot: string): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  const content = typeof args.content === "string" ? args.content : undefined;
  if (!pathArg || content === undefined) return failure("INVALID_ARGUMENTS", "path and content are required");
  try {
    const filePath = await resolveWritablePath(pathArg, workspaceRoot, context);
    const oldContent = existsSync(filePath) ? await readFile(filePath, "utf8") : "";
    const created = !existsSync(filePath);
    const path = displayPath(filePath, workspaceRoot);
    context.reportProgress({ message: `${created ? "Creating" : "Updating"} ${path}`, additions: 0, deletions: 0 });
    await writeTextAtomic(filePath, content);
    const diff = createUnifiedDiff(path, oldContent, content);
    const additions = countDiff(diff, "+");
    const deletions = countDiff(diff, "-");
    context.reportProgress({ message: `${created ? "Created" : "Updated"} ${path}`, additions, deletions });
    return completed(`${diff}\n\nFile ${created ? "created" : "updated"}: ${path}`, `${created ? "Created" : "Updated"} ${path}`, { type: created ? "create" : "update", path, additions, deletions });
  } catch (error) {
    return ioFailure("write file", pathArg, error);
  }
}

async function editFileTool(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, workspaceRoot: string): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  const oldText = typeof args.old_string === "string" ? args.old_string : undefined;
  const newText = typeof args.new_string === "string" ? args.new_string : undefined;
  if (!pathArg || oldText === undefined || newText === undefined) return failure("INVALID_ARGUMENTS", "path, old_string and new_string are required");
  try {
    const filePath = await resolveWritablePath(pathArg, workspaceRoot, context);
    const exists = existsSync(filePath);
    if (!exists && oldText !== "") return failure("FILE_NOT_FOUND", `File not found: ${pathArg}`);
    const before = exists ? await readFile(filePath, "utf8") : "";
    const matches = oldText === "" ? 1 : countOccurrences(before, oldText);
    if (matches === 0) return failure("EDIT_NOT_FOUND", "old_string was not found in the file");
    if (matches > 1 && args.replace_all !== true) return failure("EDIT_NOT_UNIQUE", `old_string matches ${matches} locations; include more context or set replace_all=true`);
    const after = oldText === "" ? newText : args.replace_all === true ? before.split(oldText).join(newText) : replaceOnePreservingLine(before, oldText, newText);
    const path = displayPath(filePath, workspaceRoot);
    context.reportProgress({ message: `${exists ? "Updating" : "Creating"} ${path}`, additions: 0, deletions: 0 });
    await writeTextAtomic(filePath, after);
    const diff = createUnifiedDiff(path, before, after);
    const additions = countDiff(diff, "+");
    const deletions = countDiff(diff, "-");
    context.reportProgress({ message: `${exists ? "Updated" : "Created"} ${path}`, additions, deletions });
    return completed(`${diff}\n\nFile ${exists ? "updated" : "created"}: ${path}`, `${exists ? "Updated" : "Created"} ${path}`, { type: exists ? "update" : "create", path, additions, deletions });
  } catch (error) {
    return ioFailure("edit file", pathArg, error);
  }
}

async function deleteFileTool(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, workspaceRoot: string): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  if (!pathArg) return failure("INVALID_ARGUMENTS", "path is required");
  try {
    const filePath = await resolveExistingPath(pathArg, workspaceRoot, context, "delete");
    const info = await lstat(filePath);
    if (info.isDirectory()) return failure("NOT_A_FILE", "delete_file only supports files. Directories are not supported.");
    if (!info.isFile()) return failure("NOT_A_FILE", "delete_file only supports regular files.");
    await unlink(filePath);
    const path = displayPath(filePath, workspaceRoot);
    return completed(`File deleted: ${path}`, `Deleted ${path}`, { type: "delete", path });
  } catch (error) {
    return ioFailure("delete file", pathArg, error);
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

async function resolveWritablePath(input: string, workspaceRoot: string, context?: ToolExecutionContext): Promise<string> {
  if (context?.admittedResources?.length) return recheckAdmittedFile(input, "write", workspaceRoot, context);
  const candidate = resolveWorkspacePath(input, workspaceRoot);
  const realRoot = await realpath(workspaceRoot);
  if (existsSync(candidate)) {
    const realCandidate = await realpath(candidate);
    if (!isWithin(realRoot, realCandidate)) throw new Error(`Path escapes workspace boundary: ${input}`);
    return realCandidate;
  }
  let parent = dirname(candidate);
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  const realParent = await realpath(parent);
  if (!isWithin(realRoot, realParent)) throw new Error(`Path escapes workspace boundary: ${input}`);
  return candidate;
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

async function writeTextAtomic(target: string, content: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temp = join(dirname(target), `.${randomUUID()}.tmp`);
  let mode: number | undefined;
  try { mode = (await stat(target)).mode; } catch { /* New file. */ }
  try {
    await writeFile(temp, content, "utf8");
    if (mode !== undefined) await chmod(temp, mode);
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

async function runRipgrep(command: string | undefined, args: readonly string[], cwd: string, signal: AbortSignal): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly error: string; readonly truncated: boolean }> {
  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;
    const child = spawn(command || "rg", [...args], { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const finish = (exitCode: number | null, error = stderr.trim()) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolveResult({ exitCode, stdout, error, truncated });
    };
    const append = (current: string, chunk: Buffer) => {
      const room = MAX_SEARCH_OUTPUT_CHARS - current.length;
      if (room <= 0) { truncated = true; return current; }
      const text = chunk.toString("utf8");
      if (text.length > room) truncated = true;
      return current + text.slice(0, room);
    };
    const abort = () => { child.kill("SIGTERM"); finish(null, "Search was aborted."); };
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish(null, `ripgrep timed out after ${RG_TIMEOUT_MS}ms`); }, RG_TIMEOUT_MS);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => finish(null, error.message.includes("ENOENT") ? "ripgrep (rg) is required for grep/glob tools but was not found." : error.message));
    child.on("close", (code) => finish(code));
  });
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
function normalizeSearchLine(line: string, workspaceRoot: string): string { return line.startsWith(`${workspaceRoot}/`) ? line.slice(workspaceRoot.length + 1) : line; }
function countOccurrences(text: string, needle: string): number { let count = 0; let offset = 0; while ((offset = text.indexOf(needle, offset)) !== -1) { count += 1; offset += Math.max(needle.length, 1); } return count; }
function replaceOnePreservingLine(text: string, oldText: string, newText: string): string { const index = text.indexOf(oldText); if (newText !== "" || oldText.includes("\n") || text[index + oldText.length] !== "\n") return text.slice(0, index) + newText + text.slice(index + oldText.length); return text.slice(0, index) + text.slice(index + oldText.length + 1); }
function createUnifiedDiff(path: string, before: string, after: string): string { const oldLines = before.split("\n"); const newLines = after.split("\n"); let prefix = 0; while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1; let suffix = 0; while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1; const contextStart = Math.max(0, prefix - 3); const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + 3); const newEnd = Math.min(newLines.length, newLines.length - suffix + 3); return [`--- a/${path}`, `+++ b/${path}`, `@@ -${contextStart + 1},${oldEnd - contextStart} +${contextStart + 1},${newEnd - contextStart} @@`, ...oldLines.slice(contextStart, prefix).map((line) => ` ${line}`), ...oldLines.slice(prefix, oldLines.length - suffix).map((line) => `-${line}`), ...newLines.slice(prefix, newLines.length - suffix).map((line) => `+${line}`), ...newLines.slice(newLines.length - suffix, newEnd).map((line) => ` ${line}`)].join("\n"); }
function countDiff(diff: string, marker: "+" | "-"): number { return diff.split("\n").filter((line) => line.startsWith(marker) && !line.startsWith(`${marker}${marker}${marker}`)).length; }
function formatBytes(size: number): string { if (size < 1024) return `${size} B`; const units = ["KB", "MB", "GB", "TB"]; let value = size / 1024; let index = 0; while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; } return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`; }
