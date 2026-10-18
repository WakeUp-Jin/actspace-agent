import type { ContextPathEntry } from "@actspace/shared";

export type ContextPathVisibility = ContextPathEntry["visibility"];
export type ContextPathGroup = { dir: string; paths: ContextPathEntry[] };

/** 列表首屏条数与每次「再显示」的条数，和「上下文明细」一致；每次向后端要的页大小。 */
export const PATH_INITIAL_ROWS = 12;
export const PATH_ROW_STEP = 20;
export const PATH_PAGE_LIMIT = 50;

/** 工作区内的路径显示为相对路径，其余原样；末尾斜杠前是目录，之后是文件名。 */
export function splitContextPath(path: string, workspaceRoot?: string): { dir: string; name: string } {
  const root = workspaceRoot?.replace(/[\\/]+$/, "");
  const shown = root && (path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)) ? path.slice(root.length + 1) : path;
  const cut = Math.max(shown.lastIndexOf("/"), shown.lastIndexOf("\\"));
  return cut < 0 ? { dir: "", name: shown } : { dir: shown.slice(0, cut + 1), name: shown.slice(cut + 1) };
}

/** 后端按 path 排序，相邻同目录的条目合成一组；顺序不变。 */
export function groupContextPaths(paths: readonly ContextPathEntry[], workspaceRoot?: string): ContextPathGroup[] {
  const groups: ContextPathGroup[] = [];
  for (const path of paths) {
    const { dir } = splitContextPath(path.path, workspaceRoot);
    const last = groups.at(-1);
    if (last && last.dir === dir) last.paths.push(path);
    else groups.push({ dir, paths: [path] });
  }
  return groups;
}

/** 最近读取的相对时间；没有读取记录时为「未读过」，时间无法解析时为「—」。 */
export function formatPathReadAgo(lastReadAt: string | undefined, now: number): string {
  if (!lastReadAt) return "未读过";
  const at = Date.parse(lastReadAt);
  if (Number.isNaN(at)) return "—";
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

/** 后端以 IPC 拒绝返回版本过期 / 游标失效（交接文档 §3），需要先刷新面板再从首屏读。 */
export function isContextPathRevisionError(message: string): boolean {
  return /revision stale|cursor invalid/i.test(message);
}
