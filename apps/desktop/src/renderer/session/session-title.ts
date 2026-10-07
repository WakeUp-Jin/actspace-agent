import type { SessionListItem, SessionRecord } from "@actspace/shared";

/**
 * 会话标题：优先列表项，再取 record，把 `Session foo-bar` / `session-foo-bar` 规整为 `Foo bar`（14 T2 从 App 迁出）。
 * 列表在重命名和 `session-title-updated` 后刷新，比 cell 里的快照元数据新；T10 前 App 用列表标题回写 record，效果相同。
 */
export function getSessionTitle(sessionRecord: SessionRecord | null, sessions: SessionListItem[], sessionId: string | null): string {
  const selected = sessionId === null ? null : sessions.find((session) => session.id === sessionId);
  const rawTitle = selected?.title ?? sessionRecord?.meta.title ?? "新建会话";
  const normalized = rawTitle.replace(/^Session\s+/i, "").replace(/^session-/i, "");
  if (normalized === rawTitle) {
    return rawTitle;
  }

  return normalized
    .split("-")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}
