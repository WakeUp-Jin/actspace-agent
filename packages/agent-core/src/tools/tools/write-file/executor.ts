import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as Diff from "diff";
import type { ToolResult, ResultRenderer } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";
import { writeTextAtomic } from "../shared/write-atomic";
import type { ToolExecutorFn } from "../../types";

function countPrefixedLines(diff: string, prefix: string): number {
  return diff.split("\n").filter((l) => l.startsWith(prefix) && !l.startsWith(`${prefix}${prefix}`)).length;
}

export const writeFileExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const pathArg = typeof args.path === "string" ? args.path : "";
  const content = typeof args.content === "string" ? args.content : "";

  if (!pathArg) return { success: false, error: "path is required" };

  const guard = guardWorkspacePath(pathArg, workspaceRoot);
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

  const diff = Diff.createTwoFilesPatch(pathArg, pathArg, oldContent, content, "", "", { context: 3 });

  return {
    success: true,
    data: {
      type: created ? "create" : "update",
      filePath: guard.resolvedPath,
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
  const fp = typeof d.filePath === "string" ? d.filePath : "";
  if (d.type === "create") return `${diff}\n\nFile created: ${fp}`;
  return `${diff}\n\nFile updated: ${fp}`;
};
