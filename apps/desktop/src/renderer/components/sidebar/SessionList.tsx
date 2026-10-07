import { useState } from "react";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { useSessionBrowse } from "../../session/SessionBrowseContext";
import { useSessionActions } from "../../session/session-actions-context";
import { sessionWorkspaceRoot } from "./session-grouping";
import { sessionStatusOf } from "./session-status";
import { SessionRow } from "./SessionRow";
import { SIDEBAR_BUTTON_RESET_CLASS } from "./styles";

const SESSION_VISIBLE_LIMIT = 10;
const SESSION_LIST_CLASS = "flex min-w-0 flex-col gap-px";
const SESSION_LIST_TOGGLE_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} inline-flex h-[26px] items-center px-[18px] pt-0.5 text-left text-act-xs leading-4 font-medium text-text-faint transition-colors duration-(--motion-fast) ease-in-out hover:text-text-main`;

type SessionListProps = {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  busySessionIds?: ReadonlySet<string>;
  sessionStatuses?: Record<string, unknown>;
  /** 由 Sidebar 包一层（先切回聊天视图），所以不直接读 SessionActionsContext。 */
  onSelectSession: (sessionId: string) => void;
  groupKey: string;
  workspaces?: WorkspaceEntry[];
};

/** 一组会话：本地超过 10 条时折叠，远端按页加载；行上的会话操作读 SessionActionsContext。 */
export function SessionList({
  sessions,
  activeSessionId,
  busySessionIds,
  sessionStatuses,
  onSelectSession,
  groupKey,
  workspaces = [],
}: SessionListProps) {
  const { onTogglePin, onRenameSession: onRename, onCopySessionId, onCopyTranscript, onForkSession: onFork, onArchiveSession: onArchive } = useSessionActions();
  const browse = useSessionBrowse();
  const [limit, setLimit] = useState(SESSION_VISIBLE_LIMIT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remoteGroups = browse?.groups.filter(g => groupKey === 'pinned' ? g.pinned : !g.pinned && g.hostId === sessions[0]?.hostId && g.workspaceRoot === (sessions[0]?.workspaceRoot ?? '')) ?? [];
  const remoteMore = remoteGroups.some(g => g.hasMore);
  const hasOverflow = browse ? remoteMore : sessions.length > limit;
  const visibleSessions = browse ? sessions : sessions.slice(0, limit);
  const loadMore = async () => {
    if (!browse) { setLimit(n => n + 10); return; }
    if (loading) return;
    setLoading(true); setError(null);
    try {
      for (const group of remoteGroups.filter(g => g.hasMore)) {
        const last = [...sessions].filter(s => s.hostId === group.hostId && (s.workspaceRoot ?? '') === group.workspaceRoot).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).at(-1);
        await browse.loadMore({ hostId: group.hostId, workspaceRoot: group.workspaceRoot, pinned: group.pinned, after: last?.id });
      }
    } catch (e) { setError(e instanceof Error ? e.message : '会话加载失败'); }
    finally { setLoading(false); }
  };

  return (
    <div className={SESSION_LIST_CLASS} data-group-key={groupKey}>
      {visibleSessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          workspaceRoot={sessionWorkspaceRoot(session, workspaces)}
          isActive={session.id === activeSessionId}
          status={sessionStatusOf(session.id, busySessionIds, sessionStatuses)}
          onSelect={() => onSelectSession(session.id)}
          onTogglePin={onTogglePin ? () => onTogglePin(session.id, !session.pinned) : undefined}
          onRename={onRename ? (title) => onRename(session.id, title) : undefined}
          onCopySessionId={onCopySessionId ? () => onCopySessionId(session.id) : undefined}
          onCopyTranscript={onCopyTranscript ? () => onCopyTranscript(session.id) : undefined}
          onFork={onFork ? () => onFork(session.id) : undefined}
          onArchive={onArchive ? () => onArchive(session.id) : undefined}
        />
      ))}
      {error && <p role="alert" className="px-2 text-act-xs leading-4 text-text-muted">{error} <button type="button" onClick={() => { void loadMore(); }}>重试</button></p>}
      {hasOverflow ? (
        <button
          className={`session-list-toggle ${SESSION_LIST_TOGGLE_CLASS}`}
          type="button"
          disabled={loading}
          onClick={() => { void loadMore(); }}
        >
          {loading ? "正在加载…" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
