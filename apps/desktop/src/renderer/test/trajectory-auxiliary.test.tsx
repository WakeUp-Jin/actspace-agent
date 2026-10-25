import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionJournal, createCompactionTransaction, createCoreCodecRegistry, type SessionEventCandidateV1 } from '@actspace/session-journal';
import { projectTrajectoryWindow } from '@actspace/client/sessions';
import { buildTrajectorySnapshot, deriveLayout, flattenLayout, requestBoundaries } from '../trajectory';
import { RequestBody } from '../components/trajectory/details/RequestBody';
import { TrajectoryRow, type TrajectoryRowProps } from '../components/trajectory/TrajectoryRow';

const usage = { inputTokens: 90, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0, reasoningTokens: null, cost: null, costCurrency: null, source: 'provider-reported' };
function fixture() {
  let time = Date.parse('2026-10-23T00:00:00Z');
  const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => new Date(time += 1000).toISOString() });
  const append = (type: string, data: SessionEventCandidateV1['data']) => journal.append({ type, eventVersion: 1, source: { ownerPluginId: '@actspace/core' }, data, surface: null });
  const ids = { turnId: 'turn', stepId: 'step', requestId: 'main' };
  append('turn/start', { turnId: ids.turnId });
  append('step/start', ids);
  append('request/header', { ...ids, routeId: 'main-route', model: 'main-model' });
  append('request/context', { ...ids, snapshot: { prepared: { route: 'main-route', model: 'main-model' } } });
  append('assistant/message', { ...ids, messageId: 'assistant', content: [{ type: 'tool-call', callId: 'image', name: 'inspect_image', arguments: '{}' }], finishReason: 'tool-calls', usage: { inputTokens: 100, outputTokens: 20 } });
  append('tool/call', { ...ids, callId: 'image', name: 'inspect_image' });
  const start = { sessionId: 'session', agentRunId: 'run', turnId: ids.turnId, stepId: ids.stepId, callId: 'image', logicalRequestId: 'vision', attemptId: 'vision-1', attempt: 1, purpose: 'image-inspection', routeId: 'vision-route', model: 'vision-model', startedAt: '2026-10-23T00:00:06.000Z' };
  append('llm/auxiliary-start', start);
  const project = () => {
    const runtime = buildTrajectorySnapshot(projectTrajectoryWindow('session', { events: journal.events, fromSeq: 0, throughJournalSeq: journal.lastSeq, beforeSeq: null, turnOffset: 0, requestOffset: 0 }));
    return { runtime, layout: deriveLayout(runtime) };
  };
  return { append, start, project };
}

describe('auxiliary Journal → trajectory requests', () => {
  it.each([['session-title', '标题生成'], ['auto-review', '自动审核']] as const)('shows the actual %s purpose without changing its owner', (purpose, label) => {
    const f = fixture();
    const { agentRunId, turnId, stepId, callId, ...sessionOwner } = f.start;
    const start = { ...sessionOwner, ...(purpose === 'auto-review' ? { agentRunId, turnId, stepId, callId } : {}), purpose, attemptId: purpose, logicalRequestId: purpose };
    f.append('llm/auxiliary-start', start);
    f.append('llm/auxiliary-end', { ...start, finishedAt: '2026-10-23T00:00:08Z', status: 'completed', usage });
    const { layout } = f.project();
    const request = layout.requests.get(`auxiliary:${purpose}`)!;
    expect(request).toMatchObject({ purpose, status: 'completed', model: 'vision-model', turn: purpose === 'session-title' ? null : 1 });
    render(<RequestBody layout={layout} request={request} tab="overview" onTab={() => {}} onSelectRecord={() => {}} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('links a committed compaction to its one billed request; old summaries keep their fallback view', () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
    journal.append({ type: 'user/message', eventVersion: 1, source: { ownerPluginId: '@actspace/core' }, data: { messageId: 'u', content: 'old history' }, surface: { kind: 'append', node: { messageId: 'u', kind: 'user', content: 'old history' } } });
    const start = { sessionId: 'session', purpose: 'compaction', logicalRequestId: 'compact', attemptId: 'compact-1', attempt: 1, routeId: 'utility', model: 'summary-model', startedAt: '2026-10-23T00:00:00Z' };
    for (const [type, data] of [['llm/auxiliary-start', start], ['llm/auxiliary-end', { ...start, finishedAt: '2026-10-23T00:00:02Z', status: 'completed', usage }]] as const) journal.append({ type, data, eventVersion: 1, source: { ownerPluginId: '@actspace/core' }, surface: null });
    const commit = (attemptId?: string) => journal.appendMany(createCompactionTransaction({ surface: journal.surface, start: 0, end: 1, compactionId: attemptId ?? 'legacy', contributorIds: [], summaryDigest: 'digest', summary: { messageId: attemptId ?? 'legacy', kind: 'user', content: { text: 'summary', ...(attemptId ? { metadata: { attemptId } } : {}) } } }));
    commit('compact-1');
    const project = () => deriveLayout(buildTrajectorySnapshot(projectTrajectoryWindow('session', { events: journal.events, fromSeq: 0, throughJournalSeq: journal.lastSeq, beforeSeq: null, turnOffset: 0, requestOffset: 0 })));
    const layout = project();
    expect([...layout.requests.values()]).toHaveLength(1);
    const compacted = layout.cells.find(cell => cell.kind === 'compacted')!;
    expect(compacted.requestKey).toBe('auxiliary:compact-1');
    expect(layout.requests.get(compacted.requestKey!)).toMatchObject({ purpose: 'compaction', model: 'summary-model', usage: { inputTokens: 90 }, resultRecordId: compacted.recordId });
    commit();
    expect([...project().requests.values()].filter(request => request.purpose === 'compaction')).toHaveLength(2);
  });

  it.each(['running', 'completed'] as const)('announces the actual purpose of an image request row (%s)', status => {
    const f = fixture();
    if (status === 'completed') f.append('llm/auxiliary-end', { ...f.start, finishedAt: '2026-10-23T00:00:08Z', status, usage });
    const { layout } = f.project();
    const request = [...layout.requests.values()].find(item => item.purpose === 'image-inspection')!;
    const row = flattenLayout(layout.turns).find(item => item.cell.requestKey === request.key)!;
    const props: TrajectoryRowProps = {
      row, request, position: 1, requestRun: 0, requestSelected: false, selected: false,
      turnActive: false, sectionActive: false, initialSystem: false, terminalRequestBoundary: false,
      timelineFocus: undefined, turnFoldable: false, assistantFoldable: false,
      onSelect: () => {}, onSelectRequest: () => {}, onToggleTurn: () => {}, onToggleAssistant: () => {},
    };
    const { rerender } = render(<table><tbody><TrajectoryRow {...props} /></tbody></table>);
    expect(screen.getByRole('row', { name: `请求 ${request.number}，图像识别` })).toBeTruthy();
    rerender(<table><tbody><TrajectoryRow {...props} request={{ ...request, purpose: 'compaction' }} /></tbody></table>);
    expect(screen.getByRole('row', { name: `请求 ${request.number}，压缩` })).toBeTruthy();
  });

  it('keeps the parent main request intact and exposes a separate running/completed request with actual usage and parent navigation', () => {
    const f = fixture();
    const running = f.project();
    expect([...running.layout.requests.values()].find(item => item.purpose === 'image-inspection')).toMatchObject({ provider: 'vision-route', model: 'vision-model', status: 'running', usage: null });
    f.append('llm/auxiliary-end', { ...f.start, finishedAt: '2026-10-23T00:00:08.000Z', status: 'completed', usage });
    const { layout, runtime } = f.project();
    const requests = [...layout.requests.values()];
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ purpose: 'assistant', provider: 'main-route', model: 'main-model', usage: { inputTokens: 100, outputTokens: 20 }, toolCalls: 1 });
    const auxiliary = requests[1]!;
    const parent = layout.cells.find(cell => cell.record.callId === 'image' && cell.kind === 'tool')!;
    expect(auxiliary).toMatchObject({ purpose: 'image-inspection', status: 'completed', usage: { inputTokens: 90, outputTokens: 10, cacheReadTokens: 20 }, parentRecordId: parent.recordId, startedAt: Date.parse(f.start.startedAt), completedAt: Date.parse('2026-10-23T00:00:08Z') });
    expect(runtime.records.filter(record => record.kind === 'assistant')).toHaveLength(1);
    expect(runtime.records.find(record => record.kind === 'tool')?.requestId).toBe('main');
    expect(requestBoundaries(flattenLayout(layout.turns), layout).size).toBe(2);
    render(<RequestBody layout={layout} request={auxiliary} tab="overview" onTab={() => {}} onSelectRecord={() => {}} />);
    expect(screen.getByText('图像识别')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'inspect_image' })).toBeTruthy();
  });

  it('keeps attempts distinct across failure, retry and cancellation, including reported zero and unknown usage', () => {
    const f = fixture();
    f.append('llm/auxiliary-end', { ...f.start, finishedAt: '2026-10-23T00:00:08Z', status: 'failed', usage: { ...usage, inputTokens: 12, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null } });
    const second = { ...f.start, attemptId: 'vision-2', attempt: 2, startedAt: '2026-10-23T00:00:09Z' };
    f.append('llm/auxiliary-start', second);
    f.append('llm/auxiliary-end', { ...second, finishedAt: '2026-10-23T00:00:10Z', status: 'aborted', usage: { ...usage, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } });
    f.append('llm/auxiliary-start', { ...second, attemptId: 'vision-3', attempt: 3, startedAt: '2026-10-23T00:00:11Z' });
    const auxiliary = [...f.project().layout.requests.values()].filter(item => item.purpose === 'image-inspection');
    expect(auxiliary).toHaveLength(3);
    expect(auxiliary[0]).toMatchObject({ status: 'failed', usage: { inputTokens: 12, outputTokens: null }, attempt: 1 });
    expect(auxiliary[1]).toMatchObject({ status: 'failed', usage: { inputTokens: 0, outputTokens: 0 }, attempt: 2 });
    expect(auxiliary[2]).toMatchObject({ status: 'running', usage: null, attempt: 3 });
    expect(new Set(auxiliary.map(item => item.key)).size).toBe(3);
  });
});
