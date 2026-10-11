import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { UsageReadModelService } = require('../dist-electron/main/runtime-v2/usage-read-model.js');

const workerPath = fileURLToPath(new URL('../dist-electron/main/runtime-v2/usage-read-model-worker.js', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'usage-sqlite-test-'));
  const worker = new Worker(workerPath, { workerData: { dataRoot: root } });
  const pending = new Map(); let sequence = 0;
  worker.on('message', reply => {
    const item = pending.get(reply.id); if (!item) return;
    if (reply.heartbeat) { item.timer.refresh(); return; }
    pending.delete(reply.id); clearTimeout(item.timer);
    reply.ok ? item.resolve(reply.result) : item.reject(new Error(reply.error));
  });
  worker.on('error', error => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); });
  t.after(async () => { await worker.terminate(); await rm(root, { recursive: true, force: true }); });
  const send = message => new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Worker timeout')); }, 10_000);
    pending.set(id, { resolve, reject, timer }); worker.postMessage({ ...message, id });
  });
  send.root=root;
  return send;
}
function row(id, sessionId = 's') {
  return { activityId: id, sessionId, kind: 'llm_request', agentRunId: 'run', startedAt: '2026-10-11T00:00:00.000Z', sourceEventSeq: 1, status: 'success', tokens: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 3 }, costUsd: null, relatedEventSeqs: [] };
}
function source(rows, sessionId = 's') { return { sessionId, title: sessionId, throughJournalSeq: 1, rows }; }
function catalog(id, extras = {}) { return { sessionId: id, title: id, revision: 1, createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z', workspaceRoot: '/workspace', pinned: false, archived: false, accessState: 'read-write', isChildSession: false, agentRunCount: 0, ...extras }; }

test('cursor visits every tied activity exactly once across sessions', async t => {
  const send = await fixture(t);
  await send({ type: 'sync', sources: [source([row('a'),row('b')]), source([row('c','t'),row('d','t')],'t')] });
  const ids = []; let cursor;
  do {
    const page = await send({ type: 'query', request: 'activity', input: { range: 'total', requestRowsPage: { limit: 1, cursor } } });
    ids.push(...page.rows.map(row => row.activityId)); cursor = page.rowsPage.nextCursor;
  } while (cursor);
  assert.deepEqual(ids, ['d','c','b','a']);
});

test('multiple chunks for the same session in one message never erase earlier chunks', async t => {
  const send = await fixture(t);
  await send({ type: 'sync', sources: [source([row('a')]), source([row('b')])], replaceSessionIds: ['s'] });
  const page = await send({ type: 'query', request: 'activity', input: { range: 'total' } });
  assert.equal(page.rowsPage.totalRows, 2);
  await send({ type: 'sync', sources: [source([row('c')])], replaceSessionIds: [] });
  const appended = await send({ type: 'query', request: 'activity', input: { range: 'total' } });
  assert.equal(appended.rowsPage.totalRows, 3);
});

test('failed source replacement rolls back previous rows', async t => {
  const send = await fixture(t);
  await send({ type: 'sync', sources: [source([row('original')])] });
  await assert.rejects(send({ type: 'sync', sources: [source([row('duplicate'),row('duplicate')])] }), /UNIQUE/);
  const page = await send({ type: 'query', request: 'activity', input: { range: 'total' } });
  assert.deepEqual(page.rows.map(row => row.activityId), ['original']);
});

test('catalog groups worktrees by source root and pages ties in SQL', async t => {
  const send = await fixture(t);
  const items = Array.from({ length: 25 }, (_, i) => catalog(String(i).padStart(2, '0'), { workspaceRoot: '/isolated', worktree: { sourceWorkspaceRoot: '/workspace' } }));
  await send({ type: 'sync', sources: [], catalog: items, activeSessionIds: items.map(row => row.sessionId) });
  const first = await send({ type: 'query', request: 'sessions', input: { workspaceRoot: '/workspace' } });
  assert.equal(first.items.length, 10); assert.equal(first.groups[0].hasMore, true);
  const next = await send({ type: 'query', request: 'sessions', input: { workspaceRoot: '/workspace', after: first.items.at(-1).id } });
  assert.equal(next.items[0].id, '10'); assert.equal(next.items.length, 10);
  // Usage updates must not wipe catalog metadata.
  await send({ type: 'sync', sources: [source([row('activity','00')],'00')] });
  const preserved = await send({ type: 'query', request: 'sessions', input: { workspaceRoot: '/workspace' } });
  assert.equal(preserved.items[0].worktree.sourceWorkspaceRoot, '/workspace');
  await send({ type: 'sync', sources: [], catalog: [], activeSessionIds: [] });
  const empty = await send({ type: 'query', request: 'sessions', input: {} });
  assert.deepEqual(empty.items, []);
});

for (const failure of ['corrupt','version','application']) {
  test(`service rebuilds ${failure} database before catalog fallback`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'usage-service-test-'));
    await mkdir(join(root, 'runtime-v2'));
    const path = join(root, 'runtime-v2', 'usage-read-model.sqlite');
    if (failure === 'corrupt') await writeFile(path, 'invalid sqlite');
    else {
      const db = new DatabaseSync(path);
      db.exec(failure === 'version' ? 'PRAGMA user_version=999' : 'PRAGMA application_id=123'); db.close();
    }
    const service = new UsageReadModelService({
      globalSessionSummaries: async () => [{ ...catalog('recovered'), throughJournalSeq: 1, completedTurnCount: 2, lineage: null }],
      inspectSession: async () => { throw new Error('catalog must not inspect Session'); },
      inspectSessionEvents: async () => { throw new Error('catalog must not read Journal'); },
    }, root);
    t.after(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }); });
    const result = await service.getSessionPage({});
    assert.equal(result.items[0].id, 'recovered');
    const db = new DatabaseSync(path); assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8); db.close();
  });
}

test('service serializes catalog queries, prunes deletions, and rejects after disposal', async t => {
  const root = await mkdtemp(join(tmpdir(), 'usage-service-test-'));
  let summaries = [{ ...catalog('original'), throughJournalSeq: 1, completedTurnCount: 2, lineage: null }];
  const service = new UsageReadModelService({ globalSessionSummaries: async () => summaries }, root);
  t.after(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }); });
  const pages = await Promise.all(Array.from({ length: 5 }, () => service.getSessionPage({})));
  assert(pages.every(page => page.items[0].id === 'original'));
  summaries = [];
  assert.deepEqual((await service.getSessionPage({})).items, []);
  await service.dispose();
  await assert.rejects(service.getSessionPage({}), /disposed/);
});

test('SQL activity matches JSON projection costs and dimensions with mixed currencies and connections', async t => {
  const { projectIndexedUsageActivity } = require('../../../packages/client/dist/sessions.cjs');
  const send = await fixture(t);
  const rows = [
    { ...row('known'), model: 'model', providerId: 'provider', connectionId: 'a', costAmount: 2, costCurrency: 'USD', costUsd: 2, historicalUnverified: true },
    { ...row('unknown'), model: 'model', providerId: 'provider', connectionId: 'b', costAmount: 5, costCurrency: 'EUR', costUsd: null, status: 'error' },
    { ...row('unpriced'), model: 'model', providerId: 'provider', costAmount: 1, costUsd: null },
    { ...row('tool'), kind: 'tool_invocation', toolName: 'search', providerId: 'tool-provider', durationMs: 20 },
  ].map((item, i) => ({ ...item, startedAt: new Date(Date.parse(item.startedAt) + i * 1000).toISOString() }));
  const sources = [source(rows)]; await send({ type: 'sync', sources });
  for (const input of [{ range: 'total' }, { range: 'total', kind: 'llm_request' }, { range: 'total', status: 'error' }]) {
    const actual = await send({ type: 'query', request: 'activity', input });
    const expected = projectIndexedUsageActivity(sources, input);
    delete actual.generatedAt; delete expected.generatedAt;
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
  }
});

test('multi-message replacement is atomic and a failing last chunk restores the old session', async t => {
  const send = await fixture(t);
  await send({ type:'sync',sources:[source([row('original')])] });
  await send({ type:'sync',sources:[source([row('a')])],final:false });
  await assert.rejects(send({ type:'query',request:'activity',input:{range:'total'} }), /not committed/);
  await assert.rejects(send({ type:'sync',sources:[source([row('a')])],replaceSessionIds:[],continuation:true,final:true }), /UNIQUE/);
  const page=await send({type:'query',request:'activity',input:{range:'total'}});
  assert.deepEqual(page.rows.map(row=>row.activityId),['original']);
  await send({type:'sync',sources:[source([row('a')])],final:false});
  await send({type:'sync',sources:[source([row('b')])],replaceSessionIds:[],continuation:true,final:true});
  assert.equal((await send({type:'query',request:'activity',input:{range:'total'}})).rowsPage.totalRows,2);
});

async function journalFixture(t) {
  const { JsonlQueryReader } = await import('../../../packages/session/jsonl/dist/query-reader.js');
  const { createSessionHeader } = await import('../../../packages/session/journal/dist/header.js');
  const { appendFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'usage-journal-test-'));
  const path = join(root, 'journal.jsonl');
  const header = createSessionHeader({ sessionId: 's', createdAt: '2026-10-11T00:00:00Z', lineage: null, createdWith: { profileId: 'test', runtimeContractVersion: 'v2', manifestDigest: 'test', codecSetDigest: 'test', plugins: [] } });
  await writeFile(path, JSON.stringify(header) + '\n');
  await writeFile(join(root, 'global-usage-reset.json'), JSON.stringify({ version: 1, resetAt: '2000-01-01T00:00:00Z' }));
  const reader = new JsonlQueryReader();
  const journal = []; const readSeqs = [];
  let revision = -1;
  const summary = () => ({ ...catalog('s'), throughJournalSeq: revision, completedTurnCount: 0, lineage: null });
  const services = [];
  const service = (lightweight = false) => {
    const current = new UsageReadModelService({
      ...(lightweight ? { sessionQuerySources: async () => ({ sources: [await reader.source(path, "s")], failedSessionIds: [] }) } : {}),
      globalSessionSummaries: async () => { if (lightweight) throw new Error("must not rebuild full Runtime summaries"); return [summary()]; },
      inspectSession: async () => { throw new Error('must not inspect whole Session'); },
      inspectSessionEvents: async () => { throw new Error('must not load whole Journal'); },
      readSessionEventBatch: async (id, input) => {
        const batch = await reader.read(path, id, input);
        readSeqs.push(...batch.events.map(event => event.seq)); return batch;
      },
    }, root);
    services.push(current); return current;
  };
  const append = async records => {
    const events = records.map(([type, data, surface = null]) => ({ recordKind: 'event', seq: ++revision, type, eventVersion: 1, criticality: 'ignorable', time: new Date(Date.parse('2026-10-11T00:00:00Z') + revision * 10).toISOString(), source: { ownerPluginId: 'test' }, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null }, surface, data }));
    journal.push(...events); await appendFile(path, events.map(event => JSON.stringify(event)).join('\n') + '\n');
  };
  t.after(async () => { await Promise.all(services.map(service => service.dispose())); await reader.close(); await rm(root, { recursive: true, force: true }); });
  return { service, append, journal, readSeqs, root, summary };
}

function normalizeRows(rows) { return JSON.parse(JSON.stringify(rows)).sort((a,b) => a.activityId.localeCompare(b.activityId)); }

test('real provider batches match the original projection, resume across queries and survive Worker restart', async t => {
  const fixture = await journalFixture(t);
  const { projectSessionUsageActivities } = require('../../../packages/client/dist/sessions.cjs');
  const service = fixture.service();
  const requests = Array.from({ length: 300 }, (_, i) => [
    ['turn/start', { turnId: `t${i}`, agentRunId: `run${i}` }],
    ['request/header', { requestId: `r${i}`, turnId: `t${i}`, stepId: `step${i}`, routeId: 'provider', model: 'model', attempt: 1 }],
    ['request/context', { requestId: `r${i}`, snapshot: { prepared: { route: 'provider', model: 'model' }, secretBody: 'must not be indexed' } }],
    ['assistant/message', { requestId: `r${i}`, finishReason: 'stop', usage: { inputTokens: i, outputTokens: 2 }, content: 'large private transcript must not be indexed' }],
  ]).flat();
  await fixture.append(requests);
  const compare = async current => {
    const actual = await current.getActivity({ range: 'total', requestRowsPage: { limit: 500 } });
    const expected = projectSessionUsageActivities({ sessionId: 's', throughJournalSeq: fixture.summary().throughJournalSeq, workspaceRoot: '/workspace', metadata: { title: 's' } }, fixture.journal);
    assert.deepEqual(normalizeRows(actual.rows), normalizeRows(expected));
    return actual;
  };
  await compare(service);
  assert.equal(fixture.readSeqs.length, 1200);
  fixture.readSeqs.length = 0;
  await compare(service);
  assert.equal(fixture.readSeqs.length, 0, 'unchanged queries must not open/read Journal');
  await service.dispose();
  const restarted = fixture.service();
  await compare(restarted);
  assert.equal(fixture.readSeqs.length, 0, 'persistent cursor avoids a restart rescan');
  await fixture.append([
    ['request/header', { requestId: 'pending', turnId: 't0', stepId: 'retry-step', routeId: 'provider', model: 'model', attempt: 1 }],
    ['tool/call', { callId: 'call', turnId: 't0', stepId: 'retry-step', name: 'read', arguments: 'private tool payload' }],
  ]);
  await compare(restarted);
  assert.equal(fixture.readSeqs.length, 2);
  fixture.readSeqs.length = 0;
  await fixture.append([
    ['llm/retry', { requestId: 'pending', retryId: 'retry', nextAttempt: 2, usage: { inputTokens: 5 } }],
    ['llm/retry-started', { requestId: 'pending' }],
    ['request/header', { requestId: 'successor', turnId: 't0', stepId: 'retry-step', routeId: 'provider', model: 'model', attempt: 2 }],
    ['step/end', { stepId: 'retry-step', reason: 'completed', usage: { inputTokens: 3, outputTokens: 4 } }],
    ['tool/result', { callId: 'call', status: 'success', result: 'private result' }],
  ]);
  await compare(restarted);
  assert.equal(fixture.readSeqs.length, 5, 'only appended events are read');
  const db = new DatabaseSync(join(fixture.root, 'runtime-v2', 'usage-read-model.sqlite'));
  const events = db.prepare('SELECT event_json FROM usage_projection_events').all();
  assert(!JSON.stringify(events).includes('private'));
  assert(!JSON.stringify(events).includes('secretBody'));
  db.close();
});

test('a failed later Journal batch rolls back earlier batches and persisted cursor', async t => {
  const send = await fixture(t);
  const session = { sessionId: 's', title: 's', workspaceRoot: '/workspace', throughJournalSeq: 0 };
  const event = { seq: 0, type: 'tool/call', time: '2026-10-11T00:00:00Z', data: { callId: 'call', name: 'read' } };
  await send({ type: 'journal', source: session, events: [event], cursor: 'first', first: true, final: true, reset: true });
  await send({ type: 'journal', source: { ...session, throughJournalSeq: 2 }, events: [{ ...event, seq: 1, data: { callId: 'new', name: 'write' } }], cursor: 'next', first: true, final: false, reset: false });
  await assert.rejects(send({ type: 'journal', source: { ...session, throughJournalSeq: 2 }, events: [{ ...event, seq: 1 }], cursor: 'bad', first: false, final: true, reset: false }), /UNIQUE/);
  assert.deepEqual(await send({ type: 'source-state', sessionId: 's' }), { revision: 0, cursor: 'first' });
  const result = await send({ type: 'query', request: 'activity', input: { range: 'total' } });
  assert.deepEqual(result.rows.map(row => row.activityId), ['s:tool:call']);
});

test('second index failure uses bounded Session fallback in Worker and exposes its status', async t => {
  const fixture = await journalFixture(t);
  await writeFile(join(fixture.root, 'runtime-v2'), 'prevent database creation');
  await fixture.append([
    ['turn/start', { turnId: 'turn', agentRunId: 'run' }],
    ['request/header', { requestId: 'request', turnId: 'turn', stepId: 'step', routeId: 'provider', model: 'model' }],
    ['assistant/message', { requestId: 'request', finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 3 } }],
  ]);
  const result = await fixture.service().getActivity({ range: 'total' });
  assert.equal(result.readModel.status, 'fallback');
  assert.equal(result.readModel.source, 'session');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].tokens.totalTokens, 5);
});

test('fallback refuses oversized datasets before reading any Session body', async t => {
  const root = await mkdtemp(join(tmpdir(), 'usage-fallback-limit-'));
  await writeFile(join(root, 'runtime-v2'), 'prevent database creation');
  let reads = 0;
  const service = new UsageReadModelService({
    globalSessionSummaries: async () => [{ ...catalog('s'), throughJournalSeq: 5000, completedTurnCount: 0, lineage: null }],
    readSessionEventBatch: async () => { reads++; throw new Error('must not read'); },
  }, root);
  t.after(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }); });
  await assert.rejects(service.getActivity({ range: 'total' }), /fallback exceeds 5,000/);
  assert.equal(reads, 0);
});

test('renamed catalog metadata updates existing activity rows and title FTS without rereading Journal', async t => {
  const send = await fixture(t);
  await send({ type: 'sync', sources: [], catalog: [catalog('s', { title: 'oldtitle' })] });
  await send({ type: 'sync', sources: [source([{ ...row('a'), sessionTitle: 'oldtitle', workspaceRoot: '/workspace' }])] });
  await send({ type: 'sync', sources: [], catalog: [catalog('s', { title: 'newtitle', workspaceRoot: '/new', revision: 2 })] });
  const old = await send({ type: 'query', request: 'activity', input: { range: 'total', search: 'oldtitle' } });
  assert.equal(old.rows.length, 0);
  const current = await send({ type: 'query', request: 'activity', input: { range: 'total', search: 'newtitle' } });
  assert.equal(current.rows[0].sessionTitle, 'newtitle');
  assert.equal(current.rows[0].workspaceRoot, '/new');
  assert.equal(current.sourceWatermarks[0].throughJournalSeq, 1, 'catalog revision must not impersonate indexed revision');
});

test('rollups preserve exact sliding boundaries, status filters, null costs and deletions', async t => {
  const send = await fixture(t);
  const { projectIndexedUsageActivity } = require('../../../packages/client/dist/sessions.cjs');
  const now = Date.now();
  const rows = Array.from({ length: 600 }, (_, i) => ({ ...row(`rollup-${i}`), startedAt: new Date(now - (i % 3 === 0 ? 25 : i % 3 === 1 ? 23 : 0) * 3600000 - i * 20).toISOString(), status: i % 7 === 0 ? 'error' : 'success', model: `m${i % 3}`, providerId: 'provider', costUsd: i % 4 ? 1 : null, costAmount: i % 4 ? 1 : null, costCurrency: 'USD', historicalUnverified: i % 2 === 0 }));
  const sources = [source(rows)];
  await send({ type: 'sync', sources });
  const normalize = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'generatedAt' || key === 'nextCursor' ? undefined : item));
  for (const range of ['day','week','total']) for (const status of ['all','error']) {
    const input = { range, status };
    const actual = await send({ type: 'query', request: 'activity', input });
    assert.deepEqual(normalize(actual), normalize(projectIndexedUsageActivity(sources, input)));
  }
  await send({ type: 'sync', sources: [source([rows[0]])] });
  const final = await send({ type: 'query', request: 'activity', input: { range: 'total' } });
  assert.equal(final.summary.activityCount, 1);
  assert.equal(final.costSummary.knownCostRequestCount, 0);
  await send({ type: 'sync', sources: [], activeSessionIds: [] });
  const empty = await send({ type: 'query', request: 'activity', input: { range: 'total' } });
  assert.equal(empty.summary.activityCount, 0);
  assert.deepEqual(empty.aggregates, { providers: [], models: [], tools: [] });
});

test('statistics rollups match direct Session SQL and repeated-run daily distinct counts', async t => {
  const send = await fixture(t);
  const rows = Array.from({ length: 80 }, (_, i) => ({ ...row(`stats-${i}`), kind: i % 4 === 0 ? 'tool_invocation' : 'llm_request', toolName: i % 4 === 0 ? 'read' : undefined, model: `m${i%3}`, providerId: 'provider', agentRunId: `run${i%7}`, durationMs: i % 2 === 0 ? 30 : undefined, startedAt: new Date(Date.now() - i*3600000).toISOString() }));
  await send({ type: 'sync', sources: [source(rows)] });
  for (const range of ['total','day','week']) {
    const global = await send({ type: 'query', request: 'statistics', input: { range } });
    const session = await send({ type: 'query', request: 'statistics', input: { range, scope: 'session', sessionId: 's' } });
    for (const key of ['summary','modelDistribution','toolDistribution','dailyRows','requestRows','requestRowsPage']) assert.deepEqual(global[key], session[key], key);
  }
});

test('cancelling during a provider batch rolls back and later query succeeds', async t => {
  const fixture = await journalFixture(t);
  await fixture.append(Array.from({ length: 1000 }, (_, i) => ['tool/call', { callId: `call${i}`, name: 'read' }]));
  const service = fixture.service();
  const pending = service.getActivity({ range: 'total', requestId: 'cancel-me' });
  const cancellation = setInterval(() => { if (service.getStatus('cancel-me')?.phase === 'syncing') service.cancel('cancel-me'); }, 1);
  try { await assert.rejects(pending, /cancelled/); } finally { clearInterval(cancellation); }
  assert.equal(service.getStatus('cancel-me'), null);
  const result = await service.getActivity({ range: 'total' });
  assert.equal(result.rowsPage.totalRows, 1000);
});

test('an active SQLite owner prevents a second service from deleting its index', async t => {
  const fixture = await journalFixture(t);
  await fixture.append([['tool/call', { callId: 'call', name: 'read' }]]);
  const owner = fixture.service();
  await owner.getActivity({ range: 'total' });
  const other = fixture.service();
  const fallback = await other.getActivity({ range: 'total' });
  assert.equal(fallback.readModel.status, 'fallback');
  assert.equal((await owner.getActivity({ range: 'total' })).rows[0].activityId, 's:tool:call');
  await owner.dispose();
  const next = await other.getActivity({ range: 'total' });
  assert.equal(next.readModel, undefined);
});

test('production lightweight descriptor skips Runtime replay and persists projected catalog across restarts', async t => {
  const f = await journalFixture(t);
  await f.append([['session/title-set', {title:'Searchable catalog title'}], ['session/workspace-set',{workspaceRoot:'/changed'}], ['session/pinned-set',{pinned:true}], ['turn/start',{turnId:'turn',agentRunId:'run'}], ['request/header',{requestId:'req',turnId:'turn',stepId:'step',model:'model'}], ['assistant/message',{requestId:'req',finishReason:'stop',usage:{inputTokens:7,outputTokens:3}}], ['turn/end',{turnId:'turn'}]]);
  const service = f.service(true);
  const activity = await service.getActivity({range:'total'});
  assert.equal(activity.rows[0].sessionTitle,'Searchable catalog title');
  assert.equal(activity.rows[0].workspaceRoot,'/changed');
  const page = await service.getSessionPage({});
  assert.equal(page.items[0].title,'Searchable catalog title');
  assert.equal(page.items[0].pinned,true); assert.equal(page.items[0].agentRunCount,1);
  f.readSeqs.length=0;
  await service.getActivity({range:'total'});
  assert.equal(f.readSeqs.length,0);
  await service.dispose();
  const next=f.service(true);
  assert.equal((await next.getSessionPage({})).items[0].title,'Searchable catalog title');
  assert.equal(f.readSeqs.length,0);
  await f.append([['session/title-set',{title:'Renamed catalog'}]]);
  assert.equal((await next.getSessionPage({})).items[0].title,'Renamed catalog');
  assert.deepEqual(f.readSeqs,[7]);
});

test('history FTS searches bounded message excerpts, title and cursor pages without loading transcripts', async t => {
  const f=await journalFixture(t);
  await f.append([['session/title-set',{title:'Alpha title'}], ['user/message',{content:'unused'}, {kind:'append',node:{kind:'user',messageId:'m',content:'Unusual nebula search phrase '+'x'.repeat(600)+' omittedtail'}}]]);
  const service=f.service(true);
  const result=await service.getSessionPage({search:'nebula',limit:1});
  assert.equal(result.items[0].title,'Alpha title');
  f.readSeqs.length=0;
  assert.equal((await service.getSessionPage({search:'Alpha'})).items.length,1);
  assert.equal((await service.getSessionPage({search:'omittedtail'})).items.length,0);
  assert.equal(f.readSeqs.length,0);
  const db=new DatabaseSync(join(f.root,'runtime-v2','usage-read-model.sqlite'));
  assert(Number(db.prepare('SELECT MAX(length(content)) AS length FROM session_excerpt_search').get().length)<=512);
  db.close();
});

for (const failures of [1,2]) test(`Worker crash retries once and ${failures===1?'recovers':'then uses bounded fallback'}`, async t => {
  const f=await journalFixture(t);
  await f.append([['request/header',{requestId:'r',turnId:'t',stepId:'step',model:'m'}],['assistant/message',{requestId:'r',finishReason:'stop',usage:{inputTokens:3}}]]);
  const original=Worker.prototype.postMessage;
  let remaining=failures;
  Worker.prototype.postMessage=function(message,...args) {
    if(message.type==='query' && message.request==='activity' && remaining>0){remaining--;void this.terminate();return;}
    return original.call(this,message,...args);
  };
  try {
    const result=await f.service().getActivity({range:'total'});
    assert.equal(result.rows.length,1);assert.equal(remaining,0);
    assert.equal(result.readModel?.status,failures===2?'fallback':undefined);
    assert.equal(f.journal.length,2,'crashes never change Session facts');
  } finally {Worker.prototype.postMessage=original;}
});


test('catalog bounds total rows across workspaces and leaves unloaded groups reachable', async t => {
  const send = await fixture(t);
  const items = Array.from({ length: 600 }, (_, i) => catalog(`many-${i}`, { workspaceRoot: `/workspace-${i}` }));
  await send({ type: 'sync', sources: [], catalog: items, activeSessionIds: items.map(row => row.sessionId) });
  const page = await send({ type: 'query', request: 'sessions', input: {} });
  assert.equal(page.items.length, 500);
  assert.equal(page.groups.length, 600);
  const deferred = page.groups.find(group => group.hasMore);
  assert.ok(deferred);
  const next = await send({ type: 'query', request: 'sessions', input: { workspaceRoot: deferred.workspaceRoot, pinned: false } });
  assert.equal(next.items.length, 1);
  assert.equal(next.groups[0].hasMore, false);
});

test('FTS preserves quoted phrases and rejects invalid pagination cursors', async t => {
  const send = await fixture(t);
  await send({ type: 'sync', sources: [source([{ ...row('phrase'), model: 'alpha beta' }, { ...row('terms'), model: 'alpha gamma beta' }])] });
  const page = await send({ type: 'query', request: 'activity', input: { range: 'total', search: '"alpha beta"' } });
  assert.deepEqual(page.rows.map(item => item.activityId), ['phrase']);
  await assert.rejects(send({ type: 'query', request: 'activity', input: { range: 'total', requestRowsPage: { cursor: 'bad-cursor' } } }), /cursor invalid/);
});


test('history-only query does not construct Usage and later Usage sync does not duplicate catalog facts', async t => {
  const f = await journalFixture(t);
  await f.append([['turn/start',{turnId:'t',agentRunId:'run'}],['request/header',{requestId:'r',turnId:'t',stepId:'step',model:'m'}],['assistant/message',{requestId:'r',finishReason:'stop',usage:{inputTokens:3}}],['turn/end',{turnId:'t'}]]);
  const service = f.service(true);
  assert.equal((await service.getSessionPage({})).items[0].agentRunCount,1);
  let db = new DatabaseSync(join(f.root,'runtime-v2','usage-read-model.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usage_activity').get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM index_state WHERE key='session:s'").get().n,0);
  db.close();
  assert.equal((await service.getActivity({range:'total'})).rows.length,1);
  assert.equal((await service.getSessionPage({})).items[0].agentRunCount,1);
  await f.append([['turn/start',{turnId:'t2',agentRunId:'run2'}],['turn/end',{turnId:'t2'}]]);
  assert.equal((await service.getSessionPage({})).items[0].agentRunCount,2);
  await service.getActivity({range:'total'});
  assert.equal((await service.getSessionPage({})).items[0].agentRunCount,2);
});

test('SQL statistics retains the complete legacy snapshot shape and cost/token semantics', async t => {
  const send = await fixture(t);
  const { projectIndexedUsageStatistics } = require('../../../packages/client/dist/sessions.cjs');
  const rows = [
    { ...row('a'), model:'m1', providerId:'p1', costUsd:0, tokens:{inputTokens:10,outputTokens:2,cacheReadTokens:3,cacheWriteTokens:4,reasoningTokens:1,totalTokens:12} },
    { ...row('b'), model:'m2', providerId:'p2', agentRunId:'run2', costUsd:0.05, status:'error' },
    { ...row('c'), kind:'tool_invocation', toolName:'search', durationMs:40, status:'error' },
    { ...row('d'), kind:'tool_invocation', toolName:'search', durationMs:20 },
  ].map((item,i)=>({...item,startedAt:new Date(Date.parse(item.startedAt)+i*86_400_000).toISOString()}));
  const sources=[source(rows)]; await send({type:'sync',sources});
  const actual=await send({type:'query',request:'statistics',input:{range:'total'}});
  const expected=projectIndexedUsageStatistics(sources,{range:'total'});
  delete actual.generatedAt; delete expected.generatedAt;
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));
});

test('catalog task hint tracks pending/claimed terminal states without task contents', async t => {
  const send = await fixture(t);
  const header = { sessionId:'s',createdAt:'2026-10-11T00:00:00Z',cwd:'/workspace',lineage:null,createdWith:{profileId:'test'} };
  let seq=-1;
  async function append(type,data) {
    seq++;
    const source={sessionId:'s',title:null,workspaceRoot:'/workspace',throughJournalSeq:seq,querySource:{header,throughSeq:seq,stamp:String(seq)}};
    await send({type:'journal',source,events:[{seq,type,time:header.createdAt,data,surface:null}],cursor:String(seq),first:true,final:true,reset:seq===0,catalogOnly:true});
    return (await send({type:'query',request:'sessions',input:{}})).items[0].hasPendingTasks;
  }
  const task='plugin/actspace.agent-service/task',run='plugin/actspace.agent-service/run';
  assert.equal(await append(task,{op:'accept',sessionId:'other',taskId:'inherited'}),false);
  assert.equal(await append(task,{op:'accept',sessionId:'s',taskId:'a',content:'private payload'}),true);
  assert.equal(await append(task,{op:'claim',sessionId:'s',taskId:'a',runId:'r'}),true);
  assert.equal(await append(run,{op:'finish',sessionId:'s',runId:'r',outcome:'completed'}),false);
  assert.equal(await append(task,{op:'accept',sessionId:'s',taskId:'b'}),true);
  assert.equal(await append(task,{op:'cancel',sessionId:'s',taskId:'b'}),false);
  assert.equal(await append(task,{op:'accept',sessionId:'s',taskId:'c'}),true);
  assert.equal(await append(task,{op:'operation-start',sessionId:'s',taskId:'c'}),true);
  assert.equal(await append('plugin/actspace.agent-service/queue',{op:'recover',sessionId:'s'}),false);
});

test('Session-scoped Usage never reads unrelated Journal events', async t => {
  const root=await mkdtemp(join(tmpdir(),'usage-scope-test-'));
  const reads=[];
  const summaries=['selected','unrelated'].map(id=>({...catalog(id),throughJournalSeq:0,completedTurnCount:0,lineage:null}));
  const service=new UsageReadModelService({globalSessionSummaries:async()=>summaries,readSessionEventBatch:async(id)=>{reads.push(id);return {events:[],cursor:`cursor-${id}`,done:true};}},root);
  t.after(async()=>{await service.dispose();await rm(root,{recursive:true,force:true});});
  assert.equal((await service.getActivity({scope:'session',sessionId:'selected',range:'total'})).sourceCount,1);
  assert.deepEqual(reads,['selected']);
  await service.getStatistics({scope:'session',sessionId:'selected',range:'total'});
  assert.deepEqual(reads,['selected']);
  await service.getActivity({scope:'global',range:'total'});
  assert.deepEqual(reads,['selected','unrelated']);
});

test('deleting a Session removes both query watermarks and cursors', async t => {
  const send = await fixture(t);
  const header = { sessionId:'s',createdAt:'2026-10-11T00:00:00Z',cwd:'/workspace',lineage:null,createdWith:{profileId:'test'} };
  await send({type:'journal',source:{sessionId:'s',title:null,workspaceRoot:'/workspace',throughJournalSeq:0,querySource:{header,throughSeq:0,stamp:'old-file'}},events:[{seq:0,type:'session/title-set',time:header.createdAt,data:{title:'Old title'},surface:null}],cursor:'old-cursor',first:true,final:true,reset:true});
  assert.equal((await send({type:'source-state',sessionId:'s',catalogOnly:true})).revision,0);
  await send({type:'sync',sources:[],activeSessionIds:[]});
  for (const catalogOnly of [false,true]) {
    const state=await send({type:'source-state',sessionId:'s',catalogOnly});
    assert.equal(state.revision,null);
    assert.equal(state.cursor,undefined);
    assert.equal(state.stamp,undefined);
  }
});

test('title search uses exact compact aggregates for partial and complete catalog matches', async t => {
  const send=await fixture(t);
  const { projectIndexedUsageActivity }=require('../../../packages/client/dist/sessions.cjs');
  const rows=Array.from({length:240},(_,i)=>({...row(`title-${i}`,i%2?'s':'other'),model:`m${i%3}`,providerId:`p${i%5}`,status:i%7?'success':'error',costUsd:i%4?0.25:null,costAmount:i%4?0.25:null,costCurrency:i%9?'USD':'EUR',historicalUnverified:i%11===0}));
  const sources=['s','other'].map(id=>({...source(rows.filter(row=>row.sessionId===id),id),title:id==='s'?'shared nebula':'shared galaxy'}));
  await send({type:'sync',sources});
  for(const search of ['nebula','shared','galaxy']) for(const status of ['all','error']) {
    const actual=await send({type:'query',request:'activity',input:{range:'total',search,status}});
    const selected=search==='shared'?sources:sources.filter(source=>source.title.includes(search));
    const expected=projectIndexedUsageActivity(selected,{range:'total',status});
    for(const key of ['summary','aggregates','costSummary']) assert.deepEqual(JSON.parse(JSON.stringify(actual[key])),JSON.parse(JSON.stringify(expected[key])),`${search}/${status}/${key}`);
    assert.equal(actual.rowsPage.totalRows,expected.rowsPage.totalRows);
    assert.equal(actual.tabCounts.requests,rows.length);
  }
});

test('cached title aggregates invalidate after replacing or deleting source activity', async t => {
  const send=await fixture(t);
  const input={range:'total',search:'needle',requestRowsPage:{limit:1}};
  await send({type:'sync',sources:[{...source([row('a'),row('b')]),title:'needle'},source([row('c','other')],'other')]});
  for(let i=0;i<2;i++) assert.equal((await send({type:'query',request:'activity',input})).summary.activityCount,2);
  await send({type:'sync',sources:[{...source([row('a')]),title:'needle'}]});
  assert.equal((await send({type:'query',request:'activity',input})).summary.activityCount,1);
  await send({type:'sync',sources:[],activeSessionIds:['other']});
  assert.equal((await send({type:'query',request:'activity',input})).summary.activityCount,0);
});

test('exact model/provider filters combine with phrase, range and status', async t => {
  const send=await fixture(t);
  const rows=[
    {...row('a'),model:'alpha beta',providerId:'p1',status:'error'},
    {...row('b'),model:'alpha beta',providerId:'p2',status:'error'},
    {...row('c'),model:'alpha beta plus',providerId:'p1',status:'error'},
    {...row('d'),model:'alpha beta',providerId:'p1',status:'success'},
  ];
  await send({type:'sync',sources:[source(rows)]});
  const input={range:'total',model:'alpha beta',providerId:'p1',search:'"alpha beta"',status:'error'};
  const result=await send({type:'query',request:'activity',input});
  assert.deepEqual(result.rows.map(row=>row.activityId),['a']);
  assert.equal(result.summary.requestCount,1);
  assert.equal(result.tabCounts.requests,4);
  const legacy=require('../../../packages/client/dist/sessions.cjs').projectIndexedUsageActivity([source(rows)],{...input,search:undefined});
  assert.deepEqual(result.summary,legacy.summary);
});

test('run cardinality counts mixed kinds once and follows replacement/deletion', async t => {
  const send=await fixture(t);
  const rows=[row('request'),{...row('tool'),kind:'tool_invocation',toolName:'read'}, {...row('other'),agentRunId:'another'}];
  await send({type:'sync',sources:[source(rows)]});
  const read=()=>send({type:'query',request:'statistics',input:{range:'total'}});
  let result=await read();
  assert.equal(result.summary.conversationCount,2); assert.equal(result.dailyRows[0].conversationCount,2);
  await send({type:'sync',sources:[source([rows[1]])]});
  result=await read();assert.equal(result.summary.conversationCount,0);assert.equal(result.dailyRows[0].conversationCount,1);
  await send({type:'sync',sources:[],activeSessionIds:[]});
  result=await read();assert.equal(result.summary.conversationCount,0);assert.deepEqual(result.dailyRows,[]);
});

test('bounded appends use memory temporaries; queries and bulk replacement use files', async t => {
  const send=await fixture(t);
  const mode=async()=> (await send({type:'diagnostics'})).sqlite.temp_store;
  await send({type:'sync',sources:[{...source([row('a')]),title:'needle'},source([row('b','other')],'other')]});
  assert.equal(await mode(),2);
  const query=()=>send({type:'query',request:'activity',input:{range:'total',search:'needle'}});
  assert.equal((await query()).summary.activityCount,1);assert.equal(await mode(),1);
  // Changing temp_store drops the cached aggregate even without any row writes.
  await send({type:'sync',sources:[],replaceSessionIds:[]});assert.equal(await mode(),2);
  assert.equal((await query()).summary.activityCount,1);assert.equal(await mode(),1);
  await send({type:'sync',sources:[{...source([row('c')]),title:'needle'}]});assert.equal(await mode(),1);
  assert.deepEqual((await query()).rows.map(r=>r.activityId),['c']);
});

test('oversized dirty-group expansion rolls back without advancing the source watermark', async t => {
  const send=await fixture(t);
  await send({type:'sync',sources:[source([row('original')])]});
  const events=Array.from({length:10001},(_,i)=>({seq:i,type:'tool/call',time:'2026-10-11T00:00:00Z',data:{callId:`call${i}`,name:'read'},surface:null}));
  await assert.rejects(send({type:'journal',source:{sessionId:'s',title:'s',workspaceRoot:'/workspace',throughJournalSeq:10001},events,cursor:'too-large',first:true,final:true,reset:false}),/dirty groups exceed bounded/);
  assert.equal((await send({type:'source-state',sessionId:'s'})).revision,1);
  const result=await send({type:'query',request:'activity',input:{range:'total'}});
  assert.deepEqual(result.rows.map(r=>r.activityId),['original']);
});

test('rare model/provider filters have seekable indexes and preserve cursor ties', async t => {
  const send=await fixture(t);
  const rows=Array.from({length:300},(_,i)=>({...row(`common-${i}`),model:'common',providerId:'usual'}));
  rows.push({...row('rare-a'),model:'rare',providerId:'unusual'}, {...row('rare-b'),model:'rare',providerId:'unusual'});
  await send({type:'sync',sources:[source(rows)]});
  const db=new DatabaseSync(join(send.root,'runtime-v2','usage-read-model.sqlite'),{readOnly:true});
  try {
    for(const [column,value,index] of [['model','rare','usage_activity_model_page_idx'],['provider_id','unusual','usage_activity_provider_page_idx']]) {
      const plan=db.prepare(`EXPLAIN QUERY PLAN SELECT row_json FROM usage_activity WHERE ${column}=? ORDER BY started_at DESC,source_event_seq DESC,activity_id DESC LIMIT 2`).all(value);
      assert(plan.some(row=>String(row.detail).includes(`SEARCH usage_activity USING INDEX ${index}`)));
    }
  } finally {db.close();}
  for(const filter of [{model:'rare'},{providerId:'unusual'},{model:'rare',providerId:'unusual'}]) {
    const first=await send({type:'query',request:'activity',input:{range:'total',...filter,requestRowsPage:{limit:1}}});
    const second=await send({type:'query',request:'activity',input:{range:'total',...filter,requestRowsPage:{limit:1,cursor:first.rowsPage.nextCursor}}});
    assert.equal(first.rowsPage.totalRows,2);assert.deepEqual([...first.rows,...second.rows].map(row=>row.activityId),['rare-b','rare-a']);
  }
});


test('history rebuild failure falls back to bounded Session projection and FTS without the disk index', async t => {
  const f = await journalFixture(t);
  await writeFile(join(f.root,'runtime-v2'),'prevent database creation');
  await f.append([
    ['session/title-set',{title:'Fallback title'}],
    ['session/pinned-set',{pinned:true}],
    ['user/message',{}, {kind:'append',node:{kind:'user',messageId:'m',content:'rare nebula excerpt'}}],
  ]);
  const service=f.service(true);
  const result=await service.getSessionPage({search:'nebula',pinned:true,limit:1});
  assert.equal(result.readModel.status,'fallback');
  assert.equal(result.readModel.source,'session');
  assert.equal(result.items[0].title,'Fallback title');
  assert.equal(result.items[0].pinned,true);
  assert.equal((await service.getSessionPage({search:'absent'})).items.length,0);
});

test('history fallback preflights event budget before opening a Session body', async t => {
  const root=await mkdtemp(join(tmpdir(),'history-fallback-limit-'));
  await writeFile(join(root,'runtime-v2'),'prevent database creation');
  let reads=0;
  const service=new UsageReadModelService({
    globalSessionSummaries:async()=>[{...catalog('s'),throughJournalSeq:5000}],
    readSessionEventBatch:async()=>{reads++;throw new Error('must not read');},
  },root);
  t.after(async()=>{await service.dispose();await rm(root,{recursive:true,force:true});});
  await assert.rejects(service.getSessionPage({}),/fallback exceeds/);
  assert.equal(reads,0);
});

test('history fallback releases bounded scratch state after errors and preserves page cursors', async t => {
  const send=await fixture(t);
  await send({type:'catalog-fallback-begin'});
  await assert.rejects(send({type:'catalog-fallback-append',row:catalog('s'),events:[{data:'x'.repeat(8*1024*1024)}],first:true}),/fallback exceeds/);
  await send({type:'catalog-fallback-end'});
  await send({type:'catalog-fallback-begin'});
  for(const id of ['a','b']) await send({type:'catalog-fallback-append',row:catalog(id,{title:'shared title'}),events:[],first:true});
  const first=await send({type:'catalog-fallback-query',input:{search:'shared',limit:1}});
  const second=await send({type:'catalog-fallback-query',input:{search:'shared',limit:1,after:first.nextCursor}});
  assert.deepEqual([...first.items,...second.items].map(row=>row.id),['a','b']);
  await send({type:'catalog-fallback-end'});
  await assert.rejects(send({type:'catalog-fallback-query',input:{}}),/not initialized/);
});


test('a rejected prefetched batch rolls back and rebuilds without losing or duplicating rows', async t => {
  const root=await mkdtemp(join(tmpdir(),'usage-prefetch-retry-'));
  await writeFile(join(root,'global-usage-reset.json'),JSON.stringify({version:1,resetAt:'2000-01-01T00:00:00Z'}));
  const events=Array.from({length:300},(_,seq)=>({seq,type:'tool/call',time:'2026-10-11T00:00:00Z',data:{callId:`call-${seq}`,name:'read'}}));
  let reads=0;
  const service=new UsageReadModelService({
    globalSessionSummaries:async()=>[{...catalog('s'),throughJournalSeq:299,completedTurnCount:0,lineage:null}],
    readSessionEventBatch:async(id,input)=>{
      if(++reads===2) throw new Error('prefetch read failed');
      const start=Number(input.cursor??0),end=Math.min(start+25,events.length);
      return {events:events.slice(start,end),cursor:String(end),done:end===events.length};
    },
  },root);
  t.after(async()=>{await service.dispose();await rm(root,{recursive:true,force:true});});
  const result=await service.getActivity({range:'total',requestRowsPage:{limit:500}});
  assert.equal(result.readModel,undefined);
  assert.equal(result.rowsPage.totalRows,300);
  assert.equal(new Set(result.rows.map(row=>row.activityId)).size,300);
  assert.equal(reads,14);
});


test('lightweight Usage fallback replays title/workspace metadata and releases state after failure', async t => {
  const f=await journalFixture(t);
  await writeFile(join(f.root,'runtime-v2'),'prevent database creation');
  await f.append([
    ['session/title-set',{title:'Fallback title token-abcdefghijk'}],
    ['session/workspace-set',{workspaceRoot:'/new-workspace'}],
    ['tool/call',{callId:'call',name:'read'}],
  ]);
  const result=await f.service(true).getActivity({range:'total',search:'Fallback title'});
  assert.equal(result.readModel.status,'fallback');
  assert.equal(result.rows[0].sessionTitle,'Fallback title [REDACTED]');
  assert.equal(result.rows[0].workspaceRoot,'/new-workspace');
  const send=await fixture(t);
  await send({type:'fallback-begin'});
  await send({type:'fallback-append',source:{sessionId:'s',title:null,throughJournalSeq:0,workspaceRoot:null},events:[{seq:0,type:'tool/call',data:{callId:'c',name:'read'}}]});
  await send({type:'fallback-end'});
  await assert.rejects(send({type:'fallback-query',request:'activity',input:{range:'total'}}),/not initialized/);
});


test('Usage Session fallback keeps indexed FTS, cursor, summary and statistics semantics', async t => {
  const f=await journalFixture(t);
  await f.append([
    ['session/title-set',{title:'Exact fallback title'}],
    ...Array.from({length:5},(_,index)=>[
      ['tool/call',{callId:`call-${index}`,name:index%2?'write':'read'}],
      ['tool/result',{callId:`call-${index}`,status:'success'}],
    ]).flat(),
  ]);
  const indexed=f.service(true);
  const input={range:'total',search:'fallback title',requestRowsPage:{limit:2}};
  const expected=await indexed.getActivity(input);
  const expectedNext=await indexed.getActivity({...input,requestRowsPage:{limit:2,cursor:expected.rowsPage.nextCursor}});
  const expectedStats=await indexed.getStatistics({range:'total'});
  await indexed.dispose();
  await rm(join(f.root,'runtime-v2'),{recursive:true});
  await writeFile(join(f.root,'runtime-v2'),'prevent database creation');
  const fallback=f.service(true);
  const actual=await fallback.getActivity(input);
  const actualNext=await fallback.getActivity({...input,requestRowsPage:{limit:2,cursor:actual.rowsPage.nextCursor}});
  const actualStats=await fallback.getStatistics({range:'total'});
  const comparable=({generatedAt,readModel,...result})=>result;
  assert.deepEqual(comparable(actual),comparable(expected));
  assert.deepEqual(comparable(actualNext),comparable(expectedNext));
  assert.deepEqual(comparable(actualStats),comparable(expectedStats));
  assert.equal(actual.readModel.status,'fallback');
});


test('catalog reconciliation updates only changed Sessions and still prunes deleted history', async t => {
  const root=await mkdtemp(join(tmpdir(),'usage-catalog-delta-'));
  let summaries=['a','b','c'].map(id=>({...catalog(id),throughJournalSeq:0,completedTurnCount:0,lineage:null}));
  const service=new UsageReadModelService({globalSessionSummaries:async()=>summaries},root);
  t.after(async()=>{await service.dispose();await rm(root,{recursive:true,force:true});});
  await service.getSessionPage({});
  const db=new DatabaseSync(join(root,'runtime-v2','usage-read-model.sqlite'));
  try {
    db.exec('CREATE TABLE catalog_update_audit(id TEXT); CREATE TRIGGER catalog_update_audit_trigger AFTER UPDATE ON session_catalog BEGIN INSERT INTO catalog_update_audit VALUES(new.session_id); END;');
    summaries=summaries.map(row=>row.sessionId==='b'?{...row,title:'Changed title'}:row);
    const changed=await service.getSessionPage({search:'Changed'});
    assert.deepEqual(changed.items.map(item=>item.id),['b']);
    assert.deepEqual(db.prepare('SELECT id FROM catalog_update_audit').all().map(row=>row.id),['b']);
    db.exec('DELETE FROM catalog_update_audit');
    await service.getSessionPage({});
    assert.equal(db.prepare('SELECT count(*) AS n FROM catalog_update_audit').get().n,0);
    summaries=summaries.filter(row=>row.sessionId!=='b');
    assert.equal((await service.getSessionPage({search:'Changed'})).items.length,0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_catalog WHERE session_id='b'").get().n,0);
  } finally {db.close();}
});


test('run association expansion is charged to the step projection memory budget', async t => {
  const send=await fixture(t);
  await send({type:'sync',sources:[source([row('original')])]});
  const events=[];
  for(let i=0;i<17;i++) {
    events.push({seq:events.length,type:'turn/start',time:'2026-10-11T00:00:00Z',data:{turnId:`turn-${i}`,agentRunId:'r'.repeat(512*1024)}});
    events.push({seq:events.length,type:'request/header',time:'2026-10-11T00:00:00Z',data:{turnId:`turn-${i}`,stepId:'shared-step',requestId:`request-${i}`}});
  }
  await assert.rejects(send({type:'journal',source:{sessionId:'s',title:'s',workspaceRoot:null,throughJournalSeq:events.length-1},events,cursor:'expanded',first:true,final:true,reset:false}),/step projection exceeds bounded query budget/);
  const result=await send({type:'query',request:'activity',input:{range:'total'}});
  assert.deepEqual(result.rows.map(row=>row.activityId),['original']);
  assert.equal((await send({type:'source-state',sessionId:'s'})).revision,1);
});

test('an explicit benchmark root preserves unrelated files by default', async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { readFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'usage-benchmark-owned-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'unrelated.txt'), 'preserve');
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./benchmark-usage-journal.mjs', import.meta.url)), '--rows=1', '--sessions=1', '--appends=0', `--root=${root}`], { timeout: 30_000 });
  assert.equal(await readFile(join(root, 'unrelated.txt'), 'utf8'), 'preserve');
});

test('codec changes rebuild prior events even when the Journal revision also advances', async t => {
  const root = await mkdtemp(join(tmpdir(), 'usage-codec-change-'));
  await writeFile(join(root, 'global-usage-reset.json'), JSON.stringify({ version: 1, resetAt: '2000-01-01T00:00:00Z' }));
  let digest = 'codec-a'; let revision = 0;
  const reads = [];
  const header = { sessionId: 's', createdAt: '2026-10-11T00:00:00Z', cwd: null, lineage: null, createdWith: { profileId: 'test' } };
  const service = new UsageReadModelService({
    sessionQuerySources: async () => ({ sources: [{ header, throughSeq: revision, stamp: `file:${revision}:${digest}`, codecSetDigest: digest }], failedSessionIds: [] }),
    readSessionEventBatch: async (_id, input) => {
      const start = input.cursor ? Number(input.cursor) + 1 : 0;
      reads.push(start);
      return { events: Array.from({ length: revision - start + 1 }, (_, i) => ({ seq: start + i, type: 'tool/call', time: header.createdAt, surface: null, data: { callId: `call-${start + i}`, name: digest } })), cursor: String(revision), done: true };
    },
  }, root);
  t.after(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }); });
  const input = { range: 'total', kind: 'tool_invocation' };
  assert.equal((await service.getActivity(input)).rows[0].toolName, 'codec-a');
  digest = 'codec-b'; revision = 1;
  const actual = await service.getActivity(input);
  assert.deepEqual(reads, [0, 0]);
  assert.deepEqual(actual.rows.map(row => row.toolName), ['codec-b', 'codec-b']);
});

test('page decoding rejects oversized raw rows before accumulating the entire page', async t => {
  const send = await fixture(t);
  const rows = Array.from({ length: 4 }, (_, i) => ({ ...row(`large-${i}`), costProvenance: { reason: 'x'.repeat(400 * 1024) } }));
  await send({ type: 'sync', sources: [source(rows)] });
  for (const request of ['activity', 'statistics']) await assert.rejects(send({ type: 'query', request, input: { range: 'total', requestRowsPage: { limit: 500 } } }), /Usage result exceeds/);
});

test('RFC3339 timezone offsets are normalized before SQL range and hourly aggregation', async t => {
  const send = await fixture(t);
  const actualTime = Date.now() - 30 * 3_600_000;
  const startedAt = new Date(actualTime + 8 * 3_600_000).toISOString().replace('Z', '+08:00');
  await send({ type: 'sync', sources: [source([{ ...row('offset'), startedAt }])] });
  for (const scope of ['global', 'session']) {
    const result = await send({ type: 'query', request: 'activity', input: { range: 'day', scope, ...(scope === 'session' ? { sessionId: 's' } : {}) } });
    assert.equal(result.summary.activityCount, 0);
  }
  const total = await send({ type: 'query', request: 'activity', input: { range: 'total' } });
  assert.equal(total.rows[0].startedAt, new Date(actualTime).toISOString());
});

test('unreadable descriptors and unavailable codecs do not hide healthy history or usage', async t => {
  const root = await mkdtemp(join(tmpdir(), 'usage-partial-sources-'));
  await writeFile(join(root, 'global-usage-reset.json'), JSON.stringify({ version: 1, resetAt: '2000-01-01T00:00:00Z' }));
  const header = id => ({ sessionId: id, createdAt: '2026-10-11T00:00:00Z', cwd: null, lineage: null, createdWith: { profileId: 'test' } });
  const service = new UsageReadModelService({
    sessionQuerySources: async () => ({ sources: ['codec-missing', 'healthy'].map(id => ({ header: header(id), throughSeq: 0, stamp: id })), failedSessionIds: ['broken-header'] }),
    readSessionEventBatch: async id => {
      if (id === 'codec-missing') throw new Error('Session requires an unavailable codec');
      return { events: [{ seq: 0, type: 'tool/call', time: header(id).createdAt, surface: null, data: { callId: 'call', name: 'read' } }], cursor: '0', done: true };
    },
  }, root);
  t.after(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }); });
  const history = await service.getSessionPage({});
  assert.deepEqual(history.items.map(row => row.id), ['healthy']);
  assert.equal(history.failed, 2);
  const usage = await service.getActivity({ range: 'total' });
  assert.equal(usage.rows.length, 1); assert.equal(usage.rows[0].sessionId, 'healthy');
  assert.equal(usage.readModel.failedSources, 2);
  await assert.rejects(service.getActivity({ range: 'total', scope: 'session', sessionId: 'broken-header' }), /unreadable/);
});

test('history uses legacy summaries when optional query capabilities are unavailable', async t => {
  const root = await mkdtemp(join(tmpdir(), 'usage-legacy-source-'));
  const service = new UsageReadModelService({ sessionQuerySources: async () => null, globalSessionSummaries: async () => [{ ...catalog('legacy'), throughJournalSeq: 0, completedTurnCount: 0, lineage: null }] }, root);
  t.after(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }); });
  assert.equal((await service.getSessionPage({})).items[0].id, 'legacy');
  await assert.rejects(service.getActivity({ range: 'total' }), /provider does not support bounded Usage queries/);
  assert.equal((await service.getSessionPage({})).items[0].id, 'legacy');
});

test('temporary source failure invalidates both query caches and restores the complete catalog', async t => {
  const root = await mkdtemp(join(tmpdir(), 'usage-source-recovery-'));
  let fail = false;
  const worktree = { sourceWorkspaceRoot: '/source', path: '/worktree', branch: 'feature' };
  const header = { sessionId: 'recover', createdAt: '2026-10-11T00:00:00Z', cwd: '/worktree', worktree, lineage: null, createdWith: { profileId: 'test', presetId: 'actspace.chat' } };
  const service = new UsageReadModelService({
    sessionQuerySources: async () => ({ sources: [{ header, throughSeq: 0, stamp: 'unchanged' }], failedSessionIds: [] }),
    readSessionEventBatch: async () => {
      if (fail) throw new Error('Temporary read failure');
      return { events: [{ seq: 0, type: 'session/title-set', time: header.createdAt, surface: null, data: { title: 'Restored' } }], cursor: '0', done: true };
    },
  }, root);
  t.after(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }); });
  const initial = (await service.getSessionPage({})).items;
  assert.equal(initial.length, 1);
  fail = true;
  assert.equal((await service.getActivity({ range: 'total' })).readModel.failedSources, 1);
  fail = false;
  const recovered = await service.getSessionPage({});
  assert.equal(recovered.failed, 0);
  assert.deepEqual(recovered.items, initial);
  await service.getActivity({ range: 'total' });
  assert.deepEqual((await service.getSessionPage({})).items, initial);
});

test('grouped history enforces one raw byte budget across all workspace groups', async t => {
  const send = await fixture(t);
  for (let group = 0; group < 3; group++) await send({ type: 'sync', sources: [], catalog: Array.from({ length: 10 }, (_, i) => catalog(`g${group}-${i}`, { workspaceRoot: `/workspace-${group}`, worktree: { sourceWorkspaceRoot: `/workspace-${group}`, branch: 'x'.repeat(80 * 1024) } })) });
  await assert.rejects(send({ type: 'query', request: 'sessions', input: {} }), /Usage result exceeds the query budget/);
});

test('global query watermarks are bounded independently of total Session count', async t => {
  const send = await fixture(t);
  await send({ type: 'sync', sources: Array.from({ length: 650 }, (_, i) => source([], `session-${i}`)) });
  const result = await send({ type: 'query', request: 'activity', input: { range: 'total', search: 'no match', requestRowsPage: { limit: 1 } } });
  assert.equal(result.sourceCount, 650);
  assert.equal(result.sourceWatermarks.length, 500);
  assert.equal(result.sourceWatermarksTruncated, true);
  assert.equal(result.rows.length, 0);
});

for (const failures of [1, 2]) test(`SQL cancellation remains active after ${failures === 1 ? 'rebuild' : 'fallback'}`, async t => {
  const f = await journalFixture(t);
  await f.append([['tool/call', { callId: 'c', name: 'read' }]]);
  const service = f.service(); const original = Worker.prototype.postMessage;
  let remaining = failures; let phase;
  Worker.prototype.postMessage = function(message, ...args) {
    if (message.type === 'query' && remaining > 0) { remaining--; void this.terminate(); return; }
    if ((message.type === 'query' || message.type === 'fallback-query') && phase === undefined) {
      phase = service.getStatus('cancel-recovery')?.phase;
      service.cancel('cancel-recovery');
    }
    return original.call(this, message, ...args);
  };
  try {
    await assert.rejects(service.getActivity({ range: 'total', requestId: 'cancel-recovery' }), /cancelled/);
    assert.equal(phase, 'querying');
  } finally { Worker.prototype.postMessage = original; }
  assert.equal((await service.getActivity({ range: 'total' })).rows.length, 1);
});

test('replacement Worker waits for cancelled native Worker termination to settle', async t => {
  const f = await journalFixture(t);
  await f.append([['tool/call', { callId: 'c', name: 'read' }]]);
  const service = f.service();
  const post = Worker.prototype.postMessage, terminate = Worker.prototype.terminate;
  let cancelledWorker, released = false, replacing = false;
  Worker.prototype.terminate = function(...args) {
    const stopped = terminate.apply(this, args);
    if (this !== cancelledWorker) return stopped;
    return stopped.then(async result => { await new Promise(resolve => setTimeout(resolve, 80)); released = true; return result; });
  };
  Worker.prototype.postMessage = function(message, ...args) {
    if (message.type === 'query' && !cancelledWorker) { cancelledWorker = this; service.cancel('cancel-native'); }
    if (replacing && this !== cancelledWorker && message.type === 'sync') assert.equal(released, true, 'new owner must wait for actual Worker termination');
    return post.call(this, message, ...args);
  };
  try {
    await assert.rejects(service.getActivity({ range: 'total', requestId: 'cancel-native' }), /cancelled/);
    replacing = true;
    assert.equal((await service.getActivity({ range: 'total' })).rows.length, 1);
    assert.equal(released, true);
  } finally { Worker.prototype.postMessage = post; Worker.prototype.terminate = terminate; }
});

test('cancelling a chunked Session replacement rolls back deleted activities', async t => {
  const root = await mkdtemp(join(tmpdir(), 'usage-chunk-rollback-'));
  await writeFile(join(root, 'global-usage-reset.json'), JSON.stringify({ version: 1, resetAt: '2000-01-01T00:00:00Z' }));
  let stamp = 'before';
  const events = Array.from({ length: 1001 }, (_, seq) => ({ seq, type: 'tool/call', time: '2026-10-11T00:00:00Z', surface: null, data: { callId: `c${seq}`, name: 'read' } }));
  const service = new UsageReadModelService({
    sessionQuerySources: async () => ({ sources: [{ header: { sessionId: 's', createdAt: '2026-10-11T00:00:00Z', cwd: null, lineage: null, createdWith: { profileId: 'test' } }, throughSeq: 1000, stamp }], failedSessionIds: [] }),
    readSessionEventBatch: async (_, input) => { const start = Number(input.cursor ?? 0), end = Math.min(start + 128, events.length); return { events: events.slice(start, end), cursor: String(end), done: end === events.length }; },
  }, root);
  t.after(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }); });
  assert.equal((await service.getActivity({ range: 'total' })).rowsPage.totalRows, 1001);
  const post = Worker.prototype.postMessage; let observed = false;
  Worker.prototype.postMessage = function(message, ...args) {
    if (message.type === 'journal' && message.reset && message.first) {
      const worker = this;
      const heartbeat = reply => { if (reply.id !== message.id || !reply.heartbeat) return; worker.off('message', heartbeat); observed = true; service.cancel('cancel-delete'); };
      worker.on('message', heartbeat);
    }
    return post.call(this, message, ...args);
  };
  try { stamp = 'changed'; await assert.rejects(service.getActivity({ range: 'total', requestId: 'cancel-delete' }), /cancelled/); }
  finally { Worker.prototype.postMessage = post; }
  assert.equal(observed, true);
  // Wait for release through the service before reading its last committed state.
  await service.dispose();
  const database = new DatabaseSync(join(root, 'runtime-v2/usage-read-model.sqlite'), { readOnly: true });
  try { assert.equal(database.prepare('SELECT count(*) AS n FROM usage_activity').get().n, 1001); }
  finally { database.close(); }
});

// Known failing repros retained for the deferred unified acceptance plan.
// Remove TODO only after the U-08/U-10 fix passes the same assertions.
for (const fallback of [false, true]) test(`offset timestamps respect the reset boundary in ${fallback ? 'fallback' : 'indexed'} Usage`, { todo: 'U-08: reset filtering compares raw timestamp strings; deferred by user' }, async t => {
  const send = await fixture(t);
  const events = [
    ['before', '2026-10-11T03:00:00+08:00'],
    ['after', '2026-10-10T22:00:00-04:00'],
  ].flatMap(([id, time], i) => [
    { seq: i * 3, time, type: 'turn/start', data: { turnId: id, agentRunId: id }, surface: null },
    { seq: i * 3 + 1, time, type: 'request/header', data: { requestId: id, turnId: id, stepId: id, model: 'model' }, surface: null },
    { seq: i * 3 + 2, time, type: 'assistant/message', data: { requestId: id, finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2 } }, surface: null },
  ]);
  const journalSource = { sessionId: 's', title: 's', workspaceRoot: '/workspace', throughJournalSeq: 5 };
  const resetAt = '2026-10-11T00:00:00.000Z';
  if (fallback) {
    await send({ type: 'fallback-begin' });
    await send({ type: 'fallback-append', source: journalSource, events });
  } else await send({ type: 'journal', source: journalSource, events, cursor: 'done', first: true, final: true, reset: true, resetAt });
  const page = await send({ type: fallback ? 'fallback-query' : 'query', request: 'activity', input: { range: 'total' }, resetAt });
  assert.deepEqual(page.rows.map(row => row.requestId), ['after']);
  assert.equal(page.rows[0].startedAt, '2026-10-11T02:00:00.000Z');
});

for (const fallback of [false, true]) test(`offset timestamps sort history and page correctly in ${fallback ? 'fallback' : 'indexed'} catalog`, { todo: 'U-10: catalog sorting compares raw timestamp strings; deferred by user' }, async t => {
  const send = await fixture(t);
  const rows = [catalog('older-offset', { updatedAt: '2026-10-11T03:00:00+08:00' }), catalog('newer-utc')];
  if (fallback) {
    await send({ type: 'catalog-fallback-begin' });
    for (const row of rows) await send({ type: 'catalog-fallback-append', row, events: [], first: true });
  } else await send({ type: 'sync', sources: [], catalog: rows });
  const query = input => send({ type: fallback ? 'catalog-fallback-query' : 'query', request: 'sessions', input });
  const all = await query({ workspaceRoot: '/workspace', limit: 1 });
  assert.equal(all.items[0].id, 'newer-utc');
  const next = await query({ workspaceRoot: '/workspace', limit: 1, after: all.items[0].id });
  assert.equal(next.items[0].id, 'older-offset');
  assert.equal(next.items[0].updatedAt, '2026-10-10T19:00:00.000Z');
});
