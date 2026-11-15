import { subagentKindLabel } from '@actspace/shared';
import { foldSubagentTree, type RuntimeTrajectorySnapshot, type SubagentKind } from '@actspace/shared/runtime-v2';

/**
 * 父调用到子智能体的关联。新会话来自 `subagent/spawned` + `subagent/activation`（含 `send_message` 续发的那次激活），
 * 老会话来自 `delegation/requested`。外部子智能体（codex / claude-code）没有 ActSpace 子会话，`agentId` 为 null，只显示种类和描述。
 */
export type TrajectoryDelegation = {
  parentCallId: string;
  /** 子会话 id（local / fork，老会话的 childSessionId）；外部子智能体为 null，不能打开轨迹。 */
  agentId: string | null;
  kindLabel: string;
  description: string;
  /** 这一行是 `send_message` 续发而不是创建。 */
  continuation: boolean;
};

const EXTERNAL_KINDS: readonly SubagentKind[] = ['codex', 'claude-code'];

export function trajectoryDelegations(snapshot: RuntimeTrajectorySnapshot | null): TrajectoryDelegation[] {
  const sessionId = snapshot?.sessionId;
  const tree = foldSubagentTree((snapshot?.nodes ?? []).map(node => ({ type: node.eventType, time: node.time, data: node.data })));
  const result = new Map<string, TrajectoryDelegation>();
  for (const agentId of tree.order) {
    const agent = tree.agents[agentId];
    if (agent.legacy && agent.agentId === sessionId) continue;
    const kindLabel = agent.legacy
      ? subagentKindLabel({ agentKind: agent.preset === 'explore' ? 'explore' : 'agent' })
      : subagentKindLabel({ subagentKind: agent.kind, ...(agent.preset ? { preset: agent.preset } : {}) });
    const linked = EXTERNAL_KINDS.includes(agent.kind) ? null : agent.agentId;
    // 创建那次调用 + 每次 send_message 续发的调用，都指向同一个子智能体。
    const callIds = new Set<string>([agent.callId, ...agent.activations.map(item => item.callId)]);
    for (const callId of callIds) {
      const continuation = callId !== agent.callId && agent.activations.some(item => item.callId === callId && item.trigger === 'message');
      if (!result.has(callId) || !continuation) result.set(callId, { parentCallId: callId, agentId: linked, kindLabel, description: agent.description, continuation });
    }
  }
  return [...result.values()];
}

/**
 * Fork 子智能体的轨迹只显示分出之后的部分（设计 05 §2）：去掉 seq ≤ `inheritedThroughSeq` 的复制前缀，
 * 但留下分出时还开着的那个 `turn/start`（fork 在父会话的轮次中途复制，由自己结束这一轮），更早的历史也不再分页加载。
 */
export function trajectoryAfterSeq(snapshot: RuntimeTrajectorySnapshot | null, afterSeq: number | undefined): RuntimeTrajectorySnapshot | null {
  if (!snapshot || afterSeq === undefined || afterSeq < 0) return snapshot;
  let openTurn: RuntimeTrajectorySnapshot['nodes'][number] | undefined;
  for (const node of snapshot.nodes) {
    if (node.eventSeq > afterSeq) break;
    if (node.eventType === 'turn/start') openTurn = node;
    else if (node.eventType === 'turn/end') openTurn = undefined;
  }
  const nodes = snapshot.nodes.filter(node => node.eventSeq > afterSeq || node === openTurn);
  const history = snapshot.history && snapshot.history.fromSeq <= afterSeq + 1 ? { ...snapshot.history, previousFromSeq: null } : snapshot.history;
  return { ...snapshot, nodes, ...(history ? { history } : {}) };
}
