import { ChevronDown, ChevronLeft, ChevronRight, Edit3, Search, Settings } from "lucide-react";
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
  onToggleMode
}: {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  mode: "expanded" | "rail";
  onToggleMode: () => void;
}) {
  const compact = mode === "rail";

  return (
    <aside className={`sidebar${compact ? " is-rail" : ""}`}>
      <div className="brand-lockup">
        <div className="brand-symbol" aria-hidden="true">
          <span />
        </div>
        {compact ? null : <div className="brand-wordmark">actspace</div>}
        <button
          className="sidebar-mode-button"
          type="button"
          aria-label={compact ? "Expand session sidebar" : "Collapse session sidebar"}
          title={compact ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleMode}
        >
          {compact ? <ChevronRight size={15} strokeWidth={2.2} /> : <ChevronLeft size={15} strokeWidth={2.2} />}
        </button>
      </div>

      <div className="sidebar-actions">
        <button className="new-chat-button" type="button" aria-label={compact ? "New chat" : undefined}>
          <Edit3 size={17} strokeWidth={2.1} />
          {compact ? null : "New chat"}
        </button>
        <button className="sidebar-icon-button" type="button" aria-label="Search">
          <Search size={15} strokeWidth={2.2} />
          {compact ? null : "Search"}
        </button>
      </div>

      {compact ? <div className="sidebar-rail-spacer" /> : <nav className="session-nav" aria-label="Sessions">
        <section className="nav-section">
          <button className="nav-section-title" type="button">
            <span>Session</span>
            <ChevronDown size={14} strokeWidth={2.2} />
          </button>
          <div className="session-list">
            {sessions.map((session) => (
              <button
                className={`session-row${session.id === activeSessionId ? " is-active" : ""}`}
                key={session.id}
                type="button"
              >
                <strong>{formatSessionTitle(session.title)}</strong>
                <span>{formatRelativeTime(session.updatedAt)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="nav-section">
          <button className="nav-section-title" type="button">
            <span>Scheduled</span>
            <ChevronDown size={14} strokeWidth={2.2} />
          </button>
          <button className="session-row muted-row" type="button">
            <strong>Weekly context audit</strong>
            <span>Tomorrow</span>
          </button>
        </section>
      </nav>}

      <button className="settings-entry" type="button" aria-label={compact ? "Settings" : undefined}>
        <Settings size={15} strokeWidth={2.1} />
        {compact ? null : "Settings"}
      </button>
    </aside>
  );
}
