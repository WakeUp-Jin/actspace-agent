import type { RuntimeV2TrajectorySnapshot } from '@actspace/shared/runtime-v2';
import type { TrajectoryRecord, TrajectoryRuntimeSnapshot } from './contract';
export type TrajectoryDelegation = { parentCallId: string; childSessionId: string };
export function trajectoryDelegations(snapshot: RuntimeV2TrajectorySnapshot | null): TrajectoryDelegation[] {
  const result = new Map<string, TrajectoryDelegation>();
  for (const node of snapshot?.nodes ?? []) {
    if (node.eventType !== 'delegation/requested') continue;
    const data = node.data as Record<string, unknown>;
    if (typeof data.parentCallId === 'string' && typeof data.childSessionId === 'string' && data.childSessionId !== snapshot?.sessionId) {
      result.set(data.parentCallId, { parentCallId: data.parentCallId, childSessionId: data.childSessionId });
    }
  }
  return [...result.values()];
}
/** Child tools retain their request's Schema; child requests never become parent requests. */
export function attachSubagentTools(parent: TrajectoryRuntimeSnapshot, delegations: readonly TrajectoryDelegation[], children: ReadonlyMap<string, TrajectoryRuntimeSnapshot>): TrajectoryRuntimeSnapshot {
  const byCall = new Map(delegations.map(item => [item.parentCallId, item.childSessionId]));
  const records: TrajectoryRecord[] = [];
  for (const record of parent.records) {
    records.push(record);
    const sessionId = record.callId ? byCall.get(record.callId) : undefined;
    const child = sessionId ? children.get(sessionId) : undefined;
    if (record.kind !== 'tool' || !sessionId || !child) continue;
    const id = (call: string) => JSON.stringify([sessionId, call]);
    for (const tool of child.records.filter(item => item.kind === 'tool')) records.push({
      ...tool, id: `${record.id}:child:${tool.id}`, childSessionId: sessionId,
      callId: tool.callId ? id(tool.callId) : null,
      parentCallId: tool.parentCallId ? id(tool.parentCallId) : record.callId,
      turnId: record.turnId, turnNumber: record.turnNumber, stepId: record.stepId, stepNumber: record.stepNumber,
      requestId: null, assistantRecordId: null,
      messageSource: { kind: 'subagent-tool', sessionId, callId: tool.callId, requestId: tool.requestId, sourceEventSeqs: [...tool.sourceSequences] },
    });
  }
  return { ...parent, records, turns: parent.turns.map(turn => ({ ...turn, records: records.filter(record => record.turnId === turn.id) })) };
}
