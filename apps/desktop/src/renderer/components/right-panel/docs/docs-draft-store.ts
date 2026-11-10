/**
 * 未保存草稿的暂存（模块级，跨面板卸载、跨工作区切换存活）。
 *
 * 切换工作区会清空「文档」面板的选中和草稿；这些草稿是用户还没存盘的修改，不能静默丢掉。
 * 切根时把脏草稿按 `workspaceRoot + relativePath` 存进来，切回同一个根、同一篇文档时恢复（带未保存圆点）。
 * 恢复时一次性取走（`takeDocsDraft`），之后就是面板里的正常状态：保存、不保存都走原有流程。
 * 只在内存里，不写盘；应用重启后丢失。
 */

export type StashedDocsDraft = {
  /** 草稿所基于的原文，以及当时读到的 mtime / size，用来在恢复时判断磁盘上的文件有没有变过。 */
  original: string;
  draft: string;
  mtimeMs: number;
  size: number;
};

const SEPARATOR = "\u0000";
const store = new Map<string, StashedDocsDraft>();

const keyOf = (workspaceRoot: string, relativePath: string) => `${workspaceRoot}${SEPARATOR}${relativePath}`;

export function stashDocsDraft(workspaceRoot: string, relativePath: string, value: StashedDocsDraft): void {
  store.set(keyOf(workspaceRoot, relativePath), value);
}

/** 取走并删除。 */
export function takeDocsDraft(workspaceRoot: string, relativePath: string): StashedDocsDraft | null {
  const key = keyOf(workspaceRoot, relativePath);
  const value = store.get(key) ?? null;
  store.delete(key);
  return value;
}

/** 这个根下最近暂存的一篇（不取走）：切回这个工作区时据此重新选中它。 */
export function latestStashedDocsPath(workspaceRoot: string): string | null {
  let found: string | null = null;
  const prefix = `${workspaceRoot}${SEPARATOR}`;
  for (const key of store.keys()) if (key.startsWith(prefix)) found = key.slice(prefix.length);
  return found;
}

export function resetDocsDraftStoreForTests(): void {
  store.clear();
}
