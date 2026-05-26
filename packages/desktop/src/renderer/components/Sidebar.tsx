import { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  MoreHorizontal,
  PanelLeft,
  Pin,
  PinOff,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import type { SessionListItem } from "@actspace/shared";

export type SidebarView = "chat" | "lab" | "usage";

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

type SessionRowProps = {
  session: SessionListItem;
  isActive: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onTogglePin?: () => void;
};

function SessionRow({ session, isActive, isBusy, onSelect, onTogglePin }: SessionRowProps) {
  const showDot = isActive || isBusy;
  const dotClass = isActive ? "session-status-dot is-active" : "session-status-dot is-busy";

  return (
    <div
      className={`session-row${isActive ? " is-active" : ""}${isBusy ? " is-busy" : ""}`}
      role="presentation"
    >
      <button
        className="session-row-main"
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "page" : undefined}
      >
        <span
          className={`session-row-marker${showDot ? " is-visible" : ""}`}
          aria-hidden={!showDot}
        >
          {showDot ? <span className={dotClass} aria-hidden="true" /> : null}
        </span>
        <span className="session-row-title">{formatSessionTitle(session.title)}</span>
        <span className="session-row-time" aria-hidden={isActive}>{formatRelativeTime(session.updatedAt)}</span>
      </button>
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
          {session.pinned ? <PinOff size={12} strokeWidth={1.9} /> : <Pin size={12} strokeWidth={1.9} />}
        </button>
      ) : null}
    </div>
  );
}

type CollapsibleSessionListProps = {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  busySessionIds: Set<string>;
  onSelectSession?: (sessionId: string) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  groupKey: string;
};

function CollapsibleSessionList({
  sessions,
  activeSessionId,
  busySessionIds,
  onSelectSession,
  onTogglePin,
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
  onToggleMode,
  onNewSession,
  onSelectSession,
  onTogglePin,
  onSelectView,
  onOpenSearch,
}: {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  mode: "expanded" | "rail";
  view: SidebarView;
  busySessionIds?: Set<string>;
  onToggleMode: () => void;
  onNewSession?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  onSelectView?: (next: SidebarView) => void;
  onOpenSearch?: () => void;
}) {
  const compact = mode === "rail";
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

  const handleNewAgent = () => {
    onSelectView?.("chat");
    onNewSession?.();
  };

  const handleSelectChatSession = (sessionId: string) => {
    onSelectView?.("chat");
    onSelectSession?.(sessionId);
  };

  return (
    <aside className={`sidebar${compact ? " is-rail" : ""}`}>
      <div className="sidebar-chrome-row">
        <button
          className="sidebar-mode-button"
          type="button"
          aria-label={compact ? "Expand session sidebar" : "Collapse session sidebar"}
          title={compact ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleMode}
        >
          <PanelLeft size={15} strokeWidth={1.8} />
        </button>
        <button
          className="sidebar-chrome-button"
          type="button"
          aria-label="Search sessions"
          title="Search"
          onClick={onOpenSearch}
        >
          <Search size={14} strokeWidth={1.8} />
        </button>
      </div>

      <div className="sidebar-primary-actions">
        <button
          className={`sidebar-primary-action${view === "chat" ? " is-active" : ""}`}
          type="button"
          aria-label={compact ? "New Agent" : undefined}
          onClick={handleNewAgent}
        >
          <SquarePen size={14} strokeWidth={1.9} />
          {compact ? null : (
            <>
              <span className="sidebar-primary-action-label">New Agent</span>
              <span className="sidebar-primary-action-shortcut" aria-hidden="true">⌘N</span>
            </>
          )}
        </button>
        <button
          className={`sidebar-primary-action${view === "lab" ? " is-active" : ""}`}
          type="button"
          aria-label={compact ? "Lab" : undefined}
          onClick={() => onSelectView?.("lab")}
        >
          <FlaskConical size={14} strokeWidth={1.9} />
          {compact ? null : <span className="sidebar-primary-action-label">Lab</span>}
        </button>
        <button
          className={`sidebar-primary-action${view === "usage" ? " is-active" : ""}`}
          type="button"
          aria-label={compact ? "Usage" : undefined}
          onClick={() => onSelectView?.("usage")}
        >
          <BarChart3 size={14} strokeWidth={1.9} />
          {compact ? null : <span className="sidebar-primary-action-label">Usage</span>}
        </button>
      </div>

      {compact ? <div className="sidebar-rail-spacer" /> : (
        <nav className="session-nav" aria-label="Sessions">
          {pinnedSessions.length > 0 ? (
            <section className="nav-section">
              <div className="nav-section-title">
                <button className="nav-section-label" type="button">
                  <ChevronDown size={12} strokeWidth={1.9} />
                  <span>Pinned</span>
                </button>
              </div>
              <CollapsibleSessionList
                sessions={pinnedSessions}
                activeSessionId={activeSessionId}
                busySessionIds={busyIds}
                onSelectSession={handleSelectChatSession}
                onTogglePin={onTogglePin}
                groupKey="pinned"
              />
            </section>
          ) : null}

          <section className="nav-section">
            <div className="nav-section-title">
              <button className="nav-section-label" type="button">
                <ChevronDown size={12} strokeWidth={1.9} />
                <span>Scheduled</span>
              </button>
              <div className="nav-section-actions" aria-label="Scheduled actions">
                <button type="button" aria-label="More scheduled actions">
                  <MoreHorizontal size={14} strokeWidth={1.9} />
                </button>
                <button type="button" aria-label="New scheduled task">
                  <SquarePen size={13} strokeWidth={1.9} />
                </button>
              </div>
            </div>
            <div className="session-list">
              {MOCK_SCHEDULED.map((item) => (
                <div className="session-row is-muted" key={item.id} role="presentation">
                  <button className="session-row-main" type="button">
                    <span className="session-row-marker" aria-hidden="true" />
                    <span className="session-row-title">{item.title}</span>
                    <span className="session-row-time">{item.hint}</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {workspaceGroups.map((group) => (
            <WorkspaceSection
              key={group.key}
              group={group}
              activeSessionId={activeSessionId}
              busySessionIds={busyIds}
              onSelectSession={handleSelectChatSession}
              onNewSession={handleNewAgent}
              onTogglePin={onTogglePin}
            />
          ))}
        </nav>
      )}

      <button
        className="settings-entry"
        type="button"
        aria-label={compact ? "Settings" : undefined}
      >
        <Settings size={14} strokeWidth={1.9} />
        {compact ? null : "Settings"}
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
};

function WorkspaceSection({
  group,
  activeSessionId,
  busySessionIds,
  onSelectSession,
  onNewSession,
  onTogglePin,
}: WorkspaceSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="nav-section nav-section-workspace">
      <div className="nav-section-title">
        <button
          className="nav-section-label"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed
            ? <ChevronRight size={12} strokeWidth={1.9} />
            : <ChevronDown size={12} strokeWidth={1.9} />}
          <span>{group.label}</span>
        </button>
        <div className="nav-section-actions" aria-label="Workspace actions">
          <button type="button" aria-label="More workspace actions">
            <MoreHorizontal size={14} strokeWidth={1.9} />
          </button>
          <button type="button" aria-label="New chat in workspace" onClick={onNewSession}>
            <SquarePen size={13} strokeWidth={1.9} />
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
          groupKey={group.key}
        />
      )}
    </section>
  );
}
