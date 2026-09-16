import { projectContextState } from "@actspace/shared";
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from '@actspace/session-journal';
import { projectSessionSnapshot } from '../projection/durable-session.js';
import { SessionBrowseIndex } from './session-browse-index.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(turns = 25) {
  const root = await mkdtemp(join(tmpdir(), 'actspace-browse-')); roots.push(root);
  const registry = createCoreCodecRegistry();
  const header = createSessionHeader({ sessionId: 's', createdAt: '2026-09-15T00:00:00Z', cwd: '/workspace', lineage: null, createdWith: { profileId: 'test', runtimeContractVersion: '1', manifestDigest: 'test', plugins: [], codecSetDigest: registry.digest } });
  const journal = new SessionJournal({ registry });
  const append = (type: string, data: any, surface: any = null, provenance?: any) => journal.append({ type, eventVersion: 1, source: { ownerPluginId: '@actspace/core' }, data, surface, ...(provenance ? { provenance } : {}) });
  const turn = (n: number) => {
    append('agent/inbox/spliced', { operation: 'enqueue', messageId: `u${n}`, target: 'next-turn' });
    append('agent/inbox/spliced', { operation: 'claim', messageId: `u${n}`, target: 'next-turn' }, { kind: 'append', node: { kind: 'user', messageId: `u${n}`, content: `question ${n}` } }, { sourceEventSeqs: [journal.events.length - 1], contributorIds: [], runtimeSelectionSeq: null });
    append('turn/start', { turnId: `t${n}` });
    append('assistant/message', { messageId: `a${n}`, content: `answer ${n}` }, { kind: 'append', node: { kind: 'assistant', messageId: `a${n}`, content: `answer ${n}` } });
    append('turn/end', { turnId: `t${n}` });
  };
  for (let n = 0; n < turns; n++) turn(n);
  await mkdir(join(root, 'sessions-v2', 's'), { recursive: true });
  const path = join(root, 'sessions-v2', 's', 'journal.jsonl');
  const save = () => writeFile(path, [header, ...journal.events].map(e => JSON.stringify(e)).join('\n') + '\n');
  await save();
  const source = vi.fn(async () => ({ snapshot: projectSessionSnapshot({ header, events: journal.events, registry }), journal: journal.events, profileId: 'test' }));
  return { root, path, source, turn, save, append, journal };
}
describe('session browsing read model', () => {
  it('loads 10 complete turns and earlier pages without reopening the full journal, including inbox user messages', async () => {
    const f = await fixture(); const index = new SessionBrowseIndex(f.root, f.source);
    const latest = await index.page('s');
    expect(latest.snapshot.messages.map(m => m.messageId)).toEqual(Array.from({ length: 10 }, (_, i) => [`u${i + 15}`, `a${i + 15}`]).flat());
    const earlier = await index.page('s', latest.history.before!);
    const first = await index.page('s', earlier.history.before!);
    expect(earlier.snapshot.messages).toHaveLength(20); expect(first.snapshot.messages).toHaveLength(10);
    expect(first.history.before).toBeNull(); expect(f.source).toHaveBeenCalledTimes(1);
    const restarted = new SessionBrowseIndex(f.root, f.source);
    expect((await restarted.cached('s'))?.item.completedTurnCount).toBe(25);
    await restarted.page('s'); expect(f.source).toHaveBeenCalledTimes(1);
    expect((await readFile(f.path, 'utf8')).split('\n')).toHaveLength(127);
  });
  it('rebuilds on append and rejects invalid cursors and path traversal', async () => {
    const f = await fixture(1); const index = new SessionBrowseIndex(f.root, f.source);
    await index.page('s'); f.turn(1); await f.save();
    expect(await index.cached('s')).toBeNull();
    expect((await index.page('s')).snapshot.activity.completedTurnCount).toBe(2);
    expect(f.source).toHaveBeenCalledTimes(2);
    expect((await readdir(join(f.root, 'sessions-v2', 's'))).filter(n => /^browse-.*jsonl$/.test(n))).toHaveLength(1);
    await expect(index.page('s', -1)).rejects.toThrow('cursor');
    await expect(index.page('../escape')).rejects.toThrow('Invalid session');
  });
  it('deduplicates concurrent cache reconstruction', async () => {
    const f = await fixture(); const index = new SessionBrowseIndex(f.root, f.source);
    await Promise.all([index.page('s'), index.page('s'), index.ensure('s')]);
    expect(f.source).toHaveBeenCalledTimes(1);
  });
  it('keeps oversized tool results out of the initial page and reads them on demand', async () => {
    const f = await fixture(1);
    f.append('turn/start', { turnId: 'large' });
    f.append('step/start', { turnId: 'large', stepId: 'large-step' });
    f.append('tool/call', { callId: 'large-call', name: 'read_file', args: { path: 'large.txt' } });
    const content = 'large output '.repeat(30000);
    f.append('tool/result', { callId: 'large-call', name: 'read_file', status: 'completed', summary: 'Read large file', modelOutput: [{ type: 'text', text: content }], detail: [], artifacts: [] }, { kind: 'append', node: { kind: 'tool-result', messageId: 'large-result', callId: 'large-call', isError: false, content } });
    f.append('step/end', { turnId: 'large', stepId: 'large-step' });
    f.append('turn/end', { turnId: 'large' }); await f.save();
    const index = new SessionBrowseIndex(f.root, f.source);
    const page = await index.page('s');
    expect(page.deferredToolCalls).toEqual(['large-call']);
    expect(JSON.stringify(page).length).toBeLessThan(30000);
    const detail = await index.detail('s', 'large-call');
    expect(JSON.stringify(detail)).toContain(content);
    expect(f.source).toHaveBeenCalledTimes(1);
  });

  it('preserves complete context statistics across truncation, older pages and cold cache reuse', async () => {
    const f = await fixture(25);
    f.append('turn/start', { turnId: 'context-turn' });
    f.append('step/start', { turnId: 'context-turn', stepId: 'context-step' });
    f.append('request/header', { requestId: 'long-context', turnId: 'context-turn', stepId: 'context-step' });
    f.append('request/context', { requestId: 'long-context', turnId: 'context-turn', stepId: 'context-step', snapshot: {
      prepared: { contextWindow: 1000000 }, systemSections: ['s'.repeat(8000)],
      messages: Array.from({ length: 52 }, () => ({ role: 'user', content: '中'.repeat(2000) })),
    } });
    await f.save();
    const original = await f.source();
    const full = projectContextState(original.snapshot, original.journal);
    const index = new SessionBrowseIndex(f.root, f.source);
    const page = await index.page('s');
    const state = projectContextState(page.snapshot, page.journal);
    expect(state.totalEstimatedTokens).toBe(106000);
    expect(state.buckets).toEqual(full.buckets);
    expect(state.entries).toHaveLength(53);
    expect(state.entries.every(e => (e.preview?.length ?? 0) <= 1000)).toBe(true);
    const older = await index.page('s', page.history.before!);
    expect(projectContextState(older.snapshot, older.journal)).toEqual(state);
    const restarted = new SessionBrowseIndex(f.root, f.source);
    const restored = await restarted.page('s');
    expect(projectContextState(restored.snapshot, restored.journal)).toEqual(state);
    const path = join(f.root, 'sessions-v2', 's', 'browse-index.json');
    const obsolete = JSON.parse(await readFile(path, 'utf8'));
    obsolete.version = 1;
    await writeFile(path, JSON.stringify(obsolete));
    f.source.mockClear();
    await new SessionBrowseIndex(f.root, f.source).page('s');
    expect(f.source).toHaveBeenCalledTimes(1);
  });

  it('rebuilds a missing page file without treating it as an empty conversation', async () => {
    const f = await fixture(12); const index = new SessionBrowseIndex(f.root, f.source);
    await index.page('s');
    const dir = join(f.root, 'sessions-v2', 's');
    const file = (await readdir(dir)).find(name => /^browse-.*jsonl$/.test(name))!;
    await rm(join(dir, file));
    const page = await index.page('s');
    expect(page.snapshot.messages).toHaveLength(20);
    expect(f.source).toHaveBeenCalledTimes(2);
  });

});
