import { useEffect, useState } from "react";
import type { SessionListItem } from "@actspace/shared";
import { sessionsApi } from "../../api/sessions";

const EMPTY: SessionListItem[] = [];

/**
 * 侧栏筛选显示已归档时才拉已归档会话。`listPage` 不返回已归档，只能一次全量 `list({ archived: true })`。
 * `refreshKey` 变了就重拉：归档、取消归档后 App 会刷新会话列表，传会话列表本身即可。
 */
export function useArchivedSessions(enabled: boolean, refreshKey: unknown): SessionListItem[] {
  const [archived, setArchived] = useState<SessionListItem[]>(EMPTY);
  useEffect(() => {
    if (!enabled) { setArchived(EMPTY); return; }
    let disposed = false;
    sessionsApi.list({ archived: true }).then(
      (items) => { if (!disposed) setArchived(items.filter((item) => item.archived !== false).map((item) => ({ ...item, archived: true }))); },
      (error: unknown) => { console.error("Failed to list archived sessions", error); },
    );
    return () => { disposed = true; };
  }, [enabled, refreshKey]);
  return enabled ? archived : EMPTY;
}
