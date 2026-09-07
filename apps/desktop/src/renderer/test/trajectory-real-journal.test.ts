import { describe, expect, it } from 'vitest';
import { SessionJournal, createCoreCodecRegistry, type SessionEventCandidateV1 } from '@actspace/session-journal';
import { projectTrajectory, projectTrajectoryWindow } from '@actspace/session-projection';
import { buildTrajectorySnapshot } from '../trajectory';

const source = { ownerPluginId: '@actspace/core' };
function makeJournal() {
  let time = Date.parse('2026-09-06T00:00:00Z');
  const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => new Date(time += 1000).toISOString() });
  const append = (type: string, data: SessionEventCandidateV1['data'], surface: SessionEventCandidateV1['surface'] = null) => journal.append({ type, eventVersion: 1, source, data, surface, ...(type === 'agent/inbox/spliced' && surface ? { provenance: { sourceEventSeqs: [0], contributorIds: ['core/inbox'], runtimeSelectionSeq: null } } : {}) });
  return { journal, append };
}

describe('real Journal → trajectory', () => {
  it('reads surface-only users, request snapshots, typed tool definitions and actual tool output without leaking lifecycle rows', () => {
    const { journal, append } = makeJournal();
    const ids = { turnId: 'turn-1', stepId: 'step-1', requestId: 'request-1' };
    append('agent/inbox/spliced', { operation: 'enqueue', messageId: 'u', target: 'next-turn', content: '真实用户内容' });
    append('agent/inbox/spliced', { operation: 'claim', messageId: 'u', target: 'next-turn' }, { kind: 'append', node: { kind: 'user', messageId: 'u', content: [{ type: 'text', text: '真实用户内容' }] } });
    append('turn/start', { turnId: ids.turnId });
    append('step/start', ids);
    append('request/header', { ...ids, model: 'test-model', routeId: 'test-route' });
    const tool = { name: 'read_file', description: 'Read a UTF-8 file', definitionVersion: 1, definitionDigest: 'digest', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Absolute path' } }, required: ['path'] } };
    append('request/context', { ...ids, snapshot: { renderedSystemPrompt: '真实系统提示', systemSections: [], tools: [tool], requestOptions: { temperature: 0.3 }, prepared: { route: 'test-route', model: 'test-model' } } });
    append('assistant/chunk', { ...ids, messageId: 'a', chunkIndex: 0, kind: 'reasoning-delta', content: '思考' });
    const before = buildTrajectorySnapshot(projectTrajectory('session', journal.events));
    const partial = before.records.find(record => record.kind === 'assistant')!;
    expect(partial.partial).toBe(true);
    append('assistant/message', { ...ids, messageId: 'a', finishReason: 'tool-calls', content: [{ type: 'reasoning', text: '思考' }, { type: 'tool-call', callId: 'c', name: 'read_file', arguments: '{"path":"/tmp/example"}' }], usage: { outputTokens: 100 } });
    append('tool/call', { turnId: ids.turnId, stepId: ids.stepId, callId: 'c', pluginId: 'core', name: 'read_file', args: { path: '/tmp/example' } });
    const running = buildTrajectorySnapshot(projectTrajectory('session', journal.events));
    expect(running.records.find(record => record.kind === 'tool')?.state).toBe('running');
    append('tool/result', { callId: 'c', name: 'read_file', pluginId: 'core', status: 'completed', summary: '1 line read', modelOutput: [{ type: 'text', text: '实际工具输出' }], detail: [], artifacts: [] });
    append('step/end', { ...ids, status: 'completed' });
    append('turn/end', { turnId: ids.turnId, status: 'completed' });
    const snapshot = buildTrajectorySnapshot(projectTrajectory('session', journal.events));
    expect(snapshot.records.map(record => record.kind)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(snapshot.records[1]).toMatchObject({ summary: '真实用户内容', turnNumber: 1, messageSource: source });
    const assistant = snapshot.records[2]!;
    expect(assistant.id).toBe(partial.id);
    expect(assistant.assistantMetrics).toMatchObject({ ttftMs: 2000, generationMs: 1000 });
    expect(assistant.requestDetail).toMatchObject({ model: 'test-model', options: { temperature: 0.3 }, prompt: { systemPrompt: '真实系统提示' } });
    expect(snapshot.records[3]).toMatchObject({ assistantRecordId: assistant.id, requestId: ids.requestId, schemaDetail: tool, outputDetail: [{ type: 'text', text: '实际工具输出' }], durationMs: 1000 });
  });

  it('preserves failed and aborted final responses and absolute turn numbering in a window', () => {
    const { journal, append } = makeJournal();
    for (let i = 1; i <= 25; i++) {
      append('turn/start', { turnId: `t${i}` });
      append('assistant/message', { turnId: `t${i}`, messageId: `a${i}`, content: [], finishReason: i === 25 ? 'aborted' : 'failed' });
      append('turn/end', { turnId: `t${i}`, status: i === 25 ? 'aborted' : 'failed' });
    }
    const snapshot = buildTrajectorySnapshot(projectTrajectoryWindow('session', journal.events));
    expect(snapshot.turns[0]?.number).toBe(6);
    expect(snapshot.records[0]?.state).toBe('failed');
    expect(snapshot.records.at(-1)?.state).toBe('aborted');
  });
});

it('closes observed chunks when a failed provider stream finalizes with a new message id', () => {
  const { journal, append } = makeJournal();
  append('turn/start', { turnId: 't' });
  append('step/start', { turnId: 't', stepId: 'step' });
  append('request/header', { turnId: 't', stepId: 'step', requestId: 'r' });
  append('request/context', { turnId: 't', stepId: 'step', requestId: 'r', snapshot: {} });
  append('assistant/chunk', { turnId: 't', requestId: 'r', messageId: 'stream-message', chunkIndex: 0, content: 'Partial' });
  const before = buildTrajectorySnapshot(projectTrajectory('s', journal.events)).records[0]!;
  append('assistant/message', { turnId: 't', requestId: 'r', messageId: 'failure-message', content: [], finishReason: 'failed' });
  append('step/end', { turnId: 't', stepId: 'step', reason: 'failed' });
  append('turn/end', { turnId: 't', reason: 'failed' });
  const after = buildTrajectorySnapshot(projectTrajectory('s', journal.events));
  expect(after.records).toHaveLength(1);
  expect(after.records[0]).toMatchObject({ id: before.id, state: 'failed', partial: false, sourceSequences: [4, 5] });
});
