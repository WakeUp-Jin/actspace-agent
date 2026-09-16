import { projectContextState } from "@actspace/shared";
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SessionEventEnvelopeV1 } from '@actspace/session-journal';
import type { RuntimeV2SessionListItem, RuntimeV2SessionSnapshot } from '@actspace/shared/runtime-v2';

export type BrowseHistory = { before: number | null; throughJournalSeq: number };
export type BrowsePage = { deferredToolCalls?: string[]; snapshot: RuntimeV2SessionSnapshot; journal: readonly SessionEventEnvelopeV1[]; history: BrowseHistory };
type Index = { version: 2; stamp: string; item: RuntimeV2SessionListItem; snapshot: RuntimeV2SessionSnapshot; details: Record<string, { offset: number; length: number }>; pages: { offset: number; length: number; from: number }[] };
type Source = { snapshot: RuntimeV2SessionSnapshot; journal: readonly SessionEventEnvelopeV1[]; profileId: string };

/** Disposable read model. Never used for agent recovery or model context. */
export class SessionBrowseIndex {
  private pending = new Map<string, Promise<Index>>();
  private cache = new Map<string, Index>();
  private dirty = new Set<string>();
  private revisions = new Map<string, number>();
  invalidate(id: string) { this.dirty.add(id); this.cache.delete(id); this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1); }
  async idle() { await Promise.allSettled([...this.pending.values()]); }
  constructor(private root: string, private readSource: (id: string) => Promise<Source>, private codecDigest = '') {}
  private paths(id: string) {
    if (!id || id === '.' || id === '..' || /[/\\]/.test(id)) throw new Error('Invalid session id');
    const root = join(this.root, 'sessions-v2', id);
    return { root, journal: join(root, 'journal.jsonl'), index: join(root, 'browse-index.json') };
  }
  private async stamp(id: string) { const s = await stat(this.paths(id).journal); return `${this.codecDigest}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`; }
  async cached(id: string): Promise<Index | null> {
    try {
      if (this.dirty.has(id)) return null;
      const stamp = await this.stamp(id);
      let index = this.cache.get(id);
      if (!index) index = JSON.parse(await readFile(this.paths(id).index, 'utf8')) as Index;
      if (index.version !== 2 || index.stamp !== stamp || index.item.sessionId !== id || !index.details || !Array.isArray(index.pages)) return null;
      this.remember(id, index);
      return index;
    } catch { return null; }
  }
  private remember(id: string, index: Index) {
    this.cache.delete(id); this.cache.set(id, index);
    while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
  }
  async ensure(id: string): Promise<Index> {
    const cached = await this.cached(id); if (cached) return cached;
    const pending = this.pending.get(id); if (pending) return pending;
    const job = this.build(id).finally(() => this.pending.delete(id));
    this.pending.set(id, job); return job;
  }
  private async build(id: string): Promise<Index> {
    const revision = this.revisions.get(id) ?? 0;
    const stamp = await this.stamp(id);
    const { snapshot, journal, profileId } = await this.readSource(id);
    const starts = journal.filter(e => e.type === 'turn/start').map(event => {
      let start = event.seq;
      for (let i = event.seq - 1; i >= 0; i--) {
        const prior = journal[i]!;
        if (prior.type === 'turn/end' || prior.type === 'turn/start') break;
        if (prior.surface?.kind === 'append' && prior.surface.node.kind === 'user') start = prior.seq;
      }
      return start;
    });
    const boundaries = starts.length ? [0, ...starts.slice(1)] : [0];
    const latestContext = [...journal].reverse().find(event => event.type === 'request/context');
    const latestHeader = [...journal].reverse().find(event => event.type === 'request/header');
    const contextData = latestContext?.data;
    const contextValue = contextData && typeof contextData === 'object' && 'snapshot' in contextData ? contextData.snapshot : contextData ?? null;
    const contextState = projectContextState(snapshot, journal);
    // Preserve all counters and identities; only entry previews are shortened.
    const browseContextState = { ...contextState, entries: contextState.entries.map(entry => ({ ...entry, preview: entry.preview?.slice(0, 1000) })) };
    const boundedContext = latestContext ? { ...trimDetail(latestContext), data: { ...(trimDetail(contextData) as Record<string, import('@actspace/shared/runtime-v2').RuntimeV2JsonValue>), snapshot: trimDetail(contextValue), browseEstimatedTokens: contextState.totalEstimatedTokens, browseContextState: JSON.parse(JSON.stringify(browseContextState)) } } : undefined;
    const support = [boundedContext, latestHeader].filter((e): e is SessionEventEnvelopeV1 => e !== undefined);
    const pages: Index['pages'] = [];
    const details: Index['details'] = Object.create(null);
    const deferredTools = new Map<string, { events: SessionEventEnvelopeV1[]; tool: RuntimeV2SessionSnapshot['tools'][number] }>();
    const eventsByCall = new Map<string, SessionEventEnvelopeV1[]>();
    for (const event of journal) {
      const callId = event.data && typeof event.data === 'object' && 'callId' in event.data ? event.data.callId : undefined;
      if (typeof callId === 'string') { const events = eventsByCall.get(callId) ?? []; events.push(event); eventsByCall.set(callId, events); }
    }
    for (const tool of snapshot.tools) {
      const events = eventsByCall.get(tool.callId) ?? [];
      if (JSON.stringify(events).length < 24_000 && JSON.stringify(tool).length < 24_000) continue;
      deferredTools.set(tool.callId, { events, tool });
    }
    const paths = this.paths(id);
    const stampName = createHash('sha256').update(stamp).digest('hex').slice(0, 16);
    const dataPath = join(paths.root, `browse-${stampName}.jsonl`);
    const temporary = `${dataPath}.tmp`;
    await mkdir(paths.root, { recursive: true });
    const file = await open(temporary, 'w');
    let offset = 0;
    try {
      for (const [callId, detail] of deferredTools) {
        const bytes = Buffer.from(JSON.stringify(detail) + '\n');
        await file.write(bytes); details[callId] = { offset, length: bytes.length }; offset += bytes.length;
      }
      for (let end = boundaries.length; end > 0; end -= 10) {
        const first = Math.max(0, end - 10);
        const from = boundaries[first]!;
        const until = boundaries[end] ?? snapshot.throughJournalSeq + 1;
        const events = journal.filter(e => e.seq >= from && e.seq < until && e.type !== 'assistant/chunk' && e.type !== 'request/context');
        // Replacements live later in the Journal but belong at their original surface position.
        for (const e of journal) if (e.surface?.kind === 'replace' && (e.surface.sourceEventSeqs[0] ?? e.seq) >= from && (e.surface.sourceEventSeqs[0] ?? e.seq) < until && !events.includes(e)) events.push(e);
        for (const e of support) if (!events.includes(e)) events.push(e);
        events.sort((a, b) => a.seq - b.seq);
        const messageIds = new Set(events.flatMap(e => e.surface && 'node' in e.surface ? [e.surface.node.messageId] : []));
        const callIds = new Set(events.flatMap(e => e.type === 'tool/call' && e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? [(e.data as Record<string, unknown>).callId] : []));
        const deferredToolCalls = [...callIds].filter((id): id is string => typeof id === 'string' && deferredTools.has(id));
        const pageSnapshot = { ...snapshot, messages: snapshot.messages.filter(m => messageIds.has(m.messageId)).map(m => m.kind === 'tool-result' && m.callId && deferredTools.has(m.callId) ? { ...m, content: '展开查看完整工具结果' } : m), tools: snapshot.tools.filter(t => callIds.has(t.callId)).map(t => deferredTools.has(t.callId) ? trimDetail(t) : t) };
        const boundedEvents = events.map(e => e.data && typeof e.data === 'object' && 'callId' in e.data && typeof e.data.callId === 'string' && deferredTools.has(e.data.callId) ? trimDetail(e) : e);
        const bytes = Buffer.from(JSON.stringify({ snapshot: pageSnapshot, journal: boundedEvents, deferredToolCalls, history: { before: first > 0 ? from : null, throughJournalSeq: snapshot.throughJournalSeq } } satisfies BrowsePage) + '\n');
        await file.write(bytes); pages.push({ offset, length: bytes.length, from }); offset += bytes.length;
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    } finally { await file.close(); }
    await rename(temporary, dataPath);
    const item: RuntimeV2SessionListItem = { sessionId: id, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, workspaceRoot: snapshot.workspaceRoot, profileId, accessState: snapshot.accessState, metadata: snapshot.metadata, lineage: snapshot.lineage, completedTurnCount: snapshot.activity.completedTurnCount };
    const index: Index = { version: 2, stamp, item, snapshot: { ...snapshot, messages: [], tools: [] }, details, pages };
    // A concurrent append must never make an old index look current.
    if (await this.stamp(id) !== stamp || (this.revisions.get(id) ?? 0) !== revision) throw new Error('Session changed while preparing history; retry.');
    await writeFile(`${paths.index}.tmp`, JSON.stringify(index)); await rename(`${paths.index}.tmp`, paths.index);
    this.dirty.delete(id); this.remember(id, index);
    // Retain only this generation; the cache is never a historical archive.
    for (const name of await readdir(paths.root)) {
      if (/^browse-[a-f0-9]{16}\.jsonl$/.test(name) && name !== `browse-${stampName}.jsonl`) await unlink(join(paths.root, name)).catch(() => undefined);
    }
    return index;
  }
  async detail(id: string, callId: string): Promise<BrowsePage> {
    const index = await this.ensure(id);
    const descriptor = Object.hasOwn(index.details, callId) ? index.details[callId] : undefined;
    if (!descriptor) throw new Error('Tool detail is no longer available; reopen the session.');
    const stampName = createHash('sha256').update(index.stamp).digest('hex').slice(0, 16);
    const file = await open(join(this.paths(id).root, `browse-${stampName}.jsonl`), 'r');
    try {
      const size = (await file.stat()).size;
      if (!Number.isSafeInteger(descriptor.offset) || !Number.isSafeInteger(descriptor.length) || descriptor.offset < 0 || descriptor.length < 0 || descriptor.offset + descriptor.length > size) throw new Error('Invalid history cache range');
      const bytes = Buffer.alloc(descriptor.length);
      const result = await file.read(bytes, 0, bytes.length, descriptor.offset);
      if (result.bytesRead !== bytes.length) throw new Error('Incomplete tool detail');
      const detail = JSON.parse(bytes.toString('utf8')) as { events: SessionEventEnvelopeV1[]; tool: RuntimeV2SessionSnapshot['tools'][number] };
      const messages = detail.events.flatMap(e => e.surface && 'node' in e.surface ? [{ ...e.surface.node }] : []);
      return { snapshot: { ...index.snapshot, tools: [detail.tool], messages }, journal: detail.events, history: { before: null, throughJournalSeq: index.snapshot.throughJournalSeq } };
    } finally { await file.close(); }
  }
  async page(id: string, before?: number): Promise<BrowsePage> {
    try { return await this.readPage(id, before); }
    catch (error) {
      if (before !== undefined && (!Number.isSafeInteger(before) || before < 0)) throw error;
      this.paths(id);
      this.invalidate(id);
      return this.readPage(id, before);
    }
  }
  private async readPage(id: string, before?: number): Promise<BrowsePage> {
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 0)) throw new Error('Invalid history cursor');
    const index = await this.ensure(id);
    const descriptor = before === undefined ? index.pages[0] : index.pages.find(p => p.from < before);
    if (!descriptor) return { snapshot: index.snapshot, journal: [], history: { before: null, throughJournalSeq: index.snapshot.throughJournalSeq } };
    const stampName = createHash('sha256').update(index.stamp).digest('hex').slice(0, 16);
    const file = await open(join(this.paths(id).root, `browse-${stampName}.jsonl`), 'r');
    try {
      const size = (await file.stat()).size;
      if (!Number.isSafeInteger(descriptor.offset) || !Number.isSafeInteger(descriptor.length) || descriptor.offset < 0 || descriptor.length < 0 || descriptor.offset + descriptor.length > size) throw new Error('Invalid history cache range');
      const bytes = Buffer.alloc(descriptor.length);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, descriptor.offset);
      if (bytesRead !== bytes.length) throw new Error('Incomplete history cache; retry.');
      return JSON.parse(bytes.toString('utf8')) as BrowsePage;
    } finally { await file.close(); }
  }
}

/** Preserve typed structure and identities while deferring large payload leaves. */
function trimDetail<T>(value: T, key = ''): T {
  if (/^(.*Id|.*Ids|type|kind|path|filePath|name)$/.test(key)) return value;
  if (typeof value === 'string') return (value.length > 1000 ? value.slice(0, 1000) + '…' : value) as T;
  if (Array.isArray(value)) return value.slice(0, 20).map(item => trimDetail(item)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimDetail(v, k)])) as T;
  return value;
}
