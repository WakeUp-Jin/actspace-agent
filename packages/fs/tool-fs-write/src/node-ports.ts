import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import * as nodePath from "node:path";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isLexicallyInside, relativePathInside } from "@actspace/shared";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import {
  canonicalizeFileResource,
  sliceWholeChars,
  TOOL_OUTPUT_LINE_CHARS,
  TOOL_OUTPUT_TEXT_CHARS,
  type ToolBodyResult,
  type ToolExecutionContext,
} from "@actspace/tool-runtime";
import type { ToolPorts } from "./plugin.js";
export type NodeToolPortsOptions = { readonly workspaceRoot: string };
export function createNodeToolPorts(options: NodeToolPortsOptions): ToolPorts {
  return Object.freeze({
    edit_file: (args, context) => editFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)),
    write_file: (args, context) => writeFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)),
    delete_file: (args, context) => deleteFileTool(args, context, contextWorkspaceRoot(context, options.workspaceRoot)),
  });
}
function contextWorkspaceRoot(context: ToolExecutionContext, fallback: string): string {
  return resolve(context.workspaceRoot || fallback);
}

async function writeFileTool(
  args: Readonly<Record<string, RuntimeJsonValue>>,
  context: ToolExecutionContext,
  workspaceRoot: string,
): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  const content = typeof args.content === "string" ? args.content : undefined;
  if (!pathArg || content === undefined) return failure("INVALID_ARGUMENTS", "path and content are required");
  try {
    const filePath = await resolveWritablePath(pathArg, workspaceRoot, context);
    const oldContent = existsSync(filePath) ? await readFile(filePath, "utf8") : "";
    const created = !existsSync(filePath);
    const path = await displayPath(filePath, workspaceRoot);
    context.reportProgress({ message: `${created ? "Creating" : "Updating"} ${path}`, additions: 0, deletions: 0 });
    await writeTextAtomic(filePath, content);
    const { diff, additions, deletions } = createUnifiedDiff(path, oldContent, content);
    context.reportProgress({ message: `${created ? "Created" : "Updated"} ${path}`, additions, deletions });
    return completed(
      `${diff}\n\nFile ${created ? "created" : "updated"}: ${path}`,
      `${created ? "Created" : "Updated"} ${path}`,
      { type: created ? "create" : "update", path, additions, deletions },
      filePath,
    );
  } catch (error) {
    return ioFailure("write file", pathArg, error);
  }
}

async function editFileTool(
  args: Readonly<Record<string, RuntimeJsonValue>>,
  context: ToolExecutionContext,
  workspaceRoot: string,
): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  const oldText = typeof args.old_string === "string" ? args.old_string : undefined;
  const newText = typeof args.new_string === "string" ? args.new_string : undefined;
  if (!pathArg || oldText === undefined || newText === undefined)
    return failure("INVALID_ARGUMENTS", "path, old_string and new_string are required");
  try {
    const filePath = await resolveWritablePath(pathArg, workspaceRoot, context);
    const exists = existsSync(filePath);
    if (!exists && oldText !== "") return failure("FILE_NOT_FOUND", `File not found: ${pathArg}`);
    const before = exists ? await readFile(filePath, "utf8") : "";
    const matches = oldText === "" ? 1 : countOccurrences(before, oldText);
    if (matches === 0) return failure("EDIT_NOT_FOUND", "old_string was not found in the file");
    if (matches > 1 && args.replace_all !== true)
      return failure(
        "EDIT_NOT_UNIQUE",
        `old_string matches ${matches} locations; include more context or set replace_all=true`,
      );
    const after =
      oldText === ""
        ? newText
        : args.replace_all === true
          ? before.split(oldText).join(newText)
          : replaceOnePreservingLine(before, oldText, newText);
    const path = await displayPath(filePath, workspaceRoot);
    context.reportProgress({ message: `${exists ? "Updating" : "Creating"} ${path}`, additions: 0, deletions: 0 });
    await writeTextAtomic(filePath, after);
    const { diff, additions, deletions } = createUnifiedDiff(path, before, after);
    context.reportProgress({ message: `${exists ? "Updated" : "Created"} ${path}`, additions, deletions });
    return completed(
      `${diff}\n\nFile ${exists ? "updated" : "created"}: ${path}`,
      `${exists ? "Updated" : "Created"} ${path}`,
      { type: exists ? "update" : "create", path, additions, deletions },
      filePath,
    );
  } catch (error) {
    return ioFailure("edit file", pathArg, error);
  }
}

async function deleteFileTool(
  args: Readonly<Record<string, RuntimeJsonValue>>,
  context: ToolExecutionContext,
  workspaceRoot: string,
): Promise<ToolBodyResult> {
  const pathArg = stringArg(args, "path");
  if (!pathArg) return failure("INVALID_ARGUMENTS", "path is required");
  try {
    const filePath = await resolveExistingPath(pathArg, workspaceRoot, context, "delete");
    const info = await lstat(filePath);
    if (info.isDirectory())
      return failure("NOT_A_FILE", "delete_file only supports files. Directories are not supported.");
    if (!info.isFile()) return failure("NOT_A_FILE", "delete_file only supports regular files.");
    await unlink(filePath);
    const path = await displayPath(filePath, workspaceRoot);
    return completed(`File deleted: ${path}`, `Deleted ${path}`, { type: "delete", path });
  } catch (error) {
    return ioFailure("delete file", pathArg, error);
  }
}

async function resolveExistingPath(
  input: string,
  workspaceRoot: string,
  context?: ToolExecutionContext,
  access: "read" | "delete" = "read",
): Promise<string> {
  if (context?.admittedResources?.length) return recheckAdmittedFile(input, access, workspaceRoot, context);
  const candidate = resolveWorkspacePath(input, workspaceRoot);
  const [realRoot, realCandidate] = await Promise.all([realpath(workspaceRoot), realpath(candidate)]);
  if (!isWithin(realRoot, realCandidate)) throw new Error(`Path escapes workspace boundary: ${input}`);
  return realCandidate;
}

async function resolveWritablePath(
  input: string,
  workspaceRoot: string,
  context?: ToolExecutionContext,
): Promise<string> {
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
  return resolve(realParent, relative(parent, candidate));
}

async function recheckAdmittedFile(
  input: string,
  access: "read" | "write" | "delete",
  workspaceRoot: string,
  context: ToolExecutionContext,
): Promise<string> {
  const expected = context.admittedResources?.find(
    (resource) => resource.kind === "file" && resource.access === access,
  );
  if (expected?.kind !== "file") throw new Error("No admitted file resource matches this operation.");
  const actual = await canonicalizeFileResource(input, access, workspaceRoot);
  if (actual.canonicalPath !== expected.canonicalPath || actual.targetKind !== expected.targetKind)
    throw new Error("File scope changed after permission admission.");
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

async function writeTextAtomic(target: string, content: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temp = join(dirname(target), `.${randomUUID()}.tmp`);
  let mode: number | undefined;
  try {
    mode = (await stat(target)).mode;
  } catch {
    /* New file. */
  }
  try {
    await writeFile(temp, content, "utf8");
    if (mode !== undefined) await chmod(temp, mode);
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
function completed(
  text: string,
  summary = text.split("\n", 1)[0] || "Tool completed.",
  detail?: RuntimeJsonValue,
  filePath?: string,
): ToolBodyResult {
  return {
    status: "completed",
    modelOutput: [{ type: "text", text }],
    summary,
    ...(detail === undefined
      ? {}
      : {
          detail: [
            { label: "result", value: detail },
            ...(filePath
              ? [{ label: "actspace.context.file", value: { path: filePath, kind: "file", operation: "write" } }]
              : []),
          ],
        }),
  };
}

function failure(code: string, message: string, retryable = false): ToolBodyResult {
  return {
    status: "failed",
    modelOutput: [{ type: "text", text: message }],
    summary: message,
    failure: { code, message, retryable },
  };
}

function ioFailure(action: string, path: string, error: unknown): ToolBodyResult {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ENOENT")) return failure("FILE_NOT_FOUND", `Path not found: ${path}`);
  if (message.includes("EISDIR")) return failure("NOT_A_FILE", `Path is a directory, not a file: ${path}`);
  return failure("IO_ERROR", `Failed to ${action}: ${message}`);
}

function stringArg(args: Readonly<Record<string, RuntimeJsonValue>>, key: string): string {
  return typeof args[key] === "string" ? args[key] : "";
}
async function displayPath(path: string, workspaceRoot: string): Promise<string> {
  return relativePathInside(nodePath, await realpath(workspaceRoot), path) || path;
}
function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += Math.max(needle.length, 1);
  }
  return count;
}
function replaceOnePreservingLine(text: string, oldText: string, newText: string): string {
  const index = text.indexOf(oldText);
  if (newText !== "" || oldText.includes("\n") || text[index + oldText.length] !== "\n")
    return text.slice(0, index) + newText + text.slice(index + oldText.length);
  return text.slice(0, index) + text.slice(index + oldText.length + 1);
}
/**
 * 单个 hunk 的统一 diff：公共前缀和后缀之外的行算删除和新增，前后各带 3 行上下文。
 * 增删行数从行数组直接算，是真实值；给模型的文本受 TOOL_OUTPUT_TEXT_CHARS 约束，超长的行只留开头。
 * 放不下时删除和新增两边分预算，末尾加一行以 `[` 开头的说明，紧跟最后一行 diff（中间不留空行）：
 * 界面的 diff 解析把空行当上下文行，`[` 开头的行不算 diff 行。结尾的上下文行照常保留，
 * 界面靠它（或开头那行空的删除行）认出「这是新建的文件」。
 */
function createUnifiedDiff(
  path: string,
  before: string,
  after: string,
): { readonly diff: string; readonly additions: number; readonly deletions: number } {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  )
    suffix += 1;
  const contextStart = Math.max(0, prefix - 3);
  const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + 3);
  const newEnd = Math.min(newLines.length, newLines.length - suffix + 3);
  const deletions = oldLines.length - suffix - prefix;
  const additions = newLines.length - suffix - prefix;
  const head = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${contextStart + 1},${oldEnd - contextStart} +${contextStart + 1},${newEnd - contextStart} @@`,
    ...oldLines.slice(contextStart, prefix).map((line) => diffLine(" ", line)),
  ];
  const tail = newLines.slice(newLines.length - suffix, newEnd).map((line) => diffLine(" ", line));
  const budget = Math.max(
    0,
    TOOL_OUTPUT_TEXT_CHARS - [...head, ...tail].reduce((total, line) => total + line.length + 1, 0),
  );
  const removedCost = diffCost(oldLines, prefix, prefix + deletions, budget);
  const addedCost = diffCost(newLines, prefix, prefix + additions, budget);
  if (removedCost + addedCost <= budget) {
    const removed = oldLines.slice(prefix, prefix + deletions).map((line) => diffLine("-", line));
    const added = newLines.slice(prefix, prefix + additions).map((line) => diffLine("+", line));
    return { diff: [...head, ...removed, ...added, ...tail].join("\n"), additions, deletions };
  }
  // 一边不到一半就全给它，剩下的归另一边；两边都超过一半时各占一半。
  const half = Math.floor(budget / 2);
  const removed = takeDiffLines(
    "-",
    oldLines,
    prefix,
    prefix + deletions,
    addedCost <= half ? budget - addedCost : Math.min(removedCost, half),
  );
  const added = takeDiffLines(
    "+",
    newLines,
    prefix,
    prefix + additions,
    budget - removed.reduce((total, line) => total + line.length + 1, 0),
  );
  const shown = `${added.length} of ${additions} added${removed.length < deletions ? ` and ${removed.length} of ${deletions} removed` : ""} lines`;
  const note = `[Output truncated at ${TOOL_OUTPUT_TEXT_CHARS.toLocaleString("en-US")} characters: this diff shows ${shown}. The file was written in full.]`;
  return { diff: [...head, ...removed, ...added, ...tail, note].join("\n"), additions, deletions };
}
function diffLine(sign: " " | "-" | "+", line: string): string {
  return line.length > TOOL_OUTPUT_LINE_CHARS
    ? `${sign}${sliceWholeChars(line, TOOL_OUTPUT_LINE_CHARS)} ...[line truncated: ${line.length} chars]`
    : `${sign}${line}`;
}
/** 一行渲染后占的字符数，含行首符号和换行。 */
function diffLineCost(line: string): number {
  return (line.length > TOOL_OUTPUT_LINE_CHARS ? diffLine(" ", line).length : line.length + 1) + 1;
}
/** [start, end) 这些行渲染后的字符数；一超过 cap 就停，这时返回值只保证大于 cap。 */
function diffCost(lines: readonly string[], start: number, end: number, cap: number): number {
  let cost = 0;
  for (let index = start; index < end && cost <= cap; index += 1) cost += diffLineCost(lines[index] ?? "");
  return cost;
}
function takeDiffLines(
  sign: "-" | "+",
  lines: readonly string[],
  start: number,
  end: number,
  budget: number,
): string[] {
  const taken: string[] = [];
  let cost = 0;
  for (let index = start; index < end; index += 1) {
    const line = lines[index] ?? "";
    cost += diffLineCost(line);
    if (cost > budget) break;
    taken.push(diffLine(sign, line));
  }
  return taken;
}
