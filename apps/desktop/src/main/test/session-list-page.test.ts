// @vitest-environment node
import { expect, it } from 'vitest';
import { paginateSessionSummaries } from '../runtime-v2/session-list-page';
import type { RuntimeV2BrowseList } from '@actspace/shared/runtime-v2';
it('keeps forks and unknown historical origins visible, excluding delegation before pagination', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ sessionId: `s${i}`, createdAt: '', updatedAt: String(i).padStart(2, '0'), workspaceRoot: '/a', profileId: 'test', accessState: 'read-write' as const, metadata: { title: 'test', pinned: false, archived: false }, lineage: { origin: i === 11 ? 'delegation' : i === 10 ? 'fork' : 'historical' } }));
  const first = paginateSessionSummaries({ items, indexing: false, failed: 0 }, {});
  expect(first.items.map(s => s.id)).toEqual(['s10', 's9', 's8', 's7', 's6', 's5', 's4', 's3', 's2', 's1']);
  expect(first.items.every(s => !s.isChildSession)).toBe(true);
  expect(first.groups[0]?.hasMore).toBe(true);
  const last = paginateSessionSummaries({ items, indexing: false, failed: 0 }, { after: 's1' });
  expect(last.items.map(s => s.id)).toEqual(['s0']);
  expect(last.groups[0]?.hasMore).toBe(false);
});
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

it('hides side chats from the page and counts them on their parent', () => {
  const base = { createdAt: '', workspaceRoot: '/a', profileId: 'test', accessState: 'read-write' as const, completedTurnCount: 1 };
  const side = (id: string, archived = false) => ({ ...base, sessionId: id, updatedAt: '2026-10-21T02:00:00.000Z', metadata: { title: id, pinned: false, archived }, lineage: { parentSessionId: 'main', parentBoundarySeq: 4, origin: 'side-chat', delegationDepth: 0 } });
  const result: RuntimeV2BrowseList = { indexing: false, failed: 0, items: [
    { ...base, sessionId: 'main', updatedAt: '2026-10-21T01:00:00.000Z', metadata: { title: 'main', pinned: false, archived: false }, lineage: null },
    { ...base, sessionId: 'fork', updatedAt: '2026-10-21T00:00:00.000Z', metadata: { title: 'fork', pinned: false, archived: false }, lineage: { parentSessionId: 'main', parentBoundarySeq: 4, origin: 'fork', delegationDepth: 0 } },
    side('side-1'), side('side-2'), side('side-old', true),
  ] };
  const page = paginateSessionSummaries(result, {});
  expect(page.items.map(item => item.id)).toEqual(['main', 'fork']);
  expect(page.items[0]).toMatchObject({ sideChatCount: 2 });
  expect(page.items[1]).not.toHaveProperty('sideChatCount');
});
