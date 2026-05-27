import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export const MAX_FILES_PER_WATCH_PATH = 5000;

/**
 * 默认不进入的目录名/文件名。命中即跳过整个子树（不再递归）。
 * 故意只列高频项；用户的更细控制通过 blocklist.paths 走 guard 层。
 */
export const DEFAULT_WATCH_EXCLUDE: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  ".DS_Store",
  ".cache",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "target",
]);

export interface WatchScanResult {
  rootPath: string;
  entries: string[];                                 // 相对 rootPath 的文件路径，升序
  truncated: boolean;
}

/**
 * 手写递归 readdir：默认 exclude + 隐藏文件（`.` 开头）跳过 + 5000 文件上限。
 *
 * 不使用 fs.readdir 的 `recursive: true` 选项——它会先扫完 node_modules 再过滤，
 * 在大型仓库下性能崩溃；本实现命中 exclude 直接跳过整子树。
 */
export async function scanWatchPath(rootPath: string): Promise<WatchScanResult> {
  const collected: string[] = [];
  let truncated = false;

  const walk = async (dir: string): Promise<void> => {
    if (collected.length >= MAX_FILES_PER_WATCH_PATH) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (collected.length >= MAX_FILES_PER_WATCH_PATH) {
        truncated = true;
        return;
      }
      if (DEFAULT_WATCH_EXCLUDE.has(e.name)) continue;
      if (e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        collected.push(relative(rootPath, full));
      }
    }
  };

  await walk(rootPath);
  collected.sort();
  return { rootPath, entries: collected, truncated };
}
