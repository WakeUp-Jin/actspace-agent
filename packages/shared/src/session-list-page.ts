import type { SessionListItem, SessionListPage, SessionListPageInput } from './ipc';
import type { RuntimeV2BrowseList } from './runtime-v2';

/** Parent of a side chat, read from Session lineage; undefined for every other Session. */
export function sideChatParentId(lineage: unknown): string | undefined {
  if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) return undefined;
  const value = lineage as { origin?: unknown; parentSessionId?: unknown };
  return value.origin === 'side-chat' && typeof value.parentSessionId === 'string' ? value.parentSessionId : undefined;
}

/** Side chats stay out of the page and only show up as their parent's count. */
export function paginateSessionSummaries(result: RuntimeV2BrowseList, input: SessionListPageInput): SessionListPage {
  const grouped = new Map<string, SessionListItem[]>();
  const sideChatCounts = new Map<string, number>();
  for (const item of result.items) {
    const parent = sideChatParentId(item.lineage);
    if (parent !== undefined && !item.metadata.archived) sideChatCounts.set(parent, (sideChatCounts.get(parent) ?? 0) + 1);
  }
  const sorted = [...result.items].filter(s => !s.metadata.archived && sideChatParentId(s.lineage) === undefined).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.sessionId.localeCompare(b.sessionId));
  for (const item of sorted) {
    const key = JSON.stringify([item.worktree?.sourceWorkspaceRoot ?? item.workspaceRoot ?? '', item.metadata.pinned]);
    const group = grouped.get(key) ?? [];
    group.push({ id: item.sessionId, title: item.metadata.title ?? 'New chat', updatedAt: item.updatedAt, workspaceRoot: item.workspaceRoot ?? undefined, ...(item.worktree ? { worktree: item.worktree } : {}), pinned: item.metadata.pinned, archived: false, accessState: item.accessState, isChildSession: item.lineage !== null, agentRunCount: item.completedTurnCount ?? 0, ...(sideChatCounts.get(item.sessionId) ? { sideChatCount: sideChatCounts.get(item.sessionId) } : {}) });
    grouped.set(key, group);
  }
  const groups: SessionListPage['groups'] = [];
  const items: SessionListItem[] = [];
  for (const group of grouped.values()) {
    const workspaceRoot = group[0]!.worktree?.sourceWorkspaceRoot ?? group[0]!.workspaceRoot ?? '';
    const pinned = group[0]!.pinned === true;
    if (input.workspaceRoot !== undefined && workspaceRoot !== input.workspaceRoot) continue;
    if (input.pinned !== undefined && pinned !== input.pinned) continue;
    const start = input.after ? Math.max(0, group.findIndex(s => s.id === input.after) + 1) : 0;
    items.push(...group.slice(start, start + 10));
    groups.push({ workspaceRoot, pinned, hasMore: group.length > start + 10 });
  }
  return { items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), groups, indexing: result.indexing, failed: result.failed };
}
