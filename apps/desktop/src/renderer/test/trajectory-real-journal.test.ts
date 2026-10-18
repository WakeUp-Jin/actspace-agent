import { describe, expect, it } from 'vitest';
import { SessionJournal, createCoreCodecRegistry, type SessionEventCandidateV1 } from '@actspace/session-journal';
import { projectTrajectoryWindow } from '@actspace/client/sessions';
import { buildTrajectorySnapshot } from '../trajectory';

const source = { ownerPluginId: '@actspace/core' };
function projectTrajectory(sessionId: string, events: readonly import('@actspace/shared/runtime-v2').SessionEventEnvelopeV1[]) {
  return projectTrajectoryWindow(sessionId, { events, fromSeq: 0, throughJournalSeq: events.at(-1)?.seq ?? -1, beforeSeq: null, turnOffset: 0, requestOffset: 0 });
}
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
    const snapshot = buildTrajectorySnapshot(projectTrajectoryWindow('session', { events: journal.events.slice(15), fromSeq: 15, throughJournalSeq: journal.lastSeq, beforeSeq: 15, turnOffset: 5, requestOffset: 0 }));
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

describe('real Journal history window → system rows and schemas', () => {
  const tool = (name: string) => ({ name, description: `${name} tool`, inputSchema: { type: 'object', properties: { path: { type: 'string' } } } });
  const prepared = (model: string) => ({ route: 'route', model, contextWindow: 1000 });
  /** slimHistoryWindow 收敛后的旧请求：身份字段 + 首次 / 变化时的提示词，其余只带 promptUnchanged。 */
  const bounded = (ids: Record<string, string>, model: string, prompt: Record<string, unknown> | null) =>
    ({ deferredDetail: true, ...ids, snapshot: { prepared: prepared(model), requestOptions: { model }, ...(prompt ?? { promptUnchanged: true }) } });

  it('keeps the initial system row, early tool schemas, the user turn and context time from a bounded window', () => {
    const { journal, append } = makeJournal();
    const read = tool('read_file');
    append('user/message', { messageId: 'u1', agentRunId: 'run-1' }, { kind: 'append', node: { kind: 'user', messageId: 'u1', content: [{ type: 'text', text: '读一下文件' }] } });
    append('turn/start', { turnId: 't1', agentRunId: 'run-1', mode: 'agent', modeRevision: 1 });
    const step = (stepId: string, context: Record<string, unknown>, callId: string) => {
      const ids = { turnId: 't1', stepId, requestId: `r-${stepId}` };
      append('step/start', { turnId: 't1', stepId });
      append('request/header', { ...ids, model: 'm', routeId: 'route' });
      append('request/context', { ...ids, ...context });
      append('assistant/message', { ...ids, messageId: `a-${stepId}`, finishReason: 'tool-calls', content: [{ type: 'tool-call', callId, name: 'read_file', arguments: '{"path":"/a"}' }] });
      append('tool/call', { turnId: 't1', stepId, callId, pluginId: 'core', name: 'read_file', args: { path: '/a' } });
      append('tool/result', { callId, name: 'read_file', pluginId: 'core', status: 'completed', summary: 'ok', modelOutput: [{ type: 'text', text: 'ok' }] });
      append('step/end', { turnId: 't1', stepId, status: 'completed' });
    };
    step('s1', bounded({ turnId: 't1', stepId: 's1', requestId: 'r-s1' }, 'm', { renderedSystemPrompt: '系统提示', tools: [read] }), 'c1');
    // 补充上下文是插件事件（core registry 没有它的 codec），按真实形状插在两步之间、不带 turnId / stepId。
    const supplementAt = journal.events.length;
    // 换模型只改请求选项，不算提示词变化。
    step('s2', bounded({ turnId: 't1', stepId: 's2', requestId: 'r-s2' }, 'm2', null), 'c2');
    step('s3', { snapshot: { renderedSystemPrompt: '系统提示', systemSections: ['系统提示'], tools: [read], requestOptions: { model: 'm3' }, prepared: prepared('m3') } }, 'c3');
    append('turn/end', { turnId: 't1', status: 'completed' });
    const supplement = { ...journal.events[supplementAt - 1]!, type: 'plugin/actspace.context/supplement', data: { op: 'add', id: 'runtime-state', owner: 'actspace.context-runtime', text: '当前目录 /tmp', lifetime: 'turn' }, surface: null };
    const events = [...journal.events.slice(0, supplementAt), supplement, ...journal.events.slice(supplementAt)].map((event, seq) => ({ ...event, seq }));

    const snapshot = buildTrajectorySnapshot(projectTrajectory('session', events));
    const systems = snapshot.records.filter(record => record.kind === 'system');
    expect(systems.map(record => record.summary)).toEqual(['初始系统提示词']);
    expect(systems[0]!.promptDetail).toMatchObject({ systemPrompt: '系统提示', tools: [read] });
    expect(snapshot.records.filter(record => record.kind === 'tool').map(record => record.schemaDetail)).toEqual([read, read, read]);
    expect(snapshot.records.find(record => record.kind === 'tool' && record.callId === 'c2')?.requestDetail).toMatchObject({ model: 'm2', prompt: { systemPrompt: '系统提示' } });
    expect(snapshot.records.find(record => record.kind === 'user')).toMatchObject({ summary: '读一下文件', turnId: 't1', turnNumber: 1 });
    const context = snapshot.records.find(record => record.kind === 'context')!;
    expect(context).toMatchObject({ summary: '当前目录 /tmp', startedAt: supplement.time });
    expect(context.turnNumber).toBe(1);
  });

  it('labels system rows by comparing the prompt text and the tools only', () => {
    const { journal, append } = makeJournal();
    const prompts: [string, string[], number][] = [['A', ['read'], 0], ['A', ['read', 'write'], 0], ['B', ['read', 'write'], 0], ['C', ['read'], 0], ['C', ['read'], 0.7]];
    append('turn/start', { turnId: 't1' });
    prompts.forEach(([system, names, temperature], index) => {
      const ids = { turnId: 't1', stepId: `s${index}`, requestId: `r${index}` };
      append('step/start', { turnId: 't1', stepId: ids.stepId });
      append('request/header', { ...ids, model: 'm', routeId: 'route' });
      append('request/context', { ...ids, snapshot: { renderedSystemPrompt: system, tools: names.map(tool), requestOptions: { temperature }, prepared: prepared('m') } });
      append('assistant/message', { ...ids, messageId: `a${index}`, finishReason: 'stop', content: [{ type: 'text', text: 'ok' }] });
      append('step/end', { turnId: 't1', stepId: ids.stepId, status: 'completed' });
    });
    append('turn/end', { turnId: 't1', status: 'completed' });
    const systems = buildTrajectorySnapshot(projectTrajectory('session', journal.events)).records.filter(record => record.kind === 'system');
    expect(systems.map(record => record.summary)).toEqual(['初始系统提示词', '工具已更新', '系统提示词已更新', '系统提示词和工具已更新']);
    expect(systems.map(record => record.previousPromptDetail?.systemPrompt ?? null)).toEqual([null, 'A', 'A', 'B']);
  });
});
