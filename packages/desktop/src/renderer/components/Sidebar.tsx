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
    <div className="nav-section-title">
      <button
        className="nav-section-label"
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span>{label}</span>
      </button>
      <div className="nav-section-actions">
        {extraActions}
        <button
          className="nav-section-chevron"
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
    ? "session-status-dot is-active"
    : isBusy
      ? "session-status-dot is-busy"
      : "session-status-dot is-muted";

  return (
    <div
      className={`session-row${isActive ? " is-active" : ""}${isBusy ? " is-busy" : ""}${session.pinned ? " is-pinned" : ""}`}
      role="presentation"
    >
      <span className="session-row-marker">
        <span className={dotClass} aria-hidden="true" />
        {onTogglePin ? (
          <button
            className={`session-row-pin${session.pinned ? " is-active" : ""}`}
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
        className="session-row-main"
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="session-row-title">{formatSessionTitle(session.title)}</span>
        <span className="session-row-time" aria-hidden={isActive}>{formatRelativeTime(session.updatedAt)}</span>
      </button>
      <div className="session-row-actions">
        <button
          className="session-row-archive"
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
    <div className="session-list" data-group-key={groupKey}>
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
          className="session-list-toggle"
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
    <aside className="sidebar">
      <div className="sidebar-primary-actions">
        <button
          className={`sidebar-primary-action${view === "chat" ? " is-active" : ""}`}
          type="button"
          onClick={handleNewAgent}
        >
          <SquarePen size={14} strokeWidth={1.9} />
          <span className="sidebar-primary-action-label">New Agent</span>
          <span className="sidebar-primary-action-shortcut" aria-hidden="true">⌘N</span>
        </button>
        <button
          className={`sidebar-primary-action${view === "lab" ? " is-active" : ""}`}
          type="button"
          onClick={() => onSelectView?.("lab")}
        >
          <FlaskConical size={14} strokeWidth={1.9} />
          <span className="sidebar-primary-action-label">Lab</span>
        </button>
        <button
          className={`sidebar-primary-action${view === "usage" ? " is-active" : ""}`}
          type="button"
          onClick={() => onSelectView?.("usage")}
        >
          <BarChart3 size={14} strokeWidth={1.9} />
          <span className="sidebar-primary-action-label">Usage</span>
        </button>
        <button
          className={`sidebar-primary-action${view === "kairos" ? " is-active" : ""}`}
          type="button"
          onClick={() => onSelectView?.("kairos")}
        >
          <Sparkles size={14} strokeWidth={1.9} />
          <span className="sidebar-primary-action-label">Kairos</span>
        </button>
      </div>

      <nav className="session-nav" aria-label="Sessions">
        {pinnedSessions.length > 0 ? (
          <section className="nav-section">
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

        <section className="nav-section">
          <NavSectionHeader
            label="Scheduled"
            collapsed={scheduledCollapsed}
            onToggle={() => setScheduledCollapsed((value) => !value)}
            extraActions={
              <>
                <button type="button" aria-label="More scheduled actions">
                  <MoreHorizontal size={14} strokeWidth={1.9} />
                </button>
                <button type="button" aria-label="New scheduled task">
                  <SquarePen size={13} strokeWidth={1.9} />
                </button>
              </>
            }
          />
          {scheduledCollapsed ? null : (
            <div className="session-list">
              {MOCK_SCHEDULED.map((item) => (
                <div className="session-row is-muted" key={item.id} role="presentation">
                  <span className="session-row-marker">
                    <span className="session-status-dot is-muted" aria-hidden="true" />
                  </span>
                  <button className="session-row-main" type="button">
                    <span className="session-row-title">{item.title}</span>
                    <span className="session-row-time">{item.hint}</span>
                  </button>
                  <div className="session-row-actions" />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="nav-section nav-section-workspaces">
          <NavSectionHeader
            label="Workspaces"
            collapsed={workspacesCollapsed}
            onToggle={() => setWorkspacesCollapsed((value) => !value)}
            extraActions={
              <>
                <button
                  type="button"
                  aria-label="Sort workspaces"
                  title="Sort (coming soon)"
                >
                  <ArrowDownUp size={13} strokeWidth={1.9} />
                </button>
                <button
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
        className="settings-entry"
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
    <section className={`nav-section nav-section-workspace${collapsed ? " is-collapsed" : " is-expanded"}`}>
      <div className="nav-section-title workspace-folder-row">
        <button
          className="workspace-icon-slot"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
          aria-expanded={!collapsed}
        >
          <Folder size={13} strokeWidth={1.9} className="workspace-folder-glyph" aria-hidden="true" />
          {collapsed
            ? <ChevronRight size={13} strokeWidth={1.9} className="workspace-chevron-glyph" aria-hidden="true" />
            : <ChevronDown size={13} strokeWidth={1.9} className="workspace-chevron-glyph" aria-hidden="true" />}
        </button>
        <button
          className="nav-section-label workspace-folder-label"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className="workspace-folder-name">{group.label}</span>
        </button>
        <div className="nav-section-actions workspace-folder-actions" aria-label="Workspace actions">
          <button
            className="workspace-add-button"
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
