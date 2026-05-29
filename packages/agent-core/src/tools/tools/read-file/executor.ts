import { readFile } from "node:fs/promises";
import type { ToolResult } from "../../../internal-tools";
import { resolveReadablePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

const MAX_LINES_DEFAULT = 500;

export const readFileExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const pathArg = typeof args.path === "string" ? args.path : "";
  if (!pathArg) {
    return { success: false, error: "path is required" };
  }

  // 读类工具不受 workspace 边界限制，允许回读 tmp/session 等 workspace 外产物。
  const guard = resolveReadablePath(pathArg, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const raw = await readFile(guard.resolvedPath, "utf-8");
    const allLines = raw.split("\n");
    const totalLines = allLines.length;

    const offset = typeof args.offset === "number" ? Math.max(1, args.offset) : 1;
    const limit = typeof args.limit === "number" ? args.limit : MAX_LINES_DEFAULT;

    const startIdx = offset - 1;
    const endIdx = Math.min(startIdx + limit, totalLines);
    const selectedLines = allLines.slice(startIdx, endIdx);

    const numbered = selectedLines.map(
      (line, i) => `${String(startIdx + i + 1).padStart(6)}|${line}`,
    );

    const truncated = endIdx < totalLines;
    let output = numbered.join("\n");
    if (truncated) {
      output += `\n\n[Showing lines ${offset}-${endIdx} of ${totalLines}. Use offset/limit to read more.]`;
    }

    return {
      success: true,
      data: output,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT")) {
      return { success: false, error: `File not found: ${pathArg}` };
    }
    if (msg.includes("EISDIR")) {
      return { success: false, error: `Path is a directory, not a file: ${pathArg}` };
    }
    return { success: false, error: `Failed to read file: ${msg}` };
  }
};
