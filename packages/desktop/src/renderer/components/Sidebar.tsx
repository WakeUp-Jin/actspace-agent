import { ChevronDown, MoreHorizontal, PanelLeft, Search, Settings, SquarePen } from "lucide-react";
import type { SessionListItem } from "@actspace/shared";

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
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

export function Sidebar({
  sessions,
  activeSessionId,
  mode,
  onToggleMode,
  onNewSession,
}: {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  mode: "expanded" | "rail";
  onToggleMode: () => void;
  onNewSession?: () => void;
}) {
  const compact = mode === "rail";

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
      </div>

      <div className="sidebar-actions">
        <button
          className="new-chat-button"
          type="button"
          aria-label={compact ? "New chat" : undefined}
          onClick={onNewSession}
        >
          <SquarePen size={14} strokeWidth={1.9} />
          {compact ? null : "New chat"}
        </button>
        <button className="sidebar-icon-button" type="button" aria-label="Search">
          <Search size={14} strokeWidth={1.9} />
          {compact ? null : "Search"}
        </button>
      </div>

      {compact ? <div className="sidebar-rail-spacer" /> : <nav className="session-nav" aria-label="Sessions">
        <section className="nav-section">
          <div className="nav-section-title">
            <button className="nav-section-label" type="button">
              <span>Chats</span>
              <ChevronDown size={12} strokeWidth={1.9} />
            </button>
            <div className="nav-section-actions" aria-label="Chat actions">
              <button type="button" aria-label="More chat actions">
                <MoreHorizontal size={14} strokeWidth={1.9} />
              </button>
              <button type="button" aria-label="New chat" onClick={onNewSession}>
                <SquarePen size={13} strokeWidth={1.9} />
              </button>
            </div>
          </div>
          <div className="session-list">
            {sessions.map((session) => (
              <button
                className={`session-row${session.id === activeSessionId ? " is-active" : ""}`}
                key={session.id}
                type="button"
              >
                <strong>{formatSessionTitle(session.title)}</strong>
                {session.id === activeSessionId ? (
                  <span className="session-status-dot" aria-label="Active session" />
                ) : (
                  <span>{formatRelativeTime(session.updatedAt)}</span>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="nav-section">
          <div className="nav-section-title">
            <button className="nav-section-label" type="button">
              <span>Scheduled</span>
              <ChevronDown size={12} strokeWidth={1.9} />
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
          <button className="session-row muted-row" type="button">
            <strong>Weekly context audit</strong>
            <span>Tomorrow</span>
          </button>
        </section>
      </nav>}

      <button className="settings-entry" type="button" aria-label={compact ? "Settings" : undefined}>
        <Settings size={14} strokeWidth={1.9} />
        {compact ? null : "Settings"}
      </button>
    </aside>
  );
}
