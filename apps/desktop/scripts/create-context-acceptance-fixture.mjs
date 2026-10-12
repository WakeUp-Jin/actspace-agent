/** Legal, synthetic historical facts for real Electron IPC pagination acceptance.
 * Run only while the isolated acceptance app is closed. No actual provider run. */
import assert from 'node:assert/strict';
import { mkdir, open, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createCoreCodecRegistry, createSessionHeader } from '@actspace/session-journal';
import { ContextEngine } from '../../../packages/context/engine/dist/index.js';

const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(option('root') ?? '.');
const workspace = resolve(option('workspace') ?? '.');
assert(root.startsWith('/tmp/actspace-context-') && workspace.startsWith('/tmp/actspace-context-'));
const template = JSON.parse((await readFile(option('header-from'), 'utf8')).split('\n')[0]);
const id = 'context-large-legal-fixture';
const registry = createCoreCodecRegistry();
async function project(toolCount) {
  const context = {
    request: { sessionId: id, requestId: 'fixture', routeId: 'fixture', model: 'fixture', options: {} },
    content: {
      system: { sections: [{ id: 'base', owner: 'system', order: 0, content: 'Synthetic historical Context acceptance fixture' }], modelFacts: [] },
      tools: Array.from({ length: toolCount }, (_, i) => ({ name: `fixture_tool_${String(i).padStart(3, '0')}`, description: 'Synthetic bounded tool metadata', inputSchema: { type: 'object', properties: {} } })),
      supplements: [], conversation: { entries: [], replaceGeneration: 0 },
    },
    status: { throughJournalSeq: 0, cycle: 0, paths: [], facts: [], plugins: {} },
  };
  const engine = new ContextEngine({ resolve: () => context });
  const live = await engine.getContext(context.request);
  await engine.recordPrepared(live, { modelKey: 'fixture/fixture', label: 'fixture', contextWindow: 32768, autoCompactAtTokens: 26000 });
  const projection = engine.getProjection(context.request);
  return { ...projection, manifest: { ...projection.manifest, entries: projection.manifest.entries.map(({ preview, fullTextAvailable, source, ...entry }) => entry) } };
}
const small = await project(0), large = await project(620);
assert.equal(large.manifest.entries.length, 621);
const directory = join(root, 'sessions-v2', id);
await mkdir(directory, { recursive: true });
const path = join(directory, 'journal.jsonl');
const file = await open(path, 'wx', 0o600);
const epoch = Date.parse('2026-10-11T16:30:00Z');
let seq = 0;
async function append(type, data, surface = null) {
  const event = { recordKind: 'event', seq: seq++, type, eventVersion: 1, criticality: registry.get(type).criticality, time: new Date(epoch + seq * 10).toISOString(), source: { ownerPluginId: '@actspace/core' }, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null }, data, surface };
  registry.resolve(event);
  await file.write(JSON.stringify(event) + '\n');
}
try {
  await file.write(JSON.stringify(createSessionHeader({ sessionId: id, createdAt: new Date(epoch).toISOString(), cwd: workspace, lineage: null, createdWith: template.createdWith })) + '\n');
  await append('session/title-set', { title: 'Context Large Legal Fixture' });
  await append('session/workspace-set', { workspaceRoot: workspace });
  for (let i = 0; i < 600; i++) {
    const ids = { turnId: `t${i}`, stepId: `step${i}`, requestId: `r${i}`, agentRunId: `run${i}` };
    const projection = i >= 598 ? large : small;
    const model = `fixture-${i % 2}`;
    await append('turn/start', ids);
    await append('step/start', { ...ids, stepIndex: 1 });
    await append('request/header', { ...ids, model, routeId: 'fixture' });
    await append('request/context', { ...ids, snapshot: { contextManifest: projection.manifest, contextModel: { ...projection.model, modelKey: `fixture/${model}`, label: model }, logicalAgentScopeId: `main:${id}`, renderedSystemPrompt: 'Synthetic historical Context acceptance fixture', messages: [] } });
    const body = [{ type: 'text', text: `Synthetic historical fixture response ${i}; not a provider request.` }];
    const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 10, totalTokens: 120 };
    await append('assistant/message', { ...ids, messageId: `a${i}`, content: body, finishReason: 'stop', usage }, { kind: 'append', node: { kind: 'assistant', messageId: `a${i}`, content: body } });
    await append('step/end', { ...ids, reason: 'completed', usage });
    await append('turn/end', { ...ids, reason: 'completed' });
  }
  await file.sync();
} finally { await file.close(); }
const result = { scope: 'Synthetic legal Session facts; real Electron/IPC acceptance only, not real model activity', id, path, events: seq, requests: 600, entries: 621, bytes: (await stat(path)).size };
console.log(JSON.stringify(result, null, 2));
if (option('out')) await writeFile(option('out'), JSON.stringify(result, null, 2) + '\n');
