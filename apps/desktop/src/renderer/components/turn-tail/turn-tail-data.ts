import type { MessageBlock } from "@actspace/shared";

/**
 * 轮尾两张卡的数据：只从本轮已完成的工具事件推导，不读 git，也不从回复正文猜。
 * - 改动：write / edit 的 diff 和行数按文件累加；delete 标记删除（本轮新建又删掉的文件直接去掉）。
 * - 交付：`present` 声明的文件，按路径去重，后一次声明覆盖描述，顺序取第一次出现。
 * 规则对照 DeepSeek Harness `ui-deliverables/client/turn-deliverables.ts`。
 */

export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** 每行以 " " / "-" / "+" 开头。 */
  lines: string[];
};

export type TurnChangedFile = {
  /** 工作区相对路径，同时用作去重键和展示路径。 */
  path: string;
  absolutePath?: string;
  additions: number;
  deletions: number;
  /** 本轮第一次写入时文件还不存在。 */
  created: boolean;
  deleted: boolean;
  /** 本轮每次写入各自的 hunk，按时间顺序；不尝试合并。 */
  hunks: DiffHunk[];
};

export type TurnChanges = {
  files: TurnChangedFile[];
  additions: number;
  deletions: number;
};

export type TurnPresentedFile = {
  /** 工作区相对路径。 */
  path: string;
  absolutePath?: string;
  description?: string;
};

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** 解析统一 diff；文件头（---/+++）之前和之间的内容忽略，hunk 内只收 " " / "-" / "+" 行。 */
export function parseUnifiedDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let remainingOld = 0;
  let remainingNew = 0;
  for (const line of diff.split("\n")) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      current = {
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
      };
      remainingOld = current.oldLines;
      remainingNew = current.newLines;
      hunks.push(current);
      continue;
    }
    // hunk 行数用完后，后面的 "--- a/" 之类按文件头处理，不当成删除行。
    if (!current || (remainingOld <= 0 && remainingNew <= 0)) continue;
    const sign = line[0];
    if (sign === "+") { current.lines.push(line); remainingNew -= 1; }
    else if (sign === "-") { current.lines.push(line); remainingOld -= 1; }
    else if (sign === " " || line === "") { current.lines.push(line === "" ? " " : line); remainingOld -= 1; remainingNew -= 1; }
  }
  return hunks;
}

/**
 * 新文件的 diff 以空内容为旧版本，旧侧只有一行空行（`createUnifiedDiff` 把 "" 切成 [""]）。
 * 识别这种 hunk 并去掉那行幽灵空行，避免显示成「删除了 1 行」。
 */
function createdFileHunks(hunks: DiffHunk[]): DiffHunk[] | null {
  if (hunks.length !== 1) return null;
  const [hunk] = hunks;
  const oldSide = hunk.lines.filter((line) => line[0] !== "+");
  if (hunk.oldStart !== 1 || hunk.oldLines !== 1 || oldSide.length !== 1 || oldSide[0].length !== 1) return null;
  const lines = hunk.lines.filter((line) => line[0] === "+");
  return [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines }];
}

function relativeKey(path: string | undefined): string | undefined {
  if (!path || /^(?:[A-Za-z]:)?[\\/]/.test(path)) return undefined;
  return path.replace(/\\/g, "/");
}

/** 删除事件只带路径、没有工作区相对路径：本轮恰好只有一个同（基）名文件时才认定是它。 */
function legacyDeletedPath(files: ReadonlyMap<string, TurnChangedFile>, path: string): string | undefined {
  const matches = [...files.keys()].filter((candidate) => candidate === path || basename(candidate) === basename(path));
  return matches.length === 1 ? matches[0] : undefined;
}

export function collectTurnChanges(messages: readonly MessageBlock[]): TurnChanges | null {
  const files = new Map<string, TurnChangedFile>();
  for (const message of messages) {
    if ((message.kind === "write_diff" || message.kind === "edit_diff") && message.status === "completed") {
      const path = relativeKey(message.outputRelativePath);
      if (!path) continue;
      const parsed = parseUnifiedDiff(message.diff);
      const existing = files.get(path);
      const created = message.kind === "write_diff" && !existing ? createdFileHunks(parsed) : null;
      files.set(path, {
        path,
        absolutePath: message.outputPath ?? existing?.absolutePath,
        additions: (existing?.additions ?? 0) + message.additions,
        deletions: (existing?.deletions ?? 0) + (created ? 0 : message.deletions),
        created: existing ? existing.created : created !== null,
        deleted: false,
        hunks: [...existing?.hunks ?? [], ...created ?? parsed],
      });
      continue;
    }
    if (message.kind === "delete" && message.status === "completed") {
      const path = relativeKey(message.outputRelativePath) ?? (message.outputPath ? undefined : legacyDeletedPath(files, message.filePath));
      if (!path) continue;
      const existing = files.get(path);
      if (existing?.created) {
        files.delete(path);
        continue;
      }
      files.set(path, {
        path,
        absolutePath: message.outputPath ?? existing?.absolutePath,
        additions: existing?.additions ?? 0,
        deletions: existing?.deletions ?? 0,
        created: false,
        deleted: true,
        hunks: existing?.hunks ?? [],
      });
    }
  }
  if (files.size === 0) return null;
  const list = [...files.values()];
  return {
    files: list,
    additions: list.reduce((total, file) => total + file.additions, 0),
    deletions: list.reduce((total, file) => total + file.deletions, 0),
  };
}

export function collectPresentedFiles(messages: readonly MessageBlock[]): TurnPresentedFile[] {
  const files = new Map<string, TurnPresentedFile>();
  for (const message of messages) {
    if (message.kind !== "present" || message.status !== "completed") continue;
    for (const file of message.files) {
      const path = relativeKey(file.outputRelativePath);
      if (!path) continue;
      files.set(path, {
        path,
        ...(file.outputPath ? { absolutePath: file.outputPath } : {}),
        ...(file.description ? { description: file.description } : {}),
      });
    }
  }
  return [...files.values()];
}

export function basename(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1) || path;
}
