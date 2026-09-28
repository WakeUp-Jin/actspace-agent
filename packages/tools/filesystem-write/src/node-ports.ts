import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { canonicalizeFileResource, type ToolBodyResult, type ToolExecutionContext, type SessionArtifactResolver } from "@actspace/tools-runtime";
import type { ToolPorts } from "./plugin.js";
export type NodeToolPortsOptions = { readonly workspaceRoot: string };
export function createNodeToolPorts(options: NodeToolPortsOptions): ToolPorts { return Object.freeze({ edit_file: (args, context) => editFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)), write_file: (args, context) => writeFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)), delete_file: (args, context) => deleteFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)) }); }
function contextWorkspaceRoot(context: ToolExecutionContext, fallback: string): string {
  return resolve(context.workspaceRoot || fallback);
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
