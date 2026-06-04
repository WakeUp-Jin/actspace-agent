import { readFile, stat } from "node:fs/promises";
import type { ToolResult } from "../../../internal-tools";
import { resolveReadablePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

export const READ_FILE_DEFAULT_LIMIT = 200;

const UNCHANGED_RANGE_NOTICE =
  "File unchanged since previous read for this exact path/offset/limit range. " +
  "Reuse the earlier numbered lines, or pass force=true if the previous text is no longer available in context.";

export const readFileExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
  runtime,
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
    const offset = typeof args.offset === "number" ? Math.max(1, Math.floor(args.offset)) : 1;
    const limit = typeof args.limit === "number"
      ? Math.max(1, Math.floor(args.limit))
      : READ_FILE_DEFAULT_LIMIT;
    const force = args.force === true;
    const fileStat = await stat(guard.resolvedPath);
    const cacheKey = `${guard.resolvedPath}\0${offset}\0${limit}`;
    const cached = runtime?.readFileCache?.get(cacheKey);
    if (!force && cached && cached.size === fileStat.size && cached.mtimeMs === fileStat.mtimeMs) {
      return {
        success: true,
        data: UNCHANGED_RANGE_NOTICE,
      };
    }

    const raw = await readFile(guard.resolvedPath, "utf-8");
    const allLines = raw.split("\n");
    const totalLines = allLines.length;
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
    runtime?.readFileCache?.set(cacheKey, {
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
    });

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
