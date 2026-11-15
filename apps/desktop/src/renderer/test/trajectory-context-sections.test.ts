import { expect, it } from 'vitest';
import type { RuntimeJsonValue, RuntimeTrajectorySnapshot } from '@actspace/shared/runtime-v2';
import { buildTrajectorySnapshot, deriveLayout } from '../trajectory';
import { trajectoryDelegations } from '../trajectory/subagents';

function snapshot(events: [string, Record<string, RuntimeJsonValue>][], sessionId = 's'): RuntimeTrajectorySnapshot {
  return { kind: 'trajectory', schemaVersion: 1, sessionId, throughJournalSeq: events.length - 1, nodes: events.map(([eventType, data], eventSeq) => ({ key: `${sessionId}:${eventSeq}`, sessionId, eventSeq, eventType, data, surface: null, source: null, time: new Date(1700000000000 + eventSeq * 1000).toISOString(), kind: 'other', state: 'observed', callId: typeof data.callId === 'string' ? data.callId : null })) };
}
const base = { id: 'model-prompt', owner: 'actspace.context-system', order: 0, content: 'fixed' };
const rule = { id: 'host/workspace-instructions', owner: 'actspace.context-rules', order: 20, content: 'rule-one' };
const prompt = (id: string, sections: RuntimeJsonValue[], facts: RuntimeJsonValue[] = []): [string, Record<string, RuntimeJsonValue>] => ['request/system-prompt', { turnId: 't', stepId: id, requestId: id, digest: JSON.stringify([sections, facts]), sections, modelFacts: facts, contributorProvenance: [] }];
const context = (id: string): [string, Record<string, RuntimeJsonValue>] => ['request/context', { turnId: 't', stepId: id, requestId: id, snapshot: { schemaVersion: 3 } }];

it('projects initial, changed and removed context from adjacent prompt records without repeated unchanged rows', () => {
  const view = buildTrajectorySnapshot(snapshot([
    ['turn/start', { turnId: 't' }],
    prompt('r1', [base, rule]), context('r1'),
    context('r2'),
    context('r3'),
    prompt('r4', [base, { ...rule, content: 'rule-two' }]), context('r4'),
    prompt('r5', [base]), context('r5'),
  ]));
  expect(view.records.filter(row => row.kind === 'system').map(row => row.summary)).toEqual(['初始系统提示词']);
  const rows = view.records.filter(row => row.kind === 'context');
  expect(rows.map(row => row.contextPresentation?.action)).toEqual(['已加载', '已更新', '已移除']);
  expect(rows[1]).toMatchObject({ inputDetail: 'rule-two', contextPresentation: { category: '规则', previousText: 'rule-one', placement: 'system' }, messageSource: { projection: 'request-composition', requestId: 'r4' } });
  expect(rows[2]?.inputDetail).toBe('');
});

it('keeps skill catalog distinct from loaded skills', () => {
  const skill = { id: 'core/selected-skills', owner: 'actspace.context-skills', order: 30, content: 'loaded' };
  const catalog = { id: 'core/skills-catalog', owner: 'actspace.context-skills', order: 0, content: [{ id: 'test', name: 'Test', description: 'catalog only' }] };
  const view = buildTrajectorySnapshot(snapshot([prompt('r', [base, skill], [catalog]), context('r')]));
  expect(view.records.filter(row => row.kind === 'context').map(row => row.contextPresentation?.category)).toEqual(['已加载技能', '技能目录']);
});

it('uses a prompt record carried from before the history window only as the baseline', () => {
  const events = snapshot([prompt('r1', [base, rule]), ['turn/start', { turnId: 't' }], prompt('r2', [base, { ...rule, content: 'rule-two' }]), context('r2')]);
  const view = buildTrajectorySnapshot({ ...events, history: { fromSeq: 1, previousFromSeq: 1, turnOffset: 3 } });
  expect(view.records.filter(row => row.kind === 'context').map(row => row.contextPresentation?.action)).toEqual(['已更新']);
});

it('keeps the delegated agent call as one parent row and exposes its child session link', () => {
  const parentSnapshot = snapshot([
    ['turn/start', { turnId: 't' }], ['step/start', { turnId: 't', stepId: 'p' }],
    ['request/context', { turnId: 't', stepId: 'p', requestId: 'r', snapshot: { schemaVersion: 3 } }],
    ['tool/call', { turnId: 't', stepId: 'p', callId: 'same', name: 'agent', args: { description: 'Read storage' } }],
    ['delegation/requested', { invocationId: 'i1', parentCallId: 'same', childSessionId: 'child', presetId: 'actspace.explore' }],
    ['delegation/requested', { invocationId: 'i2', parentCallId: 'self', childSessionId: 's' }],
    ['tool/result', { callId: 'same', status: 'completed', result: 'agent completed' }],
  ]);
  expect(trajectoryDelegations(parentSnapshot)).toEqual([{ parentCallId: 'same', agentId: 'child', kindLabel: 'Explore', description: '', continuation: false }]);
  const layout = deriveLayout(buildTrajectorySnapshot(parentSnapshot));
  expect(layout.cells.filter(cell => cell.kind === 'tool' || cell.kind === 'subtool').map(cell => [cell.kind, cell.record.toolName])).toEqual([['tool', 'agent']]);
});

it('maps spawn, send_message and external subagent calls to delegation rows', () => {
  const parent = snapshot([
    ['subagent/spawned', { agentId: 'sa-1', callId: 'c1', kind: 'local', preset: 'explore', description: 'Map', transcriptPath: '/t', createdAt: '2026-01-01T00:00:00Z' }],
    ['subagent/activation', { op: 'start', agentId: 'sa-1', activationId: 'a1', trigger: 'spawn', callId: 'c1', background: false, startedAt: '2026-01-01T00:00:00Z' }],
    ['subagent/activation', { op: 'start', agentId: 'sa-1', activationId: 'a2', trigger: 'message', callId: 'c2', background: false, startedAt: '2026-01-01T00:01:00Z' }],
    ['subagent/spawned', { agentId: 'cx-1', callId: 'c3', kind: 'codex', description: 'Review', transcriptPath: '/t2', createdAt: '2026-01-01T00:02:00Z' }],
  ]);
  expect(trajectoryDelegations(parent)).toEqual([
    { parentCallId: 'c1', agentId: 'sa-1', kindLabel: '探索', description: 'Map', continuation: false },
    { parentCallId: 'c2', agentId: 'sa-1', kindLabel: '探索', description: 'Map', continuation: true },
    { parentCallId: 'c3', agentId: null, kindLabel: 'Codex', description: 'Review', continuation: false },
  ]);
});
