import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Archive,
  ArrowDownUp,
  BarChart3,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pin,
  Plus,
  Settings,
  Sparkles,
  SquarePen,
} from "lucide-react";
import type { SessionListItem } from "@actspace/shared";

export type SidebarMode = "expanded" | "hidden";
export type SidebarView = "chat" | "lab" | "usage" | "kairos";

const DEFAULT_WORKSPACE_KEY = "__default__";
const DEFAULT_WORKSPACE_LABEL = "Default workspace";
const SESSION_VISIBLE_LIMIT = 8;

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatSessionTitle(title: string): string {
  const normalized = title.replace(/^Session\s+/i, "").replace(/^session-/i, "");
  if (normalized === title) {
    return title;
  }

  return normalized
    .split("-")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function workspaceLabelFromRoot(root: string | undefined | null): string {
  if (!root) return DEFAULT_WORKSPACE_LABEL;
  const normalized = root.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? DEFAULT_WORKSPACE_LABEL;
}

function workspaceKey(root: string | undefined | null): string {
  return root && root.length > 0 ? root : DEFAULT_WORKSPACE_KEY;
}

type WorkspaceGroup = {
  key: string;
  label: string;
  sessions: SessionListItem[];
};

function groupSessionsByWorkspace(sessions: SessionListItem[]): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>();
  for (const session of sessions) {
    const key = workspaceKey(session.workspaceRoot);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: workspaceLabelFromRoot(session.workspaceRoot),
        sessions: [],
      });
    }
    groups.get(key)!.sessions.push(session);
  }

  const ordered = [...groups.values()];
  ordered.sort((a, b) => {
    if (a.key === DEFAULT_WORKSPACE_KEY) return 1;
    if (b.key === DEFAULT_WORKSPACE_KEY) return -1;
    const aLatest = a.sessions[0]?.updatedAt ?? "";
    const bLatest = b.sessions[0]?.updatedAt ?? "";
    return bLatest.localeCompare(aLatest);
  });

  return ordered;
}

type ScheduledItem = {
  id: string;
  title: string;
  hint: string;
};

const MOCK_SCHEDULED: ScheduledItem[] = [
  { id: "scheduled-context-audit", title: "Weekly context audit", hint: "Tomorrow" },
];

const SIDEBAR_CLASS =
  "sidebar relative flex h-full min-h-0 flex-col gap-3 border-r border-[rgba(223,228,234,0.92)] bg-sidebar pb-2.5 pl-2.5 pr-2 pt-[var(--window-chrome-strip-height)]";
const SIDEBAR_PRIMARY_ACTIONS_CLASS = "mt-1.5 flex flex-col gap-px p-0";
const SIDEBAR_PRIMARY_ACTION_CLASS =
  "flex min-h-[34px] items-center gap-2.5 rounded-act-md border-0 bg-transparent px-2.5 py-0 text-[13px] font-medium text-text-muted transition-[background,color] duration-[130ms] ease-in-out hover:bg-[rgba(32,33,36,0.05)] hover:text-text-main";
const SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS = "text-text-main";
const SIDEBAR_PRIMARY_ACTION_LABEL_CLASS = "min-w-0 flex-1 text-left";
const SIDEBAR_PRIMARY_ACTION_SHORTCUT_CLASS = "text-xs font-medium tracking-[0.02em] text-text-faint";
const SIDEBAR_BUTTON_RESET_CLASS = "appearance-none border-0 bg-transparent font-[inherit]";
const SESSION_NAV_CLASS = "flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto pt-2";
const NAV_SECTION_CLASS = "flex flex-col gap-0.5 pb-0";
const NAV_SECTION_WORKSPACES_CLASS = `${NAV_SECTION_CLASS} gap-1`;
const NAV_SECTION_TITLE_CLASS = "group/nav-title flex min-h-6 items-center justify-between gap-2 px-2";
const NAV_SECTION_LABEL_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} inline-flex min-w-0 flex-1 items-center gap-1 p-0 text-left text-xs font-medium tracking-[0] text-text-faint transition-colors duration-[130ms] ease-in-out hover:text-text-main`;
const NAV_SECTION_ACTIONS_CLASS = "inline-flex items-center gap-1 text-text-faint";
const NAV_SECTION_ACTION_BUTTON_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid h-5 w-5 place-items-center rounded-act-sm opacity-0 transition-[opacity,background,color] duration-[130ms] ease-in-out group-hover/nav-title:opacity-100 group-focus-within/nav-title:opacity-100 hover:bg-[rgba(32,33,36,0.06)] hover:text-text-muted`;
const SESSION_LIST_CLASS = "flex flex-col gap-px";
const SESSION_ROW_CLASS =
  "session-row group/session-row relative grid min-h-9 grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 rounded-act-md px-2 transition-[background,color] duration-[130ms] ease-in-out hover:bg-[rgba(32,33,36,0.045)]";
const SESSION_ROW_ACTIVE_CLASS = "is-active bg-sidebar-selected";
const SESSION_ROW_PINNED_CLASS = "is-pinned";
const SESSION_ROW_MUTED_CLASS = "is-muted";
const SESSION_ROW_MARKER_CLASS = "relative flex h-[14px] w-[14px] flex-none items-center justify-center";
const SESSION_ROW_TITLE_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium";
const SESSION_ROW_TIME_CLASS = "text-[11px] whitespace-nowrap text-text-faint";
const SESSION_ROW_MAIN_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-0 text-left text-text-muted transition-colors duration-[130ms] ease-in-out group-hover/session-row:text-text-main group-[.is-active]/session-row:text-text-main`;
const SESSION_ROW_MAIN_MUTED_CLASS = "text-text-muted";
const SESSION_ROW_ACTIONS_CLASS = "inline-flex flex-none items-center gap-0.5";
const SESSION_ROW_ARCHIVE_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid h-[22px] w-[22px] flex-none place-items-center rounded-act-sm text-text-faint opacity-0 transition-[opacity,background,color] duration-[130ms] ease-in-out group-hover/session-row:opacity-100 focus-visible:opacity-100 hover:bg-[rgba(32,33,36,0.08)] hover:text-text-main`;
const SESSION_ROW_PIN_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} session-row-pin absolute inset-0 grid h-[14px] w-[14px] place-items-center rounded-act-sm text-text-muted opacity-0 transition-[opacity,background,color] duration-[130ms] ease-in-out group-hover/session-row:opacity-100 focus-visible:opacity-100 hover:bg-[rgba(32,33,36,0.08)] hover:text-text-main`;
const SESSION_ROW_PIN_ACTIVE_CLASS = "is-active opacity-100 text-text-main";
const SESSION_STATUS_DOT_CLASS =
  "session-status-dot h-1.5 w-1.5 rounded-full bg-brand transition-opacity duration-[130ms] ease-in-out";
const SESSION_STATUS_DOT_MUTED_CLASS = "is-muted bg-text-faint opacity-55";
const SESSION_STATUS_DOT_ACTIVE_CLASS = "is-active bg-brand";
const SESSION_STATUS_DOT_BUSY_CLASS = "is-busy animate-[session-status-pulse_1500ms_ease-in-out_infinite] bg-brand";
const SESSION_LIST_TOGGLE_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} inline-flex h-[26px] items-center px-[18px] pt-0.5 text-left text-xs font-medium text-text-faint transition-colors duration-[130ms] ease-in-out hover:text-text-main`;
const WORKSPACE_SECTION_CLASS = `${NAV_SECTION_CLASS} gap-0.5`;
const WORKSPACE_TITLE_ROW_CLASS =
  "workspace-folder-row group/workspace-row relative grid min-h-[26px] grid-cols-[14px_minmax(0,1fr)_auto] gap-2 px-2";
const WORKSPACE_ICON_SLOT_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} workspace-icon-slot relative inline-flex h-[14px] w-[14px] flex-none items-center justify-center rounded-act-sm p-0 text-text-faint transition-colors duration-[130ms] ease-in-out hover:text-text-muted`;
const WORKSPACE_FOLDER_GLYPH_CLASS =
  "workspace-folder-glyph opacity-100 transition-opacity duration-[130ms] ease-in-out group-hover/workspace-row:opacity-0";
const WORKSPACE_CHEVRON_GLYPH_CLASS =
  "workspace-chevron-glyph absolute inset-0 m-auto text-text-muted opacity-0 transition-opacity duration-[130ms] ease-in-out group-hover/workspace-row:opacity-100";
const WORKSPACE_LABEL_CLASS =
  `${NAV_SECTION_LABEL_CLASS} workspace-folder-label text-[13px] text-text-muted hover:text-text-main`;
const WORKSPACE_NAME_CLASS = "workspace-folder-name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const WORKSPACE_ACTIONS_CLASS = NAV_SECTION_ACTIONS_CLASS;
const WORKSPACE_ADD_BUTTON_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} workspace-add-button grid h-[22px] w-[22px] place-items-center rounded-act-sm text-text-faint opacity-0 transition-[opacity,background,color] duration-[130ms] ease-in-out group-hover/workspace-row:opacity-100 focus-visible:opacity-100 hover:bg-[rgba(32,33,36,0.08)] hover:text-text-main`;
const SETTINGS_ENTRY_CLASS =
  "flex min-h-[34px] items-center gap-[9px] rounded-act-md border-0 bg-transparent px-2.5 py-0 text-left text-[13px] font-medium text-text-muted transition-[background,color] duration-[130ms] ease-in-out hover:bg-[rgba(32,33,36,0.06)] hover:text-text-main";

type NavSectionHeaderProps = {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  extraActions?: ReactNode;
};

/**
 * 分组标题统一渲染：左侧只放纯文字 label（点击折叠），右侧 actions 区在
 * hover 时露出 chevron（视觉指示折叠态）；额外按钮（如 Scheduled 的"新建定时"、
 * Workspaces 的"排序"）通过 extraActions slot 注入，统一布在 chevron 之前。
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
        <button
          className={`nav-section-chevron ${NAV_SECTION_ACTION_BUTTON_CLASS}`}
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        >
          {collapsed
            ? <ChevronRight size={13} strokeWidth={1.9} />
            : <ChevronDown size={13} strokeWidth={1.9} />}
        </button>
      </div>
    </div>
  );
}

type SessionRowProps = {
  session: SessionListItem;
  isActive: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onTogglePin?: () => void;
  onArchive?: () => void;
};

function SessionRow({ session, isActive, isBusy, onSelect, onTogglePin, onArchive }: SessionRowProps) {
  const dotClass = isActive
    ? `${SESSION_STATUS_DOT_CLASS} ${SESSION_STATUS_DOT_ACTIVE_CLASS}`
    : isBusy
      ? `${SESSION_STATUS_DOT_CLASS} ${SESSION_STATUS_DOT_BUSY_CLASS}`
      : `${SESSION_STATUS_DOT_CLASS} ${SESSION_STATUS_DOT_MUTED_CLASS}`;
  const rowClass = [
    SESSION_ROW_CLASS,
    isActive ? SESSION_ROW_ACTIVE_CLASS : "",
    isBusy ? "is-busy" : "",
    session.pinned ? SESSION_ROW_PINNED_CLASS : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={rowClass}
      role="presentation"
    >
      <span className={`session-row-marker ${SESSION_ROW_MARKER_CLASS}`}>
        <span className={dotClass} aria-hidden="true" />
        {onTogglePin ? (
          <button
            className={`${SESSION_ROW_PIN_CLASS} ${session.pinned ? SESSION_ROW_PIN_ACTIVE_CLASS : ""}`}
            type="button"
            aria-label={session.pinned ? "Unpin session" : "Pin session"}
            title={session.pinned ? "Unpin session" : "Pin to top"}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin();
            }}
          >
            {session.pinned ? (
              <Pin size={11} strokeWidth={1.9} fill="currentColor" />
            ) : (
              <Pin size={11} strokeWidth={1.9} />
            )}
          </button>
        ) : null}
      </span>
      <button
        className={`${SESSION_ROW_MAIN_CLASS} ${!isActive && !isBusy ? SESSION_ROW_MAIN_MUTED_CLASS : ""}`}
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "page" : undefined}
      >
        <span className={`session-row-title ${SESSION_ROW_TITLE_CLASS}`}>{formatSessionTitle(session.title)}</span>
        <span className={`session-row-time ${SESSION_ROW_TIME_CLASS} ${isActive ? "opacity-0" : ""}`} aria-hidden={isActive}>
          {formatRelativeTime(session.updatedAt)}
        </span>
      </button>
      <div className={`session-row-actions ${SESSION_ROW_ACTIONS_CLASS}`}>
        <button
          className={`session-row-archive ${SESSION_ROW_ARCHIVE_CLASS}`}
          type="button"
          aria-label="Archive session"
          title="Archive (coming soon)"
          onClick={(event) => {
            event.stopPropagation();
            onArchive?.();
          }}
        >
          <Archive size={12} strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );
}

type CollapsibleSessionListProps = {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  busySessionIds: Set<string>;
  onSelectSession?: (sessionId: string) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  onArchive?: (sessionId: string) => void;
  groupKey: string;
};

function CollapsibleSessionList({
  sessions,
  activeSessionId,
  busySessionIds,
  onSelectSession,
  onTogglePin,
  onArchive,
  groupKey,
}: CollapsibleSessionListProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOverflow = sessions.length > SESSION_VISIBLE_LIMIT;
  const visibleSessions = expanded ? sessions : sessions.slice(0, SESSION_VISIBLE_LIMIT);

  return (
    <div className={SESSION_LIST_CLASS} data-group-key={groupKey}>
      {visibleSessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          isBusy={busySessionIds.has(session.id)}
          onSelect={() => onSelectSession?.(session.id)}
          onTogglePin={onTogglePin ? () => onTogglePin(session.id, !session.pinned) : undefined}
          onArchive={onArchive ? () => onArchive(session.id) : undefined}
        />
      ))}
      {hasOverflow ? (
        <button
          className={`session-list-toggle ${SESSION_LIST_TOGGLE_CLASS}`}
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "See less" : `See more (${sessions.length - SESSION_VISIBLE_LIMIT})`}
        </button>
      ) : null}
    </div>
  );
}

export function Sidebar({
  sessions,
  activeSessionId,
  mode,
  view,
  busySessionIds,
  onNewSession,
  onSelectSession,
  onTogglePin,
  onSelectView,
  onArchive,
}: {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  mode: SidebarMode;
  view: SidebarView;
  busySessionIds?: Set<string>;
  /** 折叠按钮回调；现由 WorkbenchLayout 通过 WindowChromeBar 调用，Sidebar 内部不直接渲染 chrome row。 */
  onToggleMode?: () => void;
  onNewSession?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  onSelectView?: (next: SidebarView) => void;
  onOpenSearch?: () => void;
  /** Archive 占位回调；未传时按钮仅做视觉占位。 */
  onArchive?: (sessionId: string) => void;
}) {
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [scheduledCollapsed, setScheduledCollapsed] = useState(false);
  const [workspacesCollapsed, setWorkspacesCollapsed] = useState(false);
  const busyIds = busySessionIds ?? new Set<string>();

  const pinnedSessions = useMemo(
    () => sessions.filter((session) => session.pinned),
    [sessions],
  );
  const unpinnedSessions = useMemo(
    () => sessions.filter((session) => !session.pinned),
    [sessions],
  );
  const workspaceGroups = useMemo(
    () => groupSessionsByWorkspace(unpinnedSessions),
    [unpinnedSessions],
  );

  if (mode === "hidden") {
    return null;
  }

  const handleNewAgent = () => {
    onSelectView?.("chat");
    onNewSession?.();
  };

  const handleSelectChatSession = (sessionId: string) => {
    onSelectView?.("chat");
    onSelectSession?.(sessionId);
  };

  return (
    <aside className={SIDEBAR_CLASS}>
      <div className={SIDEBAR_PRIMARY_ACTIONS_CLASS}>
        <button
          className={`${SIDEBAR_PRIMARY_ACTION_CLASS} ${view === "chat" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
          type="button"
          onClick={handleNewAgent}
        >
          <SquarePen size={14} strokeWidth={1.9} />
          <span className={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}>New Agent</span>
          <span className={SIDEBAR_PRIMARY_ACTION_SHORTCUT_CLASS} aria-hidden="true">⌘N</span>
        </button>
        <button
          className={`${SIDEBAR_PRIMARY_ACTION_CLASS} ${view === "lab" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
          type="button"
          onClick={() => onSelectView?.("lab")}
        >
          <FlaskConical size={14} strokeWidth={1.9} />
          <span className={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}>Lab</span>
        </button>
        <button
          className={`${SIDEBAR_PRIMARY_ACTION_CLASS} ${view === "usage" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
          type="button"
          onClick={() => onSelectView?.("usage")}
        >
          <BarChart3 size={14} strokeWidth={1.9} />
          <span className={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}>Usage</span>
        </button>
        <button
          className={`${SIDEBAR_PRIMARY_ACTION_CLASS} ${view === "kairos" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
          type="button"
          onClick={() => onSelectView?.("kairos")}
        >
          <Sparkles size={14} strokeWidth={1.9} />
          <span className={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}>Kairos</span>
        </button>
      </div>

      <nav className={SESSION_NAV_CLASS} aria-label="Sessions">
        {pinnedSessions.length > 0 ? (
          <section className={`nav-section ${NAV_SECTION_CLASS}`}>
            <NavSectionHeader
              label="Pinned"
              collapsed={pinnedCollapsed}
              onToggle={() => setPinnedCollapsed((value) => !value)}
            />
            {pinnedCollapsed ? null : (
              <CollapsibleSessionList
                sessions={pinnedSessions}
                activeSessionId={activeSessionId}
                busySessionIds={busyIds}
                onSelectSession={handleSelectChatSession}
                onTogglePin={onTogglePin}
                onArchive={onArchive}
                groupKey="pinned"
              />
            )}
          </section>
        ) : null}

        <section className={`nav-section ${NAV_SECTION_CLASS}`}>
          <NavSectionHeader
            label="Scheduled"
            collapsed={scheduledCollapsed}
            onToggle={() => setScheduledCollapsed((value) => !value)}
            extraActions={
              <>
                <button className={NAV_SECTION_ACTION_BUTTON_CLASS} type="button" aria-label="More scheduled actions">
                  <MoreHorizontal size={14} strokeWidth={1.9} />
                </button>
                <button className={NAV_SECTION_ACTION_BUTTON_CLASS} type="button" aria-label="New scheduled task">
                  <SquarePen size={13} strokeWidth={1.9} />
                </button>
              </>
            }
          />
          {scheduledCollapsed ? null : (
            <div className={SESSION_LIST_CLASS}>
              {MOCK_SCHEDULED.map((item) => (
                <div className={`${SESSION_ROW_CLASS} ${SESSION_ROW_MUTED_CLASS}`} key={item.id} role="presentation">
                  <span className={`session-row-marker ${SESSION_ROW_MARKER_CLASS}`}>
                    <span className={`${SESSION_STATUS_DOT_CLASS} ${SESSION_STATUS_DOT_MUTED_CLASS}`} aria-hidden="true" />
                  </span>
                  <button className={`${SESSION_ROW_MAIN_CLASS} ${SESSION_ROW_MAIN_MUTED_CLASS}`} type="button">
                    <span className={`session-row-title ${SESSION_ROW_TITLE_CLASS}`}>{item.title}</span>
                    <span className={`session-row-time ${SESSION_ROW_TIME_CLASS}`}>{item.hint}</span>
                  </button>
                  <div className={`session-row-actions ${SESSION_ROW_ACTIONS_CLASS}`} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`nav-section nav-section-workspaces ${NAV_SECTION_WORKSPACES_CLASS}`}>
          <NavSectionHeader
            label="Workspaces"
            collapsed={workspacesCollapsed}
            onToggle={() => setWorkspacesCollapsed((value) => !value)}
            extraActions={
              <>
                <button
                  className={NAV_SECTION_ACTION_BUTTON_CLASS}
                  type="button"
                  aria-label="Sort workspaces"
                  title="Sort (coming soon)"
                >
                  <ArrowDownUp size={13} strokeWidth={1.9} />
                </button>
                <button
                  className={NAV_SECTION_ACTION_BUTTON_CLASS}
                  type="button"
                  aria-label="New workspace folder"
                  title="New folder (coming soon)"
                >
                  <FolderPlus size={13} strokeWidth={1.9} />
                </button>
              </>
            }
          />

          {workspacesCollapsed
            ? null
            : workspaceGroups.map((group) => (
                <WorkspaceSection
                  key={group.key}
                  group={group}
                  activeSessionId={activeSessionId}
                  busySessionIds={busyIds}
                  onSelectSession={handleSelectChatSession}
                  onNewSession={handleNewAgent}
                  onTogglePin={onTogglePin}
                  onArchive={onArchive}
                />
              ))}
        </section>
      </nav>

      <button
        className={SETTINGS_ENTRY_CLASS}
        type="button"
      >
        <Settings size={14} strokeWidth={1.9} />
        Settings
      </button>
    </aside>
  );
}

type WorkspaceSectionProps = {
  group: WorkspaceGroup;
  activeSessionId: string | null;
  busySessionIds: Set<string>;
  onSelectSession?: (sessionId: string) => void;
  onNewSession?: () => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  onArchive?: (sessionId: string) => void;
};

function WorkspaceSection({
  group,
  activeSessionId,
  busySessionIds,
  onSelectSession,
  onNewSession,
  onTogglePin,
  onArchive,
}: WorkspaceSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className={`nav-section nav-section-workspace ${WORKSPACE_SECTION_CLASS}${collapsed ? " is-collapsed" : " is-expanded"}`}>
      <div className={`nav-section-title ${NAV_SECTION_TITLE_CLASS} ${WORKSPACE_TITLE_ROW_CLASS}`}>
        <button
          className={WORKSPACE_ICON_SLOT_CLASS}
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
          aria-expanded={!collapsed}
        >
          <Folder size={13} strokeWidth={1.9} className={WORKSPACE_FOLDER_GLYPH_CLASS} aria-hidden="true" />
          {collapsed
            ? <ChevronRight size={13} strokeWidth={1.9} className={WORKSPACE_CHEVRON_GLYPH_CLASS} aria-hidden="true" />
            : <ChevronDown size={13} strokeWidth={1.9} className={WORKSPACE_CHEVRON_GLYPH_CLASS} aria-hidden="true" />}
        </button>
        <button
          className={`nav-section-label ${WORKSPACE_LABEL_CLASS}`}
          type="button"
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className={WORKSPACE_NAME_CLASS}>{group.label}</span>
        </button>
        <div className={`nav-section-actions workspace-folder-actions ${WORKSPACE_ACTIONS_CLASS}`} aria-label="Workspace actions">
          <button
            className={WORKSPACE_ADD_BUTTON_CLASS}
            type="button"
            aria-label="New chat in workspace"
            title="New chat in this workspace"
            onClick={(event) => {
              event.stopPropagation();
              onNewSession?.();
            }}
          >
            <Plus size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
      {collapsed ? null : (
        <CollapsibleSessionList
          sessions={group.sessions}
          activeSessionId={activeSessionId}
          busySessionIds={busySessionIds}
          onSelectSession={onSelectSession}
          onTogglePin={onTogglePin}
          onArchive={onArchive}
          groupKey={group.key}
        />
      )}
    </section>
  );
}
