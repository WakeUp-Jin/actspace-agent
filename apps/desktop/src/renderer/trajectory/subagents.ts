import type { RuntimeV2TrajectorySnapshot } from '@actspace/shared/runtime-v2';
export type TrajectoryDelegation = { parentCallId: string; childSessionId: string; presetId: string | null };
/** 父调用到子会话的关联（`delegation/requested`）。子会话的记录不进父轨迹，只用来打开子智能体自己的轨迹。 */
export function trajectoryDelegations(snapshot: RuntimeV2TrajectorySnapshot | null): TrajectoryDelegation[] {
  const result = new Map<string, TrajectoryDelegation>();
  for (const node of snapshot?.nodes ?? []) {
    if (node.eventType !== 'delegation/requested') continue;
    const data = node.data as Record<string, unknown>;
    if (typeof data.parentCallId === 'string' && typeof data.childSessionId === 'string' && data.childSessionId !== snapshot?.sessionId) {
      result.set(data.parentCallId, { parentCallId: data.parentCallId, childSessionId: data.childSessionId, presetId: typeof data.presetId === 'string' ? data.presetId : null });
    }
  }
  return [...result.values()];
}
