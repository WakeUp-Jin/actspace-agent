import { PerformancePanel } from "./PerformancePanel";
import { useSessionBrowse } from "../session/SessionBrowseContext";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDownUp, Blocks, ChevronDown, ChevronRight, FolderPlus, Settings, SquarePen } from "lucide-react";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { IconButton } from "./ui/IconButton";
import { useSessionActions, type NewSessionInput } from "../session/session-actions-context";
import { useHostDirectory, type HostDirectorySnapshot } from "../target/host-directory";
import { groupSessionsByWorkspace, sessionsByGroupKey } from "./sidebar/session-grouping";
import { SessionList } from "./sidebar/SessionList";
import { WorkspaceSection } from "./sidebar/WorkspaceSection";
import { NAV_SECTION_ACTIONS_CLASS, NAV_SECTION_CLASS, NAV_SECTION_LABEL_BASE_CLASS, NAV_SECTION_TITLE_CLASS } from "./sidebar/styles";

export type SidebarMode = "expanded" | "hidden";
export type SidebarView = "chat" | "lab" | "settings" | "extensions";
export type { NewSessionInput } from "../session/session-actions-context";
export type { SessionUiStatusKind } from "./sidebar/session-status";

const selectHosts = (snapshot: HostDirectorySnapshot) => snapshot.hosts;

const SIDEBAR_CLASS =
  "sidebar relative flex h-full min-h-0 min-w-0 flex-col gap-3 bg-sidebar pb-2.5 pl-2.5 pr-2 pt-[var(--window-chrome-strip-height)]";
const SIDEBAR_PRIMARY_ACTIONS_CLASS = "mt-1.5 flex min-w-0 flex-col gap-px p-0";
const SIDEBAR_PRIMARY_ACTION_CLASS =
  "flex min-h-[34px] min-w-0 items-center gap-2.5 rounded-act-md border-0 bg-transparent px-2.5 py-0 text-act-sm font-medium text-text-muted transition-[background,color] duration-(--motion-fast) ease-in-out hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main";
const SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS = "bg-selected font-semibold text-text-main";
const SIDEBAR_PRIMARY_ACTION_LABEL_CLASS = "min-w-0 flex-1 text-left";
const SIDEBAR_PRIMARY_ACTION_SHORTCUT_CLASS = "text-act-xs leading-4 font-medium tracking-[0.02em] text-text-faint";
const SESSION_NAV_CLASS = "sidebar-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-x-hidden overflow-y-auto pt-2";
const NAV_SECTION_WORKSPACES_CLASS = `${NAV_SECTION_CLASS} gap-1`;
const NAV_SECTION_LABEL_CLASS = `${NAV_SECTION_LABEL_BASE_CLASS} text-act-xs`;
// 分组标题上的操作按钮默认隐藏，悬停或键盘聚焦到标题行时出现。
const NAV_SECTION_ACTION_REVEAL_CLASS = "opacity-0 group-hover/nav-title:opacity-100 group-focus-within/nav-title:opacity-100";
const SETTINGS_ENTRY_CLASS =
  "flex min-h-[34px] min-w-0 items-center gap-[9px] rounded-act-md border-0 bg-transparent px-2.5 py-0 text-left text-act-sm font-medium text-text-muted transition-[background,color] duration-(--motion-fast) ease-in-out hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main";

type NavSectionHeaderProps = {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  extraActions?: ReactNode;
};

/**
 * 分组标题统一渲染：左侧只放纯文字 label（点击折叠），右侧 actions 区在
 * hover 时露出 chevron（视觉指示折叠态）；额外按钮（如 Workspaces 的"排序"）
 * 通过 extraActions slot 注入，统一布在 chevron 之前。
 */
function NavSectionHeader({ label, collapsed, onToggle, extraActions }: NavSectionHeaderProps) {
  return (
    <div className={`nav-section-title ${NAV_SECTION_TITLE_CLASS}`}>
      <button
        className={`nav-section-label ${NAV_SECTION_LABEL_CLASS}`}
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span>{label}</span>
      </button>
      <div className={`nav-section-actions ${NAV_SECTION_ACTIONS_CLASS}`}>
        {extraActions}
        <IconButton
          className={`nav-section-chevron ${NAV_SECTION_ACTION_REVEAL_CLASS}`}
          size="xs"
          onClick={onToggle}
          label={collapsed ? `展开 ${label}` : `收起 ${label}`}
        >
          {collapsed
            ? <ChevronRight size={13} strokeWidth={1.9} aria-hidden="true" />
            : <ChevronDown size={13} strokeWidth={1.9} aria-hidden="true" />}
        </IconButton>
      </div>
    </div>
  );
}

export function Sidebar({
  sessions,
  workspaces = [],
  activeSessionId,
  mode,
  view,
  busySessionIds,
  sessionStatuses,
  onSelectView,
}: {
  sessions: SessionListItem[];
  workspaces?: WorkspaceEntry[];
  activeSessionId: string | null;
  mode: SidebarMode;
  view: SidebarView;
  busySessionIds?: Set<string>;
  sessionStatuses?: Record<string, unknown>;
  /** 折叠按钮回调；现由 WorkbenchLayout 通过 WindowChromeBar 调用，Sidebar 内部不直接渲染 chrome row。 */
  onToggleMode?: () => void;
  onSelectView?: (next: SidebarView) => void;
}) {
  // 会话 / 工作区操作来自 SessionActionsContext；未提供的操作只做视觉占位。
  // 子组件各自读需要的会话操作；这里只用新建、选择（先切回聊天视图）和添加工作区。
  const { onNewSession, onAddWorkspace, onSelectSession } = useSessionActions();
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [workspacesCollapsed, setWorkspacesCollapsed] = useState(false);
  const hosts = useHostDirectory(selectHosts);

  const pinnedSessions = useMemo(
    () => sessions.filter((session) => session.pinned),
    [sessions],
  );
  const unpinnedSessions = useMemo(
    () => sessions.filter((session) => !session.pinned),
    [sessions],
  );
  const browse = useSessionBrowse();
  const hostNameOf = useCallback((hostId: string) => hosts.find((host) => host.hostId === hostId)?.name, [hosts]);
  const workspaceGroups = useMemo(
    () => groupSessionsByWorkspace(unpinnedSessions, workspaces, hostNameOf),
    [unpinnedSessions, workspaces, hostNameOf],
  );
  // 「归档全部」会连置顶的会话一起归档，所以判断是否可用时看全部会话。
  const workspaceGroupSessions = useMemo(() => sessionsByGroupKey(sessions, workspaces), [sessions, workspaces]);

  if (mode === "hidden") {
    return null;
  }

  const handleNewAgent = (input?: NewSessionInput) => {
    onSelectView?.("chat");
    onNewSession?.(input);
  };

  const handleSelectChatSession = (sessionId: string) => {
    onSelectView?.("chat");
    onSelectSession?.(sessionId);
  };

  return (
    <aside className={SIDEBAR_CLASS}>
      <div className={SIDEBAR_PRIMARY_ACTIONS_CLASS}>
        <div className="relative flex items-center">
          <button
            className={`${SIDEBAR_PRIMARY_ACTION_CLASS} min-w-0 flex-1 ${view === "chat" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
            type="button"
            onClick={() => handleNewAgent()}
          >
            <SquarePen size={14} strokeWidth={1.9} />
            <span className={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}>新建会话</span>
            <span className={SIDEBAR_PRIMARY_ACTION_SHORTCUT_CLASS} aria-hidden="true">⌘N</span>
          </button>
        </div>
        <button
          className={`${SIDEBAR_PRIMARY_ACTION_CLASS} ${view === "extensions" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
          type="button"
          aria-current={view === "extensions" ? "page" : undefined}
          onClick={() => onSelectView?.("extensions")}
        >
          <Blocks size={14} strokeWidth={1.9} />
          <span className={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}>扩展</span>
        </button>
      </div>

      <nav className={SESSION_NAV_CLASS} aria-label="会话">
        {browse?.listLoading && <p role="status" className="px-2 text-act-xs leading-4 text-text-muted">正在加载会话…</p>}
        {browse?.listError && <p role="alert" className="px-2 text-act-xs leading-4 text-text-muted">{browse.listError} <button type="button" onClick={browse.retryList}>重试</button></p>}
        {pinnedSessions.length > 0 ? (
          <section className={`nav-section ${NAV_SECTION_CLASS}`}>
            <NavSectionHeader
              label="已置顶"
              collapsed={pinnedCollapsed}
              onToggle={() => setPinnedCollapsed((value) => !value)}
            />
            {pinnedCollapsed ? null : (
              <SessionList
                sessions={pinnedSessions}
                activeSessionId={activeSessionId}
                busySessionIds={busySessionIds}
                sessionStatuses={sessionStatuses}
                onSelectSession={handleSelectChatSession}
                groupKey="pinned"
                workspaces={workspaces}
              />
            )}
          </section>
        ) : null}

        <section className={`nav-section nav-section-workspaces ${NAV_SECTION_WORKSPACES_CLASS}`}>
          <NavSectionHeader
            label="工作区"
            collapsed={workspacesCollapsed}
            onToggle={() => setWorkspacesCollapsed((value) => !value)}
            extraActions={
              <>
                <IconButton
                  className={NAV_SECTION_ACTION_REVEAL_CLASS}
                  size="xs"
                  label="排序工作区"
                  tooltip="排序（即将推出）"
                >
                  <ArrowDownUp size={13} strokeWidth={1.9} aria-hidden="true" />
                </IconButton>
                <IconButton
                  className={NAV_SECTION_ACTION_REVEAL_CLASS}
                  size="xs"
                  label="添加工作区"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddWorkspace?.();
                  }}
                >
                  <FolderPlus size={13} strokeWidth={1.9} aria-hidden="true" />
                </IconButton>
              </>
            }
          />

          {workspacesCollapsed
            ? null
            : workspaceGroups.map((group) => (
                <WorkspaceSection
                  key={group.key}
                  group={group}
                  allSessions={workspaceGroupSessions.get(group.key) ?? []}
                  workspaces={workspaces}
                  activeSessionId={activeSessionId}
                  busySessionIds={busySessionIds}
                  sessionStatuses={sessionStatuses}
                  onSelectSession={handleSelectChatSession}
                  onNewSession={handleNewAgent}
                />
              ))}
        </section>
      </nav>

      <button
        className={`${SETTINGS_ENTRY_CLASS} ${view === "settings" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
        type="button"
        onClick={() => onSelectView?.("settings")}
      >
        <Settings size={14} strokeWidth={1.9} />
        设置
      </button>
      <PerformancePanel />
    </aside>
  );
}
