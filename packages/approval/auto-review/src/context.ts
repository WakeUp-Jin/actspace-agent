import { surfaceNode } from "@actspace/shared/runtime-v2";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

const MAX_MESSAGE_CHARS = 64_000;
const RECENT_CALLS = 24;
/** 最近多少条 `tool/call` 的原始数据留在状态里，供审查时按 callId 找到当前调用。 */
const RECENT_TOOL_CALLS = 64;

/**
 * 审查上下文的折叠状态。每次审批都要用，所以按事件逐条折叠、只处理新增事件（perf-memory-conventions.md §2）；
 * 原始对话（压缩后也保留原文，不用摘要）累积在 `messages` 里，超过上限只打标记，由取用方报错，折叠本身不中断。
 */
export type ReviewContextState = {
  readonly messages: readonly unknown[];
  readonly calls: readonly unknown[];
  readonly approvals: ReadonlyMap<string, unknown>;
  readonly toolCalls: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly size: number;
  readonly users: number;
  readonly overflow: boolean;
};

export function createReviewContext(): ReviewContextState {
  return { messages: [], calls: [], approvals: new Map(), toolCalls: new Map(), size: 0, users: 0, overflow: false };
}

/** 纯函数：不相关的事件原样返回状态；有变化才建新对象。工作量和这一条事件有关，和会话长度无关。 */
export function reduceReviewContext(state: ReviewContextState, event: SessionEventEnvelopeV1): ReviewContextState {
  const node = event.surface?.kind === "append" ? surfaceNode(event) ?? undefined : undefined;
  if (node && (event.type === "user/message" || event.type === "assistant/message")) {
    // 超限之后审查一律报错，不必再积累原文，状态就不随会话继续增长。
    if (state.overflow) return state;
    const content = typeof node.content === "string" ? node.content : Array.isArray(node.content) ? node.content.filter(b => b && typeof b === "object" && !Array.isArray(b) && b.type === "text") : node.content;
    const message = { seq: event.seq, role: event.type === "user/message" ? "user" : "assistant", content };
    const size = state.size + JSON.stringify(message).length;
    return { ...state, messages: [...state.messages, message], size, users: state.users + (event.type === "user/message" ? 1 : 0), overflow: state.overflow || size > MAX_MESSAGE_CHARS };
  }
  if (event.type === "permission/asked") {
    const data = event.data as Record<string, unknown>;
    if (typeof data.requestId !== "string") return state;
    const approvals = new Map(state.approvals); approvals.set(data.requestId, data.callId);
    return { ...state, approvals };
  }
  if (event.type === "permission/decided") {
    const data = event.data as Record<string, unknown>;
    if (typeof data.requestId !== "string" || !state.approvals.has(data.requestId)) return state;
    const approvals = new Map(state.approvals); approvals.delete(data.requestId);
    return { ...state, approvals, calls: pushBounded(state.calls, { seq: event.seq, type: "human-tool-decision", callId: state.approvals.get(data.requestId), decision: data.kind, code: data.code }, RECENT_CALLS) };
  }
  if (event.type === "tool/call" || event.type === "tool/result") {
    const data = event.data as Record<string, unknown>;
    const calls = pushBounded(state.calls, event.type === "tool/call" ? { seq: event.seq, type: "call", callId: data.callId, name: data.name, args: data.args } : { seq: event.seq, type: "result", callId: data.callId, status: data.status }, RECENT_CALLS);
    if (event.type !== "tool/call" || typeof data.callId !== "string") return { ...state, calls };
    const toolCalls = new Map(state.toolCalls); toolCalls.delete(data.callId); toolCalls.set(data.callId, data);
    for (const oldest of toolCalls.keys()) { if (toolCalls.size <= RECENT_TOOL_CALLS) break; toolCalls.delete(oldest); }
    return { ...state, calls, toolCalls };
  }
  return state;
}

/** 交给审查模型的对话。Use original messages even after compaction. Never send raw ordinary tool output or reasoning. */
export function reviewSnapshot(state: ReviewContextState): unknown[] {
  if (state.overflow) throw new Error("Original authorization context exceeds limit");
  if (!state.users) throw new Error("Original user authorization unavailable");
  return [...state.messages, ...state.calls];
}

/** 一次性从整份事件折叠出审查对话；只在测试或低频路径上用，高频路径用 `reduceReviewContext` 增量折叠。 */
export function reviewConversation(events: Iterable<SessionEventEnvelopeV1>): unknown[] {
  let state = createReviewContext();
  for (const event of events) state = reduceReviewContext(state, event);
  return reviewSnapshot(state);
}

function pushBounded(values: readonly unknown[], value: unknown, limit: number): readonly unknown[] {
  const next = [...values, value];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
