import { PerformancePanel } from "./PerformancePanel";
import { useSessionBrowse } from "../session/SessionBrowseContext";
import { Blocks, Settings, SquarePen } from "lucide-react";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { useSessionActions, type NewSessionInput } from "../session/session-actions-context";
import { SidebarSessions } from "./sidebar/SidebarSessions";
import { ActorRosterAction, NewSpaceAction, SpaceSidebarSection, SpaceSoloChatRows } from "./space/SpaceSidebarSection";
import { SPACE_DEMO_ENABLED } from "./space/space-demo-enabled";

export type SidebarMode = "expanded" | "hidden";
/** "space"：Space 演示区（协调 Agent、Actor 名册、一对一对话），具体页面由 Space 的 store 决定。 */
export type SidebarView = "chat" | "lab" | "settings" | "extensions" | "space";
export type { NewSessionInput } from "../session/session-actions-context";
export type { SessionUiStatusKind } from "./sidebar/session-status";

const SIDEBAR_CLASS =
  "sidebar relative flex h-full min-h-0 min-w-0 flex-col gap-3 bg-sidebar pb-2.5 pl-2.5 pr-2 pt-[var(--window-chrome-strip-height)]";
const SIDEBAR_PRIMARY_ACTIONS_CLASS = "mt-1.5 flex min-w-0 flex-col gap-px p-0";
const SIDEBAR_PRIMARY_ACTION_CLASS =
  "flex min-h-[34px] min-w-0 items-center gap-2.5 rounded-act-md border-0 bg-transparent px-2.5 py-0 text-act-sm font-medium text-text-muted transition-[background,color] duration-(--motion-fast) ease-in-out hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main";
const SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS = "bg-selected font-semibold text-text-main";
const SIDEBAR_PRIMARY_ACTION_LABEL_CLASS = "min-w-0 flex-1 text-left";
const SIDEBAR_PRIMARY_ACTION_SHORTCUT_CLASS = "text-act-xs leading-4 font-medium tracking-[0.02em] text-text-faint";
const SESSION_NAV_CLASS = "sidebar-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-x-hidden overflow-y-auto pt-1";
const SETTINGS_ENTRY_CLASS =
  "flex min-h-[34px] min-w-0 items-center gap-[9px] rounded-act-md border-0 bg-transparent px-2.5 py-0 text-left text-act-sm font-medium text-text-muted transition-[background,color] duration-(--motion-fast) ease-in-out hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main";

export function Sidebar({
  sessions,
  workspaces = [],
  activeSessionId,
  mode,
  view,
  busySessionIds,
  sessionStatuses,
  onSelectView,
  onNewSpace,
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
  /** 打开「新建 Space」弹窗；只在开发构建的 Space 演示里用到。 */
  onNewSpace?: () => void;
}) {
  // 新建、选择（先切回聊天视图）来自 SessionActionsContext；会话列表自己读其余操作。
  const { onNewSession, onSelectSession } = useSessionActions();
  const browse = useSessionBrowse();

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

  const newSpace = SPACE_DEMO_ENABLED ? onNewSpace : undefined;
  const enterSpace = () => onSelectView?.("space");
  // 在 Space 演示里时，普通会话不显示选中态，免得和一对一对话行同时亮着。
  const highlightedSessionId = view === "space" ? null : activeSessionId;

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
        {newSpace ? (
          <NewSpaceAction className={SIDEBAR_PRIMARY_ACTION_CLASS} labelClassName={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS} onNewSpace={newSpace} />
        ) : null}
        <button
          className={`${SIDEBAR_PRIMARY_ACTION_CLASS} ${view === "extensions" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
          type="button"
          aria-current={view === "extensions" ? "page" : undefined}
          onClick={() => onSelectView?.("extensions")}
        >
          <Blocks size={14} strokeWidth={1.9} />
          <span className={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}>扩展</span>
        </button>
        {newSpace ? (
          <ActorRosterAction
            className={SIDEBAR_PRIMARY_ACTION_CLASS}
            labelClassName={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}
            inSpace={view === "space"}
            onEnter={enterSpace}
          />
        ) : null}
      </div>

      <nav className={SESSION_NAV_CLASS} aria-label="会话">
        {browse?.listLoading && <p role="status" className="px-2 text-act-xs leading-4 text-text-muted">正在加载会话…</p>}
        {browse?.listError && <p role="alert" className="px-2 text-act-xs leading-4 text-text-muted">{browse.listError} <button type="button" onClick={browse.retryList}>重试</button></p>}
        {newSpace ? <SpaceSidebarSection inSpace={view === "space"} onEnter={enterSpace} onNewSpace={newSpace} /> : null}
        <SidebarSessions
          sessions={sessions}
          workspaces={workspaces}
          activeSessionId={highlightedSessionId}
          busySessionIds={busySessionIds}
          sessionStatuses={sessionStatuses}
          onSelectSession={handleSelectChatSession}
          onNewSession={handleNewAgent}
          leading={newSpace ? <SpaceSoloChatRows inSpace={view === "space"} onEnter={enterSpace} /> : undefined}
        />
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
