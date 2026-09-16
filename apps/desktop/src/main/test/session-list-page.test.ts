// @vitest-environment node
import { expect, it } from 'vitest';
import { paginateSessionSummaries } from '../runtime-v2/session-list-page';
import type { RuntimeV2BrowseList } from '@actspace/shared/runtime-v2';
it('returns ten summaries per workspace and loads only the requested next page', () => {
  const result: RuntimeV2BrowseList = { indexing: false, failed: 0, items: Array.from({ length: 46 }, (_, i) => ({ sessionId: `s${i}`, createdAt: '', updatedAt: new Date(2026, 0, 1, 0, i).toISOString(), workspaceRoot: i < 23 ? '/a' : '/b', profileId: 'test', accessState: 'read-write', metadata: { title: `Session ${i}`, pinned: false, archived: false }, lineage: null, completedTurnCount: i })) };
  const first = paginateSessionSummaries(result, {});
  expect(first.items).toHaveLength(20); expect(first.groups.every(g => g.hasMore)).toBe(true);
  const after = first.items.filter(s => s.workspaceRoot === '/a').at(-1)!.id;
  const next = paginateSessionSummaries(result, { workspaceRoot: '/a', pinned: false, after });
  expect(next.items).toHaveLength(10); expect(next.items.every(s => s.workspaceRoot === '/a')).toBe(true);
  expect(next.items.some(s => first.items.some(f => f.id === s.id))).toBe(false);
  const last = paginateSessionSummaries(result, { workspaceRoot: '/a', after: next.items.at(-1)!.id });
  expect(last.items).toHaveLength(3); expect(last.groups[0]!.hasMore).toBe(false);
});
