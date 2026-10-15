import { useState } from "react";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { useSessionActions } from "../../session/session-actions-context";
import { sessionWorkspaceRoot } from "./session-grouping";
import { isSessionBusy, sessionStatusOf } from "./session-status";
import { limitGroupSessions, nextRevealCount } from "./sidebar-view";
import { SessionRow } from "./SessionRow";
import type { RowDrag } from "./use-sidebar-drag";
import { useRemotePaging } from "./use-remote-paging";
import { SIDEBAR_BUTTON_RESET_CLASS } from "./styles";

const SESSION_LIST_CLASS = "flex min-w-0 flex-col gap-px";
const SESSION_LIST_TOGGLE_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} inline-flex h-[26px] items-center self-start pl-[30px] pr-2 text-left text-act-xs leading-4 font-medium text-text-faint transition-colors duration-(--motion-fast) ease-in-out hover:text-text-main disabled:cursor-default`;

export type SessionListProps = {
  /** 已按当前排序排好的会话。 */
  sessions: SessionListItem[];
  activeSessionId: string | null;
  busySessionIds?: ReadonlySet<string>;
  sessionStatuses?: Record<string, unknown>;
  /** 由 Sidebar 包一层（先切回聊天视图），所以不直接读 SessionActionsContext。 */
  onSelectSession: (sessionId: string) => void;
  groupKey: string;
  /** 服务端分页按「Host + 工作区 + 是否置顶」分组；不传时按 groupKey 是否为 pinned 取所有对应分组（单列表、按时间）。 */
  group?: { hostId?: string; workspaceRoot?: string };
  workspaces?: WorkspaceEntry[];
  /** 先显示 5 条，其余用「展开其余 N 个会话」展开；按时间分组时不限。 */
  limited?: boolean;
  /** 已加载的都显示完后向服务端翻页；按时间分组、搜索结果不翻（时间视图在列表最后统一翻）。 */
  paged?: boolean;
  /** 单列表和按时间时给行加工作区名。 */
  workspaceLabelOf?: (session: SessionListItem) => string | undefined;
  /** 手动排序拖拽；不传或返回 undefined 的行不能拖。 */
  rowDrag?: (session: SessionListItem) => RowDrag | undefined;
};

/** 一组会话：先显示 5 条，运行中、待审批和当前会话总是显示；加载完已有的再向服务端翻页。行上的会话操作读 SessionActionsContext。 */
export function SessionList({
  sessions,
  activeSessionId,
  busySessionIds,
  sessionStatuses,
  onSelectSession,
  groupKey,
  group,
  workspaces = [],
  limited = true,
  paged = true,
  workspaceLabelOf,
  rowDrag,
}: SessionListProps) {
  const { onTogglePin, onRenameSession: onRename, onCopySessionId, onCopyTranscript, onForkSession: onFork, onArchiveSession: onArchive, onRestoreSession: onRestore } = useSessionActions();
  const [extra, setExtra] = useState(0);
  const paging = useRemotePaging({ pinned: groupKey === "pinned", group, sessions });
  const statusOf = (session: SessionListItem) => sessionStatusOf(session.id, busySessionIds, sessionStatuses);
  const { visible, hidden } = limited
    ? limitGroupSessions(sessions, extra, (session) => session.id === activeSessionId || isSessionBusy(statusOf(session)))
    : { visible: sessions, hidden: [] };
  const loadMore = async () => {
    // 新加载的会话直接露出来，不再折叠到「展开其余」后面。
    if (await paging.loadMore()) setExtra(sessions.length);
  };

  let toggle: { label: string; onClick: () => void } | null = null;
  if (hidden.length > 0) toggle = { label: `展开其余 ${hidden.length} 个会话`, onClick: () => setExtra((value) => value + nextRevealCount(hidden.length)) };
  else if (paged && paging.hasMore) toggle = { label: paging.loading ? "正在加载…" : "加载更多会话", onClick: () => { void loadMore(); } };
  else if (extra > 0) toggle = { label: "收起", onClick: () => setExtra(0) };

  return (
    <div className={SESSION_LIST_CLASS} data-group-key={groupKey}>
      {visible.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          workspaceRoot={sessionWorkspaceRoot(session, workspaces)}
          workspaceLabel={workspaceLabelOf?.(session)}
          isActive={session.id === activeSessionId}
          status={statusOf(session)}
          drag={session.archived ? undefined : rowDrag?.(session)}
          onSelect={() => onSelectSession(session.id)}
          onTogglePin={onTogglePin ? () => onTogglePin(session.id, !session.pinned) : undefined}
          onRename={onRename ? (title) => onRename(session.id, title) : undefined}
          onCopySessionId={onCopySessionId ? () => onCopySessionId(session.id) : undefined}
          onCopyTranscript={onCopyTranscript ? () => onCopyTranscript(session.id) : undefined}
          onFork={onFork ? () => onFork(session.id) : undefined}
          onArchive={onArchive ? () => onArchive(session.id) : undefined}
          onRestore={onRestore ? () => onRestore(session.id) : undefined}
        />
      ))}
      {paging.error && <p role="alert" className="px-2 text-act-xs leading-4 text-text-muted">{paging.error} <button type="button" onClick={() => { void loadMore(); }}>重试</button></p>}
      {toggle ? (
        <button
          className={`session-list-toggle ${SESSION_LIST_TOGGLE_CLASS}`}
          type="button"
          disabled={paging.loading}
          onClick={toggle.onClick}
        >
          {toggle.label}
        </button>
      ) : null}
    </div>
  );
}
