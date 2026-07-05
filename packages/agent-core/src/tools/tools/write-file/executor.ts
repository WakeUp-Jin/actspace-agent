import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import * as Diff from "diff";
import type { ToolResult, ResultRenderer } from "../../../internal-tools";
import { APPROVED_OUTSIDE_BOUNDARY_ARG, guardWritablePath, resolveReadablePath } from "../../workspace-guard";
import { writeTextAtomic } from "../shared/write-atomic";
import type { ToolExecutorFn } from "../../types";

function countPrefixedLines(diff: string, prefix: string): number {
  return diff.split("\n").filter((l) => l.startsWith(prefix) && !l.startsWith(`${prefix}${prefix}`)).length;
}

function workspaceRelativePath(filePath: string, workspaceRoot: string): string {
  const rel = relative(workspaceRoot, filePath);
  return rel.startsWith("..") || isAbsolute(rel) ? filePath : rel || ".";
}

export const writeFileExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
  runtime,
): Promise<ToolResult> => {
  const pathArg = typeof args.path === "string" ? args.path : "";
  const content = typeof args.content === "string" ? args.content : "";

  if (!pathArg) return { success: false, error: "path is required" };

  // 权限检查器让用户审批通过越界写入后（sanitizedArgs 带标记），只解析路径不再做边界检查。
  const guard = args[APPROVED_OUTSIDE_BOUNDARY_ARG] === true
    ? resolveReadablePath(pathArg, workspaceRoot)
    : guardWritablePath(pathArg, workspaceRoot, runtime?.additionalWritableRoots);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  let oldContent = "";
  const created = !existsSync(guard.resolvedPath);

  if (!created) {
    try {
      oldContent = await readFile(guard.resolvedPath, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Cannot read existing file: ${msg}` };
    }
  }

  await writeTextAtomic(guard.resolvedPath, content);

  const relativePath = workspaceRelativePath(guard.resolvedPath, workspaceRoot);
  const diff = Diff.createTwoFilesPatch(relativePath, relativePath, oldContent, content, "", "", { context: 3 });

  return {
    success: true,
    data: {
      type: created ? "create" : "update",
      filePath: guard.resolvedPath,
      relativePath,
      diff,
      additions: countPrefixedLines(diff, "+"),
      deletions: countPrefixedLines(diff, "-"),
      chars: content.length,
    },
  };
};

export const renderWriteResult: ResultRenderer = (result) => {
  if (!result.success) return `Error: ${result.error}`;
  const d = result.data as Record<string, unknown> | undefined;
  if (!d) return "Write completed.";
  const diff = typeof d.diff === "string" ? d.diff : "";
  const fp = typeof d.relativePath === "string"
    ? d.relativePath
    : typeof d.filePath === "string"
      ? d.filePath
      : "";
  if (d.type === "create") return `${diff}\n\nFile created: ${fp}`;
  return `${diff}\n\nFile updated: ${fp}`;
};
