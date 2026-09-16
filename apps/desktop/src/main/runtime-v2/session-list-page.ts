import type { SessionListItem, SessionListPage, SessionListPageInput } from '@actspace/shared';
import type { RuntimeV2BrowseList } from '@actspace/shared/runtime-v2';

export function paginateSessionSummaries(result: RuntimeV2BrowseList, input: SessionListPageInput): SessionListPage {
  const grouped = new Map<string, SessionListItem[]>();
  const sorted = [...result.items].filter(s => !s.metadata.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.sessionId.localeCompare(b.sessionId));
  for (const item of sorted) {
    const key = JSON.stringify([item.workspaceRoot ?? '', item.metadata.pinned]);
    const group = grouped.get(key) ?? [];
    group.push({ id: item.sessionId, title: item.metadata.title ?? 'New chat', updatedAt: item.updatedAt, workspaceRoot: item.workspaceRoot ?? undefined, pinned: item.metadata.pinned, archived: false, accessState: item.accessState, isChildSession: item.lineage !== null, agentRunCount: item.completedTurnCount ?? 0 });
    grouped.set(key, group);
  }
  const groups: SessionListPage['groups'] = [];
  const items: SessionListItem[] = [];
  for (const group of grouped.values()) {
    const workspaceRoot = group[0]!.workspaceRoot ?? '';
    const pinned = group[0]!.pinned === true;
    if (input.workspaceRoot !== undefined && workspaceRoot !== input.workspaceRoot) continue;
    if (input.pinned !== undefined && pinned !== input.pinned) continue;
    const start = input.after ? Math.max(0, group.findIndex(s => s.id === input.after) + 1) : 0;
    items.push(...group.slice(start, start + 10));
    groups.push({ workspaceRoot, pinned, hasMore: group.length > start + 10 });
  }
  return { items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), groups, indexing: result.indexing, failed: result.failed };
}
