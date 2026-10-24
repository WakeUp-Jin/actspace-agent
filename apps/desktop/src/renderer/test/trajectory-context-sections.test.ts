import { expect, it } from 'vitest';
import type { RuntimeV2JsonValue, RuntimeV2TrajectorySnapshot } from '@actspace/shared/runtime-v2';
import { buildTrajectorySnapshot, deriveLayout } from '../trajectory';
import { trajectoryDelegations } from '../trajectory/subagents';

function snapshot(events: [string, Record<string, RuntimeV2JsonValue>][], sessionId = 's'): RuntimeV2TrajectorySnapshot {
  return { kind: 'trajectory', schemaVersion: 1, sessionId, throughJournalSeq: events.length - 1, nodes: events.map(([eventType, data], eventSeq) => ({ key: `${sessionId}:${eventSeq}`, sessionId, eventSeq, eventType, data, surface: null, source: null, time: new Date(1700000000000 + eventSeq * 1000).toISOString(), kind: 'other', state: 'observed', callId: typeof data.callId === 'string' ? data.callId : null })) };
}
const base = { id: 'model-prompt', owner: 'actspace.context-system', order: 0, content: 'fixed' };
const rule = { id: 'host/workspace-instructions', owner: 'actspace.context-rules', order: 20, content: 'rule-one' };
const request = (id: string, sections: RuntimeV2JsonValue[], facts: RuntimeV2JsonValue[] = []) => ({ turnId: 't', stepId: id, requestId: id, snapshot: { renderedSystemPrompt: sections.map(value => (value as Record<string, unknown>).content).join('\n\n'), contextSections: sections, contextModelFacts: facts, tools: [] } });

it('projects initial, changed and removed context without fake system updates or repeated unchanged rows', () => {
  const view = buildTrajectorySnapshot(snapshot([
    ['turn/start', { turnId: 't' }],
    ['request/context', request('r1', [base, rule])],
    ['request/context', request('r2', [base, rule])],
    ['request/context', { requestId: 'r3', snapshot: { promptUnchanged: true } }],
    ['request/context', request('r4', [base, { ...rule, content: 'rule-two' }])],
    ['request/context', request('r5', [base])],
  ]));
  expect(view.records.filter(row => row.kind === 'system')).toHaveLength(1);
  const rows = view.records.filter(row => row.kind === 'context');
  expect(rows.map(row => row.contextPresentation?.action)).toEqual(['已加载', '已更新', '已移除']);
  expect(rows[1]).toMatchObject({ inputDetail: 'rule-two', contextPresentation: { category: '规则', previousText: 'rule-one', placement: 'system' }, messageSource: { projection: 'request-composition', requestId: 'r4' } });
  expect(rows[2]?.inputDetail).toBe('');
});

it('keeps skill catalog distinct from loaded skills and does not infer sources for old logs', () => {
  const skill = { id: 'core/selected-skills', owner: 'actspace.context-skills', order: 30, content: 'loaded' };
  const catalog = { id: 'core/skills-catalog', owner: 'actspace.context-skills', order: 0, content: [{ id: 'test', name: 'Test', description: 'catalog only' }] };
  const view = buildTrajectorySnapshot(snapshot([['request/context', request('r', [base, skill], [catalog])]]));
  expect(view.records.filter(row => row.kind === 'context').map(row => row.contextPresentation?.category)).toEqual(['已加载技能', '技能目录']);
  const old = buildTrajectorySnapshot(snapshot([['request/context', { snapshot: { renderedSystemPrompt: '<rules>unknown</rules>', systemSections: ['unknown'], tools: [] } }]]));
  expect(old.records.map(row => row.kind)).toEqual(['system']);
});

it('keeps the delegated agent call as one parent row and exposes its child session link', () => {
  const parentSnapshot = snapshot([
    ['turn/start', { turnId: 't' }], ['step/start', { turnId: 't', stepId: 'p' }],
    ['request/context', { turnId: 't', stepId: 'p', requestId: 'r', snapshot: { renderedSystemPrompt: 'parent', tools: [] } }],
    ['tool/call', { turnId: 't', stepId: 'p', callId: 'same', name: 'agent', args: { description: 'Read storage' } }],
    ['delegation/requested', { parentCallId: 'same', childSessionId: 'child', presetId: 'explore' }],
    ['delegation/requested', { parentCallId: 'self', childSessionId: 's' }],
    ['tool/result', { callId: 'same', status: 'completed', result: 'agent completed' }],
  ]);
  expect(trajectoryDelegations(parentSnapshot)).toEqual([{ parentCallId: 'same', childSessionId: 'child', presetId: 'explore' }]);
  const layout = deriveLayout(buildTrajectorySnapshot(parentSnapshot));
  expect(layout.cells.filter(cell => cell.kind === 'tool' || cell.kind === 'subtool').map(cell => [cell.kind, cell.record.toolName])).toEqual([['tool', 'agent']]);
});
