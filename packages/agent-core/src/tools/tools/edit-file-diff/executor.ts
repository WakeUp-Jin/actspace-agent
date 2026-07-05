import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import * as Diff from "diff";
import type { ToolResult, ResultRenderer } from "../../../internal-tools";
import { APPROVED_OUTSIDE_BOUNDARY_ARG, guardWritablePath, resolveReadablePath } from "../../workspace-guard";
import { writeTextAtomic } from "../shared/write-atomic";
import type { ToolExecutorFn } from "../../types";

const QUOTE_MAP: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2032": "'",
  "\u2033": '"',
};

function normalizeQuotes(s: string): string {
  let result = s;
  for (const [fancy, plain] of Object.entries(QUOTE_MAP)) {
    result = result.replaceAll(fancy, plain);
  }
  return result;
}

function countChangedLines(diff: string, marker: "+" | "-"): number {
  let inHunk = false;
  let count = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (inHunk && line.startsWith(marker)) {
      count += 1;
    }
  }
  return count;
}

function workspaceRelativePath(filePath: string, workspaceRoot: string): string {
  const rel = relative(workspaceRoot, filePath);
  return rel.startsWith("..") || isAbsolute(rel) ? filePath : rel || ".";
}

function deleteMatches(content: string, oldString: string, replaceAll: boolean): string {
  let updated = "";
  let cursor = 0;

  while (cursor <= content.length) {
    const matchIndex = content.indexOf(oldString, cursor);
    if (matchIndex === -1) {
      updated += content.slice(cursor);
      break;
    }

    const matchEnd = matchIndex + oldString.length;
    const startsAtLineStart = matchIndex === 0 || content[matchIndex - 1] === "\n";
    const endsBeforeNewline = content[matchEnd] === "\n";
    const deleteEnd = !oldString.endsWith("\n") && startsAtLineStart && endsBeforeNewline
      ? matchEnd + 1
      : matchEnd;

    updated += content.slice(cursor, matchIndex);
    cursor = deleteEnd;

    if (!replaceAll) {
      updated += content.slice(cursor);
      break;
    }
  }

  return updated;
}

export const editFileDiffExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
  runtime,
): Promise<ToolResult> => {
  const pathArg = typeof args.path === "string" ? args.path : "";
  let oldString = typeof args.old_string === "string" ? args.old_string : "";
  let newString = typeof args.new_string === "string" ? args.new_string : "";
  const replaceAll = Boolean(args.replace_all);

  if (!pathArg) return { success: false, error: "path is required" };
  if (oldString === newString) return { success: false, error: "old_string and new_string must be different" };

  // 权限检查器让用户审批通过越界写入后（sanitizedArgs 带标记），只解析路径不再做边界检查。
  const guard = args[APPROVED_OUTSIDE_BOUNDARY_ARG] === true
    ? resolveReadablePath(pathArg, workspaceRoot)
    : guardWritablePath(pathArg, workspaceRoot, runtime?.additionalWritableRoots);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const fileExists = existsSync(guard.resolvedPath);

  // old_string empty + file does not exist → create new file
  if (!fileExists && oldString === "") {
    await writeTextAtomic(guard.resolvedPath, newString);
    const relativePath = workspaceRelativePath(guard.resolvedPath, workspaceRoot);
    const diff = Diff.createTwoFilesPatch(relativePath, relativePath, "", newString, "", "", { context: 3 });
    return {
      success: true,
      data: {
        type: "create",
        filePath: guard.resolvedPath,
        relativePath,
        diff,
        additions: countChangedLines(diff, "+"),
        deletions: 0,
        chars: newString.length,
      },
    };
  }

  if (!fileExists) {
    return { success: false, error: `File not found: ${pathArg}` };
  }

  let content: string;
  try {
    content = await readFile(guard.resolvedPath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Cannot read file: ${msg}` };
  }

  // old_string empty + file is not empty → error
  if (oldString === "" && content !== "") {
    return { success: false, error: "old_string is empty but target file is not empty" };
  }

  // old_string empty + file is empty → write new content
  if (oldString === "") {
    await writeTextAtomic(guard.resolvedPath, newString);
    const relativePath = workspaceRelativePath(guard.resolvedPath, workspaceRoot);
    const diff = Diff.createTwoFilesPatch(relativePath, relativePath, "", newString, "", "", { context: 3 });
    return {
      success: true,
      data: {
        type: "update",
        filePath: guard.resolvedPath,
        relativePath,
        diff,
        additions: countChangedLines(diff, "+"),
        deletions: 0,
        chars: newString.length,
      },
    };
  }

  // Try direct match first, then quote-normalized match
  let matches = content.split(oldString).length - 1;

  if (matches === 0) {
    const normOld = normalizeQuotes(oldString);
    const normContent = normalizeQuotes(content);

    if (normContent.includes(normOld)) {
      const idx = normContent.indexOf(normOld);
      const actualOld = content.slice(idx, idx + oldString.length);

      for (const [fancy, plain] of Object.entries(QUOTE_MAP)) {
        if (actualOld.includes(fancy) && newString.includes(plain)) {
          newString = newString.replaceAll(plain, fancy);
        }
      }

      oldString = actualOld;
      matches = content.split(oldString).length - 1;
    } else {
      return {
        success: false,
        error: "old_string not found in file. Read the file first to verify the current content.",
      };
    }
  }

  if (matches > 1 && !replaceAll) {
    return {
      success: false,
      error: `old_string matches ${matches} locations. Include more context to make it unique, or set replace_all=true.`,
    };
  }

  // Perform replacement
  let updated: string;
  if (newString === "") {
    updated = deleteMatches(content, oldString, replaceAll);
  } else {
    updated = replaceAll ? content.replaceAll(oldString, newString) : content.replace(oldString, newString);
  }

  // Generate diff before writing
  const relativePath = workspaceRelativePath(guard.resolvedPath, workspaceRoot);
  const diff = Diff.createTwoFilesPatch(relativePath, relativePath, content, updated, "", "", { context: 3 });

  await writeTextAtomic(guard.resolvedPath, updated);

  return {
    success: true,
    data: {
      type: "update",
      filePath: guard.resolvedPath,
      relativePath,
      diff,
      additions: countChangedLines(diff, "+"),
      deletions: countChangedLines(diff, "-"),
      chars: updated.length,
      replaceAll,
      matches,
    },
  };
};

export const renderEditResult: ResultRenderer = (result) => {
  if (!result.success) return `Error: ${result.error}`;
  const d = result.data as Record<string, unknown> | undefined;
  if (!d) return "Edit completed.";
  const diff = typeof d.diff === "string" ? d.diff : "";
  const fp = typeof d.relativePath === "string"
    ? d.relativePath
    : typeof d.filePath === "string"
      ? d.filePath
      : "";
  if (d.type === "create") return `${diff}\n\nFile created: ${fp}`;
  return `${diff}\n\nFile updated: ${fp}`;
};
