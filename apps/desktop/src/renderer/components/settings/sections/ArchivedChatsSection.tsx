import { useCallback, useEffect, useState } from "react";
import type { SessionListItem } from "@actspace/shared";
import { SettingGroup } from "../SettingsPrimitives";
import { Button } from "../../ui/Button";
import { sessionsApi } from "../../../api/sessions";

function workspaceLabelFromRoot(root: string | undefined): string {
  if (!root) return "默认工作区";
  const normalized = root.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "默认工作区";
}

function formatUpdatedAt(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ArchivedChatsSection({
  onArchivedSessionsChange,
}: {
  onArchivedSessionsChange?: () => void;
}) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadArchived = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const archived = await sessionsApi.list({ archived: true });
      setSessions(archived);
    } catch (err) {
      console.error("Failed to load archived sessions", err);
      setError("归档会话加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArchived();
  }, [loadArchived]);

  const restoreSession = async (sessionId: string) => {
    setRestoringId(sessionId);
    setError(null);
    try {
      const result = await sessionsApi.archive({ sessionId, archived: false });
      if (!result.ok) {
        setError(result.error ?? "恢复归档会话失败。");
        return;
      }
      await loadArchived();
      onArchivedSessionsChange?.();
    } catch (err) {
      console.error("Failed to restore archived session", err);
      setError("恢复归档会话失败。");
    } finally {
      setRestoringId(null);
    }
  };

  return (
      <SettingGroup title="已归档" headingLevel={3} description="恢复后会重新出现在左侧会话栏。">
        {loading ? (
          <div className="px-3.5 py-4 text-act-sm text-text-faint">正在加载归档会话…</div>
        ) : error ? (
          <div className="px-3.5 py-4 text-act-sm text-on-danger">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-act-sm text-text-faint">暂无归档会话</div>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-act-sm font-medium text-text-main">{session.title}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-act-xs text-text-muted">
                  <span>{formatUpdatedAt(session.updatedAt)}</span>
                  <span>{session.agentRunCount} 次运行</span>
                  <span>{workspaceLabelFromRoot(session.workspaceRoot)}</span>
                </div>
              </div>
              <Button
                busy={restoringId === session.id}
                disabled={restoringId === session.id}
                onClick={() => void restoreSession(session.id)}
              >
                {restoringId === session.id ? "恢复中…" : "恢复"}
              </Button>
            </div>
          ))
        )}
      </SettingGroup>
  );
}
