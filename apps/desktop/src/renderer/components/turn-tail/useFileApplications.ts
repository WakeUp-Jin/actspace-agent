import { useCallback, useEffect, useState } from "react";
import type { WorkspaceFileApplication, WorkspaceFileApplicationsResult } from "@actspace/shared";
import { workspacesApi } from "../../api/workspaces";

/**
 * 文件的关联应用列表（macOS 由 main 用 JXA 查询，带图标，约几百毫秒）。
 * 按工作区 + 路径缓存，同一文件的多张卡和重新挂载不重复查询；查询失败不进缓存，下次挂载会重试。
 * 下拉菜单打开时调用 `refresh` 重新查询，结果回来之前继续显示旧列表。
 */
const cache = new Map<string, Promise<WorkspaceFileApplicationsResult>>();

function query(key: string, workspaceRoot: string, relativePath: string): Promise<WorkspaceFileApplicationsResult> {
  const pending = workspacesApi.listFileApplications({ workspaceRoot, relativePath })
    .catch((): WorkspaceFileApplicationsResult => ({ applications: [], error: "query_failed" }));
  cache.set(key, pending);
  void pending.then((result) => { if (result.error && cache.get(key) === pending) cache.delete(key); });
  return pending;
}

export type FileApplicationsState = {
  applications: readonly WorkspaceFileApplication[];
  failed: boolean;
  loading: boolean;
  refresh: () => void;
};

export function useFileApplications(workspaceRoot: string | null | undefined, relativePath: string, enabled: boolean): FileApplicationsState {
  const key = `${workspaceRoot ?? ""}\u0000${relativePath}`;
  const [loaded, setLoaded] = useState<{ key: string; result: WorkspaceFileApplicationsResult } | null>(null);

  const load = useCallback((force: boolean) => {
    if (!enabled || !workspaceRoot) return () => {};
    let cancelled = false;
    const pending = (!force && cache.get(key)) || query(key, workspaceRoot, relativePath);
    void pending.then((result) => { if (!cancelled) setLoaded({ key, result }); });
    return () => { cancelled = true; };
  }, [enabled, key, workspaceRoot, relativePath]);

  useEffect(() => load(false), [load]);

  const current = loaded?.key === key ? loaded.result : null;
  return {
    applications: current?.applications ?? [],
    failed: current?.error === "query_failed",
    loading: enabled && Boolean(workspaceRoot) && current === null,
    refresh: useCallback(() => { load(true); }, [load]),
  };
}

/** 测试用：清掉跨用例残留的查询结果。 */
export function clearFileApplicationsCache(): void {
  cache.clear();
}
