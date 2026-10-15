import { useState } from "react";
import type { SessionListItem } from "@actspace/shared";
import { useSessionBrowse } from "../../session/SessionBrowseContext";

/**
 * 服务端按「Host + 工作区 + 是否置顶」分组分页。`group` 给出时只翻这一组；不给时翻所有未置顶分组（单列表、按时间），
 * 各组用自己已加载的最后一条作游标。`sessions` 是已加载的会话，用来找游标。
 */
export function useRemotePaging({ pinned, group, sessions }: { pinned: boolean; group?: { hostId?: string; workspaceRoot?: string }; sessions: readonly SessionListItem[] }) {
  const browse = useSessionBrowse();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remoteGroups = browse?.groups.filter((g) => pinned
    ? g.pinned
    : !g.pinned && (!group || (g.hostId === group.hostId && g.workspaceRoot === (group.workspaceRoot ?? "")))) ?? [];
  const hasMore = remoteGroups.some((g) => g.hasMore);
  const loadMore = async (): Promise<boolean> => {
    if (!browse || loading) return false;
    setLoading(true); setError(null);
    try {
      for (const remote of remoteGroups.filter((g) => g.hasMore)) {
        const last = sessions
          .filter((s) => !s.archived && !!s.pinned === remote.pinned && s.hostId === remote.hostId && (s.worktree?.sourceWorkspaceRoot ?? s.workspaceRoot ?? "") === remote.workspaceRoot)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).at(-1);
        await browse.loadMore({ hostId: remote.hostId, workspaceRoot: remote.workspaceRoot, pinned: remote.pinned, after: last?.id });
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "会话加载失败");
      return false;
    } finally { setLoading(false); }
  };
  return { hasMore, loading, error, loadMore };
}
