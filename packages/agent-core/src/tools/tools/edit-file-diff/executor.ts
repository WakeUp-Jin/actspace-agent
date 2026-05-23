import { readFile } from "node:fs/promises";
import type { ToolResult } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

export const editFileDiffExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const pathArg = typeof args.path === "string" ? args.path : "";
  const oldString = typeof args.old_string === "string" ? args.old_string : "";
  const newString = typeof args.new_string === "string" ? args.new_string : "";

  if (!pathArg) return { success: false, error: "path is required" };
  if (!oldString) return { success: false, error: "old_string is required" };
  if (oldString === newString) return { success: false, error: "old_string and new_string must be different" };

  const guard = guardWorkspacePath(pathArg, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const content = await readFile(guard.resolvedPath, "utf-8");

    const firstIdx = content.indexOf(oldString);
    if (firstIdx === -1) {
      return {
        success: false,
        error: `old_string not found in file. Read the file first to verify the current content.`,
      };
    }

    const secondIdx = content.indexOf(oldString, firstIdx + 1);
    if (secondIdx !== -1) {
      return {
        success: false,
        error: `old_string matches multiple locations. Include more surrounding context to make it unique.`,
      };
    }

    const lines = content.split("\n");
    const oldLines = oldString.split("\n");
    const newLines = newString.split("\n");

    let startLine = 0;
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (charCount >= firstIdx) {
        startLine = i;
        break;
      }
      charCount += lines[i].length + 1;
    }

    const removals = oldLines.map((l) => `-${l}`);
    const additions = newLines.map((l) => `+${l}`);

    const diffHeader = `--- a/${pathArg}\n+++ b/${pathArg}`;
    const hunkHeader = `@@ -${startLine + 1},${oldLines.length} +${startLine + 1},${newLines.length} @@`;
    const diffBody = [...removals, ...additions].join("\n");
    const diff = `${diffHeader}\n${hunkHeader}\n${diffBody}`;

    const additionCount = newLines.length;
    const deletionCount = oldLines.length;

    return {
      success: true,
      data: `${diff}\n\n${deletionCount} deletion(s), ${additionCount} addition(s)`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT")) {
      return { success: false, error: `File not found: ${pathArg}` };
    }
    return { success: false, error: `Failed to generate diff: ${msg}` };
  }
};
