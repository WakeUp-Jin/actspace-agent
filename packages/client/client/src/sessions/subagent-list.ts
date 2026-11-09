import { agentMessageBody, type MessageBlock, type SubagentListItem, type SubagentListStatus } from "@actspace/shared";
import { foldSubagentTree, lastActivationModel, type RuntimeV2JsonValue, type SessionEventEnvelopeV1, type SubagentView } from "@actspace/shared/runtime-v2";

/**
 * The right-side 子 Agent panel's list (design 05 §2): one row per subagent across all its activations,
 * folded from the parent Journal. `childModels` fills in the model of children whose activations recorded
 * none yet (keyed by child Session id, from `latestRequestModel`).
 */
export function projectSubagentItems(journal: readonly SessionEventEnvelopeV1[], childModels: ReadonlyMap<string, string> = new Map()): SubagentListItem[] {
  const tree = foldSubagentTree(journal);
  // Old `delegation/*` records carry no description: take it from the call that started them.
  const legacyCalls = new Set(Object.values(tree.agents).filter((view) => view.legacy).map((view) => view.callId));
  const callArgs = new Map<string, Readonly<Record<string, RuntimeV2JsonValue>>>();
  // Each subagent's latest message to this Session, timed when it was sent (the enqueue; a claim if the enqueue is not in the journal).
  const lastMessages = new Map<string, { messageId: string; text: string; at: string }>();
  for (const event of journal) {
    const data = record(event.data);
    if (event.type === "tool/call" && legacyCalls.size) {
      const callId = typeof data.callId === "string" ? data.callId : "";
      if (legacyCalls.has(callId)) callArgs.set(callId, record(data.args));
    } else if (event.type === "agent/inbox/spliced" && data.source === "agent_message" && (data.operation === "enqueue" || data.operation === "claim")) {
      const senderId = typeof data.senderId === "string" ? data.senderId : "", messageId = typeof data.messageId === "string" ? data.messageId : "";
      if (!senderId || !messageId || lastMessages.get(senderId)?.messageId === messageId) continue;
      const text = typeof data.content === "string" ? firstLine(agentMessageBody(data.content)) : undefined;
      if (text) lastMessages.set(senderId, { messageId, text, at: event.time });
    }
  }
  return tree.order.map((agentId) => {
    const message = lastMessages.get(agentId);
    const listed = item(tree.agents[agentId], childModels.get(agentId), callArgs);
    return message ? { ...listed, lastMessage: { text: message.text, at: message.at } } : listed;
  });
}

function item(view: SubagentView, requestModel: string | undefined, callArgs: ReadonlyMap<string, Readonly<Record<string, RuntimeV2JsonValue>>>): SubagentListItem {
  const first = view.activations[0], last = view.activations.at(-1);
  const settle = last?.settle;
  const model = lastActivationModel(view) ?? requestModel;
  const args = view.legacy ? callArgs.get(view.callId) : undefined;
  const legacyDescription = typeof args?.description === "string" && args.description ? args.description : typeof args?.task === "string" ? firstLine(args.task) : undefined;
  return {
    agentId: view.agentId, kind: view.kind, ...(view.preset ? { preset: view.preset } : {}), ...(view.legacy ? { legacy: true } : {}),
    description: view.description || legacyDescription || (view.preset === "explore" ? "Explore" : "Agent"),
    status: listStatus(view), activationCount: view.activations.length,
    ...(model ? { model } : {}), background: first?.background === true,
    createdAt: view.createdAt, activeSince: last?.startedAt ?? view.createdAt, ...(settle ? { endedAt: settle.endedAt } : {}),
    transcriptPath: view.transcriptPath, ...(view.inheritedThroughSeq !== undefined ? { inheritedThroughSeq: view.inheritedThroughSeq } : {}),
    ...(settle?.result ? { result: settle.result } : {}), ...(settle?.summary ? { summary: settle.summary } : {}),
  };
}

/** 运行中、空闲（可续派）、已中断、失败、已结束（外部或老会话，不能续派）. */
function listStatus(view: SubagentView): SubagentListStatus {
  // Old Sessions' delegations ran inside a runtime that no longer exists: unsettled means it never finished.
  if (view.status === "running" && !view.legacy) return "running";
  const status = view.activations.at(-1)?.settle?.status;
  if (status === "failed" || status === "max_steps") return "failed";
  if (status === "interrupted" || status === "lost" || status === undefined) return "interrupted";
  return view.legacy || view.status === "closed" ? "ended" : "idle";
}

export type SubagentCardStatus = Extract<MessageBlock, { kind: "agent" }>["status"];

/**
 * Status of each subagent in a message list, from its dispatch card (`agent` block, keyed by child id).
 * A message card shows its sender's status from here, so every card of one subagent changes together.
 * A later block for the same subagent (a continued activation re-projected live) wins.
 */
export function subagentStatusByAgent(blocks: readonly MessageBlock[]): ReadonlyMap<string, SubagentCardStatus> {
  const statuses = new Map<string, SubagentCardStatus>();
  for (const block of blocks) if (block.kind === "agent" && block.transcriptRef?.runId) statuses.set(block.transcriptRef.runId, block.status);
  return statuses;
}

function firstLine(value: string): string | undefined { return value.split(/\r?\n/).find((line) => line.trim())?.trim(); }
function record(value: RuntimeV2JsonValue | undefined): Readonly<Record<string, RuntimeV2JsonValue>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {}; }
