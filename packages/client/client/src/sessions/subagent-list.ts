import { agentMessageBody, type MessageBlock, type SubagentListItem, type SubagentListStatus } from "@actspace/shared";
import { EMPTY_SUBAGENT_TREE, lastActivationModel, reduceSubagentTree, type RuntimeV2JsonValue, type SessionEventEnvelopeV1, type SubagentTree, type SubagentView } from "@actspace/shared/runtime-v2";

type CallArgs = Readonly<Record<string, RuntimeV2JsonValue>>;
type LastMessage = { readonly messageId: string; readonly text: string; readonly at: string };

/**
 * 子 Agent 面板的折叠状态。面板每秒轮询一次，所以状态按会话常驻、只折叠新增事件（perf-memory-conventions.md §2）；
 * 除了子 Agent 树本身，还要记住：
 * - 老会话 `delegation/*` 没有描述，要从发起它的 `tool/call` 参数里拿。`tool/call` 先于 `delegation/requested`，
 *   所以最近几十条调用参数先暂存，等对应的 legacy 记录出现再留下；
 * - 每个子 Agent 发给主会话的最新一条消息（以发送时间计：enqueue；日志里没有 enqueue 时用 claim）。
 */
export type SubagentListState = {
  readonly tree: SubagentTree;
  readonly legacyCallArgs: ReadonlyMap<string, CallArgs>;
  readonly recentCallArgs: ReadonlyMap<string, CallArgs>;
  readonly lastMessages: ReadonlyMap<string, LastMessage>;
  /** 老会话 `delegation/*` 里出现过的子会话：是否已结束、主会话是否已记下它的模型。 */
  readonly delegations: ReadonlyMap<string, { readonly finished: boolean; readonly known: boolean }>;
};

const RECENT_CALL_ARGS = 64;
const EMPTY_LIST_STATE: SubagentListState = Object.freeze({ tree: EMPTY_SUBAGENT_TREE, legacyCallArgs: new Map(), recentCallArgs: new Map(), lastMessages: new Map(), delegations: new Map() });

export function createSubagentListState(): SubagentListState { return EMPTY_LIST_STATE; }

/** 纯函数：不相关的事件原样返回状态，工作量只和这一条事件有关。 */
export function reduceSubagentList(state: SubagentListState, event: Pick<SessionEventEnvelopeV1, "type" | "time" | "data">): SubagentListState {
  const data = record(event.data);
  if (event.type === "tool/call") {
    const callId = typeof data.callId === "string" ? data.callId : "";
    if (!callId) return state;
    const args = record(data.args);
    // 常规顺序是调用在前、legacy 记录在后；反过来时直接落到 legacy 参数里。
    if (legacyCallIds(state.tree).has(callId)) return { ...state, legacyCallArgs: withEntry(state.legacyCallArgs, callId, args) };
    const recentCallArgs = new Map(state.recentCallArgs); recentCallArgs.delete(callId); recentCallArgs.set(callId, args);
    for (const oldest of recentCallArgs.keys()) { if (recentCallArgs.size <= RECENT_CALL_ARGS) break; recentCallArgs.delete(oldest); }
    return { ...state, recentCallArgs };
  }
  if (event.type === "agent/inbox/spliced") {
    if (data.source !== "agent_message" || (data.operation !== "enqueue" && data.operation !== "claim")) return state;
    const senderId = typeof data.senderId === "string" ? data.senderId : "", messageId = typeof data.messageId === "string" ? data.messageId : "";
    if (!senderId || !messageId || state.lastMessages.get(senderId)?.messageId === messageId) return state;
    const text = typeof data.content === "string" ? firstLine(agentMessageBody(data.content)) : undefined;
    return text ? { ...state, lastMessages: withEntry(state.lastMessages, senderId, { messageId, text, at: event.time }) } : state;
  }
  let next = state;
  if (event.type === "delegation/requested" || event.type === "delegation/completed") {
    const childSessionId = typeof data.childSessionId === "string" ? data.childSessionId : "";
    if (childSessionId) {
      const prior = state.delegations.get(childSessionId) ?? { finished: false, known: false };
      const completed = event.type === "delegation/completed";
      next = { ...state, delegations: withEntry(state.delegations, childSessionId, { finished: prior.finished || completed, known: prior.known || (completed && typeof data.model === "string" && data.model.length > 0) }) };
    }
  }
  const tree = reduceSubagentTree(state.tree, event);
  if (tree === state.tree) return next;
  if (event.type !== "delegation/requested") return { ...next, tree };
  const callId = typeof data.parentCallId === "string" ? data.parentCallId : "";
  const args = state.recentCallArgs.get(callId);
  return args ? { ...next, tree, legacyCallArgs: withEntry(state.legacyCallArgs, callId, args) } : { ...next, tree };
}

/**
 * Child Sessions whose model the parent Journal does not know yet: the parent learns it only on
 * `delegation/completed`, so a running (or a failed/stopped without model) child needs its own request facts.
 * `finished` children cannot send another request, so their answer can be cached.
 */
export function subagentListChildrenWithoutModel(state: SubagentListState): { readonly childSessionId: string; readonly finished: boolean }[] {
  const requested = new Set<string>(), finished = new Set<string>(), known = new Set<string>();
  for (const [childSessionId, delegation] of state.delegations) {
    requested.add(childSessionId);
    if (delegation.finished) finished.add(childSessionId);
    if (delegation.known) known.add(childSessionId);
  }
  // New Sessions: the model is on each activation's start; one without a model follows the parent's request facts.
  for (const agentId of state.tree.order) {
    const view = state.tree.agents[agentId];
    // External subagents have no ActSpace Session to read a request from.
    if (view.legacy || view.kind === "codex" || view.kind === "claude-code") continue;
    requested.add(view.agentId);
    if (lastActivationModel(view)) known.add(view.agentId);
    // A settled subagent is closed and sends no more requests.
    if (view.status === "closed") finished.add(view.agentId);
  }
  return [...requested].filter((id) => !known.has(id)).map((childSessionId) => ({ childSessionId, finished: finished.has(childSessionId) }));
}

/** 面板的行：一个子 Agent一行，跨所有激活；`childModels` 补上激活里还没记模型的子会话（键是子会话 id，来自 `latestRequestModel`）。 */
export function subagentListItems(state: SubagentListState, childModels: ReadonlyMap<string, string> = new Map()): SubagentListItem[] {
  return state.tree.order.map((agentId) => {
    const message = state.lastMessages.get(agentId);
    const listed = item(state.tree.agents[agentId], childModels.get(agentId), state.legacyCallArgs);
    return message ? { ...listed, lastMessage: { text: message.text, at: message.at } } : listed;
  });
}

export function foldSubagentList(journal: Iterable<Pick<SessionEventEnvelopeV1, "type" | "time" | "data">>): SubagentListState {
  let state = createSubagentListState();
  for (const event of journal) state = reduceSubagentList(state, event);
  return state;
}

/**
 * The right-side 子 Agent panel's list (front-子Agent与后台任务规范.md §2), folded from a whole Journal.
 * 一次性整份折叠，只用于测试或低频路径；面板轮询走 `reduceSubagentList` 增量折叠。
 */
export function projectSubagentItems(journal: readonly SessionEventEnvelopeV1[], childModels: ReadonlyMap<string, string> = new Map()): SubagentListItem[] {
  return subagentListItems(foldSubagentList(journal), childModels);
}

function legacyCallIds(tree: SubagentTree): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const id of tree.order) { const view = tree.agents[id]; if (view?.legacy) ids.add(view.callId); }
  return ids;
}

function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
  const next = new Map(map); next.set(key, value); return next;
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

/** 运行中、已中断、失败、已结束；子智能体结束即关闭，不能续派。 */
function listStatus(view: SubagentView): SubagentListStatus {
  // Old Sessions' delegations ran inside a runtime that no longer exists: unsettled means it never finished.
  if (view.status === "running" && !view.legacy) return "running";
  const status = view.activations.at(-1)?.settle?.status;
  if (status === "failed" || status === "max_steps") return "failed";
  if (status === "interrupted" || status === "lost" || status === undefined) return "interrupted";
  return "ended";
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
